// واجهة المحفوظات بـDOM وهمي فوق تخزين حقيقي بمحاكاة (P7-AC2/AC3/AC6/AC7): الحالات الخمس، والبحث والترتيب والعرض
// التدريجي، وأوامر الصف الستة، و«نسخ» بحالاته وبعدم ظهور نص التعليمات في أي عنصر أو سمة في أي حالة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instructions } from '../../../../src/core/export/instructions.js';
import { createStore } from '../../../../src/core/store/index.js';
import { withArabicEdit, withView } from '../../../../src/core/model/index.js';
import { writeSrt } from '../../../../src/core/srt/writer.js';
import { createLibrary, CAPTION, COPY_TIP } from '../../../../src/pages/library/view.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW, englishTrack, fingerprint, makeCues, videoRecord } from '../../../helpers/fixtures.js';
import { buttonNamed, findAll, newDocument, settle, textOf } from './fake-dom.js';

const IDS = ['AAAAAAAAAAA', 'BBBBBBBBBBB', 'CCCCCCCCCCC'];
const iso = (s) => `${String.fromCodePoint(0x2068)}${s}${String.fromCodePoint(0x2069)}`;
const TEMPLATE_PROBES = ['ترجمة ملف ترجمة فيديو', 'أرفقتُ ملف ترجمة', 'بنية SRT: التزم بها', 'افهم قبل أن تترجم', '{{video_title}}', 'التسليم'];

function timers() {
  let n = 0;
  const q = new Map();
  return {
    setTimer: (fn, ms) => { q.set(++n, { fn, ms }); return n; },
    clearTimer: (id) => q.delete(id),
    pending: () => [...q.values()],
    async runAll() {
      for (let i = 0; i < 20 && q.size; i++) {
        const batch = [...q.entries()];
        q.clear();
        for (const [, t] of batch) t.fn();
        await settle(2);
      }
    },
  };
}

async function mount({ records = IDS.map((id, i) => ({ id, title: `عنوان ${i + 1}` })), areaOpts = { unlimited: true }, env = {} } = {}) {
  let t = Date.parse(NOW);
  const area = createMemoryArea(areaOpts);
  const store = createStore({ area, now: () => (t += 1000) });
  for (const [i, r] of records.entries()) {
    await store.updateVideo(r.id, () => ({ ...(r.record ?? videoRecord({ videoId: r.id, offset: r.offset ?? 0, arabic: r.arabic !== false })), title: r.title ?? null }));
    if (i === 0) await store.getSettings();
  }
  await area.flush();
  const doc = newDocument();
  const clock = timers();
  const calls = { clipboard: [], tabs: [], pages: [], downloads: [], confirms: [], diagnostics: 0 };
  const answers = [];
  const lib = createLibrary({
    store, doc, now: () => Date.parse(NOW) + 3 * 3600 * 1000 + 60000,
    openTab: async (u) => { calls.tabs.push(u); },
    openPage: async (name, params) => { calls.pages.push([name, params]); },
    saveFile: async (f) => { calls.downloads.push(f); return { ok: true, mode: 'downloads', downloadId: calls.downloads.length }; },
    clipboardWrite: async (text) => { calls.clipboard.push(text); },
    pickFiles: async () => null,
    diagnosticsText: async () => { calls.diagnostics++; return '{"tarjuman":"test"}'; },
    confirm: async (o) => { calls.confirms.push(o); return answers.length ? answers.shift() : false; },
    setTimer: clock.setTimer, clearTimer: clock.clearTimer,
    ...env,
  });
  doc.body.append(lib.root);
  return { lib, store, area, doc, clock, calls, answers, root: lib.root };
}

/** بنود القائمة المنسدلة المرتبطة بزرها. */
const menuItems = (button) => button.parentNode.querySelectorAll('[role=menuitem]');
/** «رفع ترجمة…» من قائمة «المزيد» للصف المسمّى. */
const clickReplace = (m, name = 'عنوان') => {
  const more = buttonNamed(m.root, `المزيد: ${name}`);
  more.click();
  menuItems(more).find((i) => textOf(i).startsWith('رفع ترجمة')).click();
};
const deleteItem = (more) => menuItems(more).at(-1);
const rows = (m) => m.root.querySelectorAll('li.lib-row');
const rowTitles = (m) => rows(m).map((r) => textOf(r.querySelector('h2')));
const rowFor = (m, id) => rows(m).find((r) => textOf(r).includes(id));

function allText(root) {
  const parts = [];
  for (const el of [root, ...root.descendants()]) {
    parts.push(el.textContent, el.value ?? '', el.title ?? '');
    for (const v of el._attrs.values()) parts.push(v);
  }
  return parts.join('\n');
}

function assertNoTemplate(m, where) {
  const text = allText(m.root) + allText(m.doc.body);
  for (const p of TEMPLATE_PROBES) assert.equal(text.includes(p), false, `${where}: ظهر جزء من التعليمات «${p}»`);
  assert.equal(findAll(m.doc.body, (e) => e.tagName === 'textarea').length, 0, `${where}: لا textarea`);
  assert.equal(findAll(m.doc.body, (e) => e.tagName === 'input' && (e.getAttribute('type') ?? 'text') === 'text').length, 0, `${where}: لا حقل نص`);
  assert.equal(findAll(m.doc.body, (e) => e.getAttribute('contenteditable') !== null).length, 0, `${where}: لا محرّر`);
}

test('التحميل: هيكل ثم قائمة بالعدد والسطر التوضيحي ومقياس السعة', async () => {
  const m = await mount();
  assert.equal(m.root.querySelectorAll('.lib-skeleton').length, 1, 'هيكل قبل اكتمال القراءة');
  await m.lib.load();
  assert.equal(m.root.querySelectorAll('.lib-skeleton').length, 0);
  assert.equal(rows(m).length, 3);
  assert.equal(textOf(m.root.querySelector('.lib-count')), '3 فيديوهات');
  assert.equal(textOf(m.root.querySelector('.lib-caption')), CAPTION);
  assert.match(textOf(m.root.querySelector('.lib-quota__text')), /^المستخدم \d+ ك\.ب$/);
  assert.equal(m.root.querySelectorAll('.tj-meter').length, 0, 'بلا حد ثابت لا شريط');
  assert.deepEqual(rowTitles(m).sort(), ['عنوان 1', 'عنوان 2', 'عنوان 3']);
  assertNoTemplate(m, 'ممتلئة');
});

