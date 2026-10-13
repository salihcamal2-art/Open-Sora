import { useEffect, useState } from 'react';
import { Plus, Trash2, Copy } from 'lucide-react';
import { api } from '../../api.js';
import { useApp } from '../../app-context.jsx';
import { Field, Sheet, Spinner, TopBar, UserSelect } from '../../components/ui.jsx';

const DAYS = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']];
const BLANK = {
  name: '', description: '', color: '#155EEF', slot_duration: 30, buffer: 0,
  availability: { mon: [['09:00', '17:00']], tue: [['09:00', '17:00']], wed: [['09:00', '17:00']], thu: [['09:00', '17:00']], fri: [['09:00', '17:00']], sat: [], sun: [] },
};

export default function CalendarSettings() {
  const { toast } = useApp();
  const [items, setItems] = useState(null);
  const [edit, setEdit] = useState(null);
  const load = () => api.get('/calendars').then(setItems);
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      if (edit.id) await api.put(`/calendars/${edit.id}`, edit);
      else await api.post('/calendars', edit);
      setEdit(null); load(); toast('Calendar saved', 'success');
    } catch (e) { toast(e.message, 'error'); }
  };
  const setDay = (d, ranges) => setEdit({ ...edit, availability: { ...edit.availability, [d]: ranges } });
  const copy = async (c) => {
    const url = `${window.location.origin}/book/${c.slug}`;
    try { await navigator.clipboard.writeText(url); toast('Booking link copied', 'success'); } catch { prompt('Booking link', url); }
  };

  return (
    <div className="page">
      <TopBar back title="Calendars" right={<button className="icon-btn" onClick={() => setEdit(JSON.parse(JSON.stringify(BLANK)))}><Plus size={22} /></button>} />
      {!items ? <Spinner /> : (
        <div className="list" style={{ marginTop: 12 }}>
          {items.map((c) => (
            <div key={c.id} className="list-item">
              <span className="ch-dot" style={{ background: c.color, width: 12, height: 12 }} />
              <button className="grow" style={{ background: 'none', border: 0, textAlign: 'left', padding: 0 }} onClick={() => setEdit(JSON.parse(JSON.stringify(c)))}>
                <div className="title">{c.name}</div><div className="faint">{c.slot_duration} min · /book/{c.slug}</div>
              </button>
              <button className="icon-btn" onClick={() => copy(c)}><Copy size={16} /></button>
            </div>
          ))}
        </div>
      )}
      {edit && (
        <Sheet title={edit.id ? 'Edit calendar' : 'New calendar'} onClose={() => setEdit(null)} wide footer={
          <>
            {edit.id && <button className="btn" onClick={async () => { if (confirm('Delete calendar and its appointments?')) { await api.del(`/calendars/${edit.id}`); setEdit(null); load(); } }}><Trash2 size={16} /></button>}
            <button className="btn primary grow" onClick={save}>Save</button>
          </>
        }>
          <div className="stack">
            <Field label="Name"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Description"><input className="input" value={edit.description || ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <div className="grid2">
              <Field label="Duration (min)"><input className="input" type="number" min="5" step="5" value={edit.slot_duration} onChange={(e) => setEdit({ ...edit, slot_duration: Number(e.target.value) })} /></Field>
              <Field label="Buffer (min)"><input className="input" type="number" min="0" step="5" value={edit.buffer} onChange={(e) => setEdit({ ...edit, buffer: Number(e.target.value) })} /></Field>
              <Field label="Color"><input className="input" type="color" value={edit.color} onChange={(e) => setEdit({ ...edit, color: e.target.value })} style={{ height: 44 }} /></Field>
              <Field label="Owner"><UserSelect value={edit.owner_id} onChange={(v) => setEdit({ ...edit, owner_id: v })} allowEmpty={false} /></Field>
            </div>
            <div className="bold">Weekly availability</div>
            {DAYS.map(([d, label]) => {
              const ranges = edit.availability[d] || [];
              return (
                <div key={d} className="row" style={{ alignItems: 'flex-start', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                  <label className="row" style={{ width: 120 }}><input type="checkbox" checked={ranges.length > 0} onChange={(e) => setDay(d, e.target.checked ? [['09:00', '17:00']] : [])} /> {label}</label>
                  <div className="grow stack" style={{ gap: 6 }}>
                    {ranges.length === 0 && <span className="faint">Unavailable</span>}
                    {ranges.map(([a, b], i) => (
                      <div key={i} className="row">
                        <input className="input" type="time" value={a} onChange={(e) => setDay(d, ranges.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))} />
                        <span>–</span>
                        <input className="input" type="time" value={b} onChange={(e) => setDay(d, ranges.map((r, j) => (j === i ? [r[0], e.target.value] : r)))} />
                        <button className="icon-btn" onClick={() => setDay(d, ranges.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
                      </div>
                    ))}
                    {ranges.length > 0 && <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setDay(d, [...ranges, ['18:00', '20:00']])}>+ Add hours</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </Sheet>
      )}
    </div>
  );
}
