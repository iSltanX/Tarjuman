// ف9 (2026-11-10): «علّم للمراجعة» و«أسمع هذه الآن» من صف اللوحة. شريط واحد يُنقل إلى الصف الممرور عليه أو المركّز، والعلامة
// «أعود إليه» سمة على صفها تُرى دائمًا، والمزامنة للجمل القريبة من لحظة التشغيل وحدها ومعطّلة أثناء الإعلان، ورسالة فيها «تراجع».
// والفكرة ٦ (ح-54): «عدّل النص» زر ثالث في الشريط نفسه، وحقل مكان نص الصف بنصه الخام.
// مقارنة العقد بـassert.ok(a === b) لا assert.equal: فشل assert.equal على عقدة من الـDOM الوهمي يستنزف الذاكرة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TjError } from '../../../../src/core/errors/index.js';
import { markAnchor, sameAnchor } from '../../../../src/core/model/marks.js';
import { offsetToast } from '../../../../src/player/controls/text.js';
import { arCues, click, makeState, settle, ui, watchPage } from './harness.js';

/** صفحة مفتوحة بعلامات الخانة 2، ومتحكم وهمي يكتب العلامات في حالته كما يفعل الحقيقي (markCue بتراجع). */
function open({ cues = arCues(5), t = 0, marks = [] } = {}) {
  const page = watchPage({ state: makeState({ arabic: { cues }, marks: { slot: 2, items: marks } }) });
  const c = page.controller;
  c.markCue = async ({ index }, kind = 'todo') => {
    c.calls.push(['markCue', index, kind]);
    const s = c.getState();
    const cue = s.arabic.cues[index];
    const before = s.marks.items.filter((m) => sameAnchor(m, markAnchor(cue)));
    const mark = kind ? { ...markAnchor(cue), kind, at: '2026-11-10T00:00:00.000Z' } : null;
    const write = (items) => c.set({ marks: { slot: 2, items } });
    write([...s.marks.items.filter((m) => !before.includes(m)), ...(mark ? [mark] : [])]);
    return {
      mark,
      undo: async () => {
        c.calls.push(['undoMark', index]);
        write([...c.getState().marks.items.filter((m) => !mark || !sameAnchor(m, mark)), ...before]);
      },
    };
  };
  // تحرير نص المقطع (الفكرة ٦) كما يفعل الحقيقي: مصفوفة مقاطع جديدة بالنص الجديد، وتراجع يعيد السابق؛ وeditFail يرفض مرة.
  c.editCueText = async ({ index }, text) => {
    c.calls.push(['editCueText', index, text]);
    if (c.editFail) {
      const err = c.editFail;
      c.editFail = null;
      throw err;
    }
    const before = c.getState().arabic.cues[index].text;
    const write = (value) => {
      const cur = c.getState().arabic;
      c.set({ arabic: { ...cur, edited: true, cues: cur.cues.map((x, i) => (i === index ? { ...x, text: value } : x)) } });
    };
    write(text);
    return {
      undo: async () => {
        c.calls.push(['undoEdit', index]);
        write(before);
      },
    };
  };
  page.video.silentTo(t);
  const handle = page.mount();
  return { page, handle, c, v: ui(page) };
}

const over = (el) => el.dispatchEvent({ type: 'pointerover', bubbles: true });
const actsOf = (v) => v.q('.acts');
const btn = (v, act) => actsOf(v).children.find((b) => b.getAttribute('data-act') === act);

test('الشريط واحد للقائمة: في صف نقطة Tab بعد البناء، وينتقل إلى الصف الممرور عليه، ويعود عند مغادرة القائمة', () => {
  const { v, handle } = open();
  const rows = v.rows();
  assert.equal(v.qa('.acts').length, 1, 'شريط واحد لا شريط لكل صف');
  assert.ok(actsOf(v).parentNode === rows[0]);
  over(rows[3].children[1]);
  assert.ok(actsOf(v).parentNode === rows[3]);
  assert.equal(handle.peek().actsRow, 3);
  v.list.dispatchEvent({ type: 'pointerleave' });
  assert.ok(actsOf(v).parentNode === rows[0], 'يعود إلى صف نقطة Tab');
});

