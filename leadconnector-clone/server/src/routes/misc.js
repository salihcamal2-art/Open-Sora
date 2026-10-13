// Notifications, snippets, dashboard, global search, workflows, manual actions.
import { Router } from 'express';
import { all, get, insert, run, update, parseJSON } from '../db.js';
import { h, HttpError, requireAdmin } from '../auth.js';
import { fullName, serializeContact, serializeAppt } from '../services.js';
import { TRIGGERS, ACTIONS } from '../workflows.js';
import { providersStatus } from '../providers.js';
import { aiEnabled } from './ai.js';
import { stripeEnabled } from '../stripe.js';

const r = Router();

// ---------- notifications ----------
r.get('/notifications', h((req, res) => {
  const items = all('SELECT * FROM notifications WHERE user_id = ? AND (location_id = ? OR location_id IS NULL) ORDER BY created_at DESC, id DESC LIMIT 200', req.user.id, req.locationId);
  const unread = get('SELECT count(*) n FROM notifications WHERE user_id = ? AND (location_id = ? OR location_id IS NULL) AND read = 0', req.user.id, req.locationId).n;
  res.json({ items: items.map((n) => ({ ...n, read: !!n.read })), unread });
}));
r.post('/notifications/read', h((req, res) => {
  if (req.body.id) run('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?', req.body.id, req.user.id);
  else run('UPDATE notifications SET read = 1 WHERE user_id = ? AND (location_id = ? OR location_id IS NULL)', req.user.id, req.locationId);
  res.json({ ok: true });
}));
r.delete('/notifications', h((req, res) => {
  run('DELETE FROM notifications WHERE user_id = ? AND location_id = ?', req.user.id, req.locationId);
  res.json({ ok: true });
}));

// ---------- snippets (templates) ----------
r.get('/snippets', h((req, res) => res.json(all('SELECT * FROM snippets WHERE location_id = ? ORDER BY name', req.locationId))));
r.post('/snippets', h((req, res) => {
  const { name, body, type = 'sms' } = req.body;
  if (!name || !body) throw new HttpError(400, 'Name and body are required');
  const id = insert('snippets', { location_id: req.locationId, name, body, type });
  res.json(get('SELECT * FROM snippets WHERE id = ?', id));
}));
r.put('/snippets/:id', h((req, res) => {
  update('snippets', Number(req.params.id), req.body, ['name', 'body', 'type']);
  res.json(get('SELECT * FROM snippets WHERE id = ?', req.params.id));
}));
r.delete('/snippets/:id', h((req, res) => {
  run('DELETE FROM snippets WHERE id = ? AND location_id = ?', req.params.id, req.locationId);
  res.json({ ok: true });
}));

