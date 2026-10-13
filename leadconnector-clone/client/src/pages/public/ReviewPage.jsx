import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { Spinner } from '../../components/ui.jsx';

/** Review funnel: happy customers (4-5★) are sent on to Google/Facebook, others give private feedback. */
export default function ReviewPage() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState('');
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [done, setDone] = useState(null);

  useEffect(() => { api.get(`/public/reviews/${token}`).then(setInfo).catch((e) => setErr(e.message)); }, [token]);
  if (err) return <div className="public-wrap"><div className="card pad public-card">{err}</div></div>;
  if (!info) return <Spinner />;

  const submit = async () => {
    try {
      const r = await api.post(`/public/reviews/${token}`, { rating, body });
      setDone(r);
      if (r.redirect) setTimeout(() => { window.location.href = r.redirect; }, 1800);
    } catch (e) { setErr(e.message); }
  };

  return (
    <div className="public-wrap">
      <div className="card pad public-card stack" style={{ textAlign: 'center' }}>
        <h2>{info.location}</h2>
        {done ? (
          <>
            <h3>Thank you for your feedback! 💙</h3>
            {done.redirect && <p className="faint">Taking you to leave a public review…</p>}
          </>
        ) : (
          <>
            <p>How was your experience with us?</p>
            <div>{[1, 2, 3, 4, 5].map((n) => <button key={n} className="btn ghost" style={{ fontSize: 40, padding: 4, color: n <= rating ? '#fdb022' : 'var(--border)' }} onClick={() => setRating(n)}>★</button>)}</div>
            {rating > 0 && (
              <>
                <textarea className="input" placeholder={rating >= 4 ? 'What did you love? (optional)' : 'Sorry to hear that — what could we do better?'} value={body} onChange={(e) => setBody(e.target.value)} />
                <button className="btn primary block" onClick={submit}>Submit</button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
