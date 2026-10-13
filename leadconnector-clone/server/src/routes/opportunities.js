import { Router } from 'express';
import { all, get, insert, run, update, now, tx } from '../db.js';
import { h, HttpError } from '../auth.js';
import { serializeOpp, logActivity, notify, fullName, createContact } from '../services.js';
import { emit } from '../events.js';

const r = Router();

// ---------- pipelines ----------
function pipelinesWithStages(L) {
  return all('SELECT * FROM pipelines WHERE location_id = ? ORDER BY id', L).map((p) => ({
    ...p,
    stages: all('SELECT * FROM stages WHERE pipeline_id = ? ORDER BY position, id', p.id),
  }));
}

r.get('/pipelines', h((req, res) => res.json(pipelinesWithStages(req.locationId))));

r.post('/pipelines', h((req, res) => {
  const { name, stages = [] } = req.body;
  if (!name) throw new HttpError(400, 'Name required');
  tx(() => {
    const id = insert('pipelines', { location_id: req.locationId, name });
    (stages.length ? stages : ['New', 'In Progress', 'Won']).forEach((s, i) => insert('stages', { pipeline_id: id, name: typeof s === 'string' ? s : s.name, position: i }));
  });
  res.json(pipelinesWithStages(req.locationId));
}));

// Update pipeline name + full stage list (keeps ids of existing stages, adds new, deletes removed)
r.put('/pipelines/:id', h((req, res) => {
  const p = get('SELECT * FROM pipelines WHERE id = ? AND location_id = ?', req.params.id, req.locationId);
  if (!p) throw new HttpError(404, 'Pipeline not found');
  tx(() => {
    if (req.body.name) update('pipelines', p.id, { name: req.body.name });
    if (Array.isArray(req.body.stages)) {
      const keep = [];
      req.body.stages.forEach((s, i) => {
        if (s.id) {
          run('UPDATE stages SET name = ?, position = ? WHERE id = ? AND pipeline_id = ?', s.name, i, s.id, p.id);
          keep.push(Number(s.id));
        } else keep.push(insert('stages', { pipeline_id: p.id, name: s.name, position: i }));
      });
      const existing = all('SELECT id FROM stages WHERE pipeline_id = ?', p.id).map((x) => x.id);
      for (const sid of existing) {
        if (keep.includes(sid)) continue;
        if (get('SELECT count(*) n FROM opportunities WHERE stage_id = ?', sid).n) {
          throw new HttpError(422, 'Cannot delete a stage that still has opportunities');
        }
        run('DELETE FROM stages WHERE id = ?', sid);
      }
    }
  });
  res.json(pipelinesWithStages(req.locationId));
}));

r.delete('/pipelines/:id', h((req, res) => {
  if (get('SELECT count(*) n FROM pipelines WHERE location_id = ?', req.locationId).n <= 1) throw new HttpError(422, 'At least one pipeline is required');
  run('DELETE FROM pipelines WHERE id = ? AND location_id = ?', req.params.id, req.locationId);
  res.json({ ok: true });
}));

// ---------- opportunities ----------
r.get('/', h((req, res) => {
  const where = ['o.location_id = ?'];
  const params = [req.locationId];
  if (req.query.pipeline_id) { where.push('o.pipeline_id = ?'); params.push(req.query.pipeline_id); }
  if (req.query.status && req.query.status !== 'all') { where.push('o.status = ?'); params.push(req.query.status); }
  if (req.query.assigned_to === 'me') { where.push('o.assigned_to = ?'); params.push(req.user.id); }
  else if (req.query.assigned_to) { where.push('o.assigned_to = ?'); params.push(req.query.assigned_to); }
  if (req.query.q) {
    const like = `%${String(req.query.q).toLowerCase()}%`;
    where.push(`(lower(o.name) LIKE ? OR EXISTS (SELECT 1 FROM contacts c WHERE c.id = o.contact_id AND (lower(coalesce(c.first_name,'')||' '||coalesce(c.last_name,'')) LIKE ? OR lower(coalesce(c.email,'')) LIKE ? OR coalesce(c.phone,'') LIKE ?)))`);
    params.push(like, like, like, like);
  }
  const sort = req.query.sort === 'value' ? 'o.value DESC' : req.query.sort === 'oldest' ? 'o.created_at ASC' : 'o.updated_at DESC';
  const rows = all(`SELECT o.*, u.name AS assignee_name FROM opportunities o LEFT JOIN users u ON u.id = o.assigned_to WHERE ${where.join(' AND ')} ORDER BY ${sort}`, ...params);
  res.json(rows.map(serializeOpp));
}));

