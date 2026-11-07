// تدقيق 7a66f91، U103 (T-01): حوار الإنقاذ (rescue-dialog) وحوار الانجراف (drift-dialog) ولوحة الاستكمال (complete-panel) كانت
// أدنى الملفات تغطية (23% و31% و52%، ودوال الأول 0%). هنا بالـDOM الوهمي للمحرّر نفسه؛ والقواعد الحسابية مختبرة في core/edit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planRescue } from '../../../../src/core/edit/rescue.js';
import { openRescueDialog } from '../../../../src/pages/editor/rescue-dialog.js';
import { openDriftDialog } from '../../../../src/pages/editor/drift-dialog.js';
import { previewPatch, renderCompletePanel } from '../../../../src/pages/editor/complete-panel.js';
import { messageFor } from '../../../../src/core/errors/index.js';
import { makeCues } from '../../../helpers/fixtures.js';
import { editorDocument, settle } from '../../../helpers/editor-dom.js';
import { findAll, textOf } from '../library/fake-dom.js';

const dialogOf = (doc) => doc.querySelector('dialog[open]');
const btn = (root, part) => findAll(root, (e) => e.tagName === 'button' && textOf(e).includes(part))[0];
const env = () => editorDocument({ videoId: 'AAAAAAAAAAA' });
const OFFS = { base: 0, mine: 0, theirs: 0 };
const withText = (cues, edits) => cues.map((c) => (edits[c.n] !== undefined ? { ...c, text: edits[c.n] } : c));

// ---- rescue-dialog ----

test('الإنقاذ: دمج متعذّر: حوار خطر بزرّي «تصدير نسختي» و«إغلاق»، والتصدير يعيد export والإغلاق null', async () => {
  const first = { ok: false, reason: 'سبب مفتعل' };
  for (const [name, want] of [['تصدير نسختي', 'export'], ['إغلاق', null]]) {
    const e = env();
    const done = openRescueDialog({ doc: e.doc, first, offsets: OFFS });
    await settle();
    const dlg = dialogOf(e.doc);
    assert.ok(dlg.className.includes('tj-dialog--danger'));
    assert.ok(textOf(dlg).includes('سبب مفتعل'));
    assert.ok(textOf(dlg).includes('تعديلاتك ما زالت هنا'));
    btn(dlg, name).dispatchEvent({ type: 'click' });
    dlg.close(want ?? 'cancel');
    assert.equal(await done, want);
  }
});

test('الإنقاذ: تعارض نص واحد: الأحدث افتراضي، واختيار «تعديلي» يدخل في resolve، والتطبيق يعيد الاختيارين', async () => {
  const base = makeCues(4);
  const mine = withText(base, { 2: 'تعديلي', 3: 'ثالث مني' });
  const theirs = withText(base, { 2: 'الأحدث', 4: 'رابع منهم' });
  const first = planRescue({ base, mine, theirs, offsets: OFFS });
  assert.equal(first.ok, true);
  assert.equal(first.conflicts.length, 1);
  const e = env();
  const done = openRescueDialog({ doc: e.doc, first, offsets: OFFS });
  await settle();
  const dlg = dialogOf(e.doc);
  const text = textOf(dlg);
  assert.ok(text.includes('المقطع 2'), text);
  assert.ok(text.includes('الأحدث: الأحدث'), text);
  assert.ok(text.includes('تعديلي: تعديلي'), text);
  assert.ok(text.includes(`تطبيق غير المتعارض (${first.kept.length})`), text);
  assert.equal(dlg.querySelectorAll('fieldset').length, 1, 'لا إزاحة متعارضة');
  const mineRadio = findAll(dlg, (x) => x.tagName === 'input' && x.getAttribute('value') === 'mine')[0];
  mineRadio.dispatchEvent({ type: 'change' });
  dlg.close('apply');
  const out = await done;
  assert.deepEqual(out, { resolve: { [first.conflicts[0].key]: 'mine' }, offsetChoice: 'theirs' });
});