test('الصف: العنوان والمعرّف والشارات والإزاحة والتاريخ النسبي ووقته المطلق', async () => {
  const m = await mount({ records: [{ id: IDS[0], title: 'محاضرة', offset: 500 }] });
  await m.lib.load();
  const row = rows(m)[0];
  assert.equal(textOf(row.querySelector('h2')), 'محاضرة');
  // الاتجاه: العنوان يتبع أول حرف قوي فيه (عربي أو إنجليزي)، والمعرّف معزول LTR بخط أحادي.
  assert.ok(row.querySelector('h2').classList.contains('tj-auto'));
  const idEl = findAll(row, (e) => e.tagName === 'bdi')[0];
  assert.equal(textOf(idEl), IDS[0]);
  assert.equal(idEl.dir, 'ltr');
  assert.ok(idEl.classList.contains('tj-ltr') && idEl.classList.contains('tj-mono'));
  assert.ok(textOf(row).includes(IDS[0]));
  const badges = findAll(row, (e) => e.classList.contains('tj-pill')).map(textOf);
  assert.deepEqual(badges, ['EN يدوي', 'AR الأصل']);
  assert.ok(textOf(row).includes('الإزاحة \u2066+0.5\u2069 ث'));
  const when = findAll(row, (e) => e.classList.contains('tj-caption') && e.title)[0];
  assert.equal(textOf(when), 'قبل 3 ساعات');
  assert.match(when.title, /2026/);
});

test('بلا عنوان محفوظ: النص الخافت واسم الوصول بالمعرّف، والحالة الفارغة بخطواتها الثلاث', async () => {
  const m = await mount({ records: [{ id: IDS[0], title: null }] });
  await m.lib.load();
  const title = rows(m)[0].querySelector('h2');
  assert.equal(textOf(title), 'بلا عنوان محفوظ');
  assert.ok(title.classList.contains('lib-row__title--empty'));
  assert.ok(buttonNamed(rows(m)[0], `نسخ التعليمات: ${IDS[0]}`));

  const empty = await mount({ records: [] });
  await empty.lib.load();
  assert.equal(rows(empty).length, 0);
  assert.equal(textOf(empty.root.querySelector('.tj-empty__title')), 'لا ترجمات محفوظة بعد');
  assert.deepEqual(empty.root.querySelectorAll('.tj-empty__steps li').map(textOf), ['افتح فيديو', 'اضغط تحميل الترجمة', 'ارفع ملفك العربي']);
  assertNoTemplate(empty, 'فارغة');
});

test('البحث: يصفّي بالعنوان والمعرّف، ونتيجته الفارغة تعرض «لا نتائج لـ…» وزر «مسح البحث»', async () => {
  const m = await mount({ records: [{ id: IDS[0], title: 'مُحاضرة عن الخطوط' }, { id: IDS[1], title: 'How Browsers Render' }, { id: IDS[2], title: null }] });
  await m.lib.load();
  const search = m.root.querySelector('input.lib-search__input');
  search.value = 'محاضره';
  search.dispatchEvent({ type: 'input' });
  assert.deepEqual(rowTitles(m), ['مُحاضرة عن الخطوط']);
  search.value = 'cccc';
  search.dispatchEvent({ type: 'input' });
  assert.equal(rows(m).length, 1, 'بالمعرّف');
  search.value = 'لا يوجد هذا';
  search.dispatchEvent({ type: 'input' });
  assert.equal(rows(m).length, 0);
  assert.equal(textOf(m.root.querySelector('.tj-empty__title')), `لا نتائج لـ«${iso('لا يوجد هذا')}»`);
  assertNoTemplate(m, 'بحث بلا نتائج');
  const live = m.root.querySelector('p.tj-sr-only[role="status"]');
  assert.equal(textOf(live), 'لا نتائج', 'إعلان لقارئ الشاشة بغياب النتائج');
  buttonNamed(m.root, 'مسح البحث').click();
  assert.equal(search.value, '');
  assert.equal(rows(m).length, 3);
  assert.equal(textOf(live), '', 'مسح البحث يفرّغ الإعلان القديم');
});

test('الترتيب بالعنوان، والعرض التدريجي (50 ثم المزيد)', async () => {
  const many = Array.from({ length: 60 }, (_, i) => ({ id: `V${String(i).padStart(10, '0')}`, title: `فيديو ${String(i).padStart(2, '0')}` }));
  const m = await mount({ records: many });
  await m.lib.load();
  assert.equal(rows(m).length, 50);
  const more = buttonNamed(m.root, 'عرض المزيد');
  assert.ok(more, 'زر عرض المزيد');
  more.click();
  assert.equal(rows(m).length, 60);
  assert.equal(buttonNamed(m.root, 'عرض المزيد'), null);
  const sort = m.root.querySelector('select.lib-sort__select');
  sort.value = 'title';
  sort.dispatchEvent({ type: 'change' });
  assert.equal(rowTitles(m)[0], 'فيديو 00');
  assert.equal(rowTitles(m).at(-1), 'فيديو 59');
});

test('الخطأ: تنبيه بالرمز وزر «نسخ تقرير التشخيص» ينسخ التقرير', async () => {
  const m = await mount();
  m.area.failNext('getKeys', new Error('boom'));
  await m.lib.load();
  assert.equal(rows(m).length, 0);
  const alert = m.root.querySelector('.tj-alert--danger');
  assert.ok(alert);
  assert.match(textOf(alert), /تعذّرت قراءة المحفوظات/);
  assert.match(textOf(alert), /ST_READ_FAILED/);
  buttonNamed(alert, 'نسخ تقرير التشخيص').click();
  await settle();
  assert.equal(m.calls.diagnostics, 1);
  assert.deepEqual(m.calls.clipboard, ['{"tarjuman":"test"}']);
  assertNoTemplate(m, 'خطأ');
  await m.lib.load();
  assert.equal(rows(m).length, 3, 'إعادة المحاولة تنجح');
});

test('السعة: شريط رفيع بقيمته، وتحذير عند 80% ينسخ رسالته من الرمز', async () => {
  const seed = await mount();
  const bytes = await seed.area.getBytesInUse(null);
  const area = { areaOpts: { quotaBytes: Math.ceil(bytes / 0.85), initial: seed.area.dump() } };
  const m = await mount({ records: [], ...area });
  await m.lib.load();
  const meter = m.root.querySelector('.tj-meter');
  assert.ok(meter);
  assert.equal(meter.getAttribute('role'), 'meter');
  assert.ok(Number(meter.getAttribute('aria-valuenow')) >= 80);
  assert.ok(meter.classList.contains('tj-meter--warning'));
  assert.match(textOf(m.root.querySelector('.lib-quota__text')), /^المستخدم .* من .*$/);
  assert.match(textOf(m.root.querySelector('.lib-capacity-alert')), /اقتربت مساحة الحفظ من حدها \(80%\)/);
});

