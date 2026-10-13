import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { api } from '../../api.js';
import { TopBar } from '../../components/ui.jsx';

export default function Tags() {
  const nav = useNavigate();
  const [items, setItems] = useState([]);
  const [name, setName] = useState('');
  const load = () => api.get('/contacts/tags').then(setItems);
  useEffect(() => { load(); }, []);
  return (
    <div className="page">
      <TopBar back title="Tags" />
      <div className="container row">
        <input className="input" placeholder="New tag" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn primary" disabled={!name} onClick={async () => { await api.post('/contacts/tags', { name }); setName(''); load(); }}>Add</button>
      </div>
      <div className="list">
        {items.map((t) => (
          <div key={t.id} className="list-item">
            <span className="tag-chip">{t.name}</span>
            <button className="grow faint" style={{ background: 'none', border: 0, textAlign: 'left' }} onClick={() => nav('/contacts')}>{t.count} contacts</button>
            <button className="icon-btn" onClick={async () => { if (confirm(`Delete tag "${t.name}"? It will be removed from all contacts.`)) { await api.del(`/contacts/tags/${t.id}`); load(); } }}><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
