/// <reference lib="webworker" />
const CACHE_NAME = 'fintech-digital-v2';
const OFFLINE_URL = '/';

// Assets to cache on install
const PRECACHE_ASSETS = [
  '/',
  '/manifest.json',
  '/icon.svg',
  '/favicon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-GET and cross-origin
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) return;

  // API calls: network-first
  if (request.url.includes('/rest/') || request.url.includes('/functions/') || request.url.includes('/realtime/')) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // JS/CSS: NETWORK-FIRST (evita servir bundles antigos após deploy).
  // Só cacheia para fallback offline.
  if (request.url.match(/\.(js|css)$/)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Imagens/fontes: cache-first (dificilmente mudam)
  if (request.url.match(/\.(svg|png|jpg|jpeg|webp|woff2?)$/)) {
    event.respondWith(
      caches.match(request).then((cached) =>
        cached || fetch(request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
      )
    );
    return;
  }

  // Navegação (documento HTML): network-first, fallback cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // Default: network com fallback cache
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
