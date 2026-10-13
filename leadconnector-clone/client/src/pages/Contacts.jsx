import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Plus, ScanLine, Upload, SlidersHorizontal, Users, CheckSquare, Phone, MessageSquare, Mail, CalendarPlus, DollarSign, X, Trash2, Tag, UserCheck, BellOff } from 'lucide-react';
import { api } from '../api.js';
import { useApp, useLive } from '../app-context.jsx';
import { Avatar, Empty, Field, Sheet, Spinner, Tabs, TopBar, UserSelect } from '../components/ui.jsx';
import { useQuickAction } from '../components/Layout.jsx';
import { timeAgo } from '../utils.js';

const EMPTY = { tags: [], type: '', assigned_to: '', source: '', dnd: '', has_phone: '', has_email: '' };

export default function Contacts() {
  const { toast } = useApp();
  const nav = useNavigate();
  const run = useQuickAction();
  const [q, setQ] = useState('');
  const [list, setList] = useState('all');
  const [smartLists, setSmartLists] = useState([]);
  const [filters, setFilters] = useState(EMPTY);
  const [sort, setSort] = useState('newest');
  const [data, setData] = useState(null);
  const [tags, setTags] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState([]);
  const [bulk, setBulk] = useState(null);
  const [tiles, setTiles] = useState(null);
  const [limit, setLimit] = useState(50);

  const query = () => {
    const base = { q, sort, limit };
    if (list === 'mine') return { ...base, assigned_to: 'me' };
    if (list !== 'all') return { ...base, smartListId: list };
    return { ...base, ...filters, tags: filters.tags.join(',') };
  };
  const load = () => api.get('/contacts', query()).then(setData).catch((e) => toast(e.message, 'error'));
  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, list, filters, sort, limit]); // eslint-disable-line
  useEffect(() => {
    api.get('/contacts/smart-lists').then(setSmartLists);
    api.get('/contacts/tags').then(setTags);
  }, []);
  useLive(['contact.created', 'contact.updated', 'contact.deleted'], load);

  const activeFilterCount = Object.values(filters).filter((v) => (Array.isArray(v) ? v.length : v)).length;
  const toggleSel = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const saveSmartList = async () => {
    const name = prompt('Smart list name');
    if (!name) return;
    const sl = await api.post('/contacts/smart-lists', { name, filters: { ...filters, q }, shared: true });
    setSmartLists([...smartLists, { ...sl, filters }]);
    setList(String(sl.id));
    toast('Smart list saved', 'success');
  };

  const doBulk = async (action, extra = {}) => {
    if (action === 'delete' && !confirm(`Delete ${selected.length} contacts?`)) return;
    await api.post('/contacts/bulk', { ids: selected, action, ...extra });
    toast('Done', 'success');
    setBulk(null);
    setSelected([]);
    setSelecting(false);
    load();
  };

  return (
    <div className="page">
      <TopBar
        title="Contacts"
        sub={data ? `${data.total} contacts` : ''}
        right={
          <>
            <button className="icon-btn" onClick={() => { setSelecting(!selecting); setSelected([]); }} aria-label="Select"><CheckSquare size={20} color={selecting ? 'var(--brand)' : undefined} /></button>
            <Link className="icon-btn" to="/contacts/import" aria-label="Import"><Upload size={20} /></Link>
            <Link className="icon-btn" to="/contacts/scan" aria-label="Scan business card"><ScanLine size={20} /></Link>
            <Link className="icon-btn" to="/contacts/new" aria-label="Add contact"><Plus size={22} /></Link>
          </>
        }
      />
      <div style={{ padding: '10px 16px 0', background: 'var(--surface)' }} className="row">
        <div className="search grow"><Search size={18} color="var(--text-3)" /><input placeholder="Search name, email, phone, company" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <button className="icon-btn" onClick={() => setShowFilters(true)} aria-label="Filter">
          <SlidersHorizontal size={20} color={activeFilterCount ? 'var(--brand)' : undefined} />
          {activeFilterCount > 0 && <span className="count" style={{ position: 'absolute', top: 0, right: 0, background: 'var(--brand)' }}>{activeFilterCount}</span>}
        </button>
      </div>
      <Tabs
        value={list}
        onChange={(v) => { setList(v); setLimit(50); }}
        tabs={[{ value: 'all', label: 'All' }, { value: 'mine', label: 'My contacts' }, ...smartLists.map((s) => ({ value: String(s.id), label: s.name }))]}
      />
      {selecting && (
        <div className="row" style={{ padding: '8px 16px', background: 'var(--brand-50)' }}>
          <span className="grow bold small">{selected.length} selected</span>
          <button className="btn sm" onClick={() => setSelected(data.items.map((c) => c.id))}>All</button>
          <button className="btn sm primary" disabled={!selected.length} onClick={() => setBulk('menu')}>Actions</button>
        </div>
      )}
      <div className="row between" style={{ padding: '6px 16px' }}>
        <select className="input" style={{ width: 'auto', padding: '6px 10px' }} value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="newest">Newest</option><option value="oldest">Oldest</option><option value="name">Name A–Z</option><option value="activity">Last activity</option>
        </select>
        {list === 'all' && activeFilterCount > 0 && <button className="btn sm" onClick={saveSmartList}>Save as smart list</button>}
      </div>

      {!data ? <Spinner /> : data.items.length === 0 ? (
        <Empty icon={Users} title="No contacts found" action={<Link className="btn primary" to="/contacts/new">Add contact</Link>} />
      ) : (
        <div className="list">
          {data.items.map((c) => (
            <button
              key={c.id}
              className="list-item"
              onClick={() => (selecting ? toggleSel(c.id) : nav(`/contacts/${c.id}`))}
              onContextMenu={(e) => { e.preventDefault(); setTiles(c); }}
            >
              {selecting && <span className={`check ${selected.includes(c.id) ? 'on' : ''}`}>{selected.includes(c.id) ? '✓' : ''}</span>}
              <Avatar name={c.name} />
              <div className="grow">
                <div className="row between"><span className="title ellipsis">{c.name}</span><span className="faint">{timeAgo(c.created_at)}</span></div>
                <div className="faint ellipsis">{[c.phone, c.email, c.company].filter(Boolean).join(' · ')}</div>
                {c.tags.length > 0 && <div className="row wrap" style={{ gap: 4, marginTop: 4 }}>{c.tags.slice(0, 3).map((t) => <span key={t} className="tag-chip">{t}</span>)}</div>}
              </div>
            </button>
          ))}
        </div>
      )}
      {data && data.items.length < data.total && (
        <div style={{ padding: 16 }}><button className="btn block" onClick={() => setLimit(limit + 50)}>Load more ({data.total - data.items.length})</button></div>
      )}

      {showFilters && (
        <Sheet title="Filter contacts" onClose={() => setShowFilters(false)} footer={<><button className="btn" onClick={() => { setFilters(EMPTY); setShowFilters(false); }}>Reset</button><button className="btn primary grow" onClick={() => { setList('all'); setShowFilters(false); }}>Show results</button></>}>
          <div className="stack">
            <Field label="Tags (any of)">
              <div className="row wrap" style={{ gap: 6 }}>
                {tags.map((t) => (
                  <button key={t.id} className={`tab ${filters.tags.includes(t.name) ? 'active' : ''}`} onClick={() => setFilters({ ...filters, tags: filters.tags.includes(t.name) ? filters.tags.filter((x) => x !== t.name) : [...filters.tags, t.name] })}>
                    {t.name} <span style={{ opacity: 0.6 }}>{t.count}</span>
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Type"><select className="input" value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}><option value="">Any</option><option value="lead">Lead</option><option value="customer">Customer</option></select></Field>
            <Field label="Assigned to">
              <select className="input" value={filters.assigned_to} onChange={(e) => setFilters({ ...filters, assigned_to: e.target.value })}>
                <option value="">Anyone</option><option value="me">Me</option><option value="unassigned">Unassigned</option>
              </select>
            </Field>
            <Field label="Source"><input className="input" value={filters.source} placeholder="e.g. facebook ad" onChange={(e) => setFilters({ ...filters, source: e.target.value })} /></Field>
            <div className="grid2">
              <label className="row small"><input type="checkbox" checked={!!filters.has_phone} onChange={(e) => setFilters({ ...filters, has_phone: e.target.checked ? 'true' : '' })} /> Has phone</label>
              <label className="row small"><input type="checkbox" checked={!!filters.has_email} onChange={(e) => setFilters({ ...filters, has_email: e.target.checked ? 'true' : '' })} /> Has email</label>
              <label className="row small"><input type="checkbox" checked={!!filters.dnd} onChange={(e) => setFilters({ ...filters, dnd: e.target.checked ? 'true' : '' })} /> DND enabled</label>
            </div>
          </div>
        </Sheet>
      )}

      {bulk === 'menu' && (
        <Sheet title={`${selected.length} contacts`} onClose={() => setBulk(null)}>
          <div className="menu-list">
            <button className="list-item" onClick={() => setBulk('add_tags')}><Tag size={18} /> Add tags</button>
            <button className="list-item" onClick={() => setBulk('remove_tags')}><X size={18} /> Remove tags</button>
            <button className="list-item" onClick={() => setBulk('assign')}><UserCheck size={18} /> Assign to user</button>
            <button className="list-item" onClick={() => doBulk('dnd')}><BellOff size={18} /> Enable DND</button>
            <button className="list-item" onClick={() => doBulk('delete')}><Trash2 size={18} color="var(--danger)" /> Delete</button>
          </div>
        </Sheet>
      )}
      {(bulk === 'add_tags' || bulk === 'remove_tags') && <BulkTags tags={tags} onClose={() => setBulk(null)} onApply={(t) => doBulk(bulk, { tags: t })} />}
      {bulk === 'assign' && <BulkAssign onClose={() => setBulk(null)} onApply={(u) => doBulk('assign', { assigned_to: u })} />}

      {tiles && (
        <Sheet title={tiles.name} onClose={() => setTiles(null)}>
          <div className="qa-grid">
            {[['call', 'Call', Phone], ['sms', 'SMS', MessageSquare], ['email', 'Email', Mail], ['appointment', 'Book', CalendarPlus], ['payment', 'Collect payment', DollarSign]].map(([k, l, I]) => (
              <button key={k} className="qa" onClick={() => { setTiles(null); run(k, tiles).catch((e) => toast(e.message, 'error')); }}>
                <span className="ic"><I size={22} /></span>{l}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}

function BulkTags({ tags, onClose, onApply }) {
  const [sel, setSel] = useState([]);
  const [newTag, setNewTag] = useState('');
  return (
    <Sheet title="Tags" onClose={onClose} footer={<button className="btn primary block" disabled={!sel.length} onClick={() => onApply(sel)}>Apply</button>}>
      <div className="row" style={{ marginBottom: 10 }}>
        <input className="input" placeholder="New tag" value={newTag} onChange={(e) => setNewTag(e.target.value)} />
        <button className="btn" onClick={() => { if (newTag) { setSel([...sel, newTag.toLowerCase()]); setNewTag(''); } }}>Add</button>
      </div>
      <div className="row wrap" style={{ gap: 6 }}>
        {[...new Set([...tags.map((t) => t.name), ...sel])].map((t) => (
          <button key={t} className={`tab ${sel.includes(t) ? 'active' : ''}`} onClick={() => setSel(sel.includes(t) ? sel.filter((x) => x !== t) : [...sel, t])}>{t}</button>
        ))}
      </div>
    </Sheet>
  );
}

function BulkAssign({ onClose, onApply }) {
  const [u, setU] = useState(null);
  return (
    <Sheet title="Assign to" onClose={onClose} footer={<button className="btn primary block" onClick={() => onApply(u)}>Assign</button>}>
      <UserSelect value={u} onChange={setU} />
    </Sheet>
  );
}
