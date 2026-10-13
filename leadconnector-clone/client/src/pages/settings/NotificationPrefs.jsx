import { api } from '../../api.js';
import { useApp } from '../../app-context.jsx';
import { Switch, TopBar } from '../../components/ui.jsx';

const TYPES = [
  ['inbound_message', 'New inbound messages'],
  ['assignment', 'Assignments (contacts, conversations, opportunities)'],
  ['mention', 'Mentions in internal comments'],
  ['appointment', 'Appointments booked & reminders'],
  ['task', 'Tasks assigned to me'],
  ['payment', 'Payments received'],
  ['review', 'New reviews'],
  ['workflow', 'Workflow notifications'],
];

export default function NotificationPrefs() {
  const { user, setUser } = useApp();
  const prefs = user.prefs.notifications || {};
  const set = async (k, v) => {
    const r = await api.put('/auth/me', { prefs: { notifications: { ...prefs, [k]: v } } });
    setUser(r.user);
  };
  return (
    <div className="page">
      <TopBar back title="Notifications" />
      <div className="list" style={{ marginTop: 12 }}>
        {TYPES.map(([k, l]) => (
          <div key={k} className="list-item"><span className="grow">{l}</span><Switch on={prefs[k] !== false} onChange={(v) => set(k, v)} /></div>
        ))}
      </div>
      {'Notification' in window && (
        <div className="container">
          <button className="btn block" onClick={() => Notification.requestPermission()}>
            Browser push: {Notification.permission === 'granted' ? 'enabled ✓' : 'tap to enable'}
          </button>
        </div>
      )}
    </div>
  );
}
