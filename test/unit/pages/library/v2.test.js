// إضافات الإصدار الثاني في المحفوظات (P13-AC1/AC3/AC6/AC7، والهوية) بـDOM وهمي فوق تخزين حقيقي بمحاكاة: شرائح الخانات
// الموجودة في الصف (الضغط على غير النشطة يفعّلها بتراجع) وشريحة الرفع المتقطّعة، والفرز بالحالات الخمس بأعدادها («تحذيرات
// آلية» منفصلة عن «تحتاج مراجعة»)، والتوسيع في الصف ببطاقات الترجمات (الاسم والمرجع والتفعيل والتصدير والملف البديل والحذف
// بتأكيد يسرد ما يُحذف، والنسخة السابقة بسعتها واستعادتها بتبديل قابل للعكس وحذفها، ولا خانة رابعة)، و«نص دراسي…» عبر
// saveFile، والنسخ من «المزيد» يرفق القاموس بالنص نفسه.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instructions } from '../../../../src/core/export/instructions.js';
import { compare } from '../../../../src/core/compare/compare.js';
import { createStore } from '../../../../src/core/store/index.js';
import { formatTimecode } from '../../../../src/ui/format.js';
import { createLibrary } from '../../../../src/pages/library/view.js';
import { FILTERS, filterCounts, filterEntries, libraryEntries, manualEdits } from '../../../../src/pages/library/model.js';
import { t as tt } from '../../../../src/i18n/index.js';
import { manualEdits as playerManualEdits } from '../../../../src/player/controls/replace.js';
import { mergeCues, splitCue } from '../../../../src/core/edit/structure.js';
import { withoutSlot } from '../../../../src/core/model/bundle.js';
import { writeSrt } from '../../../../src/core/srt/writer.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW, makeCues, videoRecord } from '../../../helpers/fixtures.js';
import { samplePrefs, sampleBundle, seedBundle } from '../../../helpers/fixtures-v2.js';

const MD_HINT = tt('library.study.mdHint');
import { buttonNamed, findAll, newDocument, settle, textOf } from './fake-dom.js';

const IDS = ['AAAAAAAAAAA', 'BBBBBBBBBBB', 'CCCCCCCCCCC'];

function timers() {
  let n = 0;
  const q = new Map();
  return {
    setTimer: (fn, ms) => { q.set(++n, { fn, ms }); return n; },
    clearTimer: (id) => q.delete(id),
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

/** مكتبة: حزمة كاملة (ثلاث ترجمات وسابقة وعلامات)، وسجل إصدار أول، وسجل بلا عربية. */
async function mount({ env = {}, seed } = {}) {
  let t = Date.parse(NOW);
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now: () => (t += 1000) });
  if (seed) await seed(store);
  else {
    await seedBundle(store, sampleBundle({ videoId: IDS[0], third: true }));
    await store.updateVideo(IDS[1], () => ({ ...videoRecord({ videoId: IDS[1] }), title: 'سجل قديم' }));
    await store.updateVideo(IDS[2], () => ({ ...videoRecord({ videoId: IDS[2], arabic: false }), title: 'بلا عربية' }));
  }
  await area.flush();
  const doc = newDocument();
  const clock = timers();
  const calls = { clipboard: [], saves: [], confirms: [] };
  const answers = [];
  const lib = createLibrary({
    store, doc, now: () => Date.parse(NOW) + 3600 * 1000,
    openTab: async () => {}, openPage: async () => {},
    saveFile: async (f) => { calls.saves.push(f); return { ok: true, mode: 'subfolder', downloadId: calls.saves.length }; },
    clipboardWrite: async (text) => { calls.clipboard.push(text); },
    pickFiles: async () => null,
    diagnosticsText: async () => '{}',
    confirm: async (o) => { calls.confirms.push(o); const a = answers.shift(); if (typeof a === 'function') return a(o); return a ?? false; },
    setTimer: clock.setTimer, clearTimer: clock.clearTimer,
    ...env,
  });
  doc.body.append(lib.root);
  await lib.load();
  return { lib, store, area, doc, clock, calls, answers, root: lib.root };
}

const rowFor = (m, id) => m.root.querySelectorAll('li.lib-row').find((r) => r.getAttribute('data-video') === id);
const menuItems = (button) => button.parentNode.querySelectorAll('[role=menuitem]');
const openMore = (m, id, label) => {
  const more = buttonNamed(rowFor(m, id), 'المزيد');
  more.click();
  menuItems(more).find((i) => textOf(i).startsWith(label)).click();
};
/** التوسيع في الصف: يضغط زر «إظهار الترجمات» ويعيد جذره. */
const expand = async (m, id) => {
  buttonNamed(rowFor(m, id), 'إظهار الترجمات').click();
  await settle(10);
  return expOf(m, id);
};
const expOf = (m, id) => rowFor(m, id).querySelector('.lib-exp');
const cardOf = (exp, n) => exp.querySelector(`section[data-slot="${n}"]`);
const chipsOf = (m, id) => rowFor(m, id).querySelectorAll('.lib-chips button');
const LRI = String.fromCodePoint(0x2066);
const PDI = String.fromCodePoint(0x2069);
const txt = (e) => e.textContent;

