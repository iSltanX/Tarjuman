// ف7 (2026-11-10): رسالة صادقة حين تكون CC مفعّلة ولم يُلتقط شيء. قبل تشغيل CC تبقى «فعّل ترجمة يوتيوب (CC)…»، وزر CC مضغوط
// ولا التقاط بعد ثانيتين ⇒ «مفعّلة لكن ترجمان لم يلتقطها. أوقف CC ثم شغّلها…». وفي غلافي الالتقاط عدّ الطلبات المرئية يُبلَّغ
// عند الطلب، والمستخرج يعدّها للفيديو المعروض في تشخيصه («طلبات مرئية: 0» حين لم يُرَ طلب). مقارنة العقد بـassert.ok.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { messageFor } from '../../../../src/core/errors/index.js';
import { videoIdFromLocation } from '../../../../src/core/model/video-location.js';
import { createExtractor } from '../../../../src/extract/index.js';
import { validateSeenMessage } from '../../../../src/extract/message.js';
import { readTimedtextParams } from '../../../../src/extract/timedtext-params.js';
import { mountControls } from '../../../../src/player/controls/index.js';
import { CC_GRACE_MS } from '../../../../src/player/controls/session.js';
import { ccLanguagesLine } from '../../../../src/player/controls/text.js';
import { isSubtitlesButton } from '../../../../src/player/youtube-dom.js';
import { addPlayer, createFakeEnv } from '../overlay/fake-dom.js';
import { addBar, arabic, click, fakeController, fakeFlows, inspect, key, makeState, mountPage, pointerdown, settle, trackInfo } from './harness.js';

/** صفحة بأدوات ترجمان وساعة تتقدّم مع المؤقتات. @param {object} [over] حقول الحالة (مثل available) */
function page(over = {}) {
  const env = createFakeEnv();
  let t = Date.parse('2026-11-10T12:00:00.000Z');
  const parts = addPlayer(env);
  const bar = addBar(env, parts);
  const controller = fakeController(makeState(over));
  const flows = fakeFlows();
  const handle = mountControls(controller, { doc: env.doc, win: env.win, exportFlow: flows.exportFlow, importFlow: flows.importFlow, now: () => t, uiFonts: null });
  const tick = (ms) => {
    for (let left = ms; left > 0; left -= 100) {
      t += Math.min(100, left);
      env.win.advance(Math.min(100, left));
    }
  };
  return { env, ...parts, ...bar, controller, handle, tick, ui: inspect(env, parts) };
}
const menuText = (p) => p.ui.menuText();

const RESTART = 'إعادة تشغيل CC';
const ON_NOW = 'تفعيل CC الآن';

test('قبل تشغيل CC الرسالة القديمة، وCC مضغوط بلا التقاط بعد ثانيتين زر «إعادة تشغيل CC» والقائمة مفتوحة، ورسالته خلف «لماذا؟» (٧-ب)', () => {
  const p = page();
  click(p.ui.btn('download'));
  assert.match(menuText(p), /فعّل ترجمة يوتيوب \(CC\)/);
  p.cc.setAttribute('aria-pressed', 'true');
  p.tick(CC_GRACE_MS - 600);
  assert.match(menuText(p), /فعّل ترجمة يوتيوب \(CC\)/, 'قبل المهلة');
  assert.ok(p.ui.item(RESTART) === null, 'ولا زر قبلها');
  p.tick(1700);
  assert.ok(p.ui.item(RESTART), 'بعد المهلة، والقائمة مفتوحة يعيدها الفحص الدوري');
  assert.ok(!menuText(p).includes(messageFor('CT_CC_NOT_CAPTURED')), 'زر واحد بدل الرسالة');
  click(p.ui.item('لماذا؟'));
  assert.equal(menuText(p).split(messageFor('CT_CC_NOT_CAPTURED')).length - 1, 1, 'الإرشاد اليدوي خلف «لماذا؟» مرة واحدة');
  assert.match(messageFor('CT_CC_NOT_CAPTURED'), /أوقف CC ثم شغّلها/);
  assert.match(messageFor('CT_CC_NOT_CAPTURED'), /تشخيص الصفحة/);
  // وصل الالتقاط: لا رسالة «لم يُلتقط» أصلًا ولا زر.
  p.controller.set({ captured: [trackInfo()] });
  p.tick(1100);
  assert.ok(!menuText(p).includes(messageFor('CT_CC_NOT_CAPTURED')));
  assert.ok(p.ui.item(RESTART) === null);
  p.handle.unmount();
});

