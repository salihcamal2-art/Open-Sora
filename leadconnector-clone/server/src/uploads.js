// File uploads (images, documents, voice notes) stored on disk under DATA_DIR/uploads
// and served publicly at /uploads/<file> so SMS/WhatsApp providers can fetch media.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Router } from 'express';
import { DATA_DIR } from './db.js';
import { h, HttpError } from './auth.js';

export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = /^(image\/|audio\/|video\/|application\/pdf|text\/plain|application\/(msword|vnd\.openxmlformats|vnd\.ms-excel|zip))/;

/** Absolute path on disk for an uploaded file URL ("/uploads/abc.png"), or null. */
export function uploadPath(url) {
  const m = /\/uploads\/([\w.-]+)$/.exec(url || '');
  if (!m) return null;
  const p = path.join(UPLOAD_DIR, m[1]);
  return fs.existsSync(p) ? p : null;
}

const r = Router();

// POST /api/uploads { name, type, data: base64 }
r.post('/', h((req, res) => {
  const { name = 'file', type = 'application/octet-stream', data } = req.body;
  if (!data) throw new HttpError(400, 'No file data');
  if (!ALLOWED.test(type)) throw new HttpError(415, `File type ${type} is not allowed`);
  const buf = Buffer.from(String(data).replace(/^data:[^,]+,/, ''), 'base64');
  if (!buf.length) throw new HttpError(400, 'Empty file');
  if (buf.length > MAX_BYTES) throw new HttpError(413, 'File is larger than 10 MB');
  const ext = (path.extname(name) || `.${type.split('/')[1]?.split(';')[0] || 'bin'}`).toLowerCase().replace(/[^.\w]/g, '');
  const file = `${crypto.randomBytes(12).toString('hex')}${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, file), buf);
  res.json({ url: `/uploads/${file}`, name: String(name).slice(0, 120), type, size: buf.length });
}));

export default r;
