// Đặt tên và phiên bản cho cache
const CACHE_NAME = 'family-tree-cache-v2'; // Tăng phiên bản cache

// Danh sách các file cần thiết để ứng dụng hoạt động offline
const URLS_TO_CACHE = [
  '/',
  'index.html',
  'styles.css',
  'script.js',
  'manifest.json',
  'favicon.ico',
  'https://cdnjs.cloudflare.com/ajax/libs/hammer.js/2.0.8/hammer.min.js',
  'https://fonts.googleapis.com/css2?family=Tac+One&display=swap',
];

// 1. Cài đặt Service Worker và cache các tài nguyên
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(URLS_TO_CACHE).catch(err => {
            console.warn('Không thể cache một số tài nguyên:', err);
        });
      })
  );
});

// 2. Phục vụ tài nguyên từ cache (Cache-First, sau đó Network)
self.addEventListener('fetch', event => {
  // Bỏ qua các request của Netlify Identity và function
  if (event.request.url.includes('/.netlify/')) {
    return fetch(event.request);
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Nếu tìm thấy trong cache, trả về nó
        if (response) {
          return response;
        }

        // Nếu không, đi lấy từ mạng
        return fetch(event.request).then(
          networkResponse => {
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
            return networkResponse;
          }
        ).catch(err => {
            console.error('Fetch failed', err);
        });
      }
    )
  );
});

// 3. Xóa các cache cũ khi Service Worker được cập nhật
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
