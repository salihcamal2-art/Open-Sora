// Automation engine: "When <trigger> happens, run <actions>" (simplified HighLevel workflows).
import { all, get, insert, run, update, parseJSON, now } from './db.js';
import { bus } from './events.js';
import {
  sendMessage, addTags, removeTags, createTask, notify, notifyLocationUsers, logActivity,
  fullName, renderTemplate, updateContact, serializeContact,
} from './services.js';

export const TRIGGERS = {
  contact_created: { event: 'contact.created', label: 'Contact Created' },
  tag_added: { event: 'contact.tag_added', label: 'Contact Tag Added', config: ['tag'] },
  inbound_message: { event: 'message.created', label: 'Customer Replied', config: ['channel'] },
  appointment_booked: { event: 'appointment.created', label: 'Appointment Booked', config: ['calendar_id'] },
  appointment_status: { event: 'appointment.status_changed', label: 'Appointment Status Changed', config: ['status'] },
  opportunity_created: { event: 'opportunity.created', label: 'Opportunity Created', config: ['pipeline_id'] },
  stage_changed: { event: 'opportunity.stage_changed', label: 'Pipeline Stage Changed', config: ['pipeline_id', 'stage_id'] },
  opportunity_status: { event: 'opportunity.status_changed', label: 'Opportunity Status Changed', config: ['status'] },
  invoice_paid: { event: 'invoice.paid', label: 'Invoice Paid' },
  payment_received: { event: 'payment.received', label: 'Payment Received' },
  review_received: { event: 'review.created', label: 'Review Received', config: ['max_rating'] },
  task_completed: { event: 'task.completed', label: 'Task Completed' },
};

export const ACTIONS = {
  send_sms: { label: 'Send SMS', fields: ['body'] },
  send_email: { label: 'Send Email', fields: ['subject', 'body'] },
  send_whatsapp: { label: 'Send WhatsApp', fields: ['body'] },
  add_tag: { label: 'Add Tag', fields: ['tag'] },
  remove_tag: { label: 'Remove Tag', fields: ['tag'] },
  create_task: { label: 'Create Task', fields: ['title', 'due_in_hours'] },
  create_opportunity: { label: 'Create / Update Opportunity', fields: ['pipeline_id', 'stage_id', 'name', 'value'] },
  assign_user: { label: 'Assign to User', fields: ['user_id'] },
  add_note: { label: 'Add Note', fields: ['body'] },
  update_field: { label: 'Update Contact Field', fields: ['field', 'value'] },
  set_dnd: { label: 'Enable DND (all channels)', fields: [] },
  internal_notification: { label: 'Internal Notification', fields: ['user_id', 'body'] },
  manual_action: { label: 'Manual Action (Call / SMS)', fields: ['channel', 'instructions'] },
  wait: { label: 'Wait', fields: ['minutes'] },
  webhook: { label: 'Webhook', fields: ['url'] },
};

function matches(wf, evt) {
  const cfg = parseJSON(wf.trigger_config, {});
  const p = evt.payload;
  switch (wf.trigger_type) {
    case 'tag_added':
      return !cfg.tag || cfg.tag.toLowerCase() === String(p.tag).toLowerCase();
    case 'inbound_message':
      return p.message?.direction === 'inbound' && (!cfg.channel || cfg.channel === p.message.type);
    case 'appointment_booked':
      return !cfg.calendar_id || Number(cfg.calendar_id) === Number(p.calendarId);
    case 'appointment_status':
      return !cfg.status || cfg.status === p.status;
    case 'opportunity_created':
      return !cfg.pipeline_id || Number(cfg.pipeline_id) === Number(p.pipelineId);
    case 'stage_changed':
      return (!cfg.pipeline_id || Number(cfg.pipeline_id) === Number(p.pipelineId)) && (!cfg.stage_id || Number(cfg.stage_id) === Number(p.stageId));
    case 'opportunity_status':
      return !cfg.status || cfg.status === p.status;
    case 'review_received':
      return !cfg.max_rating || Number(p.rating) <= Number(cfg.max_rating);
    default:
      return true;
  }
}

function log(wfId, contactId, action, status, detail) {
  insert('workflow_logs', { workflow_id: wfId, contact_id: contactId || null, action, status, detail: detail ? String(detail).slice(0, 500) : null });
}

