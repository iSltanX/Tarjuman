// صف المحفوظات (product-spec §٦.٦) فوق تخزين حقيقي بمحاكاة: صورة الفيديو بتفضيلها وردّ فعلها على تغيّره دون إعادة بناء
// القائمة، وبلاطتها عند الخطأ والصورة الرمادية، والمدة من سجل الفيديو وحده (كسولًا بلا كتابة)، وعدم حفظ أي صورة في التخزين
// ولا أي طلب شبكة، والتجميع بالتاريخ مع ترتيب «آخر تعديل» ومسطّحًا بالعنوان، وحفظ التركيز عبر إعادة الرسم، والعرض الضيق.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStore } from '../../../../src/core/store/index.js';
import { createLibrary } from '../../../../src/pages/library/view.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { videoRecord } from '../../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../../helpers/fixtures-v2.js';
import { buttonNamed, findAll, newDocument, settle, textOf } from './fake-dom.js';

const ID = (n) => `V${String(n).padStart(10, '0')}`;
/** «الآن» محلي ثابت: 3 نوفمبر 2026 الساعة 15:30. */
const NOW = new Date(2026, 10, 3, 15, 30).getTime();
const at = (daysAgo, hour = 12) => new Date(2026, 10, 3 - daysAgo, hour, 0).getTime();

/**
 * @param {{ records: { id: string, title?: string | null, durationMs?: number | null, at?: number, arabic?: boolean }[], prefs?: object, env?: object, doc?: object }} o
 */
async function mount({ records, prefs, env = {}, doc = newDocument(), seed } = {}) {
  let clock = NOW;
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now: () => clock });
  for (const r of records) {
    clock = r.at ?? NOW - 3600000;
    await store.updateVideo(r.id, () => ({ ...videoRecord({ videoId: r.id, arabic: r.arabic !== false }), title: r.title ?? `عنوان ${r.id}`, durationMs: r.durationMs === undefined ? 60000 : r.durationMs }));
  }
  if (seed) await seed(store, (t) => { clock = t; });
  if (prefs) await store.setPrefs(prefs);
  await area.flush();
  const calls = { clipboard: [], reads: [] };
  const origGetVideo = store.getVideo.bind(store);
  store.getVideo = (id) => { calls.reads.push(id); return origGetVideo(id); };
  const lib = createLibrary({
    store, doc, now: () => NOW,
    openTab: async () => {}, openPage: async () => {}, saveFile: async () => ({ ok: true, mode: 'downloads', downloadId: 1 }),
    clipboardWrite: async (t) => { calls.clipboard.push(t); }, pickFiles: async () => null, diagnosticsText: async () => '{}',
    confirm: async () => false, setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: (id) => clearTimeout(id),
    ...env,
  });
  doc.body.append(lib.root);
  await lib.load();
  await settle(10);
  return { lib, store, area, doc, calls, root: lib.root };
}

const rows = (m) => m.root.querySelectorAll('li.lib-row');
const rowFor = (m, id) => rows(m).find((r) => r.getAttribute('data-video') === id);
const imgOf = (row) => row.querySelector('img');
const durText = (row) => { const d = row.querySelector('.lib-thumb__dur'); return d ? textOf(d.querySelector('bdi')) : null; };

test('الصورة: img واحد لكل صف بعنوانها من معرّفه المحفوظ وبالسمات المعتمدة، حين يكون «صور الفيديو» مفعّلًا (الافتراضي)', async () => {
  const m = await mount({ records: [{ id: ID(1) }, { id: ID(2) }, { id: ID(3) }] });
  assert.equal(m.lib.state.prefs.ui.thumbnails, true);
  for (const id of [ID(1), ID(2), ID(3)]) {
    const imgs = findAll(rowFor(m, id), (e) => e.tagName === 'img');
    assert.equal(imgs.length, 1, 'صورة واحدة لكل فيديو');
    assert.equal(imgs[0].getAttribute('src'), `https://i.ytimg.com/vi/${id}/mqdefault.jpg`);
    assert.deepEqual(['alt', 'loading', 'decoding', 'referrerpolicy'].map((k) => imgs[0].getAttribute(k)), ['', 'lazy', 'async', 'no-referrer']);
    assert.ok(rowFor(m, id).querySelector('.lib-thumb') === imgs[0].parentNode, 'في بداية الصف قبل العنوان');
  }
  const grid = rowFor(m, ID(1)).querySelector('.lib-row__grid');
  assert.ok(grid.children[0].classList.contains('lib-thumb') && grid.children[1].classList.contains('lib-row__main'), 'الصورة أولًا (يمين الصف في RTL) ثم العنوان');
});

