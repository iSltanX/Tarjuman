// واجهة المحفوظات بـDOM وهمي فوق تخزين حقيقي بمحاكاة (P7-AC2/AC3/AC6/AC7، والهوية): الحالات الخمس، والبحث والترتيب والعرض
// التدريجي، وأوامر الصف (تحرير وفتح وتوسيع و«المزيد»)، و«نسخ التعليمات» من «المزيد» وبعدم ظهور نص التعليمات في أي عنصر أو
// سمة في أي حالة. وصورة الفيديو ومدتها وشرائح الخانات والتجميع بالتاريخ والتوسيع في thumb.test.js وrow.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instructions } from '../../../../src/core/export/instructions.js';
import { createStore } from '../../../../src/core/store/index.js';
import { withArabicEdit, withView } from '../../../../src/core/model/index.js';
import { writeSrt } from '../../../../src/core/srt/writer.js';
import { createLibrary } from '../../../../src/pages/library/view.js';
import { t } from '../../../../src/i18n/index.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW, englishTrack, fingerprint, makeCues, videoRecord } from '../../../helpers/fixtures.js';
import { buttonNamed, findAll, newDocument, settle, textOf } from './fake-dom.js';

const CAPTION = t('library.view.caption');
const COPY_TIP = t('library.view.copyTip');

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
/** أيقونة «رفع ترجمة…» بجانب «تحرير» في الصف المسمّى (كانت بندًا في «المزيد» حتى 2026-11-10). */
const clickReplace = (m, name = 'عنوان') => {
  buttonNamed(m.root, `رفع ترجمة…: ${name}`).click();
};
/** حذف الترجمة النشطة (قبل الأخير) أو حذف بيانات الفيديو (الأخير). */
const deleteItem = (more, which = 'all') => menuItems(more).at(which === 'all' ? -1 : -2);
const rows = (m) => m.root.querySelectorAll('li.lib-row');
const rowTitles = (m) => rows(m).map((r) => textOf(r.querySelector('h3')));
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
  assert.equal(textOf(m.root.querySelector('.lib-count')), '3 فيديوهات · 3 ترجمات', 'عدد الفيديوهات والترجمات الموجودة فعلًا');
  assert.equal(textOf(m.root.querySelector('.lib-caption')), CAPTION);
  assert.match(textOf(m.root.querySelector('.lib-quota__text')), /^المساحة المستخدمة: \d+ ك\.ب$/);
  assert.equal(m.root.querySelectorAll('.tj-meter').length, 0, 'بلا حد ثابت لا شريط');
  assert.deepEqual(rowTitles(m).sort(), ['عنوان 1', 'عنوان 2', 'عنوان 3']);
  assertNoTemplate(m, 'ممتلئة');
});

test('الصف: العنوان والمعرّف وعُدّل منذ وعدد المقاطع وشارة واحدة، والتاريخ المطلق في التلميح', async () => {
  const m = await mount({ records: [{ id: IDS[0], title: 'محاضرة', offset: 500 }] });
  await m.lib.load();
  const row = rows(m)[0];
  const title = row.querySelector('h3');
  assert.equal(textOf(title), 'محاضرة');
  // الاتجاه: عنوان فيه حرف عربي RTL، والمعرّف معزول LTR بخط أحادي.
  assert.ok(title.classList.contains('tj-auto'));
  const idEl = findAll(row, (e) => e.tagName === 'bdi')[0];
  assert.equal(textOf(idEl), IDS[0]);
  assert.equal(idEl.dir, 'ltr');
  assert.ok(idEl.classList.contains('tj-ltr') && idEl.classList.contains('tj-mono'));
  const when = row.querySelector('.lib-row__when');
  assert.equal(textOf(when), 'عُدّل قبل 3 ساعات');
  assert.match(when.title, /2026/);
  assert.equal(textOf(row.querySelector('.lib-row__count')), '5 مقاطع', 'مقاطع الترجمة النشطة');
  assert.equal(row.querySelectorAll('.lib-row__sep').length, 3, 'المعرّف · الزوج · عُدّل · العدد');
  assert.equal(textOf(row.querySelector('.lib-row__pair')), 'الإنجليزية ← لغة غير محددة', 'الزوج اللغوي في الصف (AA3)؛ وما حُفظ بلا لغة «غير محددة»');
  const pills = findAll(row, (e) => e.classList.contains('tj-pill'));
  assert.deepEqual(pills.map(textOf), ['مترجمة'], 'شارة حالة واحدة');
  assert.ok(!textOf(row).includes('الإزاحة'), 'الإزاحة في بطاقات التوسيع لا في الصف');
});

