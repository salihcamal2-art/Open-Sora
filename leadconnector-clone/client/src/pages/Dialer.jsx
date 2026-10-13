import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Phone, PhoneOff, Delete, PhoneIncoming, PhoneOutgoing, UserSearch } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../app-context.jsx';
import { Avatar, Field, Sheet, Tabs, TopBar } from '../components/ui.jsx';
import ContactPicker from '../components/ContactPicker.jsx';
import { fmtDateTime } from '../utils.js';

const KEYS = [['1', ''], ['2', 'ABC'], ['3', 'DEF'], ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'], ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'], ['*', ''], ['0', '+'], ['#', '']];

/**
 * Dialer: places the call through the phone's native dialer (tel:) and logs it to the
 * contact's conversation with duration, outcome and notes. Plug a VoIP SDK (e.g. Twilio Voice)
 * into `startCall` for in-app calling.
 */
export default function Dialer() {
  const [params] = useSearchParams();
  const { toast } = useApp();
  const [tab, setTab] = useState('keypad');
  const [number, setNumber] = useState('');
  const [contact, setContact] = useState(null);
  const [pick, setPick] = useState(false);
  const [call, setCall] = useState(null); // { start }
  const [elapsed, setElapsed] = useState(0);
  const [wrap, setWrap] = useState(null);
  const [history, setHistory] = useState([]);
  const timer = useRef(null);

  useEffect(() => {
    if (params.get('contact')) api.get(`/contacts/${params.get('contact')}`).then((c) => { setContact(c); setNumber(c.phone || ''); });
  }, []); // eslint-disable-line
  useEffect(() => { if (tab === 'recent') api.get('/calls').then(setHistory); }, [tab]);
  useEffect(() => () => clearInterval(timer.current), []);

  const startCall = async () => {
    if (!number) return;
    let c = contact;
    if (!c || c.phone !== number) {
      const found = await api.get('/contacts', { q: number.replace(/[^\d]/g, '').slice(-9), limit: 1 });
      c = found.items[0] || null;
      setContact(c);
    }
    window.location.href = `tel:${number}`;
    const start = Date.now();
    setCall({ start });
    setElapsed(0);
    timer.current = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
  };
  const endCall = () => {
    clearInterval(timer.current);
    setWrap({ duration: elapsed, outcome: elapsed > 5 ? 'completed' : 'no_answer', notes: '' });
    setCall(null);
  };
  const saveLog = async () => {
    try {
      let c = contact;
      if (!c) c = await api.post('/contacts', { phone: number, first_name: number, source: 'dialer' });
      const conv = await api.post('/conversations', { contact_id: c.id });
      await api.post(`/conversations/${conv.id}/calls`, { direction: 'outbound', ...wrap });
      toast('Call logged', 'success');
      setWrap(null);
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  return (
    <div className="page">
      <TopBar title="Dialer" right={<button className="icon-btn" onClick={() => setPick(true)}><UserSearch size={20} /></button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'keypad', label: 'Keypad' }, { value: 'recent', label: 'Recent calls' }]} />
      {tab === 'keypad' ? (
        <div className="container" style={{ textAlign: 'center' }}>
          {contact && <div className="row" style={{ justifyContent: 'center', margin: '8px 0' }}><Avatar name={contact.name} size={32} /><span className="bold">{contact.name}</span></div>}
          <input className="input" style={{ fontSize: 30, textAlign: 'center', border: 0, background: 'none', fontWeight: 600 }} value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Enter number" inputMode="tel" />
          {call ? (
            <div style={{ padding: 32 }}>
              <div className="faint">Calling…</div>
              <div style={{ fontSize: 42, fontWeight: 300 }}>{String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}</div>
              <button className="key" style={{ background: 'var(--danger)', color: '#fff', width: 72, margin: '24px auto 0' }} onClick={endCall}><PhoneOff /></button>
              <div className="faint" style={{ marginTop: 12 }}>Tap when the call ends to log it</div>
            </div>
          ) : (
            <>
              <div className="keypad" style={{ marginTop: 12 }}>
                {KEYS.map(([k, l]) => <button key={k} className="key" onClick={() => setNumber(number + k)}>{k}<small>{l}</small></button>)}
                <span />
                <button className="key" style={{ background: 'var(--success)', color: '#fff' }} onClick={startCall} disabled={!number}><Phone /></button>
                <button className="key" style={{ background: 'none' }} onClick={() => setNumber(number.slice(0, -1))}><Delete /></button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="list">
          {history.length === 0 && <div className="empty">No calls yet</div>}
          {history.map((m) => (
            <button key={m.id} className="list-item" onClick={() => { setContact(m.contact); setNumber(m.contact?.phone || ''); setTab('keypad'); }}>
              {m.direction === 'inbound' ? <PhoneIncoming size={18} color="var(--success)" /> : <PhoneOutgoing size={18} color="var(--brand)" />}
              <div className="grow"><div className="title">{m.contact?.name}</div><div className="faint">{fmtDateTime(m.created_at)} · {m.meta.outcome} · {Math.floor((m.meta.duration || 0) / 60)}m {(m.meta.duration || 0) % 60}s</div></div>
              <Phone size={18} color="var(--brand)" />
            </button>
          ))}
        </div>
      )}
      {pick && <ContactPicker title="Call contact" onClose={() => setPick(false)} onPick={(c) => { setContact(c); setNumber(c.phone || ''); setPick(false); }} />}
      {wrap && (
        <Sheet title="Log call" onClose={() => setWrap(null)} footer={<button className="btn primary block" onClick={saveLog}>Save call log</button>}>
          <div className="stack">
            <Field label="Outcome">
              <div className="row wrap" style={{ gap: 6 }}>
                {[['completed', 'Connected'], ['no_answer', 'No answer'], ['voicemail', 'Left voicemail'], ['busy', 'Busy'], ['wrong_number', 'Wrong number']].map(([v, l]) => (
                  <button key={v} className={`tab ${wrap.outcome === v ? 'active' : ''}`} onClick={() => setWrap({ ...wrap, outcome: v })}>{l}</button>
                ))}
              </div>
            </Field>
            <Field label="Duration (seconds)"><input className="input" type="number" value={wrap.duration} onChange={(e) => setWrap({ ...wrap, duration: Number(e.target.value) })} /></Field>
            <Field label="Notes"><textarea className="input" value={wrap.notes} onChange={(e) => setWrap({ ...wrap, notes: e.target.value })} /></Field>
          </div>
        </Sheet>
      )}
    </div>
  );
}
