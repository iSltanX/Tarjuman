// التحقق الأخير لـ2.3.0، ص-٨ (ح-54) مع ص-٢٤: حواف «عدّل النص» في لوحة النص. قرار سلطان (خطة 3.0.0، ST1): المرساة تشمل الخانة؛
// وما كُتب في الحقل لا يضيع بصمت (رسالة و«نسخ النص») حين تُحذف الترجمة من مكان آخر أو يتغيّر الفيديو أو تُغلق اللوحة؛ وضغطة تبدأ
// داخل الحقل وتُفلت خارجه بأقل من 5 بكسل لا تقفز (B3)؛ والمتابعة تعود حين يُغلق الحقل؛ وتنقية الحقل كتنقية الاستيراد؛ و«تراجع»
// بعد تبديل الخانة لا يكتب في خانة غير معروضة.
// مقارنة العقد بـassert.ok(a === b) لا assert.equal (رأس fake-dom.js). والمحارف الخفية بـString.fromCodePoint لا بتهريب في المصدر.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../../../../src/content/controller.js';
import { TjError } from '../../../../src/core/errors/index.js';
import { typedText } from '../../../../src/core/srt/lenient.js';
import { createStore } from '../../../../src/core/store/index.js';
import { mountPanel } from '../../../../src/player/panel/index.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW, fakeExtractor } from '../../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../../helpers/fixtures-v2.js';
import { A, B, arCues, click, makeState, settle, ui, watchPage } from './harness.js';

const ch = (...cps) => String.fromCodePoint(...cps);
const RLO = ch(0x202e);
const ZWSP = ch(0x200b);
const BEL = ch(0x7);
const BOM = ch(0xfeff);
const LS = ch(0x2028);

/** صفحة بترجمة نشطة في الخانة 2، ومتحكم وهمي يكتب نص المقطع في الخانة النشطة كما يفعل الحقيقي ويسجّل الخانة التي رآها المستدعي. */
function open({ cues = arCues(5) } = {}) {
  const page = watchPage({ state: makeState({ arabic: { cues }, marks: { slot: 2, items: [] } }) });
  const c = page.controller;
  c.editCueText = async ({ index, slot = null }, text) => {
    c.calls.push(['editCueText', index, text, slot, c.getState().activeSlot]);
    if (c.editGate) await c.editGate;
    if (c.editFail) {
      const err = c.editFail;
      c.editFail = null;
      throw err;
    }
    const at = c.getState().activeSlot;
    const before = c.getState().arabic.cues[index].text;
    const write = (value) => {
      const cur = c.getState().arabic;
      c.set({ arabic: { ...cur, edited: true, cues: cur.cues.map((x, i) => (i === index ? { ...x, text: value } : x)) } });
    };
    write(text);
    return {
      undo: async () => {
        c.calls.push(['undoEdit', index, at]);
        write(before);
      },
    };
  };
  // «علّم للمراجعة» كما يفعل الحقيقي: العلامة في الخانة النشطة، وتراجع يسجّل الخانة التي يكتب فيها.
  c.markCue = async ({ index }, kind = 'todo') => {
    const at = c.getState().activeSlot;
    c.calls.push(['markCue', index, kind, at]);
    return { mark: null, undo: async () => { c.calls.push(['undoMark', index, at]); } };
  };
  page.video.silentTo(0);
  const handle = page.mount();
  const copied = [];
  page.win.navigator = { clipboard: { writeText: async (t) => { copied.push(t); } } };
  return { page, handle, c, v: ui(page), copied };
}

const over = (el) => el.dispatchEvent({ type: 'pointerover', bubbles: true });
const btn = (v, act) => v.q('.acts').children.find((b) => b.getAttribute('data-act') === act);
const field = (v) => v.q('.edit__field');
const keydown = (el, key, extra = {}) => el.dispatchEvent({ type: 'keydown', bubbles: true, key, ...extra });
const writes = (c) => c.calls.filter((x) => x[0] === 'editCueText');
/** يفتح حقل صف i بنقرة مؤشر. والتركيز بلوحة المفاتيح على «عدّل النص» (بعد Enter أو Esc) يثبّت الشريط في صفه، فيُسقط أولًا. */
function openEdit(v, i) {
  v.root.activeElement?.blur?.();
  over(v.rows()[i]);
  click(btn(v, 'edit'));
  return field(v);
}

