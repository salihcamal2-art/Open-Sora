import { Router } from 'express';
import { all, get, insert, run, update, parseJSON, tx } from '../db.js';
import { h, HttpError } from '../auth.js';
import {
  createContact, updateContact, serializeContact, getContact, addTags, removeTags, logActivity,
  createTask, serializeOpp, serializeAppt, fullName,
} from '../services.js';
import { emit } from '../events.js';

const r = Router();

function buildContactQuery(L, f, userId) {
  const where = ['c.location_id = ?'];
  const params = [L];
  if (f.q) {
    const like = `%${String(f.q).toLowerCase()}%`;
    where.push(`(lower(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')) LIKE ? OR lower(coalesce(c.email,'')) LIKE ? OR coalesce(c.phone,'') LIKE ? OR lower(coalesce(c.company,'')) LIKE ?)`);
    params.push(like, like, `%${String(f.q).replace(/[^\d+]/g, '') || f.q}%`, like);
  }
  const tags = Array.isArray(f.tags) ? f.tags : f.tags ? String(f.tags).split(',') : [];
  if (tags.length) {
    where.push(`EXISTS (SELECT 1 FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.contact_id = c.id AND t.name IN (${tags.map(() => '?').join(',')}))`);
    params.push(...tags.map((t) => t.trim().toLowerCase()));
  }
  if (f.type) { where.push('c.type = ?'); params.push(f.type); }
  if (f.source) { where.push('c.source = ?'); params.push(f.source); }
  if (f.assigned_to === 'me') { where.push('c.assigned_to = ?'); params.push(userId); }
  else if (f.assigned_to === 'unassigned') where.push('c.assigned_to IS NULL');
  else if (f.assigned_to) { where.push('c.assigned_to = ?'); params.push(Number(f.assigned_to)); }
  if (f.dnd === 'true' || f.dnd === true) where.push("(c.dnd_all = 1 OR c.dnd LIKE '%true%')");
  if (f.created_after) { where.push('c.created_at >= ?'); params.push(f.created_after); }
  if (f.has_email === 'true' || f.has_email === true) where.push("coalesce(c.email,'') != ''");
  if (f.has_phone === 'true' || f.has_phone === true) where.push("coalesce(c.phone,'') != ''");
  return { where: where.join(' AND '), params };
}

const SORTS = {
  newest: 'c.created_at DESC',
  oldest: 'c.created_at ASC',
  name: "lower(coalesce(c.first_name,'') || coalesce(c.last_name,'')) ASC",
  activity: 'c.last_activity DESC',
};

r.get('/', h((req, res) => {
  let f = { ...req.query };
  if (f.smartListId) {
    const sl = get('SELECT * FROM smart_lists WHERE id = ? AND location_id = ?', f.smartListId, req.locationId);
    if (sl) f = { ...parseJSON(sl.filters, {}), ...f };
  }
  const { where, params } = buildContactQuery(req.locationId, f, req.user.id);
  const limit = Math.min(Number(f.limit) || 50, 500);
  const offset = Number(f.offset) || 0;
  const total = get(`SELECT count(*) n FROM contacts c WHERE ${where}`, ...params).n;
  const rows = all(`SELECT c.* FROM contacts c WHERE ${where} ORDER BY ${SORTS[f.sort] || SORTS.newest} LIMIT ? OFFSET ?`, ...params, limit, offset);
  res.json({ total, items: rows.map(serializeContact) });
}));

r.post('/', h((req, res) => res.json(createContact(req.locationId, req.body, req.user.id))));

// Bulk import: [{first_name, last_name, email, phone, company, tags}]
r.post('/import', h((req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  let created = 0, skipped = 0;
  const errors = [];
  tx(() => {
    for (const [i, row] of rows.entries()) {
      try {
        const tags = typeof row.tags === 'string' ? row.tags.split(/[,;|]/).filter(Boolean) : row.tags;
        createContact(req.locationId, { ...row, tags: [...(tags || []), ...(req.body.tags || [])], source: row.source || 'import' }, req.user.id);
        created++;
      } catch (e) {
        skipped++;
        errors.push(`Row ${i + 1}: ${e.message}`);
      }
    }
  });
  res.json({ created, skipped, errors: errors.slice(0, 50) });
}));

