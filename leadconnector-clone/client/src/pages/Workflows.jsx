import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Workflow } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../app-context.jsx';
import { Empty, Spinner, StatusBadge, Switch, TopBar } from '../components/ui.jsx';

export default function Workflows() {
  const nav = useNavigate();
  const { isAdmin, toast } = useApp();
  const [items, setItems] = useState(null);
  const [meta, setMeta] = useState(null);
  const load = () => api.get('/workflows').then(setItems);
  useEffect(() => { load(); api.get('/workflows/meta').then(setMeta); }, []);

  const create = async () => {
    const name = prompt('Workflow name');
    if (!name) return;
    try {
      const w = await api.post('/workflows', { name, trigger_type: 'contact_created', actions: [] });
      nav(`/workflows/${w.id}`);
    } catch (e) { toast(e.message, 'error'); }
  };
  const toggle = async (w) => {
    try { await api.put(`/workflows/${w.id}`, { status: w.status === 'published' ? 'draft' : 'published' }); load(); } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="page">
      <TopBar back title="Automation" right={isAdmin && <button className="icon-btn" onClick={create}><Plus size={22} /></button>} />
      {!items || !meta ? <Spinner /> : items.length === 0 ? <Empty icon={Workflow} title="No workflows" action={isAdmin && <button className="btn primary" onClick={create}>Create workflow</button>} /> : (
        <div className="list">
          {items.map((w) => (
            <div key={w.id} className="list-item">
              <button className="grow" style={{ background: 'none', border: 0, textAlign: 'left', padding: 0 }} onClick={() => nav(`/workflows/${w.id}`)}>
                <div className="title">{w.name}</div>
                <div className="faint">When: {meta.triggers[w.trigger_type]?.label} · {w.actions.length} actions · {w.enrolled} enrolled</div>
              </button>
              <StatusBadge status={w.status} />
              {isAdmin && <Switch on={w.status === 'published'} onChange={() => toggle(w)} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