test('إيقاف CC يعيد العدّ: تشغيلها من جديد ينتظر مهلته كاملة', () => {
  const p = page();
  p.cc.setAttribute('aria-pressed', 'true');
  p.tick(CC_GRACE_MS + 1100);
  p.cc.setAttribute('aria-pressed', 'false');
  p.tick(1100);
  p.cc.setAttribute('aria-pressed', 'true');
  p.tick(1100);
  click(p.ui.btn('download'));
  assert.ok(!menuText(p).includes(messageFor('CT_CC_NOT_CAPTURED')), 'لم تنقضِ المهلة بعد التشغيل الثاني');
  assert.ok(p.ui.item(RESTART) === null, 'ولا زر «إعادة تشغيل CC» (٧-ب)');
  p.handle.unmount();
});

// ———— العدّ في غلافي الالتقاط والمستخرج ————

const SOURCE = readFileSync(new URL('../../../../src/main-world/capture.js', import.meta.url), 'utf8');
const IMPORT_LINES = /^import \{ (?:readTimedtextParams|videoIdFromLocation) \} from '[^']+';\s*$/gm;
const ORIGIN = 'https://www.youtube.com';
const TIMEDTEXT = `${ORIGIN}/api/timedtext?v=AAAAAAAAAAA&lang=en&fmt=json3`;

function loadCapture() {
  const posted = [];
  class FakeXHR {
    addEventListener() {}
    open() {}
    send() {}
  }
  const win = {
    location: { origin: ORIGIN, href: `${ORIGIN}/watch?v=AAAAAAAAAAA` },
    postMessage(m) { posted.push(m); },
    fetch() { return new Promise(() => {}); },
    XMLHttpRequest: FakeXHR,
  };
  vm.runInContext(SOURCE.replace(IMPORT_LINES, ''), vm.createContext({ window: win, URL, Response, Request, TextDecoder, WeakMap, Promise, JSON, String, readTimedtextParams, videoIdFromLocation }));
  return { win, posted };
}

test('الغلافان: كل طلب ترجمة يُبلَّغ عند الطلب نفسه (قبل استجابته) بمعرّف الفيديو وعدد، وغيره لا', () => {
  const { win, posted } = loadCapture();
  win.fetch(`${ORIGIN}/youtubei/v1/player`);
  assert.equal(posted.length, 0, 'طلب غير الترجمة لا يُعدّ');
  win.fetch(TIMEDTEXT);
  const x = new win.XMLHttpRequest();
  x.open('GET', TIMEDTEXT);
  x.send();
  assert.deepEqual(posted.map((m) => ({ ...m })), [
    { source: 'tarjuman', v: 1, kind: 'seen', videoId: 'AAAAAAAAAAA', seen: 1 },
    { source: 'tarjuman', v: 1, kind: 'seen', videoId: 'AAAAAAAAAAA', seen: 2 },
  ], 'أعداد ومعرّف فقط، بلا رابط ولا رمز');
});

test('رسالة «رُئي طلب»: المعرّف والعدد الصحيحان وحدهما، وغير ذلك مرفوض', () => {
  assert.deepEqual(validateSeenMessage({ source: 'tarjuman', v: 1, kind: 'seen', videoId: 'AAAAAAAAAAA', seen: 3, url: 'x' }), { videoId: 'AAAAAAAAAAA', seen: 3 });
  for (const bad of [{ seen: 0 }, { seen: 1.5 }, { seen: -1 }, { seen: 2_000_000 }, { kind: 'timedtext', seen: 1 }]) {
    assert.equal(validateSeenMessage({ source: 'tarjuman', v: 1, kind: 'seen', videoId: 'AAAAAAAAAAA', ...bad }), null, JSON.stringify(bad));
  }
  assert.equal(validateSeenMessage({ source: 'tarjuman', v: 1, kind: 'seen', videoId: 'bad', seen: 1 }).videoId, null);
});

