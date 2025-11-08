// /sw.js
const CACHE_NAME = 'family-tree-cache-v3';
const URLS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './manifest.json',
  './favicon.ico',
  'https://cdnjs.cloudflare.com/ajax/libs/hammer.js/2.0.8/hammer.min.js',
  'https://fonts.googleapis.com/css2?family=Tac+One&display=swap',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      const reqs = URLS_TO_CACHE.map((u) => new Request(new URL(u, self.location), { credentials: 'omit' }));
      return cache.addAll(reqs);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Bỏ qua request không phải GET hoặc các call tới API (tránh cache sai)
  const isApi = new URL(req.url).pathname.startsWith('/api/');
  if (req.method !== 'GET' || isApi) return;

  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, fresh.clone());
      return fresh;
    } catch {
      // Fallback: nếu offline và không có cache — trả index.html (SPA)
      if (req.mode === 'navigate') {
        return caches.match('./index.html');
      }
      throw;
    }
  })());
});
