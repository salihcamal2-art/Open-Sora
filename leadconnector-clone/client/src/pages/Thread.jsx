import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Phone, Star, MoreVertical, Send, Clock, FileText, AtSign, Trash2, User, UserCheck, Archive, MailOpen, Eye, EyeOff, AlertCircle, PhoneIncoming, PhoneOutgoing,
} from 'lucide-react';
import { api } from '../api.js';
import { useApp, useLive } from '../app-context.jsx';
import { Avatar, ChannelIcon, Sheet, Spinner, TopBar, UserSelect, Field } from '../components/ui.jsx';
import { CHANNEL_LABELS, CHANNEL_COLORS, fmtDate, fmtTime, fmtDateTime, toLocalInput, fromLocalInput } from '../utils.js';

const SEND_CHANNELS = ['sms', 'email', 'whatsapp', 'facebook', 'instagram', 'gmb', 'live_chat', 'comment'];

export default function Thread() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { user, team, toast } = useApp();
  const [conv, setConv] = useState(null);
  const [msgs, setMsgs] = useState(null);
  const [channel, setChannel] = useState(params.get('channel') || null);
  const [body, setBody] = useState('');
  const [subject, setSubject] = useState('');
  const [mentions, setMentions] = useState([]);
  const [sending, setSending] = useState(false);
  const [sheet, setSheet] = useState(null); // 'menu' | 'snippets' | 'schedule' | 'mention' | 'channel' | 'assign'
  const [snippets, setSnippets] = useState([]);
  const [scheduleAt, setScheduleAt] = useState(toLocalInput(new Date(Date.now() + 3600e3)));
  const endRef = useRef(null);

  const load = async () => {
    try {
      const [c, m] = await Promise.all([api.get(`/conversations/${id}`), api.get(`/conversations/${id}/messages`)]);
      setConv(c);
      setMsgs(m);
      if (!channel) {
        const last = [...m].reverse().find((x) => !['comment', 'call'].includes(x.type));
        setChannel(last?.type || (c.contact?.phone ? 'sms' : 'email'));
      }
      if (c.unread_count) api.post(`/conversations/${id}/read`, {});
    } catch (e) {
      toast(e.message, 'error');
      nav('/conversations');
    }
  };
  useEffect(() => { load(); }, [id]); // eslint-disable-line
  useLive(['message.created', 'conversation.updated'], (e) => {
    if (Number(e.payload.conversationId) === Number(id)) load();
  });
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [msgs?.length]);
  useEffect(() => { api.get('/snippets').then(setSnippets).catch(() => {}); }, []);

  const send = async (scheduled) => {
    if (!body.trim()) return;
    setSending(true);
    try {
      await api.post(`/conversations/${id}/messages`, {
        type: channel, body, subject: channel === 'email' ? subject : undefined,
        mentions: channel === 'comment' ? mentions : undefined,
        scheduledAt: scheduled ? fromLocalInput(scheduleAt) : undefined,
      });
      setBody('');
      setSubject('');
      setMentions([]);
      setSheet(null);
      if (scheduled) toast('Message scheduled', 'success');
      load();
    } catch (e) {
      toast(e.message, 'error');
      load();
    } finally {
      setSending(false);
    }
  };

  const update = async (data) => {
    setSheet(null);
    setConv(await api.put(`/conversations/${id}`, data));
  };
  const follow = async (on) => {
    setSheet(null);
    setConv(await api.post(`/conversations/${id}/follow`, { follow: on }));
  };
  const delMsg = async (m) => {
    if (!confirm(m.status === 'scheduled' ? 'Cancel this scheduled message?' : 'Delete this comment?')) return;
    await api.del(`/conversations/${id}/messages/${m.id}`);
    load();
  };

  const grouped = useMemo(() => {
    const out = [];
    let lastDay = '';
    for (const m of msgs || []) {
      const t = m.scheduled_at && m.status === 'scheduled' ? m.scheduled_at : m.created_at;
      const day = fmtDate(t);
      if (day !== lastDay) out.push({ sep: day, key: `d-${m.id}` });
      lastDay = day;
      out.push(m);
    }
    return out;
  }, [msgs]);

  if (!conv) return <Spinner />;
  const c = conv.contact;
  const dnd = c?.dnd_all || (channel && c?.dnd?.[channel]);

  return (
    <div className="fullscreen">
      <TopBar
        back="/conversations"
        title={<span style={{ cursor: 'pointer' }} onClick={() => nav(`/contacts/${c.id}`)}>{c.name}</span>}
        sub={[c.phone, conv.assignee ? `Assigned: ${conv.assignee.name}` : 'Unassigned'].filter(Boolean).join(' · ')}
        right={
          <>
            {c.phone && <button className="icon-btn" onClick={() => nav(`/dialer?contact=${c.id}`)} aria-label="Call"><Phone size={20} /></button>}
            <button className="icon-btn" onClick={() => update({ starred: !conv.starred })} aria-label="Star"><Star size={20} fill={conv.starred ? '#fdb022' : 'none'} color={conv.starred ? '#fdb022' : undefined} /></button>
            <button className="icon-btn" onClick={() => setSheet('menu')} aria-label="More"><MoreVertical size={20} /></button>
          </>
        }
      />
      <div className="thread">
        {!msgs ? <Spinner /> : grouped.map((m) =>
          m.sep ? <div key={m.key} className="day-sep">{m.sep}</div> : <Message key={m.id} m={m} onDelete={() => delMsg(m)} />
        )}
        <div ref={endRef} />
      </div>

      <div className="composer">
        <div className="row" style={{ marginBottom: 6, gap: 6 }}>
          <button className="channel-pill" onClick={() => setSheet('channel')} style={{ borderColor: CHANNEL_COLORS[channel] }}>
            <ChannelIcon type={channel} /> {CHANNEL_LABELS[channel]} ▾
          </button>
          {channel === 'comment' && mentions.length > 0 && <span className="faint">@ {mentions.map((uid) => team.find((u) => u.id === uid)?.name).join(', ')}</span>}
          {dnd && <span className="badge red"><AlertCircle size={12} /> DND on {CHANNEL_LABELS[channel]}</span>}
          <span className="grow" />
          <button className="icon-btn" onClick={() => setSheet('snippets')} aria-label="Snippets"><FileText size={19} /></button>
          {channel === 'comment'
            ? <button className="icon-btn" onClick={() => setSheet('mention')} aria-label="Mention"><AtSign size={19} /></button>
            : <button className="icon-btn" onClick={() => setSheet('schedule')} aria-label="Schedule" disabled={!body.trim()}><Clock size={19} /></button>}
        </div>
        {channel === 'email' && <input className="input" style={{ marginBottom: 6 }} placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />}
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <textarea
            rows={1}
            placeholder={channel === 'comment' ? 'Internal comment (only your team sees this)…' : `Type a ${CHANNEL_LABELS[channel]} message…`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }}
          />
          <button className="icon-btn" style={{ background: 'var(--brand)', color: '#fff', borderRadius: '50%' }} disabled={sending || !body.trim()} onClick={() => send()} aria-label="Send"><Send size={18} /></button>
        </div>
        {channel === 'sms' && body && <div className="faint" style={{ textAlign: 'right', fontSize: 11 }}>{body.length} chars · {Math.ceil(body.length / 160)} segment(s)</div>}
      </div>

      {sheet === 'channel' && (
        <Sheet title="Send via" onClose={() => setSheet(null)}>
          {SEND_CHANNELS.map((ch) => (
            <button key={ch} className="list-item" onClick={() => { setChannel(ch); setSheet(null); }}>
              <ChannelIcon type={ch} size={20} /> <span className="grow">{CHANNEL_LABELS[ch]}</span>
              {(c.dnd_all || c.dnd?.[ch]) && ch !== 'comment' && <span className="badge red">DND</span>}
              {ch === channel && <span className="badge blue">Selected</span>}
            </button>
          ))}
        </Sheet>
      )}
      {sheet === 'snippets' && (
        <Sheet title="Snippets" onClose={() => setSheet(null)}>
          {snippets.length === 0 && <div className="faint">No snippets yet. Add them in Settings → Snippets.</div>}
          {snippets.map((s) => (
            <button key={s.id} className="list-item" onClick={() => { setBody((b) => (b ? `${b} ${s.body}` : s.body)); setSheet(null); }}>
              <div className="grow"><div className="title">{s.name}</div><div className="faint">{s.body}</div></div>
            </button>
          ))}
          <div className="faint" style={{ marginTop: 10 }}>Variables like {'{{contact.first_name}}'} are filled in automatically when sent.</div>
        </Sheet>
      )}
      {sheet === 'schedule' && (
        <Sheet title="Schedule message" onClose={() => setSheet(null)} footer={<button className="btn primary block" disabled={sending} onClick={() => send(true)}>Schedule</button>}>
          <Field label="Send at"><input className="input" type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} /></Field>
        </Sheet>
      )}
      {sheet === 'mention' && (
        <Sheet title="Mention teammates" onClose={() => setSheet(null)} footer={<button className="btn primary block" onClick={() => setSheet(null)}>Done</button>}>
          {team.filter((u) => u.id !== user.id).map((u) => (
            <button key={u.id} className="list-item" onClick={() => {
              const on = mentions.includes(u.id);
              setMentions(on ? mentions.filter((x) => x !== u.id) : [...mentions, u.id]);
              if (!on && !body.includes(`@${u.name}`)) setBody((b) => `${b}@${u.name} `);
            }}>
              <Avatar name={u.name} color={u.color} size={32} /><span className="grow">{u.name}</span>
              {mentions.includes(u.id) && <UserCheck color="var(--brand)" />}
            </button>
          ))}
        </Sheet>
      )}
      {sheet === 'assign' && (
        <Sheet title="Assign conversation" onClose={() => setSheet(null)}>
          <UserSelect value={conv.assigned_to} onChange={(v) => update({ assigned_to: v })} />
        </Sheet>
      )}
      {sheet === 'menu' && (
        <Sheet title="Conversation" onClose={() => setSheet(null)}>
          <div className="menu-list">
            <button className="list-item" onClick={() => nav(`/contacts/${c.id}`)}><User size={18} /> View contact</button>
            <button className="list-item" onClick={() => setSheet('assign')}><UserCheck size={18} /> Assign ({conv.assignee?.name || 'Unassigned'})</button>
            <button className="list-item" onClick={() => follow(!conv.following)}>{conv.following ? <EyeOff size={18} /> : <Eye size={18} />} {conv.following ? 'Unfollow' : 'Follow'} conversation</button>
            <button className="list-item" onClick={async () => { await api.post(`/conversations/${id}/read`, { unread: true }); nav('/conversations'); }}><MailOpen size={18} /> Mark as unread</button>
            <button className="list-item" onClick={() => update({ status: conv.status === 'closed' ? 'open' : 'closed' })}><Archive size={18} /> {conv.status === 'closed' ? 'Reopen' : 'Close'} conversation</button>
            <button className="list-item" onClick={async () => { if (confirm('Delete conversation and all messages?')) { await api.del(`/conversations/${id}`); nav('/conversations'); } }}><Trash2 size={18} color="var(--danger)" /> Delete conversation</button>
          </div>
          {conv.followers.length > 0 && <div className="faint" style={{ marginTop: 10 }}>Followers: {conv.followers.map((f) => f.name).join(', ')}</div>}
        </Sheet>
      )}
    </div>
  );
}