test('مراجعة الهوية L9: تعذّر قراءة التفضيلات لا يطلب صورًا (البلاطة وحدها)، والقائمة تعمل', async () => {
  const m = await mount({
    records: [{ id: ID(1) }],
    seed: async (store) => { store.getPrefs = async () => { throw new Error('prefs unreadable'); }; },
  });
  assert.equal(m.lib.state.prefs.ui.thumbnails, false);
  const row = rowFor(m, ID(1));
  assert.ok(row, 'الصف معروض');
  assert.equal(findAll(row, (e) => e.tagName === 'img').length, 0, 'لا طلب خارجي ما لم يُعرف التفضيل');
  assert.equal(row.querySelector('.lib-thumb').getAttribute('data-state'), 'fallback');
});

test('الصورة: لا طلب ولا img حين يُطفأ «صور الفيديو»؛ بلاطة بأيقونة الفيديو، والمدة باقية', async () => {
  const m = await mount({ records: [{ id: ID(1), durationMs: 125000 }], prefs: { ui: { thumbnails: false } } });
  assert.equal(m.lib.state.prefs.ui.thumbnails, false);
  const row = rowFor(m, ID(1));
  assert.equal(findAll(row, (e) => e.tagName === 'img').length, 0);
  assert.ok(row.querySelector('.lib-thumb__fallback'));
  assert.equal(row.querySelector('.lib-thumb').getAttribute('data-state'), 'fallback');
  assert.equal(durText(row), '2:05', 'المدة بيانات محلية لا صورة');
  const everything = findAll(m.root, () => true).flatMap((e) => [...e._attrs.values()]);
  assert.equal(everything.some((v) => /ytimg|\.jpg/.test(v)), false, 'لا عنوان صورة في الصفحة');
});

test('تبديل «صور الفيديو» من صفحة أخرى يُطبَّق على الصفوف في مكانها دون إعادة بناء القائمة (يحفظ العقد والتركيز)', async () => {
  const m = await mount({ records: [{ id: ID(1) }, { id: ID(2) }] });
  const first = rowFor(m, ID(1));
  const edit = buttonNamed(first, 'تحرير');
  edit.focus();
  await m.store.setPrefs({ ui: { thumbnails: false } });
  await m.area.flush();
  await settle(10);
  assert.equal(m.lib.state.prefs.ui.thumbnails, false);
  assert.ok(rowFor(m, ID(1)) === first, 'الصف نفسه');
  assert.ok(buttonNamed(first, 'تحرير') === edit && m.doc.activeElement === edit, 'ولا سقط التركيز');
  assert.equal(findAll(m.root, (e) => e.tagName === 'img').length, 0, 'الصور كلها بلاطات');
  assert.equal(m.root.querySelectorAll('.lib-thumb__fallback').length, 2);
  await m.store.setPrefs({ ui: { thumbnails: true } });
  await m.area.flush();
  await settle(10);
  assert.equal(findAll(m.root, (e) => e.tagName === 'img').length, 2, 'عادت الصور');
  assert.ok(rowFor(m, ID(2)));
});

