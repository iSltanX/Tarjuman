// إرسال البلاغ بخادم وهمي محلي يطبّق عقد app-reports v1 (جولة النشر T2.1): الحمولة كما يتحقق منها الخادم، وكل صف في جدول
// الردود، وطلب واحد بلا إعادة تلقائية، ومفتاح Idempotency-Key يعيد الرقم نفسه، وبلا ملفات ارتباط، وبلا إذن لا طلب.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  REPORTS_ENDPOINT, REPORTS_HOST_PATTERN, REPORTS_ORIGIN, classify, hostGranted, isIdempotencyKey, parseRetryAfter, reportPermissions,
  requestReportPermission, retryable, sendReport,
} from '../../../src/core/report/client.js';
import { failureText } from '../../../src/core/report/messages.js';
import { buildPayload } from '../../../src/core/report/payload.js';

const DIAG = { appVersion: '1.0.0', os: 'macos', osVersion: '15.6.1', arch: 'arm64', browser: 'Firefox', browserVersion: '159.0.1', buildTarget: 'firefox', test: true };
const PAYLOAD = buildPayload({ kind: 'bug', description: 'الترجمة تتأخر ثانيتين' }, DIAG);
const KEY = '3f2c8a1e-9b7d-4c5e-8f10-2a3b4c5d6e7f';

/** خادم بقواعد العقد: الحقول العليا المعروفة وحدها، والمنتج المسجَّل، والسقوف، والمفتاح يعيد الرقم نفسه بـ200. */
function contractServer() {
  const FIELDS = new Set(['product', 'app_version', 'os', 'os_version', 'arch', 'locale', 'kind', 'category', 'description', 'diagnostics', 'attachments', 'test']);
  const keys = new Map();
  const state = { next: null, requests: [], issues: 0, hang: false };
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      state.requests.push({ method: req.method, url: req.url, headers: req.headers, raw });
      if (state.hang) return; // لا رد: مهلة
      const send = (status, body, headers = {}) => {
        res.writeHead(status, { 'content-type': 'application/json', ...headers });
        res.end(body === undefined ? '' : JSON.stringify(body));
      };
      if (state.next) {
        const { status, body, headers } = state.next;
        state.next = null;
        return send(status, body, headers);
      }
      if (req.method !== 'POST' || req.url !== '/v1/reports') return send(404, { error: 'not_found' });
      if (!/^application\/json/.test(req.headers['content-type'] ?? '')) return send(415, { error: 'unsupported_media_type' });
      let p;
      try {
        p = JSON.parse(raw);
      } catch {
        return send(400, { error: 'invalid_json' });
      }
      const unknown = Object.keys(p).find((k) => !FIELDS.has(k));
      if (unknown) return send(400, { error: 'invalid_field', field: unknown });
      if (p.product !== 'tarjuman') return send(400, { error: 'unknown_product' });
      for (const [f, max] of [['app_version', 32], ['os', 16], ['os_version', 32], ['arch', 16]]) {
        if (typeof p[f] !== 'string' || !p[f] || p[f].length > max) return send(400, { error: 'invalid_field', field: f });
      }
      if (!['bug', 'crash', 'suggestion', 'other'].includes(p.kind)) return send(400, { error: 'invalid_field', field: 'kind' });
      const d = typeof p.description === 'string' ? p.description.trim() : '';
      if (!d || d.length > 2000) return send(400, { error: 'invalid_field', field: 'description' });
      if (p.diagnostics !== undefined && (typeof p.diagnostics !== 'object' || JSON.stringify(p.diagnostics).length > 16 * 1024)) return send(400, { error: 'invalid_field', field: 'diagnostics' });
      if (p.test !== undefined && p.test !== true) return send(400, { error: 'invalid_field', field: 'test' });
      const key = req.headers['idempotency-key'];
      if (key && keys.has(key)) return send(200, { id: keys.get(key) });
      const id = ++state.issues + 40;
      if (key) keys.set(key, id);
      return send(201, { id });
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    const inits = [];
    /** يوجّه الطلب إلى الخادم المحلي بالمسار نفسه، ويسجّل خياراته كما مرّرتها الوحدة. */
    const request = (url, init) => {
      inits.push({ url, init });
      return fetch(`${base}${new URL(url).pathname}`, { method: init.method, headers: init.headers, body: init.body, signal: init.signal, redirect: init.redirect });
    };
    resolve({ state, request, inits, close: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }) });
  }));
}

