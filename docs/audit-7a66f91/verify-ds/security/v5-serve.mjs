// تحقق مستقل (T-09): معالج خادم اللوحة الحقيقي في الذاكرة بلا مقبس (listen مستبدلة مؤقتًا)، على جذر اصطناعي في مجلد العمل
// فيه رابط رمزي داخل docs/ يشير خارجه. ثم بحث عن روابط رمزية في المجلدات التي تقدّمها اللوحة في شجرة الالتزام.
// تشغيل: command node v5-serve.mjs
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

import { TJ_ROOT as TJ, TJ_SCRATCH } from '../../verify/_root.mjs';
const { serve } = await import(`${TJ}/tools/plan/lib/serve.mjs`);
const HERE = path.join(TJ_SCRATCH, 'verify-ds-security');
fs.mkdirSync(HERE, { recursive: true });
const root = path.join(HERE, 'serve-root');
const outside = path.join(HERE, 'serve-outside.txt');
fs.rmSync(root, { recursive: true, force: true });
for (const d of ['docs', 'dashboard', 'plan']) fs.mkdirSync(path.join(root, d), { recursive: true });
fs.writeFileSync(path.join(root, 'docs', 'a.md'), 'doc');
fs.writeFileSync(outside, 'OUTSIDE-ROOT-CONTENT');
fs.symlinkSync(outside, path.join(root, 'docs', 'link.md'));
fs.symlinkSync(path.dirname(outside), path.join(root, 'plan', 'up'));

const orig = http.Server.prototype.listen;
http.Server.prototype.listen = function fake() { return this; };
const server = serve(root, { port: 0 });
http.Server.prototype.listen = orig;

const request = (url, host = '127.0.0.1:4317') => new Promise((resolve) => {
  const res = { status: 0, headers: {}, writeHead(c, h) { this.status = c; this.headers = h; }, end(b) { resolve({ url, host, status: this.status, corp: this.headers['cross-origin-resource-policy'] ?? null, body: String(b ?? '').slice(0, 40) }); } };
  server.emit('request', { url, method: 'GET', headers: { host } }, res);
});
for (const [u, h] of [['/docs/a.md'], ['/docs/link.md'], ['/plan/up/serve-outside.txt'], ['/docs/../serve-outside.txt'], ['/api/state.json', 'rebind.attacker.test:4317'], ['/dashboard/data/state.js', 'rebind.attacker.test']]) {
  console.log(JSON.stringify(await request(u, h)));
}
fs.rmSync(root, { recursive: true, force: true });
fs.rmSync(outside, { force: true });

console.log('\n--- روابط رمزية في dashboard/ وdocs/ وplan/ وملفات .md في الجذر (شجرة الالتزام) ---');
const links = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isSymbolicLink()) links.push(path.relative(TJ, p)); else if (e.isDirectory()) walk(p); } };
for (const d of ['dashboard', 'docs', 'plan']) if (fs.existsSync(path.join(TJ, d))) walk(path.join(TJ, d));
for (const e of fs.readdirSync(TJ, { withFileTypes: true })) if (e.isSymbolicLink() && e.name.endsWith('.md')) links.push(e.name);
console.log(JSON.stringify({ symlinks: links }));