test('الصف: شريحة لكل ترجمة موجودة تميّز النشطة، والضغط على غيرها يفعّلها برسالة «فُعّلت الترجمة 2» و«تراجع»، ولا شريحة لفارغ سوى شريحة الرفع', async () => {
  const m = await mount();
  let chips = chipsOf(m, IDS[0]);
  assert.deepEqual(chips.map((b) => [textOf(b), b.getAttribute('aria-pressed')]), [['الترجمة 1', 'true'], ['2 · مراجعة', 'false'], ['الترجمة 3', 'false']], 'الاسم المختصر إن وُجد');
  assert.equal(rowFor(m, IDS[0]).querySelectorAll('.lib-chip--add').length, 0, 'ثلاث ترجمات: لا شريحة رفع');
  assert.equal(chips[1].title, 'الترجمة 2 — مراجعة — اضغط لتفعيلها');
  assert.equal(chips[0].title, `الترجمة 1 (النشطة) — الإزاحة ${LRI}+0.5${PDI} ث`, 'إزاحة النشطة في تلميح شريحتها');
  assert.deepEqual(chips.map((b) => b.getAttribute('tabindex')), ['0', '-1', '-1'], 'نقطة Tab واحدة');
  chips[1].click();
  await settle(10);
  assert.equal((await m.store.getBundle(IDS[0])).active, 2);
  const toast = m.root.querySelector('.tj-toast--success');
  assert.ok(textOf(toast).startsWith('فُعّلت الترجمة 2'), 'الفعل في النص (U58)');
  assert.deepEqual(chipsOf(m, IDS[0]).map((b) => b.getAttribute('aria-pressed')), ['false', 'true', 'false']);
  buttonNamed(toast, 'تراجع').click();
  await settle(10);
  assert.equal((await m.store.getBundle(IDS[0])).active, 1, 'التراجع يعيد النشطة السابقة');
  // سجل الإصدار الأول: ترجمة واحدة في الخانة 1 تُعرض شريحتها، والخانة 2 شريحة الرفع المتقطّعة (لا نسخة فارغة).
  assert.deepEqual(chipsOf(m, IDS[1]).map((b) => [textOf(b), b.getAttribute('aria-pressed')]), [['الترجمة 1', 'true']]);
  assert.equal(textOf(rowFor(m, IDS[1]).querySelector('.lib-chip--add')), 'الترجمة 2 · فارغة', 'ر-٣: لا تُقرأ «اثنتان فارغتان»');
  assert.equal((await m.store.getBundle(IDS[1])).active, 1);
  // لوحة المفاتيح: الأسهم تنقل التركيز بين الشرائح بترتيب العرض (اليسار هو التالي)، لا تفعّل.
  const [a, b2] = chipsOf(m, IDS[0]);
  a.focus();
  a.dispatchEvent({ type: 'keydown', key: 'ArrowLeft' });
  assert.ok(m.doc.activeElement === b2);
  assert.deepEqual(chipsOf(m, IDS[0]).map((x) => x.getAttribute('tabindex')), ['-1', '0', '-1'], 'نقطة Tab تتبع التركيز');
  b2.dispatchEvent({ type: 'keydown', key: 'ArrowRight' });
  assert.ok(m.doc.activeElement === a);
  assert.equal((await m.store.getBundle(IDS[0])).active, 1, 'الأسهم لا تغيّر النشطة');
});

test('شريحة الرفع المتقطّعة: الخانة الفارغة التالية وحدها، وتفتح الرفع إليها هي (ولو سبقت الممتلئة)', async () => {
  const text = writeSrt(makeCues(5).map((c) => ({ ...c, text: `جديد ${c.n}` })));
  const m = await mount({
    seed: async (store) => {
      await seedBundle(store, sampleBundle({ videoId: IDS[0] })); // 1 و2 ممتلئتان، 3 فارغة
    },
    env: { pickFiles: async () => [new File([text], 'جديد.ar.srt')] },
  });
  assert.deepEqual(chipsOf(m, IDS[0]).map(textOf), ['الترجمة 1', '2 · مراجعة'], 'الشرائح للموجودة وحدها');
  const add = rowFor(m, IDS[0]).querySelectorAll('.lib-chip--add');
  assert.equal(add.length, 1, 'شريحة متقطّعة واحدة');
  assert.equal(textOf(add[0]), 'الترجمة 3 · فارغة');
  assert.equal(add[0].getAttribute('aria-description'), 'رفع الترجمة 3');
  assert.ok(add[0].getAttribute('aria-pressed') === null && add[0].getAttribute('role') === null, 'إجراء لا زر تبديل في شريط الترجمات');
  assert.equal(add[0].parentNode.querySelector('.lib-chips').querySelectorAll('.lib-chip--add').length, 0, 'خارج شريط الترجمات');
  const before = JSON.stringify(m.area.dump());
  m.answers.push(false);
  add[0].click();
  await settle(10);
  const dialog = m.calls.confirms.at(-1);
  const radios = findAll(dialog.content, (e) => e.tagName === 'input' && e.getAttribute('type') === 'radio');
  assert.deepEqual(radios.map((r) => [r.getAttribute('value'), r.checked]), [['1', false], ['2', false], ['3', true]], 'الهدف الافتراضي الخانة المطلوبة');
  assert.equal(dialog.confirmLabel, 'حفظ', 'حفظ لا استبدال');
  assert.equal(JSON.stringify(m.area.dump()), before, 'الإلغاء لا يمسّ التخزين');
  // ثم التأكيد يكتب في الخانة 3 وتختفي شريحة الرفع (لا خانة أخرى فارغة).
  m.answers.push(true);
  rowFor(m, IDS[0]).querySelector('.lib-chip--add').click();
  await settle(15);
  const b = await m.store.getBundle(IDS[0]);
  assert.equal(b.slots[2].track.original[0].text, 'جديد 1');
  assert.equal(rowFor(m, IDS[0]).querySelectorAll('.lib-chip--add').length, 0);
  assert.deepEqual(chipsOf(m, IDS[0]).map(textOf), ['الترجمة 1', '2 · مراجعة', 'الترجمة 3']);
});

test('شريحة الرفع المتقطّعة: إن حُذفت الأولى فالفارغة التالية هي 1 وإليها يذهب الرفع', async () => {
  const text = writeSrt(makeCues(5));
  const m = await mount({
    seed: async (store) => {
      await seedBundle(store, sampleBundle({ videoId: IDS[0], third: true }));
      await store.updateBundle(IDS[0], (b) => withoutSlot(b, 1, NOW));
    },
    env: { pickFiles: async () => [new File([text], 'x.ar.srt')] },
  });
  assert.deepEqual(chipsOf(m, IDS[0]).map(textOf), ['2 · مراجعة', 'الترجمة 3'], 'الرقم هوية الخانة: لا إعادة ترقيم');
  const add = rowFor(m, IDS[0]).querySelector('.lib-chip--add');
  assert.equal(textOf(add), 'الترجمة 1 · فارغة');
  m.answers.push(false);
  add.click();
  await settle(10);
  const radios = findAll(m.calls.confirms.at(-1).content, (e) => e.tagName === 'input' && e.getAttribute('type') === 'radio');
  assert.deepEqual(radios.filter((r) => r.checked).map((r) => r.getAttribute('value')), ['1']);
});

