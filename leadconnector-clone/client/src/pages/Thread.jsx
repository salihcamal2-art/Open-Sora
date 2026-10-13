import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Phone, Star, MoreVertical, Send, Clock, FileText, AtSign, Trash2, Paperclip, Mic, Square, X, Sparkles, User, UserCheck, Archive, MailOpen, Eye, EyeOff, AlertCircle, PhoneIncoming, PhoneOutgoing,
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
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(null); // { recorder, start }
  const [recSecs, setRecSecs] = useState(0);
  const fileRef = useRef(null);
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

  const upload = async (file) => {
    const data = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
    return api.post('/uploads', { name: file.name || 'voice-note.webm', type: file.type || 'application/octet-stream', data });
  };
  const addFiles = async (list) => {
    setUploading(true);
    try {
      for (const f of list) {
        const up = await upload(f);
        setFiles((x) => [...x, up]);
      }
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setUploading(false);
    }
  };
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = (recorder.mimeType || 'audio/webm').split(';')[0];
        const blob = new Blob(chunks, { type });
        await addFiles([new File([blob], `voice-note.${type.split('/')[1] || 'webm'}`, { type })]);
      };
      recorder.start();
      const start = Date.now();
      const timer = setInterval(() => setRecSecs(Math.floor((Date.now() - start) / 1000)), 500);
      setRecSecs(0);
      setRecording({ recorder, timer });
    } catch (e) {
      toast(`Microphone unavailable: ${e.message}`, 'error');
    }
  };
  const stopRecording = (discard) => {
    if (!recording) return;
    clearInterval(recording.timer);
    if (discard) recording.recorder.onstop = () => recording.recorder.stream?.getTracks().forEach((t) => t.stop());
    recording.recorder.stop();
    setRecording(null);
  };

  const canSend = body.trim() || (files.length && channel !== 'comment');
  const send = async (scheduled) => {
    if (!canSend) return;
    setSending(true);
    try {
      await api.post(`/conversations/${id}/messages`, {
        type: channel, body, subject: channel === 'email' ? subject : undefined, attachments: files,
        mentions: channel === 'comment' ? mentions : undefined,
        scheduledAt: scheduled ? fromLocalInput(scheduleAt) : undefined,
      });
      setBody('');
      setFiles([]);
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
          <button className="icon-btn" onClick={() => setSheet('ai')} aria-label="AI assist"><Sparkles size={19} color="#7A5AF8" /></button>
          <button className="icon-btn" onClick={() => setSheet('snippets')} aria-label="Snippets"><FileText size={19} /></button>
          {channel === 'comment'
            ? <button className="icon-btn" onClick={() => setSheet('mention')} aria-label="Mention"><AtSign size={19} /></button>
            : <button className="icon-btn" onClick={() => setSheet('schedule')} aria-label="Schedule" disabled={!canSend}><Clock size={19} /></button>}
        </div>
        {channel === 'email' && <input className="input" style={{ marginBottom: 6 }} placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />}
        {(files.length > 0 || uploading) && (
          <div className="row wrap" style={{ gap: 6, marginBottom: 6 }}>
            {files.map((f, i) => (
              <span key={f.url} className="tag-chip" style={{ padding: 4 }}>
                {f.type.startsWith('image/') ? <img src={f.url} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6 }} /> : f.type.startsWith('audio/') ? '🎤 Voice note' : `📎 ${f.name}`}
                <button onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label="Remove attachment"><X size={14} /></button>
              </span>
            ))}
            {uploading && <span className="faint">Uploading…</span>}
          </div>
        )}
        <input ref={fileRef} type="file" multiple hidden accept="image/*,audio/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={(e) => { addFiles([...e.target.files]); e.target.value = ''; }} />
        {recording ? (
          <div className="row" style={{ padding: '6px 4px' }}>
            <span className="ch-dot" style={{ background: 'var(--danger)', width: 10, height: 10 }} />
            <span className="grow bold">Recording… {Math.floor(recSecs / 60)}:{String(recSecs % 60).padStart(2, '0')}</span>
            <button className="btn sm" onClick={() => stopRecording(true)}>Discard</button>
            <button className="icon-btn" style={{ background: 'var(--danger)', color: '#fff', borderRadius: '50%' }} onClick={() => stopRecording(false)} aria-label="Stop recording"><Square size={16} fill="#fff" /></button>
          </div>
        ) : (
        <div className="row" style={{ alignItems: 'flex-end' }}>
          {channel !== 'comment' && <button className="icon-btn" onClick={() => fileRef.current.click()} aria-label="Attach file"><Paperclip size={19} /></button>}
          <textarea
            rows={1}
            placeholder={channel === 'comment' ? 'Internal comment (only your team sees this)…' : `Type a ${CHANNEL_LABELS[channel]} message…`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }}
          />
          {!body.trim() && !files.length && channel !== 'comment' && 'MediaRecorder' in window
            ? <button className="icon-btn" style={{ background: 'var(--brand)', color: '#fff', borderRadius: '50%' }} onClick={startRecording} aria-label="Record voice note"><Mic size={18} /></button>
            : <button className="icon-btn" style={{ background: 'var(--brand)', color: '#fff', borderRadius: '50%' }} disabled={sending || uploading || !canSend} onClick={() => send()} aria-label="Send"><Send size={18} /></button>}
        </div>
        )}
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
      {sheet === 'ai' && <AiSheet convId={id} channel={channel} draft={body} onClose={() => setSheet(null)} onUse={(t) => { setBody(t); setSheet(null); }} />}
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
        {m.attachments?.map((a, i) => <Attachment key={i} a={a} />)}
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

