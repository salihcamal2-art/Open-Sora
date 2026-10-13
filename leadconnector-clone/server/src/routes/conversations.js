import { Router } from 'express';
import { all, get, insert, run, update, parseJSON, now } from '../db.js';
import { h, HttpError } from '../auth.js';
import { sendMessage, serializeMessage, fullName, contactTags, getOrCreateConversation, getContact, logActivity, notify } from '../services.js';
import { emit } from '../events.js';

const r = Router();

/**
 * Advanced filters (AND / OR rules):
 * {
 *   match: "all" | "any",              // how groups are combined
 *   groups: [{ match: "all"|"any", rules: [{ field, op: "is"|"is_not", value }] }]
 * }
 * fields: channel, assignee, follower, mention, direction, status, starred, unread, tag
 * value "me" is resolved to the current user; assignee also accepts "unassigned".
 */
function ruleSql(rule, userId, params) {
  const v = rule.value === 'me' ? userId : rule.value;
  let frag;
  switch (rule.field) {
    case 'channel':
      frag = 'EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.type = ?)';
      params.push(v);
      break;
    case 'last_channel':
      frag = 'c.last_message_type = ?';
      params.push(v);
      break;
    case 'assignee':
      if (v === 'unassigned') frag = 'c.assigned_to IS NULL';
      else { frag = 'c.assigned_to = ?'; params.push(Number(v)); }
      break;
    case 'follower':
      frag = 'EXISTS (SELECT 1 FROM conversation_followers f WHERE f.conversation_id = c.id AND f.user_id = ?)';
      params.push(Number(v));
      break;
    case 'mention':
      frag = 'EXISTS (SELECT 1 FROM message_mentions mm JOIN messages m ON m.id = mm.message_id WHERE m.conversation_id = c.id AND mm.user_id = ?)';
      params.push(Number(v));
      break;
    case 'direction':
      frag = 'c.last_message_direction = ?';
      params.push(v);
      break;
    case 'status':
      frag = 'c.status = ?';
      params.push(v);
      break;
    case 'starred':
      frag = 'c.starred = 1';
      break;
    case 'unread':
      frag = 'c.unread_count > 0';
      break;
    case 'tag':
      frag = 'EXISTS (SELECT 1 FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.contact_id = c.contact_id AND t.name = ?)';
      params.push(String(v).toLowerCase());
      break;
    default:
      return null;
  }
  return rule.op === 'is_not' ? `NOT (${frag})` : `(${frag})`;
}

function filterSql(filter, userId, params) {
  if (!filter?.groups?.length) return null;
  const groups = filter.groups
    .map((g) => {
      const parts = (g.rules || []).map((rl) => ruleSql(rl, userId, params)).filter(Boolean);
      if (!parts.length) return null;
      return `(${parts.join(g.match === 'any' ? ' OR ' : ' AND ')})`;
    })
    .filter(Boolean);
  if (!groups.length) return null;
  return `(${groups.join(filter.match === 'any' ? ' OR ' : ' AND ')})`;
}

function serializeConv(c, userId) {
  const contact = get('SELECT * FROM contacts WHERE id = ?', c.contact_id);
  const assignee = c.assigned_to ? get('SELECT id, name, color FROM users WHERE id = ?', c.assigned_to) : null;
  const followers = all('SELECT u.id, u.name, u.color FROM conversation_followers f JOIN users u ON u.id = f.user_id WHERE f.conversation_id = ?', c.id);
  return {
    ...c,
    starred: !!c.starred,
    contact: contact ? { id: contact.id, name: fullName(contact), phone: contact.phone, email: contact.email, company: contact.company, dnd_all: !!contact.dnd_all, dnd: parseJSON(contact.dnd, {}), tags: contactTags(contact.id) } : null,
    assignee,
    followers,
    following: followers.some((f) => f.id === userId),
  };
}

r.get('/', h((req, res) => {
  const params = [req.locationId];
  const where = ['c.location_id = ?'];
  const tab = req.query.tab || 'all';
  if (tab === 'unread') where.push('c.unread_count > 0');
  if (tab === 'starred') where.push('c.starred = 1');
  if (tab === 'mine') { where.push('c.assigned_to = ?'); params.push(req.user.id); }
  if (tab === 'unassigned') where.push('c.assigned_to IS NULL');
  if (tab === 'closed') where.push("c.status = 'closed'");
  else if (tab !== 'all') where.push("c.status != 'closed'");
  if (req.query.q) {
    const like = `%${String(req.query.q).toLowerCase()}%`;
    where.push(`(EXISTS (SELECT 1 FROM contacts ct WHERE ct.id = c.contact_id AND (lower(coalesce(ct.first_name,'') || ' ' || coalesce(ct.last_name,'')) LIKE ? OR lower(coalesce(ct.email,'')) LIKE ? OR coalesce(ct.phone,'') LIKE ?))
      OR lower(coalesce(c.last_message_body,'')) LIKE ?)`);
    params.push(like, like, like, like);
  }
  if (req.query.filter) {
    const f = typeof req.query.filter === 'string' ? parseJSON(req.query.filter, null) : req.query.filter;
    const sql = filterSql(f, req.user.id, params);
    if (sql) where.push(sql);
  }
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const rows = all(
    `SELECT c.* FROM conversations c WHERE ${where.join(' AND ')} AND c.last_message_body IS NOT NULL ORDER BY c.last_message_at DESC LIMIT ? OFFSET ?`,
    ...params, limit, offset
  );
  const unread = get("SELECT count(*) n FROM conversations WHERE location_id = ? AND unread_count > 0 AND status != 'closed'", req.locationId).n;
  res.json({ items: rows.map((c) => serializeConv(c, req.user.id)), unread });
}));

