import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { api } from '../../api.js';
import { useApp } from '../../app-context.jsx';
import { Field, Sheet, Spinner, TopBar } from '../../components/ui.jsx';

export default function Pipelines() {
  const { toast } = useApp();
  const [items, setItems] = useState(null);
  const [edit, setEdit] = useState(null);
  useEffect(() => { api.get('/opportunities/pipelines').then(setItems); }, []);

  const save = async () => {
    try {
      const body = { name: edit.name, stages: edit.stages.filter((s) => s.name.trim()) };
      setItems(edit.id ? await api.put(`/opportunities/pipelines/${edit.id}`, body) : await api.post('/opportunities/pipelines', body));
      setEdit(null);
      toast('Pipeline saved', 'success');
    } catch (e) { toast(e.message, 'error'); }
  };
  const move = (i, d) => { const s = [...edit.stages]; [s[i], s[i + d]] = [s[i + d], s[i]]; setEdit({ ...edit, stages: s }); };

  return (
    <div className="page">
      <TopBar back title="Pipelines" right={<button className="icon-btn" onClick={() => setEdit({ name: '', stages: [{ name: 'New' }, { name: 'In progress' }, { name: 'Won' }] })}><Plus size={22} /></button>} />
      {!items ? <Spinner /> : (
        <div className="list" style={{ marginTop: 12 }}>
          {items.map((p) => (
            <button key={p.id} className="list-item" onClick={() => setEdit(JSON.parse(JSON.stringify(p)))}>
              <div className="grow"><div className="title">{p.name}</div><div className="faint">{p.stages.map((s) => s.name).join(' → ')}</div></div>
            </button>
          ))}
        </div>
      )}
      {edit && (
        <Sheet title={edit.id ? 'Edit pipeline' : 'New pipeline'} onClose={() => setEdit(null)} footer={
          <>
            {edit.id && <button className="btn" onClick={async () => { if (confirm('Delete pipeline and all its opportunities?')) { try { await api.del(`/opportunities/pipelines/${edit.id}`); setItems(items.filter((p) => p.id !== edit.id)); setEdit(null); } catch (e) { toast(e.message, 'error'); } } }}><Trash2 size={16} /></button>}
            <button className="btn primary grow" onClick={save}>Save</button>
          </>
        }>
          <div className="stack">
            <Field label="Pipeline name"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <div className="bold small">Stages</div>
            {edit.stages.map((s, i) => (
              <div key={s.id || `n${i}`} className="row">
                <input className="input" value={s.name} onChange={(e) => setEdit({ ...edit, stages: edit.stages.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                {i > 0 && <button className="icon-btn" onClick={() => move(i, -1)}><ArrowUp size={16} /></button>}
                {i < edit.stages.length - 1 && <button className="icon-btn" onClick={() => move(i, 1)}><ArrowDown size={16} /></button>}
                <button className="icon-btn" onClick={() => setEdit({ ...edit, stages: edit.stages.filter((_, j) => j !== i) })}><Trash2 size={16} /></button>
              </div>
            ))}
            <button className="btn" onClick={() => setEdit({ ...edit, stages: [...edit.stages, { name: '' }] })}><Plus size={16} /> Add stage</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
