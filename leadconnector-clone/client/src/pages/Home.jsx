import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, Search, ChevronDown, Check, GripVertical, Pencil } from 'lucide-react';
import { api } from '../api.js';
import { useApp, useLive } from '../app-context.jsx';
import { Avatar, Sheet, Spinner, StatusBadge } from '../components/ui.jsx';
import ContactPicker from '../components/ContactPicker.jsx';
import { QUICK_ACTIONS, useQuickAction } from '../components/Layout.jsx';
import { fmtTime, money } from '../utils.js';

const DEFAULT_PINS = ['sms', 'call', 'contact', 'appointment', 'opportunity', 'task', 'scan', 'review'];

export default function Home() {
  const { user, setUser, location, locations, switchLocation, badges, toast } = useApp();
  const nav = useNavigate();
  const run = useQuickAction();
  const [d, setD] = useState(null);
  const [locSheet, setLocSheet] = useState(false);
  const [pending, setPending] = useState(null);
  const [editPins, setEditPins] = useState(false);
  const pins = (user.prefs.pins?.length ? user.prefs.pins : DEFAULT_PINS).map((k) => QUICK_ACTIONS.find((a) => a.key === k)).filter(Boolean);

  const load = () => api.get('/dashboard').then(setD).catch((e) => toast(e.message, 'error'));
  useEffect(() => { load(); }, []); // eslint-disable-line
  useLive(['message.created', 'opportunity.updated', 'appointment.created', 'task.updated', 'payment.received'], load);

  const tap = (a) => (a.pick ? setPending(a) : run(a.key));
  const savePins = async (keys) => {
    const r = await api.put('/auth/me', { prefs: { pins: keys } });
    setUser(r.user);
  };

  return (
    <div className="page">
      <header className="topbar">
        <button className="row grow" style={{ border: 0, background: 'none', padding: 0, textAlign: 'left' }} onClick={() => setLocSheet(true)}>
          <Avatar name={user.name} color={user.color} size={36} />
          <div className="grow">
            <div className="faint">Hi, {user.name.split(' ')[0]} 👋</div>
            <div className="bold row" style={{ gap: 4 }}><span className="ellipsis">{location?.name}</span> <ChevronDown size={16} /></div>
          </div>
        </button>
        <Link className="icon-btn" to="/search"><Search size={22} /></Link>
        <Link className="icon-btn" to="/notifications">
          <Bell size={22} />
          {badges.notifications ? <span className="count" style={{ position: 'absolute', top: 2, right: 2 }}>{badges.notifications}</span> : null}
        </Link>
      </header>

      <div className="container stack">
        <div className="card pad">
          <div className="row between" style={{ marginBottom: 12 }}>
            <div className="bold">Quick actions</div>
            <button className="btn ghost sm" onClick={() => setEditPins(true)}><Pencil size={14} /> Edit</button>
          </div>
          <div className="qa-grid">
            {pins.map((a) => (
              <button key={a.key} className="qa" onClick={() => tap(a)}>
                <span className="ic"><a.icon size={22} /></span>{a.label}
              </button>
            ))}
          </div>
        </div>

        {!d ? <Spinner /> : (
          <>
            <div className="grid2">
              <Link to="/conversations" className="card stat"><div className="l">Unread conversations</div><div className="v" style={{ color: 'var(--brand)' }}>{d.unread_conversations}</div></Link>
              <Link to="/opportunities" className="card stat"><div className="l">Pipeline value</div><div className="v">{money(d.pipeline_value)}</div><div className="faint">{d.open_opportunities} open</div></Link>
              <Link to="/payments" className="card stat"><div className="l">Revenue (30d)</div><div className="v" style={{ color: 'var(--success)' }}>{money(d.revenue_30d)}</div></Link>
              <Link to="/tasks" className="card stat"><div className="l">Tasks due</div><div className="v" style={{ color: d.tasks_due ? 'var(--danger)' : undefined }}>{d.tasks_due}</div></Link>
              <Link to="/contacts" className="card stat"><div className="l">New leads (30d)</div><div className="v">{d.new_contacts_30d}</div><div className="faint">{d.contacts} total</div></Link>
              <Link to="/reviews" className="card stat"><div className="l">Reviews</div><div className="v">{d.review_avg} ★</div><div className="faint">{d.review_count} reviews</div></Link>
            </div>

            {d.manual_actions > 0 && (
              <Link to="/manual-actions" className="card pad row between"><span className="bold">Manual actions waiting</span><span className="count">{d.manual_actions}</span></Link>
            )}

            <div className="card pad">
              <div className="row between"><div className="bold">Today's appointments</div><Link to="/calendars" className="small">View calendar</Link></div>
              {d.appointments_today.length === 0 && <div className="faint" style={{ paddingTop: 8 }}>No appointments today</div>}
              {d.appointments_today.map((a) => (
                <button key={a.id} className="list-item" style={{ padding: '10px 0' }} onClick={() => nav(`/calendars/appointments/${a.id}`)}>
                  <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: a.calendar?.color || 'var(--brand)' }} />
                  <div className="grow"><div className="title">{a.contact?.name || a.title}</div><div className="faint">{fmtTime(a.start_at)} – {fmtTime(a.end_at)} · {a.calendar?.name}</div></div>
                  <StatusBadge status={a.status} />
                </button>
              ))}
            </div>

            <div className="card pad">
              <div className="bold" style={{ marginBottom: 8 }}>Opportunities by stage</div>
              {d.pipeline_stages.map((s) => {
                const max = Math.max(1, ...d.pipeline_stages.map((x) => x.n));
                return (
                  <div key={s.name} className="bar-row" style={{ marginBottom: 6 }}>
                    <span style={{ width: 110 }} className="ellipsis">{s.name}</span>
                    <div className="bar"><i style={{ width: `${(s.n / max) * 100}%` }} /></div>
                    <span style={{ width: 80, textAlign: 'right' }} className="faint">{s.n} · {money(s.v)}</span>
                  </div>
                );
              })}
              <div className="row between faint" style={{ marginTop: 8 }}>
                <span>Won (30d): {d.won_30d} · {money(d.won_value_30d)}</span><span>Win rate {d.conversion_rate}%</span>
              </div>
            </div>

            <div className="card pad">
              <div className="bold" style={{ marginBottom: 8 }}>New leads — last 14 days</div>
              <div className="chart">
                {Array.from({ length: 14 }).map((_, i) => {
                  const day = new Date(Date.now() - (13 - i) * 86400e3).toISOString().slice(0, 10);
                  const n = d.leads_by_day.find((x) => x.d === day)?.n || 0;
                  const max = Math.max(1, ...d.leads_by_day.map((x) => x.n));
                  return <div key={day} title={`${day}: ${n}`} style={{ height: `${(n / max) * 100}%` }} />;
                })}
              </div>
              <div className="section-title">Lead sources</div>
              <div className="row wrap">{d.sources.map((s) => <span key={s.source} className="badge">{s.source} · {s.n}</span>)}</div>
            </div>

            {d.my_tasks.length > 0 && (
              <div className="card pad">
                <div className="row between"><div className="bold">My tasks</div><Link to="/tasks" className="small">All tasks</Link></div>
                {d.my_tasks.map((t) => (
                  <div key={t.id} className="row" style={{ padding: '8px 0' }}>
                    <span className="grow ellipsis">{t.title}</span>
                    <span className="faint" style={{ color: t.due_at && t.due_at < new Date().toISOString() ? 'var(--danger)' : undefined }}>{t.due_at ? new Date(t.due_at).toLocaleDateString() : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {locSheet && (
        <Sheet title="Switch account" onClose={() => setLocSheet(false)}>
          {locations.map((l) => (
            <button key={l.id} className="list-item" onClick={() => { setLocSheet(false); switchLocation(l.id); }}>
              <Avatar name={l.name} size={36} />
              <div className="grow"><div className="title">{l.name}</div><div className="faint">{l.role}</div></div>
              {l.id === location?.id && <Check color="var(--brand)" />}
            </button>
          ))}
          <Link className="btn block" style={{ marginTop: 12 }} to="/settings/business?new=1" onClick={() => setLocSheet(false)}>+ Add sub-account</Link>
        </Sheet>
      )}
      {pending && <ContactPicker title={pending.label} onClose={() => setPending(null)} onPick={(c) => { setPending(null); run(pending.key, c).catch((e) => toast(e.message, 'error')); }} />}
      {editPins && <PinEditor initial={pins.map((p) => p.key)} onClose={() => setEditPins(false)} onSave={savePins} />}
    </div>
  );
}

function PinEditor({ initial, onClose, onSave }) {
  const [keys, setKeys] = useState(initial);
  const [drag, setDrag] = useState(null);
  const toggle = (k) => setKeys(keys.includes(k) ? keys.filter((x) => x !== k) : keys.length >= 8 ? keys : [...keys, k]);
  const move = (from, to) => {
    const arr = [...keys];
    const [x] = arr.splice(from, 1);
    arr.splice(to, 0, x);
    setKeys(arr);
  };
  return (
    <Sheet title="Pinned shortcuts (max 8)" onClose={onClose} footer={<button className="btn primary block" onClick={() => { onSave(keys); onClose(); }}>Save</button>}>
      <div className="faint" style={{ marginBottom: 8 }}>Drag to reorder · tap to pin/unpin</div>
      {keys.map((k, i) => {
        const a = QUICK_ACTIONS.find((x) => x.key === k);
        return (
          <div key={k} className="list-item" draggable onDragStart={() => setDrag(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => { move(drag, i); setDrag(null); }}>
            <GripVertical size={18} color="var(--text-3)" />
            <a.icon size={18} color="var(--brand)" />
            <span className="grow">{a.label}</span>
            {i > 0 && <button className="btn sm" onClick={() => move(i, i - 1)}>↑</button>}
            <button className="btn sm" onClick={() => toggle(k)}>Unpin</button>
          </div>
        );
      })}
      <div className="section-title">Available</div>
      {QUICK_ACTIONS.filter((a) => !keys.includes(a.key)).map((a) => (
        <button key={a.key} className="list-item" onClick={() => toggle(a.key)}>
          <a.icon size={18} color="var(--text-3)" /><span className="grow">{a.label}</span><span className="small" style={{ color: 'var(--brand)' }}>Pin</span>
        </button>
      ))}
    </Sheet>
  );
}
