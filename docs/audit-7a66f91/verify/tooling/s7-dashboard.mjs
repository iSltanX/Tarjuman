// يفحص معالج HTTP الحقيقي لـtools/plan/lib/serve.mjs في الذاكرة: يُستبدل http.createServer مؤقتًا فلا يُفتح منفذ.
// طلبات بمضيف أجنبي وترويسات Fetch Metadata عابرة للموقع. الاستعمال: command node s7-dashboard.mjs <جذر النسخة>
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TJ_ROOT } from '../_root.mjs';
const root = process.argv[2] ?? TJ_ROOT;
let handler = null;
const orig = http.createServer;
http.createServer = (cb) => { handler = cb; return { on() {}, listen() {} }; };
try {
  const { serve } = await import(pathToFileURL(path.join(root, 'tools/plan/lib/serve.mjs')));
  serve(root);
} finally { http.createServer = orig; }
const call = (url, headers) => new Promise((resolve) => {
  const res = { writeHead(code, h) { this.code = code; this.h = h; }, end(body) { resolve({ code: this.code, h: this.h, body: body == null ? '' : String(body) }); } };
  handler({ method: 'GET', url, headers }, res);
});
const xsite = { host: 'rebind.attacker.test:4317', 'sec-fetch-site': 'cross-site', 'sec-fetch-dest': 'script', origin: 'https://attacker.test' };
for (const url of ['/dashboard/data/state.js', '/api/state.json', '/CLAUDE.md', '/docs/store-release.md', '/plan/plan.json', '/.git/config', '/src/manifest.json']) {
  const r = await call(url, xsite);
  const h = r.h || {};
  console.log(`${url} → ${r.code} ${h['content-type'] ?? ''} | CORP:${h['cross-origin-resource-policy'] ?? '—'} ACAO:${h['access-control-allow-origin'] ?? '—'} | ${r.body.length} بايت`);
}
const js = (await call('/dashboard/data/state.js', xsite)).body;
const st = JSON.parse(js.slice('window.TJ_STATE = '.length, -2));
console.log('source keys:', Object.keys(st.source ?? {}).join(','), '| root:', st.source?.root, '| isGit:', st.source?.isGit);
