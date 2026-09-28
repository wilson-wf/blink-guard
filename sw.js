/* 眨眨护眼 PWA Service Worker — v44 TRAE安卓版下载 */
const CACHE_NAME = 'blink-guard-v44';
const ASSETS = [
  './',
  './index.html',
  './style.css?v=44',
  './app.js?v=44',
  './manifest.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 网络优先策略：先从网络拿最新，失败再用缓存
self.addEventListener('fetch', (e) => {
  // APK 等大文件不缓存，直接走网络
  const url = e.request.url;
  if (url.endsWith('.apk') || url.endsWith('.aab')) {
    e.respondWith(fetch(e.request));
    return;
  }
  e.respondWith(
    fetch(e.request)
      .then(res => {
        // 缓存成功的响应
        if (e.request.method === 'GET' && res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
