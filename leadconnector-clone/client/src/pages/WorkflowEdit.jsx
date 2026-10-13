import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Plus, Trash2, Zap } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../app-context.jsx';
import { Field, Sheet, Spinner, StatusBadge, Switch, TopBar } from '../components/ui.jsx';
import { CHANNEL_LABELS, fmtDateTime } from '../utils.js';

const FIELD_LABELS = {
  body: 'Message', subject: 'Subject', tag: 'Tag', title: 'Task title', due_in_hours: 'Due in (hours)', pipeline_id: 'Pipeline', stage_id: 'Stage',
  name: 'Opportunity name', value: 'Value', user_id: 'User', field: 'Contact field', channel: 'Type', instructions: 'Instructions',
  minutes: 'Wait (minutes)', url: 'Webhook URL',
};
const CONTACT_FIELDS = ['first_name', 'last_name', 'email', 'phone', 'company', 'source', 'type', 'city', 'country'];

export default function WorkflowEdit() {
  const { id } = useParams();
  const nav = useNavigate();
  const { team, isAdmin, toast } = useApp();
  const [w, setW] = useState(null);
  const [meta, setMeta] = useState(null);
  const [pipelines, setPipelines] = useState([]);
  const [calendars, setCalendars] = useState([]);
  const [customFields, setCustomFields] = useState([]);
  const [addSheet, setAddSheet] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    Promise.all([api.get(`/workflows/${id}`), api.get('/workflows/meta'), api.get('/opportunities/pipelines'), api.get('/calendars'), api.get('/contacts/custom-fields')])
      .then(([wf, m, p, c, cf]) => { setW(wf); setMeta(m); setPipelines(p); setCalendars(c); setCustomFields(cf); });
  }, [id]);
  if (!w || !meta) return <Spinner />;

  const upd = (patch) => { setW({ ...w, ...patch }); setDirty(true); };
  const setAction = (i, patch) => upd({ actions: w.actions.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  const moveAction = (i, d) => { const a = [...w.actions]; [a[i], a[i + d]] = [a[i + d], a[i]]; upd({ actions: a }); };
  const save = async (extra = {}) => {
    try {
      await api.put(`/workflows/${id}`, { name: w.name, trigger_type: w.trigger_type, trigger_config: w.trigger_config, actions: w.actions, status: w.status, ...extra });
      setDirty(false);
      toast('Workflow saved', 'success');
      setW(await api.get(`/workflows/${id}`));
    } catch (e) { toast(e.message, 'error'); }
  };

  const trig = meta.triggers[w.trigger_type];
  const pipelineOf = (pid) => pipelines.find((p) => String(p.id) === String(pid));

  const renderField = (a, i, f) => {
    const v = a[f] ?? '';
    const set = (val) => setAction(i, { [f]: val });
    if (f === 'body' || f === 'instructions') return <textarea className="input" value={v} onChange={(e) => set(e.target.value)} placeholder="Use {{contact.first_name}}, {{location.name}}, {{location.booking_link}}…" />;
    if (f === 'pipeline_id') return <select className="input" value={v} onChange={(e) => setAction(i, { pipeline_id: Number(e.target.value), stage_id: pipelineOf(e.target.value)?.stages[0]?.id })}><option value="">Select…</option>{pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>;
    if (f === 'stage_id') return <select className="input" value={v} onChange={(e) => set(Number(e.target.value))}>{pipelineOf(a.pipeline_id)?.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>;
    if (f === 'user_id') return <select className="input" value={v} onChange={(e) => set(e.target.value ? Number(e.target.value) : '')}><option value="">{a.type === 'internal_notification' ? 'All users' : 'Select…'}</option>{team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>;
    if (f === 'channel') return <select className="input" value={v || 'call'} onChange={(e) => set(e.target.value)}><option value="call">Call</option><option value="sms">SMS</option></select>;
    if (f === 'field') return <select className="input" value={v} onChange={(e) => set(e.target.value)}><option value="">Select…</option>{CONTACT_FIELDS.map((x) => <option key={x} value={x}>{x}</option>)}{customFields.map((c) => <option key={c.key} value={`custom.${c.key}`}>{c.name}</option>)}</select>;
    return <input className="input" type={['due_in_hours', 'value', 'minutes'].includes(f) ? 'number' : 'text'} value={v} onChange={(e) => set(e.target.value)} />;
  };

  return (
    <div className="page">
      <TopBar back="/workflows" title={w.name} sub={<StatusBadge status={w.status} />} right={isAdmin && <button className="btn primary sm" disabled={!dirty} onClick={() => save()}>Save</button>} />
      <div className="container stack">
        <div className="card pad stack">
          <Field label="Name"><input className="input" value={w.name} onChange={(e) => upd({ name: e.target.value })} /></Field>
          <div className="row between"><span className="bold">Published</span><Switch on={w.status === 'published'} onChange={(on) => save({ status: on ? 'published' : 'draft' })} /></div>
        </div>

        <div className="card pad stack" style={{ borderLeft: '4px solid var(--warning)' }}>
          <div className="row"><Zap size={18} color="var(--warning)" /><span className="bold">Trigger</span></div>
          <select className="input" value={w.trigger_type} onChange={(e) => upd({ trigger_type: e.target.value, trigger_config: {} })}>
            {Object.entries(meta.triggers).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
          </select>
          {trig.config?.includes('tag') && <Field label="Tag (blank = any)"><input className="input" value={w.trigger_config.tag || ''} onChange={(e) => upd({ trigger_config: { ...w.trigger_config, tag: e.target.value } })} /></Field>}
          {trig.config?.includes('channel') && <Field label="Channel"><select className="input" value={w.trigger_config.channel || ''} onChange={(e) => upd({ trigger_config: { ...w.trigger_config, channel: e.target.value } })}><option value="">Any</option>{Object.entries(CHANNEL_LABELS).filter(([k]) => !['comment', 'call'].includes(k)).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>}
          {trig.config?.includes('calendar_id') && <Field label="Calendar"><select className="input" value={w.trigger_config.calendar_id || ''} onChange={(e) => upd({ trigger_config: { ...w.trigger_config, calendar_id: e.target.value } })}><option value="">Any</option>{calendars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>}
          {trig.config?.includes('pipeline_id') && <Field label="Pipeline"><select className="input" value={w.trigger_config.pipeline_id || ''} onChange={(e) => upd({ trigger_config: { ...w.trigger_config, pipeline_id: e.target.value, stage_id: '' } })}><option value="">Any</option>{pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>}
          {trig.config?.includes('stage_id') && w.trigger_config.pipeline_id && <Field label="Stage"><select className="input" value={w.trigger_config.stage_id || ''} onChange={(e) => upd({ trigger_config: { ...w.trigger_config, stage_id: e.target.value } })}><option value="">Any</option>{pipelineOf(w.trigger_config.pipeline_id)?.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
          {trig.config?.includes('status') && <Field label="Status"><select className="input" value={w.trigger_config.status || ''} onChange={(e) => upd({ trigger_config: { ...w.trigger_config, status: e.target.value } })}><option value="">Any</option>{(w.trigger_type === 'appointment_status' ? ['confirmed', 'showed', 'noshow', 'cancelled'] : ['open', 'won', 'lost', 'abandoned']).map((s) => <option key={s}>{s}</option>)}</select></Field>}
          {trig.config?.includes('max_rating') && <Field label="Only ratings at or below"><select className="input" value={w.trigger_config.max_rating || ''} onChange={(e) => upd({ trigger_config: { ...w.trigger_config, max_rating: e.target.value } })}><option value="">Any rating</option>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}★</option>)}</select></Field>}
        </div>

        {w.actions.map((a, i) => (
          <div key={i}>
            <div style={{ textAlign: 'center' }}><ArrowDown size={18} color="var(--text-3)" /></div>
            <div className="card pad stack">
              <div className="row">
                <span className="badge blue">{i + 1}</span>
                <span className="bold grow">{meta.actions[a.type]?.label}</span>
                {i > 0 && <button className="icon-btn" onClick={() => moveAction(i, -1)}><ArrowUp size={16} /></button>}
                {i < w.actions.length - 1 && <button className="icon-btn" onClick={() => moveAction(i, 1)}><ArrowDown size={16} /></button>}
                <button className="icon-btn" onClick={() => upd({ actions: w.actions.filter((_, j) => j !== i) })}><Trash2 size={16} /></button>
              </div>
              {meta.actions[a.type]?.fields.map((f) => <Field key={f} label={FIELD_LABELS[f] || f}>{renderField(a, i, f)}</Field>)}
            </div>
          </div>
        ))}
        <button className="btn" onClick={() => setAddSheet(true)}><Plus size={16} /> Add action</button>

        <div className="section-title">Execution log</div>
        <div className="card">
          {w.logs.length === 0 && <div className="faint" style={{ padding: 14 }}>No runs yet</div>}
          {w.logs.map((l) => (
            <div key={l.id} className="list-item">
              <span className={`badge ${l.status === 'success' ? 'green' : l.status === 'error' ? 'red' : 'blue'}`}>{l.status}</span>
              <div className="grow"><div className="small bold">{l.action} {l.contact_name ? `· ${l.contact_name}` : ''}</div><div className="faint">{l.detail} · {fmtDateTime(l.created_at)}</div></div>
            </div>
          ))}
        </div>
        {isAdmin && <button className="btn block" style={{ color: 'var(--danger)' }} onClick={async () => { if (confirm('Delete workflow?')) { await api.del(`/workflows/${id}`); nav('/workflows'); } }}><Trash2 size={16} /> Delete workflow</button>}
      </div>
      {addSheet && (
        <Sheet title="Add action" onClose={() => setAddSheet(false)}>
          {Object.entries(meta.actions).map(([k, a]) => (
            <button key={k} className="list-item" onClick={() => { upd({ actions: [...w.actions, { type: k }] }); setAddSheet(false); }}>{a.label}</button>
          ))}
        </Sheet>
      )}
    </div>
  );
}
