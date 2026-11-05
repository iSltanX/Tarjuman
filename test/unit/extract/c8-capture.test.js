// تدقيق 7a66f91، U103 (T-01): src/main-world/capture.js لم يكن يحمّله أي اختبار (طبقة عالم الصفحة الحساسة). يُشغَّل هنا على الملف المصدر
// في node:vm بنافذة مصطنعة (على أصل حزام DeepSeek). الاستيراد الوحيد (readTimedtextParams) يُحقن من الوحدة الحقيقية بدل esbuild.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { readTimedtextParams } from '../../../src/extract/timedtext-params.js';
import { validateCaptureMessage } from '../../../src/extract/message.js';

const CAPTURE_URL = new URL('../../../src/main-world/capture.js', import.meta.url);
const SOURCE = readFileSync(CAPTURE_URL, 'utf8');
const IMPORT_LINE = /^import \{ readTimedtextParams \} from '[^']+';\s*$/m;
const ORIGIN = 'https://www.youtube.com';
const TT = `${ORIGIN}/api/timedtext?v=AAAAAAAAAAA&lang=en&fmt=json3&pot=SECRET&kind=asr`;
const MAX = 20 * 1024 * 1024;

class FakeXHR {
  constructor() { this.listeners = {}; this.responseType = ''; this.status = 0; this.opened = []; }
  open(method, url) { this.opened.push([method, url]); }
  send() {
    queueMicrotask(() => {
      this.status = 200;
      Object.assign(this, this._next ?? {});
      for (const f of this.listeners.loadend ?? []) f();
    });
  }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
}

/** يحمّل capture.js في سياق جديد؛ `fetchImpl` يستبدل fetch الأصلي للصفحة. */
function load({ fetchImpl } = {}) {
  assert.match(SOURCE, IMPORT_LINE, 'شكل الاستيراد الوحيد تغيّر؛ حدّث الحقن');
  const posted = [];
  const fetchCalls = [];
  const win = {
    location: { origin: ORIGIN, href: `${ORIGIN}/watch?v=AAAAAAAAAAA` },
    postMessage: (msg, origin) => posted.push({ msg, origin }),
    fetch(input) {
      fetchCalls.push(input);
      return fetchImpl ? fetchImpl(input) : Promise.resolve(new Response('{"events":[]}', { status: 200 }));
    },
    XMLHttpRequest: FakeXHR,
  };
  const origFetch = win.fetch;
  const origOpen = FakeXHR.prototype.open;
  const origSend = FakeXHR.prototype.send;
  const ctx = vm.createContext({ window: win, URL, Response, Request, TextDecoder, TextEncoder, WeakMap, queueMicrotask, JSON, String, Promise, Blob, readTimedtextParams });
  // اسم الملف الحقيقي ليُنسب إليه قياس التغطية؛ والسطر المحذوف يبقى فارغًا فلا تتغير أرقام الأسطر.
  vm.runInContext(SOURCE.replace(IMPORT_LINE, ''), ctx, { filename: CAPTURE_URL.href });
  const restore = () => { FakeXHR.prototype.open = origOpen; FakeXHR.prototype.send = origSend; };
  return { win, posted, fetchCalls, origFetch, restore };
}

const plain = (x) => JSON.parse(JSON.stringify(x)); // الرسائل من سياق vm بنموذج أصل آخر
const tick = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

function xhr(env, { url = TT, type = '', next, method = 'GET' } = {}) {
  const x = new env.win.XMLHttpRequest();
  x.open(method, url);
  x.responseType = type;
  x._next = next;
  x.send();
  return x;
}

test('fetch: طلب timedtext يُمرَّر كما هو، والصفحة تقرأ جسمها كاملًا رغم النسخ، وتصل رسالة صحيحة', async (t) => {
  const env = load();
  t.after(env.restore);
  const p = env.win.fetch(TT);
  assert.ok(p instanceof Promise);
  const res = await p;
  assert.equal(await res.text(), '{"events":[]}');
  await tick();
  assert.equal(env.fetchCalls.length, 1);
  assert.ok(env.fetchCalls[0] === TT, 'المعامل كما مرّ');
  assert.equal(env.posted.length, 1);
  const { msg, origin } = env.posted[0];
  assert.equal(origin, ORIGIN, 'targetOrigin أصل الصفحة لا *');
  assert.deepEqual(plain(msg), {
    source: 'tarjuman', v: 1, kind: 'timedtext', videoId: 'AAAAAAAAAAA', lang: 'en', trackKind: 'asr', kindParam: 'asr',
    capsAsr: false, hasTlang: false, format: 'json3', hasPot: true, transport: 'fetch', status: 200,
    bodyLength: 13, body: '{"events":[]}', truncated: false,
  });
  assert.notEqual(validateCaptureMessage(plain(msg)), null, 'تجتاز المصادقة الحقيقية');
  assert.ok(!JSON.stringify(msg).includes('SECRET'), 'قيمة pot لا تُسرَّب');
  assert.ok(!JSON.stringify(msg).includes('timedtext?'), 'ولا الرابط');
});

test('fetch: مدخل Request وURL (لا نص) يُعترضان أيضًا', async (t) => {
  const env = load();
  t.after(env.restore);
  await env.win.fetch(new Request(TT));
  await env.win.fetch(new URL(TT));
  await tick();
  assert.equal(env.fetchCalls.length, 2);
  assert.equal(env.posted.length, 2);
  assert.ok(env.posted.every((p) => p.msg.transport === 'fetch' && p.msg.videoId === 'AAAAAAAAAAA'));
});

