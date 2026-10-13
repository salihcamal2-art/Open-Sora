import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Trash2, User } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../app-context.jsx';
import { Field, Spinner, TopBar, UserSelect } from '../components/ui.jsx';
import ContactPicker from '../components/ContactPicker.jsx';

export default function OpportunityForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { user, toast } = useApp();
  const [pipelines, setPipelines] = useState([]);
  const [form, setForm] = useState(null);
  const [contact, setContact] = useState(null);
  const [pick, setPick] = useState(false);

  useEffect(() => {
    (async () => {
      const ps = await api.get('/opportunities/pipelines');
      setPipelines(ps);
      if (id) {
        const o = await api.get(`/opportunities/${id}`);
        setForm(o);
        setContact(o.contact);
      } else {
        const p = ps.find((x) => String(x.id) === params.get('pipeline')) || ps[0];
        setForm({ name: '', value: '', pipeline_id: p.id, stage_id: p.stages[0]?.id, status: 'open', source: '', assigned_to: user.id, lost_reason: '' });
        if (params.get('contact')) setContact(await api.get(`/contacts/${params.get('contact')}`));
      }
    })().catch((e) => toast(e.message, 'error'));
  }, [id]); // eslint-disable-line

  if (!form) return <Spinner />;
  const pipeline = pipelines.find((p) => p.id === Number(form.pipeline_id));
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    if (!contact) return toast('Select a contact', 'error');
    try {
      const body = { ...form, value: Number(form.value || 0), contact_id: contact.id, pipeline_id: Number(form.pipeline_id), stage_id: Number(form.stage_id) };
      if (id) await api.put(`/opportunities/${id}`, body);
      else await api.post('/opportunities', body);
      toast('Saved', 'success');
      nav('/opportunities');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <form className="page" onSubmit={save}>
      <TopBar back title={id ? 'Opportunity' : 'New opportunity'} right={<button className="btn primary sm">Save</button>} />
      <div className="container stack">
        <div className="card pad stack">
          <Field label="Contact">
            <div className="row">
              <button type="button" className="input" style={{ textAlign: 'left' }} onClick={() => setPick(true)}>{contact ? contact.name : 'Select contact…'}</button>
              {contact && <Link className="icon-btn" to={`/contacts/${contact.id}`}><User size={18} /></Link>}
            </div>
          </Field>
          <Field label="Opportunity name"><input className="input" value={form.name} onChange={set('name')} placeholder={contact ? contact.name : ''} /></Field>
          <Field label="Value"><input className="input" type="number" min="0" step="0.01" value={form.value} onChange={set('value')} /></Field>
        </div>
        <div className="card pad stack">
          <Field label="Pipeline">
            <select className="input" value={form.pipeline_id} onChange={(e) => { const p = pipelines.find((x) => x.id === Number(e.target.value)); setForm({ ...form, pipeline_id: p.id, stage_id: p.stages[0]?.id }); }}>
              {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Stage">
            <select className="input" value={form.stage_id} onChange={set('stage_id')}>
              {pipeline?.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <div className="row wrap" style={{ gap: 6 }}>
              {['open', 'won', 'lost', 'abandoned'].map((s) => <button type="button" key={s} className={`tab ${form.status === s ? 'active' : ''}`} onClick={() => setForm({ ...form, status: s })}>{s}</button>)}
            </div>
          </Field>
          {form.status === 'lost' && <Field label="Lost reason"><input className="input" value={form.lost_reason || ''} onChange={set('lost_reason')} /></Field>}
          <Field label="Source"><input className="input" value={form.source || ''} onChange={set('source')} /></Field>
          <Field label="Owner"><UserSelect value={form.assigned_to} onChange={(v) => setForm({ ...form, assigned_to: v })} /></Field>
        </div>
        <button className="btn primary block">Save</button>
        {id && <button type="button" className="btn block" style={{ color: 'var(--danger)' }} onClick={async () => { if (confirm('Delete opportunity?')) { await api.del(`/opportunities/${id}`); nav('/opportunities'); } }}><Trash2 size={16} /> Delete</button>}
      </div>
      {pick && <ContactPicker onClose={() => setPick(false)} onPick={(c) => { setContact(c); setPick(false); }} />}
    </form>
  );
}