test('المستخرج: «طلبات مرئية» للفيديو المعروض وحده، وصفر حين لم يُرَ طلب، ويُصفَّر بتغيّر الفيديو', () => {
  let current = 'AAAAAAAAAAA';
  const ex = createExtractor({ currentVideoId: () => current, now: () => 0 });
  assert.equal(ex.diagnostics().requestsSeen, 0, '«طلبات مرئية: 0»');
  const seen = (videoId, n) => ex.handleMessage({ source: 'tarjuman', v: 1, kind: 'seen', videoId, seen: n });
  assert.deepEqual(seen('AAAAAAAAAAA', 1), { accepted: true, code: null });
  seen('AAAAAAAAAAA', 2);
  seen('BBBBBBBBBBB', 3);
  assert.equal(ex.diagnostics().requestsSeen, 2);
  assert.equal(ex.diagnostics().requestsSeenPage, 3);
  current = 'BBBBBBBBBBB';
  ex.setVideo('BBBBBBBBBBB');
  assert.equal(ex.diagnostics().requestsSeen, 0);
});

// ———— من مراجعة المرحلة 6 ————

test('م1: أثناء الإعلان لا رسالة «لم يلتقطها» (المشغّل لا يجلب ترجمة الفيديو قبل انتهائه)، وبعده تبدأ المهلة من أولها', () => {
  const p = page();
  p.player.classList.add('ad-showing');
  p.cc.setAttribute('aria-pressed', 'true');
  p.tick(CC_GRACE_MS + 1500);
  click(p.ui.btn('download'));
  assert.ok(!menuText(p).includes(messageFor('CT_CC_NOT_CAPTURED')), 'لا إنذار أثناء الإعلان');
  assert.ok(p.ui.item(RESTART) === null, 'ولا زر «إعادة تشغيل CC» (٧-ب)');
  p.player.classList.remove('ad-showing');
  p.tick(1100);
  assert.ok(p.ui.item(RESTART) === null, 'المهلة من انتهاء الإعلان');
  p.tick(CC_GRACE_MS);
  assert.ok(p.ui.item(RESTART), 'بعد المهلة زر «إعادة تشغيل CC»، ورسالته خلف «لماذا؟»');
  p.handle.unmount();
});

test('م2: التقاط مرفوض (captureIssue) يقول سببه وحده، بلا «لم يلتقطها» معه ولا زر «إعادة تشغيل CC»', () => {
  const p = page();
  p.controller.set({ captureIssue: { code: 'EX_NOT_ENGLISH' } });
  p.cc.setAttribute('aria-pressed', 'true');
  p.tick(CC_GRACE_MS + 1500);
  click(p.ui.btn('download'));
  assert.ok(!menuText(p).includes(messageFor('CT_CC_NOT_CAPTURED')));
  assert.ok(menuText(p).includes(messageFor('EX_NOT_ENGLISH')));
  assert.ok(p.ui.item(RESTART) === null && p.ui.item(ON_NOW) === null);
  p.handle.unmount();
});

// ———— ح-40 (الجولة الثالثة، الفكرة ٧-أ): زر CC لا يغلق «تنزيل الأصل» ————
// الضغط على زر CC هو الفعل الذي تطلبه القائمة، فتبقى مفتوحة وتتحدّث وحدها حين يصل الالتقاط. وتُغلق بأي نقر آخر خارجها (ومنه ⚙)
// وبـEsc، والقوائم الأخرى تُغلق بزر CC كما كانت.

/** رمز داخل زر CC كما في يوتيوب: هدف النقرة عنصر داخل الزر لا الزر نفسه. */
const ccIcon = (p) => {
  const svg = p.env.doc.createElement('svg');
  p.cc.appendChild(svg);
  return svg;
};

test('ح-40: الضغط على زر CC (أو رمزه) والقائمة مفتوحة لا يغلقها، وتعرض المسار وحدها حين يصل الالتقاط', () => {
  const p = page();
  click(p.ui.btn('download'));
  assert.ok(menuText(p).includes(messageFor('CT_NOT_CAPTURED')));
  pointerdown(ccIcon(p));
  assert.equal(p.ui.menuOpen(), true, 'رمز CC داخل الزر');
  pointerdown(p.cc);
  assert.equal(p.ui.menuOpen(), true, 'الزر نفسه');
  p.cc.setAttribute('aria-pressed', 'true');
  p.tick(500);
  p.controller.set({ captured: [trackInfo()] });
  assert.equal(p.ui.menuOpen(), true);
  assert.ok(menuText(p).includes('الإنجليزية · يدوية · 412\u00A0مقطعًا'), 'المسار الملتقط في القائمة المفتوحة');
  assert.ok(p.ui.item('تنزيل الملف'), 'وزر التنزيل');
  assert.ok(!menuText(p).includes(messageFor('CT_NOT_CAPTURED')));
  p.handle.unmount();
});

