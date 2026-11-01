// واجهة المحفوظات بـDOM وهمي فوق تخزين حقيقي بمحاكاة (P7-AC2/AC3/AC6/AC7): الحالات الخمس، والبحث والترتيب والعرض
// التدريجي، وأوامر الصف الستة، و«نسخ» بحالاته وبعدم ظهور نص التعليمات في أي عنصر أو سمة في أي حالة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instructions } from '../../../../src/core/export/instructions.js';
import { createStore } from '../../../../src/core/store/index.js';
import { withView } from '../../../../src/core/model/index.js';
import { writeSrt } from '../../../../src/core/srt/writer.js';
import { createLibrary, CAPTION, COPY_TIP } from '../../../../src/pages/library/view.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW, makeCues, videoRecord } from '../../../helpers/fixtures.js';
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
    download: (f) => calls.downloads.push(f),
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

/** بنود القائمة المنسدلة المرتبطة بزرها (في الصف أكثر من قائمة). */
const menuItems = (button) => button.parentNode.querySelectorAll('[role=menuitem]');
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
  assert.equal(m.root.querySelectorAll('.lib-meter').length, 0, 'بلا حد ثابت لا شريط');
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
  assert.ok(textOf(row).includes('الإزاحة +0.5 ث'));
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
  assert.ok(buttonNamed(rows(m)[0], `نسخ تعليمات ترجمة: ${IDS[0]}`));

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
  assert.equal(textOf(m.root.querySelector('.tj-empty__title')), 'لا نتائج لـ«لا يوجد هذا»');
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
  const meter = m.root.querySelector('.lib-meter');
  assert.ok(meter);
  assert.equal(meter.getAttribute('role'), 'meter');
  assert.ok(Number(meter.getAttribute('aria-valuenow')) >= 80);
  assert.ok(meter.classList.contains('lib-meter--warning'));
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
  const disabled = buttonNamed(rowFor(m, IDS[1]), 'تعديل');
  assert.equal(disabled.getAttribute('aria-disabled'), 'true');
  assert.equal(disabled.title, 'لا ترجمة عربية محفوظة لهذا الفيديو.');
  disabled.click();
  await settle();
  assert.equal(m.calls.pages.length, 1, 'المعطّل لا يفتح شيئًا');
  assert.ok(buttonNamed(rowFor(m, IDS[1]), 'رفع'), 'بلا عربية: رفع بدل استبدال');
});

test('«نسخ»: يكتب تعليمات كل صف بعنوانه ورابطه حرفيًا، بلا عرض لنصها، و«تم النسخ» ثم يعود بعد ثانيتين', async () => {
  const m = await mount({ records: [{ id: IDS[0], title: 'الأول — عنوان' }, { id: IDS[1], title: 'How Browsers Render Arabic Text' }] });
  await m.lib.load();
  const first = buttonNamed(rowFor(m, IDS[0]), 'نسخ تعليمات ترجمة: الأول — عنوان');
  const second = buttonNamed(rowFor(m, IDS[1]), 'نسخ تعليمات ترجمة: How Browsers Render Arabic Text');
  assert.ok(first && second);
  assert.equal(textOf(first), 'نسخ');
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
  assert.equal(textOf(first), 'نسخ');
  assert.equal(first.getAttribute('data-state'), 'idle');
  assert.equal(m.lib.toaster.live.textContent, 'تم نسخ تعليمات الترجمة. ‹How Browsers Render Arabic Text›', 'إعلان لقارئ الشاشة بعنوان الصف');
  assertNoTemplate(m, 'عادي بعد النسخ');
});

