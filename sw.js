/**
 * 口袋游戏厅 Service Worker
 *
 * - 安装时预缓存应用外壳
 * - 导航请求网络优先，失败回退缓存
 * - 静态资源 cache-first，并在后台更新
 */

const VERSION = 'v1.0.1';
const CACHE = `pocket-games-${VERSION}`;
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './src/main.js',
  './src/core/storage.js',
  './src/core/sound.js',
  './src/core/haptics.js',
  './src/core/ui.js',
  './src/games/sokoban/logic.js',
  './src/games/sokoban/levels.js',
  './src/games/sokoban/game.js',
  './src/games/tetris/engine.js',
  './src/games/tetris/game.js',
  './src/styles/base.css',
  './src/styles/sokoban.css',
  './src/styles/tetris.css',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/maskable-512.png',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    const fallback = await cache.match('./index.html');
    if (fallback) return fallback;
    throw new Error('offline');
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) {
    // 后台悄悄更新，下一次打开就是新版本。
    fetch(request)
      .then((response) => {
        if (response && response.ok) cache.put(request, response.clone());
      })
      .catch(() => {});
    return cached;
  }
  const response = await fetch(request);
  if (response && response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
  } else {
    event.respondWith(cacheFirst(request));
  }
});