/** تبديل الترجمة النشطة إلى الخانة n كما يصل من قائمة المشغّل: مقاطع الخانة الجديدة (مصفوفة جديدة) وعلاماتها. */
function switchSlot(c, n, cuesOf = (cues) => cues.map((x) => ({ ...x }))) {
  const cur = c.getState();
  c.set({
    activeSlot: n,
    arabic: { ...cur.arabic, fileName: `slot${n}.srt`, cues: cuesOf(cur.arabic.cues) },
    slots: cur.slots.map((s) => ({ ...s, filled: s.filled || s.n === n, active: s.n === n })),
    marks: { slot: n, items: [] },
  });
}

/** يضغط زر الرسالة («نسخ النص» أو «تراجع») وينتظر. */
async function noteAct(v) {
  click(v.q('.note__act'));
  await settle();
}

// ———— المرساة تشمل الخانة ————

test('ص-٨: تبديل الخانة إلى ترجمة بالشكل نفسه ونص الصف نفسه يُغلق الحقل بـ«تغيّرت الترجمة» و«نسخ النص»، ولا يُكتب في الخانة الجديدة', async () => {
  const { v, c, handle, copied } = open();
  const f = openEdit(v, 1);
  f.value = 'مسودة للخانة 2';
  // الخانة 3: المقاطع بعددها وأزمنتها، والصف 1 بنصه نفسه («سطر 2») فمرساة المقطع وحدها لا تميّزه.
  switchSlot(c, 3, (cues) => cues.map((x, i) => (i === 1 ? { ...x } : { ...x, text: `آخر ${i}` })));
  await settle();
  assert.equal(field(v), null, 'الحقل أُغلق');
  assert.deepEqual(handle.peek().note, { text: 'تغيّرت الترجمة؛ لم يُحفظ تعديلك.', undo: true });
  assert.equal(v.q('.note__act').textContent, 'نسخ النص');
  await noteAct(v);
  assert.deepEqual(copied, ['مسودة للخانة 2']);
  assert.deepEqual(writes(c), [], 'لا كتابة');
});

test('ص-٨: تبديل الخانة بإعادة بناء (عدد آخر) وفيها مقطع بالمرساة نفسها لا يعيد فتح الحقل عليه، ويقول ما كُتب', async () => {
  const { v, c, handle } = open();
  const f = openEdit(v, 1);
  f.value = 'مسودة';
  switchSlot(c, 3, (cues) => cues.slice(0, 3).map((x) => ({ ...x })));
  await settle();
  assert.equal(field(v), null, 'لا حقل مفتوح على الخانة 3');
  assert.equal(handle.peek().note.text, 'تغيّرت الترجمة؛ لم يُحفظ تعديلك.');
  assert.deepEqual(writes(c), []);
});

test('ص-٨: تبديل الخانة والحقل كما فُتح يُغلقه بلا رسالة؛ والعودة إلى الخانة نفسها لا تعيده', async () => {
  const { v, c, handle } = open();
  openEdit(v, 2);
  switchSlot(c, 1);
  await settle();
  assert.equal(field(v), null);
  assert.equal(handle.peek().note, null, 'لا شيء ضاع');
  switchSlot(c, 2);
  await settle();
  assert.equal(field(v), null);
});

test('ص-٨: الحفظ يمرّر الخانة التي فُتح عليها الحقل، فالمتحكم يرفض إن صارت النشطة غيرها', async () => {
  const { v, c } = open();
  const f = openEdit(v, 1);
  f.value = 'نص';
  keydown(f, 'Enter');
  await settle();
  assert.deepEqual(writes(c), [['editCueText', 1, 'نص', 2, 2]]);
});

// ———— ما كُتب لا يضيع بصمت ————

