import { useEffect, useState } from 'react';
import { Search, UserPlus } from 'lucide-react';
import { api } from '../api.js';
import { Avatar, Sheet } from './ui.jsx';

/** Bottom-sheet contact search with inline "quick add". */
export default function ContactPicker({ title = 'Select contact', onPick, onClose }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '', email: '' });
  const [err, setErr] = useState('');

  useEffect(() => {
    const t = setTimeout(() => api.get('/contacts', { q, limit: 30, sort: 'activity' }).then((r) => setItems(r.items)).catch(() => {}), 200);
    return () => clearTimeout(t);
  }, [q]);

  const create = async () => {
    try {
      const c = await api.post('/contacts', { ...form, source: 'mobile app' });
      onPick(c);
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <Sheet title={title} onClose={onClose}>
      {adding ? (
        <div className="stack">
          <div className="grid2">
            <input className="input" placeholder="First name" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            <input className="input" placeholder="Last name" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
          </div>
          <input className="input" placeholder="Phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input className="input" placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          {err && <div className="small" style={{ color: 'var(--danger)' }}>{err}</div>}
          <div className="row">
            <button className="btn grow" onClick={() => setAdding(false)}>Back</button>
            <button className="btn primary grow" onClick={create}>Create & select</button>
          </div>
        </div>
      ) : (
        <>
          <div className="search" style={{ marginBottom: 10 }}>
            <Search size={18} color="var(--text-3)" />
            <input autoFocus placeholder="Search name, phone, email" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <button className="list-item" style={{ borderRadius: 12 }} onClick={() => setAdding(true)}>
            <div className="avatar" style={{ width: 40, height: 40, background: 'var(--brand-50)', color: 'var(--brand)' }}><UserPlus size={18} /></div>
            <div className="title">Add new contact</div>
          </button>
          {items.map((c) => (
            <button key={c.id} className="list-item" onClick={() => onPick(c)}>
              <Avatar name={c.name} />
              <div className="grow">
                <div className="title ellipsis">{c.name}</div>
                <div className="faint ellipsis">{[c.phone, c.email].filter(Boolean).join(' · ')}</div>
              </div>
            </button>
          ))}
        </>
      )}
    </Sheet>
  );
}