test('أسماء الوصول: «علّم للمراجعة» مضغوط أو لا، و«أسمع هذه الآن»، وكلاهما موصوف بنص صفه، وزمن الصف يذكر العلامة', async () => {
  const { v, c } = open();
  const rows = v.rows();
  over(rows[1]);
  const mark = btn(v, 'mark');
  const sync = btn(v, 'sync');
  assert.equal(mark.tagName, 'button');
  assert.equal(mark.getAttribute('aria-label'), 'علّم للمراجعة');
  assert.equal(mark.getAttribute('aria-pressed'), 'false');
  assert.equal(sync.getAttribute('aria-label'), 'أسمع هذه الآن');
  assert.equal(mark.getAttribute('aria-describedby'), 'tj-r1-ar');
  assert.equal(sync.getAttribute('aria-describedby'), 'tj-r1-ar');
  click(mark);
  await settle();
  assert.deepEqual(c.calls.filter((x) => x[0] === 'markCue'), [['markCue', 1, 'todo']]);
  assert.equal(rows[1].getAttribute('data-mark'), 'todo', 'العلامة على صفها');
  assert.equal(mark.getAttribute('aria-pressed'), 'true');
  assert.equal(rows[1].children[0].getAttribute('aria-label'), 'الانتقال إلى 00:03، معلّم للمراجعة');
  assert.equal(rows[0].hasAttribute('data-mark'), false);
});

test('التعليم ثم التراجع من الرسالة، والضغط على صف معلَّم يزيل علامته؛ ولا قفز في الفيديو', async () => {
  const { v, c, page, handle } = open();
  const rows = v.rows();
  over(rows[1]);
  click(btn(v, 'mark'));
  await settle();
  assert.deepEqual(handle.peek().note, { text: 'عُلِّم المقطع 2 للمراجعة', undo: true });
  click(v.q('.note__act'));
  await settle();
  assert.equal(rows[1].hasAttribute('data-mark'), false, 'التراجع يزيلها');
  assert.equal(handle.peek().note, null);
  click(btn(v, 'mark'));
  await settle();
  click(btn(v, 'mark'));
  await settle();
  assert.deepEqual(c.calls.filter((x) => x[0] === 'markCue').map((x) => x[2]), ['todo', 'todo', null]);
  assert.equal(handle.peek().note.text, 'أُزيلت علامة المقطع 2');
  assert.equal(rows[1].hasAttribute('data-mark'), false);
  assert.deepEqual(page.video.writes, [], 'أزرار الشريط لا تقفز');
});

test('العلامات الموجودة من مكان آخر (المحرّر) تظهر على صفوفها، و«تمت المراجعة» لا', () => {
  const cues = arCues(5);
  const { v, handle } = open({ cues, marks: [{ ...markAnchor(cues[2]), kind: 'todo', at: '2026-11-10T00:00:00.000Z' }, { ...markAnchor(cues[4]), kind: 'done', at: '2026-11-10T00:00:00.000Z' }] });
  assert.deepEqual(handle.peek().marked, [2]);
  assert.equal(v.rows()[2].getAttribute('data-mark'), 'todo');
  assert.equal(v.rows()[4].hasAttribute('data-mark'), false);
});

test('«أسمع هذه الآن» على جملة قريبة: إزاحة تُظهر بدايتها في لحظة الضغط، ورسالة بتراجع يعيد السابقة', async () => {
  // الفيديو عند 4.0 ث، والمقطع 3 يبدأ 6.0 ث ⇒ الإزاحة −2.0.
  const { v, c, handle, page } = open({ t: 4 });
  over(v.rows()[2]);
  assert.equal(btn(v, 'sync').hasAttribute('aria-disabled'), false);
  click(btn(v, 'sync'));
  await settle();
  assert.deepEqual(c.calls.filter((x) => x[0] === 'setOffset'), [['setOffset', -2000]]);
  assert.equal(c.getState().view.displayOffsetMs, -2000);
  assert.deepEqual(handle.peek().note, { text: offsetToast(-2000), undo: true });
  assert.match(handle.peek().note.text, /الإزاحة .?−2\.0.? ث/u);
  click(v.q('.note__act'));
  await settle();
  assert.equal(c.getState().view.displayOffsetMs, 0, 'التراجع يعيد الإزاحة السابقة');
  assert.deepEqual(page.video.writes, [], 'لا قفز ولا تغيير لزمن الفيديو');
});

