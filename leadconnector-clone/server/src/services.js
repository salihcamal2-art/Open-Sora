// Shared domain logic used by routes, the workflow engine, webhooks and the scheduler.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { uploadPath } from './uploads.js';
import { pushToUser } from './push.js';
import { all, get, run, insert, update, parseJSON, now } from './db.js';
import { emit } from './events.js';
import { sendSms, sendEmail, sendWhatsApp, sendSocial } from './providers.js';
import { HttpError } from './auth.js';

export const CHANNELS = ['sms', 'email', 'whatsapp', 'facebook', 'instagram', 'gmb', 'live_chat', 'call'];
export const token = (n = 16) => crypto.randomBytes(n).toString('hex');

// ---------------- contacts ----------------
export const fullName = (c) =>
  [c?.first_name, c?.last_name].filter(Boolean).join(' ') || c?.email || c?.phone || 'Unknown';

export function contactTags(contactId) {
  return all(
    'SELECT t.name FROM tags t JOIN contact_tags ct ON ct.tag_id = t.id WHERE ct.contact_id = ? ORDER BY t.name',
    contactId
  ).map((r) => r.name);
}

export function serializeContact(c) {
  if (!c) return null;
  return {
    ...c,
    name: fullName(c),
    dnd: parseJSON(c.dnd, {}),
    custom: parseJSON(c.custom, {}),
    dnd_all: !!c.dnd_all,
    tags: contactTags(c.id),
  };
}

export function getContact(locationId, id) {
  const c = get('SELECT * FROM contacts WHERE id = ? AND location_id = ?', id, locationId);
  if (!c) throw new HttpError(404, 'Contact not found');
  return c;
}

export function normalizePhone(p) {
  if (!p) return p;
  const s = String(p).trim();
  const plus = s.startsWith('+');
  const digits = s.replace(/\D/g, '');
  return digits ? (plus ? '+' : '') + digits : null;
}

export function findContactByPhoneOrEmail(locationId, { phone, email }) {
  const p = normalizePhone(phone);
  if (p) {
    const last = p.replace(/\D/g, '').slice(-9);
    const rows = all('SELECT * FROM contacts WHERE location_id = ? AND phone IS NOT NULL', locationId);
    const hit = rows.find((r) => (r.phone || '').replace(/\D/g, '').endsWith(last));
    if (hit) return hit;
  }
  if (email) {
    const hit = get('SELECT * FROM contacts WHERE location_id = ? AND lower(email) = lower(?)', locationId, email);
    if (hit) return hit;
  }
  return null;
}

export function ensureTag(locationId, name) {
  name = String(name).trim().toLowerCase();
  if (!name) return null;
  const t = get('SELECT id FROM tags WHERE location_id = ? AND name = ?', locationId, name);
  return t ? t.id : insert('tags', { location_id: locationId, name });
}

export function addTags(locationId, contactId, names, userId) {
  const added = [];
  for (const n of names || []) {
    const id = ensureTag(locationId, n);
    if (!id) continue;
    const r = run('INSERT OR IGNORE INTO contact_tags (contact_id, tag_id) VALUES (?, ?)', contactId, id);
    if (r.changes) added.push(String(n).trim().toLowerCase());
  }
  for (const tag of added) {
    logActivity(locationId, contactId, userId, 'tag_added', `Tag added: ${tag}`);
    emit('contact.tag_added', locationId, { contactId, tag });
  }
  return added;
}

export function removeTags(locationId, contactId, names, userId) {
  for (const n of names || []) {
    const t = get('SELECT id FROM tags WHERE location_id = ? AND name = ?', locationId, String(n).trim().toLowerCase());
    if (!t) continue;
    const r = run('DELETE FROM contact_tags WHERE contact_id = ? AND tag_id = ?', contactId, t.id);
    if (r.changes) {
      logActivity(locationId, contactId, userId, 'tag_removed', `Tag removed: ${n}`);
      emit('contact.tag_removed', locationId, { contactId, tag: n });
    }
  }
}

const CONTACT_FIELDS = [
  'first_name', 'last_name', 'email', 'phone', 'company', 'job_title', 'website', 'address', 'city',
  'state', 'country', 'postal_code', 'date_of_birth', 'source', 'type', 'assigned_to', 'dnd_all', 'dnd', 'custom',
];

