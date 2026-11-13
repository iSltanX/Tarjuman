// ن-١ (التحقق المستقل للجولة الثانية، وقرار سلطان 2026-11-13 بنقض ح-2): كانت حسبة الطي تحجز منزلق الصوت المتسع وسهم الفصل، فطُوي
// − و+ في Chrome من مشغّل بعرض 800 وزر اللوحة من 732، وزمن يوتيوب لم يُقص في 2.2.0 في السكون إلا من 680 فأقل. وطُوي زر اللوحة في
// قائمة شارة معطّلة (بلا ترجمة) فلا طريق إلى اللوحة من الشريط، ووصف الشارة يقول إنها فيها. صار: الطي بالمساحة في السكون بلا حجز،
// والمقاسات 48 و40 و34 بالمحجوزة كما في 2.2.0، ولا يُطوى زر اللوحة ما دامت الشارة معطّلة. عقد الـDOM الوهمي بـassert.ok وحدها.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PREFS } from '../../../../src/core/model/prefs.js';
import * as bar$ from '../../../../src/player/controls/bar.js';
import { LABELS } from '../../../../src/player/controls/text.js';
import { arabic, click, makeState, mountPage, settle } from './harness.js';

const { BADGE_PX, BUTTON_PX, ROOM_GAP_PX, fitSize, roomFor } = bar$;
// استيراد الوحدة كلها لا اسمها: قبل الإصلاح لا دالة restRoomFor، فيفشل اختبارها وحده لا الملف كله.
const restRoomFor = (...a) => bar$.restRoomFor(...a);
const need = (icons, size = 'tight') => icons * BUTTON_PX[size] + BADGE_PX[size] + ROOM_GAP_PX;
const prefsWith = (ui) => ({ ...DEFAULT_PREFS, ui: { ...DEFAULT_PREFS.ui, ...ui } });
const shownKinds = (page) => page.ui.kinds().filter((k) => !page.ui.btn(k).hasAttribute('hidden'));

/**
 * شريط Chrome كما قيس (فيديو بفصول): من 12 إلى 748، والزمن من 120 إلى 242، وبعده حاوية الفصل بعنوانها، ومنزلق الصوت مطوي.
 * المحجوزة = 748 − 242 − 44 − 52 − others، وفي السكون = 748 − 242 − others؛ فبينهما 96 كما بين room والقص المقيس حيًا.
 */
function chromeBar({ state = makeState({ arabic: arabic() }), rest, group = 204 } = {}) {
  const others = 748 - 242 - rest;
  const page = mountPage({ state, width: 760 });
  const mk = (cls, left, right, text = '') => {
    const el = page.env.doc.createElement('div');
    el.className = cls;
    if (text) el.textContent = text;
    el.rect = { top: 0, bottom: 40, left, right, width: right - left, height: 40 };
    page.left.appendChild(el);
    return el;
  };
  mk('ytp-play-button', 12, 68);
  const volume = mk('ytp-volume-panel', 110, 110);
  const time = mk('ytp-time-display', 120, 242);
  const chapter = mk('ytp-chapter-container', 242, 242, 'Introduction');
  page.left.rect = { top: 0, bottom: 40, left: 12, right: 748 - others - group, width: 736 - others - group, height: 40 };
  page.chrome.rect = { ...page.chrome.rect, left: 12, right: 748, width: 736 };
  page.right.rect = { top: 0, bottom: 40, left: 748 - others - group, right: 748, width: others + group, height: 40 };
  page.ui.groupHost().rect = { top: 0, bottom: 40, left: 748 - others - group, right: 748 - others, width: group, height: 40 };
  page.env.win.resize(page.player);
  return { page, volume, time, chapter };
}

test('ن-١: fitSize يحكم الطي بالمساحة في السكون، والمقاسات 48 و40 و34 بالمحجوزة كما في 2.2.0', () => {
  const bar = (room, restRoom, size = 'normal') => ({ size, room, restRoom });
  const o = { panel: true };
  assert.equal(fitSize(bar(need(5) - 96, need(5)), 5, o), 'tight', 'المحجوزة لا تتسع والسكون يتسع: الأضيق بالأزرار الستة كما في 2.2.0');
  assert.equal(fitSize(bar(need(5) - 96, need(5) - 1), 5, o), 'folded', 'لا يتسع الأضيق في السكون: يُطوى − و+');
  assert.equal(fitSize(bar(need(3) - 96, need(3)), 5, o), 'folded', 'المطوي يتسع في السكون: زر اللوحة في الشريط');
  assert.equal(fitSize(bar(need(3) - 96, need(3) - 1), 5, o), 'folded-panel', 'ولا يتسع: يُطوى زر اللوحة');
  assert.equal(fitSize(bar(need(3) - 96, need(3) - 1), 5), 'folded', 'زر لوحة لا يجوز طيّه يبقى ولو بقي قص');
  assert.equal(fitSize(bar(need(5, 'compact') - 1, 2000), 5, o), 'tight', 'المضغوط بالمحجوزة: السكون لا يكبّر المقاس');
  assert.equal(fitSize(bar(need(5, 'normal'), 2000), 5, o), 'normal');
  assert.equal(fitSize(bar(need(5, 'compact'), 2000, 'compact'), 5, o), 'compact', 'ووضع يوتيوب الصغير كما كان');
  assert.equal(fitSize({ size: 'normal', room: need(5) }, 5, o), 'tight', 'بلا restRoom: المحجوزة');
});