test('بلا عنوان محفوظ: النص الخافت واسم الوصول بالمعرّف، والحالة الفارغة بخطواتها الثلاث', async () => {
  const m = await mount({ records: [{ id: IDS[0], title: null }] });
  await m.lib.load();
  const title = rows(m)[0].querySelector('h3');
  assert.equal(textOf(title), 'بلا عنوان محفوظ');
  assert.ok(title.classList.contains('lib-row__title--empty'));
  assert.ok(buttonNamed(rows(m)[0], `تحرير: ${IDS[0]}`), 'اسم الوصول يعود إلى المعرّف');

  const empty = await mount({ records: [] });
  await empty.lib.load();
  assert.equal(rows(empty).length, 0);
  assert.equal(textOf(empty.root.querySelector('.tj-empty__title')), 'لا ترجمات محفوظة بعد');
  assert.deepEqual(empty.root.querySelectorAll('.tj-empty__steps li').map(textOf), ['افتح فيديو على يوتيوب', 'اضغط زر التنزيل في شريط المشغّل', 'ارفع ترجمتك من زر الرفع في الشريط']);
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
  assert.ok(buttonNamed(m.root, 'عرض المزيد') === null);
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
  const alert = m.root.querySelector('.lib-state--error');
  assert.ok(alert);
  assert.equal(alert.getAttribute('role'), 'alert');
  assert.match(textOf(alert), /تعذّرت قراءة المحفوظات/);
  // تدقيق 7a66f91 (U03، CLA-L-5): لا «لم يُحذف شيء» في فشل قراءة لا حذف فيه، ولا تكرار لجملة الرسالة.
  assert.equal(textOf(alert).includes('لم يُحذف شيء'), false);
  assert.equal(textOf(alert).split('أعد تحميل الصفحة').length, 2, 'الرسالة مرة واحدة');
  assert.match(textOf(alert), /ST_READ_FAILED/);
  buttonNamed(alert, 'نسخ تقرير التشخيص').click();
  await settle();
  assert.equal(m.calls.diagnostics, 1);
  assert.deepEqual(m.calls.clipboard, ['{"tarjuman":"test"}']);
  assertNoTemplate(m, 'خطأ');
  buttonNamed(alert, 'إعادة المحاولة').click();
  await settle(10);
  assert.equal(rows(m).length, 3, 'زر إعادة المحاولة يعيد القراءة فتنجح');
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
  assert.match(textOf(m.root.querySelector('.lib-quota__text')), /^المساحة المستخدمة: .* من .*$/);
  assert.match(textOf(m.root.querySelector('.lib-capacity-alert')), /اقتربت مساحة الحفظ من حدها \(80%\)/);
});