test('ح-40: وتُغلق بأي نقر آخر خارجها (⚙ والفيديو) وبـEsc', () => {
  const p = page();
  for (const [name, el] of [['⚙', p.yt[1]], ['الفيديو', p.video]]) {
    click(p.ui.btn('download'));
    pointerdown(p.cc);
    assert.equal(p.ui.menuOpen(), true, `قبل ${name}`);
    pointerdown(el);
    assert.equal(p.ui.menuOpen(), false, name);
  }
  click(p.ui.btn('download'));
  pointerdown(p.cc);
  assert.equal(p.ui.menuOpen(), true);
  key(p.env.doc.body, 'Escape');
  assert.equal(p.ui.menuOpen(), false, 'Esc');
  p.handle.unmount();
});

test('ح-40: القوائم الأخرى (التوقيت والترجمة) تُغلق بالضغط على زر CC كما كانت', () => {
  const p = mountPage({ state: makeState({ arabic: arabic() }) });
  click(p.ui.btn('badge'));
  assert.equal(p.ui.menuLabel(), 'توقيت الترجمة');
  pointerdown(p.cc);
  assert.equal(p.ui.menuOpen(), false, 'التوقيت');
  click(p.ui.btn('upload'));
  assert.equal(p.ui.menuOpen(), true);
  pointerdown(p.cc);
  assert.equal(p.ui.menuOpen(), false, 'الترجمة');
  p.handle.unmount();
});

test('ح-40: فُتحت بلوحة المفاتيح ثم ضُغط CC: التركيز يبقى فيها حين تُبنى بالمسار، وانتقاله إلى زر CC لا يغلقها', () => {
  const p = page();
  const root = p.ui.layerHost().shadowRoot;
  click(p.ui.btn('download'), 0);
  assert.ok(root.activeElement === p.ui.item('لماذا؟'), 'التركيز على «لماذا؟»');
  pointerdown(p.cc);
  p.controller.set({ captured: [trackInfo()] });
  assert.equal(p.ui.menuOpen(), true);
  assert.ok(root.activeElement === p.ui.item('تنزيل الملف'), 'زال «لماذا؟» فالتركيز على أول القائمة لا على الصفحة');
  // المتصفح ينقل التركيز إلى الزر المنقور: خروجه إلى زر CC لا يغلقها، وإلى غيره يغلقها كما كان (U46).
  p.cc.focus();
  assert.equal(p.ui.menuOpen(), true, 'التركيز إلى زر CC');
  p.ui.item('تنزيل الملف').focus();
  p.yt[1].focus();
  assert.equal(p.ui.menuOpen(), false, 'التركيز إلى ⚙');
  p.handle.unmount();
});

// ص-٢٥ (تحقق 2.3.0): متصفح لا يركّز الأزرار بالنقر (Firefox على macOS بالتفضيل accessibility.mouse_focuses_formcontrol=0، وهو
// سلوكه القديم وسلوك Safari) ينقل التركيز عند نقرة CC إلى أقرب سلف يقبله، #movie_player (tabindex=-1)، لا إلى زر CC؛ فكان focusLeave
// يغلق القائمة المفتوحة بلوحة المفاتيح (ثبت حيًّا في Firefox 160 بلا نافذة بذلك التفضيل).
test('ص-٢٥: فُتحت بلوحة المفاتيح ثم ضُغط CC فانتقل التركيز إلى المشغّل لا إلى الزر: تبقى مفتوحة، والاستثناء للضغطة نفسها وحدها', () => {
  const p = page();
  const root = p.ui.layerHost().shadowRoot;
  click(p.ui.btn('download'), 0);
  assert.ok(root.activeElement === p.ui.item('لماذا؟'), 'التركيز فيها');
  // الضغطة على رمز داخل الزر، والمتصفح ينقل التركيز في المهمة نفسها إلى المشغّل.
  pointerdown(ccIcon(p));
  p.player.focus();
  assert.equal(p.ui.menuOpen(), true, 'التركيز إلى المشغّل بضغطة CC لا يغلقها');
  // انقضت مهمة الضغطة: خروج التركيز من القائمة إلى المشغّل بغيرها يغلقها كما كان (U46).
  p.tick(100);
  p.ui.item('لماذا؟').focus();
  p.player.focus();
  assert.equal(p.ui.menuOpen(), false, 'التركيز إلى المشغّل بلا ضغطة CC');
  // وفي المهمة نفسها لا يُستثنى إلا سلف ما ضُغط: التركيز إلى عنصر لا يحوي زر CC يغلقها.
  click(p.ui.btn('download'), 0);
  pointerdown(p.cc);
  p.yt[1].focus();
  assert.equal(p.ui.menuOpen(), false, 'التركيز إلى ⚙ بعد ضغطة CC');
  p.handle.unmount();
});