test('ن-١: المساحة في السكون بلا حجز سهم الفصل ولا المنزلق، ولا تتغير بمرور المؤشر على زر الصوت', () => {
  const { page, volume, time, chapter } = chromeBar({ rest: 232 });
  const doc = page.env.doc;
  const own = page.ui.groupHost();
  assert.equal(restRoomFor(doc, own), 232);
  assert.equal(roomFor(doc, own), 136, 'والمحجوزة كما كانت: 232 − 44 − 52');
  // المؤشر على زر الصوت: يتسع المنزلق 52 فيُدفع الزمن 52، ويخفي يوتيوب عنوان الفصل.
  volume.rect = { ...volume.rect, right: 162, width: 52 };
  time.rect = { ...time.rect, left: 172, right: 294 };
  chapter.rect = { ...chapter.rect, left: 294, right: 294 };
  assert.equal(restRoomFor(doc, own), 232);
  assert.equal(roomFor(doc, own), 136);
  chapter.textContent = '';
  assert.equal(restRoomFor(doc, own), 232, 'بلا فصول: السكون نفسه');
  assert.equal(roomFor(doc, own), 180, 'والمحجوزة بلا سهم الفصل');
  assert.equal(restRoomFor(doc, null), null);
});

test('ن-١: بقياس Chrome (مشغّل 720 و656 و600) يبقى الأضيق حيث لم يُقص الزمن في 2.2.0، ولا يُطوى شيء إلا حيث بدأ القص', () => {
  // مشغّل 720: room 136 حيًا، وفي السكون 232 ≥ 220: الأزرار الستة بالأضيق، كما في 2.2.0 (قص 0).
  const p720 = chromeBar({ rest: 232 }).page;
  assert.equal(p720.ui.size(), 'tight');
  assert.deepEqual(shownKinds(p720), ['download', 'upload', 'panel', 'minus', 'badge', 'plus']);
  // مشغّل 656: في السكون 168 (قص 32 في 2.2.0 بالأضيق): يُطوى − و+ وحدهما.
  const p656 = chromeBar({ rest: 168, group: 136 }).page;
  assert.equal(p656.ui.size(), 'folded');
  assert.deepEqual(shownKinds(p656), ['download', 'upload', 'panel', 'badge']);
  assert.equal(p656.ui.btn('badge').getAttribute('aria-description'), LABELS.badgeFolded);
  // مشغّل 600: في السكون 112 (لا يتسع المطوي 152): يُطوى زر اللوحة معهما.
  const p600 = chromeBar({ rest: 112, group: 102 }).page;
  assert.equal(p600.ui.size(), 'folded-panel');
  assert.deepEqual(shownKinds(p600), ['download', 'upload', 'badge']);
});

test('ن-١: لا يُطوى زر اللوحة والشارة معطّلة (بلا ترجمة): يبقى في الشريط ويفتح اللوحة، والشارة لا تقول إنه فيها، والقص الباقي يُبلَّغ', async () => {
  // في السكون 112: لا يتسع المطوي (152)، فالمجموعة (136، من 218) تمتد فوق الزمن (إلى 242).
  const { page } = chromeBar({ state: makeState({ prefs: prefsWith({ panelOpen: false }) }), rest: 112, group: 136 });
  assert.equal(page.ui.size(), 'folded', 'مطوي بلا زر اللوحة');
  assert.deepEqual(shownKinds(page), ['download', 'upload', 'panel', 'badge']);
  const badge = page.ui.btn('badge');
  assert.equal(badge.getAttribute('aria-disabled'), 'true', 'الشارة معطّلة بلا ترجمة');
  assert.equal(badge.getAttribute('aria-description'), LABELS.badgeFolded, 'لا «وفتح النص المتزامن»');
  click(page.ui.btn('panel'));
  await settle();
  const ui = page.controller.calls.filter((c) => c[0] === 'updatePrefs').map((c) => c[1].ui);
  assert.deepEqual(ui, [{ panelOpen: true }], 'زر اللوحة في الشريط يفتحها');
  // القص الباقي يُبلَّغ كما كان، ويبقى زر اللوحة.
  page.env.win.advance(1100);
  const d = page.handle.diagnostics().session;
  assert.equal(d.lastCode, 'CT_BAR_OVERFLOW');
  assert.equal(d.overflow.fit, 'folded');
  assert.ok(shownKinds(page).includes('panel'), 'ويبقى زر اللوحة ولو بقي قص');
  // رُفعت ترجمة: صارت الشارة تُفتح، فيُطوى زر اللوحة فيها بالحسبة نفسها.
  const { arabic: a, bundle, slots, activeSlot, marks } = makeState({ arabic: arabic() });
  page.controller.set({ arabic: a, bundle, slots, activeSlot, marks });
  assert.equal(page.ui.size(), 'folded-panel');
  assert.deepEqual(shownKinds(page), ['download', 'upload', 'badge']);
  assert.equal(page.ui.btn('badge').getAttribute('aria-description'), LABELS.badgeFoldedPanel);
});

test('ن-١: وأثناء تحميل الترجمة (الشارة معطّلة) لا يُطوى زر اللوحة', () => {
  const page = chromeBar({ state: makeState({ arabic: arabic(), loading: true }), rest: 112, group: 136 }).page;
  assert.equal(page.ui.btn('badge').getAttribute('aria-disabled'), 'true');
  assert.equal(page.ui.size(), 'folded');
  assert.ok(shownKinds(page).includes('panel'));
});
