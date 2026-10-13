import { api } from './api.js';

const b64ToBytes = (s) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** Asks permission, subscribes this device to Web Push and registers it with the server. */
export async function enablePush() {
  if (!pushSupported()) throw new Error('Push notifications are not supported here. On iPhone, add the app to your Home Screen first.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications permission was not granted');
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const { publicKey } = await api.get('/push/key');
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
  await api.post('/push/subscribe', { subscription: sub.toJSON() });
  return api.post('/push/test', {});
}

export async function pushStatus() {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission !== 'granted') return Notification.permission;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ? 'on' : 'off';
}
