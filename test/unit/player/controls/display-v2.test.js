// قائمة العرض في الإصدار الثاني (P12-AC1 وP12-AC5 الجزء الآلي): اختيار 1 2 3 أعلاها يبدّل النشطة فورًا برسالة «الترجمة 2»
// وتراجع، والفارغة معطّلة، وبلا تسميات؛ و«علّم للمراجعة» يعلّم المقطع الظاهر الآن في النشطة برسالة وتراجع، ولا يغيّر زمن
// الفيديو. والقائمة بصفوفها السبعة بلا أسطر شرح.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messageFor } from '../../../../src/core/errors/index.js';
import { TOAST_MS, UNDO_MS } from '../../../../src/player/controls/session.js';
import { prepareVideo } from '../overlay/harness.js';
import { AR_CUES, click, key, makeState, mountPage, settle, slotTrack, withSlots } from './harness.js';

const B_CUES = AR_CUES.map((c) => ({ ...c, text: `ب ${c.text}` }));
const three = () => withSlots([slotTrack(), slotTrack({ cues: B_CUES, fileName: 'b.srt' }), null], { offsets: [0, 1200, 0], names: [null, 'نسخة ب', null] });
const openDisplay = (page) => {
  click(page.ui.btn('upload'));
  assert.equal(page.ui.menuLabel(), 'الترجمة العربية');
};
const slotButtons = (page) => page.ui.menu().querySelectorAll('button.slot');

test('اختيار 1 2 3: النشطة مميّزة، والمحفوظة متاحة، والفارغة معطّلة، بلا تسميات ولا شرح', () => {
  const page = mountPage({ state: makeState(three()) });
  openDisplay(page);
  const b = slotButtons(page);
  assert.deepEqual(b.map((x) => [x.textContent, x.getAttribute('aria-checked'), x.getAttribute('data-filled'), x.getAttribute('aria-disabled')]),
    [['1', 'true', 'true', null], ['2', 'false', 'true', null], ['3', 'false', 'false', 'true']]);
  assert.deepEqual(b.map((x) => x.getAttribute('aria-label')), ['الترجمة 1، نشطة', 'الترجمة 2', 'الترجمة 3، فارغة']);
  assert.equal(b[1].getAttribute('title'), 'نسخة ب', 'الاسم المختصر في التلميح وحده');
  assert.equal(page.ui.menuText().includes('نسخة ب'), false, 'بلا تسميات');
  click(b[2]);
  assert.equal(page.controller.calls.some((c) => c[0] === 'activateSlot'), false, 'الفارغة لا تُفعَّل');
  click(b[0]);
  assert.equal(page.controller.calls.some((c) => c[0] === 'activateSlot'), false, 'النشطة لا تُعاد');
});

test('تبديل الترجمة: فوري بإزاحتها، ورسالة «الترجمة 2» بتراجع يعيد السابقة', async () => {
  const page = mountPage({ state: makeState(three()) });
  openDisplay(page);
  click(slotButtons(page)[1]);
  await settle();
  assert.deepEqual(page.controller.calls.filter((c) => c[0] === 'activateSlot'), [['activateSlot', 2]]);
  const s = page.controller.getState();
  assert.equal(s.activeSlot, 2);
  assert.equal(s.view.displayOffsetMs, 1200, 'بإزاحتها');
  assert.equal(page.ui.btn('badge').textContent, '+1.2', 'الشارة تتبع النشطة');
  assert.match(page.ui.menuText(), /b\.srt/, 'القائمة للنشطة الجديدة');
  assert.deepEqual(slotButtons(page).map((x) => x.getAttribute('aria-checked')), ['false', 'true', 'false']);
  const [toast] = page.ui.toasts();
  assert.equal(toast.tone, 'success');
  assert.equal(toast.text, '✓الترجمة 2تراجع');
  page.env.win.advance(TOAST_MS + 10);
  assert.equal(page.ui.toasts().length, 1, 'رسالة التراجع تبقى أطول من العابرة');
  click(page.ui.layerHost().shadowRoot.querySelector('.toasts button.act'));
  await settle();
  assert.deepEqual(page.controller.calls.filter((c) => c[0] === 'activateSlot').map((c) => c[1]), [2, 1]);
  assert.equal(page.controller.getState().activeSlot, 1);
  assert.equal(page.ui.toasts().length, 0, 'تختفي بعد التراجع');
  assert.equal(page.handle.diagnostics().session.switches, 1);
  assert.equal(page.handle.diagnostics().session.undos, 1);
});

test('رسالة التراجع تختفي وحدها بعد مهلتها دون فعل', async () => {
  const page = mountPage({ state: makeState(three()) });
  openDisplay(page);
  click(slotButtons(page)[1]);
  await settle();
  page.env.win.advance(UNDO_MS + 10);
  assert.deepEqual(page.ui.toasts(), []);
  assert.equal(page.controller.calls.filter((c) => c[0] === 'activateSlot').length, 1);
});

