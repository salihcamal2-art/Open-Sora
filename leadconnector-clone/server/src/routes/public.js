// Unauthenticated endpoints: booking widget, invoice payment page, review funnel,
// live chat widget, lead capture forms and inbound provider webhooks.
import { Router } from 'express';
import express from 'express';
import { all, get, insert, update, parseJSON } from '../db.js';
import { h, HttpError } from '../auth.js';
import { freeSlots, bookAppointment, serializeCalendar } from './calendars.js';
import { serializeInvoice } from './payments.js';
import {
  recordPayment, receiveInbound, createContact, findContactByPhoneOrEmail, addTags, notifyLocationUsers,
  token, serializeMessage, normalizePhone, updateContact,
} from '../services.js';
import { emit } from '../events.js';
import { stripeEnabled, createInvoiceCheckout, confirmCheckout } from '../stripe.js';
import { PUBLIC_URL } from '../services.js';

const r = Router();

// ---------- app config (branding) ----------
r.get('/config', (req, res) => res.json({ appName: process.env.APP_NAME || 'LeadConnector' }));

// ---------- booking ----------
function loadCal(slug) {
  const c = get('SELECT * FROM calendars WHERE slug = ?', slug);
  if (!c) throw new HttpError(404, 'Calendar not found');
  return c;
}
r.get('/calendars/:slug', h((req, res) => {
  const c = loadCal(req.params.slug);
  const loc = get('SELECT name, timezone, phone, email, address FROM locations WHERE id = ?', c.location_id);
  const cal = serializeCalendar(c);
  res.json({ id: cal.id, name: cal.name, description: cal.description, color: cal.color, slot_duration: cal.slot_duration, availability: cal.availability, location: loc });
}));
r.get('/calendars/:slug/slots', h((req, res) => res.json(freeSlots(loadCal(req.params.slug), req.query.date || new Date().toISOString().slice(0, 10)))));
r.post('/calendars/:slug/book', h((req, res) => {
  const c = loadCal(req.params.slug);
  const { start_at, first_name, last_name, email, phone, notes } = req.body;
  if (!first_name || (!email && !phone)) throw new HttpError(400, 'Name and email or phone are required');
  const start = new Date(start_at);
  if (isNaN(start)) throw new HttpError(400, 'Invalid time');
  const tz = get('SELECT timezone FROM locations WHERE id = ?', c.location_id)?.timezone || 'UTC';
  const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(start);
  if (!freeSlots(c, localDate).includes(start.toISOString())) throw new HttpError(409, 'This time slot is no longer available');
  const appt = bookAppointment(c.location_id, {
    calendar_id: c.id, start_at, notes,
    contact: { first_name, last_name, email, phone, source: 'booking widget' },
  }, null);
  res.json({ ok: true, appointment: { id: appt.id, start_at: appt.start_at, end_at: appt.end_at } });
}));

// ---------- invoice payment ----------
r.get('/invoices/:token', h((req, res) => {
  const inv = get('SELECT * FROM invoices WHERE public_token = ?', req.params.token);
  if (!inv || inv.status === 'draft') throw new HttpError(404, 'Invoice not found');
  const loc = get('SELECT name, email, phone, address, currency FROM locations WHERE id = ?', inv.location_id);
  const s = serializeInvoice(inv);
  res.json({ ...s, location: loc, public_token: undefined, stripe: stripeEnabled() });
}));
// Real card payments: redirect to Stripe Checkout, then confirm on return (and via webhook)
r.post('/invoices/:token/checkout', h(async (req, res) => {
  const inv = get('SELECT * FROM invoices WHERE public_token = ?', req.params.token);
  if (!inv || ['draft', 'void', 'paid'].includes(inv.status)) throw new HttpError(422, 'This invoice cannot be paid');
  if (!stripeEnabled()) throw new HttpError(503, 'Online card payments are not configured');
  res.json({ url: await createInvoiceCheckout(inv, PUBLIC_URL) });
}));
r.post('/invoices/:token/confirm', h(async (req, res) => {
  const inv = get('SELECT * FROM invoices WHERE public_token = ?', req.params.token);
  if (!inv) throw new HttpError(404, 'Invoice not found');
  const paid = req.body.session_id && stripeEnabled() ? await confirmCheckout(req.body.session_id) : false;
  res.json({ paid, invoice: serializeInvoice(get('SELECT * FROM invoices WHERE id = ?', inv.id)) });
}));

