import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../../api.js';
import { Field, Sheet, TopBar } from '../../components/ui.jsx';

const VARS = ['{{contact.first_name}}', '{{contact.name}}', '{{contact.company}}', '{{location.name}}', '{{location.phone}}', '{{location.review_link}}', '{{location.booking_link}}', '{{user.name}}'];

export default function Snippets() {
  const [items, setItems] = useState([]);
  const [edit, setEdit] = useState(null);
  const load = () => api.get('/snippets').then(setItems);
  useEffect(() => { load(); }, []);
  const save = async () => {
    if (edit.id) await api.put(`/snippets/${edit.id}`, edit); else await api.post('/snippets', edit);
    setEdit(null); load();
  };
  return (
    <div className="page">
      <TopBar back title="Snippets" right={<button className="icon-btn" onClick={() => setEdit({ name: '', body: '', type: 'sms' })}><Plus size={22} /></button>} />
      <div className="list" style={{ marginTop: 12 }}>
        {items.map((s) => (
          <button key={s.id} className="list-item" onClick={() => setEdit(s)}>
            <div className="grow"><div className="title">{s.name} <span className="badge">{s.type}</span></div><div className="faint ellipsis">{s.body}</div></div>
          </button>
        ))}
      </div>
      {edit && (
        <Sheet title={edit.id ? 'Edit snippet' : 'New snippet'} onClose={() => setEdit(null)} footer={
          <>
            {edit.id && <button className="btn" onClick={async () => { await api.del(`/snippets/${edit.id}`); setEdit(null); load(); }}><Trash2 size={16} /></button>}
            <button className="btn primary grow" disabled={!edit.name || !edit.body} onClick={save}>Save</button>
          </>
        }>
          <div className="stack">
            <Field label="Name"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Type"><select className="input" value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })}><option value="sms">SMS</option><option value="email">Email</option></select></Field>
            <Field label="Message"><textarea className="input" rows={5} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></Field>
            <div className="row wrap" style={{ gap: 6 }}>{VARS.map((v) => <button key={v} className="tab" onClick={() => setEdit({ ...edit, body: `${edit.body}${v}` })}>{v}</button>)}</div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
