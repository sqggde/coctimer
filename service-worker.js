const STATIC_CACHE = 'clash-tool-static-v3';
const DYNAMIC_CACHE = 'clash-tool-dynamic-v3';

// 静态资源缓存列表
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './assets/img/pwa-64x64.png',
  './assets/img/pwa-192x192.png',
  './assets/img/pwa-512x512.png',
  './assets/img/maskable-icon-512x512.png',
  './assets/css/style.css',
  './assets/js/core/constants.js',
  './assets/js/utils/time.js',
  './assets/js/utils/misc.js',
  './assets/js/core/calculator.js',
  './assets/js/utils/colors.js',
  './assets/js/core/storage.js',
  './assets/js/core/settings.js',
  './assets/js/core/instance.js',
  './assets/js/core/import.js',
  './assets/js/features/helper.js',
  './assets/js/features/swipe.js',
  './assets/js/ui/renderer.js',
  './assets/js/features/sort.js',
  './assets/js/core/accounts.js',
  './assets/js/cloud/sync-client.js',
  './assets/js/app.js',
  './assets/js/pwa.js'
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

  // 同源JS/CSS文件 → 用 staleWhileRevalidate（缓存优先 + 后台更新）
  if (url.origin === location.origin && (url.pathname.endsWith('.js') || url.pathname.endsWith('.css'))) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  // 同源HTML → 网络优先
  if (url.origin === location.origin) {
    if (request.destination === 'document' || url.pathname.endsWith('.html')) {
      event.respondWith(networkFirst(request, STATIC_CACHE));
    } else {
      // 其他静态资源（图片等）→ 缓存优先
      event.respondWith(cacheFirst(request, STATIC_CACHE));
    }
    return;
  }

  // CDN资源 → 缓存优先
  if (url.hostname === 'cdn.tailwindcss.com' || url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(cacheFirst(request, DYNAMIC_CACHE));
    return;
  }

  // 其他请求 → 网络优先
  event.respondWith(networkFirst(request));
});

/**
 * 缓存优先：有缓存就返回缓存，没有才请求网络
 */
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

/**
 * 网络优先：先请求网络，失败时用缓存
 */
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok && cacheName) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw e;
  }
}

/**
 * 缓存优先 + 后台更新：立刻返回缓存，同时在后台拉新版更新缓存
 */
async function staleWhileRevalidate(request, cacheName) {
  const cached = await caches.match(request);
  // 后台异步更新缓存
  const fetchPromise = fetch(request).then(response => {
    if (response.ok && cacheName) {
      caches.open(cacheName).then(cache => cache.put(request, response));
    }
    return response.clone();
  }).catch(() => cached);
  // 有缓存立刻返回，没有就等网络结果
  return cached || fetchPromise;
}
