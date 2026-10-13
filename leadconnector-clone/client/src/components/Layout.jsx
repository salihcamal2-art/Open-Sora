import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Home, MessageSquare, Users, Filter, Menu, Zap, Calendar, CheckSquare, CreditCard, Star, Bell, Settings, Phone, Workflow,
  Mail, UserPlus, ScanLine, CalendarPlus, Target, ListPlus, FileText, DollarSign, Hand,
} from 'lucide-react';
import { useApp } from '../app-context.jsx';
import { api } from '../api.js';
import { Sheet, Toasts } from './ui.jsx';
import ContactPicker from './ContactPicker.jsx';
import Logo from './Logo.jsx';

const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/conversations', label: 'Conversations', icon: MessageSquare, badge: 'conversations' },
  { to: '/contacts', label: 'Contacts', icon: Users },
  { to: '/opportunities', label: 'Opportunities', icon: Filter },
];
const SIDE = [
  ...NAV,
  { to: '/calendars', label: 'Calendars', icon: Calendar },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare },
  { to: '/payments', label: 'Payments', icon: CreditCard },
  { to: '/reviews', label: 'Reputation', icon: Star },
  { to: '/manual-actions', label: 'Manual Actions', icon: Hand },
  { to: '/dialer', label: 'Dialer', icon: Phone },
  { to: '/workflows', label: 'Automation', icon: Workflow },
  { to: '/notifications', label: 'Notifications', icon: Bell, badge: 'notifications' },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export const QUICK_ACTIONS = [
  { key: 'sms', label: 'Send SMS', icon: MessageSquare, pick: true },
  { key: 'email', label: 'Send Email', icon: Mail, pick: true },
  { key: 'call', label: 'Call', icon: Phone, pick: true },
  { key: 'contact', label: 'Add Contact', icon: UserPlus },
  { key: 'scan', label: 'Scan Card', icon: ScanLine },
  { key: 'appointment', label: 'Book Appt', icon: CalendarPlus, pick: true },
  { key: 'opportunity', label: 'Opportunity', icon: Target, pick: true },
  { key: 'task', label: 'Add Task', icon: ListPlus, pick: true },
  { key: 'review', label: 'Review Request', icon: Star, pick: true },
  { key: 'invoice', label: 'Send Invoice', icon: FileText, pick: true },
  { key: 'payment', label: 'Collect Payment', icon: DollarSign },
  { key: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, pick: true },
];

/** Runs a quick action, used by the lightning-bolt menu, the home shortcuts and contact long-press. */
export function useQuickAction() {
  const nav = useNavigate();
  const { toast } = useApp();
  return async (key, contact) => {
    const cid = contact?.id;
    switch (key) {
      case 'sms':
      case 'email':
      case 'whatsapp': {
        const conv = await api.post('/conversations', { contact_id: cid });
        nav(`/conversations/${conv.id}?channel=${key}`);
        break;
      }
      case 'call': nav(`/dialer?contact=${cid}`); break;
      case 'contact': nav('/contacts/new'); break;
      case 'scan': nav('/contacts/scan'); break;
      case 'appointment': nav(`/calendars/new${cid ? `?contact=${cid}` : ''}`); break;
      case 'opportunity': nav(`/opportunities/new${cid ? `?contact=${cid}` : ''}`); break;
      case 'task': nav(`/tasks?new=1${cid ? `&contact=${cid}` : ''}`); break;
      case 'invoice': nav(`/payments/invoices/new${cid ? `?contact=${cid}` : ''}`); break;
      case 'payment': nav(`/payments/pos${cid ? `?contact=${cid}` : ''}`); break;
      case 'review':
        try {
          await api.post('/reviews/requests', { contact_id: cid, channel: contact.phone ? 'sms' : 'email' });
          toast('Review request sent', 'success');
        } catch (e) {
          toast(e.message, 'error');
        }
        break;
      default:
    }
  };
}

function QuickActionsSheet({ onClose }) {
  const run = useQuickAction();
  const [pending, setPending] = useState(null);
  const { toast } = useApp();
  const choose = (a) => (a.pick ? setPending(a) : (onClose(), run(a.key)));
  if (pending) {
    return (
      <ContactPicker
        title={pending.label}
        onClose={onClose}
        onPick={async (c) => {
          onClose();
          try {
            await run(pending.key, c);
          } catch (e) {
            toast(e.message, 'error');
          }
        }}
      />
    );
  }
  return (
    <Sheet title="Quick actions" onClose={onClose}>
      <div className="qa-grid">
        {QUICK_ACTIONS.map((a) => (
          <button key={a.key} className="qa" onClick={() => choose(a)}>
            <span className="ic"><a.icon size={22} /></span>
            {a.label}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

export default function Layout() {
  const { badges, location } = useApp();
  const [qa, setQa] = useState(false);
  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="brand"><Logo size={32} /> <span className="ellipsis">{location?.name || 'LeadConnector'}</span></div>
        {SIDE.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}>
            <n.icon size={19} /> <span className="grow">{n.label}</span>
            {n.badge && badges[n.badge] ? <span className="count">{badges[n.badge]}</span> : null}
          </NavLink>
        ))}
      </nav>
      <div className="main">
        <Outlet />
        <nav className="bottomnav">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>
              <n.icon size={22} />
              {n.label === 'Conversations' ? 'Chats' : n.label === 'Opportunities' ? 'Pipeline' : n.label}
              {n.badge && badges[n.badge] ? <span className="count dot">{badges[n.badge]}</span> : null}
            </NavLink>
          ))}
          <NavLink to="/more">
            <Menu size={22} /> More
            {badges.notifications ? <span className="count dot">{badges.notifications}</span> : null}
          </NavLink>
        </nav>
        <button className="fab" onClick={() => setQa(true)} aria-label="Quick actions"><Zap size={26} fill="#fff" /></button>
      </div>
      {qa && <QuickActionsSheet onClose={() => setQa(false)} />}
      <Toasts />
    </div>
  );
}
