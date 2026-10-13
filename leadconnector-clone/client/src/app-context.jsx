import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, session, subscribe } from './api.js';
import { setCurrency } from './utils.js';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [locations, setLocations] = useState([]);
  const [location, setLocation] = useState(null);
  const [team, setTeam] = useState([]);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(!!session.token);
  const [toasts, setToasts] = useState([]);
  const [badges, setBadges] = useState({ conversations: 0, notifications: 0 });
  const listeners = useRef(new Set());

  const toast = useCallback((message, type = 'info') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const refreshBadges = useCallback(async () => {
    if (!session.token) return;
    try {
      const [c, n] = await Promise.all([api.get('/conversations', { tab: 'unread', limit: 1 }), api.get('/notifications')]);
      setBadges({ conversations: c.unread, notifications: n.unread });
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(async () => {
    if (!session.token) {
      setLoading(false);
      return;
    }
    try {
      const me = await api.get('/auth/me');
      setUser(me.user);
      setRole(me.user.role);
      setLocations(me.locations);
      session.locationId = me.locationId;
      if (me.locationId) {
        const [loc, t] = await Promise.all([api.get('/auth/location'), api.get('/auth/team')]);
        setLocation(loc);
        setCurrency(loc.currency);
        setTeam(t);
      }
      refreshBadges();
    } catch {
      session.token = null;
    } finally {
      setLoading(false);
    }
  }, [refreshBadges]);

  useEffect(() => {
    load();
  }, [load]);

  // live events -> fan out to page listeners + badge refresh + toasts for notifications
  useEffect(() => {
    if (!user || !location) return undefined;
    const unsub = subscribe((evt) => {
      listeners.current.forEach((fn) => fn(evt));
      if (['message.created', 'conversation.updated', 'notification.created'].includes(evt.type)) refreshBadges();
      if (evt.type === 'notification.created' && evt.payload.userId === user.id) {
        toast(`🔔 ${evt.payload.title}`);
        if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
          new Notification(evt.payload.title, { body: evt.payload.body || '' });
        }
      }
    });
    return unsub;
  }, [user, location, refreshBadges, toast]);

  const onLive = useCallback((fn) => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  }, []);

  const login = async (token) => {
    session.token = token;
    setLoading(true);
    await load();
  };
  const logout = () => {
    session.token = null;
    session.locationId = null;
    setUser(null);
    window.location.href = '/login';
  };
  const switchLocation = async (id) => {
    session.locationId = id;
    setLoading(true);
    await load();
  };

  const value = {
    user, setUser, locations, location, setLocation, team, setTeam, role, isAdmin: role === 'admin',
    loading, login, logout, switchLocation, reload: load, toast, toasts, badges, refreshBadges, onLive,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Re-run `fn` whenever a live event of one of `types` arrives. */
export function useLive(types, fn) {
  const { onLive } = useApp();
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => onLive((evt) => (types.includes(evt.type) ? ref.current(evt) : null)), [onLive, types.join()]); // eslint-disable-line react-hooks/exhaustive-deps
}
