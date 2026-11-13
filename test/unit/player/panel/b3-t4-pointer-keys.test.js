// الجولة الثانية من تحقق 2026-11-13، البند 16: B3 (السحب في القائمة يقفز بالفيديو) وت-٤ (اللوحة تبتلع اختصارات يوتيوب بعد
// النقر فيها). في Chromium وFirefox: ضغطة تبدأ على عنصر وتنتهي على آخر تُرسل نقرتها إلى أقرب أب مشترك، وهو الصف؛ فسحبٌ بلا تحديد
// نص، أو تراجعٌ عن زر في شريط الأفعال بسحب المؤشر عنه، كان يُقرأ نقرة على الصف فيقفز. وبعد نقرة المؤشر على زمن صف كان التركيز
// يبقى عليه، وجذر اللوحة يعزل كل ضغطة، فالمسافة تعيد القفز وk وj وl لا تصل إلى يوتيوب.
// مقارنة العقد بـassert.ok(a === b) لا assert.equal (رأس fake-dom.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from './harness.js';

const flushN = async (n = 3) => { for (let i = 0; i < n; i++) await P.settle(); };

async function mounted(over = {}) {
  const page = P.watchPage({ state: P.makeState({ arabic: { cues: P.arCues(6), edited: false, fileName: 'x.srt', comparison: null }, ...over }) });
  page.mount();
  await flushN();
  // لا تحديد نص في الصفحة: السحب هنا بلا تحديد (حالة Chromium في B3).
  page.doc.getSelection = () => ({ isCollapsed: true, toString: () => '' });
  page.video.writes.length = 0;
  return { page, u: P.ui(page) };
}

const ptr = (type, el, x, y, pointerType = 'mouse') => el.dispatchEvent({ type, bubbles: true, clientX: x, clientY: y, button: 0, pointerType });
const clickAt = (el, x, y, detail = 1) => el.dispatchEvent({ type: 'click', bubbles: true, detail, clientX: x, clientY: y });
const actBtn = (u, act) => u.q('.acts').children.find((b) => b.getAttribute('data-act') === act);
/** ما يصل إلى مستمع المستند (اختصارات يوتيوب) من الضغطات. */
const youtubeKeys = (page) => {
  const seen = [];
  page.doc.addEventListener('keydown', (ev) => seen.push(ev.key));
  return seen;
};
/** المسافة كما يرسلها المتصفح: إلى المركّز (أو body)، ثم تفعيل الزر المركّز (click بلا مؤشر) ما لم يُمنع الافتراضي. */
function space(page) {
  const target = page.doc._focused ?? page.doc.body;
  const go = target.dispatchEvent({ type: 'keydown', bubbles: true, key: ' ' });
  if (go && String(target.tagName).toLowerCase() === 'button') target.dispatchEvent({ type: 'click', bubbles: true, detail: 0 });
  target.dispatchEvent({ type: 'keyup', bubbles: true, key: ' ' });
}

// ———— B3 ————

test('B3: سحب بلا تحديد نص يبدأ على نص صف لا يقفز بالفيديو، بالحركة أثناء الضغط أو بموضع النقرة وحده', async () => {
  const { page, u } = await mounted();
  const ar = u.rows()[2].querySelector('.ar');
  ptr('pointerdown', ar, 300, 120);
  ptr('pointermove', ar, 240, 121);
  clickAt(ar, 240, 121);
  assert.deepEqual(page.video.writes, [], 'سحب 60 بكسل بلا تحديد: لا قفز');
  ptr('pointerdown', ar, 300, 120);
  clickAt(u.rows()[2], 180, 120);
  assert.deepEqual(page.video.writes, [], 'نقرة إلى الصف بعد 120 بكسل بلا pointermove: لا قفز');
});

