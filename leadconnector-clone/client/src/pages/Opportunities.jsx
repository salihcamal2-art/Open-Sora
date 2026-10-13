import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, Phone, MessageSquare, ArrowRightLeft, Trophy, XCircle, LayoutGrid, List, StickyNote, ListPlus } from 'lucide-react';
import { api } from '../api.js';
import { useApp, useLive } from '../app-context.jsx';
import { Avatar, Sheet, Spinner, StatusBadge, TopBar, Empty } from '../components/ui.jsx';
import { useQuickAction } from '../components/Layout.jsx';
import { money, timeAgo } from '../utils.js';

export default function Opportunities() {
  const { toast } = useApp();
  const nav = useNavigate();
  const run = useQuickAction();
  const [pipelines, setPipelines] = useState([]);
  const [pid, setPid] = useState(() => localStorage.getItem('lc_pipeline'));
  const [opps, setOpps] = useState(null);
  const [status, setStatus] = useState('open');
  const [q, setQ] = useState('');
  const [view, setView] = useState('board');
  const [dragId, setDragId] = useState(null);
  const [dropStage, setDropStage] = useState(null);
  const [card, setCard] = useState(null);
  const [mode, setMode] = useState(null);

  useEffect(() => {
    api.get('/opportunities/pipelines').then((p) => {
      setPipelines(p);
      if (!p.find((x) => String(x.id) === String(pid))) setPid(String(p[0]?.id));
    });
  }, []); // eslint-disable-line
  const load = () => pid && api.get('/opportunities', { pipeline_id: pid, status, q }).then(setOpps).catch((e) => toast(e.message, 'error'));
  useEffect(() => {
    if (pid) localStorage.setItem('lc_pipeline', pid);
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [pid, status, q]); // eslint-disable-line
  useLive(['opportunity.created', 'opportunity.updated', 'opportunity.stage_changed'], load);

  const pipeline = pipelines.find((p) => String(p.id) === String(pid));
  const move = async (opp, data) => {
    setOpps((list) => list.map((o) => (o.id === opp.id ? { ...o, ...data } : o)));
    try {
      await api.put(`/opportunities/${opp.id}`, data);
      load();
    } catch (e) {
      toast(e.message, 'error');
      load();
    }
  };
  const total = (opps || []).reduce((s, o) => s + o.value, 0);

  return (
    <div className="page">
      <TopBar
        title="Opportunities"
        sub={opps ? `${opps.length} · ${money(total)}` : ''}
        right={
          <>
            <button className="icon-btn" onClick={() => setView(view === 'board' ? 'list' : 'board')}>{view === 'board' ? <List size={20} /> : <LayoutGrid size={20} />}</button>
            <Link className="icon-btn" to={`/opportunities/new?pipeline=${pid}`}><Plus size={22} /></Link>
          </>
        }
      />
      <div className="row" style={{ padding: '10px 16px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <select className="input" style={{ flex: '1 1 160px' }} value={pid || ''} onChange={(e) => setPid(e.target.value)}>
          {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="input" style={{ flex: '0 1 130px' }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="open">Open</option><option value="won">Won</option><option value="lost">Lost</option><option value="abandoned">Abandoned</option><option value="all">All</option>
        </select>
        <div className="search" style={{ flex: '1 1 200px' }}><Search size={16} color="var(--text-3)" /><input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>

      {!opps || !pipeline ? <Spinner /> : view === 'board' ? (
        <div className="board">
          {pipeline.stages.map((s) => {
            const items = opps.filter((o) => o.stage_id === s.id);
            return (
              <div
                key={s.id}
                className={`column ${dropStage === s.id ? 'drop' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDropStage(s.id); }}
                onDragLeave={() => setDropStage(null)}
                onDrop={() => { const o = opps.find((x) => x.id === dragId); setDropStage(null); if (o && o.stage_id !== s.id) move(o, { stage_id: s.id }); }}
              >
                <div className="column-head">
                  <span>{s.name} <span className="faint">({items.length})</span></span>
                  <span className="faint">{money(items.reduce((a, o) => a + o.value, 0))}</span>
                </div>
                {items.map((o) => <OppCard key={o.id} o={o} onDrag={() => setDragId(o.id)} onClick={() => nav(`/opportunities/${o.id}`)} onMenu={() => setCard(o)} />)}
                {items.length === 0 && <div className="faint" style={{ textAlign: 'center', padding: 16 }}>Drop here</div>}
              </div>
            );
          })}
        </div>
      ) : opps.length === 0 ? <Empty title="No opportunities" /> : (
        <div className="list">
          {opps.map((o) => (
            <button key={o.id} className="list-item" onClick={() => nav(`/opportunities/${o.id}`)} onContextMenu={(e) => { e.preventDefault(); setCard(o); }}>
              <Avatar name={o.contact?.name || o.name} size={38} />
              <div className="grow"><div className="title ellipsis">{o.name}</div><div className="faint">{pipeline.stages.find((s) => s.id === o.stage_id)?.name} · {timeAgo(o.updated_at)}</div></div>
              <div style={{ textAlign: 'right' }}><div className="bold">{money(o.value)}</div><StatusBadge status={o.status} /></div>
            </button>
          ))}
        </div>
      )}

      {card && !mode && (
        <Sheet title={card.name} onClose={() => setCard(null)}>
          <div className="qa-grid" style={{ marginBottom: 12 }}>
            <button className="qa" onClick={() => { run('call', card.contact); setCard(null); }}><span className="ic"><Phone size={20} /></span>Call</button>
            <button className="qa" onClick={() => { run('sms', card.contact); setCard(null); }}><span className="ic"><MessageSquare size={20} /></span>SMS</button>
            <button className="qa" onClick={() => setMode('note')}><span className="ic"><StickyNote size={20} /></span>Note</button>
            <button className="qa" onClick={() => setMode('task')}><span className="ic"><ListPlus size={20} /></span>Task</button>
          </div>
          <div className="menu-list">
            <button className="list-item" onClick={() => setMode('stage')}><ArrowRightLeft size={18} /> Change stage</button>
            <button className="list-item" onClick={() => { move(card, { status: 'won' }); setCard(null); }}><Trophy size={18} /> Mark as won</button>
            <button className="list-item" onClick={() => { move(card, { status: 'lost' }); setCard(null); }}><XCircle size={18} /> Mark as lost</button>
          </div>
        </Sheet>
      )}
      {card && mode === 'stage' && (
        <Sheet title="Move to stage" onClose={() => { setCard(null); setMode(null); }}>
          {pipeline.stages.map((s) => (
            <button key={s.id} className="list-item" onClick={() => { move(card, { stage_id: s.id }); setCard(null); setMode(null); }}>
              <span className="grow">{s.name}</span>{s.id === card.stage_id && <span className="badge blue">Current</span>}
            </button>
          ))}
        </Sheet>
      )}
      {card && (mode === 'note' || mode === 'task') && (
        <QuickText
          title={mode === 'note' ? 'Add note' : 'Add task'}
          onClose={() => { setCard(null); setMode(null); }}
          onSave={async (text) => {
            if (!card.contact) return;
            await api.post(`/contacts/${card.contact.id}/${mode === 'note' ? 'notes' : 'tasks'}`, mode === 'note' ? { body: text } : { title: text, due_at: new Date(Date.now() + 86400e3).toISOString() });
            toast('Saved', 'success');
            setCard(null);
            setMode(null);
          }}
        />
      )}
    </div>
  );
}

function OppCard({ o, onDrag, onClick, onMenu }) {
  return (
    <div className="opp-card" draggable onDragStart={onDrag} onClick={onClick} onContextMenu={(e) => { e.preventDefault(); onMenu(); }}>
      <div className="row between"><span className="bold ellipsis">{o.name}</span><button className="btn ghost sm" style={{ padding: '0 4px' }} onClick={(e) => { e.stopPropagation(); onMenu(); }}>⋯</button></div>
      <div className="faint ellipsis">{o.contact?.name}{o.source ? ` · ${o.source}` : ''}</div>
      <div className="row between" style={{ marginTop: 6 }}>
        <span className="val">{money(o.value)}</span>
        <span className="row" style={{ gap: 4 }}>{o.status !== 'open' && <StatusBadge status={o.status} />}{o.assignee_name && <Avatar name={o.assignee_name} size={22} />}</span>
      </div>
      {o.contact?.tags?.length > 0 && <div className="row wrap" style={{ gap: 4, marginTop: 6 }}>{o.contact.tags.slice(0, 2).map((t) => <span key={t} className="tag-chip">{t}</span>)}</div>}
    </div>
  );
}

function QuickText({ title, onClose, onSave }) {
  const [v, setV] = useState('');
  return (
    <Sheet title={title} onClose={onClose} footer={<button className="btn primary block" disabled={!v} onClick={() => onSave(v)}>Save</button>}>
      <textarea className="input" autoFocus value={v} onChange={(e) => setV(e.target.value)} />
    </Sheet>
  );
}