test('«أسمع هذه الآن» على جملة بعيدة عن لحظة التشغيل: معطّلة بسببها، والضغط يقوله ولا يغيّر الإزاحة', async () => {
  const { v, c, handle } = open({ cues: arCues(60), t: 0 });
  const far = v.rows()[40]; // يبدأ بعد 100 ث تقريبًا، وبعيد عن الحالي بأكثر من ثلاثة صفوف
  over(far);
  const sync = btn(v, 'sync');
  assert.equal(sync.getAttribute('aria-disabled'), 'true');
  assert.match(sync.getAttribute('title'), /بعيدة عن لحظة التشغيل/);
  click(sync);
  await settle();
  assert.equal(c.calls.filter((x) => x[0] === 'setOffset').length, 0);
  assert.match(handle.peek().note.text, /بعيدة عن لحظة التشغيل/);
  assert.equal(handle.peek().note.undo, false);
  // ثلاثة صفوف من الحالي متاحة وإن تجاوزت نصف الدقيقة زمنًا.
  over(v.rows()[3]);
  assert.equal(btn(v, 'sync').hasAttribute('aria-disabled'), false);
});

test('أثناء الإعلان: «أسمع هذه الآن» معطّلة برسالة الإعلان، ولا إزاحة', async () => {
  const { v, c, handle, page } = open({ t: 4 });
  page.player.classList.add('ad-showing');
  over(v.rows()[2]);
  assert.equal(btn(v, 'sync').getAttribute('aria-disabled'), 'true');
  click(btn(v, 'sync'));
  await settle();
  assert.equal(c.calls.filter((x) => x[0] === 'setOffset').length, 0);
  assert.match(handle.peek().note.text, /الإعلان/);
});

test('لوحة المفاتيح: التركيز في زمن صف يحمل إليه الشريط فيأتي زراه بعده في ترتيب Tab، والمؤشر لا ينقله والتركيز فيه', () => {
  const { v } = open();
  const rows = v.rows();
  rows[2].children[0].focus();
  assert.ok(actsOf(v).parentNode === rows[2]);
  assert.ok(rows[2].children[rows[2].children.length - 1] === actsOf(v), 'بعد زمن الصف ونصه');
  btn(v, 'mark').focus();
  over(rows[4]);
  assert.ok(actsOf(v).parentNode === rows[2], 'الزر المركّز لا يُنزع من تحت المستخدم');
});

test('زر رُكّز بنقرة الفأرة (لا :focus-visible) لا يثبّت الشريط: المرور على صف آخر ينقله إليه (جولة هـ)', () => {
  const { v } = open();
  const rows = v.rows();
  over(rows[1]);
  const mark = btn(v, 'mark');
  mark.matches = (sel) => sel !== ':focus-visible';
  mark.focus();
  over(rows[3]);
  assert.ok(actsOf(v).parentNode === rows[3], 'يتبع المؤشر');
});

// ———— من مراجعة المرحلة 5 ————

test('م1: الشريط في صف غير صف نقطة Tab خارج ترتيب Tab، فأول Tab إلى القائمة زمن الصف الحالي ثم زرا صفه', () => {
  const { v, handle } = open({ cues: arCues(60), t: 101.5 }); // الحالي الصف 40 (يبدأ 101.0 ث)
  const rows = v.rows();
  assert.equal(handle.peek().current, 40);
  assert.ok(actsOf(v).parentNode === rows[0], 'الشريط في الصف 0 بعد البناء');
  assert.equal(btn(v, 'mark').getAttribute('tabindex'), '-1');
  assert.equal(btn(v, 'sync').getAttribute('tabindex'), '-1');
  assert.equal(rows[40].children[0].getAttribute('tabindex'), '0', 'نقطة Tab على الحالي');
  rows[40].children[0].focus();
  assert.ok(actsOf(v).parentNode === rows[40]);
  assert.equal(btn(v, 'mark').getAttribute('tabindex'), '0', 'بعد زمن صفه في ترتيب Tab');
});

