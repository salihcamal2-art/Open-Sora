import { useEffect, useState } from 'react';
import { Copy, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '../../api.js';
import { useApp } from '../../app-context.jsx';
import { TopBar } from '../../components/ui.jsx';

function CopyRow({ label, value }) {
  const { toast } = useApp();
  return (
    <div className="stack" style={{ gap: 4, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <span className="small bold">{label}</span>
      <div className="row">
        <code className="grow small" style={{ wordBreak: 'break-all', background: 'var(--surface-2)', padding: 8, borderRadius: 8 }}>{value}</code>
        <button className="icon-btn" onClick={async () => { try { await navigator.clipboard.writeText(value); toast('Copied', 'success'); } catch { prompt(label, value); } }}><Copy size={16} /></button>
      </div>
    </div>
  );
}

export default function Integrations() {
  const { location, setLocation, toast } = useApp();
  const [providers, setProviders] = useState(null);
  useEffect(() => { api.get('/dashboard').then((d) => setProviders(d.providers)); }, []);
  const origin = window.location.origin;
  const key = location.settings?.api_key;

  const regen = async () => {
    if (key && !confirm('Regenerate API key? Existing forms/integrations will stop working until updated.')) return;
    const r = await api.post('/auth/location/api-key', {});
    setLocation({ ...location, settings: { ...location.settings, api_key: r.api_key } });
    toast('New API key generated', 'success');
  };

  return (
    <div className="page">
      <TopBar back title="Integrations & API" />
      <div className="container stack">
        <div className="card pad">
          <div className="bold" style={{ marginBottom: 6 }}>Messaging providers</div>
          {providers && [['sms', 'SMS (Twilio)'], ['whatsapp', 'WhatsApp (Twilio)'], ['email', 'Email (SendGrid)'], ['stripe', 'Card payments (Stripe)'], ['ai', 'Conversation AI (Claude)']].map(([k, l]) => (
            <div key={k} className="row between" style={{ padding: '6px 0' }}>
              <span>{l}</span>
              {providers[k] ? <span className="badge green"><CheckCircle2 size={12} /> Connected</span> : <span className="badge orange"><XCircle size={12} /> {k === 'ai' ? 'Off' : 'Simulated'}</span>}
            </div>
          ))}
          <div className="faint" style={{ marginTop: 6 }}>Set TWILIO_* / SENDGRID_* / STRIPE_* / ANTHROPIC_API_KEY in the server's .env to switch each one from simulated to live.</div>
        </div>
        <div className="card pad">
          <div className="row between"><span className="bold">API key</span><button className="btn sm" onClick={regen}><RefreshCw size={14} /> {key ? 'Regenerate' : 'Generate'}</button></div>
          {key && <CopyRow label="X-Api-Key" value={key} />}
        </div>
        <div className="card pad">
          <div className="bold">Webhooks & endpoints</div>
          <CopyRow label="Twilio inbound SMS/WhatsApp webhook (POST)" value={`${origin}/api/public/twilio`} />
          <CopyRow label="Stripe webhook (event: checkout.session.completed)" value={`${origin}/api/public/stripe/webhook`} />
          <CopyRow label="Lead capture (website forms, Zapier) — POST JSON" value={`${origin}/api/public/leads/${location.id}?key=${key || 'YOUR_API_KEY'}`} />
          <CopyRow label="Inbound message from any channel — POST JSON" value={`${origin}/api/public/inbound/${location.id}?key=${key || 'YOUR_API_KEY'}`} />
          <CopyRow label="Live chat widget page" value={`${origin}/chat/${location.id}`} />
          <CopyRow label="Embed chat on your website" value={`<iframe src="${origin}/chat/${location.id}" style="position:fixed;bottom:16px;right:16px;width:360px;height:520px;border:0;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.2)"></iframe>`} />
        </div>
      </div>
    </div>
  );
}
