const CACHE = 'pocket-arcade-rebuild-3.0.0';
const APP = [
  './', './index.html', './manifest.webmanifest', './assets/icon.svg', './assets/icon-192.png', './assets/icon-512.png',
  './src/style.css', './src/app.js', './src/art.js', './src/engine.js',
  './src/games/trail.js', './src/games/crates.js', './src/games/tanks.js',
  './src/games/blocks.js', './src/games/gomoku.js',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP)));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const versions = await caches.keys();
    await Promise.all(versions.filter(key => key.startsWith('pocket-arcade-rebuild-') && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(event.request.mode === 'navigate' ? './index.html' : event.request);
    return cached ?? fetch(event.request);
  })());
});
