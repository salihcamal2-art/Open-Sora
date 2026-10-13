// Background loop: sends scheduled messages, resumes workflows after "wait" steps,
// and sends appointment reminders to the assigned user.
import { all, get, run, update, parseJSON } from './db.js';
import { deliver, notify, fullName } from './services.js';
import { emit } from './events.js';
import { executeWorkflow } from './workflows.js';

const reminded = new Set();

async function tick() {
  const nowIso = new Date().toISOString();

  // 1. scheduled messages
  for (const m of all("SELECT * FROM messages WHERE status = 'scheduled' AND scheduled_at <= ?", nowIso)) {
    update('messages', m.id, { status: 'pending', created_at: nowIso });
    await deliver(m.id);
    const msg = get('SELECT * FROM messages WHERE id = ?', m.id);
    update('conversations', m.conversation_id, {
      last_message_at: nowIso, last_message_body: msg.body, last_message_type: msg.type, last_message_direction: 'outbound',
    });
    emit('message.created', m.location_id, { conversationId: m.conversation_id, contactId: m.contact_id, message: { ...msg, meta: parseJSON(msg.meta, {}) } });
  }

  // 2. workflow wait steps
  for (const j of all('SELECT * FROM jobs WHERE done = 0 AND run_at <= ?', nowIso)) {
    run('UPDATE jobs SET done = 1 WHERE id = ?', j.id);
    const p = parseJSON(j.payload, {});
    if (j.kind === 'workflow_resume') {
      const wf = get("SELECT * FROM workflows WHERE id = ? AND status = 'published'", p.workflowId);
      if (wf) await executeWorkflow(wf, p.contactId, p.index, p.ctx).catch(console.error);
    }
  }

  // 3. appointment reminders (15 minutes before)
  const soon = new Date(Date.now() + 15 * 60e3).toISOString();
  for (const a of all("SELECT * FROM appointments WHERE is_block = 0 AND status = 'confirmed' AND start_at > ? AND start_at <= ?", nowIso, soon)) {
    if (reminded.has(a.id) || !a.assigned_to) continue;
    reminded.add(a.id);
    const c = a.contact_id ? get('SELECT * FROM contacts WHERE id = ?', a.contact_id) : null;
    notify(a.assigned_to, a.location_id, 'appointment', 'Appointment starting soon', `${fullName(c)} at ${new Date(a.start_at).toUTCString()}`, '/calendars');
  }
}

export function startScheduler() {
  let busy = false;
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await tick();
    } catch (e) {
      console.error('scheduler error', e);
    } finally {
      busy = false;
    }
  }, 15000).unref();
}
