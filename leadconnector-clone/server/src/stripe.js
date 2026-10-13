// Stripe Checkout integration (REST, no SDK). Enabled when STRIPE_SECRET_KEY is set.
import crypto from 'node:crypto';
import { get, parseJSON } from './db.js';
import { recordPayment } from './services.js';

const { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } = process.env;
export const stripeEnabled = () => !!STRIPE_SECRET_KEY;

const ZERO_DECIMAL = ['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'];
const THREE_DECIMAL = ['BHD', 'JOD', 'KWD', 'OMR', 'TND'];
const toMinor = (amount, cur) => {
  const c = cur.toUpperCase();
  if (ZERO_DECIMAL.includes(c)) return Math.round(amount);
  if (THREE_DECIMAL.includes(c)) return Math.round(amount * 100) * 10; // Stripe requires a multiple of 10
  return Math.round(amount * 100);
};
const fromMinor = (minor, cur) => {
  const c = cur.toUpperCase();
  if (ZERO_DECIMAL.includes(c)) return minor;
  if (THREE_DECIMAL.includes(c)) return minor / 1000;
  return minor / 100;
};

async function stripe(method, path, form) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form ? new URLSearchParams(form) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || `Stripe error ${res.status}`);
  return json;
}

/** Creates a Checkout Session for the remaining balance of an invoice. */
export async function createInvoiceCheckout(inv, publicUrl) {
  const loc = get('SELECT name, currency FROM locations WHERE id = ?', inv.location_id);
  const contact = inv.contact_id ? get('SELECT email FROM contacts WHERE id = ?', inv.contact_id) : null;
  const due = +(inv.total - inv.amount_paid).toFixed(3);
  const cur = (loc.currency || 'USD').toLowerCase();
  const form = {
    mode: 'payment',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': cur,
    'line_items[0][price_data][unit_amount]': String(toMinor(due, cur)),
    'line_items[0][price_data][product_data][name]': `${loc.name} — Invoice ${inv.number}`,
    success_url: `${publicUrl}/pay/${inv.public_token}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${publicUrl}/pay/${inv.public_token}`,
    'metadata[invoice_token]': inv.public_token,
  };
  if (contact?.email) form.customer_email = contact.email;
  const session = await stripe('POST', '/checkout/sessions', form);
  return session.url;
}

/** Records a completed Checkout Session against its invoice exactly once. Returns true when it was paid. */
export function applyCheckoutSession(session) {
  if (session.payment_status !== 'paid') return false;
  const token = session.metadata?.invoice_token;
  const inv = token ? get('SELECT * FROM invoices WHERE public_token = ?', token) : null;
  if (!inv) return false;
  const marker = `stripe:${session.id}`;
  if (get('SELECT id FROM transactions WHERE invoice_id = ? AND note = ?', inv.id, marker)) return true; // already recorded
  const loc = get('SELECT currency FROM locations WHERE id = ?', inv.location_id);
  recordPayment(inv.location_id, { invoiceId: inv.id, amount: fromMinor(session.amount_total, loc.currency || 'USD'), method: 'card', note: marker });
  return true;
}

export async function confirmCheckout(sessionId) {
  return applyCheckoutSession(await stripe('GET', `/checkout/sessions/${encodeURIComponent(sessionId)}`));
}

/** Express handler for POST /api/public/stripe/webhook (needs the raw request body). */
export function stripeWebhook(req, res) {
  const raw = req.body instanceof Buffer ? req.body.toString('utf8') : '';
  if (STRIPE_WEBHOOK_SECRET) {
    const sig = Object.fromEntries(String(req.headers['stripe-signature'] || '').split(',').map((p) => p.split('=')));
    const expected = crypto.createHmac('sha256', STRIPE_WEBHOOK_SECRET).update(`${sig.t}.${raw}`).digest('hex');
    const ok = sig.v1 && sig.v1.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig.v1), Buffer.from(expected));
    const fresh = Math.abs(Date.now() / 1000 - Number(sig.t)) < 600;
    if (!ok || !fresh) return res.status(400).json({ error: 'Invalid signature' });
  } else if (stripeEnabled()) {
    return res.status(400).json({ error: 'Set STRIPE_WEBHOOK_SECRET to accept webhooks' });
  }
  const event = parseJSON(raw, {});
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    applyCheckoutSession(event.data.object);
  }
  res.json({ received: true });
}
