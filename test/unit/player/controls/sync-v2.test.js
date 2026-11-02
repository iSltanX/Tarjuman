// «مزامنة بجملة…» في قائمة التوقيت (P12-AC3 الجزء الآلي): عرض فرعي عند لحظة الفتح الثابتة، وحتى سبع جمل من النشطة حولها،
// و«أبكر» و«أحدث» و«رجوع»؛ والاختيار يطبّق الإزاحة فورًا (setOffset على الشبكة) برسالة «تراجع»، دون إيقاف أو قفز أو تغيير
// للملف؛ وملف مؤخَّر نحو 3 ثوانٍ يُضبط باختيار جملة واحدة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareVideo } from '../overlay/harness.js';
import { makeCues } from '../../../helpers/fixtures.js';
import { click, makeState, mountPage, settle, slotTrack, withSlots } from './harness.js';

// 30 جملة، كل جملة في الملف مؤخَّرة 3 ثوانٍ عن سماعها: الجملة i تُسمع عند 1000 + 2500·i، وفي الملف عند ذلك + 3000.
const HEARD = makeCues(30, { text: (i) => `الجملة رقم ${i}` });
const LATE = HEARD.map((c) => ({ ...c, startMs: c.startMs + 3000, endMs: c.endMs + 3000 }));

function page({ currentTime = 26.2, offset = 0, cues = LATE } = {}) {
  const p = mountPage({ state: makeState({ ...withSlots([slotTrack({ cues })]), view: { displayOffsetMs: offset, displayMode: 'ar' } }) });
  prepareVideo(p.video, { currentTime, paused: false });
  p.video.pauses = 0;
  p.video.pause = () => p.video.pauses++;
  click(p.ui.btn('badge'));
  return p;
}
const sentences = (p) => p.ui.menu().querySelectorAll('button.sentence');

test('العرض الفرعي: «عند 12:34» من لحظة الفتح، وسبع جمل حول المعروض الآن، والظاهرة مميّزة، وبلا شرح', () => {
  const p = page();
  assert.ok(p.ui.item('مزامنة بجملة…'), 'بند تحت حقل الإزاحة');
  click(p.ui.item('مزامنة بجملة…'));
  assert.equal(p.ui.menu().querySelector('.title').textContent, 'عند 0:26');
  // عند 26.2 ث وبلا إزاحة: الجملة 9 (في الملف 24.0–26.0) انتهت للتو فهي الظاهرة، والنافذة حولها.
  assert.deepEqual(sentences(p).map((b) => b.textContent), [6, 7, 8, 9, 10, 11, 12].map((i) => `الجملة رقم ${i}`));
  assert.equal(sentences(p).find((b) => b.getAttribute('aria-current') === 'true').textContent, 'الجملة رقم 9');
  assert.equal(p.env.doc._focused, sentences(p)[3], 'التركيز داخل العرض على المعروضة');
  assert.equal(p.ui.menuLabel(), 'توقيت الترجمة');
  assert.equal(p.video.writes, 0);
  assert.equal(p.video.pauses, 0);
});

test('ملف مؤخَّر 3 ثوانٍ يُضبط باختيار جملة واحدة: −3.0 فورًا، ورسالة بتراجع، والعرض الفرعي يُغلق', async () => {
  // الجملة 11 تُسمع عند 26.0؛ يفتح المستخدم العرض عند 26.0 ويختارها.
  const p = page({ currentTime: 26.0 });
  click(p.ui.item('مزامنة بجملة…'));
  click(sentences(p).find((b) => b.textContent === 'الجملة رقم 11'));
  assert.deepEqual(p.controller.calls.filter((c) => c[0] === 'setOffset'), [['setOffset', -3000]]);
  assert.equal(p.controller.getState().view.displayOffsetMs, -3000);
  assert.equal(p.ui.btn('badge').textContent, '−3.0');
  assert.equal(sentences(p).length, 0, 'عاد إلى قائمة التوقيت');
  assert.equal(p.env.doc._focused, p.ui.item('مزامنة بجملة…'));
  const [toast] = p.ui.toasts();
  assert.equal(toast.text, 'الإزاحة −3.0 ثتراجع');
  click(p.ui.layerHost().shadowRoot.querySelector('.toasts button.act'));
  await settle();
  assert.deepEqual(p.controller.calls.filter((c) => c[0] === 'setOffset').map((c) => c[1]), [-3000, 0]);
  assert.equal(p.video.writes, 0, 'لا قفز');
  assert.equal(p.video.pauses, 0, 'لا إيقاف');
  assert.equal(p.controller.calls.some((c) => c[0] === 'loadArabicInto' || c[0] === 'loadArabic'), false, 'الملف كما هو');
});