test('Firefox (قرار سلطان 2026-11-04): بلا موافقة «نشاط التصفح» لا img ولو كان المفتاح مفعّلًا، ومنحها مع تغيّر التفضيلات يعيد الصور في مكانها', async () => {
  let granted = false;
  const m = await mount({ records: [{ id: ID(1) }, { id: ID(2) }], env: { thumbsConsent: async () => granted } });
  assert.equal(m.lib.state.prefs.ui.thumbnails, true, 'المفتاح مفعّل افتراضيًا');
  assert.equal(m.lib.state.thumbsGranted, false);
  assert.equal(findAll(m.root, (e) => e.tagName === 'img').length, 0, 'لا طلب صورة بلا موافقة');
  assert.equal(m.root.querySelectorAll('.lib-thumb__fallback').length, 2);
  // مفتاح الإعدادات يمنح الموافقة ثم يكتب التفضيل.
  granted = true;
  await m.store.setPrefs({ ui: { thumbnails: true, panelDual: false } });
  await m.area.flush();
  await settle(10);
  assert.equal(m.lib.state.thumbsGranted, true);
  assert.equal(findAll(m.root, (e) => e.tagName === 'img').length, 2, 'الصور بعد الموافقة');
  // سحب الموافقة من صفحة إضافات Firefox يظهر مع أول تغيّر للتفضيلات.
  granted = false;
  await m.store.setPrefs({ ui: { panelDual: true } });
  await m.area.flush();
  await settle(10);
  assert.equal(findAll(m.root, (e) => e.tagName === 'img').length, 0);
});

test('قراءة الموافقة إن فشلت تُعدّ «لا»، وبلا مدخل الموافقة (Chromium) تبقى الصور بالمفتاح وحده', async () => {
  const failing = await mount({ records: [{ id: ID(1) }], env: { thumbsConsent: async () => { throw new Error('x'); } } });
  assert.equal(findAll(failing.root, (e) => e.tagName === 'img').length, 0);
  const chromium = await mount({ records: [{ id: ID(1) }] });
  assert.equal(chromium.lib.state.thumbsGranted, true);
  assert.equal(findAll(chromium.root, (e) => e.tagName === 'img').length, 1);
});

test('تغيّر تفضيل آخر (القاموس) لا يمسّ الصور ولا القائمة', async () => {
  const m = await mount({ records: [{ id: ID(1) }] });
  const img = imgOf(rowFor(m, ID(1)));
  await m.store.setPrefs({ glossary: { attach: false } });
  await m.area.flush();
  await settle(10);
  assert.ok(imgOf(rowFor(m, ID(1))) === img, 'الصورة نفسها لم تُعد بناءً');
});

test('خطأ الصورة أو الصورة الرمادية (≤ 120) تُحوّل صف ذلك الفيديو وحده إلى البلاطة، ولا تُعرض الرمادية', async () => {
  const m = await mount({ records: [{ id: ID(1) }, { id: ID(2) }, { id: ID(3) }] });
  imgOf(rowFor(m, ID(1))).dispatchEvent({ type: 'error' });
  const placeholder = imgOf(rowFor(m, ID(2)));
  placeholder.naturalWidth = 120;
  placeholder.dispatchEvent({ type: 'load' });
  const real = imgOf(rowFor(m, ID(3)));
  real.naturalWidth = 320;
  real.dispatchEvent({ type: 'load' });
  assert.equal(imgOf(rowFor(m, ID(1))), null);
  assert.equal(imgOf(rowFor(m, ID(2))), null, 'الرمادية 120×90 غائبة');
  assert.ok(rowFor(m, ID(1)).querySelector('.lib-thumb__fallback') && rowFor(m, ID(2)).querySelector('.lib-thumb__fallback'));
  assert.ok(imgOf(rowFor(m, ID(3))) === real, 'والحقيقية 320 تبقى');
});

