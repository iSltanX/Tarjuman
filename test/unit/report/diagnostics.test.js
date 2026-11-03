// تشخيص البلاغ (جولة النشر T2.1): المتصفح وإصداره والنظام وهدف البناء من الإضافة والمتصفح وحدهما، وكل مصدر يتعثر يصير unknown.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectDiagnostics, liveSources } from '../../../src/core/report/diagnostics.js';

const sources = (over = {}) => ({
  manifestVersion: () => '1.0.0',
  platformInfo: async () => ({ os: 'mac', arch: 'arm64' }),
  uaData: () => undefined,
  userAgent: () => '',
  browserInfo: async () => null,
  isBrave: async () => false,
  target: () => 'chromium',
  development: () => false,
  ...over,
});

test('Chrome وEdge من علامات userAgentData بإصدار النظام الدقيق', async () => {
  const ua = (brand, version) => ({
    brands: [{ brand: 'Chromium', version: '156' }, { brand, version: '156' }],
    getHighEntropyValues: async () => ({ platformVersion: '15.6.1', fullVersionList: [{ brand: 'Not.A/Brand', version: '99.0.0.0' }, { brand: 'Chromium', version: '156.0.7650.10' }, { brand, version: version }] }),
  });
  assert.deepEqual(await collectDiagnostics(sources({ uaData: () => ua('Google Chrome', '156.0.7650.10') })), {
    appVersion: '1.0.0', os: 'macos', osVersion: '15.6.1', arch: 'arm64', browser: 'Google Chrome', browserVersion: '156.0.7650.10', buildTarget: 'chromium', test: false,
  });
  const edge = await collectDiagnostics(sources({ uaData: () => ua('Microsoft Edge', '156.0.4314.58'), platformInfo: async () => ({ os: 'win', arch: 'x86-64' }) }));
  assert.deepEqual([edge.browser, edge.browserVersion, edge.os, edge.arch], ['Microsoft Edge', '156.0.4314.58', 'windows', 'x86_64']);
});

test('Brave يُعرف بـnavigator.brave، ولا يُعرض إصدار Chromium على أنه إصداره: الإصدار unknown وChromium في حقله', async () => {
  // كما في Brave 1.98.63 الحقيقي (أدلة T3): العلامتان بإصدار Chromium مخفّضًا، ولا أثر لـ1.98.63 في أي مصدر للصفحة.
  const brands = [{ brand: 'Chromium', version: '156' }, { brand: 'Brave', version: '156' }];
  const ua = { brands, getHighEntropyValues: async () => ({ fullVersionList: [{ brand: 'Chromium', version: '156.0.0.0' }, { brand: 'Brave', version: '156.0.0.0' }] }) };
  const d = await collectDiagnostics(sources({ isBrave: async () => true, uaData: () => ua }));
  assert.deepEqual([d.browser, d.browserVersion, d.chromiumVersion, d.osVersion], ['Brave', 'unknown', '156.0.0.0', 'unknown']);
  // علامة Brave وحدها (بلا navigator.brave) لا تعيد الخلط نفسه من قائمة المتصفحات المعروفة.
  const byBrand = await collectDiagnostics(sources({ uaData: () => ua }));
  assert.deepEqual([byBrand.browser, byBrand.browserVersion, byBrand.chromiumVersion], ['Brave', 'unknown', '156.0.0.0']);
  // ولا حقل chromiumVersion لمتصفح يكشف إصداره.
  const chrome = await collectDiagnostics(sources({ uaData: () => ({ brands: [{ brand: 'Google Chrome', version: '156' }], getHighEntropyValues: async () => ({ fullVersionList: [{ brand: 'Google Chrome', version: '156.0.8078.80' }] }) }) }));
  assert.equal('chromiumVersion' in chrome, false);
});

test('Firefox: الاسم والإصدار من getBrowserInfo، وARM64 باسمه aarch64، وهدف البناء firefox', async () => {
  const d = await collectDiagnostics(sources({
    browserInfo: async () => ({ name: 'Firefox', version: '159.0.1' }),
    platformInfo: async () => ({ os: 'mac', arch: 'aarch64' }),
    target: () => 'firefox',
  }));
  assert.deepEqual([d.browser, d.browserVersion, d.osVersion, d.arch, d.buildTarget], ['Firefox', '159.0.1', 'unknown', 'arm64', 'firefox']);
});

test('كل مصدر يتعثر يصير unknown صريحة، والعقد يجد حقوله', async () => {
  const d = await collectDiagnostics(sources({
    manifestVersion: () => { throw new Error('x'); },
    platformInfo: async () => { throw new Error('x'); },
    uaData: () => ({ getHighEntropyValues: async () => { throw new Error('x'); } }),
    userAgent: () => 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0',
    browserInfo: async () => { throw new Error('x'); },
    isBrave: async () => { throw new Error('x'); },
  }));
  assert.deepEqual(d, { appVersion: 'unknown', os: 'unknown', osVersion: 'unknown', arch: 'unknown', browser: 'Firefox', browserVersion: '140.0', buildTarget: 'chromium', test: false });
  const none = await collectDiagnostics(sources());
  assert.deepEqual([none.browser, none.browserVersion], ['unknown', 'unknown']);
});

test('المصادر الحية: هدف البناء من عنوان الصفحة، وبلا علم تطوير خارج البناء لا test', async () => {
  const api = { runtime: { getManifest: () => ({ version: '1.0.0' }), getPlatformInfo: async () => ({ os: 'linux', arch: 'x86-64' }) } };
  assert.equal(liveSources({ api, nav: {}, loc: { protocol: 'moz-extension:' } }).target(), 'firefox');
  assert.equal(liveSources({ api, nav: {}, loc: { protocol: 'chrome-extension:' } }).target(), 'chromium');
  assert.equal(liveSources({ api, nav: {}, loc: {} }).development(), false);
  assert.equal(await liveSources({ api, nav: {}, loc: {} }).browserInfo(), null, 'لا getBrowserInfo في Chromium');
  assert.equal(await liveSources({ api, nav: { brave: { isBrave: async () => true } }, loc: {} }).isBrave(), true);
});