const granted = async () => true;

test('الثوابت: خادم البلاغات وحده بمساره ونمط إذنه، والمفتاح UUID عشوائي', () => {
  assert.equal(REPORTS_ORIGIN, 'https://app-reports.isultantf.workers.dev');
  assert.equal(REPORTS_ENDPOINT, 'https://app-reports.isultantf.workers.dev/v1/reports');
  assert.equal(REPORTS_HOST_PATTERN, 'https://app-reports.isultantf.workers.dev/*');
  assert.equal(isIdempotencyKey(KEY), true);
  assert.equal(isIdempotencyKey('user-123'), false);
});

test('201: الحمولة يقبلها الخادم كما هي، وطلب واحد POST بترويستين وبلا ملفات ارتباط ولا إحالة', async () => {
  const s = await contractServer();
  try {
    const r = await sendReport(PAYLOAD, KEY, { granted, request: s.request });
    assert.deepEqual(r, { ok: true, id: 41, replayed: false });
    assert.equal(s.state.requests.length, 1);
    const [{ url, init }] = s.inits;
    assert.equal(url, REPORTS_ENDPOINT);
    assert.equal(init.method, 'POST');
    assert.deepEqual(init.headers, { 'Content-Type': 'application/json', 'Idempotency-Key': KEY });
    assert.equal(init.credentials, 'omit');
    assert.equal(init.cache, 'no-store');
    assert.equal(init.redirect, 'error');
    assert.equal(init.referrerPolicy, 'no-referrer');
    assert.deepEqual(JSON.parse(s.state.requests[0].raw), PAYLOAD);
    assert.equal(JSON.parse(s.state.requests[0].raw).test, true, 'بلاغ تجريبي من بناء التطوير');
  } finally {
    await s.close();
  }
});

test('200 لمفتاح مكرر: الرقم نفسه ولا بلاغ مكرر', async () => {
  const s = await contractServer();
  try {
    const a = await sendReport(PAYLOAD, KEY, { granted, request: s.request });
    const b = await sendReport(PAYLOAD, KEY, { granted, request: s.request });
    assert.deepEqual([a.id, b.id, b.replayed], [41, 41, true]);
    assert.equal(s.state.issues, 1);
  } finally {
    await s.close();
  }
});

test('400 بأشكاله (حقل مجهول، ومنتج غير مسجَّل، وJSON معطوب): invalid بلا إعادة', async () => {
  const s = await contractServer();
  try {
    for (const bad of [{ ...PAYLOAD, extra: 1 }, { ...PAYLOAD, product: 'other-app' }, { ...PAYLOAD, description: '   ' }]) {
      const r = await sendReport(bad, KEY.replace('3f', 'aa'), { granted, request: s.request });
      assert.deepEqual(r, { ok: false, failure: 'invalid', status: 400 });
    }
    s.state.next = { status: 400, body: { error: 'invalid_json' } };
    assert.equal((await sendReport(PAYLOAD, KEY, { granted, request: s.request })).failure, 'invalid');
    assert.equal(retryable('invalid'), false);
  } finally {
    await s.close();
  }
});

test('413 و415: too-large وunsupported بلا إعادة', async () => {
  const s = await contractServer();
  try {
    s.state.next = { status: 413, body: { error: 'too_large' } };
    assert.deepEqual(await sendReport(PAYLOAD, KEY, { granted, request: s.request }), { ok: false, failure: 'too-large', status: 413 });
    s.state.next = { status: 415, body: { error: 'unsupported_media_type' } };
    assert.deepEqual(await sendReport(PAYLOAD, KEY, { granted, request: s.request }), { ok: false, failure: 'unsupported', status: 415 });
    assert.equal(retryable('too-large') || retryable('unsupported'), false);
  } finally {
    await s.close();
  }
});

test('429 مع Retry-After: إعادة لاحقة ونص بالدقائق', async () => {
  const s = await contractServer();
  try {
    s.state.next = { status: 429, body: { error: 'rate_limited' }, headers: { 'retry-after': '600' } };
    const r = await sendReport(PAYLOAD, KEY, { granted, request: s.request });
    assert.deepEqual(r, { ok: false, failure: 'rate-limited', status: 429, retryAfterSeconds: 600 });
    assert.equal(retryable('rate-limited'), true);
    assert.match(failureText('rate-limited', 600), /أعد المحاولة بعد 10 دقائق\.$/);
    assert.match(failureText('rate-limited', 60), /بعد دقيقة\.$/);
    assert.equal(parseRetryAfter('Wed, 04 Nov 2026 10:02:00 GMT', Date.parse('Wed, 04 Nov 2026 10:00:00 GMT')), 120);
    assert.equal(parseRetryAfter(null), undefined);
  } finally {
    await s.close();
  }
});

