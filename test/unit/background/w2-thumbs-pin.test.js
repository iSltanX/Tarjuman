// و2 (2026-11-10): صور المحفوظات مطفأة حتى تُفعَّل. الترقية من 2.1.2 لا تطفئ صور من كانت ظاهرة عنده: من لم تُكتب تفضيلاته قط
// تُثبَّت حاله «ظاهرة» صراحةً عند حدث التحديث (Chromium وحده)، ومن كتبها يبقى كما كتب، والتثبيت الجديد يبدأ مطفأً.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installThumbsPin } from '../../../src/background/thumbs-pin.js';
import { DEFAULT_PREFS } from '../../../src/core/model/prefs.js';
import { KEY_PREFS } from '../../../src/core/store/keys.js';
import { createStore } from '../../../src/core/store/index.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { NOW } from '../../helpers/fixtures.js';

/** تخزين كما تركه 2.1.2، وحدث تثبيت. */
async function upgrade({ prefs = undefined, reason = 'update', target = 'chromium' } = {}) {
  const area = createMemoryArea({ unlimited: true });
  if (prefs !== undefined) await area.set({ [KEY_PREFS]: prefs });
  const store = createStore({ area, now: () => Date.parse(NOW) });
  let listener = null;
  const runtime = { onInstalled: { addListener: (fn) => { listener = fn; } } };
  const pinned = installThumbsPin({ runtime, area, store, target });
  assert.equal(typeof listener, 'function', 'يُسجَّل المستمع متزامنًا');
  listener({ reason });
  // ينتظر الكتابة (pin متاح للاختبار أيضًا).
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
  await area.flush?.();
  return { store, area, pinned };
}

test('الافتراضي الجديد: الصور مطفأة، والتثبيت الجديد لا يكتب شيئًا (فتح المحفوظات لا يُصدر طلبًا)', async () => {
  assert.equal(DEFAULT_PREFS.ui.thumbnails, false);
  const { store, area } = await upgrade({ reason: 'install' });
  assert.equal((await area.get([KEY_PREFS]))[KEY_PREFS], undefined, 'لا تفضيلات مكتوبة');
  assert.equal((await store.getPrefs()).ui.thumbnails, false);
});

test('ترقية من 2.1.2 بلا تفضيلات مكتوبة (الصور ظاهرة بالافتراضي القديم) ⇒ تبقى ظاهرة', async () => {
  const { store } = await upgrade();
  assert.equal((await store.getPrefs()).ui.thumbnails, true);
});

test('ترقية من 2.1.2 بتفضيلات مكتوبة: «ظاهرة» تبقى ظاهرة و«مطفأة» تبقى مطفأة، بلا كتابة', async () => {
  const on = { ...structuredClone(DEFAULT_PREFS), ui: { ...DEFAULT_PREFS.ui, thumbnails: true, panelOpen: true } };
  const a = await upgrade({ prefs: on });
  assert.deepEqual((await a.store.getPrefs()).ui, on.ui);
  assert.equal(await a.pinned.pin(), 'explicit');
  const off = { ...structuredClone(DEFAULT_PREFS), ui: { ...DEFAULT_PREFS.ui, thumbnails: false } };
  const b = await upgrade({ prefs: off });
  assert.equal((await b.store.getPrefs()).ui.thumbnails, false);
});

test('Firefox: لا تثبيت (كانت مطفأة حتى الموافقة أصلًا)، ولا حدث بلا onInstalled', async () => {
  const { store } = await upgrade({ target: 'firefox' });
  assert.equal((await store.getPrefs()).ui.thumbnails, false);
  assert.doesNotThrow(() => installThumbsPin({ runtime: {}, area: createMemoryArea(), store: {}, target: 'chromium' }));
});
