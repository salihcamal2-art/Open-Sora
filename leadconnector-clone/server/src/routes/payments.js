import { Router } from 'express';
import { all, get, insert, run, update, parseJSON } from '../db.js';
import { h, HttpError } from '../auth.js';
import { recalcInvoice, recordPayment, fullName, token, sendMessage, logActivity, PUBLIC_URL } from '../services.js';

const r = Router();

// ---------- products ----------
r.get('/products', h((req, res) => res.json(all('SELECT * FROM products WHERE location_id = ? ORDER BY name', req.locationId))));
r.post('/products', h((req, res) => {
  const { name, description, price = 0, type = 'one_time' } = req.body;
  if (!name) throw new HttpError(400, 'Name required');
  const id = insert('products', { location_id: req.locationId, name, description, price: Number(price), type });
  res.json(get('SELECT * FROM products WHERE id = ?', id));
}));
r.put('/products/:id', h((req, res) => {
  update('products', Number(req.params.id), req.body, ['name', 'description', 'price', 'type']);
  res.json(get('SELECT * FROM products WHERE id = ?', req.params.id));
}));
r.delete('/products/:id', h((req, res) => {
  run('DELETE FROM products WHERE id = ? AND location_id = ?', req.params.id, req.locationId);
  res.json({ ok: true });
}));

// ---------- invoices ----------
export function serializeInvoice(inv) {
  if (!inv) return null;
  const c = inv.contact_id ? get('SELECT id, first_name, last_name, email, phone FROM contacts WHERE id = ?', inv.contact_id) : null;
  const overdue = ['sent', 'partially_paid'].includes(inv.status) && inv.due_date && inv.due_date < new Date().toISOString().slice(0, 10);
  return {
    ...inv,
    items: parseJSON(inv.items, []),
    contact: c ? { ...c, name: fullName(c) } : null,
    display_status: overdue ? 'overdue' : inv.status,
    pay_url: `${PUBLIC_URL}/pay/${inv.public_token}`,
  };
}

function nextNumber(L) {
  const n = get('SELECT count(*) n FROM invoices WHERE location_id = ?', L).n + 1;
  return `INV-${String(n).padStart(5, '0')}`;
}

r.get('/invoices', h((req, res) => {
  const where = ['location_id = ?'];
  const params = [req.locationId];
  if (req.query.status && req.query.status !== 'all') {
    if (req.query.status === 'overdue') {
      where.push("status IN ('sent','partially_paid') AND due_date < ?");
      params.push(new Date().toISOString().slice(0, 10));
    } else { where.push('status = ?'); params.push(req.query.status); }
  }
  res.json(all(`SELECT * FROM invoices WHERE ${where.join(' AND ')} ORDER BY created_at DESC`, ...params).map(serializeInvoice));
}));

r.post('/invoices', h((req, res) => {
  const b = req.body;
  if (!b.contact_id) throw new HttpError(400, 'Contact is required');
  const calc = recalcInvoice(b);
  if (!calc.items.length) throw new HttpError(400, 'Add at least one line item');
  const id = insert('invoices', {
    location_id: req.locationId, contact_id: b.contact_id, number: nextNumber(req.locationId), title: b.title || 'Invoice',
    status: 'draft', issue_date: b.issue_date || new Date().toISOString().slice(0, 10), due_date: b.due_date,
    items: calc.items, discount: Number(b.discount || 0), tax_rate: Number(b.tax_rate || 0), subtotal: calc.subtotal,
    total: calc.total, notes: b.notes, public_token: token(12),
  });
  logActivity(req.locationId, b.contact_id, req.user.id, 'invoice', `Invoice created (${calc.total})`);
  res.json(serializeInvoice(get('SELECT * FROM invoices WHERE id = ?', id)));
}));

function loadInv(req) {
  const inv = get('SELECT * FROM invoices WHERE id = ? AND location_id = ?', req.params.id, req.locationId);
  if (!inv) throw new HttpError(404, 'Invoice not found');
  return inv;
}

r.get('/invoices/:id', h((req, res) => {
  const inv = loadInv(req);
  res.json({ ...serializeInvoice(inv), transactions: all('SELECT * FROM transactions WHERE invoice_id = ? ORDER BY created_at DESC', inv.id) });
}));

r.put('/invoices/:id', h((req, res) => {
  const inv = loadInv(req);
  if (['paid', 'void'].includes(inv.status) && req.body.status === undefined) throw new HttpError(422, `Invoice is ${inv.status}`);
  const merged = { ...inv, ...req.body, items: req.body.items ?? parseJSON(inv.items, []) };
  const calc = recalcInvoice(merged);
  update('invoices', inv.id, { ...req.body, items: calc.items, subtotal: calc.subtotal, total: calc.total },
    ['title', 'contact_id', 'issue_date', 'due_date', 'items', 'discount', 'tax_rate', 'notes', 'subtotal', 'total', 'status']);
  res.json(serializeInvoice(get('SELECT * FROM invoices WHERE id = ?', inv.id)));
}));

