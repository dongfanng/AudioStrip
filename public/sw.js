// Service Worker：缓存同源静态资源，实现二次访问秒加载
// 注意：ffmpeg core 从 CDN 加载（跨域），由浏览器 HTTP 缓存处理，不走 Service Worker
const CACHE_NAME = 'audio-strip-v2';
const CORE_ASSETS = [
  '/',
  '/index.html',
];

// 安装：预缓存核心页面
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

// 激活：清理旧版本缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// 请求拦截：同源资源缓存优先，网络回退
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // 仅处理 GET 请求
  if (request.method !== 'GET') return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        // 仅缓存同源的成功响应（CDN 资源由浏览器 HTTP 缓存处理）
        if (response.ok && new URL(request.url).origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