test('الفرز بالحالات الخمس بأعدادها، و«تحذيرات آلية» منفصلة عن «تحتاج مراجعة» البشرية', async () => {
  const m = await mount();
  assert.deepEqual(FILTERS.map((f) => f.label), ['الكل', 'بانتظار الترجمة', 'مترجمة', 'معدّلة', 'فيها فروق عن الأصل', 'تحتاج مراجعة']);
  const chips = findAll(m.root, (e) => e.classList.contains('tj-chip'));
  assert.deepEqual(chips.map((c) => c.getAttribute('aria-label')), ['الكل (3)', 'بانتظار الترجمة (1)', 'مترجمة (2)', 'معدّلة (1)', 'فيها فروق عن الأصل (0)', 'تحتاج مراجعة (1)']);
  chips[5].click();
  await settle();
  assert.deepEqual(m.root.querySelectorAll('li.lib-row').map((r) => r.getAttribute('data-video')), [IDS[0]]);
  assert.ok(textOf(rowFor(m, IDS[0])).includes('تحتاج مراجعة (2)'), 'شارة العلامات «أعود إليه»');

  // النموذج: تحذير آلي بلا علامات، وعلامة بلا تحذير.
  const entries = [
    { videoId: 'a', arabic: { edited: false, matched: false }, summary: { filled: 1, edited: 0, warned: 1, marks: { todo: 0, done: 0 } } },
    { videoId: 'b', arabic: { edited: false, matched: true }, summary: { filled: 2, edited: 0, warned: 0, marks: { todo: 3, done: 1 } } },
    { videoId: 'c', arabic: { edited: true, matched: false }, summary: undefined },
  ];
  assert.deepEqual(filterEntries(entries, 'warnings').map((e) => e.videoId), ['a', 'c']);
  assert.deepEqual(filterEntries(entries, 'review').map((e) => e.videoId), ['b']);
  assert.deepEqual(filterCounts(entries), { all: 3, awaiting: 0, translated: 3, edited: 1, warnings: 2, review: 1 });
  assert.equal(libraryEntries([{ entry: { videoId: 'x' }, summary: { filled: 0 }, slots: [] }])[0].summary.filled, 0);
});

test('التوسيع في الصف: بطاقة لكل ترجمة بتفاصيلها (الملف والتاريخ والتعديلات والإزاحة والنتيجة والمرجع والعلامات)، ويُطوى فتعود الحال', async () => {
  const m = await mount();
  const toggle = () => buttonNamed(rowFor(m, IDS[0]), 'إظهار الترجمات');
  assert.equal(toggle().getAttribute('aria-expanded'), 'false');
  assert.ok(expOf(m, IDS[0]) === null, 'مطوي: لا بطاقات ولا قراءة للحزمة');
  const exp = await expand(m, IDS[0]);
  assert.ok(exp, 'التوسيع في الصف نفسه لا حوار جانبي');
  assert.equal(m.doc.body.querySelectorAll('dialog').length, 0);
  const open = buttonNamed(rowFor(m, IDS[0]), 'إخفاء الترجمات');
  assert.equal(open.getAttribute('aria-expanded'), 'true');
  assert.equal(open.getAttribute('aria-controls'), exp.id, 'الزر يتحكم بمنطقة التوسيع');
  assert.equal(exp.getAttribute('role'), 'region');
  assert.equal(exp.getAttribute('aria-busy'), 'false');
  assert.ok(rowFor(m, IDS[0]).classList.contains('lib-row--open'));
  assert.equal(textOf(exp.querySelector('.lib-exp__title')), 'ترجمات هذا الفيديو');
  const one = cardOf(exp, 1);
  const two = cardOf(exp, 2);
  assert.equal(exp.querySelectorAll('section.lib-card').length, 3, 'ثلاث ترجمات بلا خانة رابعة ولا فارغة (ممتلئة كلها)');
  assert.ok(one.classList.contains('lib-card--active'));
  assert.ok(findAll(one, (e) => e.classList.contains('tj-pill--brand') && textOf(e) === 'نشطة').length === 1, 'النشطة بالإبراز كبقية الأسطح (CL-023)');
  assert.equal(findAll(two, (e) => textOf(e) === 'نشطة').length, 0);
  assert.ok(textOf(one).includes(m_fileName(1)));
  assert.ok(textOf(one).includes('5 مقاطع'));
  assert.ok(textOf(one).includes('5 تعديلات يدوية'), 'عدد التعديلات اليدوية');
  assert.ok(textOf(two).includes('بلا تعديل'));
  assert.ok(textOf(one).includes(`الإزاحة ${LRI}+0.5${PDI} ث`));
  assert.ok(textOf(two).includes(`الإزاحة ${LRI}−1.2${PDI} ث`));
  assert.match(textOf(one.querySelector('.lib-card__meta')), /^رُفعت قبل ساعة · 5 تعديلات يدوية · الإزاحة/, 'تاريخ الرفع والتعديلات والإزاحة');
  assert.match(one.querySelector('.lib-card__meta').querySelector('span').title, /2026/, 'والتاريخ المطلق في التلميح');
  assert.ok(textOf(one).includes('العلامات: 1 أعود إليه · 1 راجعته'));
  assert.ok(textOf(one).includes('المرجع:'));
  assert.ok(textOf(one.querySelector('.lib-result')).length > 0, 'نتيجة المقارنة');
  assert.ok(findAll(two, (e) => e.classList.contains('lib-prevl')).length === 1, 'النسخة السابقة في بطاقة خانتها (2)');
  assert.ok(findAll(one, (e) => e.classList.contains('lib-prevl')).length === 0);
  const actions = (card) => card.querySelector('.lib-card__actions').querySelectorAll('button').map(textOf);
  assert.deepEqual(actions(one), ['تصدير SRT', 'استبدال…', 'حذف…'], 'النشطة بلا «تفعيل»');
  assert.deepEqual(actions(two), ['تفعيل', 'تصدير SRT', 'استبدال…', 'حذف…']);
  assert.equal(textOf(two.querySelector('.lib-card__actions .tj-btn--primary')), 'تفعيل', 'الإجراء الرئيسي في غير النشطة');
  // يُطوى: تزول البطاقات والحالة تعود.
  open.click();
  assert.ok(expOf(m, IDS[0]) === null);
  assert.equal(buttonNamed(rowFor(m, IDS[0]), 'إظهار الترجمات').getAttribute('aria-expanded'), 'false');
  assert.ok(!rowFor(m, IDS[0]).classList.contains('lib-row--open'));
});

