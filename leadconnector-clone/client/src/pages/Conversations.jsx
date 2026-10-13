import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, SlidersHorizontal, SquarePen, Star, MessageSquare, X, Mail, MailOpen, Archive } from 'lucide-react';
import { api } from '../api.js';
import { useApp, useLive } from '../app-context.jsx';
import { Avatar, ChannelIcon, Empty, Sheet, Spinner, Tabs, TopBar } from '../components/ui.jsx';
import FilterBuilder, { describeFilter } from '../components/FilterBuilder.jsx';
import ContactPicker from '../components/ContactPicker.jsx';
import { timeAgo } from '../utils.js';

const TABS = [
  { value: 'unread', label: 'Unread' },
  { value: 'recents', label: 'Recents' },
  { value: 'starred', label: 'Starred' },
  { value: 'mine', label: 'Assigned to me' },
  { value: 'unassigned', label: 'Unassigned' },
  { value: 'all', label: 'All' },
  { value: 'closed', label: 'Closed' },
];

export default function Conversations() {
  const { user, setUser, team, badges, toast } = useApp();
  const nav = useNavigate();
  const [tab, setTab] = useState(() => sessionStorage.getItem('lc_conv_tab') || 'recents');
  const [q, setQ] = useState('');
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState(() => JSON.parse(sessionStorage.getItem('lc_conv_filter') || 'null'));
  const [showFilter, setShowFilter] = useState(false);
  const [compose, setCompose] = useState(false);
  const [menu, setMenu] = useState(null);
  const saved = user.prefs.savedFilters || [];

  const load = async () => {
    try {
      const r = await api.get('/conversations', { tab, q, filter: filter ? JSON.stringify(filter) : undefined, limit: 100 });
      setItems(r.items);
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  useEffect(() => {
    sessionStorage.setItem('lc_conv_tab', tab);
    sessionStorage.setItem('lc_conv_filter', JSON.stringify(filter));
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [tab, q, filter]); // eslint-disable-line
  useLive(['message.created', 'conversation.updated'], load);

  const saveFilter = async (name, f) => {
    const r = await api.put('/auth/me', { prefs: { savedFilters: [...saved.filter((s) => s.name !== name), { name, filter: f }] } });
    setUser(r.user);
    toast('Filter saved', 'success');
  };
  const removeSaved = async (name) => {
    const r = await api.put('/auth/me', { prefs: { savedFilters: saved.filter((s) => s.name !== name) } });
    setUser(r.user);
  };
  const act = async (c, body, readFlag) => {
    setMenu(null);
    if (readFlag !== undefined) await api.post(`/conversations/${c.id}/read`, { unread: readFlag });
    else await api.put(`/conversations/${c.id}`, body);
    load();
  };

  return (
    <div className="page">
      <TopBar
        title="Conversations"
        right={
          <>
            <button className="icon-btn" onClick={() => setShowFilter(true)} aria-label="Filters">
              <SlidersHorizontal size={21} color={filter ? 'var(--brand)' : undefined} />
            </button>
            <button className="icon-btn" onClick={() => setCompose(true)} aria-label="New message"><SquarePen size={21} /></button>
          </>
        }
      />
      <div style={{ padding: '10px 16px 0', background: 'var(--surface)' }}>
        <div className="search"><Search size={18} color="var(--text-3)" /><input placeholder="Search conversations" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      <Tabs tabs={TABS.map((t) => (t.value === 'unread' ? { ...t, count: badges.conversations } : t))} value={tab} onChange={setTab} />
      {(filter || saved.length > 0) && (
        <div className="tabs" style={{ paddingTop: 0 }}>
          {saved.map((s) => (
            <button key={s.name} className={`tab ${JSON.stringify(filter) === JSON.stringify(s.filter) ? 'active' : ''}`} onClick={() => setFilter(s.filter)} onContextMenu={(e) => { e.preventDefault(); if (confirm(`Delete saved filter "${s.name}"?`)) removeSaved(s.name); }}>
              {s.name}
            </button>
          ))}
          {filter && (
            <button className="tab" onClick={() => setFilter(null)} title={describeFilter(filter, team)}>
              <X size={14} /> Clear filter
            </button>
          )}
        </div>
      )}
      {filter && <div className="faint" style={{ padding: '6px 16px' }}>Filter: {describeFilter(filter, team)}</div>}

      {!items ? <Spinner /> : items.length === 0 ? (
        <Empty icon={MessageSquare} title="No conversations" text="Messages from SMS, email, WhatsApp, Facebook, Instagram, Google & live chat show up here." />
      ) : (
        <div className="list">
          {items.map((c) => (
            <button
              key={c.id}
              className={`list-item ${c.unread_count ? 'unread' : ''}`}
              onClick={() => nav(`/conversations/${c.id}`)}
              onContextMenu={(e) => { e.preventDefault(); setMenu(c); }}
            >
              <div style={{ position: 'relative' }}>
                <Avatar name={c.contact?.name} size={46} />
                <span style={{ position: 'absolute', bottom: -2, right: -2, background: 'var(--surface)', borderRadius: '50%', padding: 3, display: 'grid' }}>
                  <ChannelIcon type={c.last_message_type} size={13} />
                </span>
              </div>
              <div className="grow">
                <div className="row between">
                  <span className="title ellipsis">{c.contact?.name}</span>
                  <span className="faint" style={{ flexShrink: 0 }}>{timeAgo(c.last_message_at)}</span>
                </div>
                <div className="row between">
                  <span className="faint ellipsis" style={{ color: c.unread_count ? 'var(--text)' : undefined }}>
                    {c.last_message_direction === 'outbound' ? 'You: ' : ''}{c.last_message_body}
                  </span>
                  <span className="row" style={{ gap: 4, flexShrink: 0 }}>
                    {c.starred && <Star size={14} fill="#fdb022" color="#fdb022" />}
                    {c.assignee && <Avatar name={c.assignee.name} color={c.assignee.color} size={18} />}
                    {c.unread_count > 0 && <span className="count" style={{ background: 'var(--brand)' }}>{c.unread_count}</span>}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      <div className="faint" style={{ textAlign: 'center', padding: 12 }}>Tip: long-press a conversation for more actions</div>

      {showFilter && <FilterBuilder initial={filter} onApply={setFilter} onClose={() => setShowFilter(false)} onSave={saveFilter} />}
      {compose && (
        <ContactPicker
          title="New message"
          onClose={() => setCompose(false)}
          onPick={async (c) => {
            const conv = await api.post('/conversations', { contact_id: c.id });
            nav(`/conversations/${conv.id}`);
          }}
        />
      )}
      {menu && (
        <Sheet title={menu.contact?.name} onClose={() => setMenu(null)}>
          <div className="menu-list">
            <button className="list-item" onClick={() => act(menu, null, !menu.unread_count)}>{menu.unread_count ? <MailOpen size={18} /> : <Mail size={18} />} Mark as {menu.unread_count ? 'read' : 'unread'}</button>
            <button className="list-item" onClick={() => act(menu, { starred: !menu.starred })}><Star size={18} /> {menu.starred ? 'Unstar' : 'Star'}</button>
            <button className="list-item" onClick={() => act(menu, { status: menu.status === 'closed' ? 'open' : 'closed' })}><Archive size={18} /> {menu.status === 'closed' ? 'Reopen' : 'Close conversation'}</button>
            <button className="list-item" onClick={() => act(menu, { assigned_to: user.id })}><SquarePen size={18} /> Assign to me</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