export function createContact(locationId, data, userId) {
  const row = {};
  for (const k of CONTACT_FIELDS) if (data[k] !== undefined) row[k] = data[k];
  row.phone = normalizePhone(row.phone);
  if (!row.first_name && !row.last_name && !row.email && !row.phone) {
    throw new HttpError(400, 'Name, email or phone is required');
  }
  const dup = findContactByPhoneOrEmail(locationId, { phone: row.phone, email: row.email });
  if (dup && !data.allowDuplicate) {
    throw new HttpError(409, `A contact with this phone/email already exists (${fullName(dup)})`);
  }
  const id = insert('contacts', { ...row, location_id: locationId, last_activity: now() });
  if (data.tags?.length) addTags(locationId, id, data.tags, userId);
  logActivity(locationId, id, userId, 'contact_created', `Contact created${row.source ? ` (source: ${row.source})` : ''}`);
  emit('contact.created', locationId, { contactId: id });
  return serializeContact(get('SELECT * FROM contacts WHERE id = ?', id));
}

export function updateContact(locationId, id, data, userId) {
  const before = getContact(locationId, id);
  const row = {};
  for (const k of CONTACT_FIELDS) if (data[k] !== undefined) row[k] = data[k];
  if (row.phone !== undefined) row.phone = normalizePhone(row.phone);
  row.updated_at = now();
  update('contacts', id, row);
  if (Array.isArray(data.tags)) {
    const current = contactTags(id);
    addTags(locationId, id, data.tags.filter((t) => !current.includes(t)), userId);
    removeTags(locationId, id, current.filter((t) => !data.tags.includes(t)), userId);
  }
  if (row.assigned_to !== undefined && row.assigned_to !== before.assigned_to && row.assigned_to) {
    notify(row.assigned_to, locationId, 'assignment', 'Contact assigned to you', fullName({ ...before, ...row }), `/contacts/${id}`);
  }
  logActivity(locationId, id, userId, 'contact_updated', 'Contact details updated');
  emit('contact.updated', locationId, { contactId: id });
  return serializeContact(get('SELECT * FROM contacts WHERE id = ?', id));
}

export function logActivity(locationId, contactId, userId, type, description) {
  insert('activities', { location_id: locationId, contact_id: contactId, user_id: userId || null, type, description });
  if (contactId) run('UPDATE contacts SET last_activity = ? WHERE id = ?', now(), contactId);
}

// ---------------- notifications ----------------
export function notify(userId, locationId, type, title, body, link) {
  if (!userId) return;
  const user = get('SELECT prefs, dnd FROM users WHERE id = ?', userId);
  if (!user) return;
  const prefs = parseJSON(user.prefs, {});
  if (prefs.notifications && prefs.notifications[type] === false) return;
  const id = insert('notifications', { user_id: userId, location_id: locationId, type, title, body, link });
  // user-level Do Not Disturb: keep the record in the inbox but don't push it live
  if (!user.dnd) {
    emit('notification.created', locationId, { userId, id, title, body, link, type });
    pushToUser(userId, { title, body, link }).catch(() => {});
  }
}

export function notifyLocationUsers(locationId, type, title, body, link, exceptUserId) {
  for (const u of all('SELECT user_id FROM user_locations WHERE location_id = ?', locationId)) {
    if (u.user_id !== exceptUserId) notify(u.user_id, locationId, type, title, body, link);
  }
}

// ---------------- conversations & messages ----------------
export function getOrCreateConversation(locationId, contactId) {
  let c = get('SELECT * FROM conversations WHERE location_id = ? AND contact_id = ?', locationId, contactId);
  if (!c) {
    const contact = get('SELECT assigned_to FROM contacts WHERE id = ?', contactId);
    const id = insert('conversations', { location_id: locationId, contact_id: contactId, assigned_to: contact?.assigned_to ?? null, last_message_at: now() });
    c = get('SELECT * FROM conversations WHERE id = ?', id);
  }
  return c;
}

export function serializeMessage(m) {
  if (!m) return null;
  return { ...m, meta: parseJSON(m.meta, {}), attachments: parseJSON(m.attachments, []) };
}

function attachmentLabel(msg) {
  const files = parseJSON(msg.attachments, []);
  if (!files.length) return '';
  const t = files[0].type || '';
  return t.startsWith('image/') ? '📷 Photo' : t.startsWith('audio/') ? '🎤 Voice message' : `📎 ${files[0].name || 'Attachment'}`;
}