// ---------- dashboard ----------
r.get('/dashboard', h((req, res) => {
  const L = req.locationId;
  const today0 = new Date(); today0.setHours(0, 0, 0, 0);
  const today1 = new Date(today0.getTime() + 86400e3);
  const since30 = new Date(Date.now() - 30 * 86400e3).toISOString();
  const opp = get("SELECT count(*) n, coalesce(sum(value),0) v FROM opportunities WHERE location_id = ? AND status = 'open'", L);
  const won = get("SELECT count(*) n, coalesce(sum(value),0) v FROM opportunities WHERE location_id = ? AND status = 'won' AND updated_at >= ?", L, since30);
  const lost = get("SELECT count(*) n FROM opportunities WHERE location_id = ? AND status = 'lost' AND updated_at >= ?", L, since30).n;
  const pipelineStages = all(
    `SELECT s.name, count(o.id) n, coalesce(sum(o.value),0) v FROM stages s JOIN pipelines p ON p.id = s.pipeline_id
     LEFT JOIN opportunities o ON o.stage_id = s.id AND o.status = 'open'
     WHERE p.location_id = ? AND p.id = (SELECT min(id) FROM pipelines WHERE location_id = ?) GROUP BY s.id ORDER BY s.position`, L, L);
  const leadsByDay = all(
    `SELECT substr(created_at,1,10) d, count(*) n FROM contacts WHERE location_id = ? AND created_at >= ? GROUP BY d ORDER BY d`,
    L, new Date(Date.now() - 14 * 86400e3).toISOString());
  const sources = all("SELECT coalesce(source,'unknown') source, count(*) n FROM contacts WHERE location_id = ? GROUP BY source ORDER BY n DESC LIMIT 6", L);
  res.json({
    contacts: get('SELECT count(*) n FROM contacts WHERE location_id = ?', L).n,
    new_contacts_30d: get('SELECT count(*) n FROM contacts WHERE location_id = ? AND created_at >= ?', L, since30).n,
    unread_conversations: get("SELECT count(*) n FROM conversations WHERE location_id = ? AND unread_count > 0 AND status != 'closed'", L).n,
    open_opportunities: opp.n,
    pipeline_value: opp.v,
    won_30d: won.n,
    won_value_30d: won.v,
    lost_30d: lost,
    conversion_rate: won.n + lost ? Math.round((won.n / (won.n + lost)) * 100) : 0,
    appointments_today: all(
      "SELECT * FROM appointments WHERE location_id = ? AND is_block = 0 AND status != 'cancelled' AND start_at >= ? AND start_at < ? ORDER BY start_at",
      L, today0.toISOString(), today1.toISOString()).map(serializeAppt),
    tasks_due: get('SELECT count(*) n FROM tasks WHERE location_id = ? AND completed = 0 AND due_at IS NOT NULL AND due_at < ?', L, today1.toISOString()).n,
    my_tasks: all('SELECT * FROM tasks WHERE location_id = ? AND completed = 0 AND assigned_to = ? ORDER BY CASE WHEN due_at IS NULL THEN 1 ELSE 0 END, due_at LIMIT 5', L, req.user.id),
    revenue_30d: get("SELECT coalesce(sum(amount),0) s FROM transactions WHERE location_id = ? AND status = 'succeeded' AND created_at >= ?", L, since30).s,
    review_avg: +Number(get('SELECT coalesce(avg(rating),0) a FROM reviews WHERE location_id = ?', L).a).toFixed(1),
    review_count: get('SELECT count(*) n FROM reviews WHERE location_id = ?', L).n,
    manual_actions: get("SELECT count(*) n FROM manual_actions WHERE location_id = ? AND status = 'pending'", L).n,
    pipeline_stages: pipelineStages,
    leads_by_day: leadsByDay,
    sources,
    providers: { ...providersStatus(), ai: aiEnabled(), stripe: stripeEnabled() },
  });
}));

// ---------- global search ----------
r.get('/search', h((req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (!q) return res.json({ contacts: [], opportunities: [], invoices: [] });
  const like = `%${q}%`;
  const L = req.locationId;
  res.json({
    contacts: all(`SELECT * FROM contacts WHERE location_id = ? AND (lower(coalesce(first_name,'')||' '||coalesce(last_name,'')) LIKE ? OR lower(coalesce(email,'')) LIKE ? OR coalesce(phone,'') LIKE ? OR lower(coalesce(company,'')) LIKE ?) LIMIT 10`, L, like, like, like, like).map(serializeContact),
    opportunities: all('SELECT id, name, value, status FROM opportunities WHERE location_id = ? AND lower(name) LIKE ? LIMIT 10', L, like),
    invoices: all('SELECT id, number, total, status FROM invoices WHERE location_id = ? AND (lower(number) LIKE ? OR lower(coalesce(title,\'\')) LIKE ?) LIMIT 10', L, like, like),
  });
}));

// ---------- call history ----------
r.get('/calls', h((req, res) => {
  res.json(all(
    `SELECT m.*, u.name AS user_name FROM messages m LEFT JOIN users u ON u.id = m.user_id
     WHERE m.location_id = ? AND m.type = 'call' ORDER BY m.created_at DESC LIMIT 100`, req.locationId
  ).map((m) => {
    const c = get('SELECT id, first_name, last_name, email, phone FROM contacts WHERE id = ?', m.contact_id);
    return { ...m, meta: parseJSON(m.meta, {}), contact: c ? { ...c, name: fullName(c) } : null };
  }));
}));

