const CACHE = 'coc-tool-web-20260829-tkj9n1';
const CORE_FILES = [
    "./",
    "./index.html",
    "./shim.js",
    "./manifest.json",
    "./css/tailwind.min.js",
    "./css/font-awesome.min.css",
    "./css/app.css",
    "./css/help.css",
    "./css/clan.css",
    "./css/overview.css",
    "./css/pokedex.css",
    "./fonts/fontawesome-webfont.ttf",
    "./fonts/fontawesome-webfont.woff",
    "./fonts/fontawesome-webfont.woff2",
    "./js/accounts.js",
    "./js/app.js",
    "./js/calc.js",
    "./js/clan-league.js",
    "./js/clan.js",
    "./js/core.js",
    "./js/duration-search.js",
    "./js/names.js",
    "./js/overview-detail.js",
    "./js/overview.js",
    "./js/pokedex.js",
    "./js/progress-meta-cn.js",
    "./js/progress-meta-intl.js",
    "./js/progress.js",
    "./js/services.js",
    "./js/settings.js",
    "./js/svg-icons.js",
    "./js/vendor",
    "./js/war-view.js",
    "./js/warlog.js"
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE).then(cache => cache.addAll(CORE_FILES)).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.filter(k => k !== CACHE).map(k => caches.delete(k))
        )).then(() => self.clients.claim())
    );
});

// 同源 GET：缓存优先 + 后台更新；跨域（coctool.top API）走网络
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== self.location.origin) return;
    event.respondWith(
        caches.match(request).then(cached => {
            const fetchPromise = fetch(request).then(response => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE).then(cache => cache.put(request, clone));
                }
                return response;
            }).catch(() => cached);
            return cached || fetchPromise;
        })
    );
});
