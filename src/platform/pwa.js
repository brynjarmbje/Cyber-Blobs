// @ts-nocheck

export function registerServiceWorker() {
  // Service workers require https or localhost.
  if (!('serviceWorker' in navigator)) return;

  const isLocalhost =
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1' ||
    location.hostname === '[::1]';

  if (location.protocol !== 'https:' && !isLocalhost) {
    // Don't spam console; just skip registration.
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // ignore
    });
  });
}