// ---------- workflows ----------
r.get('/workflows/meta', h((req, res) => res.json({ triggers: TRIGGERS, actions: ACTIONS })));
r.get('/workflows', h((req, res) => {
  res.json(all('SELECT * FROM workflows WHERE location_id = ? ORDER BY created_at DESC', req.locationId).map((w) => ({
    ...w,
    trigger_config: parseJSON(w.trigger_config, {}),
    actions: parseJSON(w.actions, []),
    enrolled: get("SELECT count(*) n FROM workflow_logs WHERE workflow_id = ? AND action = 'enrolled'", w.id).n,
  })));
}));
r.post('/workflows', requireAdmin, h((req, res) => {
  const { name, trigger_type, trigger_config = {}, actions = [], status = 'draft' } = req.body;
  if (!name || !TRIGGERS[trigger_type]) throw new HttpError(400, 'Name and a valid trigger are required');
  const id = insert('workflows', { location_id: req.locationId, name, trigger_type, trigger_config, actions, status });
  res.json(get('SELECT * FROM workflows WHERE id = ?', id));
}));
r.get('/workflows/:id', h((req, res) => {
  const w = get('SELECT * FROM workflows WHERE id = ? AND location_id = ?', req.params.id, req.locationId);
  if (!w) throw new HttpError(404, 'Workflow not found');
  const logs = all('SELECT * FROM workflow_logs WHERE workflow_id = ? ORDER BY id DESC LIMIT 100', w.id).map((l) => {
    const c = l.contact_id ? get('SELECT first_name, last_name, email, phone FROM contacts WHERE id = ?', l.contact_id) : null;
    return { ...l, contact_name: c ? fullName(c) : null };
  });
  res.json({ ...w, trigger_config: parseJSON(w.trigger_config, {}), actions: parseJSON(w.actions, []), logs });
}));
r.put('/workflows/:id', requireAdmin, h((req, res) => {
  const w = get('SELECT * FROM workflows WHERE id = ? AND location_id = ?', req.params.id, req.locationId);
  if (!w) throw new HttpError(404, 'Workflow not found');
  if (req.body.trigger_type && !TRIGGERS[req.body.trigger_type]) throw new HttpError(400, 'Invalid trigger');
  update('workflows', w.id, req.body, ['name', 'status', 'trigger_type', 'trigger_config', 'actions']);
  res.json(get('SELECT * FROM workflows WHERE id = ?', w.id));
}));
r.delete('/workflows/:id', requireAdmin, h((req, res) => {
  run('DELETE FROM workflows WHERE id = ? AND location_id = ?', req.params.id, req.locationId);
  res.json({ ok: true });
}));

// ---------- manual actions ----------
r.get('/manual-actions', h((req, res) => {
  const status = req.query.status || 'pending';
  res.json(all('SELECT * FROM manual_actions WHERE location_id = ? AND status = ? ORDER BY created_at', req.locationId, status).map((m) => {
    const c = get('SELECT * FROM contacts WHERE id = ?', m.contact_id);
    const w = m.workflow_id ? get('SELECT name FROM workflows WHERE id = ?', m.workflow_id) : null;
    const conv = get('SELECT id FROM conversations WHERE contact_id = ?', m.contact_id);
    return { ...m, contact: c ? { id: c.id, name: fullName(c), phone: c.phone, email: c.email } : null, workflow_name: w?.name, conversation_id: conv?.id };
  }));
}));
r.put('/manual-actions/:id', h((req, res) => {
  run('UPDATE manual_actions SET status = ? WHERE id = ? AND location_id = ?', req.body.status, req.params.id, req.locationId);
  res.json({ ok: true });
}));

export default r;