r.post('/invoices/:token/pay', h((req, res) => {
  const inv = get('SELECT * FROM invoices WHERE public_token = ?', req.params.token);
  if (!inv || inv.status === 'draft') throw new HttpError(404, 'Invoice not found');
  if (inv.status === 'paid') throw new HttpError(422, 'Invoice already paid');
  if (inv.status === 'void') throw new HttpError(422, 'Invoice is void');
  if (stripeEnabled()) throw new HttpError(400, 'Use secure checkout to pay this invoice');
  const { card_number = '' } = req.body;
  // Payment gateway hook: plug Stripe / PayPal / Authorize.net here. Without a gateway the
  // payment is simulated; card "4000000000000002" simulates a decline for testing.
  if (card_number.replace(/\s/g, '') === '4000000000000002') throw new HttpError(402, 'Your card was declined');
  const remaining = +(inv.total - inv.amount_paid).toFixed(2);
  recordPayment(inv.location_id, { invoiceId: inv.id, amount: remaining, method: 'card', note: 'Paid online' });
  res.json(serializeInvoice(get('SELECT * FROM invoices WHERE id = ?', inv.id)));
}));

// ---------- review funnel ----------
r.get('/reviews/:token', h((req, res) => {
  const rr = get('SELECT * FROM review_requests WHERE token = ?', req.params.token);
  if (!rr) throw new HttpError(404, 'Link not found');
  const loc = get('SELECT name, review_link FROM locations WHERE id = ?', rr.location_id);
  res.json({ location: loc.name, review_link: loc.review_link, status: rr.status });
}));
r.post('/reviews/:token', h((req, res) => {
  const rr = get('SELECT * FROM review_requests WHERE token = ?', req.params.token);
  if (!rr) throw new HttpError(404, 'Link not found');
  const rating = Number(req.body.rating);
  if (!(rating >= 1 && rating <= 5)) throw new HttpError(400, 'Rating required');
  const c = rr.contact_id ? get('SELECT first_name, last_name FROM contacts WHERE id = ?', rr.contact_id) : null;
  const id = insert('reviews', {
    location_id: rr.location_id, contact_id: rr.contact_id, platform: 'internal', rating,
    reviewer_name: c ? [c.first_name, c.last_name].filter(Boolean).join(' ') : 'Customer', body: req.body.body,
  });
  update('review_requests', rr.id, { status: 'completed' });
  notifyLocationUsers(rr.location_id, 'review', `New ${rating}★ review`, req.body.body || '', '/reviews');
  emit('review.created', rr.location_id, { reviewId: id, contactId: rr.contact_id, rating });
  const loc = get('SELECT review_link FROM locations WHERE id = ?', rr.location_id);
  // happy customers are sent on to the public review site (Google, Facebook...)
  res.json({ ok: true, redirect: rating >= 4 ? loc.review_link || null : null });
}));

