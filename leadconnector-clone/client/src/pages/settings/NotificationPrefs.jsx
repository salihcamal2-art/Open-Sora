import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { enablePush, pushStatus } from '../../push.js';
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
  const { user, setUser, toast } = useApp();
  const [push, setPush] = useState('…');
  useEffect(() => { pushStatus().then(setPush); }, []);
  const turnOnPush = async () => {
    try { await enablePush(); setPush('on'); toast('Push notifications enabled on this device', 'success'); } catch (e) { toast(e.message, 'error'); }
  };
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
      <div className="container">
        <button className="btn block" onClick={turnOnPush} disabled={push === 'unsupported'}>
          Push notifications on this device: {push === 'on' ? 'enabled ✓ (tap to send a test)' : push === 'unsupported' ? 'not supported in this browser' : push === 'denied' ? 'blocked in browser settings' : 'tap to enable'}
        </button>
      </div>
    </div>
  );
}