test('فتح الفيديو يفتح عنوان المشاهدة وحده، والتعديل يفتح المحرّر بمعرّفه، ومعطّل بسبب إن لم تكن ترجمة', async () => {
  const m = await mount({ records: [{ id: IDS[0], title: 'له ترجمة' }, { id: IDS[1], title: 'بلا ترجمة', arabic: false }] });
  await m.lib.load();
  buttonNamed(rowFor(m, IDS[0]), 'فتح الفيديو').click();
  buttonNamed(rowFor(m, IDS[0]), 'تعديل').click();
  await settle();
  assert.deepEqual(m.calls.tabs, [`https://www.youtube.com/watch?v=${IDS[0]}`]);
  assert.deepEqual(m.calls.pages, [['editor', { v: IDS[0] }]]);
  assert.equal(buttonNamed(rowFor(m, IDS[1]), 'تعديل'), null, 'بلا عربية: لا زر تعديل معطّل، بل «رفع ترجمة» مكانه');
  assert.ok(buttonNamed(rowFor(m, IDS[1]), 'رفع ترجمة'), 'بلا عربية: «رفع ترجمة» الإجراء الرئيسي');
  assert.ok(buttonNamed(rowFor(m, IDS[0]), 'فتح الفيديو'), 'فتح الفيديو زر أيقوني باسم وصول');
  const slots = findAll(rowFor(m, IDS[0]), (e) => e.getAttribute('role') === 'radio' && e.classList.contains('tj-slots__slot'));
  assert.deepEqual(slots.map((s) => [s.textContent, s.getAttribute('aria-checked')]), [['1', 'true']], 'ترجمة واحدة: لا خانات فارغة');
  assert.equal(rowFor(m, IDS[0]).querySelector('.tj-slots').hidden, true, 'ترجمة واحدة: المحدد مخفي كله (لا «1» وحده)');
  const none = findAll(rowFor(m, IDS[1]), (e) => e.getAttribute('role') === 'radio' && e.classList.contains('tj-slots__slot'));
  assert.equal(none.length, 0, 'بلا عربية: لا خانات');
  assert.equal(rowFor(m, IDS[1]).querySelector('.tj-slots').hidden, true);
});

test('رقائق التصفية بأعدادها: مترجمة وبانتظار الترجمة ومعدّلة وتحذيرات، والقسم الفارغ يعرض «عرض الكل»', async () => {
  const m = await mount({ records: [{ id: IDS[0], title: 'أ' }, { id: IDS[1], title: 'ب', arabic: false }, { id: IDS[2], title: 'ج' }] });
  await m.lib.load();
  const chip = (f) => findAll(m.root, (e) => e.classList.contains('tj-chip') && e.getAttribute('data-filter') === f)[0];
  const count = (f) => textOf(chip(f).querySelector('.tj-chip__count'));
  assert.deepEqual(['all', 'translated', 'awaiting', 'edited', 'warnings'].map(count), ['3', '2', '1', '0', '0']);
  assert.equal(chip('all').getAttribute('aria-label'), 'الكل (3)');
  assert.equal(chip('awaiting').getAttribute('aria-label'), 'بانتظار الترجمة (1)');
  assert.equal(chip('all').getAttribute('aria-pressed'), 'true');
  chip('awaiting').click();
  assert.equal(chip('awaiting').getAttribute('aria-pressed'), 'true');
  assert.equal(chip('all').getAttribute('aria-pressed'), 'false');
  assert.deepEqual(rowTitles(m), ['ب']);
  chip('edited').click();
  assert.equal(rows(m).length, 0);
  assert.equal(textOf(m.root.querySelector('.tj-empty__title')), 'لا فيديوهات في هذا القسم');
  buttonNamed(m.root, 'عرض الكل').click();
  assert.equal(rows(m).length, 3);
  assert.equal(chip('all').getAttribute('aria-pressed'), 'true');
});

test('حالة الصفحة في جزء العنوان: البحث والقسم والترتيب تُقرأ منه وتُكتب إليه، والصف المقصود (v) يُبرَز بعد الرجوع', async () => {
  let hash = '#f=awaiting&s=title&v=BBBBBBBBBBB';
  const nav = { get: () => hash, set: (h) => { hash = h; } };
  const m = await mount({ records: [{ id: IDS[0], title: 'أ' }, { id: IDS[1], title: 'ب', arabic: false }], env: { nav } });
  await m.lib.load();
  assert.equal(m.lib.state.filter, 'awaiting');
  assert.equal(m.lib.state.order, 'title');
  assert.equal(m.root.querySelector('select.lib-sort__select').value, 'title');
  assert.deepEqual(rowTitles(m), ['ب']);
  assert.ok(rowFor(m, IDS[1]).classList.contains('lib-row--target'), 'الصف المقصود مُبرَز');
  assert.equal(hash, '#f=awaiting&s=title', 'بعد الإبراز يُحذف v من العنوان ويبقى البحث والقسم والترتيب');
  const search = m.root.querySelector('input.lib-search__input');
  search.value = 'ب';
  search.dispatchEvent({ type: 'input' });
  assert.equal(hash, '#q=%D8%A8&f=awaiting&s=title');
});

test('«نسخ»: يكتب تعليمات كل صف بعنوانه ورابطه حرفيًا، بلا عرض لنصها، و«تم النسخ» ثم يعود بعد ثانيتين', async () => {
  const m = await mount({ records: [{ id: IDS[0], title: 'الأول — عنوان' }, { id: IDS[1], title: 'How Browsers Render Arabic Text' }] });
  await m.lib.load();
  const first = buttonNamed(rowFor(m, IDS[0]), 'نسخ التعليمات: الأول — عنوان');
  const second = buttonNamed(rowFor(m, IDS[1]), 'نسخ التعليمات: How Browsers Render Arabic Text');
  assert.ok(first && second);
  assert.equal(textOf(first), 'نسخ التعليمات');
  assert.equal(first.getAttribute('data-state'), 'idle');

  first.click();
  second.click();
  await settle();
  assert.deepEqual(m.calls.clipboard, [
    instructions({ videoId: IDS[0], title: 'الأول — عنوان' }),
    instructions({ videoId: IDS[1], title: 'How Browsers Render Arabic Text' }),
  ]);
  assert.ok(m.calls.clipboard[0].includes(`https://www.youtube.com/watch?v=${IDS[0]}`));
  assert.ok(m.calls.clipboard[1].includes('- العنوان: How Browsers Render Arabic Text\n'));
  assert.notEqual(m.calls.clipboard[0], m.calls.clipboard[1]);
  assert.equal(textOf(first), 'تم النسخ');
  assert.equal(first.getAttribute('data-state'), 'success');
  assertNoTemplate(m, 'تم النسخ');

  await m.clock.runAll();
  assert.equal(textOf(first), 'نسخ التعليمات');
  assert.equal(first.getAttribute('data-state'), 'idle');
  assert.equal(m.lib.toaster.live.textContent, 'تم نسخ تعليمات الترجمة. ‹How Browsers Render Arabic Text›', 'إعلان لقارئ الشاشة بعنوان الصف');
  assertNoTemplate(m, 'عادي بعد النسخ');
});