test('الإنقاذ: تعارض إزاحة: صندوق إزاحة باختيارين، واختيار «إزاحتي» يُعاد', async () => {
  const base = makeCues(3);
  const offsets = { base: 0, mine: 500, theirs: 1000 };
  const first = planRescue({ base, mine: base, theirs: base, offsets });
  assert.equal(first.offsetConflict, true);
  const e = env();
  const done = openRescueDialog({ doc: e.doc, first, offsets });
  await settle();
  const dlg = dialogOf(e.doc);
  assert.ok(textOf(dlg).includes('إزاحة العرض'));
  assert.ok(textOf(dlg).includes('الأحدث:') && textOf(dlg).includes('إزاحتي:'));
  const radios = findAll(dlg, (x) => x.tagName === 'input' && x.getAttribute('name') === 'ed-rescue-offset');
  assert.equal(radios.length, 2);
  radios.find((r) => r.getAttribute('value') === 'mine').dispatchEvent({ type: 'change' });
  dlg.close('apply');
  assert.deepEqual(await done, { resolve: {}, offsetChoice: 'mine' });
});

test('الإنقاذ: «تصدير نسختي…» يعيد export، والإلغاء وEsc يعيدان null، ولا قائمة تعارض حين لا تعارض', async () => {
  const base = makeCues(3);
  const first = planRescue({ base, mine: withText(base, { 1: 'م' }), theirs: withText(base, { 3: 'ن' }), offsets: OFFS });
  assert.equal(first.conflicts.length, 0);
  const results = [];
  for (const value of ['export', 'cancel', '']) {
    const e = env();
    const done = openRescueDialog({ doc: e.doc, first, offsets: OFFS });
    await settle();
    const dlg = dialogOf(e.doc);
    assert.equal(dlg.querySelectorAll('.ed-rescue-list').length, 0);
    dlg.close(value);
    results.push(await done);
  }
  assert.deepEqual(results, ['export', null, null]);
});

test('الإنقاذ: مقطع محذوف عند أحد الطرفين يظهر «(حُذف)»، والأسطر المتعددة تُسطَّح بشرطة مائلة', async () => {
  const base = makeCues(3);
  const mine = withText(base, { 2: 'سطر\nثانٍ' });
  const theirs = base.filter((c) => c.n !== 2);
  const first = planRescue({ base, mine, theirs, offsets: OFFS });
  assert.equal(first.ok, true);
  assert.equal(first.conflicts.length, 1);
  const e = env();
  const done = openRescueDialog({ doc: e.doc, first, offsets: OFFS });
  await settle();
  const text = textOf(dialogOf(e.doc));
  assert.ok(text.includes('(حُذف)'), text);
  assert.ok(text.includes('سطر / ثانٍ'), text);
  dialogOf(e.doc).close('cancel');
  await done;
});

// ---- drift-dialog ----

async function openDrift(cues, activeIndex = null) {
  const e = env();
  const done = openDriftDialog({ doc: e.doc, cues, activeIndex });
  await settle();
  const dlg = dialogOf(e.doc);
  const [nA, nB] = dlg.querySelectorAll('input[inputmode=numeric]');
  const [tA, tB] = dlg.querySelectorAll('input.ed-time');
  const type = (input, value) => { input.value = value; input.dispatchEvent({ type: 'input' }); };
  return { e, dlg, done, nA, nB, tA, tB, type };
}

test('الانجراف: أقل من مقطعين: رسالة ويعيد null بلا نقطتين', async () => {
  const e = env();
  const done = openDriftDialog({ doc: e.doc, cues: makeCues(1), activeIndex: null });
  await settle();
  const dlg = dialogOf(e.doc);
  assert.ok(textOf(dlg).includes('يلزم مقطعان على الأقل'));
  dlg.close('ok');
  assert.equal(await done, null);
});

