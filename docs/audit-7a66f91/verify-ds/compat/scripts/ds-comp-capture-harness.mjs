// COMP: سد فجوة اختبار: main-world/capture.js لا يحمّله أي اختبار وحدة. هذا الحزام يشغّل الحزمة المبنية الحقيقية
// (dist/main-world/capture.js، IIFE) في سياق vm بنافذة مصطنعة، ويتحقق من: تمرير طلب الصفحة كما هو، وشكل الرسالة
// مقابل validateCaptureMessage الحقيقية، وفروع XHR (''/json/arraybuffer/blob)، وتجاهل غير timedtext، والجسم الكبير.
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TJ_ROOT, TJ_SCRATCH } from '../../../verify/_root.mjs';
const { validateCaptureMessage } = await import(pathToFileURL(path.join(TJ_ROOT, 'src/extract/message.js')).href);

// dist/ مجلد بناء غير متتبَّع: إن غاب في TJ_ROOT بُني (غير معبأ، chromium) في مجلد TJ_SCRATCH دون مسّ الجذر.
let capture = path.join(TJ_ROOT, 'dist/main-world/capture.js');
if (!existsSync(capture)) {
  const out = path.join(TJ_SCRATCH, 'verify-ds-compat', 'dist');
  const r = spawnSync(process.execPath, [path.join(TJ_ROOT, 'scripts/build.mjs'), '--out', out], { cwd: TJ_ROOT, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`فشل البناء: ${r.stderr}`);
  capture = path.join(out, 'main-world/capture.js');
}
const code = readFileSync(capture, 'utf8');
const posted = [];
const fetchCalls = [];
class FakeXHR {
  constructor() { this.listeners = {}; this.responseType = ''; this.status = 0; }
  open(m, u) { this.url = u; }
  send() { const self = this; queueMicrotask(() => { self.status = 200; Object.assign(self, self._next ?? {}); for (const f of self.listeners.loadend ?? []) f(); }); }
  addEventListener(t, f) { (this.listeners[t] ??= []).push(f); }
}
const BIG = 'x'.repeat(20 * 1024 * 1024 + 1);
const win = {
  location: { origin: 'https://www.youtube.com', href: 'https://www.youtube.com/watch?v=AAAAAAAAAAA' },
  postMessage: (msg, origin) => posted.push({ msg, origin }),
  fetch(input) { fetchCalls.push(input); const body = String(input?.url ?? input).includes('big=1') ? BIG : '{"events":[]}'; return Promise.resolve(new Response(body, { status: 200 })); },
  XMLHttpRequest: FakeXHR,
};
const ctx = vm.createContext({ window: win, URL, Response, Request, TextDecoder, TextEncoder, WeakMap, queueMicrotask, JSON, String, Promise, Blob });
vm.runInContext(code, ctx);

const tt = 'https://www.youtube.com/api/timedtext?v=AAAAAAAAAAA&lang=en&fmt=json3&pot=SECRET&kind=asr';
const results = [];
const wait = () => new Promise((r) => setTimeout(r, 20));
// fetch: string / Request / URL / non-timedtext / big
const p1 = win.fetch(tt); results.push(['fetch returns original promise type', p1 instanceof Promise]);
await p1.then((r) => r.text()).then((t) => results.push(['page still reads body after clone', t === '{"events":[]}']));
win.fetch(new Request(tt)); win.fetch(new URL(tt)); win.fetch('https://www.youtube.com/youtubei/v1/player'); win.fetch(tt + '&big=1');
await wait();
// XHR branches
const mk = (type, response) => { const x = new win.XMLHttpRequest(); x.open('GET', tt); x.responseType = type; x._next = type === '' ? { responseText: '{"a":1}' } : { response }; x.send(); };
mk('', null); mk('json', { a: 1 }); mk('arraybuffer', new TextEncoder().encode('{"a":1}').buffer); mk('blob', new Blob(['{"a":1}'])); mk('document', {});
await wait(); await wait();

results.push(['fetch passthrough count (5 page calls → 5 underlying calls)', fetchCalls.length === 5]);
const msgs = posted.map((p) => p.msg);
results.push(['messages posted (4 fetch timedtext + 4 xhr; document type ignored, non-timedtext ignored)', msgs.length === 8, msgs.length]);
results.push(['postMessage targetOrigin is page origin', posted.every((p) => p.origin === 'https://www.youtube.com')]);
results.push(['every message passes validateCaptureMessage', msgs.every((m) => validateCaptureMessage(m) !== null)]);
results.push(['no pot value / URL leaked in message', msgs.every((m) => !JSON.stringify({ ...m, body: '' }).includes('SECRET') && !JSON.stringify({ ...m, body: '' }).includes('timedtext?'))]);
const big = msgs.find((m) => m.bodyLength > 20 * 1024 * 1024);
results.push(['oversized body → truncated:true, body:"" (and still valid)', !!big && big.truncated === true && big.body === '' && validateCaptureMessage(big) !== null]);
results.push(['xhr transports seen', JSON.stringify(msgs.filter((m) => m.transport === 'xhr').map((m) => m.body))]);
for (const r of results) console.log(r[1] === true ? 'PASS' : r[1] === false ? 'FAIL' : 'INFO', '-', r[0], r.length > 2 ? `(${r[2]})` : (typeof r[1] === 'string' ? r[1] : ''));
