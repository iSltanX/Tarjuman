// إضافات الإصدار الثاني في المحفوظات (P13-AC1/AC3/AC6/AC7) بـDOM وهمي فوق تخزين حقيقي بمحاكاة: اختيار 1 2 3 في الصف
// يفعّل غير النشطة بتراجع، والفرز بالحالات الخمس بأعدادها («تحذيرات آلية» منفصلة عن «تحتاج مراجعة»)، ولوحة «الترجمات…»
// (الاسم والمرجع والتفعيل والحذف بتأكيد، والنسخة السابقة بسعتها واستعادتها بتبديل قابل للعكس وحذفها، ولا خانة رابعة)،
// و«نص دراسي…» عبر saveFile، والنسخ يرفق القاموس بالنص نفسه.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instructions } from '../../../../src/core/export/instructions.js';
import { createStore } from '../../../../src/core/store/index.js';
import { createLibrary } from '../../../../src/pages/library/view.js';
import { FILTERS, filterCounts, filterEntries, libraryEntries, manualEdits } from '../../../../src/pages/library/model.js';
import { manualEdits as playerManualEdits } from '../../../../src/player/controls/replace.js';
import { mergeCues, splitCue } from '../../../../src/core/edit/structure.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW, makeCues, videoRecord } from '../../../helpers/fixtures.js';
import { samplePrefs, sampleBundle, seedBundle } from '../../../helpers/fixtures-v2.js';
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
const panelOf = (m) => m.doc.body.querySelector('dialog.lib-panel');
const cardOf = (panel, n) => panel.querySelector(`section[data-slot="${n}"]`);

test('الصف: محدد الترجمات الموجودة يميّز النشطة، والضغط على غيرها يفعّلها برسالة «الترجمة 2» و«تراجع»، وترجمة واحدة بلا محدد', async () => {
  const m = await mount();
  const picker = rowFor(m, IDS[0]).querySelector('.tj-slots');
  const slots = picker.querySelectorAll('button');
  assert.deepEqual(slots.map((b) => b.getAttribute('aria-checked')), ['true', 'false', 'false']);
  assert.deepEqual(slots.map((b) => b.getAttribute('aria-label')), ['الترجمة 1، نشطة', 'الترجمة 2', 'الترجمة 3']);
  assert.equal(slots[1].title, 'الترجمة 2 — مراجعة', 'التلميح بالاسم المختصر');
  slots[1].click();
  await settle(10);
  assert.equal((await m.store.getBundle(IDS[0])).active, 2);
  const toast = m.root.querySelector('.tj-toast--success');
  assert.ok(textOf(toast).startsWith('الترجمة 2'));
  assert.deepEqual(rowFor(m, IDS[0]).querySelector('.tj-slots').querySelectorAll('button').map((b) => b.getAttribute('aria-checked')), ['false', 'true', 'false']);
  buttonNamed(toast, 'تراجع').click();
  await settle(10);
  assert.equal((await m.store.getBundle(IDS[0])).active, 1, 'التراجع يعيد النشطة السابقة');
  // سجل الإصدار الأول: ترجمة واحدة في الخانة 1، فالمحدد مخفي ولا خانات فارغة تُعرض.
  const oldPicker = rowFor(m, IDS[1]).querySelector('.tj-slots');
  assert.equal(oldPicker.hidden, true);
  assert.deepEqual(oldPicker.querySelectorAll('button').map((b) => b.textContent), ['1']);
  assert.equal((await m.store.getBundle(IDS[1])).active, 1);
});