test('الانجراف: معاينة حية بالفرق بالثواني، والتطبيق يعيد المرساتين بأرقامهما وأزمنتهما', async () => {
  const cues = makeCues(10);
  const d = await openDrift(cues);
  d.nA.value = '1'; d.nB.value = '10';
  d.type(d.tA, '+1.0');
  d.type(d.tB, '+2.0');
  const text = textOf(d.dlg);
  assert.ok(text.includes('يتغير توقيت'), text);
  assert.ok(!text.includes('لا يُطبَّق'), text);
  assert.ok(findAll(d.dlg, (x) => x.tagName === 'tr').length >= 3, 'جدول العيّنات');
  d.dlg.close('apply');
  const out = await d.done;
  assert.equal(out.a.n, 1);
  assert.equal(out.a.toMs, cues[0].startMs + 1000);
  assert.equal(out.b.n, 10);
  assert.equal(out.b.toMs, cues[9].startMs + 2000);
});

test('الانجراف: زمن كامل بصيغة HH:MM:SS,mmm يُقبل، وزمن غير مقروء أو رقم مقطع غير موجود يمنع بسببه', async () => {
  const d = await openDrift(makeCues(5));
  d.nA.value = '1'; d.nB.value = '5';
  d.type(d.tA, '00:00:02,000');
  d.type(d.tB, 'ليس زمنًا');
  assert.ok(textOf(d.dlg).includes('اكتب زمنًا مثل'), textOf(d.dlg));
  assert.ok(textOf(d.dlg).includes('أكمل النقطتين أولًا'));
  d.type(d.tB, '+1');
  d.type(d.nB, '99');
  assert.ok(textOf(d.dlg).includes('لا مقطع بهذا الرقم'));
  d.dlg.close('apply'); // تطبيق مع نتيجة غير صالحة: يعيد null لا نتيجة قديمة
  assert.equal(await d.done, null);
});

test('الانجراف: تصحيح يدفع مقاطع قبل الصفر يُرفض برقم المقاطع، والإلغاء يعيد null', async () => {
  const d = await openDrift(makeCues(5));
  d.nA.value = '1'; d.nB.value = '5';
  d.type(d.tA, '-0.9'); // البداية 1.0 ث -> 0.1، والنقطة الثانية تمد الخط إلى ما قبل الصفر
  d.type(d.tB, '+5');
  d.type(d.tA, '00:00:00,000');
  d.type(d.tB, '00:00:00,500');
  const text = textOf(d.dlg);
  assert.ok(text.includes('لا يُطبَّق') || text.includes('يتغير توقيت'), text);
  d.dlg.close('cancel');
  assert.equal(await d.done, null);
});

test('الانجراف: النقطتان متطابقتان مع الحالي: «لا شيء يتغير» والزر معطّل بسبب', async () => {
  const cues = makeCues(5);
  const d = await openDrift(cues);
  d.nA.value = '1'; d.nB.value = '5';
  d.type(d.tA, '+0');
  d.type(d.tB, '+0');
  assert.ok(textOf(d.dlg).includes('مطابق للنقطتين'), textOf(d.dlg));
  const apply = btn(d.dlg, 'تطبيق التصحيح');
  assert.equal(apply.getAttribute('aria-disabled'), 'true');
  d.dlg.close('cancel');
  await d.done;
});

test('الانجراف: النقطة الثانية الافتراضية هي المقطع النشط حين يكون بعد الأول', async () => {
  const e = env();
  const cues = makeCues(10);
  const done = openDriftDialog({ doc: e.doc, cues, activeIndex: 4 });
  await settle();
  const dlg = dialogOf(e.doc);
  const aria = findAll(dlg, (x) => x.tagName === 'input').map((x) => x.getAttribute('aria-label'));
  assert.ok(aria.some((a) => a?.includes('النقطة الثانية')));
  dlg.close('cancel');
  assert.equal(await done, null);
});

// ---- complete-panel ----

const panelOpts = (doc, over = {}) => ({
  doc, reason: null, groups: { missing: [1, 2], empty: [3], noArabic: [], marked: [], selected: [] }, picks: { missing: true },
  numbers: [1, 2], parts: null, glossaryCount: 0, readOnly: null, busy: false,
  onPick() {}, onDownload() {}, onCopy() {}, onImport() {}, ...over,
});

