const SCOPE = self.registration.scope;
const CACHE_PREFIX = `pocket-arcade:${SCOPE}:`;
const CACHE = `${CACHE_PREFIX}3.3.2`;
const APP = [
  './', './index.html', './manifest.webmanifest',
  './assets/icon.svg', './assets/icon-192.png', './assets/icon-512.png',
  './assets/icon-maskable-512.png',
  './src/style.css', './src/play-layout.css', './src/app.js', './src/pwa.js', './src/audio.js', './src/art.js', './src/engine.js',
  './src/games/trail.js', './src/games/trail-levels.js', './src/games/crates.js', './src/games/tanks.js',
  './src/games/blocks.js', './src/games/gomoku.js', './src/games/puzzle-grid.js',
  './src/games/mines.js', './src/games/circuit.js', './src/games/duel.js',
  './src/games/xiangqi.js', './src/games/junqi.js',
];

const HOME = new URL('./', SCOPE);
const INDEX = new URL('index.html', SCOPE);

self.addEventListener('install', event => {
  const requests = APP.map(path => new Request(new URL(path, SCOPE), { cache: 'reload' }));
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(requests)));
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const versions = await caches.keys();
    await Promise.all(versions
      .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || !url.href.startsWith(SCOPE)) return;

  const isEntry = url.pathname === HOME.pathname || url.pathname === INDEX.pathname;
  const key = request.mode === 'navigate' && isEntry ? INDEX : request;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(key);
    return cached ?? fetch(request);
  })());
});