test('م2: رسالة العلامة تزول حين يتغير الفيديو، فلا تراجع يكتب في سجل فيديو آخر', async () => {
  const { v, c, handle, page } = open();
  over(v.rows()[1]);
  click(btn(v, 'mark'));
  await settle();
  assert.ok(handle.peek().note);
  page.navigateTo('BBBBBBBBBBB');
  c.set({ videoId: 'BBBBBBBBBBB' });
  assert.equal(handle.peek().note, null);
});

test('ط2 وط3: بلا زمن فيديو سبب «يتاح حين يعمل الفيديو»، وسبب التعطيل يصف الزر لقارئ الشاشة', () => {
  const { v, page } = open({ t: 4 });
  page.video.silentTo(Number.NaN);
  over(v.rows()[2]);
  const sync = btn(v, 'sync');
  assert.equal(sync.getAttribute('aria-disabled'), 'true');
  assert.equal(sync.getAttribute('title'), 'يتاح حين يعمل الفيديو.');
  assert.equal(sync.getAttribute('aria-describedby'), 'tj-r2-ar tj-acts-why');
  assert.equal(v.q('.acts .sr').getAttribute('id'), 'tj-acts-why');
  assert.equal(v.q('.acts .sr').textContent, 'يتاح حين يعمل الفيديو.');
});

// ———— الفكرة ٦ (ح-54): «عدّل النص» من صف اللوحة ————

const field = (v) => v.q('.edit__field');
const keydown = (el, key, extra = {}) => el.dispatchEvent({ type: 'keydown', bubbles: true, key, ...extra });
/** ما يصل إلى مستمع المستند (اختصارات يوتيوب) من الضغطات. */
const youtubeKeys = (page) => {
  const seen = [];
  for (const type of ['keydown', 'keyup', 'keypress']) page.doc.addEventListener(type, (ev) => seen.push(`${type}:${ev.key}`));
  return seen;
};
/** يفتح حقل صف i بزر «عدّل النص» (نقرة مؤشر). */
function openEdit(v, i) {
  over(v.rows()[i]);
  click(btn(v, 'edit'));
  return field(v);
}

test('الفكرة ٦: «عدّل النص» زر ثالث موصوف بنص صفه، ويفتح حقلًا مكان النص بنص المقطع الخام وأسطره، والتركيز فيه، ولا قفز ولا إيقاف', () => {
  const cues = arCues(5);
  cues[1] = { ...cues[1], text: 'سطر أول\nسطر ثانٍ' };
  const { v, page, handle } = open({ cues });
  const rows = v.rows();
  over(rows[1]);
  const edit = btn(v, 'edit');
  assert.equal(edit.tagName, 'button');
  assert.equal(edit.getAttribute('aria-label'), 'عدّل النص');
  assert.match(edit.getAttribute('title'), /والتوقيت والدمج والشطر في المحرّر/);
  assert.equal(edit.getAttribute('aria-describedby'), 'tj-r1-ar');
  page.video.setPlaying(true);
  click(edit);
  const f = field(v);
  assert.ok(f, 'الحقل مفتوح');
  assert.equal(f.tagName, 'textarea');
  assert.equal(f.value, 'سطر أول\nسطر ثانٍ', 'نص المقطع الخام بفاصل سطره، لا السطر الواحد المعروض');
  assert.equal(rows[1].querySelector('.ar').textContent, 'سطر أول سطر ثانٍ', 'الصف يعرض سطرًا واحدًا');
  assert.equal(rows[1].querySelector('.ar').hasAttribute('hidden'), true, 'الحقل مكان النص');
  assert.ok(f.parentNode.parentNode === rows[1].children[1], 'في جسم الصف نفسه');
  assert.equal(f.getAttribute('aria-label'), 'نص المقطع 2');
  assert.equal(f.getAttribute('lang'), 'und');
  assert.ok(v.root.activeElement === f, 'التركيز في الحقل');
  assert.equal(v.q('.acts'), null, 'الشريط خارج DOM ما دام الحقل مفتوحًا');
  over(rows[3]);
  assert.equal(v.q('.acts'), null, 'والمرور على صف آخر لا يعيده');
  assert.equal(handle.peek().editing, 1);
  assert.deepEqual(page.video.writes, [], 'لا قفز');
  assert.equal(page.video.paused, false, 'ولا إيقاف للفيديو');
  const hint = v.q('.edit__hint');
  assert.match(hint.textContent, /للحفظ/);
  assert.deepEqual(hint.children.filter((x) => x.tagName === 'bdi').map((x) => x.getAttribute('dir')), ['ltr', 'ltr', 'ltr'], 'أسماء المفاتيح عناصر معزولة LTR');
});

