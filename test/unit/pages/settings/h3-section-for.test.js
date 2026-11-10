// ح3 ومراجعة المرحلة 5 (م3 وط1): sectionFor لا يعيد إلا معرّف قسم أو بديل قسم محذوف، فلا تنهار الصفحة برابط مثل #constructor،
// ولا يُكتب العنوان عند الفتح إلا لبديل.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SECTION_ALIASES, sectionFor } from '../../../../src/pages/settings/model.js';
import { createSettings } from '../../../../src/pages/settings/view.js';
import { createStore } from '../../../../src/core/store/index.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW } from '../../../helpers/fixtures.js';
import { newDocument } from '../library/fake-dom.js';

test('sectionFor: القسم نفسه، و#timing ⇒ display، وخصائص Object.prototype وغيرها null', () => {
  assert.equal(sectionFor('export'), 'export');
  assert.equal(sectionFor('timing'), 'display');
  assert.deepEqual(Object.keys(SECTION_ALIASES), ['timing']);
  for (const id of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'garbage', '', null, undefined, 5]) assert.equal(sectionFor(id), null, String(id));
});

test('الفتح بـ#constructor لا يكسر الصفحة ولا يكتب العنوان، ويفتح «العرض»', async () => {
  let t = Date.parse(NOW);
  const store = createStore({ area: createMemoryArea({ unlimited: true }), now: () => (t += 1000) });
  const writes = [];
  const nav = { get: () => 'constructor', set: (id) => writes.push(id), onChange: () => () => {} };
  const doc = newDocument();
  const settings = createSettings({ store, doc, version: '0.2.0', clipboardWrite: async () => {}, diagnosticsText: async () => '{}', setTimer: () => 0, clearTimer: () => {}, nav });
  doc.body.append(settings.root);
  await settings.load();
  assert.equal(settings.active, 'display');
  assert.deepEqual(writes, [], 'جزء غير معروف يبقى كما كان');
});
