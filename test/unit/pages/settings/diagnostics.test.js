// تقرير التشخيص (R36، P7-AC4): الإصدار والمتصفح ورموز الأخطاء وأحجام وأعداد فقط؛ بلا عنوان ولا اسم ملف ولا نص ولا رابط.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../../src/core/store/index.js';
import { findSecrets } from '../../../../src/core/diagnostics/sanitize.js';
import { collectDiagnostics, detectBrowser, librarySummary } from '../../../../src/pages/settings/diagnostics.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW, videoRecord } from '../../../helpers/fixtures.js';

const SECRET_TITLE = 'عنوان سري جدًا لا يظهر في التقرير';

async function seeded() {
  let t = Date.parse(NOW);
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now: () => (t += 1000) });
  await store.updateVideo('AAAAAAAAAAA', () => ({ ...videoRecord({ videoId: 'AAAAAAAAAAA' }), title: SECRET_TITLE }));
  await store.updateVideo('BBBBBBBBBBB', () => ({ ...videoRecord({ videoId: 'BBBBBBBBBBB', arabic: false }), title: 'آخر' }));
  await store.setSettings({ appearance: { font: 'tajawal', scale: 125 } });
  return { area, store };
}

test('detectBrowser: الاسم والرقم الرئيسي فقط بكشف بلاغ المشكلة (Edge قبل Chrome، وFirefox باسمه؛ تدقيق 7a66f91، U53)', async () => {
  const brands = (...b) => ({ userAgentData: { brands: b.map(([brand, version]) => ({ brand, version })) }, userAgent: 'Mozilla/5.0 (X) Chrome/156.0.0.0 Safari/537.36' });
  assert.equal(await detectBrowser(brands(['Not.A/Brand', '99'], ['Chromium', '156'], ['Brave', '156']), {}), 'Brave 156');
  assert.equal(await detectBrowser(brands(['Not)A;Brand', '8'], ['Chromium', '156'], ['Google Chrome', '156']), {}), 'Chrome 156');
  assert.equal(await detectBrowser(brands(['Not A Brand', '8'], ['Chromium', '131']), {}), 'Chromium 131');
  assert.equal(await detectBrowser(brands(['Not A Brand', '8'], ['Chromium', '156'], ['Microsoft Edge', '156']), {}), 'Microsoft Edge 156', 'كان «Chromium 156»');
  assert.equal(await detectBrowser({ userAgent: 'Mozilla/5.0 (Macintosh; rv:159.0) Gecko/20100101 Firefox/159.0' }, {}), 'Firefox 159', 'كان «غير معروف»');
  assert.equal(await detectBrowser({ userAgent: 'x' }, { runtime: { getBrowserInfo: async () => ({ name: 'Firefox', version: '159.0.1' }) } }), 'Firefox 159', 'وفي Firefox من getBrowserInfo');
  assert.equal(await detectBrowser({ userAgent: 'Mozilla/5.0 (X) Chrome/156.0.6723.91 Safari/537.36' }, {}), 'Chrome 156');
  assert.equal(await detectBrowser({ userAgent: 'curl/8' }, {}), 'غير معروف');
});

test('ملخص المحفوظات: أعداد من الفهرس وحده', async () => {
  const { store } = await seeded();
  assert.deepEqual(librarySummary(await store.listIndex()), { videos: 2, withArabic: 1, edited: 0, mismatched: 0, withEnglish: 2, fingerprints: 2 });
});

test('التقرير: الإصدار والمتصفح وأقسام الأحجام والأعداد والإعدادات، وبلا عنوان ولا اسم ملف ولا رابط', async () => {
  const { store } = await seeded();
  const text = await collectDiagnostics({ store, version: '0.2.0', nav: { userAgentData: { brands: [{ brand: 'Brave', version: '1.98' }] } }, api: {}, at: '2026-11-02T12:00:00.000Z' });
  const report = JSON.parse(text);
  assert.equal(report.tarjuman, '0.2.0');
  assert.equal(report.browser, 'Brave 1');
  assert.equal(report.at, '2026-11-02T12:00:00.000Z');
  assert.equal(report.sections.storage.unlimited, true);
  assert.ok(report.sections.storage.bytesInUse > 0);
  assert.equal(report.sections.library.videos, 2);
  assert.equal(report.sections.settings.font, 'tajawal');
  assert.equal(report.sections.settings.scale, 125);
  assert.equal(text.includes(SECRET_TITLE), false, 'لا عنوان فيديو');
  assert.equal(text.includes('AAAAAAAAAAA'), false, 'لا معرّف فيديو');
  assert.equal(text.includes('.ar.srt'), false, 'لا اسم ملف');
  assert.equal(text.includes('سطر 1'), false, 'لا نص ترجمة');
  assert.equal(text.includes('ترجمة ملف ترجمة'), false, 'لا تعليمات ترجمة');
  assert.deepEqual(findSecrets(text), [], 'لا رابط ولا رمز');
});

test('فشل قسم يظهر رمزه ولا يُسقط التقرير', async () => {
  const { store, area } = await seeded();
  area.failNext('getBytesInUse', new Error('boom'));
  const report = JSON.parse(await collectDiagnostics({ store, version: '0.2.0', nav: {} }));
  assert.deepEqual(report.sections.storage, { errorCode: 'ST_READ_FAILED' });
  assert.equal(report.sections.library.videos, 2);
  assert.ok(report.sections.settings.font);
});
