// تهيئة اللغة في السياقات: أولوية المحفوظ، وتعذّر التخزين، وتتبّع التبديل، وعزل صفحة يوتيوب، وتطبيق lang وdir، وإعادة التحميل بلا فقد المسودات.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getLocale, lt, setLocale } from '../../../src/i18n/index.js';
import { applyDocumentLocale, bootLocale, browserLanguage, watchLocale } from '../../../src/ui/locale.js';
import { installContentLocale } from '../../../src/content/locale.js';
import { installActionTitle } from '../../../src/background/action-title.js';
import { startPage } from '../../../src/ui/page.js';
import { el, relabel } from '../../../src/ui/components.js';
import { createStore } from '../../../src/core/store/index.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { FakeDocument, FakeElement } from '../pages/library/fake-dom.js';

const newStore = (area = createMemoryArea({ unlimited: true })) => createStore({ area, now: () => Date.parse('2026-11-08T00:00:00.000Z') });
const reset = (ctx) => ctx.after(() => setLocale('ar'));

function pageDoc() {
  const doc = new FakeDocument();
  const proto = FakeElement.prototype;
  if (!proto.appendChild) proto.appendChild = function appendChild(n) { this.append(n); return n; };
  const app = doc.createElement('main');
  app.setAttribute('id', 'app');
  doc.body.append(app);
  return doc;
}

test('bootLocale: المحفوظ يغلب، ولا تُقرأ إشارة يوتيوب معه', async (ctx) => {
  reset(ctx);
  const store = newStore();
  await store.setUiLocale('en');
  let read = 0;
  assert.equal(await bootLocale({ store, youtube: () => { read++; return 'ar'; }, browser: 'ar' }), 'en');
  assert.equal(read, 0);
  assert.equal(getLocale(), 'en');
});

test('bootLocale: بلا محفوظ تُهيَّأ من يوتيوب وتُحفظ', async (ctx) => {
  reset(ctx);
  const store = newStore();
  assert.equal(await bootLocale({ store, youtube: () => 'en-GB', browser: 'ar' }), 'en');
  assert.equal((await store.getUiLocale()).source, 'youtube');
});

test('bootLocale: خارج يوتيوب تُهيَّأ من المتصفح', async (ctx) => {
  reset(ctx);
  const store = newStore();
  assert.equal(await bootLocale({ store, browser: 'ar-EG' }), 'ar');
  assert.equal((await store.getUiLocale()).source, 'browser');
});

test('bootLocale: تعذّر التخزين لا يوقف الواجهة، وتُطبَّق السياسة نفسها', async (ctx) => {
  reset(ctx);
  const store = { getUiLocale: async () => { throw new Error('x'); }, initUiLocale: async () => { throw new Error('y'); } };
  assert.equal(await bootLocale({ store, youtube: () => { throw new Error('z'); }, browser: 'en-US' }), 'en');
  assert.equal(await bootLocale({ store, browser: null }), 'en', 'الافتراضية');
});

test('browserLanguage: chrome.i18n أولًا ثم navigator، وخطؤه لا يرمي', () => {
  assert.equal(browserLanguage({ i18n: { getUILanguage: () => 'ar-SA' } }, { language: 'en' }), 'ar-SA');
  assert.equal(browserLanguage({ i18n: { getUILanguage: () => { throw new Error('x'); } } }, { language: 'en' }), 'en');
  assert.equal(browserLanguage(null, null), null);
});

test('watchLocale: يتبع التغيير الفعلي من سياق آخر ويتجاهل غيره', async (ctx) => {
  reset(ctx);
  const area = createMemoryArea({ unlimited: true });
  const here = newStore(area);
  const there = newStore(area);
  const seen = [];
  const off = watchLocale(here, (l) => seen.push(l));
  await there.setUiLocale('ar'); // هي لغة السياق: لا تبليغ
  await there.setUiLocale('en');
  await area.flush?.();
  off();
  assert.deepEqual(seen, ['en']);
  assert.equal(getLocale(), 'en');
});

test('applyDocumentLocale يضبط lang وdir', (ctx) => {
  reset(ctx);
  const doc = pageDoc();
  applyDocumentLocale(doc);
  assert.equal(doc.documentElement.getAttribute('lang'), 'ar');
  assert.equal(doc.documentElement.getAttribute('dir'), 'rtl');
  setLocale('en');
  applyDocumentLocale(doc);
  assert.equal(doc.documentElement.getAttribute('lang'), 'en');
  assert.equal(doc.documentElement.getAttribute('dir'), 'ltr');
});

