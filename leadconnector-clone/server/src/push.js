// Web Push notifications (works on Android Chrome, desktop browsers, and iOS 16.4+ home-screen apps).
// VAPID keys come from the environment or are generated once and stored in the database.
import { Router } from 'express';
import webpush from 'web-push';
import { db, all, get, run, insert } from './db.js';
import { h, HttpError } from './auth.js';

db.exec(`
CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);`);

function vapidKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  const stored = get("SELECT value FROM app_settings WHERE key = 'vapid'");
  if (stored) return JSON.parse(stored.value);
  const keys = webpush.generateVAPIDKeys();
  run("INSERT INTO app_settings (key, value) VALUES ('vapid', ?)", JSON.stringify(keys));
  return keys;
}

const keys = vapidKeys();
webpush.setVapidDetails(`mailto:${process.env.VAPID_EMAIL || process.env.EMAIL_FROM || 'admin@example.com'}`, keys.publicKey, keys.privateKey);

/** Sends a push to every device the user has subscribed. Never throws. */
export async function pushToUser(userId, { title, body, link }) {
  const subs = all('SELECT * FROM push_subscriptions WHERE user_id = ?', userId);
  const payload = JSON.stringify({ title, body: body ? String(body).slice(0, 200) : '', link: link || '/' });
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 });
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) run('DELETE FROM push_subscriptions WHERE id = ?', s.id); // expired
      else console.error('push error', e.statusCode || e.message);
    }
  }));
}

const r = Router();
r.get('/key', (req, res) => res.json({ publicKey: keys.publicKey }));
r.post('/subscribe', h((req, res) => {
  const { endpoint, keys: k } = req.body.subscription || {};
  if (!endpoint || !k?.p256dh || !k?.auth) throw new HttpError(400, 'Invalid subscription');
  run('DELETE FROM push_subscriptions WHERE endpoint = ?', endpoint);
  insert('push_subscriptions', { user_id: req.user.id, endpoint, p256dh: k.p256dh, auth: k.auth });
  res.json({ ok: true });
}));
r.post('/unsubscribe', h((req, res) => {
  run('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?', req.body.endpoint || '', req.user.id);
  res.json({ ok: true });
}));
r.post('/test', h(async (req, res) => {
  await pushToUser(req.user.id, { title: 'Push notifications are on ✅', body: 'You will be notified about new messages, bookings and payments.', link: '/notifications' });
  res.json({ ok: true, devices: get('SELECT count(*) n FROM push_subscriptions WHERE user_id = ?', req.user.id).n });
}));

export default r;
