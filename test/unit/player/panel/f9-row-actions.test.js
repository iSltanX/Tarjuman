// ف9 (2026-11-10): «علّم للمراجعة» و«أسمع هذه الآن» من صف اللوحة. شريط واحد يُنقل إلى الصف الممرور عليه أو المركّز، والعلامة
// «أعود إليه» سمة على صفها تُرى دائمًا، والمزامنة للجمل القريبة من لحظة التشغيل وحدها ومعطّلة أثناء الإعلان، ورسالة فيها «تراجع».
// مقارنة العقد بـassert.ok(a === b) لا assert.equal: فشل assert.equal على عقدة من الـDOM الوهمي يستنزف الذاكرة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
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
