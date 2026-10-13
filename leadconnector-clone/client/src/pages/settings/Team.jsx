import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../../api.js';
import { useApp } from '../../app-context.jsx';
import { Avatar, Field, Sheet, TopBar } from '../../components/ui.jsx';

export default function Team() {
  const { team, setTeam, user, toast } = useApp();
  const [add, setAdd] = useState(null);
  const reload = async () => setTeam(await api.get('/auth/team'));

  const save = async () => {
    try { await api.post('/auth/team', add); setAdd(null); reload(); toast('User added', 'success'); } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="page">
      <TopBar back title="Team members" right={<button className="icon-btn" onClick={() => setAdd({ name: '', email: '', password: '', role: 'user' })}><Plus size={22} /></button>} />
      <div className="list" style={{ marginTop: 12 }}>
        {team.map((u) => (
          <div key={u.id} className="list-item">
            <Avatar name={u.name} color={u.color} />
            <div className="grow"><div className="title">{u.name}{u.id === user.id ? ' (you)' : ''}</div><div className="faint">{u.email}</div></div>
            <select className="input" style={{ width: 100 }} value={u.role} disabled={u.id === user.id} onChange={async (e) => { await api.put(`/auth/team/${u.id}`, { role: e.target.value }); reload(); }}>
              <option value="admin">Admin</option><option value="user">User</option>
            </select>
            {u.id !== user.id && <button className="icon-btn" onClick={async () => { if (confirm(`Remove ${u.name}?`)) { await api.del(`/auth/team/${u.id}`); reload(); } }}><Trash2 size={16} /></button>}
          </div>
        ))}
      </div>
      {add && (
        <Sheet title="Add team member" onClose={() => setAdd(null)} footer={<button className="btn primary block" onClick={save}>Add</button>}>
          <div className="stack">
            <Field label="Name"><input className="input" value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} /></Field>
            <Field label="Email"><input className="input" type="email" value={add.email} onChange={(e) => setAdd({ ...add, email: e.target.value })} /></Field>
            <Field label="Temporary password (for new users)"><input className="input" type="text" value={add.password} onChange={(e) => setAdd({ ...add, password: e.target.value })} /></Field>
            <Field label="Role"><select className="input" value={add.role} onChange={(e) => setAdd({ ...add, role: e.target.value })}><option value="user">User</option><option value="admin">Admin</option></select></Field>
          </div>
        </Sheet>
      )}
    </div>
  );
}
