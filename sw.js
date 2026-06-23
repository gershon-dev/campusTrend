(function () {
    if (window.location.hostname.includes('github.io')) {
        // Build the equivalent Vercel URL preserving the current path
        const path = window.location.pathname.replace('/campusTrend', '') || '/';
        window.location.replace('https://campustrend-uew.vercel.app' + path);
    }
})();
const CACHE_NAME = 'campustrend-uew-v4';

const CORE_FILES = [
  '/',
  '/index.html',
  '/tutorials.html',
  '/styles/index.css',
  '/scripts/index.js',
  '/scripts/notifications.js',
  '/scripts/tutorials.js',
  '/supabase-config.js',
  '/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = event.request.url;

  // Skip caching for external APIs and non-HTTP requests
  if (
    !url.startsWith('http') ||
    url.startsWith('chrome') ||
    url.includes('supabase.co') ||
    url.includes('cloudinary.com') ||
    url.includes('googleapis.com') ||
    url.includes('supabase.io')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, networkResponse.clone());
            });
          }
        }).catch(() => {});
        return cachedResponse;
      }
      return fetch(event.request).then(networkResponse => {
        if (!networkResponse || networkResponse.status !== 200) return networkResponse;
        const clone = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return networkResponse;
      }).catch(() => {
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('/index.html');
        }
      });
    })
  );
});

// ===== PUSH: show notification when push event received =====
self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'CampusTrend UEW', body: event.data ? event.data.text() : 'New notification' };
  }
  const title = data.title || 'CampusTrend UEW';
  const options = {
    body:    data.body || 'You have a new notification',
    icon:    data.icon || '/icons/icon-192.png',
    badge:   '/icons/icon-96.png',
    vibrate: [200, 100, 200],
    data:    { url: data.url || '/' },
    actions: [
      { action: 'open', title: 'Open App' },
      { action: 'close', title: 'Dismiss' }
    ]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// ===== NOTIFICATION CLICK: open app when notification is clicked =====
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'close') return;
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes('campustrend-uew.vercel.app') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
