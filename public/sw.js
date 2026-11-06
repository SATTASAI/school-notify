self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'โรงเรียนบ้านป่าเด็ง', {
    body: d.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: d.tag,
    actions: (d.actions || []).slice(0, 2).map((a, i) => ({ action: 'a' + i, title: a.title })),
    data: { url: d.url || '/', actions: (d.actions || []).map((a) => a.url) },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const data = e.notification.data || {};
  const picked = /^a\d$/.test(e.action || '') ? (data.actions || [])[Number(e.action.slice(1))] : null;
  const url = new URL(picked || data.url || '/', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if (c.url === url && 'focus' in c) return c.focus();
    return self.clients.openWindow(url);
  }));
});