test('ص-٢٥ (ح-40): الاستثناء لـ«تنزيل الأصل» وحدها: التوقيت والترجمة المفتوحتان بلوحة المفاتيح تُغلقان حين ينتقل التركيز إلى زر CC أو إلى المشغّل', () => {
  const p = mountPage({ state: makeState({ arabic: arabic() }) });
  const root = p.ui.layerHost().shadowRoot;
  for (const [kind, name] of [['badge', 'التوقيت'], ['upload', 'الترجمة']]) {
    click(p.ui.btn(kind), 0);
    assert.equal(p.ui.menuOpen(), true, name);
    assert.ok(root.activeElement, `${name}: التركيز فيها`);
    p.cc.focus();
    assert.equal(p.ui.menuOpen(), false, `${name}: التركيز إلى زر CC (بـTab)`);
    click(p.ui.btn(kind), 0);
    assert.ok(root.activeElement, `${name}: التركيز فيها`);
    p.player.focus();
    assert.equal(p.ui.menuOpen(), false, `${name}: التركيز إلى المشغّل`);
  }
  p.handle.unmount();
});

test('isSubtitlesButton: زر CC في المشغّل وما داخله نعم، وما خارجه وnull لا', () => {
  const p = page();
  assert.equal(isSubtitlesButton(p.cc), true, 'الزر');
  assert.equal(isSubtitlesButton(ccIcon(p)), true, 'عنصر داخل الزر');
  for (const [name, el] of [['⚙', p.yt[1]], ['الفيديو', p.video], ['المشغّل', p.player], ['زر ترجمان', p.ui.btn('download')], ['القائمة', p.ui.menu()], ['الصفحة', p.env.doc.body]]) {
    assert.equal(isSubtitlesButton(el), false, name);
  }
  // زر بالصنف نفسه خارج المشغّل ليس زر CC فيه.
  const stray = p.env.doc.createElement('button');
  stray.className = 'ytp-subtitles-button';
  p.env.doc.body.appendChild(stray);
  assert.equal(isSubtitlesButton(stray), false, 'خارج المشغّل');
  for (const x of [null, undefined, p.env.doc, p.env.win]) assert.equal(isSubtitlesButton(x), false, String(x));
  p.handle.unmount();
});

// ———— ح-56 (الجولة الخامسة، الفكرة ٧-ب): زر واحد يضغط زر CC بدل كتلة الإرشاد ————
// «تفعيل CC الآن» حين CC مطفأة وللفيديو مسارات، و«إعادة تشغيل CC» حين ccStuck. الضغطة بنقرة المستخدم على الزر، وتقرأ حال زر CC قبل
// كل ضغطة (من «مطفأة» ضغطة، و«الإعادة» ضغطتان بينهما انتظار الحال)، ثم انتظار بمهلة: وصل الالتقاط فالقائمة تتحدّث (ح-40)، وإلا
// «لم يصل شيء — أعد تحميل الصفحة». والإرشاد اليدوي خلف «لماذا؟». ولا ضغط والزر معطّل أو أثناء إعلان أو بث، ولا زر بلا زر CC.

