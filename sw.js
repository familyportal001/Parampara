// Parampara — Service Worker v2  (offline-capable)
const CACHE   = 'parampara-v2';
const DYNAMIC = 'parampara-dyn-v2';

const PRECACHE = [
  './index.html',
  './manifest.json',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js',
  'https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,300;0,400;0,600;1,300&family=DM+Sans:wght@300;400;500&display=swap',
];

// Firebase data + auth endpoints — network-only, never cache
const NETWORK_ONLY_HOSTS = [
  'firebasedatabase.app',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] precache partial failure:', err))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE && k !== DYNAMIC).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // 1. Firebase data + auth — always go to network, never cache
  if (NETWORK_ONLY_HOSTS.some(h => url.hostname.includes(h))) return;

  // 2. Versioned CDN assets (Firebase SDK, Google Fonts) — cache-first
  const isCdn = url.hostname === 'www.gstatic.com'
             || url.hostname === 'fonts.gstatic.com'
             || url.hostname === 'fonts.googleapis.com';
  if (isCdn) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res.ok) caches.open(DYNAMIC).then(c => c.put(e.request, res.clone()));
          return res;
        });
      })
    );
    return;
  }

  // 3. Same-origin app shell — stale-while-revalidate
  if (url.hostname === self.location.hostname) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        const net = fetch(e.request).then(res => {
          if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          return res;
        }).catch(() => cached);
        return cached || net;
      })
    );
  }
});