test('تعذّر التبديل: رسالة المتحكم كما هي، والمحدد على حاله؛ وأثناء القراءة لا أثر', async () => {
  const page = mountPage({ state: makeState(three()), controllerOpts: { activateFails: 'ST_WRITE_FAILED' } });
  openDisplay(page);
  click(slotButtons(page)[1]);
  await settle();
  assert.ok(page.ui.toasts().some((t) => t.tone === 'error' && t.text.includes(messageFor('ST_WRITE_FAILED'))));
  assert.equal(page.controller.getState().activeSlot, 1);

  const loading = mountPage({ state: makeState({ ...three(), loading: true }) });
  loading.controller.set({ loading: false });
  openDisplay(loading);
  loading.controller.set({ loading: true });
  assert.equal(loading.ui.menu().querySelector('.slots').getAttribute('aria-disabled'), 'true');
  click(slotButtons(loading)[1]);
  await settle();
  assert.equal(loading.controller.calls.some((c) => c[0] === 'activateSlot'), false);
});

test('المحدد بلوحة المفاتيح: التركيز على النشطة، والأسهم بين المحفوظة، وEnter تختار', async () => {
  const page = mountPage({ state: makeState(withSlots([slotTrack(), slotTrack({ fileName: 'b.srt' }), slotTrack({ fileName: 'c.srt' })])) });
  openDisplay(page);
  const b = slotButtons(page);
  assert.deepEqual(b.map((x) => x.getAttribute('tabindex')), ['0', '-1', '-1']);
  b[0].focus();
  key(b[0], 'ArrowRight');
  assert.equal(page.env.doc._focused, b[1]);
  key(b[1], 'ArrowLeft');
  key(b[0], 'ArrowLeft');
  assert.equal(page.env.doc._focused, b[2], 'يدور');
  click(b[2]);
  await settle();
  assert.equal(page.controller.getState().activeSlot, 3);
});

test('«علّم للمراجعة»: المقطع الظاهر الآن بزمن الفيديو والإزاحة، ورسالة بتراجع، ولا يُمس زمن الفيديو', async () => {
  // المقطع 3 من 6000 إلى 8000؛ والإزاحة +1.0 تجعله ظاهرًا من 7000 إلى 9000.
  const page = mountPage({ state: makeState({ ...three(), view: { displayOffsetMs: 1000, displayMode: 'ar' } }) });
  prepareVideo(page.video, { currentTime: 8.5 });
  openDisplay(page);
  click(page.ui.item('علّم للمراجعة'));
  await settle();
  assert.deepEqual(page.controller.calls.filter((c) => c[0] === 'markCue'), [['markCue', 2, 'todo']]);
  assert.equal(page.video.writes, 0, 'لا قفز');
  const [toast] = page.ui.toasts();
  assert.equal(toast.text, '✓عُلِّم المقطع 3 للمراجعةتراجع');
  click(page.ui.layerHost().shadowRoot.querySelector('.toasts button.act'));
  await settle();
  assert.deepEqual(page.controller.calls.at(-1), ['undoMark', 2]);
  assert.equal(page.handle.diagnostics().session.marks, 1);
});

test('بعد انتهاء المقطع بلحظة يبقى هو «الظاهر»؛ وبلا مقطع قريب رسالة مفهومة ولا علامة', async () => {
  const page = mountPage({ state: makeState(three()) });
  prepareVideo(page.video, { currentTime: 3.2 }); // المقطع 1 انتهى عند 3000
  openDisplay(page);
  click(page.ui.item('علّم للمراجعة'));
  await settle();
  assert.deepEqual(page.controller.calls.filter((c) => c[0] === 'markCue').map((c) => c[1]), [0]);

  const none = mountPage({ state: makeState(three()) });
  prepareVideo(none.video, { currentTime: 400 });
  openDisplay(none);
  click(none.ui.item('علّم للمراجعة'));
  await settle();
  assert.equal(none.controller.calls.some((c) => c[0] === 'markCue'), false);
  assert.deepEqual(none.ui.toasts(), [{ tone: 'info', text: `ⓘ${messageFor('CT_NO_VISIBLE_CUE')}` }]);
});

test('تعذّر التراجع: رسالة مفهومة باقية، ورمزه في التشخيص', async () => {
  const page = mountPage({ state: makeState(three()), controllerOpts: { undoFails: 'ST_WRITE_FAILED' } });
  prepareVideo(page.video, { currentTime: 1.5 });
  openDisplay(page);
  click(page.ui.item('علّم للمراجعة'));
  await settle();
  click(page.ui.layerHost().shadowRoot.querySelector('.toasts button.act'));
  await settle();
  assert.deepEqual(page.ui.toasts().map((t) => t.tone), ['error']);
  assert.match(page.ui.toasts()[0].text, /تعذّر التراجع/);
  assert.equal(page.handle.diagnostics().session.lastCode, 'CT_UNDO_FAILED');
});

test('قائمة العرض بترتيب §١٩.٣ في سبعة صفوف: المحدد، والملف، والملخص، والأوضاع الثلاثة، ثم العلامة والرفع معًا', () => {
  const page = mountPage({ state: makeState(three()) });
  openDisplay(page);
  const menu = page.ui.menu();
  const rows = menu.children.filter((c) => !c.classList.contains('sep'));
  assert.deepEqual(rows.map((r) => r.className || r.tagName), ['head', 'row file', 'row summary', 'div', 'pair']);
  assert.equal(rows[3].children.length, 3, 'الأوضاع الثلاثة');
  assert.deepEqual(rows[4].children.map((b) => b.textContent), ['علّم للمراجعة', 'رفع ترجمة…']);
  const full = mountPage({ state: makeState(withSlots([slotTrack(), slotTrack(), slotTrack()])) });
  openDisplay(full);
  assert.ok(full.ui.item('استبدال…'), 'لا خانة فارغة: «استبدال…»');
});