/** اسم ملف ترجمة الخانة في عيّنة الإصدار الثاني (بالثلاث). */
function m_fileName(n) {
  return sampleBundle({ third: true }).slots[n - 1].track.fileName;
}

test('التوسيع: الخانة الفارغة بطاقة متقطّعة واحدة بزر «رفع ترجمة…» يرفع إليها، ولا بطاقة لخانة ثالثة فارغة', async () => {
  const text = writeSrt(makeCues(5).map((c) => ({ ...c, text: `جديد ${c.n}` })));
  const m = await mount({
    seed: async (store) => { await seedBundle(store, sampleBundle({ videoId: IDS[0] })); },
    env: { pickFiles: async () => [new File([text], 'جديد.ar.srt')] },
  });
  const exp = await expand(m, IDS[0]);
  assert.equal(exp.querySelectorAll('section.lib-card').length, 3, 'ترجمتان وبطاقة فارغة واحدة');
  const empty = exp.querySelector('.lib-card--empty');
  assert.equal(textOf(empty.querySelector('h4')), 'الترجمة 3 · فارغة');
  assert.equal(empty.getAttribute('data-slot'), '3');
  m.answers.push(false);
  buttonNamed(empty, 'رفع ترجمة…').click();
  await settle(10);
  const radios = findAll(m.calls.confirms.at(-1).content, (e) => e.tagName === 'input' && e.getAttribute('type') === 'radio');
  assert.deepEqual(radios.filter((r) => r.checked).map((r) => r.getAttribute('value')), ['3'], 'الرفع إلى الخانة الفارغة المعروضة');
  m.answers.push(true);
  buttonNamed(expOf(m, IDS[0]).querySelector('.lib-card--empty'), 'رفع ترجمة…').click();
  await settle(20);
  assert.equal((await m.store.getBundle(IDS[0])).slots[2].track.original[0].text, 'جديد 1');
  assert.equal(expOf(m, IDS[0]).querySelectorAll('.lib-card--empty').length, 0, 'امتلأت: لا بطاقة فارغة');
  assert.equal(expOf(m, IDS[0]).querySelectorAll('section.lib-card').length, 3);
});

test('التوسيع: الاسم المختصر يُحفظ (Enter أو change) ويُلغى بـEsc، والتفعيل، وحذف ترجمة بتأكيد يسرد ما يُحذف', async () => {
  const m = await mount();
  let exp = await expand(m, IDS[0]);
  buttonNamed(cardOf(exp, 2), 'إعادة تسمية الترجمة 2').click();
  const name = cardOf(exp, 2).querySelector('input');
  assert.equal(name.value, 'مراجعة');
  assert.equal(name.getAttribute('maxlength'), '24');
  assert.ok(m.doc.activeElement === name, 'التحرير يبدأ بالتركيز على الحقل');
  name.value = '  نسخة   المراجع ';
  name.dispatchEvent({ type: 'change' });
  await settle(10);
  assert.equal((await m.store.getBundle(IDS[0])).slots[1].name, 'نسخة المراجع');
  assert.deepEqual(chipsOf(m, IDS[0]).map(textOf), ['الترجمة 1', '2 · نسخة المراجع', 'الترجمة 3'], 'الشريحة تحدّثت');
  assert.equal(textOf(cardOf(expOf(m, IDS[0]), 2).querySelector('h4')), 'الترجمة 2 · نسخة المراجع');
  // اسم أطول من الحد: رسالة خطأ ولا يُحفظ.
  exp = expOf(m, IDS[0]);
  buttonNamed(cardOf(exp, 2), 'إعادة تسمية الترجمة 2').click();
  const long = cardOf(exp, 2).querySelector('input');
  long.value = 'اسم طويل جدًا يتجاوز الحد المسموح';
  long.dispatchEvent({ type: 'change' });
  await settle(10);
  assert.equal((await m.store.getBundle(IDS[0])).slots[1].name, 'نسخة المراجع');
  assert.ok(textOf(m.root.querySelector('.tj-toast--danger')).includes('24 حرفًا'), 'الرسالة في الصفحة نفسها لا في حوار');
  // Esc يلغي دون كتابة، وEnter بقيمة غير متغيرة يخرج دون كتابة.
  const rev = (await m.store.getBundle(IDS[0])).record.rev;
  buttonNamed(cardOf(expOf(m, IDS[0]), 3), 'تسمية الترجمة 3').click();
  const third = cardOf(expOf(m, IDS[0]), 3).querySelector('input');
  third.value = 'مسودة';
  third.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.ok(cardOf(expOf(m, IDS[0]), 3).querySelector('input') === null, 'عاد العنوان');
  buttonNamed(cardOf(expOf(m, IDS[0]), 3), 'تسمية الترجمة 3').click();
  cardOf(expOf(m, IDS[0]), 3).querySelector('input').dispatchEvent({ type: 'keydown', key: 'Enter' });
  await settle(5);
  assert.equal((await m.store.getBundle(IDS[0])).slots[2].name, null);
  assert.equal((await m.store.getBundle(IDS[0])).record.rev, rev, 'لا كتابة');

  buttonNamed(cardOf(expOf(m, IDS[0]), 2), 'تفعيل').click();
  await settle(10);
  assert.equal((await m.store.getBundle(IDS[0])).active, 2);
  assert.ok(textOf(cardOf(expOf(m, IDS[0]), 2)).includes('نشطة'));
  assert.ok(findAll(cardOf(expOf(m, IDS[0]), 1), (e) => textOf(e) === 'نشطة').length === 0);

  m.answers.push(false);
  buttonNamed(cardOf(expOf(m, IDS[0]), 3), 'حذف…').click();
  await settle(10);
  const del = m.calls.confirms.at(-1);
  assert.equal(del.tone, 'danger');
  assert.equal(del.title, 'حذف الترجمة 3؟');
  assert.deepEqual(del.content.querySelectorAll('ul.lib-del__list')[0].querySelectorAll('li').map(textOf).slice(0, 1), [`الترجمة 3 — ملف ${LRI}${m_fileName(3)}${PDI}`]);
  assert.ok(findAll(del.content, (e) => e.classList.contains('lib-del__list'))[1], 'وما يبقى');
  assert.ok((await m.store.getBundle(IDS[0])).slots[2].track, 'الإلغاء لا يحذف');
  m.answers.push(true);
  buttonNamed(cardOf(expOf(m, IDS[0]), 3), 'حذف…').click();
  await settle(10);
  assert.equal((await m.store.getBundle(IDS[0])).slots[2].track, null);
  assert.ok(textOf(expOf(m, IDS[0]).querySelector('.lib-card--empty')).includes('الترجمة 3 · فارغة'), 'صارت البطاقة المتقطّعة');
  assert.equal(textOf(m.root.querySelectorAll('.tj-toast--success').at(-1)), 'حُذفت الترجمة 3.');
  assert.deepEqual(chipsOf(m, IDS[0]).map((b) => b.getAttribute('data-slot')), ['1', '2'], 'والشريحة زالت');
});