test('«نسخ»: التلميح بنصه المعتمد مرتبط بالزر (للمرور والتركيز)، وفيديو بلا عنوان يعمل بعنوان «غير متوفر»', async () => {
  const m = await mount({ records: [{ id: IDS[0], title: null }] });
  await m.lib.load();
  const button = buttonNamed(m.root, `نسخ التعليمات: ${IDS[0]}`);
  const tip = m.root.querySelector('.lib-copy__tip');
  assert.equal(textOf(tip), COPY_TIP);
  assert.equal(COPY_TIP, 'ينسخ تعليمات الترجمة لترفقها مع ملف SRT.');
  assert.equal(tip.getAttribute('role'), 'tooltip');
  assert.equal(button.getAttribute('aria-describedby'), tip.id);
  button.click();
  await settle();
  assert.ok(m.calls.clipboard[0].includes('- العنوان: غير متوفر\n'));
  assert.ok(m.calls.clipboard[0].includes(`- الرابط: https://www.youtube.com/watch?v=${IDS[0]}\n`));
});

test('«نسخ» عند رفض الحافظة: «أعد المحاولة» ورسالة عابرة وإعلان، وبلا أي نص للتعليمات، ثم ينجح بإعادة الضغط', async () => {
  let reject = true;
  const m = await mount({
    records: [{ id: IDS[0], title: 'عنوان' }],
    env: { clipboardWrite: async (text) => { if (reject) throw new DOMException('Document is not focused.', 'NotAllowedError'); m.calls.clipboard.push(text); } },
  });
  await m.lib.load();
  const button = buttonNamed(m.root, 'نسخ التعليمات: عنوان');
  button.click();
  await settle();
  assert.equal(textOf(button), 'أعد المحاولة');
  assert.equal(button.getAttribute('data-state'), 'error');
  const toast = m.root.querySelector('.tj-toast--danger');
  assert.equal(textOf(toast), 'تعذّر النسخ إلى الحافظة. أعد المحاولة.');
  await m.clock.runAll();
  assert.equal(textOf(m.lib.toaster.live), 'تعذّر النسخ إلى الحافظة. أعد المحاولة.');
  assertNoTemplate(m, 'فشل النسخ');
  reject = false;
  button.click();
  await settle();
  assert.equal(textOf(button), 'تم النسخ');
  assert.equal(m.calls.clipboard.length, 1);
});

test('نسخ المعرّف: يكتب المعرّف وحده', async () => {
  const m = await mount({ records: [{ id: IDS[0], title: 'عنوان' }] });
  await m.lib.load();
  buttonNamed(m.root, `نسخ معرّف الفيديو ${IDS[0]}`).click();
  await settle();
  assert.deepEqual(m.calls.clipboard, [IDS[0]]);
});

test('تصدير SRT من «المزيد»: قائمة بأسباب التعطيل، والعربية الحالية تنزل باسمها دون سؤال عند إزاحة صفر', async () => {
  const m = await mount({ records: [{ id: IDS[0], title: 'عنوان' }] });
  await m.lib.load();
  const menuButton = buttonNamed(m.root, 'المزيد: عنوان');
  assert.equal(menuButton.getAttribute('aria-expanded'), 'false');
  menuButton.click();
  assert.equal(menuButton.getAttribute('aria-expanded'), 'true');
  const items = menuItems(menuButton);
  assert.deepEqual(items.map((i) => textOf(i.querySelector('.tj-menu__label'))), ['الترجمات…', 'العربية — النسخة الحالية', 'العربية — الأصل المستورد', 'الإنجليزية — المستخرجة', 'نص دراسي…', 'رفع ترجمة…', 'حذف الترجمة…']);
  assert.equal(items[2].getAttribute('aria-disabled'), 'true');
  assert.equal(textOf(items[2].querySelector('.tj-menu__hint')), 'لم تُعدَّل الترجمة، فالأصل المستورد هو النسخة الحالية.');
  assert.ok(items.at(-1).classList.contains('tj-menu__item--danger'), 'الحذف بلون الخطر');
  items[2].click();
  await settle();
  assert.equal(m.calls.downloads.length, 0, 'المعطّل لا ينزّل');
  items[1].click();
  await settle();
  assert.deepEqual(m.calls.downloads.map((f) => f.name), [`${IDS[0]}.ar.srt`]);
  assert.equal(menuButton.getAttribute('aria-expanded'), 'false', 'القائمة تُغلق بالاختيار');
  assert.equal(m.calls.confirms.length, 0);
  menuButton.click();
  menuItems(menuButton)[3].click();
  await settle();
  assert.equal(m.calls.downloads[1].name, `${IDS[0]}.en.manual.normal.srt`);
  assert.ok(m.root.querySelector('.tj-toast--success'));
});

test('تصدير العربية بإزاحة يسأل عن التوقيت بقيمتها، والإلغاء لا ينزّل', async () => {
  const m = await mount({ records: [{ id: IDS[0], title: 'عنوان', offset: 500 }] });
  await m.lib.load();
  const exportBtn = buttonNamed(m.root, 'المزيد: عنوان');
  exportBtn.click();
  m.answers.push(false);
  menuItems(exportBtn)[1].click();
  await settle();
  assert.equal(m.calls.confirms.length, 1);
  assert.equal(m.calls.confirms[0].title, 'توقيت الملف المصدَّر');
  assert.match(m.calls.confirms[0].body, /\u2066\+0\.5\u2069 ث/);
  assert.equal(m.calls.downloads.length, 0);

  exportBtn.click();
  m.answers.push(true);
  menuItems(exportBtn)[1].click();
  await settle();
  assert.equal(m.calls.downloads.length, 1);
});