/** لغتان في بيانات المشغّل، ولا التقاط بعد. */
const AVAILABLE = { videoId: 'AAAAAAAAAAA', tracks: [{ lang: 'en', kind: 'manual', name: 'English' }, { lang: 'es', kind: 'manual', name: 'Español' }], translatable: false };
const WAITING = 'جارٍ انتظار ترجمة يوتيوب…';
const NO_EFFECT = 'لم يصل شيء — أعد تحميل الصفحة';

/** زر CC كزر يوتيوب: الضغطة تبدّل aria-pressed بعد delay، وتُسجَّل حاله لحظة كل ضغطة. */
function ytCc(p, { delay = 0 } = {}) {
  const presses = [];
  p.cc.addEventListener('click', () => {
    const was = p.cc.getAttribute('aria-pressed');
    presses.push(was);
    const flip = () => p.cc.setAttribute('aria-pressed', was === 'true' ? 'false' : 'true');
    if (delay) p.env.win.setTimeout(flip, delay);
    else flip();
  });
  return presses;
}
/** يقدّم الساعة ms على خطوات، وتُنفَّذ بينها الوعود (الضغط وانتظار الحال غير متزامنين). */
async function flow(p, ms, step = 50) {
  for (let left = ms; left > 0; left -= step) {
    await settle();
    p.tick(Math.min(step, left));
  }
  await settle();
}

test('٧-ب: CC مطفأة وللفيديو مسارات: زر «تفعيل CC الآن» بدل رسالة «فعّل CC»، والإرشاد اليدوي خلف «لماذا؟»', () => {
  const p = page({ available: AVAILABLE });
  click(p.ui.btn('download'));
  assert.ok(p.ui.item(ON_NOW), 'الزر');
  assert.ok(!menuText(p).includes(ccLanguagesLine(2)) && !menuText(p).includes(messageFor('CT_NOT_CAPTURED')), 'لا رسالة «فعّل CC» بجانبه');
  assert.equal(p.ui.menu().querySelectorAll('.alert').length, 0, 'لا كتلة إرشاد');
  click(p.ui.item('لماذا؟'));
  assert.equal(menuText(p).split(ccLanguagesLine(2)).length - 1, 1, 'الإرشاد اليدوي خلف «لماذا؟» مرة واحدة');
  p.handle.unmount();
});

test('٧-ب: «تفعيل CC الآن» ضغطة واحدة من «مطفأة»، والزر ينتظر، ثم وصل الالتقاط فالقائمة تتحدّث وحدها بالمسار', async () => {
  const p = page({ available: AVAILABLE });
  const presses = ytCc(p);
  click(p.ui.btn('download'));
  click(p.ui.item(ON_NOW));
  await settle();
  assert.deepEqual(presses, [null], 'ضغطة واحدة على زر CC وهو غير مضغوط');
  assert.equal(p.cc.getAttribute('aria-pressed'), 'true');
  const busy = p.ui.item(WAITING);
  assert.ok(busy, 'الزر ينتظر');
  assert.equal(busy.getAttribute('aria-busy'), 'true');
  assert.equal(busy.getAttribute('aria-disabled'), 'true');
  click(busy);
  await flow(p, 1000);
  assert.equal(presses.length, 1, 'لا ضغطة ثانية أثناء الانتظار');
  assert.ok(p.ui.item(WAITING), 'ما زال ينتظر بعد مهلة ccStuck');
  p.controller.set({ captured: [trackInfo()] });
  assert.equal(p.ui.menuOpen(), true);
  assert.ok(menuText(p).includes('الإنجليزية · يدوية · 412\u00A0مقطعًا'), 'المسار الملتقط في القائمة المفتوحة');
  assert.ok(p.ui.item('تنزيل الملف'));
  await flow(p, 10000, 500);
  assert.ok(!menuText(p).includes(NO_EFFECT), 'لا سطر «لم يصل شيء» بعد الالتقاط');
  p.handle.unmount();
});

test('٧-ب: ccStuck: «إعادة تشغيل CC» ضغطتان بينهما انتظار انطفاء CC (لا ضغطتان عمياوان)', async () => {
  const p = page();
  const presses = ytCc(p, { delay: 300 });
  p.cc.setAttribute('aria-pressed', 'true');
  click(p.ui.btn('download'));
  p.tick(CC_GRACE_MS + 1100);
  click(p.ui.item(RESTART));
  await flow(p, 1500);
  assert.deepEqual(presses, ['true', 'false'], 'الإطفاء، ثم التشغيل بعد أن صارت مطفأة');
  assert.equal(p.cc.getAttribute('aria-pressed'), 'true', 'تنتهي مشغّلة');
  p.controller.set({ captured: [trackInfo()] });
  assert.ok(menuText(p).includes('الإنجليزية · يدوية · 412\u00A0مقطعًا'));
  p.handle.unmount();
});

