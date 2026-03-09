// Parampara — Service Worker
//
// ┌─────────────────────────────────────────────────────────────────┐
// │  IMPORTANT: Bump CACHE_VERSION every time you deploy changes.   │
// │  This is what tells installed PWAs to update automatically.     │
// │  Change it to any new string — a date works well:               │
// │    e.g.  'parampara-2026-03-08'                                 │
// └─────────────────────────────────────────────────────────────────┘
const CACHE_VERSION = 'parampara-2026-03-09';
const CACHE   = CACHE_VERSION;
const DYNAMIC = CACHE_VERSION + '-dyn';

// ── What to precache on install ───────────────────────────────────
// Firebase CDN URLs are intentionally NOT here — addAll() fetches them
// with no-cors which returns opaque (status-0) responses that can abort
// the entire install on strict browsers.  They are cached on first use
// by the gstatic.com branch in the fetch handler instead.
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
];

// Firebase data + auth — always network, never cache
const NETWORK_ONLY_HOSTS = [
  'firebasedatabase.app',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebasestorage.googleapis.com', // Fix 6: explicit passthrough for Storage photo URLs
];

// ── INSTALL ────────────────────────────────────────────────────────
// Fix 2: skipWaiting() is called unconditionally via a finally-equivalent
// pattern so it fires even if precaching partially fails, preventing the
// new SW from being stuck in "waiting" forever.
//
// Fix 3: if addAll() fails (e.g. font files not yet deployed), we wipe the
// partial cache and retry with only the guaranteed-available core assets so
// we don't leave corrupt/incomplete entries behind.
//
// Fix 4: Firebase CDN URLs removed from PRECACHE (see note above).
self.addEventListener('install', e => {
  e.waitUntil(
    caches.delete(CACHE) // wipe any partial cache from a previous failed install
      .then(() => caches.open(CACHE))
      .then(c => c.addAll(PRECACHE))
      .catch(err => {
        console.warn('[SW] precache full failure, retrying core only:', err);
        // Font files may not exist yet — retry without them so the SW
        // installs successfully and fonts are cached on first network use.
        const core = PRECACHE.filter(u => !u.includes('./fonts/'));
        return caches.delete(CACHE) // Fix 3: wipe partial entries before retry
          .then(() => caches.open(CACHE))
          .then(c => c.addAll(core));
      })
      .finally(() => self.skipWaiting()) // Fix 2: always skip waiting
  );
});

// ── ACTIVATE ───────────────────────────────────────────────────────
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

// ── FETCH ──────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Fix 6: Firebase data, auth, and Storage — explicit network-only passthrough
  if (NETWORK_ONLY_HOSTS.some(h => url.hostname.includes(h))) return;

  // Versioned Firebase CDN — cache-first (these never change for a given version)
  if (url.hostname === 'www.gstatic.com') {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          // Only cache valid non-opaque responses (opaque responses have status 0
          // and cannot be validated — storing them wastes quota and can cause issues)
          if (res.ok) caches.open(DYNAMIC).then(c => c.put(e.request, res.clone()));
          return res;
        });
      })
    );
    return;
  }

  // Same-origin assets ──────────────────────────────────────────────
  if (url.hostname === self.location.hostname) {
    const isNavigationOrHTML =
      e.request.mode === 'navigate' ||
      e.request.destination === 'document' ||
      url.pathname === '/' ||
      url.pathname.endsWith('.html');

    if (isNavigationOrHTML) {
      // Fix 1: index.html and all navigation requests use NETWORK-FIRST so that
      // users always get the latest version on the first load after an update.
      //
      // The stale-while-revalidate strategy that was here before caused the old
      // cached index.html to be served immediately even after a new SW activated,
      // meaning users needed TWO reloads to see any update — which almost never
      // happens on a homescreen PWA.
      //
      // Network-first means a ~200ms extra latency on first load when online,
      // but guarantees the user always runs the version that matches the active SW.
      // On failure (offline) we fall back to the cached copy.
      e.respondWith(
        fetch(e.request)
          .then(res => {
            if (res.ok) {
              // Update the cache with the fresh response so offline still works
              caches.open(CACHE).then(c => c.put(e.request, res.clone()));
              // Tell all open clients to reload so they pick up the new HTML
              // immediately rather than serving the old page until next navigation.
              // We check if the cached version differs before reloading to avoid
              // an infinite reload loop.
              caches.open(CACHE).then(async c => {
                const old = await c.match(e.request);
                if (old) {
                  const [oldText, newText] = await Promise.all([old.clone().text(), res.clone().text()]);
                  if (oldText !== newText) {
                    const clients = await self.clients.matchAll({ type: 'window' });
                    clients.forEach(client => {
                      // Only reload clients that are showing our app, not popups etc.
                      if (client.url && new URL(client.url).hostname === self.location.hostname) {
                        client.navigate(client.url);
                      }
                    });
                  }
                }
              });
            }
            return res;
          })
          .catch(() =>
            caches.match(e.request).then(cached =>
              // Fix 5: return a proper 503 if both network and cache miss
              cached || new Response('<h1>Offline</h1><p>Please reconnect to use Parampara.</p>', {
                status: 503,
                headers: { 'Content-Type': 'text/html' }
              })
            )
          )
      );
      return;
    }

    // Non-HTML same-origin assets (JS, CSS, fonts, images, icons) —
    // stale-while-revalidate is fine here since they are versioned via SW cache key
    e.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          const net = fetch(e.request).then(res => {
            if (res.ok) cache.put(e.request, res.clone());
            return res;
          }).catch(() =>
            // Fix 5: only return cached if it exists; otherwise a proper offline response
            cached || new Response('Offline', { status: 503 })
          );
          return cached || net;
        })
      )
    );
  }
});