function touchConversation(conv, msg) {
  const isComment = msg.type === 'comment';
  const fields = {
    last_message_at: msg.created_at || now(),
    last_message_body: (msg.subject ? `${msg.subject} — ` : '') + (msg.body || (msg.type === 'call' ? 'Call' : attachmentLabel(msg))),
    last_message_type: msg.type,
    last_message_direction: msg.direction,
    status: 'open',
  };
  if (isComment) {
    // internal comments don't change the "last message" preview of a conversation
    delete fields.last_message_body;
    delete fields.last_message_type;
    delete fields.last_message_direction;
  }
  update('conversations', conv.id, fields);
  if (msg.direction === 'inbound') run('UPDATE conversations SET unread_count = unread_count + 1 WHERE id = ?', conv.id);
}

/**
 * Records an inbound message from any channel, creating contact/conversation as needed.
 */
export function receiveInbound(locationId, { contactId, phone, email, name, type = 'sms', body, subject, attachments, meta }) {
  if (!CHANNELS.includes(type)) throw new HttpError(400, `Unknown channel ${type}`);
  let contact = contactId ? getContact(locationId, contactId) : findContactByPhoneOrEmail(locationId, { phone, email });
  if (!contact) {
    const [first_name, ...rest] = (name || '').split(' ');
    contact = createContact(locationId, { first_name: first_name || null, last_name: rest.join(' ') || null, phone, email, source: type });
  }
  const conv = getOrCreateConversation(locationId, contact.id);
  const id = insert('messages', {
    conversation_id: conv.id, location_id: locationId, contact_id: contact.id,
    type, direction: 'inbound', body, subject, status: 'received',
    meta: meta || {}, attachments: attachments || [],
  });
  const msg = get('SELECT * FROM messages WHERE id = ?', id);
  touchConversation(conv, msg);
  logActivity(locationId, contact.id, null, 'inbound_message', `Inbound ${type}: ${(body || '').slice(0, 80)}`);

  // STOP keyword => DND on that channel (TCPA style opt-out)
  if (type === 'sms' && /^\s*(stop|unsubscribe|cancel|end|quit)\s*$/i.test(body || '')) {
    const dnd = parseJSON(get('SELECT dnd FROM contacts WHERE id = ?', contact.id).dnd, {});
    dnd.sms = true;
    update('contacts', contact.id, { dnd });
  }

  const fresh = get('SELECT * FROM conversations WHERE id = ?', conv.id);
  const who = fullName(contact);
  if (fresh.assigned_to) notify(fresh.assigned_to, locationId, 'inbound_message', `New ${labelOf(type)} from ${who}`, body, `/conversations/${conv.id}`);
  else notifyLocationUsers(locationId, 'inbound_message', `New ${labelOf(type)} from ${who}`, body, `/conversations/${conv.id}`);
  for (const f of all('SELECT user_id FROM conversation_followers WHERE conversation_id = ?', conv.id)) {
    if (f.user_id !== fresh.assigned_to) notify(f.user_id, locationId, 'inbound_message', `New ${labelOf(type)} from ${who}`, body, `/conversations/${conv.id}`);
  }
  emit('message.created', locationId, { conversationId: conv.id, contactId: contact.id, message: serializeMessage(msg) });
  return serializeMessage(msg);
}

export const labelOf = (t) =>
  ({ sms: 'SMS', email: 'Email', whatsapp: 'WhatsApp', facebook: 'Facebook', instagram: 'Instagram', gmb: 'Google Business', live_chat: 'Live Chat', call: 'Call', comment: 'Comment' })[t] || t;

export const PUBLIC_URL = (process.env.PUBLIC_URL || 'http://localhost:5173').replace(/\/$/, '');

export function bookingLink(locationId) {
  const cal = get('SELECT slug FROM calendars WHERE location_id = ? ORDER BY id LIMIT 1', locationId);
  return cal ? `${PUBLIC_URL}/book/${cal.slug}` : '';
}

