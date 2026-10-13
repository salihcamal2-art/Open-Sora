import { Router } from 'express';
import { all, get, insert, run, update, parseJSON } from '../db.js';
import { h, HttpError } from '../auth.js';
import { serializeAppt, logActivity, notify, notifyLocationUsers, fullName, token, createContact, findContactByPhoneOrEmail } from '../services.js';
import { emit } from '../events.js';
import { WEEKDAYS } from '../defaults.js';

const r = Router();
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// ---- timezone helpers (no external deps) ----
function tzOffsetMs(tz, utcMs) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const g = (t) => Number(parts.find((p) => p.type === t).value);
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
  return asUtc - utcMs;
}
export function zonedToUtc(dateStr, timeStr, tz = 'UTC') {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let off = tzOffsetMs(tz, guess);
  let utc = guess - off;
  const off2 = tzOffsetMs(tz, utc);
  if (off2 !== off) utc = guess - off2;
  return new Date(utc);
}

export function serializeCalendar(c) {
  return { ...c, availability: parseJSON(c.availability, WEEKDAYS) };
}

/** Returns available slot start times (ISO) for a calendar on a given local date. */
export function freeSlots(cal, dateStr) {
  const loc = get('SELECT timezone FROM locations WHERE id = ?', cal.location_id);
  const tz = loc?.timezone || 'UTC';
  const avail = parseJSON(cal.availability, WEEKDAYS);
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = DAY_KEYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const ranges = avail[dow] || [];
  const dur = Number(cal.slot_duration || 30) * 60e3;
  const step = dur + Number(cal.buffer || 0) * 60e3;
  const dayStart = zonedToUtc(dateStr, '00:00', tz).toISOString();
  const dayEnd = new Date(zonedToUtc(dateStr, '00:00', tz).getTime() + 86400e3).toISOString();
  const busy = all(
    `SELECT start_at, end_at FROM appointments WHERE location_id = ? AND status != 'cancelled'
     AND (calendar_id = ? OR (is_block = 1 AND (calendar_id IS NULL OR calendar_id = ?)))
     AND start_at < ? AND end_at > ?`,
    cal.location_id, cal.id, cal.id, dayEnd, dayStart
  ).map((a) => [new Date(a.start_at).getTime(), new Date(a.end_at).getTime()]);
  const out = [];
  const nowMs = Date.now();
  for (const [from, to] of ranges) {
    const start = zonedToUtc(dateStr, from, tz).getTime();
    const end = zonedToUtc(dateStr, to, tz).getTime();
    for (let t = start; t + dur <= end; t += step) {
      if (t < nowMs) continue;
      if (busy.some(([bs, be]) => t < be && t + dur > bs)) continue;
      out.push(new Date(t).toISOString());
    }
  }
  return out;
}

export function bookAppointment(L, data, userId) {
  const cal = data.calendar_id ? get('SELECT * FROM calendars WHERE id = ? AND location_id = ?', data.calendar_id, L) : null;
  if (!data.start_at) throw new HttpError(400, 'Start time is required');
  const start = new Date(data.start_at);
  if (isNaN(start)) throw new HttpError(400, 'Invalid start time');
  const end = data.end_at ? new Date(data.end_at) : new Date(start.getTime() + (cal?.slot_duration || 30) * 60e3);
  if (end <= start) throw new HttpError(400, 'End must be after start');

  let contactId = data.contact_id || null;
  if (!contactId && data.contact && !data.is_block) {
    const existing = findContactByPhoneOrEmail(L, data.contact);
    contactId = existing ? existing.id : createContact(L, { ...data.contact, source: data.contact.source || 'calendar' }, userId).id;
  }
  if (!data.is_block && !contactId) throw new HttpError(400, 'Contact is required');

  if (!data.is_block && cal && !data.allow_overlap) {
    const clash = get(
      `SELECT id FROM appointments WHERE location_id = ? AND status != 'cancelled' AND (calendar_id = ? OR is_block = 1) AND start_at < ? AND end_at > ?`,
      L, cal.id, end.toISOString(), start.toISOString()
    );
    if (clash) throw new HttpError(409, 'This time slot is no longer available');
  }
  const contact = contactId ? get('SELECT * FROM contacts WHERE id = ?', contactId) : null;
  const id = insert('appointments', {
    location_id: L, calendar_id: cal?.id || null, contact_id: contactId,
    assigned_to: data.assigned_to || cal?.owner_id || userId || null,
    title: data.title || (data.is_block ? 'Blocked' : `${cal?.name || 'Appointment'} with ${fullName(contact)}`),
    start_at: start.toISOString(), end_at: end.toISOString(),
    status: data.is_block ? 'confirmed' : data.status || 'confirmed',
    is_block: data.is_block ? 1 : 0, notes: data.notes, location_text: data.location_text,
  });
  const appt = get('SELECT * FROM appointments WHERE id = ?', id);
  if (!data.is_block) {
    logActivity(L, contactId, userId, 'appointment', `Appointment booked for ${start.toISOString()}`);
    const msg = `${fullName(contact)} — ${start.toUTCString()}`;
    if (appt.assigned_to) notify(appt.assigned_to, L, 'appointment', 'New appointment booked', msg, `/calendars?date=${start.toISOString().slice(0, 10)}`);
    else notifyLocationUsers(L, 'appointment', 'New appointment booked', msg, '/calendars');
    emit('appointment.created', L, { appointmentId: id, contactId, calendarId: cal?.id });
  } else emit('appointment.updated', L, { appointmentId: id });
  return serializeAppt(appt);
}

