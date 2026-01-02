const CACHE_NAME = 'sheetlog-v1';
const scopeUrl = new URL(self.registration.scope);
const CORE_ASSETS = [
  scopeUrl.href,
  new URL('manifest.webmanifest', scopeUrl).href,
  new URL('icon.svg', scopeUrl).href,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const request = event.request;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    event.respondWith(
      caches
        .match(request)
        .then((cached) => cached || fetch(request).catch(() => caches.match(scopeUrl.href)))
    );
  }
});
