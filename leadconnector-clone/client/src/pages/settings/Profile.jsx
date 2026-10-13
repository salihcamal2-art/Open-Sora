import { useState } from 'react';
import { api } from '../../api.js';
import { useApp } from '../../app-context.jsx';
import { Avatar, Field, Switch, TopBar } from '../../components/ui.jsx';

const COLORS = ['#155EEF', '#7A5AF8', '#EE46BC', '#F79009', '#12B76A', '#06AED4', '#F04438'];

export default function Profile() {
  const { user, setUser, toast } = useApp();
  const [f, setF] = useState({ name: user.name, email: user.email, phone: user.phone || '', color: user.color, dnd: user.dnd });
  const [pw, setPw] = useState({ current: '', next: '' });

  const save = async () => {
    try { setUser((await api.put('/auth/me', f)).user); toast('Profile saved', 'success'); } catch (e) { toast(e.message, 'error'); }
  };
  const changePw = async () => {
    try { await api.put('/auth/me/password', pw); setPw({ current: '', next: '' }); toast('Password changed', 'success'); } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="page">
      <TopBar back title="My profile" right={<button className="btn primary sm" onClick={save}>Save</button>} />
      <div className="container stack">
        <div className="card pad stack">
          <div style={{ display: 'flex', justifyContent: 'center' }}><Avatar name={f.name} color={f.color} size={72} /></div>
          <div className="row" style={{ justifyContent: 'center' }}>{COLORS.map((c) => <button key={c} onClick={() => setF({ ...f, color: c })} style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: f.color === c ? '3px solid var(--text)' : 0 }} />)}</div>
          <Field label="Name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Email"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Phone"><input className="input" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <div className="row between"><div><div className="bold">Do not disturb</div><div className="faint">Pause notifications for me</div></div><Switch on={f.dnd} onChange={(v) => setF({ ...f, dnd: v })} /></div>
        </div>
        <div className="card pad stack">
          <div className="bold">Change password</div>
          <input className="input" type="password" placeholder="Current password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          <input className="input" type="password" placeholder="New password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          <button className="btn" disabled={!pw.current || !pw.next} onClick={changePw}>Update password</button>
        </div>
      </div>
    </div>
  );
}
