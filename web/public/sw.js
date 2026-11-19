/*
 * Muzii service worker.
 *
 * Strategy:
 * - API (/api/*): never cached, straight to network (the Worker/Pages proxy
 *   handles its own edge caching).
 * - Navigations + same-origin static assets: NETWORK-FIRST with cache
 *   fallback. Cache-first was serving users a stale JS bundle after every
 *   deploy; network-first means a fresh deploy is picked up immediately and
 *   the cache is only an offline safety net.
 * - Old caches are purged on activate.
 */
// Bumped whenever the shell changes, so activate() purges the old copy.
const CACHE = 'muzii-v4';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Same-origin only — never intercept cross-origin media (audio ranges,
  // cover art CDNs) since streaming needs direct, unmodified requests.
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(request));
    return;
  }

  /*
   * The manifest and the icons decide installability, so they must always be
   * fresh. A cached old manifest (missing PNG icons, wrong display mode)
   * makes Chrome refuse to install even after a corrected deploy - and the
   * user just sees "installing" and nothing else. Network-first, no caching.
   */
  if (
    url.pathname === '/manifest.webmanifest' ||
    /\.(png|svg)$/.test(url.pathname) ||
    url.pathname === '/sw.js'
  ) {
    e.respondWith(fetch(request).catch(() => caches.match(request).then((r) => r ?? Response.error())));
    return;
  }

  e.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => undefined);
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(request);
        if (hit) return hit;
        // Offline navigation fallback to the app shell.
        if (request.mode === 'navigate') {
          const shell = await caches.match('/index.html');
          if (shell) return shell;
        }
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      }),
  );
});
