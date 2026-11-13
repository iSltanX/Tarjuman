// ت-١ (تحقق Fable للتصميم، البند 24 في الجولة الثانية، بقرار سلطان 2026-11-13 في القرار ١٧): عند مشغّل بعرض 640 فأقل كانت
// المجموعة بأضيق مقاساتها (34) تقصّ زمن يوتيوب إلى «1:08 / 2»، ولا يُبلَّغ CT_BAR_OVERFLOW لأن الكشف كان يبحث عن تداخل حاوية
// الأدوات اليسرى مع المجموعة، والزمن ينضغط داخل حاويته فلا يتداخل. صار: حين لا يتسع الأضيق للأزرار كلها يُطوى − و+ داخل قائمة
// الشارة (المقاس «المطوي»، والعتبة حدّ الأضيق نفسه في fitSize)، والكشف يرصد قصّ الزمن نفسه (نصه أعرض من صندوقه، أو صندوقه تحت
// المجموعة أو خارج حاويته)، ويُبلَّغ ما بقي بعد الطي في قياسين متتاليين لا في قياس عابر. عقد الـDOM الوهمي بـassert.ok وحدها.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as bar$ from '../../../../src/player/controls/bar.js';
import { groupCss } from '../../../../src/player/controls/styles.js';
import { LABELS, minusTip, plusTip } from '../../../../src/player/controls/text.js';
import { arabic, click, makeState, mountPage } from './harness.js';

const { BADGE_PX, BUTTON_PX, ROOM_GAP_PX, fitSize, roomFor } = bar$;
// استيراد الوحدة كلها لا اسمها: قبل الإصلاح لا دالة timeClipped، فيفشل كل اختبار بسببه لا الملف كله.
const timeClipped = (...a) => bar$.timeClipped(...a);
const withArabic = (over = {}) => makeState({ arabic: arabic(), ...over });
const tightNeed = (icons) => icons * BUTTON_PX.tight + BADGE_PX.tight + ROOM_GAP_PX;

/**
 * شريط بعرض 736 (من 12 إلى 748) وزمن يوتيوب من 120 إلى 242، وأدوات يوتيوب اليمنى بعرض others، ومضيف المجموعة بعرض group.
 * بلا منزلق صوت يُحجز عرضه كله (52): المساحة = 748 − 242 − 52 − others.
 */
function narrow({ state = withArabic(), others, group, time = { left: 120, right: 242 }, natural = null } = {}) {
  const page = mountPage({ state, width: 760 });
  const mk = (cls, left, right) => {
    const el = page.env.doc.createElement('div');
    el.className = cls;
    el.rect = { top: 0, bottom: 40, left, right, width: right - left, height: 40 };
    page.left.appendChild(el);
    return el;
  };
  mk('ytp-play-button', 12, 68);
  const t = mk('ytp-time-display', time.left, time.right);
  if (natural !== null) {
    t.scrollWidth = natural;
    t.clientWidth = time.right - time.left;
  }
  page.left.rect = { top: 0, bottom: 40, left: 12, right: 748 - others - group, width: 736 - others - group, height: 40 };
  page.chrome.rect = { ...page.chrome.rect, left: 12, right: 748, width: 736 };
  page.right.rect = { top: 0, bottom: 40, left: 748 - others - group, right: 748, width: others + group, height: 40 };
  page.ui.groupHost().rect = { top: 0, bottom: 40, left: 748 - others - group, right: 748 - others, width: group, height: 40 };
  page.env.win.resize(page.player);
  return { page, time: t };
}
const shownKinds = (page) => page.ui.kinds().filter((k) => !page.ui.btn(k).hasAttribute('hidden'));
const lastCode = (page) => page.handle.diagnostics().session.lastCode;

