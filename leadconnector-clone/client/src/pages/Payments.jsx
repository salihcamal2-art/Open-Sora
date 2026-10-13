import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, FileText, CreditCard, ShoppingBag, RotateCcw } from 'lucide-react';
import { api } from '../api.js';
import { useApp, useLive } from '../app-context.jsx';
import { Empty, Spinner, StatusBadge, Tabs, TopBar } from '../components/ui.jsx';
import { fmtDateTime, money } from '../utils.js';

export default function Payments() {
  const nav = useNavigate();
  const { toast } = useApp();
  const [tab, setTab] = useState('invoices');
  const [status, setStatus] = useState('all');
  const [summary, setSummary] = useState(null);
  const [items, setItems] = useState(null);

  const load = async () => {
    try {
      setSummary(await api.get('/payments/summary'));
      setItems(null);
      setItems(tab === 'invoices' ? await api.get('/payments/invoices', { status }) : await api.get('/payments/transactions'));
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  useEffect(() => { load(); }, [tab, status]); // eslint-disable-line
  useLive(['payment.received'], load);

  const refund = async (t) => {
    if (!confirm(`Refund ${money(t.amount)}?`)) return;
    try { await api.post(`/payments/transactions/${t.id}/refund`, {}); load(); } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="page">
      <TopBar title="Payments" right={<Link className="icon-btn" to="/payments/invoices/new"><Plus size={22} /></Link>} />
      <div className="container stack">
        {summary && (
          <div className="grid2">
            <div className="card stat"><div className="l">Collected (30d)</div><div className="v" style={{ color: 'var(--success)' }}>{money(summary.revenue_30d)}</div></div>
            <div className="card stat"><div className="l">Outstanding</div><div className="v">{money(summary.outstanding)}</div><div className="faint">{summary.overdue} overdue</div></div>
          </div>
        )}
        <div className="row">
          <Link className="btn primary grow" to="/payments/invoices/new"><FileText size={16} /> New invoice</Link>
          <Link className="btn grow" to="/payments/pos"><CreditCard size={16} /> Point of sale</Link>
          <Link className="btn" to="/settings/products"><ShoppingBag size={16} /></Link>
        </div>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'invoices', label: 'Invoices' }, { value: 'transactions', label: 'Transactions' }]} />
      {tab === 'invoices' && (
        <div className="tabs" style={{ paddingTop: 0 }}>
          {['all', 'draft', 'sent', 'partially_paid', 'paid', 'overdue', 'void'].map((s) => (
            <button key={s} className={`tab ${status === s ? 'active' : ''}`} onClick={() => setStatus(s)}>{s.replace('_', ' ')}</button>
          ))}
        </div>
      )}
      {!items ? <Spinner /> : items.length === 0 ? <Empty icon={FileText} title={`No ${tab}`} /> : tab === 'invoices' ? (
        <div className="list">
          {items.map((i) => (
            <button key={i.id} className="list-item" onClick={() => nav(`/payments/invoices/${i.id}`)}>
              <div className="grow">
                <div className="title">{i.contact?.name || '—'}</div>
                <div className="faint">{i.number} · {i.title} · due {i.due_date || '—'}</div>
              </div>
              <div style={{ textAlign: 'right' }}><div className="bold">{money(i.total)}</div><StatusBadge status={i.display_status} /></div>
            </button>
          ))}
        </div>
      ) : (
        <div className="list">
          {items.map((t) => (
            <div key={t.id} className="list-item">
              <div className="grow">
                <div className="title">{t.contact_name || 'Walk-in customer'}</div>
                <div className="faint">{fmtDateTime(t.created_at)} · {t.method}{t.invoice_number ? ` · ${t.invoice_number}` : ''}{t.note ? ` · ${t.note}` : ''}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="bold" style={{ textDecoration: t.status === 'refunded' ? 'line-through' : 'none' }}>{money(t.amount)}</div>
                <StatusBadge status={t.status} />
              </div>
              {t.status === 'succeeded' && <button className="icon-btn" title="Refund" onClick={() => refund(t)}><RotateCcw size={16} /></button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
