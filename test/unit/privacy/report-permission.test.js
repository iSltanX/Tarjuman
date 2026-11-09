// N-04: الربط الحقيقي لإذن البلاغ: reportPanel دون حقن requestPermission وsend، بواجهة chrome وfetch وهميتين. فالطلب الفعلي للإذن،
// وفحصه قبل الإرسال، يمران من الشيفرة التي تعمل عند المستخدم لا من بديل يحقنه الاختبار.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { reportPanel } from '../../../src/pages/settings/report.js';
import { buttonNamed, newDocument, settle } from '../pages/library/fake-dom.js';

const DIAG = { appVersion: '1.0.0', os: 'macos', osVersion: '15.6.1', arch: 'arm64', browser: 'Google Chrome', browserVersion: '156.0.7650.10', buildTarget: 'chromium', test: false };
const realChrome = globalThis.chrome;
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.chrome = realChrome;
  globalThis.fetch = realFetch;
});

function setup({ request, contains }) {
  const log = { requested: [], contains: 0, fetched: [] };
  globalThis.chrome = {
    permissions: {
      request: async (p) => { log.requested.push(p); return request; },
      contains: async () => { log.contains += 1; return contains; },
    },
  };
  globalThis.fetch = async (url, init) => {
    log.fetched.push({ url, init });
    return new Response(JSON.stringify({ id: 7, replayed: false }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  };
  const doc = newDocument();
  const panel = reportPanel({ doc, env: { diagnostics: async () => DIAG, copy: async () => {}, newKey: () => '00000001-0000-4000-8000-000000000000' } });
  doc.body.append(panel.root);
  return { log, panel, region: panel.root.querySelector('#st-report'), trigger: buttonNamed(panel.root, 'الإبلاغ عن مشكلة') };
}

async function send(h) {
  h.trigger.click();
  await settle();
  const area = h.panel.root.querySelector('textarea');
  area.value = 'خلل';
  area.dispatchEvent({ type: 'input' });
  buttonNamed(h.region, 'إرسال البلاغ').click();
  await settle();
  await settle();
}

test('رفض الإذن: الطلب يصل المتصفح فعلًا، ولا طلب شبكة', async () => {
  const h = setup({ request: false, contains: false });
  await send(h);
  assert.equal(h.log.requested.length, 1, 'permissions.request استُدعي مرة');
  assert.deepEqual(h.log.requested[0].origins, ['https://app-reports.isultantf.workers.dev/*']);
  assert.deepEqual(h.log.fetched, []);
});

test('الإذن ممنوح في النافذة وغير موجود عند الإرسال: يُفحص قبل الإرسال ولا طلب شبكة', async () => {
  const h = setup({ request: true, contains: false });
  await send(h);
  assert.equal(h.log.contains, 1, 'permissions.contains يُسأل قبل الطلب');
  assert.deepEqual(h.log.fetched, []);
});

test('الإذن ممنوح وموجود: طلب واحد إلى خادم البلاغات', async () => {
  const h = setup({ request: true, contains: true });
  await send(h);
  assert.equal(h.log.fetched.length, 1);
  assert.match(h.log.fetched[0].url, /^https:\/\/app-reports\.isultantf\.workers\.dev\//);
  assert.equal(h.log.fetched[0].init.method, 'POST');
});
