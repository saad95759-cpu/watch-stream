const CACHE_NAME = 'watch-party-v1';
const OFFLINE_URL = '/watch-party/offline.html';

const SHELL_FILES = [
  '/watch-party/',
  '/watch-party/index.html',
  '/watch-party/style.css',
  '/watch-party/main.js',
  '/watch-party/translations.js',
  OFFLINE_URL
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Exclude API, socket, or dynamic requests
  if (url.pathname.includes('/api/') || url.pathname.includes('/socket.io/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(event.request).catch(() => {
        // Fallback to offline page for navigations
        if (event.request.mode === 'navigate') {
          return caches.match(OFFLINE_URL);
        }
      });
    })
  );
});