test('5xx: server مع إعادة، ورد نجاح بلا رقم: unexpected', async () => {
  const s = await contractServer();
  try {
    for (const status of [500, 502, 503]) {
      s.state.next = { status, body: {} };
      assert.deepEqual(await sendReport(PAYLOAD, KEY, { granted, request: s.request }), { ok: false, failure: 'server', status });
    }
    s.state.next = { status: 201, body: { id: 'x' } };
    assert.equal((await sendReport(PAYLOAD, KEY, { granted, request: s.request })).failure, 'unexpected');
    assert.equal(retryable('server') && retryable('unexpected'), true);
  } finally {
    await s.close();
  }
});

test('المهلة وانقطاع الشبكة: timeout وnetwork مع إعادة، وطلب واحد بلا إعادة تلقائية', async () => {
  const s = await contractServer();
  try {
    s.state.hang = true;
    const r = await sendReport(PAYLOAD, KEY, { granted, request: s.request, timeoutMs: 80 });
    assert.deepEqual(r, { ok: false, failure: 'timeout', status: null });
    assert.equal(s.state.requests.length, 1, 'محاولة واحدة');
  } finally {
    await s.close();
  }
  let calls = 0;
  const offline = async () => { calls += 1; throw new TypeError('fetch failed'); };
  assert.deepEqual(await sendReport(PAYLOAD, KEY, { granted, request: offline }), { ok: false, failure: 'network', status: null });
  assert.equal(calls, 1);
  assert.equal(retryable('timeout') && retryable('network'), true);
});

test('بلا إذن المضيف أو بمفتاح غير صالح: لا طلب أصلًا', async () => {
  let calls = 0;
  const request = async () => { calls += 1; return new Response('{}', { status: 201 }); };
  assert.deepEqual(await sendReport(PAYLOAD, KEY, { granted: async () => false, request }), { ok: false, failure: 'permission', status: null });
  assert.deepEqual(await sendReport(PAYLOAD, KEY, { granted: async () => { throw new Error('x'); }, request }), { ok: false, failure: 'permission', status: null });
  assert.equal((await sendReport(PAYLOAD, 'not-a-uuid', { granted, request })).ok, false);
  assert.equal(calls, 0);
});

test('الإذن: مضيف الخادم وحده، ومعه في Firefox فئة technicalAndInteraction، ويُطلب متزامنًا داخل الضغطة', async () => {
  assert.deepEqual(reportPermissions('chromium'), { origins: ['https://app-reports.isultantf.workers.dev/*'] });
  assert.deepEqual(reportPermissions('firefox'), { origins: ['https://app-reports.isultantf.workers.dev/*'], data_collection: ['technicalAndInteraction'] });
  const calls = [];
  const api = { permissions: { request: (p) => { calls.push(p); return Promise.resolve(true); }, contains: async (p) => p.origins[0] === REPORTS_HOST_PATTERN } };
  const pending = requestReportPermission(api, 'firefox');
  assert.equal(calls.length, 1, 'الطلب حدث قبل أي انتظار');
  assert.equal(await pending, true);
  assert.equal(await hostGranted(api), true);
  assert.equal(await requestReportPermission({ permissions: { request: () => { throw new Error('not in gesture'); } } }, 'chromium'), false);
  assert.equal(await requestReportPermission({ permissions: { request: async () => false } }, 'chromium'), false);
  assert.equal(await hostGranted({ permissions: { contains: async () => { throw new Error('x'); } } }), false);
});

test('classify يقرأ الرد بجدول العقد', async () => {
  const res = (status, body, headers) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers });
  assert.deepEqual(await classify(res(201, { id: 7 })), { ok: true, id: 7, replayed: false });
  assert.deepEqual(await classify(res(418, {})), { ok: false, failure: 'unexpected', status: 418 });
  assert.deepEqual(await classify(res(429, { error: 'rate_limited' })), { ok: false, failure: 'rate-limited', status: 429 });
});
