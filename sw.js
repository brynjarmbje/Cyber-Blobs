// @ts-nocheck
/* Simple service worker for offline caching.
   Note: Service workers require a secure context (https or localhost). */

const CACHE_NAME = 'leikur-cache-v150';

// Keep this list small + stable; cache-first for static assets.
const PRECACHE_URLS = [
  './',
  './index.html',
  './style.css',
  './style.css?v=148',
  './style.base.css',
  './style.modals.css',
  './style.hud.css',
  './style.screens.css',
  './views/main-menu.html',
  './views/app.html',
  './views/modals.html',
  './assets/play_cyberyolk_button.png',
  './assets/Capsule_CyberYolks.png',
  './assets/shop_button_cyberyolk.png',
  './assets/leaderboard_button_cyberyolk.png',
  './assets/settings_button_cyberyolk.png',
  './assets/about_button_cyberyolk.png',
  './assets/close_button_cyberyolk.png',
  './assets/yolk_target_frame.png',
  './assets/yolk_target_frame_border.png',
  './assets/yolk-frame_transp_cyber.png',
  './assets/menu-hero.png',
  './assets/asteroid-crystal-reactor.png',
  './CyberBlob-Theme_V1.mp3',
  './CyberBlob-Menu-Theme.mp3',
  './CyberBlob-SpaceFlow.mp3',
  './CyberBlob-SoundFX-bullet.mp3',
  './CyberBlob-SoundFX-kill-v1.mp3',
  './CyberBlob-drum1.mp3',
  './CyberBlob-whine1.mp3',
  './src/app/bootstrap.js',
  './src/app/main.js',
  './src/platform/pwa.js',
  './src/platform/audio.js',
  './src/platform/storage.js',
  './src/shared/constants.js',
  './src/ui/ui.js',
  './src/ui/menus.js',
  './src/ui/lore.js',
  './src/ui/achievements.js',
  './src/game/game.js',
  './src/game/map.js',
  './src/game/renderer3d.js',
  './src/game/enemy2d.js',
  './manifest.webmanifest',
  './icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Cache each URL independently so optional assets don't break SW install.
      await Promise.allSettled(
        PRECACHE_URLS.map(async (u) => {
          try {
            await cache.add(u);
          } catch {
            // ignore
          }
        })
      );
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
