// تبديل اللغة أثناء عمل جارٍ: يُعلَّق كله (لا إعادة تحميل ولا تغيّر لغة السياق) ثم يُطبَّق بآخر قيمة عند الفراغ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getLocale, setLocale } from '../../../src/i18n/index.js';
import { watchLocale } from '../../../src/ui/locale.js';
import { holdPage, onPageReleased, pageHeld, whileHeld } from '../../../src/ui/page-hold.js';
import { startPage } from '../../../src/ui/page.js';
import { confirmDialog } from '../../../src/ui/components.js';
import { installContentLocale } from '../../../src/content/locale.js';
import { createStore } from '../../../src/core/store/index.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { FakeDocument, FakeElement, settle } from '../pages/library/fake-dom.js';

const AT = Date.parse('2026-11-08T00:00:00.000Z');
const newStore = (area) => createStore({ area, now: () => AT });
const reset = (ctx) => ctx.after(() => setLocale('ar'));

function pageDoc() {
  const doc = new FakeDocument();
  const proto = FakeElement.prototype;
  if (!proto.appendChild) proto.appendChild = function appendChild(n) { this.append(n); return n; };
  // closest كما في المتصفح، لمحدد السمة الذي تستعمله الصفحة وحده.
  if (!proto.closest) proto.closest = function closest(sel) { const attr = /^\[([\w-]+)/.exec(sel)?.[1]; for (let n = this; n && n.nodeType === 1; n = n.parentNode) if (n.hasAttribute?.(attr) || n.getAttribute?.(attr) !== null && n.getAttribute?.(attr) !== undefined) return n; return null; };
  const app = doc.createElement('main');
  app.setAttribute('id', 'app');
  doc.body.append(app);
  return doc;
}

async function seeded(locale = 'ar') {
  const area = createMemoryArea({ unlimited: true });
  const store = newStore(area);
  await store.setUiLocale(locale);
  await area.flush?.();
  return { area, store };
}
const flip = async (area, locale) => {
  await newStore(area).setUiLocale(locale);
  await area.flush?.();
};

test('القبضات متعددة، والإفلات مرتين بلا أثر، ويُبلَّغ عند آخرها وحده', () => {
  let released = 0;
  const off = onPageReleased(() => { released++; });
  const a = holdPage();
  const b = holdPage();
  assert.ok(pageHeld());
  a();
  a();
  assert.ok(pageHeld(), 'بقيت قبضة');
  assert.equal(released, 0);
  b();
  assert.equal(pageHeld(), false);
  assert.equal(released, 1);
  off();
});

test('whileHeld يفلت بعد الفشل أيضًا', async () => {
  await assert.rejects(whileHeld(async () => { assert.ok(pageHeld()); throw new Error('x'); }), /x/);
  assert.equal(pageHeld(), false);
});

test('watchLocale: وهو مشغول لا تتغير لغة السياق، وflush يطبّق آخر قيمة', async (ctx) => {
  reset(ctx);
  const { area, store } = await seeded();
  let held = true;
  const seen = [];
  const w = watchLocale(store, (l) => seen.push(l), { held: () => held });
  await flip(area, 'en');
  assert.equal(getLocale(), 'ar');
  assert.deepEqual(seen, []);
  assert.equal(w.pending(), 'en');
  w.flush();
  assert.equal(getLocale(), 'ar', 'ما زال مشغولًا');
  held = false;
  w.flush();
  assert.equal(getLocale(), 'en');
  assert.deepEqual(seen, ['en']);
  assert.equal(w.pending(), null);
  w();
});

test('watchLocale: العودة إلى اللغة نفسها أثناء الانشغال لا تبلّغ بشيء', async (ctx) => {
  reset(ctx);
  const { area, store } = await seeded();
  let held = true;
  const seen = [];
  const w = watchLocale(store, (l) => seen.push(l), { held: () => held });
  await flip(area, 'en');
  await flip(area, 'ar');
  held = false;
  w.flush();
  assert.deepEqual(seen, []);
  assert.equal(getLocale(), 'ar');
  w();
});

test('startPage: لا إعادة تحميل ولا تغيّر لغة أثناء عمل جارٍ، وتُطبَّق مرة عند انتهائه', async (ctx) => {
  reset(ctx);
  const { area, store } = await seeded();
  const doc = pageDoc();
  let reloads = 0;
  await startPage({ title: 'A', doc, store, reload: () => { reloads++; }, render: () => {} });
  const release = holdPage();
  await flip(area, 'en');
  assert.equal(reloads, 0);
  assert.equal(getLocale(), 'ar');
  assert.equal(doc.documentElement.getAttribute('dir'), 'rtl');
  release();
  assert.equal(reloads, 1);
  assert.equal(getLocale(), 'en');
  assert.equal(doc.documentElement.getAttribute('dir'), 'ltr');
});

test('startPage: الكتابة في حقل غير محفوظ تؤجّل إعادة التحميل حتى يُغادَر، والحقل المحفوظ لا يؤجّلها', async (ctx) => {
  reset(ctx);
  const { area, store } = await seeded();
  const doc = pageDoc();
  const typed = doc.createElement('input');
  const kept = doc.createElement('input');
  kept.setAttribute('data-tj-keep', 'x');
  doc.body.append(typed, kept);
  let reloads = 0;
  await startPage({ title: 'A', doc, store, reload: () => { reloads++; }, render: () => {} });
  typed.focus();
  await flip(area, 'en');
  assert.equal(reloads, 0, 'الحقل غير المحفوظ يؤجّل');
  typed.blur();
  await settle(5);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(reloads, 1, 'بعد مغادرة الحقل');

  setLocale('ar');
  const second = await seeded();
  const doc2 = pageDoc();
  const kept2 = doc2.createElement('input');
  kept2.setAttribute('data-tj-keep', 'x');
  doc2.body.append(kept2);
  let reloads2 = 0;
  await startPage({ title: 'B', doc: doc2, store: second.store, reload: () => { reloads2++; }, render: () => {} });
  kept2.focus();
  await flip(second.area, 'en');
  assert.equal(reloads2, 1);
});

test('startPage: تغيّر وصل قبل الاشتراك يُلتقط بعد العرض', async (ctx) => {
  reset(ctx);
  const { area, store } = await seeded();
  let reloads = 0;
  await startPage({
    title: 'A', doc: pageDoc(), store, reload: () => { reloads++; },
    render: async () => { await newStore(area).setUiLocale('en'); },
  });
  await area.flush?.();
  assert.equal(getLocale(), 'en');
  assert.equal(reloads, 1);
});

test('confirmDialog يقبض ما دام مفتوحًا', (ctx) => {
  reset(ctx);
  const proto = FakeElement.prototype;
  proto.showModal ??= function showModal() {};
  const doc = pageDoc();
  const pending = confirmDialog({ title: 'T', confirmLabel: 'OK', doc });
  assert.ok(pageHeld());
  const dialog = doc.body.querySelector('dialog');
  dialog.returnValue = 'cancel';
  dialog.dispatchEvent({ type: 'close', bubbles: false });
  assert.equal(pageHeld(), false);
  return pending;
});

test('يوتيوب: تدفق جارٍ يؤجّل التبديل كله، ويُعاد الفحص حتى ينتهي، ولا يُلمس جذر الصفحة', async (ctx) => {
  reset(ctx);
  const { area, store } = await seeded();
  const doc = pageDoc();
  doc.documentElement.setAttribute('lang', 'ar');
  let tick = null;
  doc.defaultView = { setInterval: (fn) => { tick = fn; return 1; }, clearInterval() {} };
  let held = true;
  let calls = 0;
  const { ready, dispose } = installContentLocale({ store, doc, mounted: { controls: { holdsFlow: () => held, relocalize: () => { calls++; } } } });
  await ready;
  const before = calls;
  await flip(area, 'en');
  assert.equal(getLocale(), 'ar');
  assert.equal(calls, before);
  tick();
  assert.equal(getLocale(), 'ar', 'ما زال التدفق جاريًا');
  held = false;
  tick();
  assert.equal(getLocale(), 'en');
  assert.equal(calls, before + 1);
  assert.equal(doc.documentElement.getAttribute('lang'), 'ar');
  dispose();
});
