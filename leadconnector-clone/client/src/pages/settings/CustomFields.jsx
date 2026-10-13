import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../../api.js';
import { useApp } from '../../app-context.jsx';
import { Field, Sheet, TopBar } from '../../components/ui.jsx';

export default function CustomFields() {
  const { toast } = useApp();
  const [items, setItems] = useState([]);
  const [add, setAdd] = useState(null);
  const load = () => api.get('/contacts/custom-fields').then(setItems);
  useEffect(() => { load(); }, []);
  const save = async () => {
    try {
      await api.post('/contacts/custom-fields', { ...add, options: add.options ? add.options.split(',').map((s) => s.trim()).filter(Boolean) : [] });
      setAdd(null); load();
    } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <div className="page">
      <TopBar back title="Custom fields" right={<button className="icon-btn" onClick={() => setAdd({ name: '', type: 'text', options: '' })}><Plus size={22} /></button>} />
      <div className="list" style={{ marginTop: 12 }}>
        {items.map((f) => (
          <div key={f.id} className="list-item">
            <div className="grow"><div className="title">{f.name}</div><div className="faint">{f.type} · key: {f.key}{f.options.length ? ` · ${f.options.join(', ')}` : ''}</div></div>
            <button className="icon-btn" onClick={async () => { if (confirm('Delete field?')) { await api.del(`/contacts/custom-fields/${f.id}`); load(); } }}><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
      {add && (
        <Sheet title="New custom field" onClose={() => setAdd(null)} footer={<button className="btn primary block" disabled={!add.name} onClick={save}>Create</button>}>
          <div className="stack">
            <Field label="Name"><input className="input" value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} /></Field>
            <Field label="Type"><select className="input" value={add.type} onChange={(e) => setAdd({ ...add, type: e.target.value })}>{['text', 'number', 'date', 'select', 'checkbox'].map((t) => <option key={t}>{t}</option>)}</select></Field>
            {add.type === 'select' && <Field label="Options (comma separated)"><input className="input" value={add.options} onChange={(e) => setAdd({ ...add, options: e.target.value })} /></Field>}
          </div>
        </Sheet>
      )}
    </div>
  );
}
