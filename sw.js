// /sw.js

// Tăng phiên bản cache để buộc cập nhật
const CACHE_NAME = 'family-tree-cache-v4';

// Các file "vỏ" của ứng dụng
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

// --- 1. CÀI ĐẶT (Install) ---
// Tải và cache các file "vỏ" ứng dụng (app shell)
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('SW: Đã mở cache và đang tải app shell');
      // Tạo request mới để tránh lỗi "credentials"
      const reqs = URLS_TO_CACHE.map((u) => new Request(new URL(u, self.location), { credentials: 'omit' }));
      return cache.addAll(reqs);
    })
  );
});

// --- 2. KÍCH HOẠT (Activate) ---
// Dọn dẹp các cache cũ
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // Xóa tất cả cache không trùng tên với CACHE_NAME hiện tại
    await Promise.all(
      keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k)))
    );
    await self.clients.claim();
    console.log('SW: Đã kích hoạt và dọn dẹp cache cũ.');
  })());
});

// --- 3. CAN THIỆP REQUEST (Fetch) ---
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // === PHẦN SỬA ĐỔI QUAN TRỌNG ===
  //
  // 1. Bỏ qua tất cả request KHÔNG PHẢI 'GET' (như POST, PUT, OPTIONS)
  //    (Điều này đảm bảo /save-data, /submit-proposal... luôn chạy đúng)
  //
  // 2. Bỏ qua tất cả request 'GET' đến thư mục /data/
  //    (Điều này đảm bảo db.json, proposals.json, tree-*.json luôn MỚI NHẤT)
  //
  if (req.method !== 'GET' || url.pathname.includes('/data/')) {
    return; // Để trình duyệt tự xử lý (không cache)
  }
  // ===================================

  // Với các request còn lại (CSS, JS, index.html...), dùng chiến lược "Cache First"
  event.respondWith((async () => {
    // 1. Thử tìm trong cache trước
    const cachedResponse = await caches.match(req);
    if (cachedResponse) {
      // Có trong cache -> Trả về ngay lập tức
      return cachedResponse;
    }

    // 2. Nếu không có cache, đi lấy từ mạng
    try {
      const freshResponse = await fetch(req);
      
      // Chỉ cache nếu request thành công (status 200)
      if (freshResponse && freshResponse.status === 200) {
        const cache = await caches.open(CACHE_NAME);
        // Phải clone() vì response (freshResponse) chỉ dùng được 1 lần
        cache.put(req, freshResponse.clone());
      }
      
      return freshResponse;
    } catch (error) {
      // 3. Nếu mạng lỗi (offline)
      console.error('SW: Lỗi fetch, có thể đang offline:', error);
      
      // Nếu đây là request điều hướng (người dùng gõ URL), trả về trang index.html
      if (req.mode === 'navigate') {
        console.log('SW: Offline, trả về index.html');
        return caches.match('./index.html');
      }
      
      // Với các request khác (CSS, JS) bị lỗi, cứ để lỗi xảy ra
      throw error;
    }
  })());
});