test('B3: ضغطة تبدأ على زر في شريط الأفعال ثم تنتهي على الصف لا تقفز ولا تنفّذ الفعل، ولو لم يتحرك المؤشر إلا قليلًا', async () => {
  const { page, u } = await mounted();
  const c = page.controller;
  c.markCue = async () => {
    c.calls.push(['markCue']);
    return { mark: null, undo: async () => {} };
  };
  const row = u.rows()[3];
  row.children[1].dispatchEvent({ type: 'pointerover', bubbles: true });
  assert.ok(u.q('.acts').parentNode === row, 'الشريط في الصف الممرور عليه');
  const mark = actBtn(u, 'mark');
  ptr('pointerdown', mark, 20, 150);
  ptr('pointermove', mark, 130, 150);
  clickAt(row, 130, 150);
  assert.deepEqual(page.video.writes, [], 'التراجع عن «علّم» بسحبه 110 بكسل: لا قفز');
  ptr('pointerdown', actBtn(u, 'sync'), 40, 150);
  clickAt(row, 42, 150);
  assert.deepEqual(page.video.writes, [], 'ضغطة بدأت في الشريط وانتهت على الصف بعد 2 بكسل: لا قفز');
  assert.ok(!c.calls.some(([name]) => name === 'markCue'), 'ولا فعل للزر');
  ptr('pointerdown', mark, 20, 150);
  clickAt(mark, 21, 150);
  assert.ok(c.calls.some(([name]) => name === 'markCue'), 'والضغط والإفلات على الزر نفسه فعله');
  assert.deepEqual(page.video.writes, [], 'بلا قفز');
});

test('B3: النقرة العادية على نص الصف تقفز (حركة 5 بكسل أو أقل)، والنقر على زمنه يقفز ولو تحرك المؤشر فوقه، وتفعيله بلوحة المفاتيح يقفز', async () => {
  const { page, u } = await mounted();
  const row = u.rows()[2];
  const ar = row.querySelector('.ar');
  ptr('pointerdown', ar, 300, 120);
  clickAt(ar, 303, 124);
  assert.equal(page.video.writes.length, 1, 'نقرة بارتجاف 5 بكسل تقفز');
  const t = row.querySelector('.t');
  ptr('pointerdown', t, 10, 120);
  ptr('pointermove', t, 40, 120);
  clickAt(t, 40, 120);
  assert.equal(page.video.writes.length, 2, 'الضغط والإفلات على زر الزمن نفسه نقرة عليه');
  // ضغطة قديمة بدأت في الشريط لا تمس تفعيل الزمن بلوحة المفاتيح (click بلا مؤشر، detail = 0).
  ptr('pointerdown', actBtn(u, 'mark'), 20, 120);
  clickAt(t, 0, 0, 0);
  assert.equal(page.video.writes.length, 3, 'Enter أو المسافة على زر الزمن');
  clickAt(ar, 0, 0, 0);
  ptr('pointerdown', ar, 300, 120);
  clickAt(ar, 300, 120);
  assert.equal(page.video.writes.length, 5, 'ونقرة بلا حركة بعد ذلك');
});

test('B3 (القرار ٣١): حد السحب باللمس 10 بكسل، وبالفأرة والقلم 5', async () => {
  const { page, u } = await mounted();
  const ar = u.rows()[2].querySelector('.ar');
  ptr('pointerdown', ar, 300, 120, 'touch');
  ptr('pointermove', ar, 308, 120, 'touch');
  clickAt(ar, 308, 120);
  assert.equal(page.video.writes.length, 1, 'لمسة بارتجاف 8 بكسل نقرة تقفز');
  ptr('pointerdown', ar, 300, 120, 'touch');
  ptr('pointermove', ar, 312, 120, 'touch');
  clickAt(ar, 312, 120);
  assert.equal(page.video.writes.length, 1, 'سحب لمس 12 بكسل: لا قفز');
  ptr('pointerdown', ar, 300, 120, 'pen');
  ptr('pointermove', ar, 308, 120, 'pen');
  clickAt(ar, 308, 120);
  assert.equal(page.video.writes.length, 1, 'القلم بحد الفأرة: 8 بكسل سحب');
  ptr('pointerdown', ar, 300, 120);
  clickAt(ar, 308, 120);
  assert.equal(page.video.writes.length, 1, 'والفأرة كذلك');
});

// ———— ت-٤ ————