// ---------- live chat widget ----------
r.get('/chat/:locationId', h((req, res) => {
  const loc = get('SELECT id, name FROM locations WHERE id = ?', req.params.locationId);
  if (!loc) throw new HttpError(404, 'Not found');
  res.json(loc);
}));
r.post('/chat/:locationId', h((req, res) => {
  const L = Number(req.params.locationId);
  if (!get('SELECT id FROM locations WHERE id = ?', L)) throw new HttpError(404, 'Not found');
  const { visitor, name, email, phone, message } = req.body;
  if (!message?.trim()) throw new HttpError(400, 'Message required');
  let contact = null;
  if (visitor) contact = all('SELECT * FROM contacts WHERE location_id = ?', L).find((c) => parseJSON(c.custom, {})._chat === visitor);
  if (!contact) {
    if (!name || (!email && !phone)) throw new HttpError(400, 'Name and email or phone are required');
    contact = findContactByPhoneOrEmail(L, { phone, email });
    if (!contact) {
      const [first_name, ...rest] = name.split(' ');
      contact = createContact(L, { first_name, last_name: rest.join(' '), email, phone, source: 'live chat' });
    }
  }
  const v = parseJSON(contact.custom, {})._chat || token(12);
  if (!parseJSON(contact.custom, {})._chat) update('contacts', contact.id, { custom: { ...parseJSON(contact.custom, {}), _chat: v } });
  receiveInbound(L, { contactId: contact.id, type: 'live_chat', body: message });
  res.json({ visitor: v });
}));
r.get('/chat/:locationId/:visitor', h((req, res) => {
  const L = Number(req.params.locationId);
  const contact = all('SELECT * FROM contacts WHERE location_id = ?', L).find((c) => parseJSON(c.custom, {})._chat === req.params.visitor);
  if (!contact) throw new HttpError(404, 'Chat not found');
  res.json(all("SELECT id, direction, body, created_at FROM messages WHERE contact_id = ? AND type = 'live_chat' ORDER BY id", contact.id).map(serializeMessage));
}));

// ---------- API-key protected lead capture & inbound ----------
function checkKey(req) {
  const L = Number(req.params.locationId);
  const loc = get('SELECT * FROM locations WHERE id = ?', L);
  if (!loc) throw new HttpError(404, 'Location not found');
  const key = parseJSON(loc.settings, {}).api_key;
  if (!key || (req.headers['x-api-key'] || req.query.key) !== key) throw new HttpError(401, 'Invalid API key');
  return L;
}

// Website forms / landing pages / Zapier -> create or update a lead
r.post('/leads/:locationId', h((req, res) => {
  const L = checkKey(req);
  const { tags, message, ...data } = req.body;
  let c = findContactByPhoneOrEmail(L, data);
  if (c) c = updateContact(L, c.id, Object.fromEntries(Object.entries(data).filter(([, v]) => v)));
  else c = createContact(L, { ...data, source: data.source || 'form' });
  if (tags) addTags(L, c.id, Array.isArray(tags) ? tags : String(tags).split(','));
  if (message) receiveInbound(L, { contactId: c.id, type: data.channel || 'live_chat', body: message });
  emit('form.submitted', L, { contactId: c.id });
  res.json({ ok: true, contact_id: c.id });
}));

// Generic inbound message (any channel) — for connecting other providers
r.post('/inbound/:locationId', h((req, res) => {
  const L = checkKey(req);
  res.json(receiveInbound(L, req.body));
}));

// Twilio SMS / WhatsApp webhook (configure: POST https://your-domain/api/public/twilio)
r.post('/twilio', express.urlencoded({ extended: false }), h((req, res) => {
  const { From = '', To = '', Body = '', NumMedia } = req.body;
  const isWa = From.startsWith('whatsapp:');
  const to = normalizePhone(To.replace('whatsapp:', ''));
  const loc = all('SELECT id, phone FROM locations').find((l) => normalizePhone(l.phone)?.replace(/\D/g, '').endsWith(to?.replace(/\D/g, '').slice(-9)))
    || get('SELECT id FROM locations ORDER BY id LIMIT 1');
  const attachments = [];
  for (let i = 0; i < Number(NumMedia || 0); i++) if (req.body[`MediaUrl${i}`]) attachments.push({ url: req.body[`MediaUrl${i}`], type: req.body[`MediaContentType${i}`] });
  receiveInbound(loc.id, { phone: From.replace('whatsapp:', ''), type: isWa ? 'whatsapp' : 'sms', body: Body, attachments });
  res.type('text/xml').send('<Response></Response>');
}));

export default r;