test('ص-٨: حذف الترجمة من مكان آخر والحقل فيه ما كُتب: «تغيّرت الترجمة؛ لم يُحفظ تعديلك» و«نسخ النص»', async () => {
  const { v, c, handle, copied } = open();
  const f = openEdit(v, 1);
  f.value = 'لم يُحفظ';
  c.set({ arabic: null, activeSlot: null, marks: null });
  await settle();
  assert.equal(handle.peek().kind, 'empty');
  assert.deepEqual(handle.peek().note, { text: 'تغيّرت الترجمة؛ لم يُحفظ تعديلك.', undo: true });
  await noteAct(v);
  assert.deepEqual(copied, ['لم يُحفظ']);
});

test('ص-٨: تغيّر الفيديو (ومنه التشغيل التلقائي للتالي) والحقل فيه ما كُتب: «تغيّر الفيديو» و«نسخ النص» تبقى بعد تحميل التالي', async () => {
  const { v, c, page, handle, copied } = open();
  const f = openEdit(v, 1);
  f.value = 'سيضيع؟';
  // يوتيوب ينتقل أولًا، ثم يصل المتحكمَ الفيديو التالي: الرسالة لا تزول بتغيّر الفيديو كرسائل «تراجع».
  page.navigateTo(B);
  await settle();
  assert.deepEqual(handle.peek().note, { text: 'تغيّر الفيديو؛ لم يُحفظ تعديلك.', undo: true });
  c.set({ videoId: B, loading: true, arabic: null, activeSlot: null, marks: null });
  await settle();
  assert.equal(handle.peek().note?.text, 'تغيّر الفيديو؛ لم يُحفظ تعديلك.');
  c.set({ loading: false, arabic: { cues: arCues(4), edited: false, fileName: 'b.srt', comparison: null }, activeSlot: 2 });
  await settle();
  assert.equal(handle.peek().kind, 'ready');
  assert.equal(handle.peek().note?.text, 'تغيّر الفيديو؛ لم يُحفظ تعديلك.', 'الرسالة باقية مع الفيديو التالي');
  await noteAct(v);
  assert.deepEqual(copied, ['سيضيع؟']);
  assert.deepEqual(writes(c), []);
});

test('ص-٨: إغلاق اللوحة والحقل فيه ما كُتب: لا يضيع بصمت، فعند فتحها «أُغلقت اللوحة؛ لم يُحفظ تعديلك» و«نسخ النص»', async () => {
  const { v, c, handle, copied } = open();
  const f = openEdit(v, 1);
  f.value = 'كتبتُ ثم أغلقت';
  await c.updatePrefs({ ui: { panelOpen: false } });
  await settle();
  assert.equal(handle.peek().mode, 'none');
  // رسمان واللوحة مغلقة (تغيّر حالة من مكان آخر): الرسالة تنتظر الفتح ولا تُستهلك قبله.
  c.set({ title: 'عنوان آخر' });
  c.set({ title: 'عنوان ثالث' });
  await c.updatePrefs({ ui: { panelOpen: true } });
  await settle();
  assert.equal(field(v), null, 'لا حقل بعد الفتح');
  assert.deepEqual(handle.peek().note, { text: 'أُغلقت اللوحة؛ لم يُحفظ تعديلك.', undo: true });
  assert.equal(v.q('.note__act').textContent, 'نسخ النص');
  await noteAct(v);
  assert.deepEqual(copied, ['كتبتُ ثم أغلقت']);
});

test('ص-٨: إغلاق اللوحة والحقل كما فُتح لا يترك رسالة عند فتحها', async () => {
  const { v, c, handle } = open();
  openEdit(v, 1);
  await c.updatePrefs({ ui: { panelOpen: false } });
  await settle();
  await c.updatePrefs({ ui: { panelOpen: true } });
  await settle();
  assert.equal(handle.peek().note, null);
});

test('ص-٨: إخفاق الكتابة بعد أن زال الحقل (تبدّلت الخانة أثناء الحفظ) يُقال برسالة و«نسخ النص»، لا بصمت', async () => {
  const { v, c, handle, copied } = open();
  let release;
  c.editGate = new Promise((r) => { release = r; });
  c.editFail = new TjError('ST_CONFLICT', { detail: 'slot=2' });
  const f = openEdit(v, 1);
  f.value = 'أثناء الحفظ';
  keydown(f, 'Enter');
  await settle();
  switchSlot(c, 3);
  await settle();
  assert.equal(field(v), null, 'الحقل زال والكتابة جارية');
  release();
  await settle();
  await settle();
  assert.deepEqual(handle.peek().note, { text: 'تغيّرت الترجمة؛ لم يُحفظ تعديلك.', undo: true });
  await noteAct(v);
  assert.deepEqual(copied, ['أثناء الحفظ']);
});

