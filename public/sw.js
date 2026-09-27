// Service Worker para SIMAN PWA
const CACHE_NAME = 'siman-cache-v2';
const STATIC_ASSETS = [
  '/',
  '/login',
  '/mecanico',
  '/dashboard',
  '/login.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) return caches.delete(k);
        })
      );
    })
  );
  self.clients.claim();
});

// Network first, falling back to cache
self.addEventListener('fetch', (e) => {
  // Ignorar peticiones a la API para datos frescos
  if (e.request.url.includes('/api/')) {
    return;
  }
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        return res;
      })
      .catch(() => {
        return caches.match(e.request);
      })
  );
});
