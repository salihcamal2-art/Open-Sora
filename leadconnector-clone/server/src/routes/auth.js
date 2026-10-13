import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { all, get, insert, update, run, parseJSON, tx } from '../db.js';
import { signToken, requireAuth, requireLocation, requireAdmin, h, HttpError } from '../auth.js';
import { createLocationDefaults } from '../defaults.js';

const r = Router();
const COLORS = ['#155EEF', '#7A5AF8', '#EE46BC', '#F79009', '#12B76A', '#06AED4', '#F04438'];

function publicUser(u, extra = {}) {
  return { id: u.id, name: u.name, email: u.email, phone: u.phone, color: u.color, dnd: !!u.dnd, prefs: parseJSON(u.prefs, {}), ...extra };
}

r.post('/register', h((req, res) => {
  const { name, email, password, businessName, phone } = req.body;
  if (!name || !email || !password) throw new HttpError(400, 'Name, email and password are required');
  if (password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
  if (get('SELECT id FROM users WHERE lower(email) = lower(?)', email)) throw new HttpError(409, 'Email already registered');
  const user = tx(() => {
    const uid = insert('users', {
      name, email: email.toLowerCase(), phone, password_hash: bcrypt.hashSync(password, 10),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    });
    const lid = insert('locations', { name: businessName || `${name}'s Business`, email, phone });
    insert('user_locations', { user_id: uid, location_id: lid, role: 'admin' });
    createLocationDefaults(lid, uid);
    return get('SELECT * FROM users WHERE id = ?', uid);
  });
  res.json({ token: signToken(user), user: publicUser(user) });
}));

r.post('/login', h((req, res) => {
  const { email, password } = req.body;
  const user = get('SELECT * FROM users WHERE lower(email) = lower(?)', email || '');
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) throw new HttpError(401, 'Invalid email or password');
  res.json({ token: signToken(user), user: publicUser(user) });
}));

r.get('/me', requireAuth, h((req, res) => {
  const locations = all(
    'SELECT l.id, l.name, ul.role FROM locations l JOIN user_locations ul ON ul.location_id = l.id WHERE ul.user_id = ? ORDER BY l.name',
    req.user.id
  );
  res.json({ user: publicUser(req.user, { role: req.role }), locations, locationId: req.locationId });
}));

r.put('/me', requireAuth, h((req, res) => {
  const { name, phone, color, prefs, dnd, email } = req.body;
  if (email && get('SELECT id FROM users WHERE lower(email) = lower(?) AND id != ?', email, req.user.id)) {
    throw new HttpError(409, 'Email already in use');
  }
  const merged = prefs ? { ...parseJSON(req.user.prefs, {}), ...prefs } : undefined;
  update('users', req.user.id, { name, phone, color, email: email?.toLowerCase(), prefs: merged, dnd });
  res.json({ user: publicUser(get('SELECT * FROM users WHERE id = ?', req.user.id)) });
}));

r.put('/me/password', requireAuth, h((req, res) => {
  const { current, next } = req.body;
  const u = get('SELECT * FROM users WHERE id = ?', req.user.id);
  if (!bcrypt.compareSync(current || '', u.password_hash)) throw new HttpError(400, 'Current password is incorrect');
  if (!next || next.length < 6) throw new HttpError(400, 'New password must be at least 6 characters');
  update('users', u.id, { password_hash: bcrypt.hashSync(next, 10) });
  res.json({ ok: true });
}));

// ----- locations (sub-accounts) -----
r.post('/locations', requireAuth, h((req, res) => {
  const { name, email, phone, address, timezone, currency } = req.body;
  if (!name) throw new HttpError(400, 'Name is required');
  const lid = tx(() => {
    const id = insert('locations', { name, email, phone, address, timezone, currency });
    insert('user_locations', { user_id: req.user.id, location_id: id, role: 'admin' });
    createLocationDefaults(id, req.user.id);
    return id;
  });
  res.json(get('SELECT * FROM locations WHERE id = ?', lid));
}));

r.get('/location', requireAuth, requireLocation, h((req, res) => {
  const l = get('SELECT * FROM locations WHERE id = ?', req.locationId);
  res.json({ ...l, settings: parseJSON(l.settings, {}) });
}));

r.put('/location', requireAuth, requireLocation, requireAdmin, h((req, res) => {
  const allowed = ['name', 'email', 'phone', 'address', 'website', 'timezone', 'currency', 'review_link', 'settings'];
  update('locations', req.locationId, req.body, allowed);
  const l = get('SELECT * FROM locations WHERE id = ?', req.locationId);
  res.json({ ...l, settings: parseJSON(l.settings, {}) });
}));

r.post('/location/api-key', requireAuth, requireLocation, requireAdmin, h((req, res) => {
  const l = get('SELECT settings FROM locations WHERE id = ?', req.locationId);
  const settings = { ...parseJSON(l.settings, {}), api_key: crypto.randomBytes(18).toString('hex') };
  update('locations', req.locationId, { settings });
  res.json({ api_key: settings.api_key });
}));

// ----- team -----
r.get('/team', requireAuth, requireLocation, h((req, res) => {
  res.json(all(
    'SELECT u.id, u.name, u.email, u.phone, u.color, u.dnd, ul.role FROM users u JOIN user_locations ul ON ul.user_id = u.id WHERE ul.location_id = ? ORDER BY u.name',
    req.locationId
  ));
}));

r.post('/team', requireAuth, requireLocation, requireAdmin, h((req, res) => {
  const { name, email, password, role = 'user', phone } = req.body;
  if (!email) throw new HttpError(400, 'Email is required');
  let u = get('SELECT * FROM users WHERE lower(email) = lower(?)', email);
  if (!u) {
    if (!name || !password) throw new HttpError(400, 'Name and password are required for a new user');
    const id = insert('users', { name, email: email.toLowerCase(), phone, password_hash: bcrypt.hashSync(password, 10), color: COLORS[Math.floor(Math.random() * COLORS.length)] });
    u = get('SELECT * FROM users WHERE id = ?', id);
  }
  run('INSERT OR REPLACE INTO user_locations (user_id, location_id, role) VALUES (?, ?, ?)', u.id, req.locationId, role === 'admin' ? 'admin' : 'user');
  res.json({ id: u.id, name: u.name, email: u.email, role });
}));

r.put('/team/:id', requireAuth, requireLocation, requireAdmin, h((req, res) => {
  run('UPDATE user_locations SET role = ? WHERE user_id = ? AND location_id = ?', req.body.role === 'admin' ? 'admin' : 'user', req.params.id, req.locationId);
  res.json({ ok: true });
}));

r.delete('/team/:id', requireAuth, requireLocation, requireAdmin, h((req, res) => {
  if (Number(req.params.id) === req.user.id) throw new HttpError(400, 'You cannot remove yourself');
  run('DELETE FROM user_locations WHERE user_id = ? AND location_id = ?', req.params.id, req.locationId);
  res.json({ ok: true });
}));

export default r;
