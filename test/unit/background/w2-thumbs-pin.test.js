// و2 (2026-11-10): صور المحفوظات مطفأة حتى تُفعَّل. الترقية من 2.1.2 لا تطفئ صور من كانت ظاهرة عنده: من لم تُكتب تفضيلاته قط
// تُثبَّت حاله «ظاهرة» صراحةً عند حدث التحديث (Chromium وحده)، ومن كتبها يبقى كما كتب، والتثبيت الجديد يبدأ مطفأً.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THUMBS_OFF_SINCE, installThumbsPin, olderThan } from '../../../src/background/thumbs-pin.js';
import { DEFAULT_PREFS } from '../../../src/core/model/prefs.js';
import { KEY_PREFS } from '../../../src/core/store/keys.js';
import { createStore } from '../../../src/core/store/index.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { NOW } from '../../helpers/fixtures.js';

/** تخزين كما تركه 2.1.2، وحدث تثبيت. */
async function upgrade(opts = {}) {
  const { prefs = undefined, reason = 'update', target = 'chromium' } = opts;
  // غياب المفتاح ⇒ 2.1.2؛ وundefined صريحًا يبقى غائبًا (حدث تحديث بلا previousVersion).
  const previousVersion = 'previousVersion' in opts ? opts.previousVersion : '2.1.2';
  const area = createMemoryArea({ unlimited: true });
  if (prefs !== undefined) await area.set({ [KEY_PREFS]: prefs });
  const store = createStore({ area, now: () => Date.parse(NOW) });
  let listener = null;
  const runtime = { onInstalled: { addListener: (fn) => { listener = fn; } } };
  const pinned = installThumbsPin({ runtime, area, store, target });
  assert.equal(typeof listener, 'function', 'يُسجَّل المستمع متزامنًا');
  listener(reason === 'update' ? { reason, previousVersion } : { reason });
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

// ---- المراجعة المستقلة للمرحلة 7: التثبيت للترقية من قبل 2.2.0 وحدها ----

test('من ثبّت 2.2.0 أو أحدث ولم يكتب تفضيلات: التحديث اللاحق لا يفعّل الصور (كانت تُفعَّل مع كل تحديث)', async () => {
  for (const previousVersion of ['2.2.0', '2.2.1', '2.3.0', '3.0']) {
    const { store, area } = await upgrade({ previousVersion });
    assert.equal((await area.get([KEY_PREFS]))[KEY_PREFS], undefined, `${previousVersion}: لا كتابة`);
    assert.equal((await store.getPrefs()).ui.thumbnails, false, previousVersion);
  }
});

test('الترقية من 1.1.0 إلى ما قبل 2.2.0 وحدها تثبّت؛ وإصدار سابق غائب أو لا يُقرأ ⇒ لا تثبيت', async () => {
  for (const previousVersion of ['2.1.2', '2.1.0', '2.0.0', '1.1.0']) {
    const { store } = await upgrade({ previousVersion });
    assert.equal((await store.getPrefs()).ui.thumbnails, true, previousVersion);
  }
  for (const previousVersion of [undefined, '', 'x', '2.1.2-beta']) {
    const { store } = await upgrade({ previousVersion });
    assert.equal((await store.getPrefs()).ui.thumbnails, false, String(previousVersion));
  }
  assert.equal(THUMBS_OFF_SINCE, '2.2.0');
  assert.equal(olderThan('2.1.9', '2.2.0'), true);
  assert.equal(olderThan('2.2', '2.2.0'), false);
  assert.equal(olderThan('2.10.0', '2.2.0'), false);
  assert.equal(olderThan(null, '2.2.0'), null);
});

// ---- ع-١٦: 0.2.0 (tj-v1) و1.0.0 (tj-v2) بلا صور أصلًا، فالترقية أو العودة منهما لا تشغّلها ----

test('ع-١٦: الترقية من 0.2.0 أو 1.0.0 بلا تفضيلات مكتوبة لا تشغّل الصور ولا تكتب شيئًا', async () => {
  for (const previousVersion of ['0.2.0', '1.0.0', '1.0.9']) {
    const { store, area } = await upgrade({ previousVersion });
    assert.equal((await area.get([KEY_PREFS]))[KEY_PREFS], undefined, `${previousVersion}: لا كتابة`);
    assert.equal((await store.getPrefs()).ui.thumbnails, false, previousVersion);
  }
});

test('ع-١٦: العودة من tj-v1 بعد 2.2.0: المطفأة صراحةً تبقى مطفأة، ومن مسح بياناته في tj-v1 أو لم يكتب تفضيلات تبقى صوره مطفأة', async () => {
  const off = { ...structuredClone(DEFAULT_PREFS), ui: { ...DEFAULT_PREFS.ui, thumbnails: false } };
  const kept = await upgrade({ prefs: off, previousVersion: '0.2.0' });
  assert.equal((await kept.store.getPrefs()).ui.thumbnails, false, 'tj-v1 لا يعرف مفتاح prefs فيبقى كما كتبه 2.2.0');
  for (const previousVersion of ['0.2.0', '1.0.0']) {
    // «مسح كل البيانات» في tj-v1 يحذف prefs، ومن لم يكتبها في 2.2.0 لا prefs عنده أصلًا: كلاهما بلا مفتاح.
    const { store, area } = await upgrade({ previousVersion });
    assert.equal((await area.get([KEY_PREFS]))[KEY_PREFS], undefined, `${previousVersion}: لا كتابة`);
    assert.equal((await store.getPrefs()).ui.thumbnails, false, previousVersion);
  }
});