test('الفكرة ٦: Enter يحفظ بالنص كما كُتب وShift+Enter لا، والرسالة «عُدِّل نص المقطع» بتراجع يعيده؛ ولا قفز', async () => {
  const { v, c, page, handle } = open();
  const f = openEdit(v, 1);
  f.value = 'نص جديد\nبسطرين';
  assert.equal(keydown(f, 'Enter', { shiftKey: true }), true, 'Shift+Enter سطر جديد (لا يُمنع)');
  assert.equal(c.calls.filter((x) => x[0] === 'editCueText').length, 0);
  assert.equal(keydown(f, 'Enter'), false, 'Enter يُمنع افتراضه ويحفظ');
  await settle();
  assert.deepEqual(c.calls.filter((x) => x[0] === 'editCueText'), [['editCueText', 1, 'نص جديد\nبسطرين']]);
  assert.equal(field(v), null, 'الحقل أُغلق بعد الحفظ');
  assert.equal(v.rows()[1].querySelector('.ar').textContent, 'نص جديد بسطرين');
  assert.equal(v.rows()[1].querySelector('.ar').hasAttribute('hidden'), false);
  assert.deepEqual(handle.peek().note, { text: 'عُدِّل نص المقطع 2', undo: true });
  click(v.q('.note__act'));
  await settle();
  assert.deepEqual(c.calls.filter((x) => x[0] === 'undoEdit'), [['undoEdit', 1]]);
  assert.equal(v.rows()[1].querySelector('.ar').textContent, 'سطر 2', '«تراجع» يعيد النص');
  assert.deepEqual(page.video.writes, []);
});

test('الفكرة ٦: Esc يلغي بلا كتابة ويعود التركيز إلى «عدّل النص» في صفه، والنص نفسه يُغلق بلا كتابة', async () => {
  const { v, c, handle } = open();
  const f = openEdit(v, 2);
  f.value = 'لن يُحفظ';
  assert.equal(keydown(f, 'Escape'), false);
  await settle();
  assert.equal(field(v), null);
  assert.equal(v.rows()[2].querySelector('.ar').textContent, 'سطر 3');
  assert.equal(v.rows()[2].querySelector('.ar').hasAttribute('hidden'), false);
  assert.ok(v.root.activeElement === btn(v, 'edit'), 'التركيز إلى زر صفه بعد Esc');
  assert.ok(v.q('.acts').parentNode === v.rows()[2]);
  assert.equal(handle.peek().editing, null);
  const g = openEdit(v, 2);
  keydown(g, 'Enter');
  await settle();
  assert.equal(field(v), null, 'بلا تغيير: يُغلق');
  assert.equal(c.calls.filter((x) => x[0] === 'editCueText').length, 0, 'ولا كتابة');
  assert.equal(handle.peek().note, null);
});

test('الفكرة ٦: Enter أثناء تركيب IME (isComposing أو keyCode 229) لا يحفظ ولا يلغي', async () => {
  const { v, c } = open();
  const f = openEdit(v, 1);
  f.value = 'مرحبا';
  assert.equal(keydown(f, 'Enter', { isComposing: true }), true, 'لا يُمنع: يختار المرشّح');
  keydown(f, 'Enter', { keyCode: 229 });
  keydown(f, 'Escape', { isComposing: true });
  await settle();
  assert.equal(c.calls.filter((x) => x[0] === 'editCueText').length, 0);
  assert.ok(field(v) === f, 'الحقل باقٍ');
  keydown(f, 'Enter');
  await settle();
  assert.deepEqual(c.calls.filter((x) => x[0] === 'editCueText'), [['editCueText', 1, 'مرحبا']]);
});