test('لا تخزين للصور ولا شبكة: لا fetch ولا XHR ولا Image() أثناء التركيب، ولا شيء في التخزين عن الصور', async () => {
  const saved = { fetch: globalThis.fetch, xhr: globalThis.XMLHttpRequest, image: globalThis.Image };
  const hits = [];
  globalThis.fetch = (...a) => { hits.push(['fetch', a[0]]); throw new Error('network'); };
  globalThis.XMLHttpRequest = function X() { hits.push(['xhr']); throw new Error('network'); };
  globalThis.Image = function I() { hits.push(['Image']); throw new Error('network'); };
  try {
    const m = await mount({ records: [{ id: ID(1) }, { id: ID(2) }] });
    assert.deepEqual(hits, []);
    assert.equal(findAll(m.root, (e) => e.tagName === 'img').length, 2, 'والصور موجودة عبر img وحده');
    const dump = JSON.stringify(m.area.dump());
    assert.equal(/ytimg|mqdefault|\.jpg|data:image|base64/.test(dump), false, 'لا صورة ولا عنوانها في التخزين');
    const dumpKeys = Object.keys(m.area.dump());
    assert.equal(dumpKeys.some((k) => /thumb|image|img/i.test(k)), false);
  } finally {
    Object.assign(globalThis, { fetch: saved.fetch, XMLHttpRequest: saved.xhr, Image: saved.image });
    if (saved.xhr === undefined) delete globalThis.XMLHttpRequest;
    if (saved.image === undefined) delete globalThis.Image;
  }
});

test('المدة: من durationMs الموجب وحده («1:00» و«1:01:12»)، وبلا مدة لغير المعروف (null وصفر) فلا شارة ولا تخمين', async () => {
  const m = await mount({
    records: [
      { id: ID(1), durationMs: 60000 },
      { id: ID(2), durationMs: 3672000 },
      { id: ID(3), durationMs: null },
      { id: ID(4), durationMs: 0 },
    ],
  });
  assert.equal(durText(rowFor(m, ID(1))), '1:00');
  assert.equal(durText(rowFor(m, ID(2))), '1:01:12');
  assert.equal(durText(rowFor(m, ID(3))), null, 'مدة مجهولة: لا شيء');
  assert.equal(durText(rowFor(m, ID(4))), null, 'صفر: لا شيء');
  assert.equal(rowFor(m, ID(3)).querySelectorAll('.lib-thumb__dur').length, 0);
  assert.ok(imgOf(rowFor(m, ID(3))), 'والصورة بلا مدة');
});

test('المدة تُقرأ من سجل الفيديو مرة لكل نسخة (لا كتابة ولا إعادة قراءة عند إعادة الرسم)، وبعد تغيّر السجل تُقرأ من جديد', async () => {
  const m = await mount({ records: [{ id: ID(1), durationMs: 60000 }, { id: ID(2), durationMs: 120000 }] });
  const dump = JSON.stringify(m.area.dump());
  assert.deepEqual(m.calls.reads.sort(), [ID(1), ID(2)], 'قراءة واحدة لكل فيديو');
  await m.lib.load();
  await m.lib.load();
  await settle(10);
  assert.deepEqual(m.calls.reads.sort(), [ID(1), ID(2)], 'لا إعادة قراءة بإعادة الرسم');
  assert.equal(durText(rowFor(m, ID(2))), '2:00', 'والمدة ظاهرة من الذاكرة بعد الرسم');
  await m.area.flush();
  assert.equal(JSON.stringify(m.area.dump()), dump, 'القراءة لا تكتب');
  // تغيّر السجل (نسخة جديدة): قراءة جديدة.
  await m.store.updateVideo(ID(1), (r) => ({ ...r, durationMs: 90000 }));
  await m.area.flush();
  await m.lib.load();
  await settle(10);
  assert.equal(m.calls.reads.filter((x) => x === ID(1)).length, 2);
  assert.equal(durText(rowFor(m, ID(1))), '1:30');
});