test('التوسيع: «تصدير SRT» لأي ترجمة (ولو غير نشطة) بإزاحتها هي وبسؤال التوقيت، والإلغاء لا ينزّل', async () => {
  const m = await mount();
  let exp = await expand(m, IDS[0]);
  // الخانة 3 غير نشطة بإزاحة +0.3: يسأل عن التوقيت؛ الإلغاء لا ينزّل.
  m.answers.push(false);
  buttonNamed(cardOf(exp, 3), 'تصدير SRT').click();
  await settle(10);
  assert.equal(m.calls.confirms.at(-1).title, 'توقيت الملف المصدَّر');
  assert.match(m.calls.confirms.at(-1).body, /\u2066\+0\.3\u2069 ث/);
  assert.equal(m.calls.saves.length, 0);
  // «كما يظهر الآن»: التوقيت المحفوظ + الإزاحة.
  m.answers.push(true);
  buttonNamed(cardOf(expOf(m, IDS[0]), 3), 'تصدير SRT').click();
  await settle(10);
  assert.equal(m.calls.saves.length, 1);
  assert.equal(m.calls.saves[0].name, `${IDS[0]}.ar.srt`);
  assert.ok(m.calls.saves[0].text.includes('ثالثة 1') && !m.calls.saves[0].text.includes('أولى 1'), 'نص الخانة 3 لا النشطة');
  const stored = (await m.store.getBundle(IDS[0])).slots[2].track.original[0];
  const shown = /(\d\d:\d\d:\d\d,\d{3}) --> /.exec(m.calls.saves[0].text)[1];
  assert.notEqual(shown, formatTimecode(stored.startMs), 'بالإزاحة');
  assert.equal(textOf(m.root.querySelector('.tj-toast--success')), 'بدأ تنزيل الملف.');
  // «المحفوظ كما هو»: بلا إزاحة.
  m.answers.push((o) => {
    const saved = findAll(o.content, (e) => e.tagName === 'input' && e.getAttribute('value') === 'saved')[0];
    saved.checked = true;
    saved.dispatchEvent({ type: 'change' });
    return true;
  });
  buttonNamed(cardOf(expOf(m, IDS[0]), 3), 'تصدير SRT').click();
  await settle(10);
  assert.ok(m.calls.saves[1].text.includes(`${formatTimecode(stored.startMs)} --> `));
  // نتيجة saveFile الفاشلة رسالة بنص رمزها.
  exp = expOf(m, IDS[0]);
});

test('التوسيع: «ملف بديل…» يرفع إلى الخانة نفسها استبدالًا (الهدف الافتراضي رقمها)، والإلغاء لا يمسّ التخزين', async () => {
  const text = writeSrt(makeCues(5).map((c) => ({ ...c, text: `بديل ${c.n}` })));
  const m = await mount({ env: { pickFiles: async () => [new File([text], 'بديل.ar.srt')] } });
  const exp = await expand(m, IDS[0]);
  const before = JSON.stringify(m.area.dump());
  m.answers.push(false);
  buttonNamed(cardOf(exp, 2), 'استبدال…').click();
  await settle(10);
  const dialog = m.calls.confirms.at(-1);
  const radios = findAll(dialog.content, (e) => e.tagName === 'input' && e.getAttribute('type') === 'radio');
  assert.deepEqual(radios.filter((r) => r.checked).map((r) => r.getAttribute('value')), ['2'], 'الهدف الافتراضي الخانة نفسها');
  assert.equal(dialog.confirmLabel, 'استبدال');
  assert.equal(JSON.stringify(m.area.dump()), before);
  m.answers.push(true);
  buttonNamed(cardOf(expOf(m, IDS[0]), 2), 'استبدال…').click();
  await settle(20);
  const b = await m.store.getBundle(IDS[0]);
  assert.equal(b.slots[1].track.original[0].text, 'بديل 1');
  assert.equal(b.previous.from, 2, 'المستبدَلة نسخة سابقة');
  assert.equal(b.slots[0].track.original[0].text, 'أولى 1', 'الأخرى باقية');
  assert.ok(expOf(m, IDS[0]), 'التوسيع باقٍ بعد التحديث');
  assert.ok(textOf(cardOf(expOf(m, IDS[0]), 2)).includes('بديل.ar.srt'), 'البطاقة بالملف الجديد');
});

test('ح5: التوسيع — المرجع عند التعدد سطر مقروء بلا قائمة، ويُبدَّل من المحرّر وحده', async () => {
  const m = await mount();
  const exp = await expand(m, IDS[0]);
  const card = cardOf(exp, 2);
  assert.ok(card.querySelector('select') === null, 'لا قائمة مرجع');
  assert.match(textOf(card.querySelector('.lib-card__ref')), /^المرجع: /);
  assert.equal((await m.store.getBundle(IDS[0])).slots[1].track.fingerprintId, 'fp_test000002', 'المرجع المحفوظ لم يتغير');
});

