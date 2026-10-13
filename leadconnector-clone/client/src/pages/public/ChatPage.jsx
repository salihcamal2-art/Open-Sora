import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Send } from 'lucide-react';
import { api } from '../../api.js';

/** Website live-chat widget (embed with an iframe). Messages land in the Conversations inbox. */
export default function ChatPage() {
  const { locationId } = useParams();
  const key = `lc_chat_${locationId}`;
  const [loc, setLoc] = useState(null);
  const [visitor, setVisitor] = useState(() => localStorage.getItem(key));
  const [info, setInfo] = useState({ name: '', email: '', phone: '' });
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const end = useRef(null);

  useEffect(() => { api.get(`/public/chat/${locationId}`).then(setLoc).catch((e) => setErr(e.message)); }, [locationId]);
  useEffect(() => {
    if (!visitor) return undefined;
    const load = () => api.get(`/public/chat/${locationId}/${visitor}`).then(setMsgs).catch(() => {});
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [visitor, locationId]);
  useEffect(() => { end.current?.scrollIntoView(); }, [msgs.length]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      const r = await api.post(`/public/chat/${locationId}`, { visitor, ...info, message: text });
      localStorage.setItem(key, r.visitor);
      setVisitor(r.visitor);
      setMsgs([...msgs, { id: Date.now(), direction: 'inbound', body: text }]);
      setText('');
      setErr('');
    } catch (e2) { setErr(e2.message); }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <div style={{ background: 'var(--brand)', color: '#fff', padding: 16 }}>
        <div className="bold">{loc?.name || 'Chat with us'}</div>
        <div style={{ fontSize: 13, opacity: 0.85 }}>We typically reply in a few minutes</div>
      </div>
      <div className="thread">
        <div className="msg out" style={{ alignSelf: 'flex-start', alignItems: 'flex-start' }}><div className="bubble" style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}>Hi 👋 How can we help you today?</div></div>
        {msgs.map((m) => (
          <div key={m.id} className={`msg ${m.direction === 'inbound' ? 'out' : 'in'}`}><div className="bubble">{m.body}</div></div>
        ))}
        <div ref={end} />
      </div>
      <form className="composer stack" style={{ gap: 6 }} onSubmit={send}>
        {!visitor && (
          <>
            <input className="input" required placeholder="Your name" value={info.name} onChange={(e) => setInfo({ ...info, name: e.target.value })} />
            <div className="grid2">
              <input className="input" type="email" placeholder="Email" value={info.email} onChange={(e) => setInfo({ ...info, email: e.target.value })} />
              <input className="input" type="tel" placeholder="Phone" value={info.phone} onChange={(e) => setInfo({ ...info, phone: e.target.value })} />
            </div>
          </>
        )}
        {err && <div className="small" style={{ color: 'var(--danger)' }}>{err}</div>}
        <div className="row">
          <textarea rows={1} placeholder="Type your message…" value={text} onChange={(e) => setText(e.target.value)} />
          <button className="icon-btn" style={{ background: 'var(--brand)', color: '#fff', borderRadius: '50%' }}><Send size={18} /></button>
        </div>
      </form>
    </div>
  );
}