export function renderTemplate(text, contact, location, user) {
  if (!text) return text;
  const map = {
    'contact.first_name': contact?.first_name, 'contact.last_name': contact?.last_name,
    'contact.name': fullName(contact), 'contact.email': contact?.email, 'contact.phone': contact?.phone,
    'contact.company': contact?.company,
    'location.name': location?.name, 'location.phone': location?.phone, 'location.email': location?.email,
    'location.review_link': location?.review_link,
    'location.booking_link': location ? bookingLink(location.id) : '',
    'user.name': user?.name, 'user.email': user?.email, 'user.phone': user?.phone,
  };
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => (map[k] ?? ''));
}

/**
 * Sends an outbound message (or stores an internal comment / scheduled message).
 */
export async function sendMessage(locationId, { contactId, conversationId, userId, type = 'sms', body, subject, scheduledAt, attachments, mentions, meta }) {
  let conv;
  if (conversationId) {
    conv = get('SELECT * FROM conversations WHERE id = ? AND location_id = ?', conversationId, locationId);
    if (!conv) throw new HttpError(404, 'Conversation not found');
  } else {
    conv = getOrCreateConversation(locationId, contactId);
  }
  const contact = get('SELECT * FROM contacts WHERE id = ?', conv.contact_id);
  const location = get('SELECT * FROM locations WHERE id = ?', locationId);
  const user = userId ? get('SELECT * FROM users WHERE id = ?', userId) : null;

  if (type !== 'comment' && type !== 'call') {
    if (!CHANNELS.includes(type)) throw new HttpError(400, `Unknown channel ${type}`);
    const dnd = parseJSON(contact.dnd, {});
    if (contact.dnd_all || dnd[type]) throw new HttpError(422, `Contact has Do Not Disturb enabled for ${labelOf(type)}`);
    if (!body?.trim() && !attachments?.length) throw new HttpError(400, 'Message body is required');
  }
  const text = renderTemplate(body, contact, location, user);
  const subj = renderTemplate(subject, contact, location, user);
  const isScheduled = scheduledAt && new Date(scheduledAt) > new Date();

  const id = insert('messages', {
    conversation_id: conv.id, location_id: locationId, contact_id: contact.id, user_id: userId || null,
    type, direction: type === 'comment' ? 'internal' : 'outbound',
    body: text, subject: type === 'email' ? subj : null, status: isScheduled ? 'scheduled' : type === 'comment' ? 'sent' : 'pending',
    scheduled_at: isScheduled ? new Date(scheduledAt).toISOString() : null,
    meta: meta || {}, attachments: attachments || [],
  });

  if (type === 'comment') {
    for (const uid of mentions || []) {
      run('INSERT OR IGNORE INTO message_mentions (message_id, user_id) VALUES (?, ?)', id, uid);
      run('INSERT OR IGNORE INTO conversation_followers (conversation_id, user_id) VALUES (?, ?)', conv.id, uid);
      notify(uid, locationId, 'mention', `${user?.name || 'Someone'} mentioned you`, text, `/conversations/${conv.id}`);
    }
  }

  if (!isScheduled && type !== 'comment' && type !== 'call') await deliver(id);
  const msg = get('SELECT * FROM messages WHERE id = ?', id);
  if (!isScheduled) touchConversation(conv, msg);
  if (type !== 'comment') logActivity(locationId, contact.id, userId, isScheduled ? 'message_scheduled' : 'outbound_message', `${isScheduled ? 'Scheduled' : 'Sent'} ${labelOf(type)}: ${(text || '').slice(0, 80)}`);
  emit('message.created', locationId, { conversationId: conv.id, contactId: contact.id, message: serializeMessage(msg) });
  return serializeMessage(msg);
}

export async function deliver(messageId) {
  const m = get('SELECT * FROM messages WHERE id = ?', messageId);
  const contact = get('SELECT * FROM contacts WHERE id = ?', m.contact_id);
  try {
    let r;
    const files = parseJSON(m.attachments, []);
    const mediaUrls = files.map((f) => (f.url.startsWith('http') ? f.url : `${PUBLIC_URL}${f.url}`));
    if (m.type === 'sms') r = await sendSms(contact.phone, m.body, mediaUrls);
    else if (m.type === 'whatsapp') r = await sendWhatsApp(contact.phone, m.body, mediaUrls);
    else if (m.type === 'email') {
      const attachments = files.map((f) => ({ f, p: uploadPath(f.url) })).filter((x) => x.p)
        .map(({ f, p }) => ({ filename: f.name, type: f.type, content: fs.readFileSync(p).toString('base64') }));
      r = await sendEmail(contact.email, m.subject, m.body, attachments);
    }
    else r = await sendSocial(m.type, contact, m.body);
    const meta = { ...parseJSON(m.meta, {}), providerId: r.providerId, simulated: !!r.simulated };
    update('messages', m.id, { status: r.status, meta });
  } catch (e) {
    const meta = { ...parseJSON(m.meta, {}), error: e.message };
    update('messages', m.id, { status: 'failed', meta });
  }
}

