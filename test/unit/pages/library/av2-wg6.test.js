// التدقيق الموحد V2، U-041: «مسح البحث» من حالة «لا نتائج» يخفي زر الحقل ويعيد التركيز إلى الحقل (وإلا بقي زرًا شفافًا في Tab).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../../src/core/store/index.js';
import { createLibrary } from '../../../../src/pages/library/view.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW, videoRecord } from '../../../helpers/fixtures.js';
import { findAll, newDocument, settle } from './fake-dom.js';

test('AV2 U-041: مسح البحث من حالة الفراغ يخفي زر المسح في الحقل ويركّز الحقل', async () => {
  let t = Date.parse(NOW);
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now: () => (t += 1000) });
  await store.updateVideo('BBBBBBBBBBB', () => ({ ...videoRecord({ videoId: 'BBBBBBBBBBB' }), title: 'ثانٍ' }));
  await area.flush();
  const doc = newDocument();
  const lib = createLibrary({
    store, doc, now: () => Date.parse(NOW) + 3600 * 1000,
    openTab: async () => {}, openPage: async () => {}, saveFile: async () => ({ ok: true }), clipboardWrite: async () => {},
    pickFiles: async () => null, diagnosticsText: async () => '{}', confirm: async () => false,
    setTimer: () => 0, clearTimer: () => {},
  });
  doc.body.append(lib.root);
  await lib.load();
  const search = lib.root.querySelector('.lib-search__input');
  const clear = lib.root.querySelector('.lib-search__clear');
  search.value = 'لا يوجد هذا';
  search.dispatchEvent({ type: 'input' });
  await settle();
  assert.ok(clear.hidden === false);
  const stateBtn = findAll(lib.root, (e) => e.tagName === 'button' && e !== clear && e.textContent.includes('مسح البحث'))[0];
  stateBtn.focus();
  stateBtn.click();
  await settle();
  assert.equal(search.value, '');
  assert.ok(clear.hidden === true, 'زر المسح مخفي والحقل فارغ');
  assert.ok(doc.activeElement === search, 'التركيز في الحقل');
});