test('القائمة المنسدلة: Esc يغلق ويعيد التركيز، والنقر خارجها يغلق، وقائمة واحدة مفتوحة', async () => {
  const m = await mount({ records: [{ id: IDS[0], title: 'أ' }, { id: IDS[1], title: 'ب' }] });
  await m.lib.load();
  const a = buttonNamed(rowFor(m, IDS[0]), 'المزيد');
  const b = buttonNamed(rowFor(m, IDS[1]), 'المزيد');
  a.click();
  assert.equal(a.getAttribute('aria-expanded'), 'true');
  b.click();
  assert.equal(a.getAttribute('aria-expanded'), 'false', 'فتح الثانية يغلق الأولى');
  assert.equal(b.getAttribute('aria-expanded'), 'true');
  m.doc.activeElement.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(b.getAttribute('aria-expanded'), 'false');
  assert.equal(m.doc.activeElement, b);
  a.click();
  m.doc.body.dispatchEvent({ type: 'pointerdown' });
  assert.equal(a.getAttribute('aria-expanded'), 'false');
});

test('الحذف: حوار يسمّي الفيديو ويحدد ما يُحذف، والإلغاء لا يمسّ شيئًا، و«العربية فقط» يبقي الإنجليزي', async () => {
  const m = await mount({ records: [{ id: IDS[0], title: 'عنوان' }] });
  await m.lib.load();
  const more = buttonNamed(m.root, 'المزيد: عنوان');
  more.click();
  m.answers.push(false);
  deleteItem(more).click();
  await settle();
  const dialog = m.calls.confirms[0];
  assert.equal(dialog.title, `حذف ترجمة "${iso('عنوان')}"؟`);
  assert.equal(dialog.body, 'لا يمكن التراجع عن الحذف.');
  assert.equal(dialog.confirmLabel, 'حذف');
  assert.equal(dialog.tone, 'danger');
  assert.deepEqual(findAll(dialog.content, (e) => e.classList.contains('tj-choice__label')).map(textOf), ['الترجمة النشطة وحدها (تبقى الأخرى والمسار الإنجليزي والبصمة)', 'كل بيانات هذا الفيديو']);
  assert.equal((await m.store.getVideo(IDS[0])).arabic !== null, true, 'الإلغاء لم يحذف');

  more.click();
  m.answers.push(true);
  deleteItem(more).click();
  await settle();
  const after = await m.store.getVideo(IDS[0]);
  assert.equal(after.arabic, null);
  assert.equal(after.english.length, 1);
  assert.ok(m.root.querySelector('.tj-toast--success'));
  assert.ok(textOf(rows(m)[0]).includes('EN يدوي'));
  assert.equal(rows(m)[0].querySelectorAll('.tj-pill').filter((p) => textOf(p).startsWith('AR')).length, 0, 'القائمة تحدّثت');
});

test('الحذف: «كل بيانات هذا الفيديو» يزيل الصف، والفيديو بلا عربية يعرض خيار الكل وحده', async () => {
  const m = await mount({ records: [{ id: IDS[0], title: 'أ' }, { id: IDS[1], title: 'ب', arabic: false }] });
  await m.lib.load();
  const moreB = buttonNamed(rowFor(m, IDS[1]), 'المزيد');
  moreB.click();
  m.answers.push(true);
  deleteItem(moreB).click();
  await settle();
  const only = m.calls.confirms[0];
  assert.equal(only.title, `حذف بيانات "${iso('ب')}"؟`);
  assert.equal(findAll(only.content, (e) => e.tagName === 'input').length, 1, 'خيار واحد: الكل');
  assert.equal(await m.store.getVideo(IDS[1]), null);
  assert.equal(rows(m).length, 1);

  // لفيديو بعربية خياران؛ والاختيار الثاني يحذف كل شيء.
  const moreA = buttonNamed(rowFor(m, IDS[0]), 'المزيد');
  moreA.click();
  m.answers.push(true);
  deleteItem(moreA).click();
  await settle();
  const dialog = m.calls.confirms[1];
  const inputs = findAll(dialog.content, (e) => e.tagName === 'input');
  assert.equal(inputs.length, 2);
});

test('الحذف: اختيار الخيار الثاني يمرَّر إلى التنفيذ فيُحذف كل سجل الفيديو', async () => {
  let m;
  m = await mount({
    records: [{ id: IDS[0], title: 'أ' }],
    env: {
      confirm: async (o) => {
        const inputs = findAll(o.content, (e) => e.tagName === 'input');
        inputs[1].checked = true;
        inputs[1].dispatchEvent({ type: 'change' });
        return true;
      },
    },
  });
  await m.lib.load();
  const moreC = buttonNamed(m.root, 'المزيد');
  moreC.click();
  deleteItem(moreC).click();
  await settle();
  assert.equal(await m.store.getVideo(IDS[0]), null);
  assert.equal(rows(m).length, 0);
  assert.equal(textOf(m.root.querySelector('.tj-empty__title')), 'لا ترجمات محفوظة بعد');
});

test('الرفع: حوار الفحص الكامل — الافتراضي أول خانة فارغة، والإلغاء لا يغيّر بصمة التخزين، والحفظ يملأ الخانة 2 ويفعّلها', async () => {
  const text = writeSrt(makeCues(5).map((c) => ({ ...c, text: `جديد ${c.n}` })));
  const picked = [new File([text], 'جديد.ar.srt', { type: 'text/plain' })];
  const m = await mount({ records: [{ id: IDS[0], title: 'عنوان', offset: 1000 }], env: { pickFiles: async () => picked } });
  await m.lib.load();
  await m.area.flush();
  const before = JSON.stringify(m.area.dump());
  m.answers.push(false);
  clickReplace(m);
  await settle();
  const dialog = m.calls.confirms[0];
  assert.equal(dialog.title, `رفع ترجمة لـ"${iso('عنوان')}"`);
  assert.equal(dialog.confirmLabel, 'حفظ', 'الهدف الافتراضي فارغ: حفظ لا استبدال');
  const body = allText(dialog.content);
  assert.match(body, /مطابق للأصل ✓/);
  assert.match(body, /جديد\.ar\.srt/);
  assert.match(body, /5 مقاطع/);
  assert.match(body, /الترجمة 1 — .*\(نشطة\)/);
  // لا خانة فارغة بأرقامها (تدقيق 5fedcb9، CL-005): المحفوظة ثم «ترجمة جديدة» لأول فارغة.
  assert.doesNotMatch(body, /فارغة/);
  assert.match(body, /ترجمة جديدة/);
  const targets = findAll(dialog.content, (e) => e.tagName === 'input' && e.getAttribute('type') === 'radio');
  assert.deepEqual(targets.map((t) => t.getAttribute('value')), ['1', '2'], 'خياران: الأولى المحفوظة، والجديدة في 2');
  assert.deepEqual(targets.filter((t) => t.checked).map((t) => t.getAttribute('value')), ['2']);
  await m.area.flush();
  assert.equal(JSON.stringify(m.area.dump()), before, 'الإلغاء لا يغيّر بصمة التخزين');

  m.answers.push(true);
  clickReplace(m);
  await settle(10);
  const b = await m.store.getBundle(IDS[0]);
  assert.equal(b.active, 2, 'الفارغة تُفعَّل (Q16)');
  assert.equal(b.slots[1].track.original[0].text, 'جديد 1');
  assert.equal(b.slots[0].track.original[0].text, 'سطر 1', 'الأولى باقية');
  assert.equal(b.slots[0].offsetMs, 1000, 'إزاحة الأولى باقية');
  assert.equal(textOf(m.root.querySelector('.tj-toast--success')), 'حُفظت الترجمة في الخانة 2.');
  const picker = rows(m)[0].querySelector('.tj-slots');
  assert.deepEqual(picker.querySelectorAll('button').map((x) => [x.textContent, x.getAttribute('aria-checked')]), [['1', 'false'], ['2', 'true']], 'صار خيارين بعد الإضافة، والجديدة نشطة');
  assert.equal(picker.hidden, false);
});

