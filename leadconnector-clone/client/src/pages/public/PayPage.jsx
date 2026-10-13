import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Lock } from 'lucide-react';
import { api } from '../../api.js';
import { Spinner, StatusBadge } from '../../components/ui.jsx';
import { money } from '../../utils.js';

/** Public invoice payment page (Text2Pay): /pay/:token */
export default function PayPage() {
  const { token } = useParams();
  const [inv, setInv] = useState(null);
  const [err, setErr] = useState('');
  const [card, setCard] = useState({ name: '', number: '', exp: '', cvc: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get(`/public/invoices/${token}`).then(setInv).catch((e) => setErr(e.message)); }, [token]);
  if (err && !inv) return <div className="public-wrap"><div className="card pad public-card">{err}</div></div>;
  if (!inv) return <Spinner />;
  const cur = inv.location.currency;
  const due = inv.total - inv.amount_paid;

  const pay = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { setInv({ ...inv, ...(await api.post(`/public/invoices/${token}/pay`, { card_number: card.number })) }); } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };

  return (
    <div className="public-wrap">
      <div className="card public-card">
        <div style={{ padding: 18, borderBottom: '1px solid var(--border)' }}>
          <div className="row between"><h2>{inv.location.name}</h2><StatusBadge status={inv.display_status} /></div>
          <div className="faint">{inv.location.address} {inv.location.email}</div>
        </div>
        <div style={{ padding: 18 }} className="stack">
          <div className="row between"><span className="faint">Invoice</span><span className="bold">{inv.number}</span></div>
          <div className="row between"><span className="faint">Billed to</span><span>{inv.contact?.name}</span></div>
          <div className="row between"><span className="faint">Due date</span><span>{inv.due_date || '—'}</span></div>
          <table className="tbl"><tbody>
            {inv.items.map((it, i) => <tr key={i}><td>{it.name} ×{it.qty}</td><td style={{ textAlign: 'right' }}>{money(it.price * it.qty, cur)}</td></tr>)}
            {inv.discount > 0 && <tr><td className="faint">Discount</td><td style={{ textAlign: 'right' }}>−{money(inv.discount, cur)}</td></tr>}
            {inv.tax_rate > 0 && <tr><td className="faint">Tax {inv.tax_rate}%</td><td style={{ textAlign: 'right' }}>{money(inv.total - Math.max(0, inv.subtotal - inv.discount), cur)}</td></tr>}
            <tr><td className="bold">Total</td><td className="bold" style={{ textAlign: 'right' }}>{money(inv.total, cur)}</td></tr>
            {inv.amount_paid > 0 && <tr><td className="faint">Paid</td><td style={{ textAlign: 'right' }}>−{money(inv.amount_paid, cur)}</td></tr>}
          </tbody></table>
          {inv.notes && <div className="faint" style={{ whiteSpace: 'pre-wrap' }}>{inv.notes}</div>}
          {inv.status === 'paid' ? (
            <div style={{ textAlign: 'center', padding: 16 }}><CheckCircle2 size={56} color="var(--success)" /><h3>Paid in full — thank you!</h3></div>
          ) : inv.status === 'void' ? <div className="badge">This invoice has been voided</div> : (
            <form className="stack" onSubmit={pay}>
              <div className="bold">Pay {money(due, cur)}</div>
              <input className="input" required placeholder="Name on card" value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} />
              <input className="input" required inputMode="numeric" placeholder="Card number" value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value.replace(/[^\d ]/g, '').slice(0, 19) })} />
              <div className="grid2">
                <input className="input" required placeholder="MM / YY" value={card.exp} onChange={(e) => setCard({ ...card, exp: e.target.value })} />
                <input className="input" required inputMode="numeric" placeholder="CVC" value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value.slice(0, 4) })} />
              </div>
              {err && <div style={{ color: 'var(--danger)' }}>{err}</div>}
              <button className="btn primary block" disabled={busy}><Lock size={16} /> {busy ? 'Processing…' : `Pay ${money(due, cur)}`}</button>
              <div className="faint" style={{ textAlign: 'center' }}>Payments are processed securely.</div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
