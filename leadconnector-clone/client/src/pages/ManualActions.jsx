import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, MessageSquare, Check, SkipForward, Hand } from 'lucide-react';
import { api } from '../api.js';
import { Empty, Spinner, Tabs, TopBar } from '../components/ui.jsx';
import { timeAgo } from '../utils.js';

/** Queue of manual call / SMS steps created by workflows. */
export default function ManualActions() {
  const nav = useNavigate();
  const [status, setStatus] = useState('pending');
  const [items, setItems] = useState(null);
  const load = () => api.get('/manual-actions', { status }).then(setItems);
  useEffect(() => { load(); }, [status]); // eslint-disable-line

  const mark = async (m, s) => { await api.put(`/manual-actions/${m.id}`, { status: s }); load(); };
  const go = async (m) => {
    if (m.type === 'call') nav(`/dialer?contact=${m.contact.id}`);
    else {
      const c = await api.post('/conversations', { contact_id: m.contact.id });
      nav(`/conversations/${c.id}?channel=sms`);
    }
  };

  return (
    <div className="page">
      <TopBar back title="Manual actions" />
      <Tabs value={status} onChange={setStatus} tabs={[{ value: 'pending', label: 'Pending' }, { value: 'done', label: 'Completed' }, { value: 'skipped', label: 'Skipped' }]} />
      {!items ? <Spinner /> : items.length === 0 ? <Empty icon={Hand} title="Nothing to do" text="Manual call/SMS steps from your workflows appear here." /> : (
        <div className="container stack">
          {items.map((m) => (
            <div key={m.id} className="card pad stack" style={{ gap: 8 }}>
              <div className="row">
                <span className="avatar" style={{ width: 40, height: 40, background: 'var(--brand-50)' }}>{m.type === 'call' ? <Phone size={18} color="var(--brand)" /> : <MessageSquare size={18} color="var(--brand)" />}</span>
                <div className="grow"><div className="bold">{m.type === 'call' ? 'Call' : 'Send SMS to'} {m.contact?.name}</div><div className="faint">{m.contact?.phone} · {m.workflow_name || 'Manual'} · {timeAgo(m.created_at)}</div></div>
              </div>
              {m.instructions && <div className="small">{m.instructions}</div>}
              {status === 'pending' && (
                <div className="row">
                  <button className="btn primary grow" onClick={() => go(m)}>{m.type === 'call' ? <Phone size={16} /> : <MessageSquare size={16} />} {m.type === 'call' ? 'Call now' : 'Text now'}</button>
                  <button className="btn" onClick={() => mark(m, 'done')}><Check size={16} /></button>
                  <button className="btn" onClick={() => mark(m, 'skipped')}><SkipForward size={16} /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
