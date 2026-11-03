// موافقة صور المحفوظات (قرار سلطان 2026-11-04، الخيار أ لحكم T5): في Firefox وحده، بفئة browsingActivity، تُقرأ من
// permissions.getAll() ويطلبها permissions.request متزامنًا داخل الضغطة؛ وفي Chromium «ممنوحة» بلا أي استدعاء للأذونات.
// والصور تظهر بالمفتاح والموافقة معًا.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THUMBS_DATA, buildTarget, needsConsent, requestThumbnailsConsent, thumbnailsConsent, thumbnailsShown } from '../../../src/core/consent/thumbnails.js';

const api = ({ granted = [], answer = true, throwOn = null } = {}) => {
  const calls = [];
  return {
    calls,
    permissions: {
      getAll: async () => { calls.push(['getAll']); if (throwOn === 'getAll') throw new Error('x'); return { origins: [], permissions: [], data_collection: granted }; },
      request: (p) => { calls.push(['request', p]); if (throwOn === 'request') throw new Error('x'); return Promise.resolve(answer); },
    },
  };
};

test('الهدف من عنوان الصفحة، والموافقة تلزم Firefox وحده، وفئتها browsingActivity', () => {
  assert.equal(buildTarget({ protocol: 'moz-extension:' }), 'firefox');
  assert.equal(buildTarget({ protocol: 'chrome-extension:' }), 'chromium');
  assert.equal(buildTarget(undefined), 'chromium');
  assert.equal(needsConsent('firefox'), true);
  assert.equal(needsConsent('chromium'), false);
  assert.equal(THUMBS_DATA, 'browsingActivity');
});

test('Chromium: ممنوحة بلا قراءة ولا طلب', async () => {
  const a = api();
  assert.equal(await thumbnailsConsent(a, 'chromium'), true);
  assert.equal(await requestThumbnailsConsent(a, 'chromium'), true);
  assert.deepEqual(a.calls, []);
});

test('Firefox: القراءة من getAll، وأي فشل «لا»', async () => {
  assert.equal(await thumbnailsConsent(api({ granted: ['technicalAndInteraction', 'browsingActivity'] }), 'firefox'), true);
  assert.equal(await thumbnailsConsent(api({ granted: ['technicalAndInteraction'] }), 'firefox'), false);
  assert.equal(await thumbnailsConsent(api({ granted: undefined }), 'firefox'), false);
  assert.equal(await thumbnailsConsent(api({ throwOn: 'getAll' }), 'firefox'), false);
});

test('Firefox: الطلب متزامن قبل أي انتظار، بالفئة وحدها، والرفض والخطأ «لا»', async () => {
  const a = api({ answer: true });
  const pending = requestThumbnailsConsent(a, 'firefox');
  assert.deepEqual(a.calls, [['request', { data_collection: ['browsingActivity'] }]], 'الطلب في الضغطة نفسها، بلا مضيف ولا إذن آخر');
  assert.equal(await pending, true);
  assert.equal(await requestThumbnailsConsent(api({ answer: false }), 'firefox'), false);
  assert.equal(await requestThumbnailsConsent(api({ answer: 'yes' }), 'firefox'), false, 'true وحدها موافقة');
  assert.equal(await requestThumbnailsConsent(api({ throwOn: 'request' }), 'firefox'), false);
});

test('الصور تظهر بالمفتاح والموافقة معًا', () => {
  assert.equal(thumbnailsShown(true, true), true);
  assert.equal(thumbnailsShown(true, false), false);
  assert.equal(thumbnailsShown(false, true), false);
  assert.equal(thumbnailsShown(undefined, true), false);
});
