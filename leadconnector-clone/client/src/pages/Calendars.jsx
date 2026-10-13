import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, List, CalendarDays, Ban, Share2 } from 'lucide-react';
import { api } from '../api.js';
import { useApp, useLive } from '../app-context.jsx';
import { Empty, Sheet, Spinner, StatusBadge, TopBar } from '../components/ui.jsx';
import { fmtDate, fmtTime, ymd } from '../utils.js';

const HOUR_PX = 64;

export default function Calendars() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { toast } = useApp();
  const [day, setDay] = useState(() => (params.get('date') ? new Date(`${params.get('date')}T00:00`) : new Date()));
  const [view, setView] = useState('day');
  const [cals, setCals] = useState([]);
  const [calId, setCalId] = useState('');
  const [mine, setMine] = useState(false);
  const [appts, setAppts] = useState(null);
  const [weekAppts, setWeekAppts] = useState([]);
  const [add, setAdd] = useState(false);
  const timelineRef = useRef(null);

  const weekStart = useMemo(() => { const d = new Date(day); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay()); return d; }, [day]);
  const days = Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * 86400e3));

  useEffect(() => { api.get('/calendars').then(setCals); }, []);
  const load = async () => {
    try {
      const d0 = new Date(day); d0.setHours(0, 0, 0, 0);
      const from = view === 'list' ? new Date().toISOString() : d0.toISOString();
      const to = view === 'list' ? new Date(Date.now() + 60 * 86400e3).toISOString() : new Date(d0.getTime() + 86400e3).toISOString();
      const base = { calendar_id: calId, assigned_to: mine ? 'me' : undefined };
      const [a, w] = await Promise.all([
        api.get('/calendars/appointments/list', { ...base, from, to }),
        api.get('/calendars/appointments/list', { ...base, from: weekStart.toISOString(), to: new Date(weekStart.getTime() + 7 * 86400e3).toISOString() }),
      ]);
      setAppts(a);
      setWeekAppts(w);
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  useEffect(() => { load(); }, [day, view, calId, mine]); // eslint-disable-line
  useLive(['appointment.created', 'appointment.updated'], load);
  // start the day view around business hours (or the first appointment)
  useEffect(() => {
    if (view !== 'day' || !appts || !timelineRef.current) return;
    const first = appts.find((a) => !a.is_block);
    const hour = Math.max(0, (first ? new Date(first.start_at).getHours() : 8) - 1);
    const pageEl = timelineRef.current.closest('.page');
    const el = timelineRef.current.children[hour];
    if (pageEl && el) pageEl.scrollTop += el.getBoundingClientRect().top - pageEl.getBoundingClientRect().top - 260;
  }, [appts, view]);

  const shift = (n) => setDay(new Date(day.getTime() + n * 86400e3));
  const isToday = ymd(day) === ymd(new Date());
  const copyLink = async () => {
    const cal = cals.find((c) => String(c.id) === String(calId)) || cals[0];
    const url = `${window.location.origin}/book/${cal.slug}`;
    try { await navigator.clipboard.writeText(url); toast('Booking link copied', 'success'); } catch { prompt('Booking link', url); }
  };

  return (
    <div className="page">
      <TopBar
        title={day.toLocaleDateString([], { month: 'long', year: 'numeric' })}
        right={
          <>
            <button className="icon-btn" onClick={copyLink} title="Copy booking link"><Share2 size={20} /></button>
            <button className="icon-btn" onClick={() => setView(view === 'day' ? 'list' : 'day')}>{view === 'day' ? <List size={20} /> : <CalendarDays size={20} />}</button>
            <button className="icon-btn" onClick={() => setAdd(true)}><Plus size={22} /></button>
          </>
        }
      />
      <div className="row" style={{ padding: '8px 12px', background: 'var(--surface)', flexWrap: 'wrap' }}>
        <select className="input" style={{ flex: 1 }} value={calId} onChange={(e) => setCalId(e.target.value)}>
          <option value="">All calendars</option>
          {cals.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className={`tab ${mine ? 'active' : ''}`} onClick={() => setMine(!mine)}>My appointments</button>
        {!isToday && <button className="tab" onClick={() => setDay(new Date())}>Today</button>}
      </div>
      {view === 'day' && (
        <div className="week-strip">
          {days.map((d) => (
            <button key={d.toISOString()} className={`day-btn ${ymd(d) === ymd(day) ? 'active' : ''}`} onClick={() => setDay(d)}>
              {d.toLocaleDateString([], { weekday: 'narrow' })}
              <b>{d.getDate()}</b>
              {weekAppts.some((a) => !a.is_block && ymd(a.start_at) === ymd(d)) ? <span className="has" /> : <span style={{ height: 5 }} />}
            </button>
          ))}
        </div>
      )}
      {view === 'day' && (
        <div className="row between" style={{ padding: '8px 12px' }}>
          <button className="icon-btn" onClick={() => shift(-1)}><ChevronLeft /></button>
          <span className="bold">{fmtDate(day)}</span>
          <button className="icon-btn" onClick={() => shift(1)}><ChevronRight /></button>
        </div>
      )}

      {!appts ? <Spinner /> : view === 'list' ? (
        appts.length === 0 ? <Empty title="No upcoming appointments" /> : (
          <div className="list">
            {appts.map((a, i) => (
              <div key={a.id}>
                {(i === 0 || ymd(appts[i - 1].start_at) !== ymd(a.start_at)) && <div className="section-title" style={{ margin: '12px 16px 4px' }}>{fmtDate(a.start_at)}</div>}
                <button className="list-item" onClick={() => nav(`/calendars/appointments/${a.id}`)}>
                  <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: a.is_block ? 'var(--text-3)' : a.calendar?.color }} />
                  <div className="grow"><div className="title">{a.is_block ? `⛔ ${a.title}` : a.contact?.name || a.title}</div><div className="faint">{fmtTime(a.start_at)} – {fmtTime(a.end_at)} · {a.calendar?.name || 'Blocked'}</div></div>
                  {!a.is_block && <StatusBadge status={a.status} />}
                </button>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="timeline" ref={timelineRef} style={{ margin: '0 8px' }}>
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="hour" onClick={() => {
              const d = new Date(day); d.setHours(h, 0, 0, 0);
              nav(`/calendars/new?start=${encodeURIComponent(d.toISOString())}`);
            }}>
              <span>{new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: 'numeric' })}</span>
            </div>
          ))}
          {appts.map((a) => {
            const s = new Date(a.start_at), e = new Date(a.end_at);
            const top = (s.getHours() + s.getMinutes() / 60) * HOUR_PX;
            const height = Math.max(26, ((e - s) / 3600e3) * HOUR_PX - 2);
            return (
              <button key={a.id} className={`event ${a.is_block ? 'block' : ''} ${a.status === 'cancelled' ? 'cancelled' : ''}`}
                style={{ top, height, background: a.calendar?.color || 'var(--brand)' }}
                onClick={() => nav(`/calendars/appointments/${a.id}`)}>
                <b>{a.is_block ? a.title : a.contact?.name}</b> <span style={{ opacity: 0.85 }}>{fmtTime(a.start_at)}–{fmtTime(a.end_at)}</span>
                {!a.is_block && <div style={{ opacity: 0.85 }}>{a.calendar?.name} · {a.status}</div>}
              </button>
            );
          })}
        </div>
      )}
      {add && (
        <Sheet title="Add to calendar" onClose={() => setAdd(false)}>
          <div className="menu-list">
            <Link className="list-item" to={`/calendars/new?date=${ymd(day)}`}><Plus size={18} /> New appointment</Link>
            <Link className="list-item" to={`/calendars/new?block=1&date=${ymd(day)}`}><Ban size={18} /> Block off time</Link>
          </div>
        </Sheet>
      )}
    </div>
  );
}