test('الاستبدال: اختيار خانة ممتلئة يعرض أعداد الفروق وجدولها وتصفير الإزاحة، والتأكيد يستبدل ويحفظ السابقة', async () => {
  const incoming = makeCues(5).map((c) => ({ ...c, text: c.n === 2 ? 'جديد 2' : `سطر ${c.n}` }));
  const m = await mount({
    records: [{ id: IDS[0], title: 'عنوان', offset: 1000 }],
    env: {
      pickFiles: async () => [new File([writeSrt(incoming)], 'جديد.ar.srt')],
      confirm: async (o) => {
        m.calls.confirms.push(o);
        const one = findAll(o.content, (e) => e.tagName === 'input' && e.getAttribute('value') === '1')[0];
        one.checked = true;
        one.dispatchEvent({ type: 'change' });
        const body = allText(o.content);
        assert.match(body, /يتغير النص في 1 · التوقيت في 0 · يُضاف 0 · يُحذف 0 · بلا تغيير 4/);
        assert.match(body, /جدول الفروق \(1\)/);
        assert.match(body, /ستُصفَّر إزاحة العرض \(\u2066\+1\.0\u2069 ث\)/);
        assert.match(body, /تُحفظ الترجمة المستبدلة نسخةً سابقة/);
        const cells = findAll(o.content, (e) => e.tagName === 'td').map(textOf);
        assert.deepEqual(cells, ['2', 'سطر 2', 'جديد 2']);
        return true;
      },
    },
  });
  await m.lib.load();
  clickReplace(m);
  await settle(10);
  assert.equal(m.calls.confirms.length, 1);
  const b = await m.store.getBundle(IDS[0]);
  assert.equal(b.active, 1);
  assert.equal(b.record.arabic.original[1].text, 'جديد 2');
  assert.equal(b.record.view.displayOffsetMs, 0);
  assert.equal(b.previous.from, 1);
  assert.equal(b.previous.track.original[1].text, 'سطر 2');
  assert.equal(textOf(m.root.querySelector('.tj-toast--success')), 'استُبدلت الترجمة 1، وحُفظت المستبدلة نسخةً سابقة.');
  assert.ok(!textOf(rows(m)[0]).includes('الإزاحة'), 'الصف بلا إزاحة بعد الاستبدال');
});

test('«إبقاء تعديلاتي»: يُعرض ما سيُفقد، ومتاح بشرط المحاذاة فيبقي التعديل فوق الأصل الجديد، ومعطّل بسببه إن لم تتحاذَ', async () => {
  const original = makeCues(5);
  const edited = original.map((c) => (c.n === 2 ? { ...c, text: 'سطر 2 بعد تعديلي' } : c));
  const record = withArabicEdit(videoRecord({ videoId: IDS[0], cues: original }), { cues: edited }, NOW);
  const aligned = original.map((c) => (c.n === 4 ? { ...c, text: 'جديد 4' } : c));
  const shifted = makeCues(3, { startMs: 500000, text: (i) => `بعيد ${i}` });
  let file = aligned;
  let keep = true;
  const seen = [];
  const m = await mount({
    records: [{ id: IDS[0], title: 'عنوان', record }],
    env: {
      pickFiles: async () => [new File([writeSrt(file)], 'x.ar.srt')],
      confirm: async (o) => {
        const one = findAll(o.content, (e) => e.tagName === 'input' && e.getAttribute('value') === '1')[0];
        one.checked = true;
        one.dispatchEvent({ type: 'change' });
        const box = findAll(o.content, (e) => e.tagName === 'input' && e.getAttribute('type') === 'checkbox')[0];
        seen.push({ text: allText(o.content), disabled: box.disabled, title: box.parentNode.title });
        if (keep && !box.disabled) box.checked = true;
        return !box.disabled;
      },
    },
  });
  await m.lib.load();
  clickReplace(m);
  await settle(10);
  assert.match(seen[0].text, /سيُستبدل تعديل يدوي واحد/);
  assert.equal(seen[0].disabled, false);
  const b = await m.store.getBundle(IDS[0]);
  assert.equal(b.record.arabic.original[3].text, 'جديد 4', 'الأصل الجديد');
  assert.equal(b.record.arabic.current[1].text, 'سطر 2 بعد تعديلي', 'تعديلي باقٍ');
  assert.equal(b.record.arabic.current[3].text, 'جديد 4', 'وتغيير الجديد مطبَّق');

  file = shifted;
  clickReplace(m);
  await settle(10);
  assert.equal(seen[1].disabled, true, 'لا محاذاة: معطّل');
  assert.match(seen[1].title, /لا يمكن إبقاء تعديلاتك/);
  assert.match(seen[1].text, /لا يمكن إبقاء تعديلاتك/, 'السبب في اسم الوصول');
});