r.post('/', h((req, res) => {
  let { pipeline_id, stage_id, contact_id, name, value, status = 'open', source, assigned_to, contact } = req.body;
  const p = get('SELECT * FROM pipelines WHERE id = ? AND location_id = ?', pipeline_id, req.locationId);
  if (!p) throw new HttpError(400, 'Pipeline is required');
  if (!stage_id) stage_id = get('SELECT id FROM stages WHERE pipeline_id = ? ORDER BY position LIMIT 1', p.id)?.id;
  if (!contact_id && contact) contact_id = createContact(req.locationId, { ...contact, source: source || 'opportunity' }, req.user.id).id;
  if (!contact_id) throw new HttpError(400, 'Contact is required');
  const c = get('SELECT * FROM contacts WHERE id = ? AND location_id = ?', contact_id, req.locationId);
  if (!c) throw new HttpError(404, 'Contact not found');
  const id = insert('opportunities', {
    location_id: req.locationId, pipeline_id: p.id, stage_id, contact_id, name: name || fullName(c),
    value: Number(value || 0), status, source, assigned_to: assigned_to || req.user.id,
  });
  logActivity(req.locationId, contact_id, req.user.id, 'opportunity', `Opportunity created: ${name || fullName(c)}`);
  if (assigned_to && assigned_to !== req.user.id) notify(assigned_to, req.locationId, 'assignment', 'Opportunity assigned to you', name, `/opportunities/${id}`);
  emit('opportunity.created', req.locationId, { opportunityId: id, contactId: contact_id, pipelineId: p.id, stageId: stage_id });
  res.json(serializeOpp(get('SELECT * FROM opportunities WHERE id = ?', id)));
}));

r.get('/:id', h((req, res) => {
  const o = get('SELECT o.*, u.name AS assignee_name FROM opportunities o LEFT JOIN users u ON u.id = o.assigned_to WHERE o.id = ? AND o.location_id = ?', req.params.id, req.locationId);
  if (!o) throw new HttpError(404, 'Opportunity not found');
  res.json(serializeOpp(o));
}));

r.put('/:id', h((req, res) => {
  const o = get('SELECT * FROM opportunities WHERE id = ? AND location_id = ?', req.params.id, req.locationId);
  if (!o) throw new HttpError(404, 'Opportunity not found');
  const data = { ...req.body, updated_at: now() };
  if (data.pipeline_id && Number(data.pipeline_id) !== o.pipeline_id && !data.stage_id) {
    data.stage_id = get('SELECT id FROM stages WHERE pipeline_id = ? ORDER BY position LIMIT 1', data.pipeline_id)?.id;
  }
  update('opportunities', o.id, data, ['name', 'value', 'status', 'source', 'assigned_to', 'lost_reason', 'stage_id', 'pipeline_id', 'contact_id', 'updated_at']);
  const n = get('SELECT * FROM opportunities WHERE id = ?', o.id);
  if (n.stage_id !== o.stage_id) {
    const s = get('SELECT name FROM stages WHERE id = ?', n.stage_id);
    logActivity(req.locationId, n.contact_id, req.user.id, 'opportunity', `"${n.name}" moved to ${s?.name}`);
    emit('opportunity.stage_changed', req.locationId, { opportunityId: n.id, contactId: n.contact_id, pipelineId: n.pipeline_id, stageId: n.stage_id });
  }
  if (n.status !== o.status) {
    logActivity(req.locationId, n.contact_id, req.user.id, 'opportunity', `"${n.name}" marked ${n.status}`);
    emit('opportunity.status_changed', req.locationId, { opportunityId: n.id, contactId: n.contact_id, status: n.status });
    if (n.status === 'won') run("UPDATE contacts SET type = 'customer' WHERE id = ?", n.contact_id);
  }
  if (n.assigned_to && n.assigned_to !== o.assigned_to && n.assigned_to !== req.user.id) {
    notify(n.assigned_to, req.locationId, 'assignment', 'Opportunity assigned to you', n.name, `/opportunities/${n.id}`);
  }
  emit('opportunity.updated', req.locationId, { opportunityId: n.id });
  res.json(serializeOpp(n));
}));

r.delete('/:id', h((req, res) => {
  run('DELETE FROM opportunities WHERE id = ? AND location_id = ?', req.params.id, req.locationId);
  emit('opportunity.updated', req.locationId, {});
  res.json({ ok: true });
}));

export default r;
