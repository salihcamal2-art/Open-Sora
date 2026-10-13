import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, X, MessageSquare, Mail, Phone, Facebook, Instagram, Globe, MessagesSquare, StickyNote, Store,
} from 'lucide-react';
import { CHANNEL_COLORS, CHANNEL_LABELS, colorFor, initials } from '../utils.js';
import { useApp } from '../app-context.jsx';

export function Avatar({ name, color, size = 40 }) {
  return (
    <div className="avatar" style={{ width: size, height: size, background: color || colorFor(name), fontSize: size * 0.38 }}>
      {initials(name)}
    </div>
  );
}

export function TopBar({ title, sub, back, right, onBack }) {
  const nav = useNavigate();
  return (
    <header className="topbar">
      {back && (
        <button className="icon-btn" onClick={() => (onBack ? onBack() : typeof back === 'string' ? nav(back) : nav(-1))} aria-label="Back">
          <ArrowLeft size={22} />
        </button>
      )}
      <div className="grow">
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {right}
    </header>
  );
}

export function Sheet({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="sheet" style={wide ? { maxWidth: 720 } : undefined}>
        <div className="grabber" />
        <div className="sheet-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}

export const Spinner = () => <div className="spinner" />;

export function Empty({ icon: Icon, title, text, action }) {
  return (
    <div className="empty">
      {Icon && <Icon size={40} strokeWidth={1.5} />}
      <div className="bold" style={{ color: 'var(--text-2)' }}>{title}</div>
      {text && <div className="small">{text}</div>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Switch({ on, onChange }) {
  return <button type="button" className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)} aria-pressed={on} />;
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t.value} className={`tab ${value === t.value ? 'active' : ''}`} onClick={() => onChange(t.value)}>
          {t.label}
          {t.count ? <span className="count">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

const CH_ICONS = {
  sms: MessageSquare, email: Mail, whatsapp: MessagesSquare, facebook: Facebook, instagram: Instagram,
  gmb: Store, live_chat: Globe, call: Phone, comment: StickyNote,
};
export function ChannelIcon({ type, size = 14 }) {
  const I = CH_ICONS[type] || MessageSquare;
  return <I size={size} color={CHANNEL_COLORS[type]} />;
}
export function ChannelPill({ type }) {
  return (
    <span className="channel-pill">
      <ChannelIcon type={type} /> {CHANNEL_LABELS[type] || type}
    </span>
  );
}

export function StatusBadge({ status }) {
  const map = {
    open: 'blue', won: 'green', lost: 'red', abandoned: '', confirmed: 'blue', showed: 'green', noshow: 'red', cancelled: '',
    draft: '', sent: 'blue', paid: 'green', partially_paid: 'orange', overdue: 'red', void: '', succeeded: 'green', refunded: 'orange',
    pending: 'orange', completed: 'green', published: 'green',
  };
  const label = { noshow: 'No-show', partially_paid: 'Partially paid' }[status] || (status ? status[0].toUpperCase() + status.slice(1) : '');
  return <span className={`badge ${map[status] || ''}`}>{label}</span>;
}

export function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>
      ))}
    </div>
  );
}

export function Stars({ n }) {
  return <span className="stars">{'★'.repeat(n)}<span style={{ opacity: 0.25 }}>{'★'.repeat(5 - n)}</span></span>;
}

/** Small hook for loading data with refresh + error toast. */
export function useLoad(fn, deps = []) {
  const { toast } = useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    try {
      setData(await fn());
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    setLoading(true);
    load();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, setData, loading, reload: load };
}

export function UserSelect({ value, onChange, allowEmpty = 'Unassigned' }) {
  const { team } = useApp();
  return (
    <select className="input" value={value || ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      {allowEmpty && <option value="">{allowEmpty}</option>}
      {team.map((u) => (
        <option key={u.id} value={u.id}>{u.name}</option>
      ))}
    </select>
  );
}