test('المدة كسولة بـIntersectionObserver: لا قراءة إلا للصف الذي يقترب من الشاشة', async () => {
  const doc = newDocument();
  const observed = new Map();
  let callback = null;
  doc.defaultView = {
    IntersectionObserver: class {
      constructor(cb, opts) { callback = cb; this.opts = opts; }
      observe(node) { observed.set(node, true); }
      unobserve(node) { observed.delete(node); }
      disconnect() { observed.clear(); }
    },
  };
  const m = await mount({ records: [{ id: ID(1), durationMs: 60000 }, { id: ID(2), durationMs: 120000 }], doc });
  assert.deepEqual(m.calls.reads, [], 'لا قراءة قبل الظهور');
  assert.equal(durText(rowFor(m, ID(1))), null);
  assert.equal(observed.size, 2, 'كل صف يُراقَب');
  const second = rowFor(m, ID(2)).querySelector('.lib-thumb');
  callback([{ target: second, isIntersecting: false }]);
  await settle(5);
  assert.deepEqual(m.calls.reads, [], 'خارج الشاشة: لا شيء');
  callback([{ target: second, isIntersecting: true }]);
  await settle(10);
  assert.deepEqual(m.calls.reads, [ID(2)], 'الصف الظاهر وحده');
  assert.equal(durText(rowFor(m, ID(2))), '2:00');
  assert.equal(durText(rowFor(m, ID(1))), null);
  assert.equal(observed.has(second), false, 'لا مراقبة بعد القراءة');
});

test('التجميع بالتاريخ (ترتيب «آخر تعديل»): اليوم وهذا الأسبوع وأقدم بأعدادها، ومسطّحًا بلا أقسام عند الترتيب بالعنوان', async () => {
  const m = await mount({
    records: [
      { id: ID(1), title: 'ج اليوم', at: at(0, 10) }, { id: ID(2), title: 'ب اليوم', at: at(0, 9) },
      { id: ID(3), title: 'أ هذا الأسبوع', at: at(3) }, { id: ID(4), title: 'د أقدم', at: at(40) },
    ],
  });
  const groups = () => m.root.querySelectorAll('section.lib-group');
  assert.deepEqual(groups().map((g) => [g.getAttribute('data-group'), textOf(g.querySelector('.lib-group__title')), textOf(g.querySelector('.lib-group__n'))]), [
    ['today', 'اليوم', '2'], ['week', 'هذا الأسبوع', '1'], ['older', 'أقدم', '1'],
  ]);
  assert.deepEqual(groups().map((g) => g.querySelectorAll('li.lib-row').map((r) => textOf(r.querySelector('h3')))), [['ج اليوم', 'ب اليوم'], ['أ هذا الأسبوع'], ['د أقدم']], 'الأحدث أولًا داخل القسم');
  assert.equal(m.root.querySelectorAll('ul.lib-list').length, 3, 'صندوق صفوف لكل قسم');
  assert.equal(groups()[0].querySelector('h2').tagName, 'h2');
  // الترتيب بالعنوان: قائمة واحدة مسطّحة.
  const sort = m.root.querySelector('select.lib-sort__select');
  sort.value = 'title';
  sort.dispatchEvent({ type: 'change' });
  assert.equal(groups().length, 0);
  assert.equal(m.root.querySelectorAll('ul.lib-list').length, 1);
  assert.deepEqual(rows(m).map((r) => textOf(r.querySelector('h3'))), ['أ هذا الأسبوع', 'ب اليوم', 'ج اليوم', 'د أقدم']);
  sort.value = 'updated';
  sort.dispatchEvent({ type: 'change' });
  assert.equal(groups().length, 3, 'يعود التجميع');
});

test('التجميع: قسم فارغ لا يُعرض، وعدد القسم على كل المطابقات لا المعروف وحده (50 ثم المزيد)', async () => {
  const many = Array.from({ length: 55 }, (_, i) => ({ id: ID(i + 1), title: `فيديو ${i + 1}`, at: at(0, 14) - i * 1000 }));
  const m = await mount({ records: [...many, { id: ID(99), title: 'قديم', at: at(60) }] });
  const heads = () => m.root.querySelectorAll('section.lib-group').map((g) => [g.getAttribute('data-group'), textOf(g.querySelector('.lib-group__n')), g.querySelectorAll('li.lib-row').length]);
  assert.deepEqual(heads(), [['today', '55', 50]], 'قسم اليوم 55 والمعروف 50؛ و«أقدم» لم يصل بعد فلا قسم له');
  buttonNamed(m.root, 'عرض المزيد').click();
  assert.deepEqual(heads(), [['today', '55', 55], ['older', '1', 1]]);
  const search = m.root.querySelector('input.lib-search__input');
  search.value = 'قديم';
  search.dispatchEvent({ type: 'input' });
  assert.deepEqual(heads(), [['older', '1', 1]], 'البحث يخفي الأقسام الفارغة');
});

