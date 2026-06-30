const CACHE = 'myfinance-v20';
const ASSETS = [
  '/Myfinance/',
  '/Myfinance/index.html',
  '/Myfinance/manifest.json',
  '/Myfinance/icons/icon-192.png',
  '/Myfinance/icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).catch(() => caches.match('/Myfinance/index.html')))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