test('التوسيع — نتيجة المقارنة: مطابقة بعدّها، والمقاطع الناقصة بأرقامها، وبلا بصمة سطر معلومة', async () => {
  // حالات حقيقية لا تقارير مصطنعة: البطاقة تعرض المقارنة الحاضرة (قرار سلطان D-03، تدقيق V2 U-061)، فتُحسب من المقاطع والبصمة.
  const b = sampleBundle({ videoId: IDS[0], third: true });
  const fp2 = b.record.fingerprints[1];
  const partial = makeCues(3, { text: (i) => `ثانية ${i}` });
  b.slots[1].track = { ...b.slots[1].track, original: partial, comparison: compare(partial, fp2, { target: null }) };
  b.slots[2].track.fingerprintId = null;
  b.slots[2].track.comparison = null;
  b.record.arabic = structuredClone(b.slots[0].track);
  const m = await mount({ seed: async (store) => { await seedBundle(store, b); } });
  const exp = await expand(m, IDS[0]);
  assert.equal(textOf(cardOf(exp, 1).querySelector('.lib-result')), 'مطابق للأصل · 5 من 5');
  assert.ok(cardOf(exp, 1).querySelector('.lib-result').classList.contains('lib-result--success'));
  assert.match(textOf(cardOf(exp, 2).querySelector('.lib-result')), /ناقص[^\n]*: 4، 5/);
  assert.ok(cardOf(exp, 2).querySelector('.lib-result').classList.contains('lib-result--warning'));
  assert.match(textOf(cardOf(exp, 3).querySelector('.lib-result')), /لا مرجع للمقارنة بالأصل/);
});

test('AV2 U-061 (D-03): بطاقة الخانة تعرض المقارنة الحاضرة — رُفع ناقصًا ثم اكتمل في المحرّر فتقول «مطابق للأصل» كالشارة', async () => {
  const b = sampleBundle({ videoId: IDS[0], third: true });
  const fp2 = b.record.fingerprints[1];
  const full = makeCues(5, { text: (i) => `ثانية ${i}` });
  const partial = full.slice(0, 4);
  // تقرير الرفع المخزّن: ينقصه المقطع 5. ثم أُكمل في المحرّر (current) ولم يتغير التقرير المخزّن بعقد البيانات.
  b.slots[1].track = { ...b.slots[1].track, original: partial, current: full, editedAt: NOW, comparison: compare(partial, fp2, { target: null }) };
  const m = await mount({ seed: async (store) => { await seedBundle(store, b); } });
  assert.deepEqual((await m.store.getBundle(IDS[0])).slots[1].track.comparison.missing, [5], 'تقرير الرفع باقٍ في البيانات');
  const exp = await expand(m, IDS[0]);
  const line = cardOf(exp, 2).querySelector('.lib-result');
  assert.equal(textOf(line), 'مطابق للأصل · 5 من 5');
  assert.ok(line.classList.contains('lib-result--success'));
});

test('AV2 U-061 (D-03): رُفع مطابقًا ثم تغيّر توقيت مقطع في المحرّر، فتحذّر البطاقة ولا تقول «مطابق للأصل»', async () => {
  const b = sampleBundle({ videoId: IDS[0], third: true });
  const t2 = b.slots[1].track;
  const drifted = t2.original.map((c) => (c.n === 3 ? { ...c, startMs: c.startMs + 3000, endMs: c.endMs + 3000 } : c));
  b.slots[1].track = { ...t2, current: drifted, editedAt: NOW };
  const m = await mount({ seed: async (store) => { await seedBundle(store, b); } });
  assert.equal((await m.store.getBundle(IDS[0])).slots[1].track.comparison.matched, true, 'تقرير الرفع المخزّن مطابق');
  const exp = await expand(m, IDS[0]);
  const line = cardOf(exp, 2).querySelector('.lib-result');
  assert.ok(line.classList.contains('lib-result--warning'), textOf(line));
  assert.doesNotMatch(textOf(line), /مطابق للأصل/);
});

test('التوسيع — «النسخة السابقة» في بطاقة خانتها: تاريخها وسعتها، والاستعادة تبديل قابل للعكس بتأكيد، والحذف بتأكيد', async () => {
  const m = await mount();
  await expand(m, IDS[0]);
  const prev = () => expOf(m, IDS[0]).querySelector('.lib-prevl');
  assert.match(textOf(prev()), /^نسخة سابقة محفوظة · قبل ساعة · \d+ ك\.ب/);
  assert.ok(prev().parentNode.getAttribute('data-slot') === '2', 'في بطاقة الترجمة 2 (مصدرها)');
  assert.ok(prev().querySelector('.lib-prevl__text').title.includes('.ar.srt'), 'ملفها وتاريخها في التلميح');
  const before = await m.store.getBundle(IDS[0]);
  m.answers.push(true);
  buttonNamed(prev(), 'استعادة').click();
  await settle(10);
  assert.match(m.calls.confirms.at(-1).body, /تصبح الحالية فيها هي النسخة السابقة؛ واستعادة ثانية تعكس ذلك/);
  const after = await m.store.getBundle(IDS[0]);
  assert.deepEqual(after.slots[1].track.original, before.previous.track.original, 'عادت السابقة إلى خانتها');
  assert.deepEqual(after.previous.track.original, before.slots[1].track.original, 'وصارت الحالية سابقة');
  m.answers.push(true);
  buttonNamed(prev(), 'استعادة').click();
  await settle(10);
  const again = await m.store.getBundle(IDS[0]);
  assert.deepEqual(again.slots[1].track.original, before.slots[1].track.original, 'استعادة ثانية تعكس الأولى');
  assert.deepEqual(again.slots.map((s) => s.n), [1, 2, 3], 'لا خانة رابعة');

  m.answers.push(false);
  buttonNamed(prev(), 'حذف').click();
  await settle(10);
  assert.ok((await m.store.getBundle(IDS[0])).previous, 'الإلغاء لا يحذف');
  m.answers.push(true);
  buttonNamed(prev(), 'حذف').click();
  await settle(10);
  assert.equal((await m.store.getBundle(IDS[0])).previous, null);
  assert.ok(prev() === null, 'زال السطر');
});

test('التوسيع — نسخة سابقة لخانة لا بطاقة لها (فارغة غير التالية) سطر قائم بذاته فلا تضيع الاستعادة', async () => {
  const b = sampleBundle({ videoId: IDS[0], third: true });
  b.previous = { ...b.previous, from: 3 };
  const m = await mount({
    seed: async (store) => {
      await seedBundle(store, b);
      await store.updateBundle(IDS[0], (cur) => ({ ...withoutSlot(cur, 3, NOW), previous: cur.previous }));
      await store.updateBundle(IDS[0], (cur) => ({ ...withoutSlot(cur, 2, NOW), previous: cur.previous }));
    },
  });
  const exp = await expand(m, IDS[0]);
  // الفارغتان 2 و3: بطاقة متقطّعة لأولاهما (2)، والسابقة من 3 سطر مستقل تحت البطاقات.
  assert.equal(exp.querySelector('.lib-card--empty').getAttribute('data-slot'), '2');
  const own = exp.querySelector('.lib-exp__extra .lib-prevl');
  assert.ok(own, 'سطر مستقل');
  assert.match(textOf(own), /^نسخة سابقة محفوظة · من الترجمة 3 · /);
  assert.ok(buttonNamed(own, 'استعادة'));
});

