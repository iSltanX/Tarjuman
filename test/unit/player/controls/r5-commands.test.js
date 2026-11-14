// الفكرة ١٠، المسار (ب) (ح-55): أفعال الأوامر الخمسة على جلسة الشريط (mountControls(...).command(name))، كما يمرّرها معالج الرسائل:
// - display-mode: الدورة بترتيب قائمة «الترجمة» (الترجمة وحدها ← فوق الأصل ← إخفاء)، وتتخطى «فوق الأصل» حين لا أصل، برسالة قصيرة بالوضع.
// - offset-earlier وoffset-later: ± بخطوة الإعدادات (nudgeOffset)، برسالة قصيرة بالإزاحة لأن تلميح الشريط لا يظهر حين يُخفى الشريط،
//   ورسالة واحدة تتبدّل مع كل ضغطة.
// - mark-review: «علّم للمراجعة» على الجملة الظاهرة كما هو (markVisible).
// - replay-line: «إعادة الجملة»: القفز إلى بداية الجملة الظاهرة (بالإزاحة)، وإلا آخر جملة بدأت؛ بلا تشغيل ولا إيقاف، ولا أثناء الإعلان.
// وفي صفحة فيديو بلا ترجمة رسالة قصيرة واحدة ولا فعل، وأثناء قراءة الترجمة المحفوظة رسالتها.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messageFor } from '../../../../src/core/errors/index.js';
import { replayCueIndex } from '../../../../src/player/controls/sentence.js';
import { nudgeFlash } from '../../../../src/player/controls/text.js';
import { AR_CUES, EN_CUES, arabic, makeState, mountPage, settle } from './harness.js';

const english = () => ({ key: 'en|manual', kind: 'manual', lang: 'en', cues: EN_CUES, source: 'captured' });
const modeCalls = (page) => page.controller.calls.filter((c) => c[0] === 'setDisplayMode').map((c) => c[1]);
const NEEDS = 'لا ترجمة لهذا الفيديو بعد. ارفع ترجمتك أولًا.';

test('replayCueIndex: الظاهرة، ثم بعد انتهائها بلحظة هي نفسها، ثم آخر ما بدأ، ولا شيء قبل أول جملة', () => {
  const cues = [{ n: 1, startMs: 1000, endMs: 2000, text: 'أ' }, { n: 2, startMs: 10000, endMs: 12000, text: 'ب' }, { n: 3, startMs: 11500, endMs: 13000, text: 'ج' }];
  assert.equal(replayCueIndex(cues, 1500), 0, 'الظاهرة');
  assert.equal(replayCueIndex(cues, 2500), 0, 'انتهت قبل لحظة');
  assert.equal(replayCueIndex(cues, 6000), 0, 'بين جملتين بعيدتين: آخر ما بدأ');
  assert.equal(replayCueIndex(cues, 20000), 2, 'بعد الأخيرة: آخر ما بدأ');
  assert.equal(replayCueIndex(cues, 999), null, 'قبل أول جملة');
  assert.equal(replayCueIndex([], 5000), null);
  assert.equal(replayCueIndex(cues, NaN), null);
});

test('display-mode: الترجمة وحدها ← فوق الأصل ← إخفاء ← الترجمة وحدها، برسالة قصيرة واحدة بالوضع الجديد', async () => {
  const page = mountPage({ state: makeState({ arabic: arabic(), english: english() }) });
  assert.deepEqual(page.handle.command('display-mode'), { ok: true });
  await settle();
  assert.deepEqual(page.ui.toasts(), [{ tone: 'info', text: 'وضع العرض: الترجمة فوق الإنجليزية' }]);
  page.handle.command('display-mode');
  await settle();
  assert.deepEqual(page.ui.toasts(), [{ tone: 'info', text: 'وضع العرض: إخفاء الترجمة' }], 'الرسالة تتبدّل ولا تتراكم');
  page.handle.command('display-mode');
  await settle();
  assert.deepEqual(page.ui.toasts(), [{ tone: 'info', text: 'وضع العرض: الترجمة وحدها' }]);
  assert.deepEqual(modeCalls(page), ['dual', 'off', 'ar']);
});