test('لوحة الاستكمال: مربعات المجموعات بأعدادها، والأزرار تستدعي المعالجات، والتعطيل بسبب', () => {
  const e = env();
  const calls = [];
  const box = e.doc.createElement('section');
  renderCompletePanel(box, panelOpts(e.doc, {
    glossaryCount: 3, parts: [{ index: 1, from: 1, to: 50, total: 50, received: 50, complete: true }, { index: 2, from: 51, to: 90, total: 40, received: 10, complete: false }],
    onPick: (k, on) => calls.push(['pick', k, on]), onDownload: () => calls.push(['download']), onCopy: () => calls.push(['copy']),
  }));
  const text = textOf(box);
  assert.ok(text.includes('الناقص (2)') && text.includes('الفارغ (1)') && text.includes('غير مترجمة (0)'), text);
  assert.ok(text.includes('+ القاموس (3)'));
  assert.ok(text.includes('مستلم') && text.includes('10 من 40'), text);
  const boxes = findAll(box, (x) => x.tagName === 'input' && x.getAttribute('type') === 'checkbox');
  assert.equal(boxes.length, 5);
  assert.equal(boxes[0].checked, true);
  assert.equal(boxes[0].disabled, false);
  assert.equal(boxes[2].disabled, true, 'مجموعة فارغة غير محددة');
  boxes[1].checked = true;
  boxes[1].dispatchEvent({ type: 'change' });
  btn(box, 'تنزيل ملف الاستكمال').dispatchEvent({ type: 'click' });
  btn(box, 'نسخ تعليماته').dispatchEvent({ type: 'click' });
  assert.deepEqual(calls, [['pick', 'empty', true], ['download'], ['copy']]);
});

test('لوحة الاستكمال: لا أرقام مختارة تعطّل التنزيل بسببه، والسبب العام يعطّل كل شيء ويظهر في تنبيه', () => {
  const e = env();
  const box = e.doc.createElement('section');
  renderCompletePanel(box, panelOpts(e.doc, { numbers: [], picks: {} }));
  const dl = btn(box, 'تنزيل ملف الاستكمال');
  assert.equal(dl.getAttribute('aria-disabled'), 'true');
  assert.ok(dl.title.includes(messageFor('ED_COMPLETE_NOTHING')) || textOf(dl).includes(messageFor('ED_COMPLETE_NOTHING')));
  assert.ok(textOf(box).includes('لا مختار'));
  renderCompletePanel(box, panelOpts(e.doc, { reason: 'لا أصل إنجليزي', readOnly: null }));
  assert.ok(textOf(box).includes('لا أصل إنجليزي') && textOf(box).includes('لا يُبنى ملف الاستكمال الآن'));
  for (const name of ['تنزيل ملف الاستكمال', 'نسخ تعليماته', 'استيراد ملف تصحيح']) assert.equal(btn(box, name).getAttribute('aria-disabled'), 'true', name);
  assert.ok(findAll(box, (x) => x.tagName === 'input' && x.getAttribute('type') === 'checkbox').every((c) => c.disabled));
});

test('لوحة الاستكمال: الاستيراد القرائي يعطّل زره، وتغيّر حقل الملف يمرّر الملفات ويفرّغ القيمة، وبلا ملفات لا يستدعي', () => {
  const e = env();
  const got = [];
  const box = e.doc.createElement('section');
  renderCompletePanel(box, panelOpts(e.doc, { readOnly: 'للقراءة فقط', onImport: (f) => got.push(f) }));
  assert.equal(btn(box, 'استيراد ملف تصحيح').getAttribute('aria-disabled'), 'true');
  const file = findAll(box, (x) => x.tagName === 'input' && x.getAttribute('type') === 'file')[0];
  file.files = [{ name: 'a.srt' }];
  file.value = 'C:\\a.srt';
  file.dispatchEvent({ type: 'change' });
  assert.deepEqual(got.map((f) => f.map((x) => x.name)), [['a.srt']]);
  assert.equal(file.value, '');
  file.files = [];
  file.dispatchEvent({ type: 'change' });
  assert.equal(got.length, 1);
  let clicked = 0;
  file.click = () => { clicked++; };
  renderCompletePanel(box, panelOpts(e.doc, { onImport: () => {} }));
  const file2 = findAll(box, (x) => x.tagName === 'input' && x.getAttribute('type') === 'file')[0];
  file2.click = () => { clicked++; };
  btn(box, 'استيراد ملف تصحيح').dispatchEvent({ type: 'click' });
  assert.equal(clicked, 1);
});