test('الفكرة ٦: النقر والسحب داخل الحقل لا يقفزان ولا يُسقطان التركيز، و«حفظ» و«إلغاء» بالفأرة لا تقفز', async () => {
  const { v, c, page } = open();
  const f = openEdit(v, 1);
  page.doc.getSelection = () => ({ isCollapsed: true, toString: () => '' });
  f.dispatchEvent({ type: 'pointerdown', bubbles: true, clientX: 300, clientY: 60, pointerType: 'mouse' });
  f.dispatchEvent({ type: 'click', bubbles: true, detail: 1, clientX: 300, clientY: 60 });
  f.dispatchEvent({ type: 'pointerdown', bubbles: true, clientX: 300, clientY: 60, pointerType: 'mouse' });
  f.dispatchEvent({ type: 'pointermove', bubbles: true, clientX: 200, clientY: 60, pointerType: 'mouse' });
  f.dispatchEvent({ type: 'click', bubbles: true, detail: 1, clientX: 200, clientY: 60 });
  f.dispatchEvent({ type: 'click', bubbles: true, detail: 2, clientX: 200, clientY: 60 });
  assert.deepEqual(page.video.writes, [], 'لا قفز');
  assert.ok(v.root.activeElement === f, 'التركيز باقٍ في الحقل');
  f.value = 'بالفأرة';
  click(v.q('.edit__save'));
  await settle();
  assert.deepEqual(c.calls.filter((x) => x[0] === 'editCueText'), [['editCueText', 1, 'بالفأرة']]);
  const g = openEdit(v, 3);
  click(v.q('.edit__cancel'));
  assert.equal(field(v), null);
  assert.ok(g && v.root.activeElement !== g);
  assert.deepEqual(page.video.writes, [], 'ولا قفز من الزرين');
});

test('الفكرة ٦: الحارس يمنع قبل الكتابة النص الفارغ وما يكسر SRT وما لا يقبله التخزين، بسببه داخل الحقل وإحالة إلى المحرّر', async () => {
  const { v, c } = open();
  const f = openEdit(v, 1);
  const msg = v.q('.edit__msg');
  assert.equal(msg.hasAttribute('hidden'), true);
  const cases = [
    ['', /بلا نص.*افتح المحرّر/],
    ['   ', /بلا نص/],
    ['أول\n\nثالث', /سطر فارغ.*اشطر المقطع في المحرّر/],
    ['12\n00:00:01,000 --> 00:00:02,000', /رأسَ مقطع.*في المحرّر/],
    ['x'.repeat(5001), /أطول من 5000 حرف/],
  ];
  for (const [text, why] of cases) {
    f.value = text;
    keydown(f, 'Enter');
    await settle();
    assert.equal(msg.hasAttribute('hidden'), false, JSON.stringify(text.slice(0, 20)));
    assert.match(msg.textContent, why);
    assert.equal(msg.getAttribute('role'), 'alert');
    assert.equal(f.getAttribute('aria-invalid'), 'true');
    assert.ok(field(v) === f, 'الحقل باقٍ بنصه');
    assert.equal(f.value, text);
  }
  assert.equal(c.calls.filter((x) => x[0] === 'editCueText').length, 0, 'لا كتابة');
  f.value = 'صحيح';
  f.dispatchEvent({ type: 'input', bubbles: true });
  assert.equal(msg.hasAttribute('hidden'), true, 'الكتابة تزيل السبب');
  assert.equal(f.hasAttribute('aria-invalid'), false);
});

test('الفكرة ٦: إخفاق الكتابة يُقال داخل الحقل والنص باقٍ (أخطاء التوقيت بإحالة إلى المحرّر)، ثم يُحفظ', async () => {
  const { v, c, handle } = open();
  const f = openEdit(v, 1);
  f.value = 'نص';
  c.editFail = new TjError('ED_SAVE_HAS_ERRORS', { params: { count: '2' } });
  keydown(f, 'Enter');
  await settle();
  assert.ok(field(v) === f, 'الحقل باقٍ');
  assert.equal(f.value, 'نص');
  assert.equal(f.readOnly, false, 'قابل للكتابة بعد الإخفاق');
  assert.equal(v.q('.edit__msg').textContent, 'في هذه الترجمة أخطاء توقيت تمنع حفظ أي تعديل؛ صحّحها في المحرّر أولًا.');
  assert.equal(handle.peek().note, null);
  assert.equal(handle.diagnostics().session.actionFailures, 1);
  keydown(f, 'Enter');
  await settle();
  assert.equal(field(v), null);
  assert.equal(handle.peek().note.text, 'عُدِّل نص المقطع 2');
});