test('display-mode بلا أصل: تتخطى «فوق الأصل»، ومن «فوق الأصل» المحفوظ إلى الإخفاء', async () => {
  const page = mountPage({ state: makeState({ arabic: arabic() }) });
  page.handle.command('display-mode');
  page.handle.command('display-mode');
  assert.deepEqual(modeCalls(page), ['off', 'ar']);
  const dual = mountPage({ state: makeState({ arabic: arabic(), view: { displayOffsetMs: 0, displayMode: 'dual' } }) });
  dual.handle.command('display-mode');
  assert.deepEqual(modeCalls(dual), ['off']);
});

test('offset-later وoffset-earlier: ± بخطوة الإعدادات، ورسالة واحدة بالإزاحة الجديدة تتبدّل مع كل ضغطة، بلا تلميح عابر', async () => {
  const page = mountPage({ state: makeState({ arabic: arabic() }) });
  assert.deepEqual(page.handle.command('offset-later'), { ok: true });
  await settle();
  assert.deepEqual(page.controller.calls.filter((c) => c[0] === 'nudgeOffset'), [['nudgeOffset', 1]]);
  assert.equal(page.controller.getState().view.displayOffsetMs, 500);
  assert.deepEqual(page.ui.toasts(), [{ tone: 'info', text: nudgeFlash(500) }]);
  page.handle.command('offset-later');
  page.handle.command('offset-earlier');
  page.handle.command('offset-earlier');
  page.handle.command('offset-earlier');
  await settle();
  assert.deepEqual(page.controller.calls.filter((c) => c[0] === 'nudgeOffset').map((c) => c[1]), [1, 1, -1, -1, -1]);
  assert.equal(page.controller.getState().view.displayOffsetMs, -500);
  assert.deepEqual(page.ui.toasts(), [{ tone: 'info', text: nudgeFlash(-500) }], 'رسالة واحدة بالقيمة الأخيرة');
  // الإزاحة بإشارتها معزولة LTR كتلميح ± نفسه (FA-05)، فلا تنتقل العلامة إلى آخرها في الجملة العربية.
  assert.equal(page.ui.toasts()[0].text, '\u2066−0.5\u2069 ث · تظهر أبكر');
  assert.equal(page.ui.tip(), null, 'لا تلميح عابر فوق الشريط');
  // الرسالة نفسها بلا شريط ظاهر: تُرسم في طبقة المشغّل لا في التلميح.
  const toasts = page.ui.layerHost().shadowRoot.querySelector('.toasts');
  assert.ok(toasts.children.length === 1 && !toasts.hasAttribute('hidden'));
});

test('mark-review: «علّم للمراجعة» على الجملة الظاهرة كما هو، برسالته وتراجعه', async () => {
  const page = mountPage({ state: makeState({ arabic: arabic() }) });
  page.video.currentTime = 4.0; // المقطع 2 من 3500 إلى 5500
  assert.deepEqual(page.handle.command('mark-review'), { ok: true });
  await settle();
  assert.deepEqual(page.controller.calls.filter((c) => c[0] === 'markCue'), [['markCue', 1, 'todo']]);
  assert.equal(page.ui.toasts()[0].text, 'عُلِّم المقطع 2 للمراجعةتراجع');
  assert.equal(page.video.currentTime, 4.0, 'لا قفز');
});

test('replay-line: إلى بداية الجملة الظاهرة بالإزاحة، بلا تشغيل ولا إيقاف ولا تغيير في الإزاحة', async () => {
  const page = mountPage({ state: makeState({ arabic: arabic(), view: { displayOffsetMs: 1000, displayMode: 'ar' } }) });
  page.video.paused = true;
  page.video.currentTime = 5.2; // زمن البحث 4200: المقطع 2 (3500–5500) ظاهر، فبدايته الظاهرة 4500
  assert.deepEqual(page.handle.command('replay-line'), { ok: true });
  await settle();
  assert.equal(page.video.currentTime, 4.5);
  assert.equal(page.video.paused, true, 'بلا تشغيل');
  assert.deepEqual(page.controller.calls.filter((c) => /Offset|setDisplayMode|markCue/.test(c[0])), [], 'لا يمس الإزاحة ولا الوضع ولا العلامات');
  assert.deepEqual(page.ui.toasts(), [], 'القفز يُرى، فلا رسالة');
});