// ---------------- opportunities / appointments helpers ----------------
export function serializeOpp(o) {
  if (!o) return null;
  const contact = o.contact_id ? get('SELECT * FROM contacts WHERE id = ?', o.contact_id) : null;
  return { ...o, contact: contact ? { id: contact.id, name: fullName(contact), phone: contact.phone, email: contact.email, tags: contactTags(contact.id) } : null };
}

export function serializeAppt(a) {
  if (!a) return null;
  const contact = a.contact_id ? get('SELECT id, first_name, last_name, email, phone FROM contacts WHERE id = ?', a.contact_id) : null;
  const cal = a.calendar_id ? get('SELECT id, name, color FROM calendars WHERE id = ?', a.calendar_id) : null;
  return { ...a, is_block: !!a.is_block, contact: contact ? { ...contact, name: fullName(contact) } : null, calendar: cal };
}

export function createTask(locationId, data, userId) {
  if (!data.title) throw new HttpError(400, 'Title is required');
  const id = insert('tasks', {
    location_id: locationId, contact_id: data.contact_id || null, title: data.title, description: data.description,
    due_at: data.due_at || null, assigned_to: data.assigned_to || userId || null, created_by: userId || null,
  });
  if (data.contact_id) logActivity(locationId, data.contact_id, userId, 'task_created', `Task created: ${data.title}`);
  const assignee = data.assigned_to || userId;
  if (assignee && assignee !== userId) notify(assignee, locationId, 'task', 'New task assigned to you', data.title, `/tasks`);
  emit('task.created', locationId, { taskId: id });
  return get('SELECT * FROM tasks WHERE id = ?', id);
}

export function recalcInvoice(inv) {
  const items = Array.isArray(inv.items) ? inv.items : parseJSON(inv.items, []);
  const subtotal = items.reduce((s, it) => s + Number(it.price || 0) * Number(it.qty || 1), 0);
  const discount = Number(inv.discount || 0);
  const taxed = Math.max(0, subtotal - discount);
  const total = +(taxed + (taxed * Number(inv.tax_rate || 0)) / 100).toFixed(2);
  return { items, subtotal: +subtotal.toFixed(2), total };
}

export function recordPayment(locationId, { invoiceId, contactId, amount, method = 'card', note }) {
  amount = Number(amount);
  if (!(amount > 0)) throw new HttpError(400, 'Amount must be greater than 0');
  let inv = null;
  if (invoiceId) {
    inv = get('SELECT * FROM invoices WHERE id = ? AND location_id = ?', invoiceId, locationId);
    if (!inv) throw new HttpError(404, 'Invoice not found');
    if (inv.status === 'void') throw new HttpError(422, 'Invoice is void');
    contactId = inv.contact_id;
  }
  const id = insert('transactions', { location_id: locationId, contact_id: contactId || null, invoice_id: invoiceId || null, amount, method, note });
  if (inv) {
    const paid = +(Number(inv.amount_paid) + amount).toFixed(2);
    const status = paid >= Number(inv.total) ? 'paid' : 'partially_paid';
    update('invoices', inv.id, { amount_paid: paid, status });
    if (status === 'paid') emit('invoice.paid', locationId, { invoiceId: inv.id, contactId });
  }
  if (contactId) {
    logActivity(locationId, contactId, null, 'payment', `Payment received: ${amount.toFixed(2)} via ${method}`);
    run("UPDATE contacts SET type = 'customer' WHERE id = ?", contactId);
  }
  notifyLocationUsers(locationId, 'payment', 'Payment received', `${amount.toFixed(2)} via ${method}`, '/payments');
  emit('payment.received', locationId, { transactionId: id, contactId, amount });
  return get('SELECT * FROM transactions WHERE id = ?', id);
}