function Attachment({ a }) {
  const type = a.type || '';
  if (type.startsWith('image/')) return <a href={a.url} target="_blank" rel="noreferrer"><img src={a.url} alt={a.name || 'image'} style={{ maxWidth: 220, maxHeight: 260, borderRadius: 12, display: 'block', marginTop: 4 }} /></a>;
  if (type.startsWith('audio/')) return <audio controls src={a.url} style={{ maxWidth: 240, marginTop: 4 }} />;
  if (type.startsWith('video/')) return <video controls src={a.url} style={{ maxWidth: 240, borderRadius: 12, marginTop: 4 }} />;
  return <div style={{ marginTop: 4 }}><a href={a.url} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>📎 {a.name || 'Attachment'}</a></div>;
}

const REWRITES = [['improve', 'Improve'], ['professional', 'Professional'], ['friendly', 'Friendly'], ['shorter', 'Shorter'], ['grammar', 'Fix grammar'], ['arabic', 'To Arabic'], ['english', 'To English']];

/** Conversation AI: suggested replies, summary, and rewriting the current draft. */
function AiSheet({ convId, channel, draft, onClose, onUse }) {
  const { toast } = useApp();
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState('');
  const [replies, setReplies] = useState(null);
  const [summary, setSummary] = useState('');
  const [rewritten, setRewritten] = useState('');
  const [hint, setHint] = useState('');
  useEffect(() => { api.get('/ai/status').then(setStatus).catch(() => setStatus({ enabled: false })); }, []);

  const run = async (key, fn) => {
    setBusy(key);
    try { await fn(); } catch (e) { toast(e.message, 'error'); } finally { setBusy(''); }
  };
  const suggest = () => run('suggest', async () => setReplies((await api.post(`/ai/conversations/${convId}/suggest`, { channel, instructions: hint })).replies));
  const summarize = () => run('summary', async () => setSummary((await api.post(`/ai/conversations/${convId}/summary`, {})).summary));
  const rewrite = (mode) => run(mode, async () => setRewritten((await api.post('/ai/rewrite', { text: draft, mode })).text));

  return (
    <Sheet title="✨ AI assistant" onClose={onClose} wide>
      {!status ? <Spinner /> : !status.enabled ? (
        <div className="faint">AI is not enabled yet. Add <code>ANTHROPIC_API_KEY</code> to the server's <code>.env</code> file and restart to get reply suggestions, summaries and rewriting.</div>
      ) : (
        <div className="stack">
          <div className="row">
            <input className="input" placeholder="Optional: guide the reply (e.g. offer Friday 4pm)" value={hint} onChange={(e) => setHint(e.target.value)} />
            <button className="btn primary" disabled={!!busy} onClick={suggest}>{busy === 'suggest' ? 'Thinking…' : 'Suggest replies'}</button>
          </div>
          {replies?.map((r, i) => (
            <button key={i} className="card pad" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => onUse(r)}>
              <div style={{ whiteSpace: 'pre-wrap' }}>{r}</div>
              <div className="small" style={{ color: 'var(--brand)', marginTop: 4 }}>Use this reply →</div>
            </button>
          ))}
          <div className="hr" />
          <button className="btn" disabled={!!busy} onClick={summarize}>{busy === 'summary' ? 'Summarizing…' : 'Summarize conversation'}</button>
          {summary && <div className="card pad small" style={{ whiteSpace: 'pre-wrap' }}>{summary}</div>}
          <div className="hr" />
          <div className="small bold">Rewrite my draft</div>
          {!draft.trim() ? <div className="faint">Type a message first, then pick a style.</div> : (
            <>
              <div className="row wrap" style={{ gap: 6 }}>
                {REWRITES.map(([k, l]) => <button key={k} className="tab" disabled={!!busy} onClick={() => rewrite(k)}>{busy === k ? '…' : l}</button>)}
              </div>
              {rewritten && (
                <button className="card pad" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => onUse(rewritten)}>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{rewritten}</div>
                  <div className="small" style={{ color: 'var(--brand)', marginTop: 4 }}>Replace my draft →</div>
                </button>
              )}
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