test('الصف: الشارة الوحيدة والترجمات (شرائح للموجودة وشريحة رفع) وأفعاله الأربعة بترتيبها، والتوسيع يحفظ حاله عبر إعادة الرسم', async () => {
  const m = await mount({ records: [], seed: async (store, setClock) => { setClock(at(0, 13)); await seedBundle(store, sampleBundle({ videoId: ID(1) })); } });
  const row = rowFor(m, ID(1));
  assert.equal(row.querySelectorAll('.tj-pill').length, 1, 'شارة حالة واحدة');
  assert.equal(textOf(row.querySelector('.tj-pill')), 'تحتاج مراجعة 2');
  assert.deepEqual([...row.querySelector('.lib-row__actions').children].map((c) => c.getAttribute('data-fk') ?? c.querySelector('button').getAttribute('data-fk')), [`${ID(1)}:edit`, `${ID(1)}:open`, `${ID(1)}:toggle`, `${ID(1)}:more`]);
  assert.equal(textOf(row.querySelector('.lib-trs__label')), 'الترجمات');
  const toggle = buttonNamed(row, 'إظهار الترجمات');
  toggle.click();
  await settle(10);
  assert.ok(rowFor(m, ID(1)).querySelector('.lib-exp'));
  await m.lib.load();
  await settle(10);
  assert.ok(rowFor(m, ID(1)).querySelector('.lib-exp'), 'بقي موسَّعًا بعد إعادة بناء القائمة');
  assert.equal(buttonNamed(rowFor(m, ID(1)), 'إخفاء الترجمات').getAttribute('aria-expanded'), 'true');
});

test('الحالات: الفارغة بخطواتها (زر التنزيل وزر الترجمة) وبلا أدوات، وبلا نتائج بزر المسح', async () => {
  const m = await mount({ records: [] });
  // الحالة الفارغة (بعد القراءة).
  assert.equal(textOf(m.root.querySelector('.tj-empty__title')), 'لا ترجمات محفوظة بعد');
  assert.equal(m.root.querySelector('.lib-state').getAttribute('role'), null);
  assert.deepEqual(m.root.querySelectorAll('.tj-empty__steps li').map(textOf), ['افتح فيديو على يوتيوب', 'اضغط زر التنزيل في شريط المشغّل', 'ارفع ملفك العربي من زر الترجمة']);
  assert.ok(m.root.querySelector('.lib-toolbar').hidden, 'لا أدوات بلا محفوظات');
  const data = await mount({ records: [{ id: ID(1), title: 'المطبعة' }] });
  const search = data.root.querySelector('input.lib-search__input');
  search.value = 'لا يوجد';
  search.dispatchEvent({ type: 'input' });
  assert.equal(textOf(data.root.querySelector('.tj-empty__title')), `لا نتائج لـ«${String.fromCodePoint(0x2068)}لا يوجد${String.fromCodePoint(0x2069)}»`);
  assert.equal(textOf(data.root.querySelector('.tj-empty__text')), 'البحث في العناوين والمعرّفات. جرّب كلمة أقصر أو المعرّف.');
  buttonNamed(data.root, 'مسح البحث').click();
  assert.equal(rows(data).length, 1);
});

