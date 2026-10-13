import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Minus, Plus, CheckCircle2 } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../app-context.jsx';
import { Field, TopBar } from '../components/ui.jsx';
import ContactPicker from '../components/ContactPicker.jsx';
import { money } from '../utils.js';

/** Point of sale: charge a custom amount or a basket of products (cash / manual card). */
export default function PointOfSale() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { toast } = useApp();
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState({});
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('card');
  const [contact, setContact] = useState(null);
  const [pick, setPick] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    api.get('/payments/products').then(setProducts);
    if (params.get('contact')) api.get(`/contacts/${params.get('contact')}`).then(setContact);
  }, []); // eslint-disable-line

  const items = products.filter((p) => cart[p.id]).map((p) => ({ name: p.name, price: p.price, qty: cart[p.id] }));
  const total = items.length ? items.reduce((s, i) => s + i.price * i.qty, 0) : Number(amount || 0);
  const add = (id, n) => setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] || 0) + n) }));

  const charge = async () => {
    try {
      const t = await api.post('/payments/charge', { contact_id: contact?.id, amount: total, method, items: items.length ? items : undefined });
      setDone(t);
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  if (done) {
    return (
      <div className="page">
        <TopBar back="/payments" title="Payment complete" />
        <div className="container" style={{ textAlign: 'center', paddingTop: 48 }}>
          <CheckCircle2 size={72} color="var(--success)" />
          <h2 style={{ marginTop: 12 }}>{money(done.amount)}</h2>
          <div className="faint">Paid by {done.method}{contact ? ` · ${contact.name}` : ''}</div>
          <div className="row" style={{ marginTop: 24 }}>
            <button className="btn grow" onClick={() => { setDone(null); setCart({}); setAmount(''); }}>New sale</button>
            <button className="btn primary grow" onClick={() => nav('/payments')}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <TopBar back title="Point of sale" />
      <div className="container stack">
        <div className="card pad stack">
          <Field label="Customer (optional)"><button className="input" style={{ textAlign: 'left' }} onClick={() => setPick(true)}>{contact?.name || 'Walk-in customer'}</button></Field>
          {!items.length && <Field label="Custom amount"><input className="input" style={{ fontSize: 28, fontWeight: 800 }} type="number" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>}
        </div>
        {products.length > 0 && (
          <div className="card">
            {products.map((p) => (
              <div key={p.id} className="list-item">
                <div className="grow"><div className="title">{p.name}</div><div className="faint">{money(p.price)}{p.type === 'recurring' ? ' / mo' : ''}</div></div>
                <button className="icon-btn" onClick={() => add(p.id, -1)} disabled={!cart[p.id]}><Minus size={16} /></button>
                <span className="bold" style={{ width: 20, textAlign: 'center' }}>{cart[p.id] || 0}</span>
                <button className="icon-btn" onClick={() => add(p.id, 1)}><Plus size={16} /></button>
              </div>
            ))}
          </div>
        )}
        <Field label="Payment method">
          <div className="row wrap" style={{ gap: 6 }}>
            {[['card', 'Card'], ['cash', 'Cash'], ['bank_transfer', 'Bank transfer'], ['other', 'Other']].map(([v, l]) => <button key={v} className={`tab ${method === v ? 'active' : ''}`} onClick={() => setMethod(v)}>{l}</button>)}
          </div>
        </Field>
        <button className="btn primary block" style={{ padding: 16, fontSize: 17 }} disabled={!(total > 0)} onClick={charge}>Charge {money(total)}</button>
      </div>
      {pick && <ContactPicker title="Customer" onClose={() => setPick(false)} onPick={(c) => { setContact(c); setPick(false); }} />}
    </div>
  );
}
