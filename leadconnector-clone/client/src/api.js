// Thin fetch wrapper that adds the auth token + active location (sub-account).
const BASE = import.meta.env.VITE_API_URL || '';

export const session = {
  get token() {
    return localStorage.getItem('lc_token');
  },
  set token(v) {
    v ? localStorage.setItem('lc_token', v) : localStorage.removeItem('lc_token');
  },
  get locationId() {
    return localStorage.getItem('lc_location');
  },
  set locationId(v) {
    v ? localStorage.setItem('lc_location', String(v)) : localStorage.removeItem('lc_location');
  },
};

export async function api(path, { method = 'GET', body, query } = {}) {
  let url = `${BASE}/api${path}`;
  if (query) {
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    if ([...qs].length) url += `?${qs}`;
  }
  const headers = { 'Content-Type': 'application/json' };
  if (session.token) headers.Authorization = `Bearer ${session.token}`;
  if (session.locationId) headers['X-Location-Id'] = session.locationId;
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && session.token && !path.startsWith('/auth/login')) {
    session.token = null;
    window.location.href = '/login';
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

api.get = (p, query) => api(p, { query });
api.post = (p, body) => api(p, { method: 'POST', body });
api.put = (p, body) => api(p, { method: 'PUT', body });
api.del = (p) => api(p, { method: 'DELETE' });

/** Subscribe to live server events. Returns an unsubscribe function. */
export function subscribe(onEvent) {
  if (!session.token) return () => {};
  const url = `${BASE}/api/stream?token=${encodeURIComponent(session.token)}&locationId=${session.locationId || ''}`;
  const es = new EventSource(url);
  const handler = (e) => {
    try {
      onEvent(JSON.parse(e.data));
    } catch {
      /* ignore */
    }
  };
  const types = [
    'message.created', 'conversation.updated', 'contact.created', 'contact.updated', 'contact.deleted', 'notification.created',
    'opportunity.created', 'opportunity.updated', 'opportunity.stage_changed', 'appointment.created', 'appointment.updated',
    'task.created', 'task.updated', 'payment.received', 'review.created',
  ];
  types.forEach((t) => es.addEventListener(t, handler));
  return () => es.close();
}
