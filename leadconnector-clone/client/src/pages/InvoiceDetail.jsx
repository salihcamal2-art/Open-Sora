import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Send, Pencil, Copy, Ban, DollarSign, Trash2, ExternalLink } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../app-context.jsx';
import { Field, Sheet, Spinner, StatusBadge, TopBar } from '../components/ui.jsx';
import { fmtDateTime, money } from '../utils.js';

export default function InvoiceDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { toast } = useApp();
  const [inv, setInv] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [pay, setPay] = useState({ amount: '', method: 'cash', note: '' });
  const [channels, setChannels] = useState(['sms']);

  const load = () => api.get(`/payments/invoices/${id}`).then((i) => { setInv(i); setPay((p) => ({ ...p, amount: (i.total - i.amount_paid).toFixed(2) })); });
  useEffect(() => { load(); }, [id]); // eslint-disable-line
  if (!inv) return <Spinner />;
  const payUrl = `${window.location.origin}/pay/${inv.pay_url.split('/pay/')[1]}`;
  const act = async (fn, msg) => { try { await fn(); toast(msg, 'success'); setSheet(null); load(); } catch (e) { toast(e.message, 'error'); } };

  return (
    <div className="page">
      <TopBar back="/payments" title={inv.number} right={['draft', 'sent'].includes(inv.status) && <Link className="icon-btn" to={`/payments/invoices/${id}/edit`}><Pencil size={20} /></Link>} />
      <div className="container stack">
        <div className="card pad" style={{ textAlign: 'center' }}>
          <StatusBadge status={inv.display_status} />
          <div style={{ fontSize: 32, fontWeight: 800, margin: '6px 0' }}>{money(inv.total)}</div>
          <div className="faint">Paid {money(inv.amount_paid)} · Due {money(inv.total - inv.amount_paid)}</div>
          <div className="faint">Billed to <Link to={`/contacts/${inv.contact?.id}`}>{inv.contact?.name}</Link></div>
        </div>
        {inv.status !== 'void' && inv.status !== 'paid' && (
          <div className="grid2">
            <button className="btn primary" onClick={() => setSheet('send')}><Send size={16} /> {inv.status === 'draft' ? 'Send' : 'Resend'}</button>
            <button className="btn" onClick={() => setSheet('pay')}><DollarSign size={16} /> Record payment</button>
            {inv.status !== 'draft' && <button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(payUrl); toast('Payment link copied', 'success'); } catch { prompt('Payment link', payUrl); } }}><Copy size={16} /> Copy pay link</button>}
            {inv.status !== 'draft' && <a className="btn" href={payUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Preview</a>}
          </div>
        )}
        <div className="card pad">
          <div className="row between"><span className="bold">{inv.title}</span><span className="faint">Issued {inv.issue_date} · Due {inv.due_date || '—'}</span></div>
          <table className="tbl" style={{ marginTop: 8 }}>
            <tbody>
              {inv.items.map((it, i) => <tr key={i}><td>{it.name}</td><td className="faint">×{it.qty}</td><td style={{ textAlign: 'right' }}>{money(it.price * it.qty)}</td></tr>)}
              <tr><td colSpan={2} className="faint">Subtotal</td><td style={{ textAlign: 'right' }}>{money(inv.subtotal)}</td></tr>
              {inv.discount > 0 && <tr><td colSpan={2} className="faint">Discount</td><td style={{ textAlign: 'right' }}>−{money(inv.discount)}</td></tr>}
              {inv.tax_rate > 0 && <tr><td colSpan={2} className="faint">Tax ({inv.tax_rate}%)</td><td style={{ textAlign: 'right' }}>{money(inv.total - Math.max(0, inv.subtotal - inv.discount))}</td></tr>}
              <tr><td colSpan={2} className="bold">Total</td><td className="bold" style={{ textAlign: 'right' }}>{money(inv.total)}</td></tr>
            </tbody>
          </table>
          {inv.notes && <div className="faint" style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{inv.notes}</div>}
        </div>
        {inv.transactions.length > 0 && (
          <div className="card pad">
            <div className="bold">Payments</div>
            {inv.transactions.map((t) => <div key={t.id} className="row between" style={{ padding: '6px 0' }}><span className="faint">{fmtDateTime(t.created_at)} · {t.method}</span><span>{money(t.amount)} <StatusBadge status={t.status} /></span></div>)}
          </div>
        )}
        {inv.status === 'draft' && <button className="btn block" style={{ color: 'var(--danger)' }} onClick={() => act(async () => { await api.del(`/payments/invoices/${id}`); nav('/payments'); }, 'Deleted')}><Trash2 size={16} /> Delete draft</button>}
        {['sent', 'partially_paid'].includes(inv.status) && <button className="btn block" onClick={() => confirm('Void this invoice?') && act(() => api.post(`/payments/invoices/${id}/void`, {}), 'Invoice voided')}><Ban size={16} /> Void invoice</button>}
      </div>

      {sheet === 'send' && (
        <Sheet title="Send invoice" onClose={() => setSheet(null)} footer={<button className="btn primary block" disabled={!channels.length} onClick={() => act(() => api.post(`/payments/invoices/${id}/send`, { channels }), 'Invoice sent')}>Send</button>}>
          <div className="faint" style={{ marginBottom: 10 }}>The customer receives a secure link to view and pay the invoice online (Text2Pay).</div>
          {[['sms', 'SMS', inv.contact?.phone], ['email', 'Email', inv.contact?.email], ['whatsapp', 'WhatsApp', inv.contact?.phone]].map(([k, l, to]) => (
            <label key={k} className="list-item" style={{ opacity: to ? 1 : 0.4 }}>
              <input type="checkbox" disabled={!to} checked={channels.includes(k)} onChange={(e) => setChannels(e.target.checked ? [...channels, k] : channels.filter((c) => c !== k))} />
              <span className="grow">{l}</span><span className="faint">{to || 'missing'}</span>
            </label>
          ))}
        </Sheet>
      )}
      {sheet === 'pay' && (
        <Sheet title="Record payment" onClose={() => setSheet(null)} footer={<button className="btn primary block" onClick={() => act(() => api.post(`/payments/invoices/${id}/payments`, { ...pay, amount: Number(pay.amount) }), 'Payment recorded')}>Record {money(pay.amount)}</button>}>
          <div className="stack">
            <Field label="Amount"><input className="input" type="number" step="0.01" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
            <Field label="Method"><select className="input" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}><option value="cash">Cash</option><option value="card">Card (manual)</option><option value="bank_transfer">Bank transfer</option><option value="cheque">Cheque</option><option value="other">Other</option></select></Field>
            <Field label="Note"><input className="input" value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} /></Field>
          </div>
        </Sheet>
      )}
    </div>
  );
}