test('«نسخ»: التلميح بنصه المعتمد مرتبط بالزر (للمرور والتركيز)، وفيديو بلا عنوان يعمل بعنوان «غير متوفر»', async () => {
  const m = await mount({ records: [{ id: IDS[0], title: null }] });
  await m.lib.load();
  const button = buttonNamed(m.root, `نسخ تعليمات ترجمة: ${IDS[0]}`);
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
  const button = buttonNamed(m.root, 'نسخ تعليمات ترجمة: عنوان');
  button.click();
  await settle();
  assert.equal(textOf(button), 'أعد المحاولة');
  assert.equal(button.getAttribute('data-state'), 'error');
  const toast = m.root.querySelector('.lib-toast--danger');
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

test('تصدير SRT: قائمة بأسباب التعطيل، والعربية الحالية تنزل باسمها دون سؤال عند إزاحة صفر', async () => {
  const m = await mount({ records: [{ id: IDS[0], title: 'عنوان' }] });
  await m.lib.load();
  const menuButton = buttonNamed(m.root, 'تصدير SRT: عنوان');
  assert.equal(menuButton.getAttribute('aria-expanded'), 'false');
  menuButton.click();
  assert.equal(menuButton.getAttribute('aria-expanded'), 'true');
  const items = menuItems(menuButton);
  assert.deepEqual(items.map((i) => textOf(i.querySelector('.lib-menu__label'))), ['العربية — النسخة الحالية', 'العربية — الأصل المستورد', 'الإنجليزية — المستخرجة']);
  assert.equal(items[1].getAttribute('aria-disabled'), 'true');
  assert.equal(textOf(items[1].querySelector('.lib-menu__hint')), 'لم تُعدَّل الترجمة، فالأصل المستورد هو النسخة الحالية.');
  items[1].click();
  await settle();
  assert.equal(m.calls.downloads.length, 0, 'المعطّل لا ينزّل');
  items[0].click();
  await settle();
  assert.deepEqual(m.calls.downloads.map((f) => f.name), [`${IDS[0]}.ar.srt`]);
  assert.equal(menuButton.getAttribute('aria-expanded'), 'false', 'القائمة تُغلق بالاختيار');
  assert.equal(m.calls.confirms.length, 0);
  menuButton.click();
  menuItems(menuButton)[2].click();
  await settle();
  assert.equal(m.calls.downloads[1].name, `${IDS[0]}.en.manual.normal.srt`);
  assert.ok(m.root.querySelector('.lib-toast--success'));
});

test('تصدير العربية بإزاحة يسأل عن التوقيت بقيمتها، والإلغاء لا ينزّل', async () => {
  const m = await mount({ records: [{ id: IDS[0], title: 'عنوان', offset: 500 }] });
  await m.lib.load();
  const exportBtn = buttonNamed(m.root, 'تصدير SRT: عنوان');
  exportBtn.click();
  m.answers.push(false);
  menuItems(exportBtn)[0].click();
  await settle();
  assert.equal(m.calls.confirms.length, 1);
  assert.equal(m.calls.confirms[0].title, 'توقيت الملف المصدَّر');
  assert.match(m.calls.confirms[0].body, /\+0\.5 ث/);
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
  const a = buttonNamed(rowFor(m, IDS[0]), 'تصدير SRT');
  const b = buttonNamed(rowFor(m, IDS[1]), 'تصدير SRT');
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
  menuItems(more)[0].click();
  await settle();
  const dialog = m.calls.confirms[0];
  assert.equal(dialog.title, `حذف ترجمة "${iso('عنوان')}"؟`);
  assert.equal(dialog.body, 'لا يمكن التراجع عن الحذف.');
  assert.equal(dialog.confirmLabel, 'حذف');
  assert.equal(dialog.tone, 'danger');
  assert.deepEqual(findAll(dialog.content, (e) => e.classList.contains('lib-choice__label')).map(textOf), ['العربية فقط (يبقى المسار الإنجليزي والبصمة)', 'كل بيانات هذا الفيديو']);
  assert.equal((await m.store.getVideo(IDS[0])).arabic !== null, true, 'الإلغاء لم يحذف');

  more.click();
  m.answers.push(true);
  menuItems(more)[0].click();
  await settle();
  const after = await m.store.getVideo(IDS[0]);
  assert.equal(after.arabic, null);
  assert.equal(after.english.length, 1);
  assert.ok(m.root.querySelector('.lib-toast--success'));
  assert.ok(textOf(rows(m)[0]).includes('EN يدوي'));
  assert.equal(rows(m)[0].querySelectorAll('.tj-pill').filter((p) => textOf(p).startsWith('AR')).length, 0, 'القائمة تحدّثت');
});

test('الحذف: «كل بيانات هذا الفيديو» يزيل الصف، والفيديو بلا عربية يعرض خيار الكل وحده', async () => {
  const m = await mount({ records: [{ id: IDS[0], title: 'أ' }, { id: IDS[1], title: 'ب', arabic: false }] });
  await m.lib.load();
  const moreB = buttonNamed(rowFor(m, IDS[1]), 'المزيد');
  moreB.click();
  m.answers.push(true);
  menuItems(moreB)[0].click();
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
  menuItems(moreA)[0].click();
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
  menuItems(moreC)[0].click();
  await settle();
  assert.equal(await m.store.getVideo(IDS[0]), null);
  assert.equal(rows(m).length, 0);
  assert.equal(textOf(m.root.querySelector('.tj-empty__title')), 'لا ترجمات محفوظة بعد');
});

test('الاستبدال: الاختيار ثم حوار مقارنة بتصفير الإزاحة، والتأكيد يستبدل ويحدّث، والإلغاء لا يكتب', async () => {
  const text = writeSrt(makeCues(5).map((c) => ({ ...c, text: `جديد ${c.n}` })));
  let picked = [new File([text], 'جديد.ar.srt', { type: 'text/plain' })];
  const m = await mount({ records: [{ id: IDS[0], title: 'عنوان', offset: 1000 }], env: { pickFiles: async () => picked } });
  await m.lib.load();
  m.answers.push(false);
  buttonNamed(m.root, 'استبدال الترجمة العربية: عنوان').click();
  await settle();
  const dialog = m.calls.confirms[0];
  assert.equal(dialog.title, `استبدال ترجمة "${iso('عنوان')}"؟`);
  assert.equal(dialog.confirmLabel, 'استبدال');
  assert.equal(dialog.tone, 'danger');
  const body = allText(dialog.content);
  assert.match(body, /مطابق للأصل ✓/);
  assert.match(body, /ستُصفَّر إزاحة العرض/);
  assert.match(body, /جديد\.ar\.srt/);
  assert.match(body, /5 مقاطع/);
  assert.equal((await m.store.getVideo(IDS[0])).arabic.original[0].text, 'سطر 1', 'الإلغاء لم يكتب');

  m.answers.push(true);
  buttonNamed(m.root, 'استبدال الترجمة العربية: عنوان').click();
  await settle();
  const after = await m.store.getVideo(IDS[0]);
  assert.equal(after.arabic.original[0].text, 'جديد 1');
  assert.equal(after.view.displayOffsetMs, 0);
  assert.ok(m.root.querySelector('.lib-toast--success'));
  assert.ok(!textOf(rows(m)[0]).includes('الإزاحة'), 'الصف بلا إزاحة بعد الاستبدال');
});

test('الاستبدال: إلغاء المنتقي لا يفعل شيئًا، وملف تالف يعرض رسالة خطأ ولا يكتب', async () => {
  let picked = null;
  const m = await mount({ records: [{ id: IDS[0], title: 'عنوان' }], env: { pickFiles: async () => picked } });
  await m.lib.load();
  buttonNamed(m.root, 'استبدال الترجمة العربية: عنوان').click();
  await settle();
  assert.equal(m.calls.confirms.length, 0);
  picked = [new File(['ليس SRT'], 'x.srt', { type: 'text/plain' })];
  buttonNamed(m.root, 'استبدال الترجمة العربية: عنوان').click();
  await settle();
  assert.equal(m.calls.confirms.length, 0, 'لا حوار لملف تالف');
  assert.match(textOf(m.root.querySelector('.lib-toast--danger')), /SRT|مقطع/);
  assert.equal((await m.store.getVideo(IDS[0])).rev, 1);
});

test('الاستبدال: تغيّر السجل قبل التأكيد يظهر ST_CONFLICT ولا يُستبدل شيء', async () => {
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
  buttonNamed(m.root, 'استبدال الترجمة العربية: عنوان').click();
  await settle(10);
  assert.match(textOf(m.root.querySelector('.lib-toast--danger')), /تغيّر هذا السجل من مكان آخر/);
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