test('الإزاحة على الشبكة وبالنسبة للإزاحة الحالية؛ وتتجاوز التقريب الصغير في اللحظة', () => {
  const p = page({ currentTime: 26.04, offset: 1500 });
  click(p.ui.item('مزامنة بجملة…'));
  click(sentences(p).find((b) => b.textContent === 'الجملة رقم 11'));
  assert.equal(p.controller.getState().view.displayOffsetMs, -3000, 'اللحظة − بداية الجملة، لا تراكم على الإزاحة السابقة');
});

test('«أبكر» و«أحدث» بسبع جمل، ومعطّلان عند الحدين، و«رجوع» إلى قائمة التوقيت بلا تغيير', () => {
  const p = page({ currentTime: 4 });
  click(p.ui.item('مزامنة بجملة…'));
  assert.equal(sentences(p)[0].textContent, 'الجملة رقم 1');
  assert.equal(p.ui.item('أبكر').getAttribute('aria-disabled'), 'true');
  click(p.ui.item('أحدث'));
  assert.equal(sentences(p)[0].textContent, 'الجملة رقم 8');
  click(p.ui.item('أحدث'));
  click(p.ui.item('أحدث'));
  click(p.ui.item('أحدث'));
  assert.equal(sentences(p)[0].textContent, 'الجملة رقم 24', 'آخر نافذة');
  assert.equal(p.ui.item('أحدث').getAttribute('aria-disabled'), 'true');
  click(p.ui.item('أبكر'));
  assert.equal(sentences(p)[0].textContent, 'الجملة رقم 17');
  click(p.ui.item('رجوع'));
  assert.equal(sentences(p).length, 0);
  assert.ok(p.ui.field('offset'));
  assert.equal(p.controller.calls.some((c) => c[0] === 'setOffset'), false);
});

test('اللحظة المرجعية ثابتة: تقدّم الفيديو بعد الفتح لا يغيّر الرأس ولا الإزاحة الناتجة', () => {
  const p = page({ currentTime: 26.0 });
  click(p.ui.item('مزامنة بجملة…'));
  p.video.tickTo(31.7);
  click(p.ui.item('أحدث'));
  click(p.ui.item('أبكر'));
  assert.equal(p.ui.menu().querySelector('.title').textContent, 'عند 0:26');
  click(sentences(p).find((b) => b.textContent === 'الجملة رقم 11'));
  assert.equal(p.controller.getState().view.displayOffsetMs, -3000);
});

test('الجمل سطر واحد: النص متعدد الأسطر يُضم، والكامل في التلميح', () => {
  const cues = makeCues(3, { text: (i) => `سطر أول ${i}\nوسطر ثانٍ` });
  const p = page({ currentTime: 1.5, cues });
  click(p.ui.item('مزامنة بجملة…'));
  assert.deepEqual(sentences(p).map((b) => b.textContent), ['سطر أول 1 وسطر ثانٍ', 'سطر أول 2 وسطر ثانٍ', 'سطر أول 3 وسطر ثانٍ']);
  assert.equal(sentences(p)[0].getAttribute('title'), 'سطر أول 1 وسطر ثانٍ');
});