// Send invoice by SMS and/or email ("Text2Pay")
r.post('/invoices/:id/send', h(async (req, res) => {
  const inv = serializeInvoice(loadInv(req));
  if (inv.status === 'void') throw new HttpError(422, 'Invoice is void');
  const loc = get('SELECT * FROM locations WHERE id = ?', req.locationId);
  const channels = req.body.channels || ['sms'];
  const text = `Hi ${inv.contact?.first_name || ''}, here is your invoice ${inv.number} from ${loc.name} for ${loc.currency} ${inv.total.toFixed(2)}. Pay securely here: ${inv.pay_url}`;
  const results = [];
  for (const ch of channels) {
    const m = await sendMessage(req.locationId, { contactId: inv.contact_id, userId: req.user.id, type: ch, body: text, subject: `Invoice ${inv.number} from ${loc.name}` });
    results.push({ channel: ch, status: m.status });
  }
  if (inv.status === 'draft') update('invoices', inv.id, { status: 'sent' });
  res.json({ ok: true, results, invoice: serializeInvoice(get('SELECT * FROM invoices WHERE id = ?', inv.id)) });
}));

r.post('/invoices/:id/payments', h((req, res) => {
  const inv = loadInv(req);
  const remaining = +(inv.total - inv.amount_paid).toFixed(2);
  recordPayment(req.locationId, { invoiceId: inv.id, amount: req.body.amount ?? remaining, method: req.body.method || 'cash', note: req.body.note });
  res.json(serializeInvoice(get('SELECT * FROM invoices WHERE id = ?', inv.id)));
}));

r.post('/invoices/:id/void', h((req, res) => {
  const inv = loadInv(req);
  if (inv.status === 'paid') throw new HttpError(422, 'Paid invoices cannot be voided');
  update('invoices', inv.id, { status: 'void' });
  res.json(serializeInvoice(get('SELECT * FROM invoices WHERE id = ?', inv.id)));
}));

r.delete('/invoices/:id', h((req, res) => {
  const inv = loadInv(req);
  if (inv.status !== 'draft') throw new HttpError(422, 'Only draft invoices can be deleted');
  run('DELETE FROM invoices WHERE id = ?', inv.id);
  res.json({ ok: true });
}));

// ---------- transactions & point of sale ----------
r.get('/transactions', h((req, res) => {
  res.json(all('SELECT * FROM transactions WHERE location_id = ? ORDER BY created_at DESC LIMIT 500', req.locationId).map((t) => {
    const c = t.contact_id ? get('SELECT first_name, last_name, email, phone FROM contacts WHERE id = ?', t.contact_id) : null;
    const inv = t.invoice_id ? get('SELECT number FROM invoices WHERE id = ?', t.invoice_id) : null;
    return { ...t, contact_name: c ? fullName(c) : null, invoice_number: inv?.number || null };
  }));
}));

// Point of sale: quick charge (manual card / cash) optionally tied to a contact and products
r.post('/charge', h((req, res) => {
  const { contact_id, amount, method = 'card', note, items } = req.body;
  const total = items?.length ? items.reduce((s, it) => s + Number(it.price) * Number(it.qty || 1), 0) : Number(amount);
  const t = recordPayment(req.locationId, { contactId: contact_id || null, amount: total, method, note: note || (items?.length ? items.map((i) => `${i.qty || 1}x ${i.name}`).join(', ') : 'POS sale') });
  res.json(t);
}));

r.post('/transactions/:id/refund', h((req, res) => {
  const t = get('SELECT * FROM transactions WHERE id = ? AND location_id = ?', req.params.id, req.locationId);
  if (!t) throw new HttpError(404, 'Transaction not found');
  if (t.status === 'refunded') throw new HttpError(422, 'Already refunded');
  update('transactions', t.id, { status: 'refunded' });
  if (t.invoice_id) {
    const inv = get('SELECT * FROM invoices WHERE id = ?', t.invoice_id);
    const paid = Math.max(0, +(inv.amount_paid - t.amount).toFixed(2));
    update('invoices', inv.id, { amount_paid: paid, status: paid <= 0 ? 'sent' : 'partially_paid' });
  }
  res.json(get('SELECT * FROM transactions WHERE id = ?', t.id));
}));

r.get('/summary', h((req, res) => {
  const L = req.locationId;
  const since = new Date(Date.now() - 30 * 86400e3).toISOString();
  res.json({
    revenue_30d: get("SELECT coalesce(sum(amount),0) s FROM transactions WHERE location_id = ? AND status = 'succeeded' AND created_at >= ?", L, since).s,
    outstanding: get("SELECT coalesce(sum(total - amount_paid),0) s FROM invoices WHERE location_id = ? AND status IN ('sent','partially_paid')", L).s,
    paid_invoices: get("SELECT count(*) n FROM invoices WHERE location_id = ? AND status = 'paid'", L).n,
    overdue: get("SELECT count(*) n FROM invoices WHERE location_id = ? AND status IN ('sent','partially_paid') AND due_date < ?", L, new Date().toISOString().slice(0, 10)).n,
  });
}));

export default r;