test('الفرز بالحالات الخمس بأعدادها، و«تحذيرات آلية» منفصلة عن «تحتاج مراجعة» البشرية', async () => {
  const m = await mount();
  assert.deepEqual(FILTERS.map((f) => f.label), ['الكل', 'بانتظار الترجمة', 'مترجمة', 'معدّلة', 'تحذيرات آلية', 'تحتاج مراجعة']);
  const chips = findAll(m.root, (e) => e.classList.contains('tj-chip'));
  assert.deepEqual(chips.map((c) => c.getAttribute('aria-label')), ['الكل (3)', 'بانتظار الترجمة (1)', 'مترجمة (2)', 'معدّلة (1)', 'تحذيرات آلية (0)', 'تحتاج مراجعة (1)']);
  chips[5].click();
  await settle();
  assert.deepEqual(m.root.querySelectorAll('li.lib-row').map((r) => r.getAttribute('data-video')), [IDS[0]]);
  assert.ok(textOf(rowFor(m, IDS[0])).includes('تحتاج مراجعة 2'), 'شارة العلامات «أعود إليه»');

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

test('«الترجمات…»: بطاقة لكل خانة بتفاصيلها، والاسم المختصر يُحفظ، والتفعيل، وحذف ترجمة بتأكيد', async () => {
  const m = await mount();
  openMore(m, IDS[0], 'الترجمات');
  await settle(10);
  const panel = panelOf(m);
  assert.ok(panel?.open, 'اللوحة مفتوحة');
  const one = cardOf(panel, 1);
  const two = cardOf(panel, 2);
  assert.ok(textOf(one).includes('نشطة'));
  assert.ok(findAll(one, (e) => e.classList.contains('tj-pill--brand') && textOf(e) === 'نشطة').length === 1, 'النشطة بالإبراز كبقية الأسطح (CL-023)');
  assert.ok(textOf(one).includes(`${IDS[0]}.أولى.ar.srt`));
  assert.ok(textOf(one).includes('معدّلة'));
  assert.ok(textOf(one).includes('5 تعديلات يدوية'));
  assert.ok(textOf(one).includes('الإزاحة +0.5 ث'));
  assert.ok(textOf(one).includes('العلامات: 1 أعود إليه · 1 راجعته'));
  assert.ok(textOf(two).includes('الإزاحة −1.2 ث'));
  assert.ok(textOf(one).includes('المرجع:'));
  assert.equal(panel.querySelectorAll('section.lib-slot').length, 4, 'ثلاث خانات وبطاقة السابقة، لا خانة رابعة');

  const name = two.querySelector('input');
  assert.equal(name.value, 'مراجعة');
  name.value = '  نسخة   المراجع ';
  name.dispatchEvent({ type: 'change' });
  await settle(10);
  assert.equal((await m.store.getBundle(IDS[0])).slots[1].name, 'نسخة المراجع');
  const long = cardOf(panelOf(m), 2).querySelector('input');
  long.value = 'اسم طويل جدًا يتجاوز الحد المسموح';
  long.dispatchEvent({ type: 'change' });
  await settle(10);
  assert.equal((await m.store.getBundle(IDS[0])).slots[1].name, 'نسخة المراجع');
  // رسائل اللوحة داخل الحوار المشروط لا تحت خلفيته (CL-006).
  assert.ok(textOf(panelOf(m).querySelector('.tj-toast--danger')).includes('24 محرفًا'));

  buttonNamed(cardOf(panelOf(m), 2), 'تفعيل').click();
  await settle(10);
  assert.equal((await m.store.getBundle(IDS[0])).active, 2);
  assert.ok(textOf(cardOf(panelOf(m), 2)).includes('نشطة'));

  m.answers.push(false);
  buttonNamed(cardOf(panelOf(m), 3), 'حذف هذه الترجمة…').click();
  await settle(10);
  assert.equal(m.calls.confirms.at(-1).tone, 'danger');
  assert.ok((await m.store.getBundle(IDS[0])).slots[2].track, 'الإلغاء لا يحذف');
  m.answers.push(true);
  buttonNamed(cardOf(panelOf(m), 3), 'حذف هذه الترجمة…').click();
  await settle(10);
  assert.equal((await m.store.getBundle(IDS[0])).slots[2].track, null);
  assert.ok(textOf(cardOf(panelOf(m), 3)).includes('فارغة'));
  panelOf(m).close();
  assert.equal(panelOf(m), null, 'الإغلاق يزيل اللوحة');
});

test('«الترجمات…» — تغيير المرجع عند التعدد يعيد المقارنة ويحفظ المرجع', async () => {
  const m = await mount();
  openMore(m, IDS[0], 'الترجمات');
  await settle(10);
  const select = cardOf(panelOf(m), 2).querySelector('select');
  assert.equal(select.childNodes.length, 3, 'البصمتان و«بلا مرجع»');
  assert.equal(select.value, 'fp_test000002');
  select.value = 'fp_test000001';
  select.dispatchEvent({ type: 'change' });
  await settle(10);
  const s = (await m.store.getBundle(IDS[0])).slots[1];
  assert.equal(s.track.fingerprintId, 'fp_test000001');
  assert.equal(s.track.comparison.fingerprintId, 'fp_test000001');
  assert.equal(textOf(panelOf(m).querySelector('.tj-toast--success')), 'تغيّر مرجع المقارنة للترجمة 2.');
});

test('«النسخة السابقة»: مصدرها وتاريخها وسعتها، والاستعادة تبديل قابل للعكس بتأكيد، والحذف بتأكيد', async () => {
  const m = await mount();
  openMore(m, IDS[0], 'الترجمات');
  await settle(10);
  const prev = () => panelOf(m).querySelector('section.lib-prev');
  assert.match(textOf(prev()), /من الترجمة 2 · قبل ساعة · \d+ ك\.ب/);
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

  m.answers.push(true);
  buttonNamed(prev(), 'حذف').click();
  await settle(10);
  assert.equal((await m.store.getBundle(IDS[0])).previous, null);
  assert.ok(textOf(prev()).includes('لا نسخة سابقة'));
});

test('«نص دراسي…»: الصيغة واللغة ومعاينة الاسم، ثم الحفظ عبر saveFile؛ والثنائي معطّل بلا مسار إنجليزي', async () => {
  const m = await mount();
  m.answers.push(async (o) => {
    assert.ok(textOf(o.content).includes(`اسم الملف: ${IDS[0]}.ar.study.txt`));
    const md = findAll(o.content, (e) => e.tagName === 'input' && e.getAttribute('value') === 'md')[0];
    md.checked = true;
    md.dispatchEvent({ type: 'change' });
    const bi = findAll(o.content, (e) => e.tagName === 'input' && e.getAttribute('value') === 'bi')[0];
    assert.equal(bi.disabled, false);
    bi.checked = true;
    bi.dispatchEvent({ type: 'change' });
    await settle(5);
    assert.ok(textOf(o.content).includes(`اسم الملف: ${IDS[0]}.ar-en.study.md`));
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

test('التصدير يتبع saveFile: الإلغاء رسالة معلومة، والرجوع إلى التنزيل العادي SV_FALLBACK_BLOB، ولا بصمة لتصدير لم يحدث', async () => {
  let reply = { ok: false, code: 'SV_CANCELLED' };
  const m = await mount({ env: { saveFile: async () => reply } });
  openMore(m, IDS[1], 'الإنجليزية');
  await settle(10);
  assert.equal(textOf(m.root.querySelector('.tj-toast--info')), 'أُلغي الحفظ.');
  assert.equal((await m.store.getVideo(IDS[1])).fingerprints.length, 1, 'لا بصمة لتصدير أُلغي');
  reply = { ok: true, mode: 'blob', downloadId: null };
  openMore(m, IDS[1], 'العربية — النسخة الحالية');
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
  const copy = buttonNamed(rowFor(m, IDS[0]), 'نسخ التعليمات');
  copy.click();
  await settle(5);
  const terms = samplePrefs().glossary.terms;
  assert.equal(m.calls.clipboard[0], instructions({ videoId: IDS[0], title: 'عنوان', glossary: terms }));
  assert.ok(m.calls.clipboard[0].includes('- prompt = موجِّه'));
  await m.store.setPrefs({ glossary: { attach: false } });
  await m.area.flush();
  await settle(5);
  await m.clock.runAll();
  buttonNamed(rowFor(m, IDS[0]), 'نسخ التعليمات').click();
  await settle(5);
  assert.equal(m.calls.clipboard.at(-1), instructions({ videoId: IDS[0], title: 'عنوان' }));
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

test('تدقيق 5fedcb9 (CL-006، CL-015، GM-016.2): رسائل «الترجمات…» ومنطقتها الحية داخل الحوار وتعود بعده، واللوحة المفتوحة تتحدث بتغيّر من مكان آخر', async () => {
  const { activateSlot } = await import('../../../../src/pages/library/actions.js');
  const m = await mount();
  openMore(m, IDS[0], 'الترجمات');
  await settle(10);
  const panel = panelOf(m);
  assert.ok(panel.contains(m.lib.toaster.root) && panel.contains(m.lib.toaster.live), 'الحاويتان داخل الحوار');
  // تغيّر من سياق آخر (المشغّل أو تبويب آخر): الخانة 2 نشطة.
  await activateSlot({ store: m.store, videoId: IDS[0], n: 2, now: () => Date.parse(NOW) + 99999 });
  await m.area.flush();
  await new Promise((r) => setTimeout(r, 220));
  await settle(10);
  assert.ok(textOf(cardOf(panelOf(m), 2)).includes('نشطة'), 'اللوحة بالنسخة الأحدث');
  panel.close('x');
  await settle(5);
  assert.ok(m.root.contains(m.lib.toaster.root) && m.root.contains(m.lib.toaster.live), 'عادتا إلى الصفحة');
});
