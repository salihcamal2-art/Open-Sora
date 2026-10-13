import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, CheckSquare, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useApp, useLive } from '../app-context.jsx';
import { Empty, Field, Sheet, Spinner, Tabs, TopBar, UserSelect } from '../components/ui.jsx';
import ContactPicker from '../components/ContactPicker.jsx';
import { fmtDateTime, toLocalInput, fromLocalInput } from '../utils.js';

export default function Tasks() {
  const [params, setParams] = useSearchParams();
  const { toast } = useApp();
  const [status, setStatus] = useState('pending');
  const [mine, setMine] = useState(true);
  const [items, setItems] = useState(null);
  const [edit, setEdit] = useState(params.get('new') ? { contact_id: params.get('contact') ? Number(params.get('contact')) : null } : null);

  const load = () => api.get('/tasks', { status, assigned_to: mine ? 'me' : undefined }).then(setItems).catch((e) => toast(e.message, 'error'));
  useEffect(() => { load(); }, [status, mine]); // eslint-disable-line
  useLive(['task.created', 'task.updated'], load);

  const toggle = async (t) => {
    setItems(items.map((x) => (x.id === t.id ? { ...x, completed: !x.completed } : x)));
    await api.put(`/tasks/${t.id}`, { completed: !t.completed });
    load();
  };

  return (
    <div className="page">
      <TopBar title="Tasks" right={<button className="icon-btn" onClick={() => setEdit({})}><Plus size={22} /></button>} />
      <Tabs value={status} onChange={setStatus} tabs={[{ value: 'pending', label: 'Pending' }, { value: 'today', label: 'Due today' }, { value: 'overdue', label: 'Overdue' }, { value: 'completed', label: 'Completed' }, { value: 'all', label: 'All' }]} />
      <div className="row" style={{ padding: '8px 16px' }}>
        <button className={`tab ${mine ? 'active' : ''}`} onClick={() => setMine(true)}>Assigned to me</button>
        <button className={`tab ${!mine ? 'active' : ''}`} onClick={() => setMine(false)}>Everyone</button>
      </div>
      {!items ? <Spinner /> : items.length === 0 ? <Empty icon={CheckSquare} title="No tasks" text="You're all caught up!" /> : (
        <div className="list">
          {items.map((t) => {
            const overdue = !t.completed && t.due_at && t.due_at < new Date().toISOString();
            return (
              <div key={t.id} className="list-item">
                <button className={`check ${t.completed ? 'on' : ''}`} onClick={() => toggle(t)}>{t.completed ? '✓' : ''}</button>
                <button className="grow" style={{ background: 'none', border: 0, textAlign: 'left', padding: 0 }} onClick={() => setEdit(t)}>
                  <div className="title" style={{ textDecoration: t.completed ? 'line-through' : 'none' }}>{t.title}</div>
                  <div className="faint">
                    <span style={{ color: overdue ? 'var(--danger)' : undefined }}>{t.due_at ? fmtDateTime(t.due_at) : 'No due date'}</span>
                    {t.contact && <> · <Link to={`/contacts/${t.contact.id}`} onClick={(e) => e.stopPropagation()}>{t.contact.name}</Link></>}
                    {t.assignee_name && ` · ${t.assignee_name}`}
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}
      {edit && <TaskSheet task={edit} onClose={() => { setEdit(null); setParams({}); }} onSaved={() => { setEdit(null); setParams({}); load(); }} />}
    </div>
  );
}

function TaskSheet({ task, onClose, onSaved }) {
  const { user, toast } = useApp();
  const [f, setF] = useState({
    title: task.title || '', description: task.description || '', due_at: toLocalInput(task.due_at || new Date(Date.now() + 86400e3)),
    assigned_to: task.assigned_to || user.id, contact_id: task.contact_id || null,
  });
  const [contact, setContact] = useState(task.contact || null);
  const [pick, setPick] = useState(false);
  useEffect(() => { if (task.contact_id && !task.contact) api.get(`/contacts/${task.contact_id}`).then(setContact); }, [task]);

  const save = async () => {
    try {
      const body = { ...f, due_at: fromLocalInput(f.due_at), contact_id: contact?.id || null };
      if (task.id) await api.put(`/tasks/${task.id}`, body);
      else await api.post('/tasks', body);
      onSaved();
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  return (
    <Sheet title={task.id ? 'Edit task' : 'New task'} onClose={onClose} footer={
      <>
        {task.id && <button className="btn" onClick={async () => { await api.del(`/tasks/${task.id}`); onSaved(); }}><Trash2 size={16} /></button>}
        <button className="btn primary grow" disabled={!f.title} onClick={save}>Save</button>
      </>
    }>
      <div className="stack">
        <Field label="Title"><input className="input" autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Description"><textarea className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Due"><input className="input" type="datetime-local" value={f.due_at} onChange={(e) => setF({ ...f, due_at: e.target.value })} /></Field>
        <Field label="Assignee"><UserSelect value={f.assigned_to} onChange={(v) => setF({ ...f, assigned_to: v })} /></Field>
        <Field label="Contact"><button type="button" className="input" style={{ textAlign: 'left' }} onClick={() => setPick(true)}>{contact?.name || 'None — tap to link a contact'}</button></Field>
      </div>
      {pick && <ContactPicker onClose={() => setPick(false)} onPick={(c) => { setContact(c); setPick(false); }} />}
    </Sheet>
  );
}
