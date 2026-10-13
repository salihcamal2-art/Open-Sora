// Service worker: installable app shell + Web Push notifications.
const CACHE = 'lc-shell-v2';
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/icon.svg', '/manifest.webmanifest'])));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api')) return;
  if (e.request.mode === 'navigate') e.respondWith(fetch(e.request).catch(() => caches.match('/')));
});

self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data.json(); } catch { data = { title: 'LeadConnector', body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(data.title || 'New notification', {
    body: data.body || '', icon: '/icon.svg', badge: '/icon.svg', data: { link: data.link || '/' }, tag: data.link || undefined, renotify: true,
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const link = (e.notification.data && e.notification.data.link) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
    for (const w of wins) {
      if ('focus' in w) { w.navigate(link).catch(() => {}); return w.focus(); }
    }
    return self.clients.openWindow(link);
  }));
});