// ———— B3 مع الحقل ————

test('ص-٨: ضغطة تبدأ داخل الحقل وتُفلت على نص الصف بأقل من 5 بكسل لا تقفز، والحقل باقٍ والتركيز فيه', async () => {
  const { v, page } = open();
  page.doc.getSelection = () => ({ isCollapsed: true, toString: () => '' });
  const f = openEdit(v, 1);
  page.video.writes.length = 0;
  const ptr = (type, el, x, y) => el.dispatchEvent({ type, bubbles: true, clientX: x, clientY: y, button: 0, pointerType: 'mouse' });
  ptr('pointerdown', f, 100, 60);
  ptr('pointermove', f, 103, 60);
  v.rows()[1].children[1].dispatchEvent({ type: 'click', bubbles: true, detail: 1, clientX: 103, clientY: 60 });
  assert.deepEqual(page.video.writes, [], 'لا قفز');
  assert.ok(field(v) === f, 'الحقل باقٍ');
  assert.ok(v.root.activeElement === f, 'والتركيز فيه');
  // وضغطة على «حفظ» تُفلت على الصف بعد 2 بكسل: لا قفز ولا حفظ.
  ptr('pointerdown', v.q('.edit__save'), 200, 70);
  v.rows()[1].dispatchEvent({ type: 'click', bubbles: true, detail: 1, clientX: 202, clientY: 70 });
  assert.deepEqual(page.video.writes, []);
  assert.ok(field(v) === f);
  // والنقرة العادية على صف آخر تقفز كما كانت (B3).
  const ar = v.rows()[3].querySelector('.ar');
  ptr('pointerdown', ar, 100, 160);
  ar.dispatchEvent({ type: 'click', bubbles: true, detail: 1, clientX: 100, clientY: 160 });
  assert.equal(page.video.writes.length, 1, 'نقرة على نص صف آخر تقفز');
});

// ———— المتابعة تعود حين يُغلق الحقل ————

test('ص-٢٤: المتابعة معلّقة ما دام الحقل مفتوحًا، وتعود حين يُغلق بالإلغاء أو بالحفظ أو بتغيّر مقطعه', async () => {
  const { v, c, handle } = open();
  assert.equal(handle.peek().follow, true);
  let f = openEdit(v, 1);
  assert.equal(handle.peek().follow, false, 'معلّقة والحقل مفتوح');
  keydown(f, 'Escape');
  await settle();
  assert.equal(handle.peek().follow, true, 'Esc: تعود');
  assert.equal(handle.peek().resume, null, 'ولا «العودة إلى ‹الزمن›»');
  f = openEdit(v, 2);
  f.value = 'محفوظ';
  keydown(f, 'Enter');
  await settle();
  assert.equal(field(v), null);
  assert.equal(handle.peek().follow, true, 'الحفظ: تعود');
  f = openEdit(v, 3);
  f.value = 'ضائع';
  const cur = c.getState().arabic;
  c.set({ arabic: { ...cur, cues: cur.cues.map((x, i) => (i === 3 ? { ...x, text: 'من المحرّر' } : x)) } });
  await settle();
  assert.equal(field(v), null);
  assert.equal(handle.peek().follow, true, 'تغيّر المقطع: تعود');
});

test('ص-٢٤: إغلاق الحقل لا يعيد متابعة أوقفها المستخدم قبل فتحه أو أثناءه', async () => {
  const { v, handle } = open();
  const sw = v.q('.switch');
  click(sw);
  assert.equal(handle.peek().follow, false, 'أوقفها المستخدم');
  let f = openEdit(v, 1);
  keydown(f, 'Escape');
  await settle();
  assert.equal(handle.peek().follow, false, 'كانت موقوفة قبل الفتح: تبقى');
  click(sw);
  assert.equal(handle.peek().follow, true);
  f = openEdit(v, 1);
  click(v.q('.resume'));
  click(sw);
  assert.equal(handle.peek().follow, false, 'أوقفها أثناء الحقل بمفتاحها');
  keydown(f, 'Escape');
  await settle();
  assert.equal(handle.peek().follow, false, 'اختياره يبقى');
});

