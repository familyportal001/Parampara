// Parampara — Service Worker
//
// ┌─────────────────────────────────────────────────────────────────┐
// │  IMPORTANT: Bump CACHE_VERSION every time you deploy changes.   │
// │  This is what tells installed PWAs to update automatically.     │
// │  Change it to any new string — a date works well:               │
// │    e.g.  'parampara-2026-03-08'                                 │
// └─────────────────────────────────────────────────────────────────┘
const CACHE_VERSION = 'parampara-2026-03-07-v0.2';

const CACHE   = CACHE_VERSION;
const DYNAMIC = CACHE_VERSION + '-dyn';

const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './privacy.html',
  './terms.html',
  // Self-hosted fonts
  './fonts/crimson-pro-300.woff2',
  './fonts/crimson-pro-400.woff2',
  './fonts/crimson-pro-600.woff2',
  './fonts/crimson-pro-300-italic.woff2',
  './fonts/dm-sans-300.woff2',
  './fonts/dm-sans-400.woff2',
  './fonts/dm-sans-500.woff2',
  // Firebase SDK (versioned CDN)
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js',
];

// Firebase data + auth — always network, never cache
const NETWORK_ONLY_HOSTS = [
  'firebasedatabase.app',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE))
      .catch(err => {
        // Font files may not exist yet — retry without them
        console.warn('[SW] precache partial failure:', err);
        const core = PRECACHE.filter(u => !u.includes('./fonts/'));
        return caches.open(CACHE).then(c => c.addAll(core));
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE && k !== DYNAMIC)
          .map(k => { console.log('[SW] deleting old cache:', k); return caches.delete(k); })
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Firebase data + auth — network only
  if (NETWORK_ONLY_HOSTS.some(h => url.hostname.includes(h))) return;

  // Versioned Firebase CDN — cache-first
  if (url.hostname === 'www.gstatic.com') {
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

  // Same-origin assets — stale-while-revalidate
  if (url.hostname === self.location.hostname) {
    e.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          const net = fetch(e.request).then(res => {
            if (res.ok) cache.put(e.request, res.clone());
            return res;
          }).catch(() => cached);
          return cached || net;
        })
      )
    );
  }
});