test('فتح الفيديو يفتح عنوان المشاهدة وحده، و«تحرير» يفتح المحرّر بمعرّفه، وبلا ترجمة «رفع ترجمة» مكانه وحالة الأصل حقيقية', async () => {
  const m = await mount({ records: [{ id: IDS[0], title: 'له ترجمة' }, { id: IDS[1], title: 'بلا ترجمة', arabic: false }] });
  await m.lib.load();
  buttonNamed(rowFor(m, IDS[0]), 'فتح الفيديو').click();
  buttonNamed(rowFor(m, IDS[0]), 'تحرير').click();
  await settle();
  assert.deepEqual(m.calls.tabs, [`https://www.youtube.com/watch?v=${IDS[0]}`]);
  assert.deepEqual(m.calls.pages, [['editor', { v: IDS[0] }]]);
  assert.ok(buttonNamed(rowFor(m, IDS[1]), 'تحرير') === null, 'بلا عربية: لا زر تحرير معطّل، بل «رفع ترجمة» مكانه');
  const up = buttonNamed(rowFor(m, IDS[1]), 'رفع ترجمة');
  assert.ok(up && up.classList.contains('tj-btn--primary'), 'بلا عربية: «رفع ترجمة» الإجراء الرئيسي');
  assert.ok(buttonNamed(rowFor(m, IDS[0]), 'فتح الفيديو'), 'فتح الفيديو زر أيقوني باسم وصول');
  const chips = findAll(rowFor(m, IDS[0]), (e) => e.classList.contains('lib-chip') && e.getAttribute('aria-pressed') !== null);
  assert.deepEqual(chips.map((s) => [textOf(s), s.getAttribute('aria-pressed')]), [['الترجمة 1', 'true']], 'شريحة لكل ترجمة موجودة وحدها');
  const none = rowFor(m, IDS[1]);
  assert.equal(findAll(none, (e) => e.classList.contains('lib-chip')).length, 0, 'بلا عربية: لا شرائح ولا خانة فارغة');
  assert.equal(textOf(none.querySelector('.lib-trs__none')), 'لا ترجمة بعد · الأصل جاهز', 'الأصل الإنجليزي محفوظ فعلًا');
  assert.ok(none.querySelector('.lib-toggle') === null, 'بلا ترجمة لا توسيع');
  assert.ok(rowFor(m, IDS[0]).querySelector('.lib-toggle'));
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

/** بند من قائمة «المزيد» للصف بمعرّفه، بنص يبدأ بالتسمية. */
const menuItem = (m, id, label) => {
  const more = buttonNamed(rowFor(m, id), 'المزيد');
  more.click();
  return menuItems(more).find((i) => textOf(i).startsWith(label));
};

test('«نسخ التعليمات» من «المزيد»: يكتب تعليمات كل صف بعنوانه ورابطه حرفيًا، بلا عرض لنصها، ورسالة نجاح بعنوان الصف', async () => {
  const m = await mount({ records: [{ id: IDS[0], title: 'الأول — عنوان' }, { id: IDS[1], title: 'How Browsers Render Arabic Text' }] });
  await m.lib.load();
  assert.ok(buttonNamed(rowFor(m, IDS[0]), 'نسخ التعليمات') === null, 'لا زر نسخ ظاهر في الصف: مكانه «المزيد»');
  menuItem(m, IDS[0], 'نسخ التعليمات').click();
  menuItem(m, IDS[1], 'نسخ التعليمات').click();
  await settle();
  assert.deepEqual(m.calls.clipboard, [
    instructions({ videoId: IDS[0], title: 'الأول — عنوان', source: 'en', target: 'ar' }),
    instructions({ videoId: IDS[1], title: 'How Browsers Render Arabic Text', source: 'en', target: 'ar' }),
  ]);
  assert.ok(m.calls.clipboard[0].includes(`https://www.youtube.com/watch?v=${IDS[0]}`));
  assert.ok(m.calls.clipboard[1].includes('- العنوان: How Browsers Render Arabic Text\n'));
  assert.notEqual(m.calls.clipboard[0], m.calls.clipboard[1]);
  const toasts = m.root.querySelectorAll('.tj-toast--success').map(textOf);
  assert.equal(toasts.length, 2);
  assert.ok(toasts[1].startsWith('نُسخت تعليمات الترجمة.') && toasts[1].includes(iso('How Browsers Render Arabic Text')), 'الرسالة تسمّي الفيديو');
  assertNoTemplate(m, 'تم النسخ');
  await m.clock.runAll();
  assert.ok(textOf(m.lib.toaster.live).startsWith('نُسخت تعليمات الترجمة.'), 'إعلان لقارئ الشاشة');
  assertNoTemplate(m, 'عادي بعد النسخ');
});

test('«نسخ التعليمات»: بند بتلميحه المعتمد، وفيديو بلا عنوان يعمل بعنوان «غير متوفر»', async () => {
  const m = await mount({ records: [{ id: IDS[0], title: null }] });
  await m.lib.load();
  const item = menuItem(m, IDS[0], 'نسخ التعليمات');
  assert.equal(textOf(item.querySelector('.tj-menu__hint')), COPY_TIP);
  assert.equal(COPY_TIP, 'ألصقها مع ملف الأصل في محادثة نموذجك.');
  assert.ok(item.getAttribute('aria-disabled') === null, 'معرّف صالح: البند ممكّن');
  item.click();
  await settle();
  assert.ok(m.calls.clipboard[0].includes('- العنوان: غير متوفر\n'));
  assert.ok(m.calls.clipboard[0].includes(`- الرابط: https://www.youtube.com/watch?v=${IDS[0]}\n`));
});

test('«نسخ التعليمات» عند رفض الحافظة: رسالة خطأ وإعلان، وبلا أي نص للتعليمات، ثم ينجح بإعادة الاختيار', async () => {
  let reject = true;
  const m = await mount({
    records: [{ id: IDS[0], title: 'عنوان' }],
    env: { clipboardWrite: async (text) => { if (reject) throw new DOMException('Document is not focused.', 'NotAllowedError'); m.calls.clipboard.push(text); } },
  });
  await m.lib.load();
  menuItem(m, IDS[0], 'نسخ التعليمات').click();
  await settle();
  const toast = m.root.querySelector('.tj-toast--danger');
  assert.equal(textOf(toast), 'تعذّر النسخ إلى الحافظة. أعد المحاولة.');
  await m.clock.runAll();
  assert.equal(textOf(m.lib.toaster.live), 'تعذّر النسخ إلى الحافظة. أعد المحاولة.');
  assertNoTemplate(m, 'فشل النسخ');
  reject = false;
  menuItem(m, IDS[0], 'نسخ التعليمات').click();
  await settle();
  assert.equal(m.calls.clipboard.length, 1);
  assert.ok(m.root.querySelector('.tj-toast--success'));
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
  // «الترجمات…» حذفت: صارت بطاقات في الصف نفسه (التوسيع). و«رفع ترجمة…» و«لصق ترجمة…» أيقونتان في الصف، و«النسخة المرفوعة»
  // لا تظهر قبل تعديل (2026-11-10).
  assert.deepEqual(items.map((i) => textOf(i.querySelector('.tj-menu__label'))), ['الترجمة — النسخة الحالية', 'الإنجليزية — المستخرجة', 'نص دراسي…', 'نسخ التعليمات', 'حذف الترجمة النشطة…', 'حذف بيانات الفيديو…']);
  assert.ok(items.slice(-2).every((i) => i.classList.contains('tj-menu__item--danger')), 'الحذفان بلون الخطر');
  items[0].click();
  await settle();
  assert.deepEqual(m.calls.downloads.map((f) => f.name), [`${IDS[0]}.ar.srt`]);
  assert.equal(menuButton.getAttribute('aria-expanded'), 'false', 'القائمة تُغلق بالاختيار');
  assert.equal(m.calls.confirms.length, 0);
  menuButton.click();
  menuItems(menuButton)[1].click();
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
  menuItems(exportBtn)[0].click();
  await settle();
  assert.equal(m.calls.confirms.length, 1);
  assert.equal(m.calls.confirms[0].title, 'توقيت الملف المصدَّر');
  assert.match(m.calls.confirms[0].body, /\u2066\+0\.5\u2069 ث/);
  assert.equal(m.calls.downloads.length, 0);

  exportBtn.click();
  m.answers.push(true);
  menuItems(exportBtn)[0].click();
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
  assert.ok(m.doc.activeElement === b);
  a.click();
  m.doc.body.dispatchEvent({ type: 'pointerdown' });
  assert.equal(a.getAttribute('aria-expanded'), 'false');
});

const LRI = String.fromCodePoint(0x2066);
const PDI = String.fromCodePoint(0x2069);
const listItems = (root, nth = 0) => root.querySelectorAll('ul.lib-del__list')[nth].querySelectorAll('li').map(textOf);

test('«حذف الترجمة النشطة…»: حوار يسرد ما يُحذف وما يبقى من بيانات الفيديو الفعلية، والإلغاء لا يمسّ شيئًا، والتأكيد يبقي الإنجليزي', async () => {
  const m = await mount({ records: [{ id: IDS[0], title: 'عنوان' }] });
  await m.lib.load();
  const more = buttonNamed(m.root, 'المزيد: عنوان');
  more.click();
  m.answers.push(false);
  deleteItem(more, 'active').click();
  await settle();
  const dialog = m.calls.confirms[0];
  assert.equal(dialog.title, 'حذف الترجمة النشطة (1)؟');
  assert.equal(dialog.confirmLabel, 'حذف');
  assert.equal(dialog.tone, 'danger');
  assert.equal(textOf(dialog.content.querySelector('.lib-del__title')), 'عنوان', 'عنوان الفيديو في الحوار');
  assert.deepEqual(listItems(dialog.content, 0), [`الترجمة 1 — ملف ${LRI}${IDS[0]}.ar.srt${PDI}`], 'ما يُحذف: هذه الترجمة وحدها (بلا تعديلات ولا علامات ولا إزاحة)');
  assert.deepEqual(listItems(dialog.content, 1), ['ملفات الأصل المحفوظة ومراجع المقارنة تبقى'], 'ما يبقى');
  assert.match(textOf(dialog.content.querySelector('.lib-del__note')), /لا يمكن التراجع/);
  assert.equal(findAll(dialog.content, (e) => e.tagName === 'input').length, 0, 'لا خيارات: التأكيد على ما سُرد');
  assert.equal((await m.store.getVideo(IDS[0])).arabic !== null, true, 'الإلغاء لم يحذف');

  more.click();
  m.answers.push(true);
  deleteItem(more, 'active').click();
  await settle();
  const after = await m.store.getVideo(IDS[0]);
  assert.equal(after.arabic, null);
  assert.equal(after.english.length, 1);
  assert.equal(textOf(m.root.querySelector('.tj-toast--success')), 'حُذفت الترجمة، وبقي الأصل المحفوظ ومراجع المقارنة.');
  assert.equal(rows(m)[0].querySelectorAll('.tj-pill').map(textOf)[0], 'بانتظار الترجمة', 'القائمة تحدّثت');
  assert.ok(buttonNamed(rows(m)[0], 'المزيد'), 'الصف باقٍ');
  const again = buttonNamed(rows(m)[0], 'المزيد');
  again.click();
  assert.equal(menuItems(again).filter((i) => i.classList.contains('tj-menu__item--danger')).length, 1, 'بلا ترجمة: «حذف بيانات الفيديو…» وحده');
});

test('«حذف بيانات الفيديو…»: حوار يسرد ما سيُحذف، والإلغاء لا يمسّ شيئًا، والتأكيد يزيل الصف، وفيديو بلا عربية يسرد الإنجليزي وسجله وحدهما', async () => {
  const m = await mount({ records: [{ id: IDS[0], title: 'أ', offset: 500 }, { id: IDS[1], title: 'ب', arabic: false }] });
  await m.lib.load();
  const moreB = buttonNamed(rowFor(m, IDS[1]), 'المزيد');
  moreB.click();
  m.answers.push(true);
  deleteItem(moreB).click();
  await settle();
  const only = m.calls.confirms[0];
  assert.equal(only.title, 'حذف بيانات هذا الفيديو؟');
  assert.equal(only.confirmLabel, 'حذف نهائيًا');
  assert.deepEqual(listItems(only.content), ['ملف أصل محفوظ', 'مراجع المقارنة بالأصل (1)', 'عنوان الفيديو ومدته وإعدادات عرضه']);
  assert.equal(textOf(only.content.querySelector('.lib-del__note')), 'لا يمكن التراجع.', 'بلا ترجمات لا «صدّر الترجمات»');
  assert.equal(await m.store.getVideo(IDS[1]), null);
  assert.equal(rows(m).length, 1);

  const moreA = buttonNamed(rowFor(m, IDS[0]), 'المزيد');
  moreA.click();
  m.answers.push(false);
  deleteItem(moreA).click();
  await settle();
  const all = m.calls.confirms[1];
  assert.deepEqual(listItems(all.content), ['الترجمة 1', `الإزاحة المحفوظة (${LRI}+0.5${PDI} ث)`, 'ملف أصل محفوظ', 'مراجع المقارنة بالأصل (1)', 'عنوان الفيديو ومدته وإعدادات عرضه']);
  assert.match(textOf(all.content.querySelector('.lib-del__note')), /صدّر الترجمات أولًا/);
  assert.equal(findAll(all.content, (e) => e.tagName === 'input').length, 0);
  assert.ok(await m.store.getVideo(IDS[0]), 'الإلغاء لم يحذف');

  moreA.click();
  m.answers.push(true);
  deleteItem(moreA).click();
  await settle();
  assert.equal(await m.store.getVideo(IDS[0]), null);
  assert.equal(rows(m).length, 0);
  assert.equal(textOf(m.root.querySelector('.tj-empty__title')), 'لا ترجمات محفوظة بعد');
  assert.equal(textOf(m.root.querySelector('.tj-toast--success')), 'حُذفت كل بيانات هذا الفيديو.');
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
  // التنصيص العربي «…» كعنوان «لا نتائج لـ«…»» (تدقيق Fable، UX-12 = F1).
  assert.equal(dialog.title, `رفع ترجمة لـ«${iso('عنوان')}»`);
  assert.equal(dialog.confirmLabel, 'حفظ', 'الهدف الافتراضي فارغ: حفظ لا استبدال');
  const body = allText(dialog.content);
  assert.match(body, /مطابق للأصل/);
  assert.doesNotMatch(body, /✓/, 'لا «✓» نصية بجوار أيقونة النجاح (CL-010)');
  assert.match(body, /جديد\.ar\.srt/);
  assert.match(body, /5 مقاطع/);
  assert.match(body, /الترجمة 1 — استبدال الترجمة 1، نشطة/, 'اسم وصول الخيار يحوي نصه الظاهر ويزيد الفعل');
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
  assert.equal(textOf(m.root.querySelector('.tj-toast--success')), 'حُفظت الترجمة 2.');
  const chips = rows(m)[0].querySelector('.lib-chips');
  assert.deepEqual(chips.querySelectorAll('button').map((x) => [textOf(x), x.getAttribute('aria-pressed')]), [['الترجمة 1', 'false'], ['الترجمة 2', 'true']], 'صارت ترجمتين بعد الإضافة، والجديدة نشطة');
  assert.equal(rows(m)[0].querySelectorAll('.lib-chip--add').map(textOf)[0], '3 · فارغة', 'والشريحة المتقطّعة للخانة التالية');
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
  assert.match(seen[0].text, /في الترجمة الحالية تعديل يدوي واحد/);
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

test('ح5: المرجع عند تعدد التصديرات سطر بالأقرب و«غير مؤكد» عند التقارب، بلا قائمة، ويُحفظ الأقرب مع الخانة', async () => {
  const track = englishTrack();
  const fp1 = fingerprint({ track, id: 'fp_test000001' });
  const fp2 = fingerprint({ track, id: 'fp_test000002', mode: 'long' });
  const record = { ...videoRecord({ videoId: IDS[0] }), english: [track], fingerprints: [fp1, fp2] };
  record.arabic.fingerprintId = fp1.id;
  record.arabic.comparison.fingerprintId = fp1.id;
  let suggested = null;
  const m = await mount({
    records: [{ id: IDS[0], title: 'عنوان', record }],
    env: {
      pickFiles: async () => [new File([writeSrt(makeCues(5).map((c) => ({ ...c, text: `جديد ${c.n}` })))], 'x.ar.srt')],
      confirm: async (o) => {
        m.calls.confirms.push(o);
        assert.equal(findAll(o.content, (e) => e.tagName === 'select' && e.classList.contains('lib-up__ref')).length, 0, 'لا قائمة مرجع');
        const line = findAll(o.content, (e) => e.classList?.contains('lib-up__ref-line'))[0];
        assert.match(textOf(line), /^المرجع: .*— الأقرب/);
        suggested = /عادي/.test(textOf(line)) ? fp1.id : fp2.id;
        assert.match(allText(o.content), /غير مؤكد/);
        assert.match(allText(o.content), /يُبدَّل المرجع من المحرّر/);
        return true;
      },
    },
  });
  await m.lib.load();
  clickReplace(m);
  await settle(10);
  const b = await m.store.getBundle(IDS[0]);
  assert.equal(b.slots[1].track.fingerprintId, suggested, 'الأقرب محفوظ مع الخانة');
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
  assert.ok(m.doc.activeElement !== more, 'التركيز على البند الأول');
  menuItems(more)[0].click();
  await settle();
  assert.ok(m.doc.activeElement === more);
});

test('كل رسالة عابرة تُعلَن لقارئ الشاشة بنصها (نجاح التصدير والفشل)', async () => {
  const m = await mount({ records: [{ id: IDS[0], title: 'عنوان' }] });
  await m.lib.load();
  const exportBtn = buttonNamed(m.root, 'المزيد: عنوان');
  exportBtn.click();
  menuItems(exportBtn)[1].click();
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
  menuItems(exportBtn)[1].click();
  await settle();
  assert.equal(m.calls.downloads.length, 1);
  assert.ok(m.root.querySelector('.tj-toast--danger') === null);
  assert.match(textOf(m.root.querySelector('.tj-toast--info')), /نُزّل الملف، لكن تعذّر حفظ ما يلزم لمقارنته/);
});

test('تغيّر الإعدادات من صفحة أخرى لا يعيد بناء القائمة (يحفظ التركيز والصف نفسه)', async () => {
  const m = await mount({ records: [{ id: IDS[0], title: 'عنوان' }] });
  await m.lib.load();
  const edit = buttonNamed(m.root, 'تحرير: عنوان');
  edit.focus();
  const pendingBefore = m.clock.pending().length;
  await m.store.setSettings({ appearance: { scale: 120 } });
  await m.area.flush();
  assert.equal(m.clock.pending().length, pendingBefore, 'لا مؤقت إعادة قراءة جديد لتغيّر الإعدادات');
  // العقدة لا تُمرَّر إلى assert.equal: فشله يبني فرقًا للـDOM الوهمي المترابط كله بذاكرة تربيعية خارج كومة V8.
  assert.ok(buttonNamed(m.root, 'تحرير: عنوان') === edit, 'العنصر نفسه لم يُستبدل');
  assert.ok(m.doc.activeElement === edit, 'ولا سقط التركيز');
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
  assert.ok(root.querySelector('.lib-row--target') === null, 'لا إبراز والصفحة مخفية');
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
    if (b.getAttribute('aria-pressed') === null) assert.ok(b.getAttribute('aria-label').startsWith(textOf(b)), `${textOf(b)} ← ${b.getAttribute('aria-label')}`);
  }
  // الشرائح: أزرار تبديل بنصها الظاهر اسمًا (بلا aria-label يخالفه)، والشريحة المتقطّعة اسمها نصها ووصفها فعل الرفع.
  const chips = findAll(rowFor(m, IDS[0]), (e) => e.classList.contains('lib-chip'));
  assert.ok(chips.length >= 1);
  for (const c of chips) assert.ok(c.getAttribute('aria-label') === null, `${textOf(c)}: الاسم من النص الظاهر`);
  assert.equal(chips.at(-1).getAttribute('aria-description'), 'رفع الترجمة 2');
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

test('حوار الرفع (AA3): لغة الترجمة من رمز صريح في اسم الملف، أو «إلى» المختارة للفيديو إن وافق النص، ويغيّرها المستخدم فتُحفظ بلغتها', async () => {
  for (const [name, text, pairTo, choose, expected] of [
    ['x.ar.srt', 'جديد', null, null, 'ar'],
    ['x.srt', 'جديد', 'ar', null, 'ar'],
    ['x.srt', 'nouveau', 'ar', null, null],
    ['x.srt', 'nouveau', 'ar', 'fr', 'fr'],
  ]) {
    let seen = null;
    const m = await mount({
      records: [{ id: IDS[0], title: 'عنوان' }],
      env: {
        pickFiles: async () => [new File([writeSrt(makeCues(5).map((c) => ({ ...c, text: `${text} ${c.n}` })))], name)],
        confirm: async (o) => {
          const sel = findAll(o.content, (e) => e.tagName === 'select' && e.classList.contains('lib-up__lang'))[0];
          seen = sel.value;
          if (choose) {
            sel.value = choose;
            sel.dispatchEvent({ type: 'change' });
          }
          return true;
        },
      },
    });
    if (pairTo) await m.store.setLangPrefs({ video: { videoId: IDS[0], pair: { from: 'en', to: pairTo } } });
    await m.lib.load();
    clickReplace(m);
    await settle(10);
    assert.equal(seen, expected === 'fr' ? '' : expected ?? '', `${name}: المقترحة`);
    const b = await m.store.getBundle(IDS[0]);
    assert.equal(b.slots[1].track.lang ?? null, expected, `${name}: المحفوظة`);
  }
});

test('طلب سلطان 2026-11-10: «رفع ترجمة…» و«لصق ترجمة…» أيقونتان بجانب «تحرير» باسم الصف وتلميحهما، وبلا ترجمة اللصق وحده بجانب «رفع ترجمة»', async () => {
  let picks = 0;
  const m = await mount({ records: [{ id: IDS[0], title: 'عنوان' }, { id: IDS[1], title: 'بلا ترجمة', arabic: false }], env: { pickFiles: async () => { picks++; return null; } } });
  await m.lib.load();
  const withAr = rowFor(m, IDS[0]);
  const up = buttonNamed(withAr, 'رفع ترجمة…: عنوان');
  const paste = buttonNamed(withAr, 'لصق ترجمة…: عنوان');
  assert.ok(up, 'أيقونة الرفع في الصف');
  assert.ok(paste, 'أيقونة اللصق في الصف');
  assert.equal(up.title, 'رفع ترجمة…');
  assert.equal(paste.title, 'لصق ترجمة…');
  assert.ok(up.classList.contains('tj-btn--icon') && paste.classList.contains('tj-btn--icon'), 'أيقونتان لا زرّان بنص');
  up.click();
  await settle();
  assert.equal(picks, 1, 'الأيقونة تفتح منتقي الملفات كما كان البند');
  const bare = rowFor(m, IDS[1]);
  assert.equal(buttonNamed(bare, 'رفع ترجمة…'), null, 'لا أيقونة رفع ثانية بجانب الزر الرئيسي «رفع ترجمة»');
  assert.ok(buttonNamed(bare, 'رفع ترجمة: بلا ترجمة'));
  assert.ok(buttonNamed(bare, 'لصق ترجمة…: بلا ترجمة'));
  const more = buttonNamed(withAr, 'المزيد: عنوان');
  more.click();
  const labels = menuItems(more).map((i) => textOf(i.querySelector('.tj-menu__label')));
  assert.equal(labels.some((l) => /^(رفع|لصق) ترجمة/.test(l)), false, 'لا رفع ولا لصق في «المزيد»');
});

test('«الترجمة — النسخة المرفوعة» في «المزيد» بعد تعديل وحده، ومتاحة', async () => {
  const original = makeCues(5);
  const edited = original.map((c) => (c.n === 2 ? { ...c, text: 'سطر 2 بعد تعديلي' } : c));
  const record = withArabicEdit(videoRecord({ videoId: IDS[0], cues: original }), { cues: edited }, NOW);
  const m = await mount({ records: [{ id: IDS[0], title: 'عنوان', record }] });
  await m.lib.load();
  const more = buttonNamed(m.root, 'المزيد: عنوان');
  more.click();
  const items = menuItems(more);
  assert.deepEqual(items.slice(0, 3).map((i) => textOf(i.querySelector('.tj-menu__label'))), ['الترجمة — النسخة الحالية', 'الترجمة — النسخة المرفوعة', 'الإنجليزية — المستخرجة']);
  assert.equal(items[1].getAttribute('aria-disabled'), null);
});