test('٧-ب: لم يصل الالتقاط في المهلة: سطر «لم يصل شيء — أعد تحميل الصفحة»، ويعود الزر «إعادة تشغيل CC»', async () => {
  const p = page({ available: AVAILABLE });
  ytCc(p);
  click(p.ui.btn('download'));
  click(p.ui.item(ON_NOW));
  await flow(p, 1000);
  assert.ok(!menuText(p).includes(NO_EFFECT), 'قبل المهلة');
  await flow(p, 10000, 500);
  const line = p.ui.field('ccLine');
  assert.ok(line, 'سطر النتيجة');
  assert.equal(line.textContent, NO_EFFECT);
  assert.equal(line.getAttribute('role'), 'status');
  assert.ok(p.ui.item(RESTART), 'CC مشغّلة بلا التقاط: «إعادة تشغيل CC»');
  assert.ok(p.ui.item(WAITING) === null);
  p.handle.unmount();
});

test('٧-ب: أثناء الإعلان الزر معطّل بسببه ولا يُضغط؛ والبث الجاري رسالته وحدها؛ ويوتيوب يعطّل CC: «لا ترجمة» بلا زر', () => {
  const ad = page({ available: AVAILABLE });
  const presses = ytCc(ad);
  ad.player.classList.add('ad-showing');
  ad.tick(1100);
  click(ad.ui.btn('download'));
  const btn = ad.ui.item(ON_NOW);
  assert.ok(btn);
  assert.equal(btn.getAttribute('aria-disabled'), 'true');
  assert.equal(btn.getAttribute('aria-description'), 'يتاح بعد انتهاء الإعلان.');
  click(btn);
  assert.deepEqual(presses, [], 'لا ضغط أثناء الإعلان');
  ad.player.classList.remove('ad-showing');
  ad.tick(1100);
  assert.equal(ad.ui.item(ON_NOW).getAttribute('aria-disabled'), null, 'ويُتاح بعده');
  ad.handle.unmount();

  const live = page({ available: AVAILABLE });
  const badge = live.env.doc.createElement('button');
  badge.className = 'ytp-live-badge ytp-button';
  badge.style.setProperty('display', 'inline-block');
  live.player.appendChild(badge);
  live.env.win.getComputedStyle = (el) => ({ display: el.style.getPropertyValue('display') || 'inline' });
  live.tick(1100);
  click(live.ui.btn('download'));
  assert.ok(menuText(live).includes(messageFor('EX_LIVE')));
  assert.ok(live.ui.item(ON_NOW) === null && live.ui.item(RESTART) === null, 'لا زر في البث الجاري');
  live.handle.unmount();

  const off = page({ available: AVAILABLE });
  off.cc.setAttribute('aria-disabled', 'true');
  off.tick(1100);
  click(off.ui.btn('download'));
  assert.ok(menuText(off).includes(messageFor('CT_NO_CAPTIONS')));
  assert.ok(off.ui.item(ON_NOW) === null, 'لا زر وCC معطّل');
  off.handle.unmount();
});

test('٧-ب: بلا زر CC في المشغّل، أو بلا مسارات معروفة للفيديو، تبقى الرسالة النصية بلا زر', () => {
  const gone = page({ available: AVAILABLE });
  gone.cc.remove();
  gone.tick(1100);
  click(gone.ui.btn('download'));
  assert.ok(gone.ui.item(ON_NOW) === null, 'تبدّل محدد الزر: يغيب الزر');
  assert.ok(menuText(gone).includes(ccLanguagesLine(2)), 'وتبقى الرسالة');
  gone.handle.unmount();
  const unknown = page();
  click(unknown.ui.btn('download'));
  assert.ok(unknown.ui.item(ON_NOW) === null);
  assert.ok(menuText(unknown).includes(messageFor('CT_NOT_CAPTURED')));
  unknown.handle.unmount();
});
