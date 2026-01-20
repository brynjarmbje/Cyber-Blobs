// @ts-nocheck
/* Simple service worker for offline caching.
   Note: Service workers require a secure context (https or localhost). */

const CACHE_NAME = 'leikur-cache-v4';

// Keep this list small + stable; cache-first for static assets.
const PRECACHE_URLS = [
  './',
  './index.html',
  './style.css',
  './CyberBlob-Theme_V1.mp3',
  './CyberBlob-Menu-Theme.mp3',
  './CyberBlob-drum1.mp3',
  './CyberBlob-whine1.mp3',
  './js/main.js',
  './js/game.js',
  './js/ui.js',
  './js/audio.js',
  './js/map.js',
  './js/renderer3d.js',
  './js/constants.js',
  './js/storage.js',
  './js/achievements.js',
  './js/enemy2d.js',
  './manifest.webmanifest',
  './icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(PRECACHE_URLS);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin.
  if (url.origin !== self.location.origin) return;

  // Navigation: network-first so updates land quickly.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE_NAME);
          cache.put('./index.html', fresh.clone());
          return fresh;
        } catch {
          const cache = await caches.open(CACHE_NAME);
          return (await cache.match('./index.html')) || (await cache.match('./'));
        }
      })()
    );
    return;
  }

  // Static assets: cache-first.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      if (cached) return cached;

      const fresh = await fetch(req);
      // Only cache successful basic responses.
      if (fresh && fresh.ok && fresh.type === 'basic') {
        cache.put(req, fresh.clone());
      }
      return fresh;
    })()
  );
});
