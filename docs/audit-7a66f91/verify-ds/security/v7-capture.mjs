// تحقق مستقل (DS-I2 = SEC-07): ما تراه صفحة يوتيوب من غلافي الالتقاط في حزمة الإنتاج التي بنيتُها (g/dist-chromium)، داخل
// نافذة وهمية بـnode:vm. fetch وXHR وهميان يحاكيان الأصليين (fetch.length في المتصفحات 1). بلا شبكة.
// تشغيل: command node v7-capture.mjs (بعد v4-guards.mjs)
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { TJ_SCRATCH } from '../../verify/_root.mjs';
const HERE = path.join(TJ_SCRATCH, 'verify-ds-security');
const code = readFileSync(path.join(HERE, 'g', 'dist-chromium', 'main-world', 'capture.js'), 'utf8');
const posted = [];
const calls = [];
// fetch «أصلي» بطول 1 واسم fetch كما في المتصفحات
const nativeFetch = { fetch(input) { calls.push({ input, init: arguments[1] }); return Promise.resolve(new Response('{"events":[]}', { status: 200 })); } }.fetch;
class FakeXHR { constructor() { this.l = {}; this.responseType = ''; this.responseText = ''; this.status = 200; } addEventListener(t, f) { (this.l[t] ||= []).push(f); } open(method, url) { this.u = url; } send() {} }
const win = { location: { origin: 'https://www.youtube.com', href: 'https://www.youtube.com/watch?v=Y-rmzh0PI3c' }, fetch: nativeFetch, XMLHttpRequest: FakeXHR, postMessage: (data, origin) => posted.push({ data, origin }), URL, TextDecoder, Response };
win.window = win;
vm.createContext(win);
vm.runInContext(code, win);

const tt = 'https://www.youtube.com/api/timedtext?v=Y-rmzh0PI3c&lang=en&fmt=json3&pot=SYNTHETICPOT0123456789&signature=SYNTHSIG';
const init = { credentials: 'include' };
await win.fetch(tt, init);
await new Promise((r) => setTimeout(r, 30));
console.log(JSON.stringify({ passthroughCalls: calls.length, sameInit: calls[0]?.init === init, postedFields: posted[0] ? Object.keys(posted[0].data) : null, targetOrigin: posted[0]?.origin, leaksUrlOrPot: JSON.stringify(posted).includes('pot=') || JSON.stringify(posted).includes('/api/timedtext') }));
console.log(JSON.stringify({
  fetch: { nativeName: nativeFetch.name, nativeLength: nativeFetch.length, wrappedName: win.fetch.name, wrappedLength: win.fetch.length, toStringNative: win.fetch.toString().includes('[native code]') },
  xhrOpen: { wrappedName: win.XMLHttpRequest.prototype.open.name, wrappedLength: win.XMLHttpRequest.prototype.open.length },
}));
console.log('--- أسطر الغلاف في الحزمة المبنية ---');
for (const l of code.split('\n').filter((x) => /window\.fetch\s*=|\.open\s*=\s*function|\.send\s*=\s*function/.test(x))) console.log('  ', l.trim().slice(0, 100));
