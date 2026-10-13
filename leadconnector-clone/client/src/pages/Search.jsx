import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search as SearchIcon } from 'lucide-react';
import { api } from '../api.js';
import { Avatar, StatusBadge, TopBar } from '../components/ui.jsx';
import { money } from '../utils.js';

export default function Search() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [r, setR] = useState(null);
  useEffect(() => {
    if (!q.trim()) return setR(null);
    const t = setTimeout(() => api.get('/search', { q }).then(setR), 200);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="page">
      <TopBar back title="Search" />
      <div className="container">
        <div className="search"><SearchIcon size={18} color="var(--text-3)" /><input autoFocus placeholder="Contacts, opportunities, invoices…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      {r && (
        <>
          {r.contacts.length > 0 && <div className="section-title" style={{ marginLeft: 16 }}>Contacts</div>}
          <div className="list">
            {r.contacts.map((c) => (
              <button key={c.id} className="list-item" onClick={() => nav(`/contacts/${c.id}`)}><Avatar name={c.name} size={36} /><div className="grow"><div className="title">{c.name}</div><div className="faint">{[c.phone, c.email].filter(Boolean).join(' · ')}</div></div></button>
            ))}
          </div>
          {r.opportunities.length > 0 && <div className="section-title" style={{ marginLeft: 16 }}>Opportunities</div>}
          <div className="list">
            {r.opportunities.map((o) => (
              <button key={o.id} className="list-item" onClick={() => nav(`/opportunities/${o.id}`)}><div className="grow title">{o.name}</div><span className="bold">{money(o.value)}</span><StatusBadge status={o.status} /></button>
            ))}
          </div>
          {r.invoices.length > 0 && <div className="section-title" style={{ marginLeft: 16 }}>Invoices</div>}
          <div className="list">
            {r.invoices.map((i) => (
              <button key={i.id} className="list-item" onClick={() => nav(`/payments/invoices/${i.id}`)}><div className="grow title">{i.number}</div><span className="bold">{money(i.total)}</span><StatusBadge status={i.status} /></button>
            ))}
          </div>
          {!r.contacts.length && !r.opportunities.length && !r.invoices.length && <div className="empty">No results for “{q}”</div>}
        </>
      )}
    </div>
  );
}
