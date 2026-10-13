import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../app-context.jsx';
import { Field, Spinner, TopBar, UserSelect } from '../components/ui.jsx';

const BLANK = {
  first_name: '', last_name: '', phone: '', email: '', company: '', job_title: '', website: '', address: '', city: '', state: '',
  postal_code: '', country: '', date_of_birth: '', source: '', type: 'lead', assigned_to: null, tags: [], custom: {},
};

export default function ContactForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { user, toast } = useApp();
  const [form, setForm] = useState(null);
  const [fields, setFields] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/contacts/custom-fields').then(setFields);
    if (id) api.get(`/contacts/${id}`).then((c) => setForm({ ...BLANK, ...Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v ?? ''])), assigned_to: c.assigned_to }));
    else {
      const pre = Object.fromEntries([...params.entries()]);
      setForm({ ...BLANK, assigned_to: user.id, source: pre.source || 'mobile app', ...pre });
    }
  }, [id]); // eslint-disable-line

  if (!form) return <Spinner />;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setCustom = (k, v) => setForm({ ...form, custom: { ...form.custom, [k]: v } });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { ...form, tags: tagInput ? [...form.tags, tagInput.toLowerCase()] : form.tags };
      const c = id ? await api.put(`/contacts/${id}`, body) : await api.post('/contacts', body);
      toast(id ? 'Contact updated' : 'Contact created', 'success');
      nav(`/contacts/${c.id}`, { replace: true });
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="page" onSubmit={save}>
      <TopBar back title={id ? 'Edit contact' : 'New contact'} right={<button className="btn primary sm" disabled={busy}>Save</button>} />
      <div className="container stack">
        <div className="card pad stack">
          <div className="grid2">
            <Field label="First name"><input className="input" value={form.first_name} onChange={set('first_name')} /></Field>
            <Field label="Last name"><input className="input" value={form.last_name} onChange={set('last_name')} /></Field>
          </div>
          <Field label="Phone"><input className="input" type="tel" value={form.phone} onChange={set('phone')} placeholder="+1 555 123 4567" /></Field>
          <Field label="Email"><input className="input" type="email" value={form.email} onChange={set('email')} /></Field>
          <div className="grid2">
            <Field label="Company"><input className="input" value={form.company} onChange={set('company')} /></Field>
            <Field label="Job title"><input className="input" value={form.job_title} onChange={set('job_title')} /></Field>
          </div>
          <Field label="Website"><input className="input" value={form.website} onChange={set('website')} /></Field>
        </div>
        <div className="card pad stack">
          <Field label="Street address"><input className="input" value={form.address} onChange={set('address')} /></Field>
          <div className="grid2">
            <Field label="City"><input className="input" value={form.city} onChange={set('city')} /></Field>
            <Field label="State"><input className="input" value={form.state} onChange={set('state')} /></Field>
            <Field label="Postal code"><input className="input" value={form.postal_code} onChange={set('postal_code')} /></Field>
            <Field label="Country"><input className="input" value={form.country} onChange={set('country')} /></Field>
          </div>
          <Field label="Date of birth"><input className="input" type="date" value={form.date_of_birth} onChange={set('date_of_birth')} /></Field>
        </div>
        <div className="card pad stack">
          <div className="grid2">
            <Field label="Type"><select className="input" value={form.type} onChange={set('type')}><option value="lead">Lead</option><option value="customer">Customer</option></select></Field>
            <Field label="Source"><input className="input" value={form.source} onChange={set('source')} /></Field>
          </div>
          <Field label="Assigned to"><UserSelect value={form.assigned_to} onChange={(v) => setForm({ ...form, assigned_to: v })} /></Field>
          {!id && (
            <Field label="Tags">
              <div className="row wrap" style={{ gap: 6 }}>
                {form.tags.map((t) => <span key={t} className="tag-chip">{t}<button type="button" onClick={() => setForm({ ...form, tags: form.tags.filter((x) => x !== t) })}>×</button></span>)}
              </div>
              <input className="input" placeholder="Type a tag and press Enter" value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (tagInput) { setForm({ ...form, tags: [...form.tags, tagInput.toLowerCase()] }); setTagInput(''); } } }} />
            </Field>
          )}
        </div>
        {fields.length > 0 && (
          <div className="card pad stack">
            <div className="bold">Custom fields</div>
            {fields.map((f) => (
              <Field key={f.id} label={f.name}>
                {f.type === 'select' ? (
                  <select className="input" value={form.custom[f.key] || ''} onChange={(e) => setCustom(f.key, e.target.value)}>
                    <option value="">—</option>{f.options.map((o) => <option key={o}>{o}</option>)}
                  </select>
                ) : f.type === 'checkbox' ? (
                  <input type="checkbox" checked={!!form.custom[f.key]} onChange={(e) => setCustom(f.key, e.target.checked)} />
                ) : (
                  <input className="input" type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} value={form.custom[f.key] ?? ''} onChange={(e) => setCustom(f.key, e.target.value)} />
                )}
              </Field>
            ))}
          </div>
        )}
        <button className="btn primary block" disabled={busy}>{id ? 'Save changes' : 'Create contact'}</button>
      </div>
    </form>
  );
}