test('التوسيع: يبقى مفتوحًا عبر إعادة بناء القائمة ويتحدّث بتغيّر من مكان آخر (المشغّل أو تبويب آخر)، والتركيز يعود إلى الزر نفسه', async () => {
  const { activateSlot } = await import('../../../../src/pages/library/actions.js');
  const m = await mount();
  const exp = await expand(m, IDS[0]);
  const btn = buttonNamed(cardOf(exp, 3), 'تصدير SRT');
  btn.focus();
  // تغيّر من سياق آخر: الخانة 2 نشطة.
  await activateSlot({ store: m.store, videoId: IDS[0], n: 2, now: () => Date.parse(NOW) + 99999 });
  await m.area.flush();
  await m.clock.runAll();
  await settle(10);
  assert.ok(expOf(m, IDS[0]), 'ما زال مفتوحًا');
  assert.ok(textOf(cardOf(expOf(m, IDS[0]), 2)).includes('نشطة'), 'بالنسخة الأحدث');
  assert.ok(textOf(cardOf(expOf(m, IDS[0]), 1)).includes('نشطة') === false);
  assert.equal(m.doc.activeElement.getAttribute('data-fk'), `${IDS[0]}:card-3:export`, 'التركيز عاد إلى الزر نفسه بعد إعادة الرسم');
  // رسائل التوسيع في الصفحة نفسها: الحاويتان في جذر المحفوظات دائمًا.
  assert.ok(m.root.contains(m.lib.toaster.root) && m.root.contains(m.lib.toaster.live));
});

test('التوسيع: عنوان الفيديو معزول في اسم منطقته، وفيديو حُذف من مكان آخر يزيل صفه ولا يرمي', async () => {
  const m = await mount();
  const exp = await expand(m, IDS[0]);
  assert.equal(exp.getAttribute('aria-label'), `ترجمات ${String.fromCodePoint(0x2068)}${(await m.store.getVideo(IDS[0])).title}${String.fromCodePoint(0x2069)}`);
  await m.store.deleteVideo(IDS[0]);
  await m.area.flush();
  await m.clock.runAll();
  await settle(10);
  assert.ok(rowFor(m, IDS[0]) === undefined, 'زال الصف');
  assert.ok(!m.doc.body.querySelector('.lib-exp'));
});

test('«نص دراسي…»: الصيغة واللغة ومعاينة الاسم، ثم الحفظ عبر saveFile؛ والثنائي معطّل بلا مسار إنجليزي', async () => {
  const m = await mount();
  m.answers.push(async (o) => {
    const fileName = () => textOf(o.content.querySelector('.lib-study__file'));
    assert.equal(fileName(), `${IDS[0]}.ar.study.txt`);
    // مقطّعتان (الصيغة واللغة) بخيارات radio حقيقية، والمعاينة تحت «اسم الملف».
    assert.equal(o.content.querySelectorAll('fieldset.tj-seg').length, 2);
    assert.deepEqual(findAll(o.content, (e) => e.classList.contains('tj-seg__label')).map(textOf), ['TXT', 'Markdown', 'الترجمة وحدها', 'باللغتين · الترجمة والأصل']);
    const hint = findAll(o.content, (e) => e.classList.contains('tj-field__hint') && textOf(e) === MD_HINT)[0];
    assert.equal(hint.hidden, true, 'تلميح روابط الأوقات لـMarkdown وحده');
    const md = findAll(o.content, (e) => e.tagName === 'input' && e.getAttribute('value') === 'md')[0];
    md.checked = true;
    md.dispatchEvent({ type: 'change' });
    assert.equal(hint.hidden, false);
    const bi = findAll(o.content, (e) => e.tagName === 'input' && e.getAttribute('value') === 'bi')[0];
    assert.equal(bi.disabled, false);
    bi.checked = true;
    bi.dispatchEvent({ type: 'change' });
    await settle(5);
    assert.equal(fileName(), `${IDS[0]}.ar-en.study.md`);
    return true;
  });
  openMore(m, IDS[0], 'نص دراسي');
  await settle(10);
  assert.equal(m.calls.saves.length, 1);
  assert.equal(m.calls.saves[0].name, `${IDS[0]}.ar-en.study.md`);
  assert.ok(m.calls.saves[0].text.includes('أولى 1 (معدّل)'), 'النسخة الحالية للنشطة');
  assert.ok(m.calls.saves[0].text.includes('line 1'), 'والإنجليزية للثنائي');
  assert.equal(textOf(m.root.querySelector('.tj-toast--success')), 'بدأ تنزيل الملف.');

  // بلا عربية: البند معطّل بسببه.
  const more = buttonNamed(rowFor(m, IDS[2]), 'المزيد');
  more.click();
  const item = menuItems(more).find((i) => textOf(i).startsWith('نص دراسي'));
  assert.equal(item.getAttribute('aria-disabled'), 'true');
});

test('«نص دراسي…» بلا مسار إنجليزي: الثنائي معطّل بسببه في السطر وفي التلميح ولا يُختار', async () => {
  const m = await mount({
    seed: async (store) => { await store.updateVideo(IDS[0], () => ({ ...videoRecord({ videoId: IDS[0] }), english: [], fingerprints: [], arabic: { ...videoRecord({ videoId: IDS[0] }).arabic, fingerprintId: null, comparison: null }, title: 'عربي وحده' })); },
  });
  let seen = null;
  m.answers.push((o) => {
    const bi = findAll(o.content, (e) => e.tagName === 'input' && e.getAttribute('value') === 'bi')[0];
    seen = { disabled: bi.disabled, why: findAll(o.content, (e) => e.classList.contains('tj-field__hint') && e.id === bi.getAttribute('aria-describedby')).map(textOf)[0], described: bi.getAttribute('aria-describedby') };
    return false;
  });
  openMore(m, IDS[0], 'نص دراسي');
  await settle(10);
  assert.deepEqual(seen && { disabled: seen.disabled, why: seen.why }, { disabled: true, why: 'لا أصل محفوظ لهذا الفيديو.' });
  assert.ok(seen.described, 'السبب مرتبط بالخيار');
});

