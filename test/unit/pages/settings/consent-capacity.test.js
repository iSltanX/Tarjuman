// تدقيق 7a66f91، المرحلة C1، في الإعدادات: مفتاح «صور الفيديو» يتبع سحب موافقة Firefox بلا كتابة (U02)، وفشل قياس المساحة
// أو الأحجام لا يمحو الأعداد ولا يعرض «تعذّرت قراءة المحفوظات» (U03).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../../src/core/store/index.js';
import { capacityUnavailable, sizesUnavailable, createSettings } from '../../../../src/pages/settings/view.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { videoRecord } from '../../../helpers/fixtures.js';
import { findAll, newDocument, settle, textOf } from '../library/fake-dom.js';

const NOW = '2026-11-05T09:00:00.000Z';

/** موافقة Firefox بمحاكاة: check بالقيمة الحالية، وwatch يسجّل المستمع، وrevoke سحب بلا كتابة. */
function firefoxConsent({ granted = true } = {}) {
  const state = { granted, listeners: new Set() };
  return {
    state,
    thumbsConsent: {
      needed: true,
      check: async () => state.granted,
      request: async () => { state.granted = true; return true; },
      watch: (fn) => { state.listeners.add(fn); return () => state.listeners.delete(fn); },
    },
    revoke({ silent = false } = {}) {
      state.granted = false;
      if (!silent) for (const fn of state.listeners) fn({ revoked: true });
    },
  };
}

async function mount({ videos = 0, env = {}, prepare } = {}) {
  let t = Date.parse(NOW);
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now: () => (t += 1000) });
  for (let i = 0; i < videos; i++) await store.updateVideo(`V${String(i).padStart(10, '0')}`, () => videoRecord({ videoId: `V${String(i).padStart(10, '0')}` }));
  await area.flush();
  if (prepare) prepare(area, store);
  const doc = newDocument();
  const settings = createSettings({
    store, doc, version: '0.2.0',
    clipboardWrite: async () => {}, diagnosticsText: async () => '{}',
    setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: (id) => clearTimeout(id),
    ...env,
  });
  doc.body.append(settings.root);
  await settings.load();
  await settle(5);
  return { settings, store, area, doc, root: settings.root };
}

const sw = (m) => findAll(m.root, (e) => e.tagName === 'input' && e.getAttribute('data-pref') === 'ui.thumbnails')[0];
const fire = (doc, type) => { for (const fn of [...(doc._listeners.get(type) ?? [])]) fn({ type }); };
const text = (m, cls) => textOf(m.root.querySelector(`.${cls}`));

test('U02: سحب الموافقة بحدث الأذونات بلا أي كتابة يطفئ المفتاح المعروض، والتفضيل نفسه لا يُمسّ', async () => {
  const c = firefoxConsent({ granted: true });
  const m = await mount({ env: { thumbsConsent: c.thumbsConsent } });
  assert.equal(sw(m).checked, true);
  c.revoke();
  await settle(5);
  assert.equal(sw(m).checked, false, 'المفتاح يتبع السحب');
  assert.equal((await m.store.getPrefs()).ui.thumbnails, true, 'لا كتابة: التفضيل باقٍ والموافقة وحدها سُحبت');
});

test('U02: سحب صامت يظهر عند ظهور الصفحة ومع أي تغيّر للتفضيلات', async () => {
  const c = firefoxConsent({ granted: true });
  const m = await mount({ env: { thumbsConsent: c.thumbsConsent } });
  c.revoke({ silent: true });
  assert.equal(sw(m).checked, true, 'لم تعلم الصفحة بعد');
  fire(m.doc, 'visibilitychange');
  await settle(5);
  assert.equal(sw(m).checked, false, 'الظهور يعيد القراءة');

  const c2 = firefoxConsent({ granted: true });
  const m2 = await mount({ env: { thumbsConsent: c2.thumbsConsent } });
  c2.revoke({ silent: true });
  await m2.store.setPrefs({ glossary: { attach: false } });
  await m2.area.flush();
  await settle(10);
  assert.equal(sw(m2).checked, false, 'تغيّر تفضيل آخر يعيد قراءة الموافقة');
});

test('U02: dispose يلغي الاشتراك ومستمعي الظهور', async () => {
  const c = firefoxConsent({ granted: true });
  const m = await mount({ env: { thumbsConsent: c.thumbsConsent } });
  assert.equal(c.state.listeners.size, 1);
  m.settings.dispose();
  assert.equal(c.state.listeners.size, 0);
  assert.equal(m.doc._listeners.get('visibilitychange')?.size ?? 0, 0);
});

test('U03: غياب getBytesInUse (Firefox 140–143): سطر المساحة «غير متاح» بلا «لم يُحذف شيء»، والأعداد باقية، والأحجام «غير متاحة»', async () => {
  const m = await mount({ videos: 2, prepare: (area) => { area.getBytesInUse = undefined; } });
  assert.equal(text(m, 'st-quota__text'), capacityUnavailable());
  assert.equal(m.root.querySelector('.tj-meter').hidden, true);
  assert.match(text(m, 'st-library-usage'), /الترجمات المحفوظة: 2 · الفيديوهات المترجمة: 2/, 'الأعداد من المحفوظات لا من القياس');
  assert.equal(text(m, 'st-library-bytes'), sizesUnavailable());
  const all = textOf(m.root);
  assert.equal(all.includes('لم يُحذف شيء'), false);
  assert.equal(all.includes('تعذّرت قراءة المحفوظات'), false, 'المحفوظات سليمة، والقياس وحده تعذّر');
});

test('U03: رفض عابر لـbundleBytes لا يمحو الأعداد، والمكتبة الفارغة لا تقيس شيئًا', async () => {
  const m = await mount({ videos: 1, prepare: (area) => { area.getBytesInUse = async (k) => { if (k !== null) throw new Error('bytes'); return 10; }; } });
  assert.match(text(m, 'st-library-usage'), /الترجمات المحفوظة: 1/);
  assert.equal(text(m, 'st-library-bytes'), sizesUnavailable());
  assert.match(text(m, 'st-quota__text'), /^\d+ ك\.ب/, 'السعة الكلية قيست');

  const empty = await mount({ videos: 0, prepare: (area) => { area.getBytesInUse = async () => { throw new Error('x'); }; } });
  assert.equal(text(empty, 'st-library-usage'), 'لا ترجمات محفوظة بعد.');
  assert.equal(text(empty, 'st-library-bytes'), '', 'لا قياس لمكتبة فارغة');
});