test('الهيكل: ثلاثة صفوف بارتفاع الصف الحقيقي (صورة 128×72) بعلامة الانشغال قبل اكتمال القراءة', async () => {
  const doc = newDocument();
  const store = createStore({ area: createMemoryArea({ unlimited: true }) });
  const lib = createLibrary({ store, doc, now: () => NOW, openTab: async () => {}, openPage: async () => {}, saveFile: async () => ({ ok: true }), clipboardWrite: async () => {}, pickFiles: async () => null, diagnosticsText: async () => '' });
  doc.body.append(lib.root);
  const sk = lib.root.querySelector('.lib-skeleton');
  assert.ok(sk);
  assert.equal(sk.getAttribute('aria-busy'), 'true');
  assert.equal(sk.querySelectorAll('.lib-row--skeleton').length, 3);
  assert.equal(sk.querySelectorAll('.lib-skel-thumb').length, 3);
  const css = readFileSync(new URL('../../../../src/pages/library/library.css', import.meta.url), 'utf8');
  assert.match(css, /\.lib-thumb \{[^}]*width: 128px; height: 72px/, 'مقاس الصورة 128×72');
  assert.match(css, /\.lib-skel-thumb \{ height: 72px;/, 'والهيكل بارتفاعها نفسه');
  assert.match(css, /\.lib-row--skeleton \{[^}]*padding: 12px 16px/, 'وبحشو الصف نفسه (لوحة 13: 12 × 16)');
  assert.match(css, /\.lib-row__grid \{[^}]*padding: 12px 16px/);
  lib.dispose();
});

test('العرض الضيق (≤ 760): الأنماط تجعل الصف عمودًا واحدًا، والأفعال صفًّا تحته، والصورة 96×54', () => {
  const css = readFileSync(new URL('../../../../src/pages/library/library.css', import.meta.url), 'utf8');
  const narrow = css.slice(css.indexOf('@media (max-width: 760px)'));
  assert.match(narrow, /\.lib-row__grid \{[^}]*grid-template-columns: 96px minmax\(0, 1fr\);[^}]*grid-template-areas: "thumb main" "thumb trs" "acts acts"/);
  assert.match(narrow, /\.lib-thumb \{ width: 96px; height: 54px; \}/);
  assert.match(narrow, /\.lib-row__actions \{[^}]*border-top: 1px solid var\(--tj-border\)/);
  assert.match(narrow, /\.lib-exp__cards \{ grid-template-columns: minmax\(0, 1fr\); \}/, 'البطاقات عمود واحد');
});

test('الوضعان: كل ألوان أنماط المحفوظات من الرموز، والاستثناء المسمّى ما فوق الصورة أو مكانها وحده (شارة المدة وبلاطة «بلا صورة»)', () => {
  const css = readFileSync(new URL('../../../../src/pages/library/library.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const literals = [...css.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\)/g)].map((m) => m[0]);
  assert.deepEqual(literals.sort(), ['#1E4A44', '#2B3F3B', '#fff', 'rgb(0 0 0 / 75%)', 'rgb(255 255 255 / 72%)'], 'ثوابت محتوى الفيديو وحدها (لا تتبع الوضع)');
  assert.match(css, /--lib-scrim: rgb\(0 0 0 \/ 75%\);\s*--lib-scrim-ink: #fff;\s*--lib-tile: linear-gradient\(135deg, #2B3F3B, #1E4A44\);\s*--lib-tile-ink: rgb\(255 255 255 \/ 72%\);/);
  const uses = [...css.matchAll(/(?:^|[;{\s])(?:color|background|border-color|fill|stroke)\s*:\s*([^;}]+)/g)].map((m) => m[1].trim());
  for (const v of uses) assert.ok(/var\(--(?:tj|lib)-|transparent|currentColor|none|inherit/.test(v), `قيمة لون خارج الرموز: ${v}`);
});

test('حفظ التركيز: بعد التفعيل من شريحة يعود التركيز إلى الشريحة نفسها رغم إعادة بناء القائمة', async () => {
  const m = await mount({ records: [], seed: async (store, setClock) => { setClock(at(0, 13)); await seedBundle(store, sampleBundle({ videoId: ID(1), third: true })); } });
  const chip = (n) => rowFor(m, ID(1)).querySelector(`.lib-chips button[data-slot="${n}"]`);
  chip(2).focus();
  chip(2).click();
  await settle(15);
  assert.equal((await m.store.getBundle(ID(1))).active, 2);
  assert.equal(m.doc.activeElement.getAttribute('data-fk'), `${ID(1)}:chip-2`, 'الشريحة المعاد بناؤها');
  assert.equal(chip(2).getAttribute('aria-pressed'), 'true');
});
