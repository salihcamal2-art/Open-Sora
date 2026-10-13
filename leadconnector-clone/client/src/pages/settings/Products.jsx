import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../../api.js';
import { Field, Sheet, TopBar } from '../../components/ui.jsx';
import { money } from '../../utils.js';

export default function Products() {
  const [items, setItems] = useState([]);
  const [edit, setEdit] = useState(null);
  const load = () => api.get('/payments/products').then(setItems);
  useEffect(() => { load(); }, []);
  const save = async () => {
    const body = { ...edit, price: Number(edit.price) };
    if (edit.id) await api.put(`/payments/products/${edit.id}`, body); else await api.post('/payments/products', body);
    setEdit(null); load();
  };
  return (
    <div className="page">
      <TopBar back title="Products" right={<button className="icon-btn" onClick={() => setEdit({ name: '', description: '', price: '', type: 'one_time' })}><Plus size={22} /></button>} />
      <div className="list" style={{ marginTop: 12 }}>
        {items.map((p) => (
          <button key={p.id} className="list-item" onClick={() => setEdit(p)}>
            <div className="grow"><div className="title">{p.name}</div><div className="faint">{p.type === 'recurring' ? 'Recurring (monthly)' : 'One-time'}{p.description ? ` · ${p.description}` : ''}</div></div>
            <span className="bold">{money(p.price)}</span>
          </button>
        ))}
      </div>
      {edit && (
        <Sheet title={edit.id ? 'Edit product' : 'New product'} onClose={() => setEdit(null)} footer={
          <>
            {edit.id && <button className="btn" onClick={async () => { await api.del(`/payments/products/${edit.id}`); setEdit(null); load(); }}><Trash2 size={16} /></button>}
            <button className="btn primary grow" disabled={!edit.name} onClick={save}>Save</button>
          </>
        }>
          <div className="stack">
            <Field label="Name"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Description"><input className="input" value={edit.description || ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <Field label="Price"><input className="input" type="number" step="0.01" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} /></Field>
            <Field label="Type"><select className="input" value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })}><option value="one_time">One-time</option><option value="recurring">Recurring</option></select></Field>
          </div>
        </Sheet>
      )}
    </div>
  );
}
