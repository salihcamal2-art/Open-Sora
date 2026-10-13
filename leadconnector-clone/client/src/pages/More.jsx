import { Link } from 'react-router-dom';
import { Calendar, CheckSquare, CreditCard, Star, Bell, Settings, Phone, Workflow, Hand, LogOut, Search, ChevronRight } from 'lucide-react';
import { useApp } from '../app-context.jsx';
import { Avatar, TopBar } from '../components/ui.jsx';

const ITEMS = [
  ['/calendars', 'Calendars', Calendar],
  ['/tasks', 'Tasks', CheckSquare],
  ['/payments', 'Payments & Invoices', CreditCard],
  ['/reviews', 'Reputation / Reviews', Star],
  ['/dialer', 'Dialer & Call log', Phone],
  ['/manual-actions', 'Manual Actions', Hand],
  ['/workflows', 'Automation (Workflows)', Workflow],
  ['/notifications', 'Notifications', Bell, 'notifications'],
  ['/search', 'Global search', Search],
  ['/settings', 'Settings', Settings],
];

export default function More() {
  const { user, location, badges, logout } = useApp();
  return (
    <div className="page">
      <TopBar title="More" />
      <div className="container">
        <Link to="/settings/profile" className="card pad row" style={{ color: 'inherit' }}>
          <Avatar name={user.name} color={user.color} size={48} />
          <div className="grow"><div className="bold">{user.name}</div><div className="faint">{user.email} · {location?.name}</div></div>
          <ChevronRight color="var(--text-3)" />
        </Link>
      </div>
      <div className="list menu-list">
        {ITEMS.map(([to, label, I, badge]) => (
          <Link key={to} to={to} className="list-item">
            <I size={20} /> <span className="grow">{label}</span>
            {badge && badges[badge] ? <span className="count">{badges[badge]}</span> : <ChevronRight size={18} color="var(--text-3)" />}
          </Link>
        ))}
        <button className="list-item" onClick={logout}><LogOut size={20} color="var(--danger)" /> <span style={{ color: 'var(--danger)' }}>Log out</span></button>
      </div>
    </div>
  );
}
