import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useApp } from '../../app-context.jsx';
import { Field, TopBar } from '../../components/ui.jsx';

const TZ = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['UTC'];
const CUR = ['USD', 'EUR', 'GBP', 'AED', 'SAR', 'JOD', 'EGP', 'KWD', 'QAR', 'TRY', 'CAD', 'AUD', 'INR'];

export default function Business() {
  const [params] = useSearchParams();
  const isNew = params.get('new') === '1';
  const nav = useNavigate();
  const { location, setLocation, switchLocation, toast } = useApp();
  const [f, setF] = useState(isNew ? { name: '', email: '', phone: '', address: '', website: '', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, currency: 'USD', review_link: '' } : { ...location });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    try {
      if (isNew) {
        const l = await api.post('/auth/locations', f);
        await switchLocation(l.id);
        toast('Sub-account created', 'success');
        nav('/');
      } else {
        setLocation(await api.put('/auth/location', f));
        toast('Saved', 'success');
      }
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="page">
      <TopBar back title={isNew ? 'New sub-account' : 'Business profile'} right={<button className="btn primary sm" onClick={save}>Save</button>} />
      <div className="container stack">
        <div className="card pad stack">
          <Field label="Business name"><input className="input" value={f.name || ''} onChange={set('name')} /></Field>
          <Field label="Email"><input className="input" value={f.email || ''} onChange={set('email')} /></Field>
          <Field label="Phone (your SMS number)"><input className="input" value={f.phone || ''} onChange={set('phone')} /></Field>
          <Field label="Address"><input className="input" value={f.address || ''} onChange={set('address')} /></Field>
          <Field label="Website"><input className="input" value={f.website || ''} onChange={set('website')} /></Field>
        </div>
        <div className="card pad stack">
          <Field label="Time zone"><select className="input" value={f.timezone || 'UTC'} onChange={set('timezone')}>{TZ.map((t) => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Currency"><select className="input" value={f.currency || 'USD'} onChange={set('currency')}>{CUR.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Google / Facebook review link"><input className="input" value={f.review_link || ''} onChange={set('review_link')} placeholder="https://g.page/r/…/review" /></Field>
        </div>
        <button className="btn primary block" onClick={save}>Save</button>
      </div>
    </div>
  );
}