test('الفكرة ٦: ضغطات الحقل لا تصل يوتيوب (المسافة وK وJ وL وF وM والأرقام)، والجذر مغلق فيوتيوب يرى المضيف', () => {
  const { v, page } = open();
  const yt = youtubeKeys(page);
  const f = openEdit(v, 1);
  for (const k of [' ', 'k', 'K', 'j', 'l', 'f', 'm', '0', '5', 'ArrowLeft', 'Home']) {
    for (const type of ['keydown', 'keyup', 'keypress']) f.dispatchEvent({ type, bubbles: true, key: k });
  }
  assert.deepEqual(yt, [], 'لا ضغطة وصلت');
  // وخارج الحقل تبقى قاعدة ت-٤: k من زر الإغلاق تصل.
  v.qa('.head .b')[1].dispatchEvent({ type: 'keydown', bubbles: true, key: 'k' });
  assert.deepEqual(yt, ['keydown:k']);
});

test('الفكرة ٦: الحقل المفتوح يُمسك تبديل لغة الواجهة ويُعرف من مقبض التركيب، والمتابعة معلّقة ما دام مفتوحًا', () => {
  const { v, handle } = open();
  assert.equal(handle.peek().follow, true);
  assert.equal(handle.holdsFlow(), false);
  assert.equal(handle.editing(), false);
  const f = openEdit(v, 1);
  assert.ok(f);
  assert.equal(handle.holdsFlow(), true);
  assert.equal(handle.editing(), true);
  assert.equal(handle.peek().follow, false, 'المتابعة معلّقة');
  assert.ok(handle.peek().resume, '«العودة إلى ‹الزمن›» ظاهرة');
  keydown(f, 'Escape');
  assert.equal(handle.holdsFlow(), false);
  assert.equal(handle.editing(), false);
});

// ———— الفكرة ٦: المسار التدريجي في sync() ————

/** يغيّر في حالة المتحكم الوهمي مقاطع الترجمة المعروضة كما يصلها تعديل من مكان آخر (مصفوفة جديدة). */
const setCues = (c, fn) => {
  const cur = c.getState().arabic;
  c.set({ arabic: { ...cur, cues: fn(cur.cues) } });
};

test('الفكرة ٦: تغيّر نص صف آخر والحقل مفتوح يُحدَّث في مكانه، والحقل باقٍ بما كُتب والتركيز فيه، بلا إعادة بناء', () => {
  const { v, c, handle } = open();
  const rows = v.rows();
  const f = openEdit(v, 1);
  f.value = 'ما أكتبه';
  const rebuilds = handle.diagnostics().session.rebuilds;
  setCues(c, (cues) => cues.map((x, i) => (i === 3 ? { ...x, text: 'من المحرّر\nبسطرين' } : x)));
  assert.ok(field(v) === f, 'الحقل نفسه');
  assert.equal(f.value, 'ما أكتبه');
  assert.ok(v.root.activeElement === f, 'والتركيز فيه');
  assert.ok(v.rows()[3] === rows[3] && v.rows()[1] === rows[1], 'الصفوف بأعيانها');
  assert.equal(rows[3].querySelector('.ar').textContent, 'من المحرّر بسطرين');
  assert.equal(handle.diagnostics().session.rebuilds, rebuilds, 'لا إعادة بناء');
});

test('الفكرة ٦: الحفظ يحدّث نص صفه في مكانه بلا إعادة بناء، والأسطر تبقى في المقطع فيُعاد فتحه بها', async () => {
  const { v, c, handle } = open();
  const rows = v.rows();
  const rebuilds = handle.diagnostics().session.rebuilds;
  const f = openEdit(v, 2);
  f.value = 'أول\nثانٍ';
  keydown(f, 'Enter');
  await settle();
  assert.equal(field(v), null);
  assert.ok(v.rows()[2] === rows[2], 'الصف نفسه');
  assert.equal(rows[2].querySelector('.ar').textContent, 'أول ثانٍ');
  assert.equal(c.getState().arabic.cues[2].text, 'أول\nثانٍ', 'فاصل السطر في المقطع المحفوظ');
  assert.equal(handle.diagnostics().session.rebuilds, rebuilds, 'لا إعادة بناء');
  assert.ok(v.root.activeElement === btn(v, 'edit'), 'Enter: التركيز إلى «عدّل النص» في صفه');
  click(btn(v, 'edit'));
  assert.equal(field(v).value, 'أول\nثانٍ', 'إعادة الفتح بالأسطر');
});

