import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../app-context.jsx';
import Logo from '../components/Logo.jsx';

export default function Login({ register }) {
  const { login, user, toast } = useApp();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: '', businessName: '', email: register ? '' : 'demo@leadconnector.app', password: register ? '' : 'demo1234', phone: '' });
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.post(register ? '/auth/register' : '/auth/login', form);
      await login(r.token);
      nav('/');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="card auth-card stack" onSubmit={submit}>
        <div className="row"><Logo size={44} /><div><h2>{localStorage.getItem('lc_app_name') || 'LeadConnector'}</h2><div className="faint">{register ? 'Create your account' : 'Sign in to your account'}</div></div></div>
        {register && (
          <>
            <input className="input" placeholder="Your full name" value={form.name} onChange={set('name')} required />
            <input className="input" placeholder="Business name" value={form.businessName} onChange={set('businessName')} />
            <input className="input" placeholder="Phone" type="tel" value={form.phone} onChange={set('phone')} />
          </>
        )}
        <input className="input" placeholder="Email" type="email" value={form.email} onChange={set('email')} required autoComplete="email" />
        <input className="input" placeholder="Password" type="password" value={form.password} onChange={set('password')} required autoComplete={register ? 'new-password' : 'current-password'} />
        <button className="btn primary block" disabled={busy}>{busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}</button>
        <div className="faint" style={{ textAlign: 'center' }}>
          {register ? <>Already have an account? <Link to="/login">Sign in</Link></> : <>New here? <Link to="/register">Create an account</Link></>}
        </div>
        {!register && <div className="faint" style={{ textAlign: 'center' }}>Demo: demo@leadconnector.app / demo1234</div>}
      </form>
    </div>
  );
}
