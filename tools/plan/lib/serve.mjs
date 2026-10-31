// خادم محلي خفيف للوحة: يقدّم ملفات dashboard/ والوثائق للقراءة فقط، ويشتق الحالة من Git عند كل طلب
// (مع ذاكرة قصيرة). يستمع على 127.0.0.1 وحده، ولا ينفّذ أوامر ولا يكتب شيئًا.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { deriveState } from './state.mjs';
import { nowIso } from './util.mjs';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
};
const ALLOWED_TOP = new Set(['dashboard', 'docs', 'plan']);

function allowed(rel) {
  const segs = rel.split('/');
  if (segs.some((s) => !s || s.startsWith('.') || s === '..')) return false;
  if (segs.length === 1) return rel.endsWith('.md');
  return ALLOWED_TOP.has(segs[0]);
}

export function serve(root, { port = 4317, host = '127.0.0.1', cacheMs = 1500 } = {}) {
  let cache = { at: 0, state: null };
  const current = () => {
    if (Date.now() - cache.at > cacheMs || !cache.state) {
      let state;
      try {
        state = deriveState(root, { mode: 'live' });
      } catch (e) {
        state = { schema: 1, mode: 'live', fatal: String(e.message || e), generatedAt: nowIso(), generatedAtMs: Date.now() };
      }
      cache = { at: Date.now(), state };
    }
    return cache.state;
  };

  const server = http.createServer((req, res) => {
    const send = (code, type, body, extra = {}) => {
      res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra });
      res.end(body);
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'text/plain; charset=utf-8', 'للقراءة فقط');
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, `http://${host}`).pathname);
    } catch {
      return send(400, 'text/plain; charset=utf-8', 'عنوان غير صالح');
    }
    if (pathname === '/' || pathname === '/dashboard') return send(302, 'text/plain; charset=utf-8', '', { location: '/dashboard/' });
    if (pathname === '/dashboard/data/state.js') {
      return send(200, TYPES['.js'], `window.TJ_STATE = ${JSON.stringify(current())};\n`);
    }
    if (pathname === '/api/state.json') return send(200, TYPES['.json'], JSON.stringify(current()));
    let rel = pathname.replace(/^\/+/, '');
    if (rel.endsWith('/') || rel === '') rel += 'index.html';
    if (!allowed(rel)) return send(404, 'text/plain; charset=utf-8', 'غير موجود');
    const abs = path.resolve(root, rel);
    if (!abs.startsWith(path.resolve(root) + path.sep)) return send(404, 'text/plain; charset=utf-8', 'غير موجود');
    fs.readFile(abs, (err, data) => {
      if (err) return send(404, 'text/plain; charset=utf-8', 'غير موجود');
      send(200, TYPES[path.extname(abs).toLowerCase()] || 'application/octet-stream', data);
    });
  });

  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`المنفذ ${port} مشغول. إن كانت اللوحة تعمل فافتح http://${host}:${port}/ ، أو شغّل بمنفذ آخر: npm run dashboard -- --port 4318`);
    } else {
      console.error(`تعذّر تشغيل الخادم: ${e.message}`);
    }
    process.exit(1);
  });
  server.listen(port, host, () => {
    console.log(`لوحة خطة ترجمان تعمل: http://${host}:${port}/`);
    console.log('تتحدّث الحالة تلقائيًا من Git (main والفروع وworktrees وفرع التكامل) عند كل قراءة. أوقفها بـCtrl+C.');
  });
  return server;
}