const plan = (over = {}) => ({
  items: [
    { n: 1, action: 'replace', before: { text: 'قديم' }, after: { text: 'جديد' } },
    { n: 2, action: 'replace', before: { text: '' }, after: { text: 'من فارغ' } },
    { n: 3, action: 'insert', after: { startMs: 5000, text: 'سطر\nمدرج' } },
  ],
  warnings: [], notes: [], ...over,
});

test('معاينة الملف: كل البنود مختارة افتراضيًا، وإلغاء تحديد بند يغيّر العدّاد والنتيجة، والتطبيق يعيد الأرقام مرتبة', async () => {
  const e = env();
  const done = previewPatch({ doc: e.doc, plan: plan({ notes: ['ملاحظة'], warnings: [] }) });
  await settle();
  const dlg = dialogOf(e.doc);
  let text = textOf(dlg);
  assert.ok(text.includes('2 استبدال و1 إدراج'), text);
  assert.ok(text.includes('(فارغ)') && text.includes('سطر / مدرج') && text.includes('ملاحظات القراءة (1)'), text);
  assert.ok(text.includes('المختار 3 مقاطع من 3') || text.includes('من 3'), text);
  const boxes = findAll(dlg, (x) => x.tagName === 'input' && x.getAttribute('type') === 'checkbox');
  assert.equal(boxes.length, 3);
  boxes[0].checked = false;
  boxes[0].dispatchEvent({ type: 'change' });
  assert.ok(textOf(dlg).includes('من 3'));
  assert.ok(btn(dlg, 'تطبيق').textContent.includes('تطبيق 2'));
  dlg.close('apply');
  assert.deepEqual(await done, [2, 3]);
});

test('معاينة الملف: إلغاء كل البنود يعطّل التطبيق، والإلغاء يعيد null، وبلا بنود تظهر رسالة وتحذيرات الخطة', async () => {
  const e = env();
  const done = previewPatch({ doc: e.doc, plan: plan() });
  await settle();
  const dlg = dialogOf(e.doc);
  for (const b of findAll(dlg, (x) => x.tagName === 'input' && x.getAttribute('type') === 'checkbox')) {
    b.checked = false;
    b.dispatchEvent({ type: 'change' });
  }
  assert.equal(btn(dlg, 'تطبيق 0').getAttribute('aria-disabled'), 'true');
  dlg.close('apply'); // تطبيق بلا مختار يعيد null
  assert.equal(await done, null);

  const e2 = env();
  const done2 = previewPatch({ doc: e2.doc, plan: plan({ items: [], warnings: [{ code: 'ED_COMPLETE_NOTHING', params: {} }] }) });
  await settle();
  const dlg2 = dialogOf(e2.doc);
  assert.ok(textOf(dlg2).includes('لا بند يُطبَّق'));
  assert.ok(textOf(dlg2).includes('تنبيه'));
  dlg2.close('cancel');
  assert.equal(await done2, null);
});

test('معاينة الملف: أكثر من 300 بند: تُعرض الأولى 300 فقط مع تنبيه أن الباقي يُطبَّق', async () => {
  const items = Array.from({ length: 305 }, (_, i) => ({ n: i + 1, action: 'replace', before: { text: 'أ' }, after: { text: 'ب' } }));
  const e = env();
  const done = previewPatch({ doc: e.doc, plan: plan({ items }) });
  await settle();
  const dlg = dialogOf(e.doc);
  assert.equal(findAll(dlg, (x) => x.tagName === 'input' && x.getAttribute('type') === 'checkbox').length, 300);
  assert.ok(textOf(dlg).includes('تُعرض أول 300'));
  dlg.close('apply');
  assert.equal((await done).length, 305);
});
