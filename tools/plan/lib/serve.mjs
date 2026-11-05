// خادم محلي خفيف للوحة: يقدّم ملفات dashboard/ والوثائق للقراءة فقط، ويشتق الحالة من Git عند كل طلب
// (مع ذاكرة قصيرة). يستمع على 127.0.0.1 وحده، ولا ينفّذ أوامر ولا يكتب شيئًا.
// ولا يجيب إلا اللوحة نفسها (تدقيق 7a66f91، U66، CDX-S7 وDS-T-09؛ كان يقدّم الحالة ومساراتها والوثائق لأي مضيف ولأي أصل):
// ترويسة Host بمضيف الخادم ومنفذه وحدهما (فإعادة ربط DNS بمضيف أجنبي تُرفض)، وطلب من موقع آخر أو موقع شقيق (Sec-Fetch-Site)
// مرفوض، وCross-Origin-Resource-Policy: same-origin على كل رد (فلا يُضمَّن state.js سكربتًا في صفحة أخرى)، ولا يُتبع رابط رمزي
// إلى خارج الجذر (المسار الحقيقي يُفحص).
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
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

/** المضيفات المقبولة في ترويسة Host: مضيف الاستماع ومنفذه، وlocalhost و127.0.0.1 بالمنفذ نفسه. */
function allowedHosts(host, port) {
  const literal = host.includes(':') ? `[${host}]` : host;
  return new Set([`${literal}:${port}`, `localhost:${port}`, `127.0.0.1:${port}`].map((h) => h.toLowerCase()));
}
/** Fetch Metadata: الطلب من مستند اللوحة نفسه (same-origin)، أو من شريط العنوان (none)، أو من أداة بلا الترويسة. */
const FETCH_SITES_OK = new Set(['same-origin', 'none']);

/**
 * معالج الطلبات (قابل للاختبار دون منفذ).
 * @param {string} root
 * @param {{ port?: number, host?: string, cacheMs?: number, derive?: typeof deriveState }} [o]
 */
export function createHandler(root, { port = 4317, host = '127.0.0.1', cacheMs = 1500, derive = deriveState } = {}) {
  let cache = { at: 0, state: null };
  const hosts = allowedHosts(host, port);
  const realRoot = fs.realpathSync(path.resolve(root));
  const current = () => {
    if (Date.now() - cache.at > cacheMs || !cache.state) {
      let state;
      try {
        state = derive(root, { mode: 'live' });
      } catch (e) {
        state = { schema: 1, mode: 'live', fatal: String(e.message || e), generatedAt: nowIso(), generatedAtMs: Date.now() };
      }
      cache = { at: Date.now(), state };
    }
    return cache.state;
  };

  return (req, res) => {
    const send = (code, type, body, extra = {}) => {
      res.writeHead(code, {
        'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'cross-origin-resource-policy': 'same-origin', ...extra,
      });
      res.end(body);
    };
    if (!hosts.has(String(req.headers?.host ?? '').toLowerCase())) return send(421, 'text/plain; charset=utf-8', 'مضيف غير معروف');
    // والانتقال إلى صفحة (رابط من موقع آخر إلى اللوحة) مقبول: لا يقرأ الموقع الآخر ما ينتقل إليه.
    const site = req.headers?.['sec-fetch-site'];
    const navigation = req.method === 'GET' && req.headers?.['sec-fetch-mode'] === 'navigate' && !['object', 'embed'].includes(req.headers?.['sec-fetch-dest']);
    if (site !== undefined && !FETCH_SITES_OK.has(String(site).toLowerCase()) && !navigation) return send(403, 'text/plain; charset=utf-8', 'طلب من موقع آخر');
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
    // المسار الحقيقي بعد الروابط الرمزية داخل الجذر الحقيقي، وإلا فلا وجود له.
    return fsp.realpath(abs).then(async (real) => {
      // والمسار الحقيقي نفسه مسموح (رابط داخل الجذر إلى .git أو ملف خفي لا يُقدَّم).
      if (!real.startsWith(realRoot + path.sep) || !allowed(path.relative(realRoot, real).split(path.sep).join('/'))) return send(404, 'text/plain; charset=utf-8', 'غير موجود');
      const data = await fsp.readFile(real);
      return send(200, TYPES[path.extname(abs).toLowerCase()] || 'application/octet-stream', data);
    }).catch(() => send(404, 'text/plain; charset=utf-8', 'غير موجود'));
  };
}

export function serve(root, { port = 4317, host = '127.0.0.1', cacheMs = 1500 } = {}) {
  const server = http.createServer(createHandler(root, { port, host, cacheMs }));

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
