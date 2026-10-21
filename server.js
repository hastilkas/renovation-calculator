// Локальный сервер для разработки: раздаёт public/ и тот же обработчик /api/lead,
// что работает на Vercel. Зависимостей нет, нужен только Node 20+.
//   npm run dev   →   http://localhost:3000
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import leadHandler from './api/lead.js';

const ROOT = resolve(fileURLToPath(new URL('./public', import.meta.url)));
const PORT = Number(process.env.PORT) || 3000;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

async function serveStatic(req, res) {
  const { pathname } = new URL(req.url, 'http://localhost');
  let file = normalize(join(ROOT, decodeURIComponent(pathname)));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end();
    return;
  }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
}

createServer((req, res) => {
  if (req.url.startsWith('/api/lead')) return leadHandler(req, res);
  return serveStatic(req, res);
}).listen(PORT, () => {
  const mode = process.env.TELEGRAM_BOT_TOKEN ? 'заявки уходят в Telegram' : 'демо-режим, заявки печатаются в консоль';
  console.log(`http://localhost:${PORT}  (${mode})`);
});