test('replay-line: بلا جملة ظاهرة إلى آخر جملة بدأت؛ وقبل أول جملة رسالة ولا قفز', async () => {
  const cues = [{ n: 1, startMs: 1000, endMs: 2000, text: 'أ' }, { n: 2, startMs: 10000, endMs: 12000, text: 'ب' }];
  const page = mountPage({ state: makeState({ arabic: arabic({ cues }) }) });
  page.video.currentTime = 6.0;
  page.handle.command('replay-line');
  assert.equal(page.video.currentTime, 1.0, 'آخر ما بدأ: الأولى');
  page.video.currentTime = 0.5;
  page.handle.command('replay-line');
  await settle();
  assert.equal(page.video.currentTime, 0.5, 'لا قفز');
  assert.deepEqual(page.ui.toasts(), [{ tone: 'info', text: 'لم تبدأ جملة من الترجمة قبل هذه اللحظة.' }]);
});

test('replay-line أثناء الإعلان: لا قفز بزمن الإعلان، ورسالته', async () => {
  const page = mountPage({ state: makeState({ arabic: arabic() }) });
  page.player.classList.add('ad-showing');
  page.video.currentTime = 4.0;
  page.handle.command('replay-line');
  await settle();
  assert.equal(page.video.currentTime, 4.0);
  assert.deepEqual(page.ui.toasts(), [{ tone: 'info', text: messageFor('CT_AD_SHOWING') }]);
});

test('صفحة فيديو بلا ترجمة: الأوامر الخمسة لا تفعل شيئًا، ورسالة قصيرة واحدة تقول السبب', async () => {
  const page = mountPage({ state: makeState() });
  page.video.currentTime = 4.0;
  for (const name of ['display-mode', 'offset-earlier', 'offset-later', 'mark-review', 'replay-line']) {
    assert.deepEqual(page.handle.command(name), { ok: false, code: 'CT_NEEDS_ARABIC' }, name);
  }
  await settle();
  assert.deepEqual(page.controller.calls.filter((c) => c[0] !== 'dismissNotice'), [], 'لا فعل في المتحكم');
  assert.equal(page.video.currentTime, 4.0);
  assert.deepEqual(page.ui.toasts(), [{ tone: 'info', text: NEEDS }], 'رسالة واحدة لا خمس');
});

test('أثناء قراءة الترجمة المحفوظة: رسالة القراءة ولا فعل؛ واسم غير معروف لا يفعل شيئًا', async () => {
  const page = mountPage({ state: makeState({ arabic: arabic(), loading: true }) });
  assert.deepEqual(page.handle.command('offset-later'), { ok: false, code: 'CT_LOADING' });
  await settle();
  assert.deepEqual(page.controller.calls.filter((c) => c[0] === 'nudgeOffset'), []);
  assert.deepEqual(page.ui.toasts(), [{ tone: 'info', text: messageFor('CT_LOADING') }]);
  const ok = mountPage({ state: makeState({ arabic: arabic() }) });
  assert.deepEqual(ok.handle.command('seek'), { ok: false, code: 'TJ_BAD_MESSAGE' });
  assert.deepEqual(ok.controller.calls.filter((c) => c[0] !== 'dismissNotice'), []);
});

test('بلا جلسة (لا شريط بعد): الأمر لا يفعل شيئًا برمزه', () => {
  const page = mountPage({ state: makeState({ arabic: arabic() }), withBar: false });
  assert.deepEqual(page.handle.command('offset-later'), { ok: false, code: 'TJ_NO_VIDEO' });
  assert.deepEqual(page.controller.calls, []);
  assert.equal(AR_CUES.length, 5);
});
