import { Link } from 'react-router-dom';
import { User, Building2, Users, Filter, Calendar, FileText, ListTree, Tag, Bell, Plug, ShoppingBag, ChevronRight, Moon } from 'lucide-react';
import { useState } from 'react';
import { TopBar } from '../../components/ui.jsx';
import { useApp } from '../../app-context.jsx';

const ITEMS = [
  ['profile', 'My profile', User],
  ['notifications', 'Notification preferences', Bell],
  ['business', 'Business profile', Building2, true],
  ['team', 'Team members', Users, true],
  ['pipelines', 'Pipelines & stages', Filter, true],
  ['calendars', 'Calendars & availability', Calendar, true],
  ['products', 'Products', ShoppingBag],
  ['snippets', 'Snippets / templates', FileText],
  ['custom-fields', 'Custom fields', ListTree],
  ['tags', 'Tags', Tag],
  ['integrations', 'Integrations & API', Plug, true],
];

export default function Settings() {
  const { isAdmin } = useApp();
  const [theme, setTheme] = useState(localStorage.getItem('lc_theme') || 'system');
  const applyTheme = (t) => {
    setTheme(t);
    if (t === 'system') { localStorage.removeItem('lc_theme'); delete document.documentElement.dataset.theme; }
    else { localStorage.setItem('lc_theme', t); document.documentElement.dataset.theme = t; }
  };
  return (
    <div className="page">
      <TopBar back title="Settings" />
      <div className="list menu-list" style={{ marginTop: 12 }}>
        {ITEMS.filter(([, , , admin]) => !admin || isAdmin).map(([to, label, I]) => (
          <Link key={to} to={`/settings/${to}`} className="list-item"><I size={20} /><span className="grow">{label}</span><ChevronRight size={18} color="var(--text-3)" /></Link>
        ))}
        <div className="list-item">
          <Moon size={20} color="var(--brand)" /><span className="grow">Appearance</span>
          <div className="seg">{['system', 'light', 'dark'].map((t) => <button key={t} className={theme === t ? 'active' : ''} onClick={() => applyTheme(t)}>{t}</button>)}</div>
        </div>
      </div>
      <div className="faint" style={{ textAlign: 'center', padding: 16 }}>LeadConnector clone · v1.0</div>
    </div>
  );
}
