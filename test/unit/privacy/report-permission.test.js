// N-04 بعد و1 (2.2.0، قرار سلطان ق3: بلا خادم إطلاقًا): الربط الحقيقي للوحة البلاغ، reportPanel دون حقن الحافظة، بواجهة chrome
// وfetch وnavigator وهمية تسجّل كل نداء. «نسخ البلاغ» و«نسخ البريد» يمرّان من الحافظة وحدها، ولا طلب إذن ولا فحصه ولا طلب شبكة
// في أي خطوة من الشيفرة التي تعمل عند المستخدم.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { SUPPORT_EMAIL } from '../../../src/core/report/messages.js';
import { reportPanel } from '../../../src/pages/settings/report.js';
import { buttonNamed, newDocument, settle } from '../pages/library/fake-dom.js';

const DIAG = { appVersion: '1.0.0', os: 'macos', osVersion: '15.6.1', arch: 'arm64', browser: 'Google Chrome', browserVersion: '156.0.7650.10', buildTarget: 'chromium', test: false };
const real = { chrome: globalThis.chrome, fetch: globalThis.fetch, navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator') };
afterEach(() => {
  globalThis.chrome = real.chrome;
  globalThis.fetch = real.fetch;
  if (real.navigator) Object.defineProperty(globalThis, 'navigator', real.navigator);
});

function setup() {
  const log = { permissions: [], fetched: [], clipboard: [] };
  globalThis.chrome = {
    permissions: {
      request: async (p) => { log.permissions.push(['request', p]); return true; },
      contains: async (p) => { log.permissions.push(['contains', p]); return true; },
    },
  };
  globalThis.fetch = async (url) => { log.fetched.push(url); return new Response('{}', { status: 201 }); };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async (t) => { log.clipboard.push(t); } } } });
  const doc = newDocument();
  const panel = reportPanel({ doc, env: { diagnostics: async () => DIAG } });
  doc.body.append(panel.root);
  return { log, panel, region: panel.root.querySelector('#st-report'), trigger: buttonNamed(panel.root, 'الإبلاغ عن مشكلة') };
}

test('و1: فتح النموذج ونسخ البلاغ ونسخ البريد بالحافظة وحدها، بلا إذن ولا شبكة', async () => {
  const h = setup();
  h.trigger.click();
  await settle();
  const area = h.panel.root.querySelector('textarea');
  area.value = 'خلل';
  area.dispatchEvent({ type: 'input' });
  assert.ok(buttonNamed(h.region, 'إرسال البلاغ') === null, 'لا زر إرسال');
  buttonNamed(h.region, 'نسخ البلاغ').click();
  await settle();
  buttonNamed(h.region, 'نسخ البريد').click();
  await settle();
  assert.equal(h.log.clipboard.length, 2);
  assert.equal(JSON.parse(h.log.clipboard[0]).description, 'خلل');
  assert.equal(h.log.clipboard[1], SUPPORT_EMAIL);
  assert.deepEqual(h.log.permissions, [], 'لا permissions.request ولا contains');
  assert.deepEqual(h.log.fetched, [], 'لا fetch');
});
