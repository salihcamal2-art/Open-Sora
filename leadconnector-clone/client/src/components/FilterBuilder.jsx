import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useApp } from '../app-context.jsx';
import { Sheet } from './ui.jsx';
import { CHANNEL_LABELS } from '../utils.js';

export const FILTER_FIELDS = {
  channel: { label: 'Channel', values: 'channels' },
  last_channel: { label: 'Last message channel', values: 'channels' },
  assignee: { label: 'Assignee', values: 'users_unassigned' },
  follower: { label: 'Follower', values: 'users' },
  mention: { label: 'Mentions', values: 'users' },
  direction: { label: 'Last message direction', values: 'direction' },
  status: { label: 'Status', values: 'status' },
  starred: { label: 'Starred', values: null },
  unread: { label: 'Unread', values: null },
  tag: { label: 'Contact tag', values: 'text' },
};

const emptyRule = () => ({ field: 'channel', op: 'is', value: 'sms' });
export const emptyFilter = () => ({ match: 'all', groups: [{ match: 'all', rules: [emptyRule()] }] });

export function describeFilter(f, team) {
  if (!f?.groups?.length) return '';
  const name = (id) => (id === 'me' ? 'me' : id === 'unassigned' ? 'unassigned' : team.find((u) => String(u.id) === String(id))?.name || id);
  return f.groups
    .map((g) => g.rules.map((r) => `${FILTER_FIELDS[r.field]?.label} ${r.op === 'is_not' ? '≠' : '='} ${['assignee', 'follower', 'mention'].includes(r.field) ? name(r.value) : CHANNEL_LABELS[r.value] || r.value || 'yes'}`).join(g.match === 'any' ? ' OR ' : ' AND '))
    .map((s) => `(${s})`)
    .join(f.match === 'any' ? ' OR ' : ' AND ');
}

function ValueInput({ rule, onChange }) {
  const { team } = useApp();
  const kind = FILTER_FIELDS[rule.field]?.values;
  if (!kind) return null;
  if (kind === 'text') return <input className="input" placeholder="tag name" value={rule.value || ''} onChange={(e) => onChange(e.target.value)} />;
  let opts = [];
  if (kind === 'channels') opts = Object.entries(CHANNEL_LABELS).filter(([k]) => k !== 'comment');
  if (kind === 'direction') opts = [['inbound', 'Inbound'], ['outbound', 'Outbound']];
  if (kind === 'status') opts = [['open', 'Open'], ['closed', 'Closed']];
  if (kind.startsWith('users')) opts = [['me', 'Me'], ...(kind === 'users_unassigned' ? [['unassigned', 'Unassigned']] : []), ...team.map((u) => [String(u.id), u.name])];
  return (
    <select className="input" value={rule.value} onChange={(e) => onChange(e.target.value)}>
      {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

function Seg({ value, onChange }) {
  return (
    <div className="seg">
      <button type="button" className={value === 'all' ? 'active' : ''} onClick={() => onChange('all')}>AND</button>
      <button type="button" className={value === 'any' ? 'active' : ''} onClick={() => onChange('any')}>OR</button>
    </div>
  );
}

/** Advanced inbox filters: groups of rules combined with AND / OR. */
export default function FilterBuilder({ initial, onApply, onClose, onSave }) {
  const [f, setF] = useState(() => JSON.parse(JSON.stringify(initial?.groups?.length ? initial : emptyFilter())));
  const [name, setName] = useState('');
  const upd = (fn) => setF((prev) => { const n = JSON.parse(JSON.stringify(prev)); fn(n); return n; });

  return (
    <Sheet
      title="Advanced filters"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={() => { onApply(null); onClose(); }}>Clear</button>
          <button className="btn primary grow" onClick={() => { onApply(f); onClose(); }}>Apply filters</button>
        </>
      }
    >
      <div className="stack">
        <div className="row between"><span className="small bold">Match groups using</span><Seg value={f.match} onChange={(v) => upd((n) => { n.match = v; })} /></div>
        {f.groups.map((g, gi) => (
          <div key={gi} className="filter-group">
            <div className="row between">
              <span className="small bold">Group {gi + 1}</span>
              <div className="row">
                <Seg value={g.match} onChange={(v) => upd((n) => { n.groups[gi].match = v; })} />
                {f.groups.length > 1 && <button className="icon-btn" onClick={() => upd((n) => { n.groups.splice(gi, 1); })}><Trash2 size={16} /></button>}
              </div>
            </div>
            {g.rules.map((r, ri) => (
              <div key={ri} className="stack" style={{ gap: 6, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                {ri > 0 && <span className="badge blue" style={{ alignSelf: 'flex-start' }}>{g.match === 'any' ? 'OR' : 'AND'}</span>}
                <div className="row">
                  <select className="input" value={r.field} onChange={(e) => upd((n) => {
                    const field = e.target.value;
                    const kind = FILTER_FIELDS[field].values;
                    n.groups[gi].rules[ri] = { field, op: 'is', value: kind === 'channels' ? 'sms' : kind?.startsWith('users') ? 'me' : kind === 'direction' ? 'inbound' : kind === 'status' ? 'open' : '' };
                  })}>
                    {Object.entries(FILTER_FIELDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <select className="input" style={{ width: 110 }} value={r.op} onChange={(e) => upd((n) => { n.groups[gi].rules[ri].op = e.target.value; })}>
                    <option value="is">is</option>
                    <option value="is_not">is not</option>
                  </select>
                  <button className="icon-btn" onClick={() => upd((n) => { n.groups[gi].rules.splice(ri, 1); if (!n.groups[gi].rules.length) n.groups.splice(gi, 1); if (!n.groups.length) n.groups.push({ match: 'all', rules: [emptyRule()] }); })}><Trash2 size={16} /></button>
                </div>
                <ValueInput rule={r} onChange={(v) => upd((n) => { n.groups[gi].rules[ri].value = v; })} />
              </div>
            ))}
            <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => upd((n) => { n.groups[gi].rules.push(emptyRule()); })}><Plus size={14} /> Add rule</button>
          </div>
        ))}
        <button className="btn" onClick={() => upd((n) => { n.groups.push({ match: 'all', rules: [emptyRule()] }); })}><Plus size={16} /> Add group</button>
        {onSave && (
          <div className="row">
            <input className="input" placeholder="Save as… (e.g. My WhatsApp inbound)" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn" disabled={!name} onClick={() => { onSave(name, f); setName(''); }}>Save</button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