test('ت-٤: بعد نقرة المؤشر على زمن صف لا يبقى التركيز داخل اللوحة، فالمسافة تصل إلى يوتيوب ولا تعيد القفز', async () => {
  const { page, u } = await mounted();
  const yt = youtubeKeys(page);
  const t = u.rows()[1].querySelector('.t');
  // المتصفح يركّز الزر عند الضغط عليه بالفأرة (Chromium)، ثم تأتي النقرة.
  ptr('pointerdown', t, 10, 60);
  t.focus();
  clickAt(t, 10, 60);
  assert.equal(page.video.writes.length, 1, 'النقرة تقفز');
  assert.ok(u.root.activeElement === null, 'لا تركيز داخل اللوحة بعد نقرة المؤشر');
  space(page);
  assert.equal(page.video.writes.length, 1, 'المسافة لا تعيد القفز');
  assert.deepEqual(yt, [' '], 'والمسافة وصلت إلى مستمع المستند (إيقاف يوتيوب)');
});

test('ت-٤: نقرة المؤشر على نص صف أو على زر في شريط الأفعال تُسقط التركيز من القائمة أيضًا', async () => {
  const { page, u } = await mounted();
  const row = u.rows()[2];
  u.list.focus();
  ptr('pointerdown', row.querySelector('.ar'), 300, 120);
  clickAt(row.querySelector('.ar'), 300, 120);
  assert.equal(page.video.writes.length, 1);
  assert.ok(u.root.activeElement === null, 'نقرة النص: القائمة لا تبقى مركّزة');
  row.children[1].dispatchEvent({ type: 'pointerover', bubbles: true });
  const mark = actBtn(u, 'mark');
  ptr('pointerdown', mark, 20, 120);
  mark.focus();
  clickAt(mark, 20, 120);
  assert.ok(u.root.activeElement === null, 'نقرة «علّم»: الزر لا يبقى مركّزًا');
});

test('ت-٤: تفعيل الزمن بلوحة المفاتيح يبقي التركيز عليه، والتنقل بالأسهم وHome وEnd داخل القائمة يبقى للوحة', async () => {
  const { page, u } = await mounted();
  const yt = youtubeKeys(page);
  const times = u.qa('.t');
  times[2].focus();
  clickAt(times[2], 0, 0, 0);
  assert.equal(page.video.writes.length, 1);
  assert.ok(u.root.activeElement === times[2], 'Enter أو المسافة: يبقى التركيز');
  P.key(times[2], 'ArrowDown');
  assert.ok(u.root.activeElement === times[3], 'السهم إلى الصف التالي');
  P.key(times[3], 'End');
  assert.ok(u.root.activeElement === times[5], 'End إلى الأخير');
  P.key(times[5], 'Enter');
  assert.deepEqual(yt, [], 'أسهم القائمة وHome وEnd والتفعيل لا تصل إلى يوتيوب');
});

test('ت-٤: اختصارات يوتيوب (k وj وl وf والأرقام) تصل من أزرار اللوحة وقائمتها، والمسافة خارج الأزرار والحقول تصل', async () => {
  const { page, u } = await mounted();
  const yt = youtubeKeys(page);
  const close = u.qa('.head .b')[1];
  const t = u.qa('.t')[1];
  for (const el of [close, u.switchEl, t, u.list]) {
    for (const k of ['k', 'j', 'l', 'f', '0']) el.dispatchEvent({ type: 'keydown', bubbles: true, key: k });
  }
  assert.deepEqual(yt, Array(4).fill(['k', 'j', 'l', 'f', '0']).flat(), 'كل ضغطة وصلت');
  u.list.dispatchEvent({ type: 'keydown', bubbles: true, key: ' ' });
  assert.deepEqual(yt.slice(-1), [' '], 'المسافة على القائمة نفسها (لا زر ولا حقل) تصل');
});

test('ت-٤: ما تعالجه اللوحة يبقى معزولًا: كل ضغطة في حقل الخطوة، وEnter والمسافة على زر، والأسهم في المقطّعة', async () => {
  const { page, u } = await mounted();
  const yt = youtubeKeys(page);
  const close = u.qa('.head .b')[1];
  for (const k of ['Enter', ' ']) close.dispatchEvent({ type: 'keydown', bubbles: true, key: k });
  const seg = u.segs()[0];
  for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp']) seg.dispatchEvent({ type: 'keydown', bubbles: true, key: k });
  const input = u.q('.num');
  for (const k of ['k', ' ', 'f', 'ArrowLeft', '5']) input.dispatchEvent({ type: 'keydown', bubbles: true, key: k });
  for (const type of ['keyup', 'keypress']) input.dispatchEvent({ type, bubbles: true, key: 'k' });
  assert.deepEqual(yt, [], 'لا ضغطة وصلت');
});