// ———— تنقية الحقل كتنقية الاستيراد ————

test('ص-٢٤: typedText ينقّي نص الحقل كما ينقّي الاستيراد نص المقطع من حيث المحارف', () => {
  assert.equal(typedText(`أ${RLO}ب${BEL}ج${BOM}`), 'أبج', 'تجاوز الاتجاه والتحكم وBOM');
  assert.equal(typedText(`  سطر أول  \r\nسطر ثانٍ${LS}ثالث`), 'سطر أول\nسطر ثانٍ\nثالث', 'فواصل الأسطر LF وأطرافها بلا مسافات');
  assert.equal(typedText(`أول\n${ZWSP}\nثانٍ`), 'أول\nثانٍ', 'سطر فيه محرف خفي وحده يُسقط (ن-٣)');
  assert.equal(typedText(`أول\n${RLO}\nثانٍ`), 'أول\nثانٍ', 'وسطر فرغ بالتنقية');
  assert.equal(typedText('أول\n\nثانٍ'), 'أول\n\nثانٍ', 'والسطر الفارغ بين سطرين يبقى، فيقول الحارس سببه');
  assert.equal(typedText('\n  \nنص\n\n'), 'نص', 'وأسطر الأطراف الفارغة حدّ لا نص (Shift+Enter في آخره)');
  assert.equal(typedText(`  ${RLO} \n${ZWSP}`), '', 'وما فرغ كله فارغ');
  assert.equal(typedText(`كلمة${ZWSP}أخرى`), `كلمة${ZWSP}أخرى`, 'ZWSP داخل السطر مشروعة كالاستيراد');
  assert.equal(typedText('<i>مائل</i>'), '<i>مائل</i>', 'والوسوم نص كما كُتب');
  const once = typedText(`  أ${RLO}\n${ZWSP}\nب  `);
  assert.equal(typedText(once), once, 'ثابتة بالتكرار');
});

test('ص-٢٤: الحقل يُحفظ منقّى، وما فرغ بالتنقية وحدها فارغ يمنعه الحارس، وما صار نص المقطع نفسه يُغلق بلا كتابة', async () => {
  const { v, c } = open();
  let f = openEdit(v, 1);
  f.value = `نص${RLO} مع${BEL} محارف\n${ZWSP}\n${BOM}خفية`;
  keydown(f, 'Enter');
  await settle();
  assert.deepEqual(writes(c).map((x) => x[2]), ['نص مع محارف\nخفية']);
  assert.equal(field(v), null, 'أُغلق بعد الحفظ المنقّى');
  assert.equal(c.getState().arabic.cues[1].text, 'نص مع محارف\nخفية');
  f = openEdit(v, 2);
  f.value = `${RLO}${ZWSP}${BOM}`;
  keydown(f, 'Enter');
  await settle();
  assert.ok(field(v) === f, 'الحقل باقٍ');
  assert.match(v.q('.edit__msg').textContent, /بلا نص/);
  f.value = 'سطر 3  ';
  keydown(f, 'Enter');
  await settle();
  assert.equal(field(v), null, 'نص المقطع نفسه بعد التنقية: يُغلق');
  assert.equal(writes(c).length, 1, 'بلا كتابة');
});

// ———— «تراجع» بعد تبديل الخانة ————

test('ص-٢٤: «تراجع» بعد تبديل الخانة لا يكتب في خانة غير معروضة ويقول ذلك؛ وبعد العودة إليها يتراجع', async () => {
  const { v, c, handle } = open();
  let f = openEdit(v, 1);
  f.value = 'تعديل';
  keydown(f, 'Enter');
  await settle();
  assert.equal(handle.peek().note.text, 'عُدِّل نص المقطع 2');
  switchSlot(c, 3);
  await settle();
  assert.equal(handle.peek().note?.undo, true, 'الرسالة باقية');
  await noteAct(v);
  assert.deepEqual(c.calls.filter((x) => x[0] === 'undoEdit'), [], 'لا تراجع في الخانة 2 وهي غير معروضة');
  assert.equal(handle.peek().note.text, 'تغيّرت الترجمة النشطة، فتعذّر التراجع.');
  // التراجع في الخانة نفسها بعد العودة إليها.
  switchSlot(c, 2);
  f = openEdit(v, 2);
  f.value = 'ثانٍ';
  keydown(f, 'Enter');
  await settle();
  switchSlot(c, 1);
  switchSlot(c, 2);
  await settle();
  await noteAct(v);
  assert.deepEqual(c.calls.filter((x) => x[0] === 'undoEdit'), [['undoEdit', 2, 2]]);
});

