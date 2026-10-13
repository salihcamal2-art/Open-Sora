import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Clock } from 'lucide-react';
import { api } from '../../api.js';
import { Spinner } from '../../components/ui.jsx';
import { fmtDate, fmtTime, ymd } from '../../utils.js';

/** Public booking widget: /book/:slug */
export default function BookPage() {
  const { slug } = useParams();
  const [cal, setCal] = useState(null);
  const [err, setErr] = useState('');
  const [date, setDate] = useState(ymd(new Date()));
  const [slots, setSlots] = useState(null);
  const [slot, setSlot] = useState(null);
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', phone: '', notes: '' });
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get(`/public/calendars/${slug}`).then(setCal).catch((e) => setErr(e.message)); }, [slug]);
  useEffect(() => { setSlots(null); setSlot(null); api.get(`/public/calendars/${slug}/slots`, { date }).then(setSlots).catch(() => setSlots([])); }, [slug, date]);

  const days = Array.from({ length: 14 }, (_, i) => new Date(Date.now() + i * 86400e3));
  const book = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.post(`/public/calendars/${slug}/book`, { ...form, start_at: slot });
      setDone(r.appointment);
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };

  if (err && !cal) return <div className="public-wrap"><div className="card pad public-card">{err}</div></div>;
  if (!cal) return <Spinner />;
  if (done) {
    return (
      <div className="public-wrap"><div className="card pad public-card" style={{ textAlign: 'center' }}>
        <CheckCircle2 size={64} color="var(--success)" />
        <h2>You're booked!</h2>
        <p>{cal.name} with {cal.location.name}</p>
        <p className="bold">{fmtDate(done.start_at)} · {fmtTime(done.start_at)} – {fmtTime(done.end_at)}</p>
        <p className="faint">A confirmation has been sent. See you soon!</p>
      </div></div>
    );
  }

  return (
    <div className="public-wrap">
      <div className="card public-card">
        <div className="pad" style={{ borderBottom: '1px solid var(--border)', padding: 18 }}>
          <div className="faint">{cal.location.name}</div>
          <h2>{cal.name}</h2>
          <div className="row faint" style={{ gap: 6 }}><Clock size={14} /> {cal.slot_duration} min</div>
          {cal.description && <p className="muted">{cal.description}</p>}
        </div>
        {!slot ? (
          <div style={{ padding: 18 }} className="stack">
            <div className="bold">Select a date</div>
            <div className="row" style={{ overflowX: 'auto', gap: 8, paddingBottom: 4 }}>
              {days.map((d) => (
                <button key={ymd(d)} className={`day-btn ${ymd(d) === date ? 'active' : ''}`} style={{ minWidth: 54, border: '1px solid var(--border)' }} onClick={() => setDate(ymd(d))}>
                  {d.toLocaleDateString([], { weekday: 'short' })}<b>{d.getDate()}</b>
                </button>
              ))}
            </div>
            <div className="bold">Available times</div>
            {!slots ? <Spinner /> : slots.length === 0 ? <div className="faint">No times available — try another day.</div> : (
              <div className="slot-grid">{slots.map((s) => <button key={s} className="slot" onClick={() => setSlot(s)}>{fmtTime(s)}</button>)}</div>
            )}
          </div>
        ) : (
          <form style={{ padding: 18 }} className="stack" onSubmit={book}>
            <div className="row between"><span className="bold">{fmtDate(slot)} · {fmtTime(slot)}</span><button type="button" className="btn sm" onClick={() => setSlot(null)}>Change</button></div>
            <div className="grid2">
              <input className="input" required placeholder="First name" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
              <input className="input" placeholder="Last name" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            </div>
            <input className="input" type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input className="input" type="tel" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <textarea className="input" placeholder="Anything we should know?" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            {err && <div style={{ color: 'var(--danger)' }}>{err}</div>}
            <button className="btn primary block" disabled={busy}>{busy ? 'Booking…' : 'Confirm booking'}</button>
          </form>
        )}
      </div>
    </div>
  );
}
