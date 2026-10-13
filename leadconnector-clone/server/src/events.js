import { EventEmitter } from 'node:events';

// Central in-process event bus. Every domain change is emitted here so that
// (1) the workflow engine can react and (2) connected clients get live updates over SSE.
export const bus = new EventEmitter();
bus.setMaxListeners(1000);

const clients = new Map(); // id -> { res, userId, locationId }
let nextId = 1;

export function addSseClient(res, userId, locationId) {
  const id = nextId++;
  clients.set(id, { res, userId, locationId });
  return () => clients.delete(id);
}

/**
 * Emit a domain event.
 * @param {string} type e.g. "message.created"
 * @param {number} locationId
 * @param {object} payload
 */
export function emit(type, locationId, payload = {}) {
  const evt = { type, locationId, payload, at: new Date().toISOString() };
  bus.emit('event', evt);
  const data = `event: ${type}\ndata: ${JSON.stringify(evt)}\n\n`;
  for (const c of clients.values()) {
    if (c.locationId !== locationId) continue;
    if (payload.userId && type === 'notification.created' && payload.userId !== c.userId) continue;
    try {
      c.res.write(data);
    } catch {
      /* client went away */
    }
  }
}

setInterval(() => {
  for (const c of clients.values()) {
    try {
      c.res.write(': ping\n\n');
    } catch {
      /* ignore */
    }
  }
}, 25000).unref();