test('ص-٢٤: «تراجع» علامة الصف بعد تبديل الخانة لا يكتب في خانة غير معروضة ويقول ذلك برسالة التراجعين نفسها؛ وبعد العودة إليها يتراجع', async () => {
  const { v, c, handle } = open();
  const undos = () => c.calls.filter((x) => x[0] === 'undoMark');
  over(v.rows()[1]);
  click(btn(v, 'mark'));
  await settle();
  assert.equal(handle.peek().note.text, 'عُلِّم المقطع 2 للمراجعة');
  switchSlot(c, 3);
  await settle();
  assert.equal(handle.peek().note?.undo, true, 'الرسالة باقية');
  await noteAct(v);
  assert.deepEqual(undos(), [], 'لا تراجع في الخانة 2 وهي غير معروضة');
  assert.equal(handle.peek().note.text, 'تغيّرت الترجمة النشطة، فتعذّر التراجع.');
  switchSlot(c, 2);
  await settle();
  over(v.rows()[3]);
  click(btn(v, 'mark'));
  await settle();
  switchSlot(c, 1);
  switchSlot(c, 2);
  await settle();
  await noteAct(v);
  assert.deepEqual(undos(), [['undoMark', 3, 2]], 'في خانتها وهي النشطة: يتراجع');
});

// ———— فوق المتحكم والتخزين الحقيقيين (مجسّ f-r5 في التحقق الأخير، P1 بالنص نفسه) ————

test('ص-٨: فوق المتحكم الحقيقي: تبديل الخانة إلى ترجمة فيها المقطع نفسه رقمًا وزمنًا ونصًّا يُغلق الحقل، فلا يُحفظ ما كُتب في الخانة الأخرى', async () => {
  const area = createMemoryArea({ unlimited: true });
  let t = Date.parse(NOW);
  const now = () => (t += 1000);
  const store = createStore({ area, now });
  const bundle = sampleBundle({ videoId: A, active: 2 });
  // الخانة 1 والخانة 2 بالشكل نفسه (makeCues(5))، والمقطع 2 فيهما بالنص نفسه: مرساته وحدها لا تميّز خانته.
  bundle.slots[0].track.current[1].text = bundle.slots[1].track.original[1].text;
  await seedBundle(store, bundle);
  const page = watchPage();
  const controller = createController({ store, now, extractor: fakeExtractor({ videoId: A, tracks: [] }), page: { title: () => 'محاضرة', durationMs: () => 30000 } });
  store.onChange((change) => controller.handleStoreChange(change));
  await controller.start(A);
  await controller.updatePrefs({ ui: { panelOpen: true } });
  const flushAll = async () => {
    for (let i = 0; i < 8; i++) {
      await area.flush();
      await new Promise((r) => setTimeout(r, 0));
    }
  };
  await flushAll();
  page.video.silentTo(8);
  const handle = mountPanel(controller, { doc: page.doc, win: page.win, uiFonts: null });
  await flushAll();
  const v = ui(page);
  const before = structuredClone((await store.getBundle(A)).slots.map((s) => s.track));
  const f = openEdit(v, 1);
  f.value = 'كُتب للخانة 2';
  await controller.activateSlot(1);
  await flushAll();
  assert.equal(field(v), null, 'الحقل أُغلق');
  assert.equal(handle.peek().note?.text, 'تغيّرت الترجمة؛ لم يُحفظ تعديلك.');
  const after = (await store.getBundle(A)).slots.map((s) => s.track);
  assert.deepEqual(after[0], before[0], 'الخانة 1 كما هي');
  assert.deepEqual(after[1], before[1], 'والخانة 2 كما هي');
  handle.unmount();
});