test('التصدير يتبع saveFile: الإلغاء رسالة معلومة، والرجوع إلى التنزيل العادي SV_FALLBACK_BLOB، ولا بصمة لتصدير لم يحدث', async () => {
  let reply = { ok: false, code: 'SV_CANCELLED' };
  const m = await mount({ env: { saveFile: async () => reply } });
  openMore(m, IDS[1], 'الإنجليزية');
  await settle(10);
  assert.equal(textOf(m.root.querySelector('.tj-toast--info')), 'أُلغي الحفظ.');
  assert.equal((await m.store.getVideo(IDS[1])).fingerprints.length, 1, 'لا بصمة لتصدير أُلغي');
  reply = { ok: true, mode: 'blob', downloadId: null };
  openMore(m, IDS[1], 'الترجمة — النسخة الحالية');
  await settle(10);
  assert.ok(findAll(m.root, (e) => e.classList.contains('tj-toast--info')).some((t) => textOf(t).includes('تعذّر الحفظ في المكان المختار')));
});

test('«نسخ» يرفق القاموس بالنص نفسه الذي تبنيه instructions حين يكون مرفقًا، ولا يرفقه حين يُطفأ', async () => {
  const m = await mount({
    seed: async (store) => {
      await store.updateVideo(IDS[0], () => ({ ...videoRecord({ videoId: IDS[0] }), title: 'عنوان' }));
      await store.setPrefs(samplePrefs());
    },
  });
  openMore(m, IDS[0], 'نسخ التعليمات');
  await settle(5);
  const terms = samplePrefs().glossary.terms;
  assert.equal(m.calls.clipboard[0], instructions({ videoId: IDS[0], title: 'عنوان', glossary: terms, source: 'en', target: 'ar' }));
  assert.ok(m.calls.clipboard[0].includes('- prompt = موجِّه'));
  await m.store.setPrefs({ glossary: { attach: false } });
  await m.area.flush();
  await settle(5);
  await m.clock.runAll();
  openMore(m, IDS[0], 'نسخ التعليمات');
  await settle(5);
  assert.equal(m.calls.clipboard.at(-1), instructions({ videoId: IDS[0], title: 'عنوان', source: 'en', target: 'ar' }));
});

test('manualEdits: يعدّ المقاطع المختلفة عن الأصل وما زاد أو نقص، وصفر بلا تعديل', () => {
  const original = [{ n: 1, startMs: 0, endMs: 1000, text: 'أ' }, { n: 2, startMs: 1000, endMs: 2000, text: 'ب' }, { n: 3, startMs: 2000, endMs: 3000, text: 'ج' }];
  assert.equal(manualEdits({ original, current: null }), 0);
  assert.equal(manualEdits({ original, current: [original[0], { ...original[1], text: 'ب معدّل' }] }), 2, 'نص مقطع ومقطع محذوف');
  assert.equal(manualEdits({ original, current: [...original, { n: 4, startMs: 3000, endMs: 4000, text: 'د' }] }), 1);
});

test('manualEdits: العدد نفسه في المحفوظات والمشغّل، والدمج والشطر وإعادة الترقيم تعديل واحد لا مقارنة بالرقم (بوابة W7)', () => {
  const original = makeCues(40);
  const renumber = (cues) => cues.map((c, i) => ({ ...c, n: i + 1 }));
  const cases = {
    text: [original.map((c) => (c.n % 10 === 3 ? { ...c, text: `${c.text} معدّل` } : c)), 4],
    merge: [mergeCues(original, 4), 1],
    split: [splitCue(original, 4, 2), 1],
    mergeRenumbered: [renumber(mergeCues(original, 4)), 1],
    splitRenumbered: [renumber(splitCue(original, 4, 2)), 1],
  };
  for (const [name, [current, expected]] of Object.entries(cases)) {
    const track = { original, current };
    assert.equal(manualEdits(track), expected, name);
    assert.equal(manualEdits(track), playerManualEdits(track), `${name}: المحفوظات والمشغّل`);
  }
});

test('تدقيق 5fedcb9 (CL-002، قرار سلطان): عنوان فيه حرف عربي RTL ولو بدأ بكلمة لاتينية، والإنجليزي الخالص LTR، في الصف ومنطقة التوسيع', async () => {
  const MIXED = 'API هو الواجهة! (الجزء 3)';
  const EN = 'Do schools kill creativity? | TED';
  const m = await mount({
    seed: async (store) => {
      await seedBundle(store, sampleBundle({ videoId: IDS[0] }));
      await store.updateVideo(IDS[0], (r) => ({ ...r, title: MIXED }));
      await store.updateVideo(IDS[1], () => ({ ...videoRecord({ videoId: IDS[1] }), title: EN }));
    },
  });
  const titleOf = (id) => rowFor(m, id).querySelector('.lib-row__title');
  assert.equal(titleOf(IDS[0]).textContent, MIXED);
  assert.equal(titleOf(IDS[0]).tagName, 'h3');
  assert.equal(titleOf(IDS[0]).dir, 'rtl', 'يبدأ بـAPI وفيه حرف عربي');
  assert.equal(titleOf(IDS[1]).dir, 'ltr', 'إنجليزي خالص، بمحاذاة يمين من .tj-auto');
  const exp = await expand(m, IDS[0]);
  assert.equal(exp.getAttribute('aria-label'), `ترجمات ${String.fromCodePoint(0x2068)}${MIXED}${String.fromCodePoint(0x2069)}`, 'العنوان معزول داخل الجملة');
  // .tj-auto لا يأخذ أول حرف قوي (plaintext يتجاهل dir)، بل يعزل ويحاذي يمينًا.
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../../../../src/ui/base.css', import.meta.url), 'utf8');
  assert.match(css, /\.tj-auto \{ unicode-bidi: isolate; \}/);
  assert.match(css, /:root\[dir="rtl"\] \.tj-auto \{ text-align: right; \}/);
  assert.match(css, /:root\[dir="ltr"\] \.tj-auto \{ text-align: left; \}/);
});
