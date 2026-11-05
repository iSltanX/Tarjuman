// تدقيق 7a66f91، المرحلة C1: صور المحفوظات بعد سحب موافقة Firefox (U01)، وفشل قياس السعة والأحجام (U03).
// U01: السحب من صفحة إضافات Firefox لا يكتب في التخزين. فالصفحة المفتوحة تسمعه من permissions.onRemoved، وتعيد القراءة عند
// الظهور، ولا تسند عنوان صورة إلا بعد قراءة جديدة؛ ولا تُطبَّق قراءة أقدم من السحب. والمقبول صفر عناوين i.ytimg.com بعد السحب.
// U03: getBytesInUse غائبة في Firefox 140–143، وأي رفض عابر للسعة أو الأحجام في أي متصفح لا يُسقط القائمة ولا البطاقات.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thumbnailsConsent, watchThumbnailsConsent } from '../../../../src/core/consent/thumbnails.js';
import { createStore } from '../../../../src/core/store/index.js';
import { createLibrary } from '../../../../src/pages/library/view.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { videoRecord } from '../../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../../helpers/fixtures-v2.js';
import { buttonNamed, findAll, newDocument, settle } from './fake-dom.js';

const ID = (n) => `V${String(n).padStart(10, '0')}`;
const NOW = new Date(2026, 10, 3, 15, 30).getTime();

/** واجهة أذونات Firefox بمحاكاة: getAll بالموافقة الحالية (أو معلّقة يدويًا)، وحدثا onAdded وonRemoved. */
function firefoxPermissions({ granted = true } = {}) {
  const listeners = { added: new Set(), removed: new Set() };
  const state = { granted, held: null, reads: 0 };
  const event = (set) => ({ addListener: (fn) => set.add(fn), removeListener: (fn) => set.delete(fn) });
  const api = {
    permissions: {
      // القيمة لحظة الطلب؛ وheld يؤخر وصول الرد (قراءة بدأت قبل السحب ووصلت بعده).
      getAll: () => {
        state.reads++;
        const answer = { origins: [], permissions: [], data_collection: state.granted ? ['browsingActivity'] : [] };
        return state.held ? state.held.then(() => answer) : Promise.resolve(answer);
      },
      onAdded: event(listeners.added),
      onRemoved: event(listeners.removed),
    },
  };
  return {
    api, state, listeners,
    /** سحب من صفحة الإضافات: لا كتابة في التخزين، وحدث onRemoved وحده. */
    revoke({ silent = false } = {}) {
      state.granted = false;
      if (!silent) for (const fn of listeners.removed) fn({ origins: [], permissions: [], data_collection: ['browsingActivity'] });
    },
    grant() {
      state.granted = true;
      for (const fn of listeners.added) fn({ origins: [], permissions: [], data_collection: ['browsingActivity'] });
    },
  };
}

/** يسجّل كل عنوان صورة أُسند في الصفحة، ولو استُبدلت عقدته لاحقًا (عدّاد «الطلبات»). */
function recordingDocument() {
  const doc = newDocument();
  const sources = [];
  const create = doc.createElement.bind(doc);
  doc.createElement = (tag) => {
    const node = create(tag);
    if (String(tag).toLowerCase() === 'img') {
      const set = node.setAttribute.bind(node);
      node.setAttribute = (k, v) => {
        if (k === 'src') sources.push(String(v));
        return set(k, v);
      };
    }
    return node;
  };
  return { doc, sources };
}

async function mount({ count = 3, perms = null, watch = true, areaOpts = { unlimited: true }, seed, doc = newDocument() } = {}) {
  let clock = NOW - 86400000;
  const area = createMemoryArea(areaOpts);
  const store = createStore({ area, now: () => clock });
  for (let i = 1; i <= count; i++) {
    clock += 1000;
    await store.updateVideo(ID(i), () => ({ ...videoRecord({ videoId: ID(i) }), title: `فيديو ${i}`, durationMs: 60000 }));
  }
  if (seed) await seed(store, area);
  await area.flush();
  const env = perms ? {
    thumbsConsent: () => thumbnailsConsent(perms.api, 'firefox'),
    ...(watch ? { thumbsConsentWatch: (fn) => watchThumbnailsConsent(perms.api, 'firefox', fn) } : {}),
  } : {};
  const lib = createLibrary({
    store, doc, now: () => NOW,
    openTab: async () => {}, openPage: async () => {}, saveFile: async () => ({ ok: true }),
    clipboardWrite: async () => {}, pickFiles: async () => null, diagnosticsText: async () => '{}', confirm: async () => false,
    setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: (id) => clearTimeout(id),
    ...env,
  });
  doc.body.append(lib.root);
  await lib.load();
  await settle(10);
  return { lib, store, area, doc, root: lib.root };
}