test('المرجع عند تعدد التصديرات: قائمة بالمقترح «الأقرب» و«غير مؤكد» عند التقارب، وتغييره يعيد المقارنة ويُحفظ مع الخانة', async () => {
  const track = englishTrack();
  const fp1 = fingerprint({ track, id: 'fp_test000001' });
  const fp2 = fingerprint({ track, id: 'fp_test000002', mode: 'long' });
  const record = { ...videoRecord({ videoId: IDS[0] }), english: [track], fingerprints: [fp1, fp2] };
  record.arabic.fingerprintId = fp1.id;
  record.arabic.comparison.fingerprintId = fp1.id;
  const m = await mount({
    records: [{ id: IDS[0], title: 'عنوان', record }],
    env: {
      pickFiles: async () => [new File([writeSrt(makeCues(5).map((c) => ({ ...c, text: `جديد ${c.n}` })))], 'x.ar.srt')],
      confirm: async (o) => {
        m.calls.confirms.push(o);
        const select = findAll(o.content, (e) => e.tagName === 'select')[0];
        const labels = select.childNodes.map(textOf);
        assert.equal(labels.length, 3, 'البصمتان و«بلا مرجع»');
        assert.ok(labels.some((l) => l.endsWith('— الأقرب')));
        assert.match(allText(o.content), /غير مؤكد/);
        select.value = '';
        select.dispatchEvent({ type: 'change' });
        assert.match(allText(o.content), /لا بصمة للمقارنة/);
        return true;
      },
    },
  });
  await m.lib.load();
  clickReplace(m);
  await settle(10);
  const b = await m.store.getBundle(IDS[0]);
  assert.equal(b.slots[1].track.fingerprintId, null, 'المرجع المختار محفوظ مع الخانة');
});

test('تنبيه الاسم: ملف باسم فيديو آخر محفوظ يُنبَّه إليه بعنوانه مقصوصًا', async () => {
  const m = await mount({
    records: [{ id: IDS[0], title: 'عنوان' }, { id: IDS[1], title: 'محاضرة طويلة جدًا عن النماذج اللغوية وتقنيات الترجمة الآلية' }],
    env: { pickFiles: async () => [new File([writeSrt(makeCues(5))], `${IDS[1]}.ar.srt`)] },
  });
  await m.lib.load();
  m.answers.push(false);
  clickReplace(m, 'عنوان');
  await settle(10);
  const body = allText(m.calls.confirms[0].content);
  assert.match(body, /الاسم يشير إلى فيديو آخر: \u2068محاضرة طويلة جدًا عن النماذج اللغوية وت…\u2069/, 'العنوان معزول (CL-002)');
});

test('الاستبدال: إلغاء المنتقي لا يفعل شيئًا، وملف تالف يعرض رسالة خطأ ولا يكتب', async () => {
  let picked = null;
  const m = await mount({ records: [{ id: IDS[0], title: 'عنوان' }], env: { pickFiles: async () => picked } });
  await m.lib.load();
  clickReplace(m);
  await settle();
  assert.equal(m.calls.confirms.length, 0);
  picked = [new File(['ليس SRT'], 'x.srt', { type: 'text/plain' })];
  clickReplace(m);
  await settle();
  assert.equal(m.calls.confirms.length, 0, 'لا حوار لملف تالف');
  assert.match(textOf(m.root.querySelector('.tj-toast--danger')), /SRT|مقطع/);
  assert.equal((await m.store.getVideo(IDS[0])).rev, 1);
});

test('الرفع: تغيّر الحزمة قبل التأكيد يظهر ST_CONFLICT ولا يُكتب شيء', async () => {
  const text = writeSrt(makeCues(5).map((c) => ({ ...c, text: `جديد ${c.n}` })));
  let m;
  m = await mount({
    records: [{ id: IDS[0], title: 'عنوان' }],
    env: {
      pickFiles: async () => [new File([text], 'x.ar.srt')],
      // يتغيّر السجل من «سياق آخر» أثناء ظهور الحوار.
      confirm: async () => {
        await m.store.updateVideo(IDS[0], (r) => withView(r, { displayOffsetMs: 300 }, NOW));
        return true;
      },
    },
  });
  await m.lib.load();
  clickReplace(m);
  await settle(10);
  assert.match(textOf(m.root.querySelector('.tj-toast--danger')), /تغيّر هذا السجل من مكان آخر/);
  const after = await m.store.getVideo(IDS[0]);
  assert.equal(after.arabic.original[0].text, 'سطر 1', 'لم يُستبدل شيء');
  assert.equal(after.view.displayOffsetMs, 300);
});

test('تغيّر التخزين من سياق آخر يحدّث القائمة بعد مهلة قصيرة', async () => {
  const m = await mount({ records: [{ id: IDS[0], title: 'أ' }] });
  await m.lib.load();
  assert.equal(rows(m).length, 1);
  await m.store.updateVideo(IDS[1], () => ({ ...videoRecord({ videoId: IDS[1] }), title: 'جديد من تبويب آخر' }));
  await m.area.flush();
  assert.ok(m.clock.pending().length > 0, 'مؤقت إعادة القراءة');
  await m.clock.runAll();
  await settle(10);
  assert.equal(rows(m).length, 2);
  m.lib.dispose();
});

test('بعد اختيار بند من القائمة يعود التركيز إلى زرها (فيعيده الحوار إليه عند إغلاقه)', async () => {
  const m = await mount({ records: [{ id: IDS[0], title: 'عنوان' }] });
  await m.lib.load();
  const more = buttonNamed(m.root, 'المزيد: عنوان');
  more.click();
  assert.notEqual(m.doc.activeElement, more, 'التركيز على البند الأول');
  menuItems(more)[1].click();
  await settle();
  assert.equal(m.doc.activeElement, more);
});

test('كل رسالة عابرة تُعلَن لقارئ الشاشة بنصها (نجاح التصدير والفشل)', async () => {
  const m = await mount({ records: [{ id: IDS[0], title: 'عنوان' }] });
  await m.lib.load();
  const exportBtn = buttonNamed(m.root, 'المزيد: عنوان');
  exportBtn.click();
  menuItems(exportBtn)[3].click();
  await settle();
  assert.equal(textOf(m.root.querySelector('.tj-toast--success')), 'بدأ تنزيل الملف.');
  await m.clock.runAll();
  assert.equal(textOf(m.lib.toaster.live), 'بدأ تنزيل الملف.');
  m.lib.toaster.show('فشل ما', 'danger');
  await m.clock.runAll();
  assert.equal(textOf(m.lib.toaster.live), 'فشل ما');
});

test('إخفاق حفظ بصمة التصدير بعد نزول الملف يظهر تنبيهًا لا خطأً', async () => {
  const m = await mount({ records: [{ id: IDS[0], title: 'عنوان' }] });
  await m.lib.load();
  const exportBtn = buttonNamed(m.root, 'المزيد: عنوان');
  exportBtn.click();
  m.area.failNext('set', new Error('boom'));
  menuItems(exportBtn)[3].click();
  await settle();
  assert.equal(m.calls.downloads.length, 1);
  assert.equal(m.root.querySelector('.tj-toast--danger'), null);
  assert.match(textOf(m.root.querySelector('.tj-toast--info')), /نُزّل الملف، لكن تعذّر حفظ بصمته/);
});

