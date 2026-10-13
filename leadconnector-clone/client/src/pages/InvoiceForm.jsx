import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../app-context.jsx';
import { Field, Sheet, Spinner, TopBar } from '../components/ui.jsx';
import ContactPicker from '../components/ContactPicker.jsx';
import { money, ymd } from '../utils.js';

export default function InvoiceForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { toast } = useApp();
  const [f, setF] = useState(null);
  const [contact, setContact] = useState(null);
  const [products, setProducts] = useState([]);
  const [pick, setPick] = useState(false);
  const [prodSheet, setProdSheet] = useState(false);

  useEffect(() => {
    api.get('/payments/products').then(setProducts);
    if (id) api.get(`/payments/invoices/${id}`).then((i) => { setF(i); setContact(i.contact); });
    else {
      setF({ title: 'Invoice', items: [], discount: 0, tax_rate: 0, issue_date: ymd(new Date()), due_date: ymd(Date.now() + 7 * 86400e3), notes: '' });
      if (params.get('contact')) api.get(`/contacts/${params.get('contact')}`).then(setContact);
    }
  }, [id]); // eslint-disable-line

  if (!f) return <Spinner />;
  const setItem = (i, k, v) => setF({ ...f, items: f.items.map((it, j) => (j === i ? { ...it, [k]: v } : it)) });
  const subtotal = f.items.reduce((s, it) => s + Number(it.price || 0) * Number(it.qty || 1), 0);
  const taxed = Math.max(0, subtotal - Number(f.discount || 0));
  const total = taxed + (taxed * Number(f.tax_rate || 0)) / 100;

  const save = async (andSend) => {
    if (!contact) return toast('Select a customer', 'error');
    try {
      const body = { ...f, contact_id: contact.id, items: f.items.map((it) => ({ ...it, price: Number(it.price), qty: Number(it.qty || 1) })) };
      const inv = id ? await api.put(`/payments/invoices/${id}`, body) : await api.post('/payments/invoices', body);
      if (andSend) await api.post(`/payments/invoices/${inv.id}/send`, { channels: [contact.phone ? 'sms' : 'email', ...(contact.phone && contact.email ? ['email'] : [])] });
      toast(andSend ? 'Invoice sent' : 'Invoice saved', 'success');
      nav(`/payments/invoices/${inv.id}`, { replace: true });
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  return (
    <div className="page">
      <TopBar back title={id ? `Edit ${f.number}` : 'New invoice'} />
      <div className="container stack">
        <div className="card pad stack">
          <Field label="Customer"><button className="input" style={{ textAlign: 'left' }} onClick={() => setPick(true)}>{contact?.name || 'Select customer…'}</button></Field>
          <Field label="Title"><input className="input" value={f.title || ''} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <div className="grid2">
            <Field label="Issue date"><input className="input" type="date" value={f.issue_date || ''} onChange={(e) => setF({ ...f, issue_date: e.target.value })} /></Field>
            <Field label="Due date"><input className="input" type="date" value={f.due_date || ''} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></Field>
          </div>
        </div>
        <div className="card pad stack">
          <div className="row between"><span className="bold">Line items</span>
            <div className="row"><button className="btn sm" onClick={() => setProdSheet(true)}>+ Product</button><button className="btn sm" onClick={() => setF({ ...f, items: [...f.items, { name: '', price: 0, qty: 1 }] })}><Plus size={14} /> Custom</button></div>
          </div>
          {f.items.length === 0 && <div className="faint">No items yet</div>}
          {f.items.map((it, i) => (
            <div key={i} className="stack" style={{ gap: 6, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
              <div className="row"><input className="input" placeholder="Item name" value={it.name} onChange={(e) => setItem(i, 'name', e.target.value)} /><button className="icon-btn" onClick={() => setF({ ...f, items: f.items.filter((_, j) => j !== i) })}><Trash2 size={16} /></button></div>
              <div className="row">
                <input className="input" type="number" min="0" step="0.01" placeholder="Price" value={it.price} onChange={(e) => setItem(i, 'price', e.target.value)} />
                <input className="input" type="number" min="1" style={{ width: 80 }} value={it.qty} onChange={(e) => setItem(i, 'qty', e.target.value)} />
                <span className="bold" style={{ width: 90, textAlign: 'right' }}>{money(Number(it.price || 0) * Number(it.qty || 1))}</span>
              </div>
            </div>
          ))}
          <div className="grid2">
            <Field label="Discount (amount)"><input className="input" type="number" min="0" value={f.discount} onChange={(e) => setF({ ...f, discount: e.target.value })} /></Field>
            <Field label="Tax %"><input className="input" type="number" min="0" value={f.tax_rate} onChange={(e) => setF({ ...f, tax_rate: e.target.value })} /></Field>
          </div>
          <div className="row between"><span className="faint">Subtotal</span><span>{money(subtotal)}</span></div>
          <div className="row between"><span className="bold">Total</span><span className="bold" style={{ fontSize: 20 }}>{money(total)}</span></div>
        </div>
        <div className="card pad"><Field label="Notes / terms"><textarea className="input" value={f.notes || ''} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field></div>
        <div className="row">
          <button className="btn grow" onClick={() => save(false)}>Save draft</button>
          <button className="btn primary grow" onClick={() => save(true)}>Save & send</button>
        </div>
      </div>
      {pick && <ContactPicker title="Customer" onClose={() => setPick(false)} onPick={(c) => { setContact(c); setPick(false); }} />}
      {prodSheet && (
        <Sheet title="Add product" onClose={() => setProdSheet(false)}>
          {products.length === 0 && <div className="faint">No products yet. Add them in Settings → Products.</div>}
          {products.map((p) => (
            <button key={p.id} className="list-item" onClick={() => { setF({ ...f, items: [...f.items, { name: p.name, price: p.price, qty: 1, product_id: p.id }] }); setProdSheet(false); }}>
              <span className="grow">{p.name}</span><span className="bold">{money(p.price)}</span>
            </button>
          ))}
        </Sheet>
      )}
    </div>
  );
}