async function runAction(wf, action, contactId, ctx) {
  const L = wf.location_id;
  const contact = contactId ? get('SELECT * FROM contacts WHERE id = ?', contactId) : null;
  const location = get('SELECT * FROM locations WHERE id = ?', L);
  const needContact = () => {
    if (!contact) throw new Error('No contact in context');
  };
  switch (action.type) {
    case 'send_sms':
    case 'send_email':
    case 'send_whatsapp': {
      needContact();
      const type = action.type.replace('send_', '');
      const m = await sendMessage(L, { contactId, type, body: action.body, subject: action.subject });
      if (m.status === 'failed') throw new Error(m.meta?.error || 'Delivery failed');
      return `${type} sent`;
    }
    case 'add_tag':
      needContact();
      addTags(L, contactId, [action.tag]);
      return `tag ${action.tag}`;
    case 'remove_tag':
      needContact();
      removeTags(L, contactId, [action.tag]);
      return `tag ${action.tag} removed`;
    case 'create_task': {
      const due = action.due_in_hours ? new Date(Date.now() + Number(action.due_in_hours) * 3600e3).toISOString() : null;
      createTask(L, { title: renderTemplate(action.title, contact, location), contact_id: contactId, due_at: due, assigned_to: contact?.assigned_to || null });
      return 'task created';
    }
    case 'create_opportunity': {
      needContact();
      const existing = get('SELECT * FROM opportunities WHERE contact_id = ? AND pipeline_id = ? AND status = ?', contactId, action.pipeline_id, 'open');
      if (existing) {
        update('opportunities', existing.id, { stage_id: Number(action.stage_id), updated_at: now() });
        return 'opportunity moved';
      }
      insert('opportunities', {
        location_id: L, pipeline_id: Number(action.pipeline_id), stage_id: Number(action.stage_id), contact_id: contactId,
        name: renderTemplate(action.name, contact, location) || fullName(contact), value: Number(action.value || 0),
        source: 'workflow', assigned_to: contact.assigned_to,
      });
      return 'opportunity created';
    }
    case 'assign_user':
      needContact();
      updateContact(L, contactId, { assigned_to: Number(action.user_id) });
      run('UPDATE conversations SET assigned_to = ? WHERE contact_id = ?', Number(action.user_id), contactId);
      return 'assigned';
    case 'add_note':
      needContact();
      insert('notes', { contact_id: contactId, body: renderTemplate(action.body, contact, location) });
      return 'note added';
    case 'update_field':
      needContact();
      if (String(action.field).startsWith('custom.')) {
        const custom = parseJSON(contact.custom, {});
        custom[action.field.slice(7)] = action.value;
        updateContact(L, contactId, { custom });
      } else {
        updateContact(L, contactId, { [action.field]: action.value });
      }
      return 'field updated';
    case 'set_dnd':
      needContact();
      update('contacts', contactId, { dnd_all: 1 });
      return 'dnd enabled';
    case 'internal_notification': {
      const body = renderTemplate(action.body, contact, location);
      const link = contactId ? `/contacts/${contactId}` : '/';
      if (action.user_id) notify(Number(action.user_id), L, 'workflow', wf.name, body, link);
      else notifyLocationUsers(L, 'workflow', wf.name, body, link);
      return 'notified';
    }
    case 'manual_action':
      needContact();
      insert('manual_actions', { location_id: L, contact_id: contactId, workflow_id: wf.id, type: action.channel || 'call', instructions: action.instructions, assigned_to: contact.assigned_to });
      return 'manual action queued';
    case 'webhook': {
      const res = await fetch(action.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow: wf.name, event: ctx.event, contact: contact ? serializeContact(contact) : null }),
      });
      return `webhook ${res.status}`;
    }
    default:
      throw new Error(`Unknown action ${action.type}`);
  }
}

export async function executeWorkflow(wf, contactId, startIndex = 0, ctx = {}) {
  const actions = parseJSON(wf.actions, []);
  for (let i = startIndex; i < actions.length; i++) {
    const a = actions[i];
    if (a.type === 'wait') {
      const runAt = new Date(Date.now() + Number(a.minutes || 0) * 60e3).toISOString();
      insert('jobs', { run_at: runAt, kind: 'workflow_resume', payload: { workflowId: wf.id, contactId, index: i + 1, ctx } });
      log(wf.id, contactId, 'wait', 'scheduled', `resume at ${runAt}`);
      return;
    }
    try {
      const detail = await runAction(wf, a, contactId, ctx);
      log(wf.id, contactId, a.type, 'success', detail);
    } catch (e) {
      log(wf.id, contactId, a.type, 'error', e.message);
    }
  }
}

bus.on('event', async (evt) => {
  const types = Object.entries(TRIGGERS).filter(([, t]) => t.event === evt.type).map(([k]) => k);
  if (!types.length) return;
  const wfs = all(
    `SELECT * FROM workflows WHERE location_id = ? AND status = 'published' AND trigger_type IN (${types.map(() => '?').join(',')})`,
    evt.locationId, ...types
  );
  for (const wf of wfs) {
    if (!matches(wf, evt)) continue;
    const contactId = evt.payload.contactId || null;
    // loop protection: same workflow + contact cannot re-enter within 10 seconds
    if (contactId) {
      const recent = get(
        "SELECT id FROM workflow_logs WHERE workflow_id = ? AND contact_id = ? AND action = 'enrolled' AND created_at > ?",
        wf.id, contactId, new Date(Date.now() - 10e3).toISOString()
      );
      if (recent) continue;
    }
    log(wf.id, contactId, 'enrolled', 'success', `trigger ${wf.trigger_type}`);
    if (contactId) logActivity(wf.location_id, contactId, null, 'workflow', `Entered workflow "${wf.name}"`);
    setImmediate(() => executeWorkflow(wf, contactId, 0, { event: evt.type }).catch((e) => console.error('workflow error', e)));
  }
});