test('ت-١: fitSize يطوي − و+ حين لا يتسع الأضيق للأزرار كلها، والعتبة حدّ الأضيق نفسه (لا رقم جديد)', () => {
  const bar = (room, size = 'normal') => ({ size, room });
  for (const icons of [5, 4]) {
    assert.equal(fitSize(bar(tightNeed(icons)), icons), 'tight', `${icons}: الأضيق يتسع للأزرار كلها`);
    assert.equal(fitSize(bar(tightNeed(icons) - 1), icons), 'folded', `${icons}: لا يتسع ⇒ مطوي`);
    assert.equal(fitSize(bar(tightNeed(icons) - 1, 'compact'), icons), 'folded', `${icons}: ووضع يوتيوب الصغير مثله`);
  }
  assert.equal(fitSize(bar(0), 5), 'folded');
  assert.equal(fitSize(bar(null), 5), 'normal', 'بلا قياس: المقاس الأساسي، لا طي');
  assert.equal(fitSize(bar(0, 'fullscreen'), 5), 'fullscreen', 'ملء الشاشة لا يُطوى');
  const css = groupCss();
  assert.match(css, /\.group\[data-size="folded"\], \.group\[data-size="folded-panel"\], \.group\[data-size="tight"\] \{ --w: 34px; --icon: 18px/, 'المطويان بمقاس الأضيق نفسه');
});

test('ت-١: في المقاس المطوي لا يُرسم − و+ في الشريط، والشارة تقول إنهما في قائمتها', () => {
  // 748 − 242 − 52 − 256 = 198 ← 196: دون الأضيق للأزرار الستة (5×34+42+8 = 220).
  const { page } = narrow({ others: 256, group: 204 });
  assert.equal(page.ui.size(), 'folded');
  assert.deepEqual(shownKinds(page), ['download', 'upload', 'panel', 'badge']);
  assert.ok(page.ui.btn('minus').hasAttribute('hidden') && page.ui.btn('plus').hasAttribute('hidden'));
  const badge = page.ui.btn('badge');
  assert.equal(badge.getAttribute('aria-description'), LABELS.badgeFolded);
  badge.focus();
  assert.ok(page.ui.tip().endsWith(` · ${LABELS.badgeFolded}`), 'والتلميح كذلك');
});

test('ت-١: − و+ في قائمة الشارة بالمؤشر ولوحة المفاتيح، كترتيبهما في الشريط، ويبقى التركيز على الزر بعد الضغط', () => {
  const { page } = narrow({ others: 256, group: 204 });
  click(page.ui.btn('badge'), 0);
  const minus = page.ui.field('nudge:minus');
  const plus = page.ui.field('nudge:plus');
  assert.ok(minus && plus, 'زرّا − و+ في القائمة');
  assert.equal(minus.getAttribute('aria-label'), minusTip(500));
  assert.equal(plus.getAttribute('aria-label'), plusTip(500));
  assert.equal(minus.getAttribute('type'), 'button');
  const row = page.ui.menu().querySelector('.nudge');
  const order = row.children.map((c) => c.getAttribute('data-fid'));
  assert.deepEqual(order, ['nudge:plus', 'big', 'nudge:minus'], 'RTL: + أول الصف من اليمين، فيُرى − يسارًا و+ يمينًا كخط الأعداد');
  click(page.ui.field('nudge:plus'));
  click(page.ui.field('nudge:plus'));
  click(page.ui.field('nudge:minus'), 0);
  const calls = page.controller.calls.filter((c) => c[0] === 'nudgeOffset').map((c) => c[1]);
  assert.deepEqual(calls, [1, 1, -1]);
  assert.equal(page.controller.getState().view.displayOffsetMs, 500);
  assert.match(page.ui.field('big').textContent, /\+0\.5/, 'القيمة الكبيرة تتبع');
  page.ui.field('nudge:plus').focus();
  click(page.ui.field('nudge:plus'), 0);
  assert.ok(page.ui.layerHost().shadowRoot.activeElement === page.ui.field('nudge:plus'), 'التركيز باقٍ على + بعد إعادة البناء');
  assert.equal(page.ui.tip(), null, 'لا تلميح عابر فوق القائمة: القيمة الكبيرة تقول الإزاحة');
  assert.equal(page.ui.menuOpen(), true, 'والقائمة باقية مفتوحة');
});

test('ت-١: المقاسات الأوسع كما كانت: الأضيق المتسع والمضغوط والعادي بالأزرار الستة، ولا − و+ في قائمة الشارة', () => {
  // 748 − 242 − 52 − 232 = 222 ← 220: الأضيق بالأزرار كلها.
  for (const [others, size] of [[232, 'tight'], [190, 'compact'], [100, 'normal']]) {
    const { page } = narrow({ others, group: 204 });
    assert.equal(page.ui.size(), size, String(others));
    assert.deepEqual(shownKinds(page), ['download', 'upload', 'panel', 'minus', 'badge', 'plus']);
    assert.equal(page.ui.btn('badge').getAttribute('aria-description'), null);
    click(page.ui.btn('plus'));
    assert.deepEqual(page.controller.calls.filter((c) => c[0] === 'nudgeOffset').map((c) => c[1]), [1], `${size}: + في الشريط يعمل`);
    click(page.ui.btn('badge'));
    assert.ok(page.ui.field('nudge:minus') === null && page.ui.menu().querySelector('.nudge') === null, `${size}: لا − ولا + في القائمة`);
  }
});

test('ت-١: اتساع الشريط والقائمة مفتوحة والتركيز على − فيها: يعود − و+ إلى الشريط ولا يسقط التركيز من القائمة', () => {
  const { page } = narrow({ others: 256, group: 204 });
  click(page.ui.btn('badge'), 0);
  page.ui.field('nudge:minus').focus();
  page.right.rect = { ...page.right.rect, left: 748 - 100 - 204, width: 304 };
  page.env.win.resize(page.player);
  assert.equal(page.ui.size(), 'normal');
  assert.ok(page.ui.field('nudge:minus') === null);
  const focused = page.ui.layerHost().shadowRoot.activeElement;
  assert.ok(focused && focused.getAttribute('data-first') !== null, 'إلى أول عنصر في القائمة');
});

test('ت-١: الطي والتركيز على − في الشريط: ينتقل التركيز إلى الشارة لا إلى الصفحة', () => {
  const page = mountPage({ state: withArabic(), width: 760 });
  page.ui.btn('minus').focus();
  const mk = (cls, left, right) => {
    const el = page.env.doc.createElement('div');
    el.className = cls;
    el.rect = { top: 0, bottom: 40, left, right, width: right - left, height: 40 };
    page.left.appendChild(el);
  };
  mk('ytp-time-display', 120, 242);
  page.chrome.rect = { ...page.chrome.rect, left: 12, right: 748, width: 736 };
  page.right.rect = { top: 0, bottom: 40, left: 288, right: 748, width: 460, height: 40 };
  page.ui.groupHost().rect = { top: 0, bottom: 40, left: 288, right: 492, width: 204, height: 40 };
  page.env.win.resize(page.player);
  assert.equal(page.ui.size(), 'folded');
  assert.ok(page.env.doc._focused === page.ui.btn('badge'));
});

test('ت-١: roomFor يقيس زمن يوتيوب بعرضه الطبيعي لا بمستطيله المنضغط', () => {
  // الزمن منضغط إلى 120..180 ونصه 122: الحافة 242 لا 180.
  const { page } = narrow({ others: 256, group: 204, time: { left: 120, right: 180 }, natural: 122 });
  assert.equal(roomFor(page.env.doc, page.ui.groupHost()), 196);
});

test('ت-١: كشف القص يرصد تداخل زمن يوتيوب مع المجموعة وقصّ نصه، ولا يرصد الحالة السليمة', () => {
  const ok = narrow({ others: 256, group: 136 });
  assert.equal(timeClipped(ok.page.env.doc, ok.page.ui.groupHost()), false, 'الزمن قبل المجموعة ونصه كله ظاهر');
  // الزمن يمتد تحت المجموعة (من 356).
  const under = narrow({ others: 256, group: 136, time: { left: 120, right: 380 } });
  assert.equal(timeClipped(under.page.env.doc, under.page.ui.groupHost()), true, 'تداخل مع المجموعة');
  // الزمن ينضغط داخل حاويته: نصه 122 وصندوقه 60.
  const squeezed = narrow({ others: 256, group: 136, time: { left: 120, right: 180 }, natural: 122 });
  assert.equal(timeClipped(squeezed.page.env.doc, squeezed.page.ui.groupHost()), true, 'نصه أعرض من صندوقه');
  // كله مقصوص: صندوق بعرض صفر ونصه 122 (مشغّل 420 في لقطات Fable).
  const gone = narrow({ others: 256, group: 136, time: { left: 120, right: 120 }, natural: 122 });
  assert.equal(timeClipped(gone.page.env.doc, gone.page.ui.groupHost()), true, 'لا زمن إطلاقًا');
  // يوتيوب أخفى الزمن بنفسه (بلا عرض ولا نص): ليس قصًّا من ترجمان.
  const hidden = narrow({ others: 256, group: 136, time: { left: 0, right: 0 }, natural: 0 });
  assert.equal(timeClipped(hidden.page.env.doc, hidden.page.ui.groupHost()), false);
});

test('ت-١: CT_BAR_OVERFLOW حين يبقى زمن يوتيوب مقصوصًا بعد الطي في قياسين متتاليين، ولا يُبلَّغ في الحالة السليمة ولا العابرة', () => {
  // قص باقٍ بعد الطي (وطي زر اللوحة معهما، القرار ٢٨: المساحة 60): الزمن تحت المجموعة في القياس بعد الرسم وفي الفحص الدوري بعده.
  const bad = narrow({ others: 256, group: 136, time: { left: 120, right: 380 } });
  assert.equal(bad.page.handle.diagnostics().session.overflows, 0, 'قياس واحد لا يكفي');
  bad.page.env.win.advance(1100);
  const d = bad.page.handle.diagnostics().session;
  assert.equal(d.lastCode, 'CT_BAR_OVERFLOW');
  assert.equal(d.overflows, 1);
  assert.equal(d.overflow.clipped, true);
  assert.equal(d.overflow.fit, 'folded-panel');
  assert.match(d.lastDetail, /fit=folded-panel/);
  bad.page.env.win.advance(3300);
  assert.equal(bad.page.handle.diagnostics().session.overflows, 1, 'مرة واحدة ما دام القص نفسه');
  // نصه يُقص داخل حاويته: يُرصد كذلك.
  const squeezed = narrow({ others: 256, group: 136, time: { left: 120, right: 180 }, natural: 122 });
  squeezed.page.env.win.advance(1100);
  assert.equal(lastCode(squeezed.page), 'CT_BAR_OVERFLOW');
  // قص عابر أثناء تغيّر العرض ثم زال قبل الفحص الدوري: لا تبليغ.
  const flick = narrow({ others: 256, group: 136, time: { left: 120, right: 380 } });
  flick.time.rect = { ...flick.time.rect, right: 242, width: 122 };
  flick.page.env.win.advance(1100);
  assert.equal(flick.page.handle.diagnostics().session.overflows, 0);
  assert.notEqual(lastCode(flick.page), 'CT_BAR_OVERFLOW');
  // بعد الطي يتسع الزمن (المجموعة 136 تبدأ عند 356 والزمن ينتهي عند 242): لا قص ولا رمز.
  const ok = narrow({ others: 256, group: 136 });
  ok.page.env.win.advance(1100);
  assert.equal(ok.page.ui.size(), 'folded');
  assert.equal(ok.page.handle.diagnostics().session.overflow, null);
  assert.notEqual(lastCode(ok.page), 'CT_BAR_OVERFLOW');
  assert.equal(ok.page.handle.diagnostics().session.overflows, 0);
});