test('العرض الفرعي لا يُغلق مع اختفاء الشريط (قرار ينتظر)، ويُغلق بـEsc أو بالنقر خارجه', () => {
  const p = page();
  click(p.ui.item('مزامنة بجملة…'));
  p.env.doc.body.focus?.();
  const outside = p.env.doc.createElement('input');
  p.env.doc.body.appendChild(outside);
  outside.focus();
  p.player.classList.add('ytp-autohide');
  p.env.win.advance(1100);
  assert.equal(p.ui.menuOpen(), true);
  assert.equal(sentences(p).length, 7);
  p.env.doc.body.dispatchEvent({ type: 'pointerdown', bubbles: true });
  assert.equal(p.ui.menuOpen(), false);
});

test('تدقيق 5fedcb9 (CX-004): «تراجع» المزامنة بعد تبديل الترجمة النشطة لا يكتب إزاحة الأولى في الثانية', async () => {
  const p = mountPage({ state: makeState({ ...withSlots([slotTrack({ cues: LATE }), slotTrack({ cues: HEARD })], { offsets: [1000, 7000, 0] }), view: { displayOffsetMs: 1000, displayMode: 'ar' } }) });
  prepareVideo(p.video, { currentTime: 26.0, paused: false });
  click(p.ui.btn('badge'));
  click(p.ui.item('مزامنة بجملة…'));
  click(sentences(p).find((b) => b.textContent === 'الجملة رقم 11'));
  assert.equal(p.controller.getState().view.displayOffsetMs, -3000);
  await p.controller.activateSlot(2);
  await settle();
  assert.equal(p.controller.getState().view.displayOffsetMs, 7000, 'الثانية بإزاحتها');
  click(p.ui.layerHost().shadowRoot.querySelector('.toasts button.act'));
  await settle();
  assert.equal(p.controller.getState().view.displayOffsetMs, 7000, 'لا تُكتب إزاحة الأولى في الثانية');
  assert.deepEqual(p.controller.calls.filter((c) => c[0] === 'setOffset').map((c) => c[1]), [-3000]);
  assert.ok(p.ui.toasts().some((t) => t.text.includes('تغيّرت الترجمة النشطة')), 'يُقال لماذا');
});

test('تدقيق 5fedcb9 (GM-003): بعد نقرة فأرة في القائمة لا يبقى التركيز فيها، فتُغلق مع اختفاء الشريط ولا تلتقط الضغطات خفية؛ وبلوحة المفاتيح تبقى ظاهرة', async () => {
  const p = page();
  const shadow = p.ui.layerHost().shadowRoot;
  // نقرة فأرة على بند يبقي القائمة مفتوحة (خطوة الأزرار)؛ المتصفح يركّز الزر عند الضغط قبل النقر.
  const mouse = (el) => { el.focus(); click(el); };
  mouse(p.ui.field('step:1000'));
  await settle();
  assert.equal(shadow.activeElement ?? null, null, 'لا تركيز باقٍ بعد نقرة الفأرة');
  p.player.classList.add('ytp-autohide');
  p.env.win.advance(1100);
  assert.equal(p.ui.menuOpen(), false, 'أُغلقت مع الشريط');
  // بلوحة المفاتيح (detail = 0) يبقى التركيز، فتبقى القائمة مفتوحة وظاهرة.
  p.player.classList.remove('ytp-autohide');
  p.env.win.advance(1100);
  click(p.ui.btn('badge'), 0);
  const step = p.ui.field('step:500');
  step.focus();
  click(step, 0);
  await settle();
  assert.ok(shadow.activeElement, 'التركيز باقٍ للوحة المفاتيح');
  p.player.classList.add('ytp-autohide');
  p.env.win.advance(1100);
  assert.equal(p.ui.menuOpen(), true, 'باقية مفتوحة');
  assert.equal(shadow.querySelector('.layer').hasAttribute('data-keep'), true, 'وظاهرة (لا opacity 0)');
});