// ---- calendars ----
r.get('/', h((req, res) => res.json(all('SELECT * FROM calendars WHERE location_id = ? ORDER BY id', req.locationId).map(serializeCalendar))));

r.post('/', h((req, res) => {
  const { name, description, color, slot_duration = 30, buffer = 0, availability = WEEKDAYS, owner_id } = req.body;
  if (!name) throw new HttpError(400, 'Name required');
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${token(3)}`;
  const id = insert('calendars', { location_id: req.locationId, name, description, color, slot_duration, buffer, availability, owner_id: owner_id || req.user.id, slug });
  res.json(serializeCalendar(get('SELECT * FROM calendars WHERE id = ?', id)));
}));

r.put('/:id', h((req, res) => {
  const c = get('SELECT * FROM calendars WHERE id = ? AND location_id = ?', req.params.id, req.locationId);
  if (!c) throw new HttpError(404, 'Calendar not found');
  update('calendars', c.id, req.body, ['name', 'description', 'color', 'slot_duration', 'buffer', 'availability', 'owner_id']);
  res.json(serializeCalendar(get('SELECT * FROM calendars WHERE id = ?', c.id)));
}));

r.delete('/:id', h((req, res) => {
  run('DELETE FROM calendars WHERE id = ? AND location_id = ?', req.params.id, req.locationId);
  res.json({ ok: true });
}));

r.get('/:id/slots', h((req, res) => {
  const c = get('SELECT * FROM calendars WHERE id = ? AND location_id = ?', req.params.id, req.locationId);
  if (!c) throw new HttpError(404, 'Calendar not found');
  res.json(freeSlots(c, req.query.date || new Date().toISOString().slice(0, 10)));
}));

// ---- appointments ----
r.get('/appointments/list', h((req, res) => {
  const where = ['a.location_id = ?'];
  const params = [req.locationId];
  if (req.query.from) { where.push('a.end_at >= ?'); params.push(req.query.from); }
  if (req.query.to) { where.push('a.start_at < ?'); params.push(req.query.to); }
  if (req.query.calendar_id) { where.push('(a.calendar_id = ? OR a.is_block = 1)'); params.push(req.query.calendar_id); }
  if (req.query.status) { where.push('a.status = ?'); params.push(req.query.status); }
  if (req.query.assigned_to === 'me') { where.push('a.assigned_to = ?'); params.push(req.user.id); }
  res.json(all(`SELECT a.* FROM appointments a WHERE ${where.join(' AND ')} ORDER BY a.start_at`, ...params).map(serializeAppt));
}));

r.post('/appointments', h((req, res) => res.json(bookAppointment(req.locationId, req.body, req.user.id))));

r.get('/appointments/:id', h((req, res) => {
  const a = get('SELECT * FROM appointments WHERE id = ? AND location_id = ?', req.params.id, req.locationId);
  if (!a) throw new HttpError(404, 'Appointment not found');
  res.json(serializeAppt(a));
}));

r.put('/appointments/:id', h((req, res) => {
  const a = get('SELECT * FROM appointments WHERE id = ? AND location_id = ?', req.params.id, req.locationId);
  if (!a) throw new HttpError(404, 'Appointment not found');
  const data = { ...req.body };
  if (data.start_at && !data.end_at) {
    const dur = new Date(a.end_at) - new Date(a.start_at);
    data.end_at = new Date(new Date(data.start_at).getTime() + dur).toISOString();
  }
  if (data.start_at) data.start_at = new Date(data.start_at).toISOString();
  update('appointments', a.id, data, ['title', 'start_at', 'end_at', 'status', 'notes', 'assigned_to', 'calendar_id', 'location_text']);
  const n = get('SELECT * FROM appointments WHERE id = ?', a.id);
  if (n.status !== a.status) {
    if (n.contact_id) logActivity(req.locationId, n.contact_id, req.user.id, 'appointment', `Appointment marked ${n.status}`);
    emit('appointment.status_changed', req.locationId, { appointmentId: n.id, contactId: n.contact_id, status: n.status });
  }
  if (n.start_at !== a.start_at && n.contact_id) logActivity(req.locationId, n.contact_id, req.user.id, 'appointment', `Appointment rescheduled to ${n.start_at}`);
  emit('appointment.updated', req.locationId, { appointmentId: n.id });
  res.json(serializeAppt(n));
}));

r.delete('/appointments/:id', h((req, res) => {
  run('DELETE FROM appointments WHERE id = ? AND location_id = ?', req.params.id, req.locationId);
  emit('appointment.updated', req.locationId, {});
  res.json({ ok: true });
}));

export default r;
