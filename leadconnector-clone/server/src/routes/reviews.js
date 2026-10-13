import { Router } from 'express';
import { all, get, insert, update } from '../db.js';
import { h, HttpError } from '../auth.js';
import { sendMessage, token, logActivity, fullName, PUBLIC_URL } from '../services.js';
import { emit } from '../events.js';

const r = Router();

r.get('/', h((req, res) => {
  const where = ['location_id = ?'];
  const params = [req.locationId];
  if (req.query.platform) { where.push('platform = ?'); params.push(req.query.platform); }
  if (req.query.rating) { where.push('rating = ?'); params.push(Number(req.query.rating)); }
  if (req.query.replied === 'false') where.push('reply IS NULL');
  res.json(all(`SELECT * FROM reviews WHERE ${where.join(' AND ')} ORDER BY created_at DESC`, ...params));
}));

r.get('/stats', h((req, res) => {
  const L = req.locationId;
  const s = get('SELECT count(*) total, coalesce(avg(rating),0) avg FROM reviews WHERE location_id = ?', L);
  const dist = Object.fromEntries([1, 2, 3, 4, 5].map((n) => [n, get('SELECT count(*) n FROM reviews WHERE location_id = ? AND rating = ?', L, n).n]));
  const req30 = get("SELECT count(*) n FROM review_requests WHERE location_id = ? AND created_at >= ?", L, new Date(Date.now() - 30 * 86400e3).toISOString()).n;
  const unreplied = get('SELECT count(*) n FROM reviews WHERE location_id = ? AND reply IS NULL', L).n;
  res.json({ total: s.total, average: +Number(s.avg).toFixed(2), distribution: dist, requests_30d: req30, unreplied });
}));

r.post('/:id/reply', h((req, res) => {
  const rv = get('SELECT * FROM reviews WHERE id = ? AND location_id = ?', req.params.id, req.locationId);
  if (!rv) throw new HttpError(404, 'Review not found');
  update('reviews', rv.id, { reply: req.body.reply || null, replied_at: req.body.reply ? new Date().toISOString() : null });
  res.json(get('SELECT * FROM reviews WHERE id = ?', rv.id));
}));

// Send a review request to a contact via SMS or email
r.post('/requests', h(async (req, res) => {
  const { contact_id, channel = 'sms' } = req.body;
  const c = get('SELECT * FROM contacts WHERE id = ? AND location_id = ?', contact_id, req.locationId);
  if (!c) throw new HttpError(404, 'Contact not found');
  const loc = get('SELECT * FROM locations WHERE id = ?', req.locationId);
  const t = token(10);
  const link = `${PUBLIC_URL}/review/${t}`;
  const body = req.body.message
    ? req.body.message.replace('{{review_link}}', link)
    : `Hi ${c.first_name || 'there'}, thank you for choosing ${loc.name}! We'd love your feedback — it only takes a moment: ${link}`;
  const m = await sendMessage(req.locationId, { contactId: c.id, userId: req.user.id, type: channel, body, subject: `How did we do, ${c.first_name || ''}?` });
  insert('review_requests', { location_id: req.locationId, contact_id: c.id, channel, token: t, status: m.status === 'failed' ? 'failed' : 'sent' });
  logActivity(req.locationId, c.id, req.user.id, 'review_request', `Review request sent via ${channel}`);
  res.json({ ok: m.status !== 'failed', link, status: m.status });
}));

r.get('/requests', h((req, res) => {
  res.json(all('SELECT * FROM review_requests WHERE location_id = ? ORDER BY created_at DESC LIMIT 200', req.locationId).map((rr) => {
    const c = get('SELECT first_name, last_name, email, phone FROM contacts WHERE id = ?', rr.contact_id);
    return { ...rr, contact_name: c ? fullName(c) : null };
  }));
}));

// Manually add a review (e.g. imported from another platform)
r.post('/', h((req, res) => {
  const { reviewer_name, rating, body, platform = 'google', contact_id } = req.body;
  if (!(rating >= 1 && rating <= 5)) throw new HttpError(400, 'Rating 1-5 required');
  const id = insert('reviews', { location_id: req.locationId, reviewer_name, rating, body, platform, contact_id });
  emit('review.created', req.locationId, { reviewId: id, contactId: contact_id, rating });
  res.json(get('SELECT * FROM reviews WHERE id = ?', id));
}));

export default r;
