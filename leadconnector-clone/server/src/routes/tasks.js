import { Router } from 'express';
import { all, get, run, update, now } from '../db.js';
import { h, HttpError } from '../auth.js';
import { createTask, fullName, logActivity } from '../services.js';
import { emit } from '../events.js';

const r = Router();

function withContact(t) {
  const c = t.contact_id ? get('SELECT id, first_name, last_name, email, phone FROM contacts WHERE id = ?', t.contact_id) : null;
  return { ...t, completed: !!t.completed, contact: c ? { id: c.id, name: fullName(c) } : null };
}

r.get('/', h((req, res) => {
  const where = ['t.location_id = ?'];
  const params = [req.locationId];
  const nowIso = now();
  const status = req.query.status || 'pending';
  if (status === 'pending') where.push('t.completed = 0');
  if (status === 'completed') where.push('t.completed = 1');
  if (status === 'overdue') { where.push('t.completed = 0 AND t.due_at IS NOT NULL AND t.due_at < ?'); params.push(nowIso); }
  if (status === 'today') {
    const end = new Date(); end.setHours(23, 59, 59, 999);
    where.push('t.completed = 0 AND t.due_at IS NOT NULL AND t.due_at <= ?'); params.push(end.toISOString());
  }
  if (req.query.assigned_to === 'me') { where.push('t.assigned_to = ?'); params.push(req.user.id); }
  else if (req.query.assigned_to) { where.push('t.assigned_to = ?'); params.push(req.query.assigned_to); }
  if (req.query.q) { where.push('lower(t.title) LIKE ?'); params.push(`%${String(req.query.q).toLowerCase()}%`); }
  const rows = all(
    `SELECT t.*, u.name AS assignee_name FROM tasks t LEFT JOIN users u ON u.id = t.assigned_to WHERE ${where.join(' AND ')}
     ORDER BY t.completed, CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END, t.due_at, t.id DESC LIMIT 500`, ...params
  );
  res.json(rows.map(withContact));
}));

r.post('/', h((req, res) => res.json(withContact(createTask(req.locationId, req.body, req.user.id)))));

r.put('/:id', h((req, res) => {
  const t = get('SELECT * FROM tasks WHERE id = ? AND location_id = ?', req.params.id, req.locationId);
  if (!t) throw new HttpError(404, 'Task not found');
  const data = { ...req.body };
  if (data.completed !== undefined) {
    data.completed = data.completed ? 1 : 0;
    data.completed_at = data.completed ? now() : null;
  }
  update('tasks', t.id, data, ['title', 'description', 'due_at', 'assigned_to', 'completed', 'completed_at', 'contact_id']);
  if (data.completed && !t.completed) {
    if (t.contact_id) logActivity(req.locationId, t.contact_id, req.user.id, 'task_completed', `Task completed: ${t.title}`);
    emit('task.completed', req.locationId, { taskId: t.id, contactId: t.contact_id });
  }
  emit('task.updated', req.locationId, { taskId: t.id });
  res.json(withContact(get('SELECT * FROM tasks WHERE id = ?', t.id)));
}));

r.delete('/:id', h((req, res) => {
  run('DELETE FROM tasks WHERE id = ? AND location_id = ?', req.params.id, req.locationId);
  res.json({ ok: true });
}));

export default r;