test('fetch: الطلبات الأخرى (غير timedtext، ومضيف آخر، ومدخل غريب) تمر بلا رسالة', async (t) => {
  const env = load();
  t.after(env.restore);
  await env.win.fetch(`${ORIGIN}/youtubei/v1/player`);
  await env.win.fetch('https://example.com/api/timedtext?v=AAAAAAAAAAA');
  await env.win.fetch(`${ORIGIN}/api/timedtext-other?v=AAAAAAAAAAA`);
  await env.win.fetch(undefined);
  await env.win.fetch({ notUrl: true });
  await tick();
  assert.equal(env.fetchCalls.length, 5, 'كلها وصلت الأصل');
  assert.equal(env.posted.length, 0);
});

test('fetch: رفض الأصل يصل الصفحة كما هو ولا رسالة، وغلاف الدالة لا يبتلعه', async (t) => {
  const boom = new Error('network');
  const env = load({ fetchImpl: () => Promise.reject(boom) });
  t.after(env.restore);
  await assert.rejects(() => env.win.fetch(TT), (e) => e === boom);
  await tick();
  assert.equal(env.posted.length, 0);
});

test('fetch: رمي الأصل متزامنًا يخرج للصفحة كما هو (لا يلتقطه الغلاف)', (t) => {
  const env = load({ fetchImpl: () => { throw new TypeError('sync'); } });
  t.after(env.restore);
  assert.throws(() => env.win.fetch(TT), TypeError);
  assert.equal(env.posted.length, 0);
});

test('fetch: استجابة لا تقبل clone() أو جسمها يرفض: لا رسالة ولا خطأ للصفحة', async (t) => {
  const noClone = load({ fetchImpl: () => Promise.resolve({ status: 200, clone() { throw new Error('used'); }, text: async () => 'x' }) });
  t.after(noClone.restore);
  const res = await noClone.win.fetch(TT);
  assert.equal(await res.text(), 'x');
  const badBody = load({ fetchImpl: () => Promise.resolve({ status: 200, clone: () => ({ text: () => Promise.reject(new Error('aborted')) }) }) });
  t.after(badBody.restore);
  await badBody.win.fetch(TT);
  await tick();
  assert.equal(noClone.posted.length + badBody.posted.length, 0);
});

test('fetch: جسم أكبر من 20 مليون حرف يُرسل truncated بلا جسم وبرسالة صحيحة', async (t) => {
  const big = 'x'.repeat(MAX + 1);
  const env = load({ fetchImpl: () => Promise.resolve(new Response(big, { status: 200 })) });
  t.after(env.restore);
  await env.win.fetch(TT);
  await tick(10);
  assert.equal(env.posted.length, 1);
  const m = plain(env.posted[0].msg);
  assert.equal(m.truncated, true);
  assert.equal(m.body, '');
  assert.equal(m.bodyLength, MAX + 1);
  assert.notEqual(validateCaptureMessage(m), null);
});

test('XHR: فروع responseType (نص، json، arraybuffer، blob) تنتج رسالة xhr، و"document" يُتجاهل', async (t) => {
  const env = load();
  t.after(env.restore);
  xhr(env, { type: '', next: { responseText: '{"a":1}' } });
  xhr(env, { type: 'text', next: { responseText: '{"t":1}' } });
  xhr(env, { type: 'json', next: { response: { a: 1 } } });
  xhr(env, { type: 'json', next: { response: null } });
  xhr(env, { type: 'arraybuffer', next: { response: new TextEncoder().encode('{"b":2}').buffer } });
  xhr(env, { type: 'blob', next: { response: new Blob(['{"c":3}']) } });
  xhr(env, { type: 'document', next: { response: {} } });
  await tick(10);
  const msgs = env.posted.map((p) => plain(p.msg));
  assert.ok(msgs.every((m) => m.transport === 'xhr' && m.status === 200 && m.videoId === 'AAAAAAAAAAA'));
  assert.deepEqual(msgs.map((m) => m.body).sort(), ['', '{"a":1}', '{"a":1}', '{"b":2}', '{"c":3}', '{"t":1}'].sort());
  assert.ok(env.posted.every((p) => p.origin === ORIGIN));
  assert.ok(msgs.every((m) => validateCaptureMessage(m) !== null));
});

test('XHR: open وsend يمرّران وسائطهما للأصل كما هي، وغير timedtext (وURL) لا رسالة له', async (t) => {
  const env = load();
  t.after(env.restore);
  const other = xhr(env, { url: `${ORIGIN}/youtubei/v1/next`, next: { responseText: 'zzz' } });
  assert.deepEqual(other.opened, [['GET', `${ORIGIN}/youtubei/v1/next`]]);
  const viaUrl = xhr(env, { url: new URL(TT), next: { responseText: '{"u":1}' } });
  assert.equal(viaUrl.opened.length, 1, 'open وصل الأصل');
  await tick();
  assert.equal(env.posted.length, 1, 'رسالة URL وحدها');
  assert.equal(plain(env.posted[0].msg).body, '{"u":1}');
});

test('XHR: إعادة استعمال الكائن لطلب آخر بعد timedtext تمسح الوسم فلا رسالة للثاني', async (t) => {
  const env = load();
  t.after(env.restore);
  const x = new env.win.XMLHttpRequest();
  x.open('GET', TT);
  x.open('GET', `${ORIGIN}/other`);
  x._next = { responseText: 'no' };
  x.send();
  await tick();
  assert.equal(env.posted.length, 0);
});

test('XHR: خطأ في قراءة الاستجابة لا يصل الصفحة ولا ترسل رسالة', async (t) => {
  const env = load();
  t.after(env.restore);
  const x = new env.win.XMLHttpRequest();
  x.open('GET', TT);
  Object.defineProperty(x, 'responseType', { get() { throw new Error('access'); }, set() {} });
  x.send();
  await tick();
  assert.equal(env.posted.length, 0);
});
