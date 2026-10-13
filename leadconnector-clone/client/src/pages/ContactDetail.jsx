import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Phone, MessageSquare, Mail, CalendarPlus, DollarSign, MoreVertical, Pencil, Trash2, Star, Workflow, X, Plus, MessagesSquare, Target, FileText,
} from 'lucide-react';
import { api } from '../api.js';
import { useApp, useLive } from '../app-context.jsx';
import { Avatar, Field, Sheet, Spinner, StatusBadge, Switch, Tabs, TopBar, Empty } from '../components/ui.jsx';
import { useQuickAction } from '../components/Layout.jsx';
import { CHANNEL_LABELS, fmtDateTime, money, timeAgo, toLocalInput, fromLocalInput } from '../utils.js';

const TABS = ['details', 'activity', 'notes', 'tasks', 'appointments', 'opportunities', 'payments'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }));

export default function ContactDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const run = useQuickAction();
  const { toast } = useApp();
  const [c, setC] = useState(null);
  const [tab, setTab] = useState('details');
  const [fields, setFields] = useState([]);
  const [sheet, setSheet] = useState(null);

  const load = () => api.get(`/contacts/${id}`).then(setC).catch((e) => { toast(e.message, 'error'); nav('/contacts'); });
  useEffect(() => { load(); api.get('/contacts/custom-fields').then(setFields); }, [id]); // eslint-disable-line
  useLive(['contact.updated'], (e) => { if (!e.payload.contactId || e.payload.contactId === Number(id)) load(); });

  if (!c) return <Spinner />;
  const quick = (k) => run(k, c).catch((e) => toast(e.message, 'error'));

  const setDnd = async (ch, on) => {
    const body = ch === 'all' ? { dnd_all: on } : { dnd: { ...c.dnd, [ch]: on } };
    setC(await api.put(`/contacts/${id}`, body).then((r) => ({ ...c, ...r })));
  };
  const removeTag = async (t) => setC({ ...c, ...(await api.del(`/contacts/${id}/tags/${encodeURIComponent(t)}`)) });

  return (
    <div className="page">
      <TopBar back title="" right={
        <>
          <Link className="icon-btn" to={`/contacts/${id}/edit`}><Pencil size={20} /></Link>
          <button className="icon-btn" onClick={() => setSheet('menu')}><MoreVertical size={20} /></button>
        </>
      } />
      <div style={{ background: 'var(--surface)', padding: '0 16px 16px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}><Avatar name={c.name} size={72} /></div>
        <h2 style={{ marginTop: 8 }}>{c.name}</h2>
        <div className="faint">{[c.job_title, c.company].filter(Boolean).join(' at ')}</div>
        <div className="row wrap" style={{ justifyContent: 'center', gap: 6, marginTop: 8 }}>
          <StatusBadge status={c.type === 'customer' ? 'won' : 'open'} />
          {c.dnd_all && <span className="badge red">DND</span>}
          {c.tags.map((t) => <span key={t} className="tag-chip">{t}<button onClick={() => removeTag(t)}><X size={12} /></button></span>)}
          <button className="tag-chip" style={{ border: 0 }} onClick={() => setSheet('tag')}><Plus size={12} /> Tag</button>
        </div>
        <div className="row" style={{ justifyContent: 'center', gap: 14, marginTop: 14 }}>
          {[['call', Phone, 'Call', !c.phone], ['sms', MessageSquare, 'SMS', !c.phone], ['email', Mail, 'Email', !c.email], ['appointment', CalendarPlus, 'Book'], ['payment', DollarSign, 'Charge']].map(([k, I, l, dis]) => (
            <button key={k} className="qa" disabled={dis} style={{ opacity: dis ? 0.4 : 1 }} onClick={() => quick(k)}>
              <span className="ic" style={{ width: 46, height: 46 }}><I size={20} /></span>{l}
            </button>
          ))}
        </div>
        {c.conversation_id && <Link className="btn sm" style={{ marginTop: 12 }} to={`/conversations/${c.conversation_id}`}><MessagesSquare size={14} /> Open conversation</Link>}
      </div>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      <div className="container">
        {tab === 'details' && <Details c={c} fields={fields} setDnd={setDnd} />}
        {tab === 'activity' && <Activity id={id} />}
        {tab === 'notes' && <Notes id={id} />}
        {tab === 'tasks' && <Tasks id={id} />}
        {tab === 'appointments' && <Appointments id={id} />}
        {tab === 'opportunities' && <Opps id={id} />}
        {tab === 'payments' && <Invoices id={id} />}
      </div>

      {sheet === 'menu' && (
        <Sheet title={c.name} onClose={() => setSheet(null)}>
          <div className="menu-list">
            <button className="list-item" onClick={() => nav(`/contacts/${id}/edit`)}><Pencil size={18} /> Edit contact</button>
            <button className="list-item" onClick={() => { setSheet(null); quick('review'); }}><Star size={18} /> Send review request</button>
            <button className="list-item" onClick={() => nav(`/opportunities/new?contact=${id}`)}><Target size={18} /> Add opportunity</button>
            <button className="list-item" onClick={() => nav(`/payments/invoices/new?contact=${id}`)}><FileText size={18} /> Create invoice</button>
            <button className="list-item" onClick={() => setSheet('workflow')}><Workflow size={18} /> Add to workflow</button>
            <button className="list-item" onClick={async () => { if (confirm('Delete this contact permanently?')) { await api.del(`/contacts/${id}`); nav('/contacts'); } }}><Trash2 size={18} color="var(--danger)" /> Delete contact</button>
          </div>
        </Sheet>
      )}
      {sheet === 'tag' && <AddTag id={id} onClose={() => setSheet(null)} onDone={(r) => { setC({ ...c, ...r }); setSheet(null); }} />}
      {sheet === 'workflow' && <AddToWorkflow id={id} onClose={() => setSheet(null)} />}
    </div>
  );
}

function Row({ label, value, href }) {
  if (!value) return null;
  return (
    <div className="row between" style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <span className="faint">{label}</span>
      {href ? <a href={href} className="ellipsis" style={{ maxWidth: '65%' }}>{value}</a> : <span className="ellipsis" style={{ maxWidth: '65%', textAlign: 'right' }}>{value}</span>}
    </div>
  );
}

function Details({ c, fields, setDnd }) {
  const { team } = useApp();
  const addr = [c.address, c.city, c.state, c.postal_code, c.country].filter(Boolean).join(', ');
  return (
    <div className="stack">
      <div className="card pad">
        <Row label="Phone" value={c.phone} href={`tel:${c.phone}`} />
        <Row label="Email" value={c.email} href={`mailto:${c.email}`} />
        <Row label="Company" value={c.company} />
        <Row label="Website" value={c.website} href={c.website} />
        <Row label="Address" value={addr} href={addr ? `https://maps.google.com/?q=${encodeURIComponent(addr)}` : null} />
        <Row label="Date of birth" value={c.date_of_birth} />
        <Row label="Source" value={c.source} />
        <Row label="Assigned to" value={team.find((u) => u.id === c.assigned_to)?.name || 'Unassigned'} />
        <Row label="Created" value={fmtDateTime(c.created_at)} />
        <Row label="Last activity" value={timeAgo(c.last_activity)} />
      </div>
      {fields.length > 0 && (
        <div className="card pad">
          <div className="bold" style={{ marginBottom: 4 }}>Custom fields</div>
          {fields.map((f) => <Row key={f.id} label={f.name} value={String(c.custom[f.key] ?? '—')} />)}
        </div>
      )}
      <div className="card pad">
        <div className="bold" style={{ marginBottom: 4 }}>Do Not Disturb</div>
        <div className="row between" style={{ padding: '8px 0' }}><span>All channels</span><Switch on={c.dnd_all} onChange={(v) => setDnd('all', v)} /></div>
        {['sms', 'email', 'whatsapp', 'call', 'facebook', 'gmb'].map((ch) => (
          <div key={ch} className="row between" style={{ padding: '8px 0', opacity: c.dnd_all ? 0.5 : 1 }}>
            <span>{CHANNEL_LABELS[ch]}</span><Switch on={!!c.dnd[ch]} onChange={(v) => setDnd(ch, v)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Activity({ id }) {
  const [items, setItems] = useState(null);
  useEffect(() => { api.get(`/contacts/${id}/activity`).then(setItems); }, [id]);
  if (!items) return <Spinner />;
  if (!items.length) return <Empty title="No activity yet" />;
  return (
    <div className="card pad">
      {items.map((a) => (
        <div key={a.id} className="row" style={{ alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
          <span className="ch-dot" style={{ background: 'var(--brand)', marginTop: 7 }} />
          <div className="grow"><div className="small">{a.description}</div><div className="faint">{fmtDateTime(a.created_at)}{a.user_name ? ` · ${a.user_name}` : ''}</div></div>
        </div>
      ))}
    </div>
  );
}

function Notes({ id }) {
  const [items, setItems] = useState(null);
  const [body, setBody] = useState('');
  const load = () => api.get(`/contacts/${id}/notes`).then(setItems);
  useEffect(() => { load(); }, [id]); // eslint-disable-line
  const add = async () => { if (!body.trim()) return; await api.post(`/contacts/${id}/notes`, { body }); setBody(''); load(); };
  return (
    <div className="stack">
      <div className="card pad stack">
        <textarea className="input" placeholder="Write a note…" value={body} onChange={(e) => setBody(e.target.value)} />
        <button className="btn primary" onClick={add}>Add note</button>
      </div>
      {items?.map((n) => (
        <div key={n.id} className="card pad">
          <div style={{ whiteSpace: 'pre-wrap' }}>{n.body}</div>
          <div className="row between faint" style={{ marginTop: 6 }}>
            <span>{n.user_name || 'System'} · {fmtDateTime(n.created_at)}</span>
            <button className="btn ghost sm" onClick={async () => { await api.del(`/contacts/${id}/notes/${n.id}`); load(); }}><Trash2 size={14} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Tasks({ id }) {
  const [items, setItems] = useState(null);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState(toLocalInput(new Date(Date.now() + 86400e3)));
  const load = () => api.get(`/contacts/${id}/tasks`).then(setItems);
  useEffect(() => { load(); }, [id]); // eslint-disable-line
  const add = async () => { if (!title) return; await api.post(`/contacts/${id}/tasks`, { title, due_at: fromLocalInput(due) }); setTitle(''); load(); };
  const toggle = async (t) => { await api.put(`/tasks/${t.id}`, { completed: !t.completed }); load(); };
  return (
    <div className="stack">
      <div className="card pad stack">
        <input className="input" placeholder="New task" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="row"><input className="input" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /><button className="btn primary" onClick={add}>Add</button></div>
      </div>
      <div className="card">
        {items?.map((t) => (
          <div key={t.id} className="list-item">
            <button className={`check ${t.completed ? 'on' : ''}`} onClick={() => toggle(t)}>{t.completed ? '✓' : ''}</button>
            <div className="grow"><div style={{ textDecoration: t.completed ? 'line-through' : 'none' }}>{t.title}</div><div className="faint">{t.due_at ? fmtDateTime(t.due_at) : 'No due date'}{t.assignee_name ? ` · ${t.assignee_name}` : ''}</div></div>
          </div>
        ))}
        {items?.length === 0 && <Empty title="No tasks" />}
      </div>
    </div>
  );
}

function Appointments({ id }) {
  const nav = useNavigate();
  const [items, setItems] = useState(null);
  useEffect(() => { api.get(`/contacts/${id}/appointments`).then(setItems); }, [id]);
  return (
    <div className="stack">
      <Link className="btn primary" to={`/calendars/new?contact=${id}`}><CalendarPlus size={16} /> Book appointment</Link>
      <div className="card">
        {items?.map((a) => (
          <button key={a.id} className="list-item" onClick={() => nav(`/calendars/appointments/${a.id}`)}>
            <div className="grow"><div className="title">{a.title}</div><div className="faint">{fmtDateTime(a.start_at)} · {a.calendar?.name}</div></div>
            <StatusBadge status={a.status} />
          </button>
        ))}
        {items?.length === 0 && <Empty title="No appointments" />}
      </div>
    </div>
  );
}

function Opps({ id }) {
  const nav = useNavigate();
  const [items, setItems] = useState(null);
  useEffect(() => { api.get(`/contacts/${id}/opportunities`).then(setItems); }, [id]);
  return (
    <div className="stack">
      <Link className="btn primary" to={`/opportunities/new?contact=${id}`}><Plus size={16} /> Add opportunity</Link>
      <div className="card">
        {items?.map((o) => (
          <button key={o.id} className="list-item" onClick={() => nav(`/opportunities/${o.id}`)}>
            <div className="grow"><div className="title">{o.name}</div><div className="faint">{o.pipeline_name} · {o.stage_name}</div></div>
            <div style={{ textAlign: 'right' }}><div className="bold">{money(o.value)}</div><StatusBadge status={o.status} /></div>
          </button>
        ))}
        {items?.length === 0 && <Empty title="No opportunities" />}
      </div>
    </div>
  );
}

function Invoices({ id }) {
  const nav = useNavigate();
  const [items, setItems] = useState(null);
  useEffect(() => { api.get(`/contacts/${id}/invoices`).then(setItems); }, [id]);
  return (
    <div className="stack">
      <div className="row">
        <Link className="btn primary grow" to={`/payments/invoices/new?contact=${id}`}><FileText size={16} /> New invoice</Link>
        <Link className="btn grow" to={`/payments/pos?contact=${id}`}><DollarSign size={16} /> Collect payment</Link>
      </div>
      <div className="card">
        {items?.map((i) => (
          <button key={i.id} className="list-item" onClick={() => nav(`/payments/invoices/${i.id}`)}>
            <div className="grow"><div className="title">{i.number}</div><div className="faint">{i.title} · due {i.due_date || '—'}</div></div>
            <div style={{ textAlign: 'right' }}><div className="bold">{money(i.total)}</div><StatusBadge status={i.status} /></div>
          </button>
        ))}
        {items?.length === 0 && <Empty title="No invoices" />}
      </div>
    </div>
  );
}

function AddTag({ id, onClose, onDone }) {
  const [tags, setTags] = useState([]);
  const [v, setV] = useState('');
  useEffect(() => { api.get('/contacts/tags').then(setTags); }, []);
  const add = async (t) => onDone(await api.post(`/contacts/${id}/tags`, { tags: [t] }));
  return (
    <Sheet title="Add tag" onClose={onClose}>
      <div className="row" style={{ marginBottom: 10 }}>
        <input className="input" autoFocus placeholder="Type a tag" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && v && add(v)} />
        <button className="btn primary" disabled={!v} onClick={() => add(v)}>Add</button>
      </div>
      <div className="row wrap" style={{ gap: 6 }}>
        {tags.filter((t) => t.name.includes(v.toLowerCase())).map((t) => <button key={t.id} className="tab" onClick={() => add(t.name)}>{t.name}</button>)}
      </div>
    </Sheet>
  );
}

function AddToWorkflow({ id, onClose }) {
  const { toast } = useApp();
  const [wfs, setWfs] = useState([]);
  useEffect(() => { api.get('/workflows').then(setWfs); }, []);
  return (
    <Sheet title="Add to workflow" onClose={onClose}>
      {wfs.map((w) => (
        <button key={w.id} className="list-item" onClick={async () => { const r = await api.post(`/contacts/${id}/workflows/${w.id}`, {}); toast(r.message, 'success'); onClose(); }}>
          <Workflow size={18} color="var(--brand)" /><span className="grow">{w.name}</span><StatusBadge status={w.status} />
        </button>
      ))}
      {wfs.length === 0 && <Field label=""><div className="faint">No workflows yet.</div></Field>}
    </Sheet>
  );
}