test('الفكرة ٦: إعادة بناء والحقل مفتوح (دمج في المحرّر غيّر العدد) تعيد فتحه على المقطع نفسه بمرساته وبما كُتب، والتركيز فيه', async () => {
  const { v, c, handle } = open();
  const f = openEdit(v, 2);
  f.value = 'مسودة';
  const rebuilds = handle.diagnostics().session.rebuilds;
  setCues(c, (cues) => cues.slice(1));
  assert.equal(handle.diagnostics().session.rebuilds, rebuilds + 1, 'أُعيد البناء');
  const g = field(v);
  assert.ok(g && g !== f, 'حقل جديد');
  assert.equal(g.value, 'مسودة');
  assert.equal(handle.peek().editing, 1, 'على المقطع نفسه في موضعه الجديد');
  assert.ok(v.root.activeElement === g);
  keydown(g, 'Enter');
  await settle();
  assert.deepEqual(c.calls.filter((x) => x[0] === 'editCueText'), [['editCueText', 1, 'مسودة']]);
});

test('الفكرة ٦: المقطع نفسه تغيّر من مكان آخر والحقل مفتوح: يُغلق، و«تغيّرت الترجمة؛ لم يُحفظ تعديلك» مع «نسخ النص» تنسخ ما كُتب', async () => {
  const { v, c, page, handle } = open();
  const copied = [];
  page.win.navigator = { clipboard: { writeText: async (t) => { copied.push(t); } } };
  const f = openEdit(v, 1);
  f.value = 'ما كتبته';
  setCues(c, (cues) => cues.map((x, i) => (i === 1 ? { ...x, text: 'من المحرّر' } : x)));
  await settle();
  assert.equal(field(v), null, 'الحقل أُغلق');
  assert.equal(v.rows()[1].querySelector('.ar').textContent, 'من المحرّر');
  assert.deepEqual(handle.peek().note, { text: 'تغيّرت الترجمة؛ لم يُحفظ تعديلك.', undo: true });
  assert.equal(v.q('.note__act').textContent, 'نسخ النص');
  click(v.q('.note__act'));
  await settle();
  assert.deepEqual(copied, ['ما كتبته']);
  assert.equal(handle.peek().note.text, 'نُسخ النص.');
  assert.equal(c.calls.filter((x) => x[0] === 'editCueText').length, 0, 'لا كتابة فوق ما تغيّر');
  // التركيز عاد إلى «عدّل النص» في صفه. وبلا ما كُتب (الحقل كما فُتح) يُغلق بلا رسالة؛ وفي غيره تعود «تراجع» تسمية زر الرسالة.
  assert.ok(v.root.activeElement === btn(v, 'edit') && v.q('.acts').parentNode === v.rows()[1]);
  const g = openEdit(v, 1);
  assert.equal(g.value, 'من المحرّر');
  setCues(c, (cues) => cues.map((x, i) => (i === 1 ? { ...x, text: 'تغيير آخر' } : x)));
  await settle();
  assert.equal(field(v), null);
  assert.equal(handle.peek().note.text, 'نُسخ النص.', 'لا رسالة جديدة');
  click(btn(v, 'mark'));
  await settle();
  assert.equal(v.q('.note__act').textContent, 'تراجع');
});

test('الفكرة ٦: إعادة بناء تُسقط مقطع الحقل (تغيّر زمنه) تقول «تغيّرت الترجمة» بما كُتب، وفشل النسخ يُقال', async () => {
  const { v, c, page, handle } = open();
  page.win.navigator = { clipboard: { writeText: async () => { throw new Error('denied'); } } };
  const f = openEdit(v, 1);
  f.value = 'نصي';
  setCues(c, (cues) => cues.map((x, i) => (i === 1 ? { ...x, startMs: x.startMs + 100 } : x)));
  await settle();
  assert.equal(field(v), null);
  assert.equal(handle.peek().note.text, 'تغيّرت الترجمة؛ لم يُحفظ تعديلك.');
  click(v.q('.note__act'));
  await settle();
  assert.equal(handle.peek().note.text, 'تعذّر نسخ النص.');
});
