import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Trash2, MessageSquare, User } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../app-context.jsx';
import { Field, Spinner, TopBar, UserSelect } from '../components/ui.jsx';
import ContactPicker from '../components/ContactPicker.jsx';
import { fmtTime, toLocalInput, fromLocalInput, ymd } from '../utils.js';

const STATUSES = [['confirmed', 'Confirmed'], ['showed', 'Showed'], ['noshow', 'No-show'], ['cancelled', 'Cancelled']];

export default function AppointmentForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { user, toast } = useApp();
  const isBlock = params.get('block') === '1';
  const [cals, setCals] = useState([]);
  const [form, setForm] = useState(null);
  const [contact, setContact] = useState(null);
  const [pick, setPick] = useState(false);
  const [date, setDate] = useState(params.get('date') || ymd(params.get('start') || new Date()));
  const [slots, setSlots] = useState(null);
  const [custom, setCustom] = useState(!!params.get('start') || isBlock);

  useEffect(() => {
    (async () => {
      const cs = await api.get('/calendars');
      setCals(cs);
      if (id) {
        const a = await api.get(`/calendars/appointments/${id}`);
        setForm({ ...a, start: toLocalInput(a.start_at), end: toLocalInput(a.end_at) });
        setContact(a.contact);
        setCustom(true);
      } else {
        const start = params.get('start') || new Date(`${date}T${isBlock ? '12:00' : '09:00'}`).toISOString();
        const dur = (cs[0]?.slot_duration || 30) * 60e3;
        setForm({
          calendar_id: cs[0]?.id, title: isBlock ? 'Blocked' : '', notes: '', status: 'confirmed', assigned_to: user.id, is_block: isBlock,
          start: toLocalInput(start), end: toLocalInput(new Date(new Date(start).getTime() + (isBlock ? 3600e3 : dur))), slot: null, location_text: '',
        });
        if (params.get('contact')) setContact(await api.get(`/contacts/${params.get('contact')}`));
      }
    })().catch((e) => toast(e.message, 'error'));
  }, [id]); // eslint-disable-line

  useEffect(() => {
    if (!form?.calendar_id || custom || id) return;
    setSlots(null);
    api.get(`/calendars/${form.calendar_id}/slots`, { date }).then(setSlots).catch(() => setSlots([]));
  }, [form?.calendar_id, date, custom]); // eslint-disable-line

  if (!form) return <Spinner />;
  const cal = cals.find((c) => c.id === Number(form.calendar_id));

  const save = async (e) => {
    e?.preventDefault();
    try {
      if (id) {
        await api.put(`/calendars/appointments/${id}`, {
          title: form.title, notes: form.notes, status: form.status, assigned_to: form.assigned_to, calendar_id: form.calendar_id,
          start_at: fromLocalInput(form.start), end_at: fromLocalInput(form.end), location_text: form.location_text,
        });
      } else {
        if (!form.is_block && !contact) return toast('Select a contact', 'error');
        const start_at = custom ? fromLocalInput(form.start) : form.slot;
        if (!start_at) return toast('Pick a time slot', 'error');
        await api.post('/calendars/appointments', {
          calendar_id: form.calendar_id, contact_id: contact?.id, start_at,
          end_at: custom ? fromLocalInput(form.end) : undefined, title: form.title || undefined, notes: form.notes,
          assigned_to: form.assigned_to, is_block: form.is_block, location_text: form.location_text, allow_overlap: custom,
        });
      }
      toast('Saved', 'success');
      nav(`/calendars?date=${custom ? form.start.slice(0, 10) : date}`);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const setStatus = async (status) => {
    setForm({ ...form, status });
    if (id) {
      await api.put(`/calendars/appointments/${id}`, { status });
      toast(`Marked ${status}`, 'success');
    }
  };

  return (
    <form className="page" onSubmit={save}>
      <TopBar back title={id ? (form.is_block ? 'Blocked time' : 'Appointment') : form.is_block ? 'Block off time' : 'Book appointment'} right={<button className="btn primary sm">Save</button>} />
      <div className="container stack">
        {!form.is_block && (
          <div className="card pad stack">
            <Field label="Contact">
              <div className="row">
                <button type="button" className="input" style={{ textAlign: 'left' }} onClick={() => !id && setPick(true)}>{contact ? contact.name : 'Select contact…'}</button>
                {contact && <Link className="icon-btn" to={`/contacts/${contact.id}`}><User size={18} /></Link>}
                {contact && id && <button type="button" className="icon-btn" onClick={async () => { const c = await api.post('/conversations', { contact_id: contact.id }); nav(`/conversations/${c.id}`); }}><MessageSquare size={18} /></button>}
              </div>
            </Field>
            {id && (
              <Field label="Status">
                <div className="row wrap" style={{ gap: 6 }}>
                  {STATUSES.map(([v, l]) => <button type="button" key={v} className={`tab ${form.status === v ? 'active' : ''}`} onClick={() => setStatus(v)}>{l}</button>)}
                </div>
              </Field>
            )}
          </div>
        )}
        <div className="card pad stack">
          <Field label="Calendar">
            <select className="input" value={form.calendar_id || ''} onChange={(e) => setForm({ ...form, calendar_id: Number(e.target.value), slot: null })}>
              {form.is_block && <option value="">All calendars</option>}
              {cals.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.slot_duration} min)</option>)}
            </select>
          </Field>
          <Field label="Title"><input className="input" value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={cal ? `${cal.name} with …` : ''} /></Field>
          {!id && !form.is_block && (
            <div className="seg" style={{ alignSelf: 'flex-start' }}>
              <button type="button" className={!custom ? 'active' : ''} onClick={() => setCustom(false)}>Available slots</button>
              <button type="button" className={custom ? 'active' : ''} onClick={() => setCustom(true)}>Custom time</button>
            </div>
          )}
          {!custom ? (
            <>
              <Field label="Date"><input className="input" type="date" value={date} min={ymd(new Date())} onChange={(e) => setDate(e.target.value)} /></Field>
              {!slots ? <Spinner /> : slots.length === 0 ? <div className="faint">No availability on this day.</div> : (
                <div className="slot-grid">
                  {slots.map((s) => <button type="button" key={s} className={`slot ${form.slot === s ? 'active' : ''}`} onClick={() => setForm({ ...form, slot: s })}>{fmtTime(s)}</button>)}
                </div>
              )}
            </>
          ) : (
            <div className="grid2">
              <Field label="Start"><input className="input" type="datetime-local" value={form.start} onChange={(e) => {
                const dur = new Date(form.end) - new Date(form.start);
                setForm({ ...form, start: e.target.value, end: toLocalInput(new Date(new Date(e.target.value).getTime() + (dur > 0 ? dur : 1800e3))) });
              }} /></Field>
              <Field label="End"><input className="input" type="datetime-local" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></Field>
            </div>
          )}
        </div>
        <div className="card pad stack">
          {!form.is_block && <Field label="Meeting location / link"><input className="input" value={form.location_text || ''} onChange={(e) => setForm({ ...form, location_text: e.target.value })} placeholder="Office, phone, Zoom/Meet link…" /></Field>}
          <Field label="Team member"><UserSelect value={form.assigned_to} onChange={(v) => setForm({ ...form, assigned_to: v })} allowEmpty={false} /></Field>
          <Field label="Notes"><textarea className="input" value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        </div>
        <button className="btn primary block">Save</button>
        {id && <button type="button" className="btn block" style={{ color: 'var(--danger)' }} onClick={async () => { if (confirm('Delete this appointment?')) { await api.del(`/calendars/appointments/${id}`); nav('/calendars'); } }}><Trash2 size={16} /> Delete</button>}
      </div>
      {pick && <ContactPicker onClose={() => setPick(false)} onPick={(c) => { setContact(c); setPick(false); }} />}
    </form>
  );
}