// start (or open) a conversation for a contact
r.post('/', h((req, res) => {
  getContact(req.locationId, req.body.contact_id);
  const c = getOrCreateConversation(req.locationId, Number(req.body.contact_id));
  res.json(serializeConv(c, req.user.id));
}));

function loadConv(req) {
  const c = get('SELECT * FROM conversations WHERE id = ? AND location_id = ?', req.params.id, req.locationId);
  if (!c) throw new HttpError(404, 'Conversation not found');
  return c;
}

r.get('/:id', h((req, res) => res.json(serializeConv(loadConv(req), req.user.id))));

r.get('/:id/messages', h((req, res) => {
  const c = loadConv(req);
  const msgs = all(
    `SELECT m.*, u.name AS user_name FROM messages m LEFT JOIN users u ON u.id = m.user_id
     WHERE m.conversation_id = ? ORDER BY coalesce(m.scheduled_at, m.created_at) ASC, m.id ASC`, c.id
  ).map(serializeMessage);
  res.json(msgs);
}));

r.post('/:id/messages', h(async (req, res) => {
  const c = loadConv(req);
  const m = await sendMessage(req.locationId, { ...req.body, conversationId: c.id, userId: req.user.id });
  if (m.status === 'failed') return res.status(502).json({ error: m.meta?.error || 'Delivery failed', message: m });
  res.json(m);
}));

// Log a phone call (outbound from the app dialer, or a manual inbound log)
r.post('/:id/calls', h((req, res) => {
  const c = loadConv(req);
  const { direction = 'outbound', duration = 0, outcome = 'completed', notes } = req.body;
  const id = insert('messages', {
    conversation_id: c.id, location_id: req.locationId, contact_id: c.contact_id, user_id: req.user.id,
    type: 'call', direction, body: notes || '', status: outcome, meta: { duration: Number(duration), outcome },
  });
  update('conversations', c.id, { last_message_at: now(), last_message_body: `${direction === 'inbound' ? 'Inbound' : 'Outbound'} call (${outcome})`, last_message_type: 'call', last_message_direction: direction });
  logActivity(req.locationId, c.contact_id, req.user.id, 'call', `${direction} call — ${outcome}${duration ? `, ${duration}s` : ''}`);
  const msg = serializeMessage(get('SELECT * FROM messages WHERE id = ?', id));
  emit('message.created', req.locationId, { conversationId: c.id, contactId: c.contact_id, message: msg });
  res.json(msg);
}));

r.delete('/:id/messages/:mid', h((req, res) => {
  const c = loadConv(req);
  const m = get('SELECT * FROM messages WHERE id = ? AND conversation_id = ?', req.params.mid, c.id);
  if (!m) throw new HttpError(404, 'Message not found');
  if (m.status !== 'scheduled' && m.type !== 'comment') throw new HttpError(422, 'Only scheduled messages and comments can be deleted');
  run('DELETE FROM messages WHERE id = ?', m.id);
  emit('conversation.updated', req.locationId, { conversationId: c.id });
  res.json({ ok: true });
}));

r.post('/:id/read', h((req, res) => {
  const c = loadConv(req);
  update('conversations', c.id, { unread_count: req.body.unread ? Math.max(1, c.unread_count) : 0 });
  emit('conversation.updated', req.locationId, { conversationId: c.id });
  res.json({ ok: true });
}));

r.put('/:id', h((req, res) => {
  const c = loadConv(req);
  const { starred, status, assigned_to } = req.body;
  update('conversations', c.id, { starred, status, assigned_to }, ['starred', 'status', 'assigned_to']);
  if (assigned_to !== undefined && assigned_to && assigned_to !== c.assigned_to) {
    const contact = get('SELECT * FROM contacts WHERE id = ?', c.contact_id);
    notify(assigned_to, req.locationId, 'assignment', 'Conversation assigned to you', fullName(contact), `/conversations/${c.id}`);
    logActivity(req.locationId, c.contact_id, req.user.id, 'assignment', 'Conversation reassigned');
  }
  emit('conversation.updated', req.locationId, { conversationId: c.id });
  res.json(serializeConv(get('SELECT * FROM conversations WHERE id = ?', c.id), req.user.id));
}));

r.post('/:id/follow', h((req, res) => {
  const c = loadConv(req);
  const uid = Number(req.body.user_id || req.user.id);
  if (req.body.follow === false) run('DELETE FROM conversation_followers WHERE conversation_id = ? AND user_id = ?', c.id, uid);
  else run('INSERT OR IGNORE INTO conversation_followers (conversation_id, user_id) VALUES (?, ?)', c.id, uid);
  res.json(serializeConv(c, req.user.id));
}));

r.delete('/:id', h((req, res) => {
  const c = loadConv(req);
  run('DELETE FROM conversations WHERE id = ?', c.id);
  emit('conversation.updated', req.locationId, { conversationId: c.id });
  res.json({ ok: true });
}));

export default r;