test('تغيّر الإعدادات من صفحة أخرى لا يعيد بناء القائمة (يحفظ التركيز وحالة «تم النسخ»)', async () => {
  const m = await mount({ records: [{ id: IDS[0], title: 'عنوان' }] });
  await m.lib.load();
  const copyBtn = buttonNamed(m.root, 'نسخ التعليمات: عنوان');
  copyBtn.click();
  await settle();
  assert.equal(copyBtn.getAttribute('data-state'), 'success');
  const pendingBefore = m.clock.pending().length;
  await m.store.setSettings({ appearance: { scale: 120 } });
  await m.area.flush();
  assert.equal(m.clock.pending().length, pendingBefore, 'لا مؤقت إعادة قراءة جديد لتغيّر الإعدادات');
  assert.equal(buttonNamed(m.root, 'تم النسخ: عنوان'), copyBtn, 'العنصر نفسه لم يُستبدل (واسمه يبدأ بالظاهر)');
  assert.equal(copyBtn.getAttribute('data-state'), 'success');
});

test('نص بحث المستخدم داخل عنوان «لا نتائج» معزول الاتجاه (what? لا تنقلب علامة الاستفهام)', async () => {
  const m = await mount({ records: [{ id: IDS[0], title: 'عنوان' }] });
  await m.lib.load();
  const search = m.root.querySelector('input.lib-search__input');
  search.value = 'what?';
  search.dispatchEvent({ type: 'input' });
  assert.equal(textOf(m.root.querySelector('.tj-empty__title')), `لا نتائج لـ«${iso('what?')}»`);
});

test('تدقيق 5fedcb9 (GM-016.3): الصف المقصود بعد الرجوع (#v=…) يُبرَز حين تظهر الصفحة لا في الخلفية، ولو كان بعد أول 50', async () => {
  const ids = Array.from({ length: 60 }, (_, i) => `vid${String(i).padStart(8, '0')}`);
  const target = ids[0]; // الأقدم تعديلًا: آخر القائمة بعد الخمسين الأولى
  const nav = { get: () => `#v=${target}`, set() {} };
  const { lib, doc, root } = await mount({ records: ids.map((id, i) => ({ id, title: `فيديو ${i}` })), env: { nav } });
  doc.visibilityState = 'hidden';
  await lib.load();
  assert.equal(root.querySelector('.lib-row--target'), null, 'لا إبراز والصفحة مخفية');
  assert.equal(lib.state.focusId, target, 'لا يُستهلك في الخلفية');
  doc.visibilityState = 'visible';
  for (const fn of doc._listeners.get('visibilitychange') ?? []) fn({ type: 'visibilitychange' });
  const row = root.querySelector('.lib-row--target');
  assert.ok(row, 'أُبرز حين ظهرت الصفحة');
  assert.equal(row.getAttribute('data-video'), target, 'ولو كان بعد أول 50');
  assert.equal(lib.state.focusId, null);
});

test('تدقيق 5fedcb9 (CL-007): اسم الوصول لأزرار الصف يبدأ بنصها الظاهر في كل حالة (WCAG 2.5.3)', async () => {
  const m = await mount({ records: [{ id: IDS[0], title: 'عنوان' }, { id: IDS[1], title: 'بلا عربية', arabic: false }] });
  await m.lib.load();
  const rowsHost = m.root.querySelectorAll('li[data-video]');
  assert.equal(rowsHost.length, 2);
  for (const b of rowsHost.flatMap((r) => findAll(r, (e) => e.tagName === 'button' && e.getAttribute('aria-label') && textOf(e)))) {
    // يحوي الاسم النص الظاهر دائمًا، ويبدأ به لأفعال الصف (محدد الترجمات أرقامه «الترجمة 1» فيحوي الرقم).
    assert.ok(b.getAttribute('aria-label').includes(textOf(b)), `${textOf(b)} ← ${b.getAttribute('aria-label')}`);
    if (b.getAttribute('role') !== 'radio') assert.ok(b.getAttribute('aria-label').startsWith(textOf(b)), `${textOf(b)} ← ${b.getAttribute('aria-label')}`);
  }
  const copy = buttonNamed(m.root, 'نسخ التعليمات: عنوان');
  copy.click();
  await settle();
  assert.equal(textOf(copy), 'تم النسخ');
  assert.ok(copy.getAttribute('aria-label').startsWith('تم النسخ'));
});

test('تدقيق 5fedcb9 (CL-005): بلا ترجمة محفوظة سطر «تُحفظ ترجمةً جديدة» بلا محدد ولا «فارغة»؛ و«رفع إليها» يربط الجديدة بالخانة المطلوبة', async () => {
  const { targetOptions } = await import('../../../../src/pages/library/model.js');
  const { sampleBundle } = await import('../../../helpers/fixtures-v2.js');
  const empty = { ...sampleBundle(), active: null, slots: [1, 2, 3].map((n) => ({ n, name: null, track: null, offsetMs: 0, marks: [], position: null })) };
  assert.deepEqual(targetOptions(empty).map((o) => [o.n, o.label]), [[1, 'ترجمة جديدة']]);
  const b = sampleBundle(); // 1 و2 ممتلئتان، 3 فارغة
  assert.deepEqual(targetOptions(b).map((o) => [o.n, o.filled]), [[1, true], [2, true], [3, false]]);
  assert.equal(targetOptions(b, 3).at(-1).n, 3);
  const text = writeSrt(makeCues(5).map((c) => ({ ...c, text: `جديد ${c.n}` })));
  const m = await mount({ records: [{ id: IDS[0], title: 'عنوان', arabic: false }], env: { pickFiles: async () => [new File([text], 'جديد.ar.srt', { type: 'text/plain' })] } });
  await m.lib.load();
  m.answers.push(false);
  const up = buttonNamed(rowFor(m, IDS[0]), 'رفع ترجمة');
  up.click();
  await settle();
  const body = allText(m.calls.confirms[0].content);
  assert.match(body, /تُحفظ ترجمةً جديدة/);
  assert.doesNotMatch(body, /فارغة/);
  assert.equal(findAll(m.calls.confirms[0].content, (e) => e.tagName === 'input' && e.getAttribute('type') === 'radio').length, 0);
});
