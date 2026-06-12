const CACHE_NAME = 'clash-tool-v1';
const STATIC_CACHE = 'clash-tool-static-v1';
const DYNAMIC_CACHE = 'clash-tool-dynamic-v1';

// 静态资源缓存列表
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './assets/img/pwa-64x64.png',
  './assets/img/pwa-192x192.png',
  './assets/img/pwa-512x512.png',
  './assets/img/maskable-icon-512x512.png'
];

// CDN资源缓存列表
const CDN_ASSETS = [
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/font-awesome@4.7.0/css/font-awesome.min.css'
];

// 安装事件 - 缓存静态资源
self.addEventListener('install', event => {
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then(cache => cache.addAll(STATIC_ASSETS)),
      caches.open(DYNAMIC_CACHE).then(cache => cache.addAll(CDN_ASSETS))
    ]).then(() => self.skipWaiting())
  );
});

// 激活事件 - 清理旧缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 拦截网络请求
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  // 同源静态资源 - 缓存优先
  if (url.origin === location.origin) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // CDN资源 - 缓存优先
  if (url.hostname === 'cdn.tailwindcss.com' || url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(cacheFirst(request, DYNAMIC_CACHE));
    return;
  }

  // 其他请求 - 网络优先
  event.respondWith(networkFirst(request));
});

async function cacheFirst(request, cacheName) {
  try {
    const cached = await caches.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.destination === 'document') {
      return caches.match('./index.html');
    }
    throw e;
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch (e) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw e;
  }
}