r.post('/bulk', h((req, res) => {
  const { ids = [], action, tags = [], assigned_to } = req.body;
  for (const id of ids) {
    const c = get('SELECT id FROM contacts WHERE id = ? AND location_id = ?', id, req.locationId);
    if (!c) continue;
    if (action === 'add_tags') addTags(req.locationId, id, tags, req.user.id);
    else if (action === 'remove_tags') removeTags(req.locationId, id, tags, req.user.id);
    else if (action === 'assign') updateContact(req.locationId, id, { assigned_to: assigned_to || null }, req.user.id);
    else if (action === 'delete') run('DELETE FROM contacts WHERE id = ?', id);
    else if (action === 'dnd') update('contacts', id, { dnd_all: 1 });
  }
  emit('contact.updated', req.locationId, {});
  res.json({ ok: true, count: ids.length });
}));

// ---- tags ----
r.get('/tags', h((req, res) => {
  res.json(all(
    'SELECT t.id, t.name, (SELECT count(*) FROM contact_tags ct WHERE ct.tag_id = t.id) AS count FROM tags t WHERE t.location_id = ? ORDER BY t.name',
    req.locationId
  ));
}));
r.post('/tags', h((req, res) => {
  const name = String(req.body.name || '').trim().toLowerCase();
  if (!name) throw new HttpError(400, 'Tag name required');
  run('INSERT OR IGNORE INTO tags (location_id, name) VALUES (?, ?)', req.locationId, name);
  res.json(get('SELECT * FROM tags WHERE location_id = ? AND name = ?', req.locationId, name));
}));
r.delete('/tags/:id', h((req, res) => {
  run('DELETE FROM tags WHERE id = ? AND location_id = ?', req.params.id, req.locationId);
  res.json({ ok: true });
}));

// ---- custom fields ----
r.get('/custom-fields', h((req, res) => {
  res.json(all('SELECT * FROM custom_fields WHERE location_id = ? ORDER BY name', req.locationId).map((f) => ({ ...f, options: parseJSON(f.options, []) })));
}));
r.post('/custom-fields', h((req, res) => {
  const { name, type = 'text', options = [] } = req.body;
  if (!name) throw new HttpError(400, 'Name required');
  const key = req.body.key || name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const id = insert('custom_fields', { location_id: req.locationId, name, key, type, options });
  res.json(get('SELECT * FROM custom_fields WHERE id = ?', id));
}));
r.delete('/custom-fields/:id', h((req, res) => {
  run('DELETE FROM custom_fields WHERE id = ? AND location_id = ?', req.params.id, req.locationId);
  res.json({ ok: true });
}));

// ---- smart lists ----
r.get('/smart-lists', h((req, res) => {
  res.json(all('SELECT * FROM smart_lists WHERE location_id = ? AND (user_id IS NULL OR user_id = ?) ORDER BY name', req.locationId, req.user.id)
    .map((s) => ({ ...s, filters: parseJSON(s.filters, {}) })));
}));
r.post('/smart-lists', h((req, res) => {
  if (!req.body.name) throw new HttpError(400, 'Name required');
  const id = insert('smart_lists', { location_id: req.locationId, user_id: req.body.shared ? null : req.user.id, name: req.body.name, filters: req.body.filters || {} });
  res.json(get('SELECT * FROM smart_lists WHERE id = ?', id));
}));
r.delete('/smart-lists/:id', h((req, res) => {
  run('DELETE FROM smart_lists WHERE id = ? AND location_id = ?', req.params.id, req.locationId);
  res.json({ ok: true });
}));

// ---- single contact ----
r.get('/:id', h((req, res) => {
  const c = getContact(req.locationId, req.params.id);
  const conv = get('SELECT id FROM conversations WHERE contact_id = ?', c.id);
  const assigned = c.assigned_to ? get('SELECT id, name, color FROM users WHERE id = ?', c.assigned_to) : null;
  res.json({ ...serializeContact(c), conversation_id: conv?.id || null, assigned_user: assigned });
}));
r.put('/:id', h((req, res) => res.json(updateContact(req.locationId, Number(req.params.id), req.body, req.user.id))));
r.delete('/:id', h((req, res) => {
  getContact(req.locationId, req.params.id);
  run('DELETE FROM contacts WHERE id = ?', req.params.id);
  emit('contact.deleted', req.locationId, { contactId: Number(req.params.id) });
  res.json({ ok: true });
}));

r.post('/:id/tags', h((req, res) => {
  getContact(req.locationId, req.params.id);
  addTags(req.locationId, Number(req.params.id), req.body.tags || [], req.user.id);
  res.json(serializeContact(getContact(req.locationId, req.params.id)));
}));
r.delete('/:id/tags/:tag', h((req, res) => {
  removeTags(req.locationId, Number(req.params.id), [req.params.tag], req.user.id);
  res.json(serializeContact(getContact(req.locationId, req.params.id)));
}));