test('lang وdir على صفحة يوتيوب لا يُلمسان، والعناصر المركّبة تُبلَّغ بعد التهيئة وعند التبديل', async (ctx) => {
  reset(ctx);
  const doc = pageDoc();
  doc.documentElement.setAttribute('lang', 'ar-SA');
  doc.documentElement.setAttribute('dir', 'rtl');
  const area = createMemoryArea({ unlimited: true });
  const store = newStore(area);
  let calls = 0;
  const { ready, dispose } = installContentLocale({ store, mounted: { controls: { relocalize: () => { calls++; } }, overlay: {} }, doc });
  assert.equal(await ready, 'ar');
  assert.equal(calls, 1);
  assert.equal((await store.getUiLocale()).source, 'youtube');
  await newStore(area).setUiLocale('en');
  await area.flush?.();
  dispose();
  assert.equal(calls, 2);
  assert.equal(getLocale(), 'en');
  assert.equal(doc.documentElement.getAttribute('lang'), 'ar-SA');
  assert.equal(doc.documentElement.getAttribute('dir'), 'rtl');
});

test('تلميح الأيقونة: العامل يقرأ ولا يهيّئ، ويتبع التبديل', async (ctx) => {
  reset(ctx);
  const area = createMemoryArea({ unlimited: true });
  const store = newStore(area);
  const titles = [];
  const { ready, dispose } = installActionTitle({ store, action: { setTitle: ({ title }) => { titles.push(title); } } });
  await ready;
  assert.deepEqual(titles, []);
  assert.equal(await store.getUiLocale(), null, 'لا تهيئة من العامل');
  await store.setUiLocale('en');
  await area.flush?.();
  dispose();
  assert.deepEqual(titles, ['Tarjuman']);
});

test('startPage: تُحدَّد اللغة قبل العرض، ويُضبط lang وdir والعنوان', async (ctx) => {
  reset(ctx);
  const doc = pageDoc();
  const area = createMemoryArea({ unlimited: true });
  const store = newStore(area);
  await store.setUiLocale('en');
  await area.flush?.();
  let seen = null;
  await startPage({ title: 'X', doc, store, render: () => { seen = getLocale(); } });
  assert.equal(seen, 'en');
  assert.equal(doc.documentElement.getAttribute('dir'), 'ltr');
  assert.equal(doc.title, 'Tarjuman — X');
});

test('startPage: تبديل اللغة يعيد تحميل الصفحة، والصفحة التي تتكفل به تتبدّل في مكانها', async (ctx) => {
  reset(ctx);
  const area = createMemoryArea({ unlimited: true });
  const store = newStore(area);
  await store.setUiLocale('ar');
  await area.flush?.();
  let reloads = 0;
  await startPage({ title: 'A', doc: pageDoc(), store, reload: () => { reloads++; }, render: () => {} });
  await newStore(area).setUiLocale('en');
  await area.flush?.();
  assert.equal(reloads, 1);
  await newStore(area).setUiLocale('ar');
  await area.flush?.();

  const area2 = createMemoryArea({ unlimited: true });
  const store2 = newStore(area2);
  await store2.setUiLocale('ar');
  const doc2 = pageDoc();
  let inPlace = 0;
  let reloads2 = 0;
  await startPage({ title: 'B', doc: doc2, store: store2, reload: () => { reloads2++; }, render: (_app, page) => { page.relocalize = () => { inPlace++; }; } });
  await newStore(area2).setUiLocale('en');
  await area2.flush?.();
  assert.equal(inPlace, 1);
  assert.equal(reloads2, 0);
  assert.equal(doc2.documentElement.getAttribute('dir'), 'ltr');
  assert.equal(doc2.title, 'Tarjuman — B');
});

test('LazyText في el يتبع relabel', (ctx) => {
  reset(ctx);
  const doc = new FakeDocument();
  const node = el('span', { text: lt('common.nav.library'), attrs: { 'aria-label': lt('common.nav.settings') }, doc });
  assert.equal(node.textContent, 'المحفوظات');
  setLocale('en');
  relabel(doc);
  assert.equal(node.textContent, 'Library');
  assert.equal(node.getAttribute('aria-label'), 'Settings');
});