const imgs = (m) => findAll(m.root, (e) => e.tagName === 'img');
const withSrc = (m) => imgs(m).filter((i) => i.hasAttribute('src'));
const fire = (doc, type) => { for (const fn of [...(doc._listeners.get(type) ?? [])]) fn({ type }); };

test('U01: سحب الموافقة بحدث onRemoved بلا أي كتابة يطفئ الصور القائمة فورًا، ثم «عرض المزيد» والبحث لا يسندان أي عنوان', async () => {
  const perms = firefoxPermissions({ granted: true });
  const { doc, sources } = recordingDocument();
  const m = await mount({ count: 51, perms, doc });
  assert.equal(withSrc(m).length, 50, 'الصفحة الأولى بصورها بعد الموافقة');
  const before = sources.length;
  const snapshot = JSON.stringify(m.area.dump?.() ?? null);

  perms.revoke();
  assert.equal(imgs(m).length, 0, 'تفريغ الصور القائمة في الحال، قبل أي قراءة');
  assert.equal(m.lib.state.thumbsGranted, false);
  await settle(10);

  buttonNamed(m.root, 'عرض المزيد').click();
  await settle(10);
  const search = m.root.querySelector('input.lib-search__input');
  search.value = 'فيديو';
  search.dispatchEvent({ type: 'input' });
  await settle(10);
  assert.equal(imgs(m).length, 0, 'لا img بعد «عرض المزيد» والبحث');
  assert.deepEqual(sources.slice(before), [], 'صفر عناوين i.ytimg.com جديدة بعد السحب');
  assert.equal(m.root.querySelectorAll('.lib-thumb__fallback').length, m.root.querySelectorAll('li.lib-row').length, 'البلاطات في كل الصفوف');
  assert.equal(JSON.stringify(m.area.dump?.() ?? null), snapshot, 'السحب لم يكتب شيئًا في التخزين');
});

test('U01: بلا حدث (Firefox لا يبلّغ أو الصفحة كانت مخفية)، لا عنوان لصورة جديدة قبل قراءة جديدة، والظهور يطفئ القائمة', async () => {
  const perms = firefoxPermissions({ granted: true });
  const { doc, sources } = recordingDocument();
  const m = await mount({ count: 51, perms, watch: false, doc });
  assert.equal(withSrc(m).length, 50);
  const before = sources.length;

  perms.revoke({ silent: true });
  assert.equal(m.lib.state.thumbsGranted, true, 'الحالة لم تعلم بعد');
  buttonNamed(m.root, 'عرض المزيد').click();
  await settle(10);
  assert.deepEqual(sources.slice(before), [], 'الصفوف الجديدة تقرأ الموافقة قبل إسناد عناوينها: لا طلب');
  assert.equal(m.lib.state.thumbsGranted, false, 'وقراءتها صحّحت الحالة');
  assert.equal(imgs(m).length, 0, 'وأطفأت الصور القائمة معها');

  // ثم المنح من جديد والعودة إلى الصفحة: الظهور يعيد القراءة فتعود الصور.
  perms.state.granted = true;
  fire(doc, 'visibilitychange');
  await settle(10);
  assert.equal(m.lib.state.thumbsGranted, true);
  assert.equal(withSrc(m).length, 51);
});

test('U01: الظهور وحده (visibilitychange) يعيد القراءة ويطفئ الصور بعد سحب صامت', async () => {
  const perms = firefoxPermissions({ granted: true });
  const m = await mount({ count: 3, perms, watch: false });
  assert.equal(withSrc(m).length, 3);
  perms.revoke({ silent: true });
  fire(m.doc, 'visibilitychange');
  await settle(10);
  assert.equal(imgs(m).length, 0);
});