r.get('/:id/notes', h((req, res) => {
  getContact(req.locationId, req.params.id);
  res.json(all('SELECT n.*, u.name AS user_name FROM notes n LEFT JOIN users u ON u.id = n.user_id WHERE n.contact_id = ? ORDER BY n.created_at DESC', req.params.id));
}));
r.post('/:id/notes', h((req, res) => {
  getContact(req.locationId, req.params.id);
  if (!req.body.body?.trim()) throw new HttpError(400, 'Note is empty');
  const id = insert('notes', { contact_id: req.params.id, user_id: req.user.id, body: req.body.body });
  logActivity(req.locationId, Number(req.params.id), req.user.id, 'note', 'Note added');
  res.json(get('SELECT n.*, u.name AS user_name FROM notes n LEFT JOIN users u ON u.id = n.user_id WHERE n.id = ?', id));
}));
r.put('/:id/notes/:noteId', h((req, res) => {
  run('UPDATE notes SET body = ? WHERE id = ? AND contact_id = ?', req.body.body, req.params.noteId, req.params.id);
  res.json({ ok: true });
}));
r.delete('/:id/notes/:noteId', h((req, res) => {
  run('DELETE FROM notes WHERE id = ? AND contact_id = ?', req.params.noteId, req.params.id);
  res.json({ ok: true });
}));

r.get('/:id/tasks', h((req, res) => {
  res.json(all('SELECT t.*, u.name AS assignee_name FROM tasks t LEFT JOIN users u ON u.id = t.assigned_to WHERE t.contact_id = ? AND t.location_id = ? ORDER BY t.completed, t.due_at', req.params.id, req.locationId));
}));
r.post('/:id/tasks', h((req, res) => res.json(createTask(req.locationId, { ...req.body, contact_id: Number(req.params.id) }, req.user.id))));

r.get('/:id/activity', h((req, res) => {
  getContact(req.locationId, req.params.id);
  res.json(all('SELECT a.*, u.name AS user_name FROM activities a LEFT JOIN users u ON u.id = a.user_id WHERE a.contact_id = ? ORDER BY a.created_at DESC, a.id DESC LIMIT 200', req.params.id));
}));
r.get('/:id/opportunities', h((req, res) => {
  res.json(all('SELECT o.*, s.name AS stage_name, p.name AS pipeline_name FROM opportunities o JOIN stages s ON s.id = o.stage_id JOIN pipelines p ON p.id = o.pipeline_id WHERE o.contact_id = ? AND o.location_id = ? ORDER BY o.created_at DESC', req.params.id, req.locationId).map(serializeOpp));
}));
r.get('/:id/appointments', h((req, res) => {
  res.json(all('SELECT * FROM appointments WHERE contact_id = ? AND location_id = ? ORDER BY start_at DESC', req.params.id, req.locationId).map(serializeAppt));
}));
r.get('/:id/invoices', h((req, res) => {
  res.json(all('SELECT * FROM invoices WHERE contact_id = ? AND location_id = ? ORDER BY created_at DESC', req.params.id, req.locationId));
}));
r.get('/:id/workflows', h((req, res) => {
  res.json(all(
    `SELECT w.id, w.name, max(l.created_at) AS last_run FROM workflow_logs l JOIN workflows w ON w.id = l.workflow_id
     WHERE l.contact_id = ? AND w.location_id = ? GROUP BY w.id ORDER BY last_run DESC`, req.params.id, req.locationId));
}));

// Manually add a contact to a workflow
r.post('/:id/workflows/:wfId', h(async (req, res) => {
  const c = getContact(req.locationId, req.params.id);
  const wf = get('SELECT * FROM workflows WHERE id = ? AND location_id = ?', req.params.wfId, req.locationId);
  if (!wf) throw new HttpError(404, 'Workflow not found');
  const { executeWorkflow } = await import('../workflows.js');
  insert('workflow_logs', { workflow_id: wf.id, contact_id: c.id, action: 'enrolled', status: 'success', detail: 'manually added' });
  logActivity(req.locationId, c.id, req.user.id, 'workflow', `Added to workflow "${wf.name}"`);
  executeWorkflow(wf, c.id, 0, { event: 'manual' }).catch(console.error);
  res.json({ ok: true, message: `${fullName(c)} added to ${wf.name}` });
}));

export default r;
