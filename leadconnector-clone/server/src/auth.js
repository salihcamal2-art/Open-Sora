import jwt from 'jsonwebtoken';
import { get } from './db.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

export function signToken(user) {
  return jwt.sign({ uid: user.id }, JWT_SECRET, { expiresIn: '30d' });
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Authenticates the request and resolves the active location (sub-account).
 * The client sends the active location in the `X-Location-Id` header
 * (or `?locationId=` for EventSource which cannot set headers).
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
  const user = get('SELECT id, name, email, phone, color, prefs, dnd FROM users WHERE id = ?', payload.uid);
  if (!user) return res.status(401).json({ error: 'User not found' });
  req.user = user;

  const wanted = Number(req.headers['x-location-id'] || req.query.locationId) || null;
  let membership = wanted
    ? get('SELECT location_id, role FROM user_locations WHERE user_id = ? AND location_id = ?', user.id, wanted)
    : null;
  if (!membership) {
    membership = get('SELECT location_id, role FROM user_locations WHERE user_id = ? ORDER BY location_id LIMIT 1', user.id);
  }
  req.locationId = membership?.location_id ?? null;
  req.role = membership?.role ?? null;
  next();
}

export function requireLocation(req, res, next) {
  if (!req.locationId) return res.status(400).json({ error: 'No location (sub-account) selected' });
  next();
}

export function requireAdmin(req, res, next) {
  if (req.role !== 'admin') return res.status(403).json({ error: 'Admin permission required' });
  next();
}

// Wrap async/sync handlers so thrown errors become JSON responses.
export const h = (fn) => (req, res, next) => {
  try {
    const r = fn(req, res, next);
    if (r && typeof r.then === 'function') r.catch(next);
  } catch (e) {
    next(e);
  }
};
