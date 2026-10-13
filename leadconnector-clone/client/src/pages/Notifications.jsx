import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Trash2, MessageSquare, Calendar, DollarSign, Star, UserCheck, AtSign, Workflow, CheckSquare } from 'lucide-react';
import { api } from '../api.js';
import { useApp, useLive } from '../app-context.jsx';
import { Empty, Spinner, TopBar } from '../components/ui.jsx';
import { timeAgo } from '../utils.js';
import { enablePush, pushSupported } from '../push.js';

const ICONS = { inbound_message: MessageSquare, appointment: Calendar, payment: DollarSign, review: Star, assignment: UserCheck, mention: AtSign, workflow: Workflow, task: CheckSquare };

export default function Notifications() {
  const nav = useNavigate();
  const { refreshBadges, toast } = useApp();
  const [data, setData] = useState(null);
  const load = () => api.get('/notifications').then(setData);
  useEffect(() => { load(); }, []);
  useLive(['notification.created'], load);

  const open = async (n) => {
    if (!n.read) await api.post('/notifications/read', { id: n.id });
    refreshBadges();
    if (n.link) nav(n.link);
    else load();
  };
  const readAll = async () => { await api.post('/notifications/read', {}); refreshBadges(); load(); };
  const clear = async () => { if (confirm('Clear all notifications?')) { await api.del('/notifications'); refreshBadges(); load(); } };

  return (
    <div className="page">
      <TopBar back title="Notifications" right={<><button className="icon-btn" onClick={readAll} title="Mark all read"><CheckCheck size={20} /></button><button className="icon-btn" onClick={clear}><Trash2 size={20} /></button></>} />
      {pushSupported() && Notification.permission === 'default' && (
        <div className="container"><button className="btn block" onClick={() => enablePush().then(() => toast('Push notifications enabled', 'success')).catch((e) => toast(e.message, 'error'))}><Bell size={16} /> Enable push notifications</button></div>
      )}
      {!data ? <Spinner /> : data.items.length === 0 ? <Empty icon={Bell} title="No notifications" /> : (
        <div className="list">
          {data.items.map((n) => {
            const I = ICONS[n.type] || Bell;
            return (
              <button key={n.id} className={`list-item ${n.read ? '' : 'unread'}`} onClick={() => open(n)} style={{ background: n.read ? undefined : 'var(--brand-50)' }}>
                <span className="avatar" style={{ width: 38, height: 38, background: 'var(--surface-2)' }}><I size={18} color="var(--brand)" /></span>
                <div className="grow"><div className="title">{n.title}</div>{n.body && <div className="faint ellipsis">{n.body}</div>}</div>
                <span className="faint">{timeAgo(n.created_at)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
