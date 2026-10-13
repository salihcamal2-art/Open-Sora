import { useEffect, useState } from 'react';
import { Star, Send, MessageCircle, Plus } from 'lucide-react';
import { api } from '../api.js';
import { useApp, useLive } from '../app-context.jsx';
import { Avatar, Empty, Field, Sheet, Spinner, Stars, Tabs, TopBar } from '../components/ui.jsx';
import ContactPicker from '../components/ContactPicker.jsx';
import { fmtDateTime, timeAgo } from '../utils.js';

export default function Reviews() {
  const { toast } = useApp();
  const [tab, setTab] = useState('reviews');
  const [filter, setFilter] = useState('');
  const [stats, setStats] = useState(null);
  const [items, setItems] = useState(null);
  const [requests, setRequests] = useState([]);
  const [reply, setReply] = useState(null);
  const [req, setReq] = useState(false);
  const [add, setAdd] = useState(false);

  const load = async () => {
    try {
      const q = filter === 'unreplied' ? { replied: 'false' } : filter ? { platform: filter } : {};
      const [s, r, rr] = await Promise.all([api.get('/reviews/stats'), api.get('/reviews', q), api.get('/reviews/requests')]);
      setStats(s); setItems(r); setRequests(rr);
    } catch (e) { toast(e.message, 'error'); }
  };
  useEffect(() => { load(); }, [filter]); // eslint-disable-line
  useLive(['review.created'], load);

  return (
    <div className="page">
      <TopBar title="Reputation" right={<button className="icon-btn" onClick={() => setReq(true)}><Send size={20} /></button>} />
      {stats && (
        <div className="container">
          <div className="card pad row" style={{ alignItems: 'stretch' }}>
            <div style={{ textAlign: 'center', paddingRight: 16, borderRight: '1px solid var(--border)' }}>
              <div style={{ fontSize: 40, fontWeight: 800 }}>{stats.average}</div>
              <Stars n={Math.round(stats.average)} />
              <div className="faint">{stats.total} reviews</div>
            </div>
            <div className="grow stack" style={{ gap: 4, justifyContent: 'center' }}>
              {[5, 4, 3, 2, 1].map((n) => (
                <div key={n} className="bar-row"><span style={{ width: 12 }}>{n}</span><div className="bar"><i style={{ width: `${stats.total ? (stats.distribution[n] / stats.total) * 100 : 0}%`, background: '#fdb022' }} /></div><span className="faint" style={{ width: 20 }}>{stats.distribution[n]}</span></div>
              ))}
            </div>
          </div>
          <div className="grid2" style={{ marginTop: 10 }}>
            <div className="card stat"><div className="l">Requests sent (30d)</div><div className="v">{stats.requests_30d}</div></div>
            <div className="card stat"><div className="l">Awaiting reply</div><div className="v" style={{ color: stats.unreplied ? 'var(--warning)' : undefined }}>{stats.unreplied}</div></div>
          </div>
          <button className="btn primary block" style={{ marginTop: 10 }} onClick={() => setReq(true)}><Send size={16} /> Send review request</button>
        </div>
      )}
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'reviews', label: 'Reviews' }, { value: 'requests', label: 'Requests' }]} />
      {tab === 'reviews' && (
        <div className="tabs" style={{ paddingTop: 0 }}>
          {[['', 'All'], ['unreplied', 'Not replied'], ['google', 'Google'], ['facebook', 'Facebook'], ['internal', 'Direct']].map(([v, l]) => <button key={v} className={`tab ${filter === v ? 'active' : ''}`} onClick={() => setFilter(v)}>{l}</button>)}
          <button className="tab" onClick={() => setAdd(true)}><Plus size={14} /> Add</button>
        </div>
      )}
      {!items ? <Spinner /> : tab === 'reviews' ? (
        items.length === 0 ? <Empty icon={Star} title="No reviews yet" /> : (
          <div className="container stack">
            {items.map((r) => (
              <div key={r.id} className="card pad">
                <div className="row">
                  <Avatar name={r.reviewer_name} size={36} />
                  <div className="grow"><div className="bold">{r.reviewer_name}</div><div className="faint">{r.platform} · {timeAgo(r.created_at)}</div></div>
                  <Stars n={r.rating} />
                </div>
                {r.body && <div style={{ marginTop: 8 }}>{r.body}</div>}
                {r.reply ? (
                  <div style={{ marginTop: 8, padding: 10, background: 'var(--surface-2)', borderRadius: 10 }}>
                    <div className="faint">Your reply · {fmtDateTime(r.replied_at)}</div>{r.reply}
                    <div><button className="btn ghost sm" style={{ padding: 0 }} onClick={() => setReply({ ...r, text: r.reply })}>Edit</button></div>
                  </div>
                ) : <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setReply({ ...r, text: '' })}><MessageCircle size={14} /> Reply</button>}
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="list">
          {requests.length === 0 && <Empty title="No requests sent yet" />}
          {requests.map((r) => (
            <div key={r.id} className="list-item"><div className="grow"><div className="title">{r.contact_name}</div><div className="faint">{r.channel} · {fmtDateTime(r.created_at)}</div></div><span className={`badge ${r.status === 'completed' ? 'green' : 'blue'}`}>{r.status}</span></div>
          ))}
        </div>
      )}

      {reply && (
        <Sheet title={`Reply to ${reply.reviewer_name}`} onClose={() => setReply(null)} footer={<button className="btn primary block" onClick={async () => { await api.post(`/reviews/${reply.id}/reply`, { reply: reply.text }); setReply(null); load(); }}>Post reply</button>}>
          <div className="faint" style={{ marginBottom: 8 }}><Stars n={reply.rating} /> {reply.body}</div>
          <div className="row wrap" style={{ gap: 6, marginBottom: 8 }}>
            {['Thank you so much for your kind words! 🙏', 'Thanks for the feedback — we would love to make this right. Please call us.', 'We appreciate you choosing us!'].map((t) => <button key={t} className="tab" onClick={() => setReply({ ...reply, text: t })}>{t.slice(0, 28)}…</button>)}
          </div>
          <textarea className="input" value={reply.text} onChange={(e) => setReply({ ...reply, text: e.target.value })} />
        </Sheet>
      )}
      {req && <ContactPicker title="Request a review from" onClose={() => setReq(false)} onPick={async (c) => {
        setReq(false);
        try { await api.post('/reviews/requests', { contact_id: c.id, channel: c.phone ? 'sms' : 'email' }); toast(`Review request sent to ${c.name}`, 'success'); load(); } catch (e) { toast(e.message, 'error'); }
      }} />}
      {add && <AddReview onClose={() => setAdd(false)} onSaved={() => { setAdd(false); load(); }} />}
    </div>
  );
}

function AddReview({ onClose, onSaved }) {
  const [f, setF] = useState({ reviewer_name: '', rating: 5, body: '', platform: 'google' });
  return (
    <Sheet title="Add review" onClose={onClose} footer={<button className="btn primary block" onClick={async () => { await api.post('/reviews', f); onSaved(); }}>Save</button>}>
      <div className="stack">
        <Field label="Reviewer"><input className="input" value={f.reviewer_name} onChange={(e) => setF({ ...f, reviewer_name: e.target.value })} /></Field>
        <Field label="Rating"><div className="row">{[1, 2, 3, 4, 5].map((n) => <button key={n} className="btn ghost" style={{ fontSize: 26, color: n <= f.rating ? '#fdb022' : 'var(--border)' }} onClick={() => setF({ ...f, rating: n })}>★</button>)}</div></Field>
        <Field label="Platform"><select className="input" value={f.platform} onChange={(e) => setF({ ...f, platform: e.target.value })}><option value="google">Google</option><option value="facebook">Facebook</option><option value="internal">Direct</option></select></Field>
        <Field label="Review"><textarea className="input" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
      </div>
    </Sheet>
  );
}