function Message({ m, onDelete }) {
  if (m.type === 'call') {
    const Icon = m.direction === 'inbound' ? PhoneIncoming : PhoneOutgoing;
    const d = m.meta?.duration || 0;
    return (
      <div className={`msg ${m.direction === 'inbound' ? 'in' : 'out'}`}>
        <div className="call-card">
          <Icon size={18} color="var(--brand)" />
          <div>
            <div className="bold small">{m.direction === 'inbound' ? 'Inbound' : 'Outbound'} call · {m.meta?.outcome || m.status}</div>
            <div className="faint">{Math.floor(d / 60)}m {d % 60}s{m.body ? ` · ${m.body}` : ''}</div>
          </div>
        </div>
        <div className="meta">{fmtTime(m.created_at)}{m.user_name ? ` · ${m.user_name}` : ''}</div>
      </div>
    );
  }
  const cls = m.direction === 'internal' ? 'internal' : m.direction === 'inbound' ? 'in' : 'out';
  return (
    <div className={`msg ${cls} ${m.status === 'scheduled' ? 'scheduled' : ''} ${m.status === 'failed' ? 'failed' : ''}`}>
      <div className="bubble" onContextMenu={(e) => { if (m.status === 'scheduled' || m.type === 'comment') { e.preventDefault(); onDelete(); } }}>
        {m.subject && <div className="subject">{m.subject}</div>}
        {m.body}
        {m.attachments?.map((a, i) => <div key={i}><a href={a.url} target="_blank" rel="noreferrer">📎 Attachment</a></div>)}
      </div>
      <div className="meta">
        <ChannelIcon type={m.type} size={11} />
        {m.status === 'scheduled' ? <>Scheduled · {fmtDateTime(m.scheduled_at)} <button className="btn ghost sm" style={{ padding: 0 }} onClick={onDelete}>Cancel</button></> : fmtTime(m.created_at)}
        {m.user_name && m.direction !== 'inbound' ? ` · ${m.user_name}` : ''}
        {m.direction === 'outbound' && m.status !== 'scheduled' && ` · ${m.status}`}
        {m.status === 'failed' && m.meta?.error && ` — ${m.meta.error}`}
        {m.type === 'comment' && <button className="btn ghost sm" style={{ padding: 0 }} onClick={onDelete}><Trash2 size={11} /></button>}
      </div>
    </div>
  );
}