test('U01: قراءة بدأت قبل السحب ورجعت بعده بـ«نعم» لا تعيد الصور (عدّاد الجيل)', async () => {
  const perms = firefoxPermissions({ granted: true });
  const { doc, sources } = recordingDocument();
  const m = await mount({ count: 2, perms, doc });
  let release;
  perms.state.held = new Promise((r) => { release = r; });
  // قراءة تبدأ والموافقة ما زالت ممنوحة (تغيّر تفضيل آخر)، ويتأخر ردها.
  const reads = perms.state.reads;
  await m.store.setPrefs({ glossary: { attach: false } });
  await m.area.flush();
  await settle(2);
  assert.equal(perms.state.reads, reads + 1, 'القراءة بدأت قبل السحب');
  // السحب: قراءته («لا») تصل أولًا، ثم يصل رد القراءة الأقدم بـ«نعم».
  perms.state.held = null;
  perms.revoke();
  await settle(5);
  assert.equal(m.lib.state.thumbsGranted, false);
  const before = sources.length;
  // تاريخ قيمة الموافقة في الحالة بعد السحب: لا يعود إلى «نعم» ولو لحظة.
  const history = [];
  let value = m.lib.state.thumbsGranted;
  Object.defineProperty(m.lib.state, 'thumbsGranted', { configurable: true, enumerable: true, get: () => value, set: (v) => { history.push(v); value = v; } });
  release();
  await settle(10);
  assert.equal(history.includes(true), false, 'الرد الأقدم لم يُطبَّق');
  assert.equal(m.lib.state.thumbsGranted, false, 'القراءة الأقدم من السحب لا تُطبَّق');
  assert.equal(imgs(m).length, 0);
  assert.deepEqual(sources.slice(before), []);
});

test('U01: المنح بحدث onAdded يعيد الصور في مكانها، وChromium بلا مدخل الموافقة يسند العناوين فورًا كما كان', async () => {
  const perms = firefoxPermissions({ granted: false });
  const m = await mount({ count: 2, perms });
  assert.equal(imgs(m).length, 0);
  perms.grant();
  await settle(10);
  assert.equal(withSrc(m).length, 2);

  const chromium = await mount({ count: 2 });
  assert.equal(withSrc(chromium).length, 2);
});

test('U01: dispose يلغي الاشتراك في أحداث الأذونات', async () => {
  const perms = firefoxPermissions({ granted: true });
  const m = await mount({ count: 1, perms });
  assert.equal(perms.listeners.removed.size, 1);
  m.lib.dispose();
  assert.equal(perms.listeners.removed.size, 0);
  assert.equal(perms.listeners.added.size, 0);
});

test('U03: غياب getBytesInUse (Firefox 140–143) لا يُسقط المحفوظات: الصفوف معروضة، وسطر السعة غائب، ولا لوحة خطأ', async () => {
  const m = await mount({ count: 3, seed: async (_s, area) => { area.getBytesInUse = undefined; } });
  assert.equal(m.lib.state.status, 'ready');
  assert.equal(m.root.querySelectorAll('li.lib-row').length, 3);
  assert.equal(m.root.querySelector('.lib-state--error'), null);
  assert.equal(m.lib.state.capacity, null);
  assert.equal(m.root.querySelector('.lib-quota'), null, 'سطر السعة يغيب ولا يخطئ');
});

test('U03: رفض عابر للسعة في أي متصفح لا يُسقط القائمة، وإعادة التحميل بعده تعيد السطر', async () => {
  const m = await mount({ count: 2 });
  m.area.failNext('getBytesInUse', new Error('transient'));
  await m.lib.load();
  assert.equal(m.lib.state.status, 'ready');
  assert.equal(m.root.querySelectorAll('li.lib-row').length, 2);
  assert.equal(m.root.querySelector('.lib-state--error'), null);
  await m.lib.load();
  assert.ok(m.root.querySelector('.lib-quota'));
});

test('U03: فشل bundleBytes في التوسيع لا يُسقط بطاقات الترجمات ولا أزرارها (والنسخة السابقة بلا حجم)', async () => {
  const m = await mount({ count: 0, seed: async (store) => { await seedBundle(store, sampleBundle({ videoId: ID(1), previous: true })); } });
  m.area.getBytesInUse = async () => { throw new Error('no bytes'); };
  const row = m.root.querySelector(`li[data-video="${ID(1)}"]`);
  buttonNamed(row, 'إظهار الترجمات').click();
  await settle(10);
  const cards = m.root.querySelectorAll('.lib-card');
  assert.ok(cards.length >= 2, 'البطاقات معروضة');
  assert.ok(buttonNamed(m.root.querySelector('.lib-card'), 'تصدير SRT') || m.root.querySelector('.lib-card__actions button'), 'وأزرارها');
  assert.equal(findAll(m.root, (e) => e.classList?.contains('tj-alert--danger')).length, 0, 'لا تنبيه خطأ مكان البطاقات');
});
