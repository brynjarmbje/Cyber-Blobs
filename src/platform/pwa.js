// @ts-nocheck

export function registerServiceWorker() {
  // Service workers require https or localhost.
  if (!('serviceWorker' in navigator)) return;

  const isLocalhost =
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1' ||
    location.hostname === '[::1]';

  if (isLocalhost) {
    // Skip SW on localhost to avoid stale caches during dev.
    return;
  }

  if (location.protocol !== 'https:') {
    // Don't spam console; just skip registration.
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // ignore
    });
  });
}
