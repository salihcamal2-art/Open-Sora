import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Smartphone } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../app-context.jsx';
import { Field, TopBar } from '../components/ui.jsx';
import { parseCSV } from '../utils.js';

const TARGETS = ['', 'first_name', 'last_name', 'name', 'email', 'phone', 'company', 'job_title', 'address', 'city', 'state', 'postal_code', 'country', 'source', 'tags'];

function guess(h) {
  const s = h.toLowerCase().replace(/[^a-z]/g, '');
  if (s.includes('first')) return 'first_name';
  if (s.includes('last') || s.includes('surname')) return 'last_name';
  if (s === 'name' || s === 'fullname') return 'name';
  if (s.includes('mail')) return 'email';
  if (s.includes('phone') || s.includes('mobile') || s.includes('tel')) return 'phone';
  if (s.includes('company') || s.includes('organization')) return 'company';
  if (s.includes('title')) return 'job_title';
  if (s.includes('city')) return 'city';
  if (s.includes('country')) return 'country';
  if (s.includes('tag')) return 'tags';
  return '';
}

export default function ImportContacts() {
  const nav = useNavigate();
  const { toast } = useApp();
  const [rows, setRows] = useState(null);
  const [map, setMap] = useState([]);
  const [tag, setTag] = useState('imported');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (f) => {
    const all = parseCSV(await f.text());
    if (all.length < 2) return toast('CSV needs a header row and at least one contact', 'error');
    setRows(all);
    setMap(all[0].map(guess));
  };

  // Android Chrome / some browsers support the Contact Picker API
  const fromPhone = async () => {
    if (!('contacts' in navigator)) return toast('Phone contact picker is not supported in this browser. Export your contacts as CSV instead.', 'error');
    try {
      const picked = await navigator.contacts.select(['name', 'email', 'tel'], { multiple: true });
      const out = picked.map((p) => {
        const [first_name, ...rest] = (p.name?.[0] || '').split(' ');
        return { first_name, last_name: rest.join(' '), email: p.email?.[0], phone: p.tel?.[0], source: 'phone contacts' };
      });
      submit(out);
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const submit = async (list) => {
    setBusy(true);
    try {
      const r = await api.post('/contacts/import', { rows: list, tags: tag ? [tag] : [] });
      setResult(r);
      toast(`Imported ${r.created} contacts`, 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const importCsv = () => {
    const list = rows.slice(1).map((r) => {
      const o = {};
      map.forEach((target, i) => {
        if (!target || !r[i]) return;
        if (target === 'name') {
          const [first, ...rest] = r[i].trim().split(' ');
          o.first_name = first;
          o.last_name = rest.join(' ');
        } else o[target] = r[i].trim();
      });
      return o;
    });
    submit(list);
  };

  return (
    <div className="page">
      <TopBar back title="Import contacts" />
      <div className="container stack">
        <div className="card pad stack">
          <label className="btn primary block"><Upload size={18} /> Choose CSV file<input type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files[0] && onFile(e.target.files[0])} /></label>
          <button className="btn block" onClick={fromPhone} disabled={busy}><Smartphone size={18} /> Import from phone contacts</button>
          <Field label="Tag imported contacts with"><input className="input" value={tag} onChange={(e) => setTag(e.target.value)} /></Field>
        </div>
        {rows && (
          <div className="card pad stack">
            <div className="bold">Map columns ({rows.length - 1} rows)</div>
            {rows[0].map((h, i) => (
              <div key={i} className="row">
                <div className="grow"><div className="small bold">{h}</div><div className="faint ellipsis">{rows[1]?.[i]}</div></div>
                <select className="input" style={{ width: 160 }} value={map[i]} onChange={(e) => setMap(map.map((m, j) => (j === i ? e.target.value : m)))}>
                  {TARGETS.map((t) => <option key={t} value={t}>{t || '— skip —'}</option>)}
                </select>
              </div>
            ))}
            <button className="btn primary block" disabled={busy} onClick={importCsv}>{busy ? 'Importing…' : 'Import'}</button>
          </div>
        )}
        {result && (
          <div className="card pad">
            <div className="bold">Created {result.created}, skipped {result.skipped}</div>
            {result.errors.map((e) => <div key={e} className="faint">{e}</div>)}
            <button className="btn block" style={{ marginTop: 10 }} onClick={() => nav('/contacts')}>View contacts</button>
          </div>
        )}
      </div>
    </div>
  );
}
