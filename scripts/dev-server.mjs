#!/usr/bin/env node
/**
 * 零依赖静态开发服务器。
 *   npm run dev
 *   PORT=8080 npm run dev
 */

import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.PORT) || 4173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const normalized = normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const target = resolve(join(root, normalized));
  return target.startsWith(root) ? target : root;
}

const server = createServer((req, res) => {
  let pathname = req.url === '/' ? '/index.html' : req.url;
  let filePath = safePath(pathname);

  try {
    if (statSync(filePath).isDirectory()) {
      filePath = join(filePath, 'index.html');
    }
  } catch {
    // 找不到文件时回退到 index.html，方便 hash 路由直接打开。
    filePath = join(root, 'index.html');
  }

  const type = MIME[extname(filePath)] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'Service-Worker-Allowed': '/',
  });
  createReadStream(filePath)
    .on('error', () => {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    })
    .pipe(res);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`口袋游戏厅开发服务器：http://localhost:${port}`);
  console.log(`手机同 Wi-Fi 可访问：http://<本机 IP>:${port}`);
});
