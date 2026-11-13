// القرار ٢٨ (سلطان، 2026-11-13، بعد قياس حي): بعد طي − و+ (ت-١) بقي زمن يوتيوب مقصوصًا في Chrome عند مشغّل بعرض 420 (23 بكسل)،
// ومثله عند 600 و560 و440 و400. فإن لم يتسع المطوي نفسه لما بقي من الأزرار طُوي زر اللوحة في قائمة الشارة كما طُوي − و+، ولا
// يُخفى: المقاس «المطوي باللوحة» بالحسبة نفسها (حدّ المطوي، لا رقم جديد). عقد الـDOM الوهمي بـassert.ok وحدها.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messageFor } from '../../../../src/core/errors/index.js';
import { DEFAULT_PREFS } from '../../../../src/core/model/prefs.js';
import { BADGE_PX, BUTTON_PX, ROOM_GAP_PX, fitSize, isFolded } from '../../../../src/player/controls/bar.js';
import { LABELS } from '../../../../src/player/controls/text.js';
import { createPanelLink } from '../../../../src/player/link.js';
import { arabic, click, makeState, mountPage, settle } from './harness.js';

const need = (icons) => icons * BUTTON_PX.tight + BADGE_PX.tight + ROOM_GAP_PX;
const prefsWith = (ui) => ({ ...DEFAULT_PREFS, ui: { ...DEFAULT_PREFS.ui, ...ui } });

/** شريط من 12 إلى 748 وزمن يوتيوب ينتهي عند timeRight: المساحة = 748 − timeRight − 52 − others. */
function narrow({ state = makeState({ arabic: arabic() }), others = 256, group = 136, timeRight = 242, link } = {}) {
  const page = mountPage({ state, width: 760, link });
  const mk = (cls, left, right) => {
    const el = page.env.doc.createElement('div');
    el.className = cls;
    el.rect = { top: 0, bottom: 40, left, right, width: right - left, height: 40 };
    page.left.appendChild(el);
  };
  mk('ytp-play-button', 12, 68);
  mk('ytp-time-display', 120, timeRight);
  page.left.rect = { top: 0, bottom: 40, left: 12, right: 748 - others - group, width: 736 - others - group, height: 40 };
  page.chrome.rect = { ...page.chrome.rect, left: 12, right: 748, width: 736 };
  page.right.rect = { top: 0, bottom: 40, left: 748 - others - group, right: 748, width: others + group, height: 40 };
  page.ui.groupHost().rect = { top: 0, bottom: 40, left: 748 - others - group, right: 748 - others, width: group, height: 40 };
  page.env.win.resize(page.player);
  return page;
}
const shownKinds = (page) => page.ui.kinds().filter((k) => !page.ui.btn(k).hasAttribute('hidden'));

test('القرار ٢٨: fitSize يطوي زر اللوحة حين لا يتسع المطوي لما بقي، والعتبة حدّ المطوي نفسه', () => {
  const bar = (room, size = 'normal') => ({ size, room });
  assert.equal(fitSize(bar(need(3)), 5, { panel: true }), 'folded', 'المطوي يتسع للتنزيل والترجمة واللوحة');
  assert.equal(fitSize(bar(need(3) - 1), 5, { panel: true }), 'folded-panel');
  assert.equal(fitSize(bar(need(3) - 1, 'compact'), 5, { panel: true }), 'folded-panel', 'ووضع يوتيوب الصغير مثله');
  assert.equal(fitSize(bar(0), 4), 'folded', 'زر اللوحة مخفي بالإعدادات: لا طي له');
  assert.equal(fitSize(bar(need(5)), 5, { panel: true }), 'tight', 'الأوسع كما كان');
  assert.equal(fitSize(bar(null), 5, { panel: true }), 'normal');
  assert.equal(fitSize(bar(0, 'fullscreen'), 5, { panel: true }), 'fullscreen');
  assert.ok(isFolded('folded') && isFolded('folded-panel') && !isFolded('tight') && !isFolded(null));
});

test('القرار ٢٨: في «المطوي باللوحة» زر اللوحة مطوي لا مخفي: الشارة تقول إنه في قائمتها، وفيها زر يفتح اللوحة ويغلقها', async () => {
  // 748 − 300 − 52 − 256 = 140 ← 140: دون حد المطوي (3×34+42+8 = 152).
  const page = narrow({ state: makeState({ arabic: arabic(), prefs: prefsWith({ panelOpen: false }) }), timeRight: 300 });
  assert.equal(page.ui.size(), 'folded-panel');
  assert.deepEqual(shownKinds(page), ['download', 'upload', 'badge']);
  const badge = page.ui.btn('badge');
  assert.equal(badge.getAttribute('aria-description'), LABELS.badgeFoldedPanel);
  click(badge, 0);
  const toggle = page.ui.field('panelToggle');
  assert.ok(toggle, 'زر اللوحة في قائمة الشارة');
  assert.equal(toggle.getAttribute('type'), 'button');
  assert.equal(toggle.getAttribute('aria-pressed'), 'false');
  assert.equal(toggle.textContent, LABELS.panelOpen);
  assert.ok(page.ui.field('nudge:minus') && page.ui.field('nudge:plus'), 'و− و+ معه');
  click(toggle);
  await settle();
  const ui = page.controller.calls.filter((c) => c[0] === 'updatePrefs').map((c) => c[1].ui);
  assert.deepEqual(ui, [{ panelOpen: true }], 'يكتب التفضيل نفسه الذي يكتبه زر الشريط');
  assert.equal(page.ui.menuOpen(), false, 'وتُغلق القائمة كما يُغلقها زر الشريط');
  // المتحكم الوهمي لا يطبّق التفضيل: يُطبَّق هنا كما يفعل الحقيقي.
  page.controller.set({ prefs: prefsWith({ panelOpen: true }) });
  click(page.ui.btn('badge'), 0);
  assert.equal(page.ui.field('panelToggle').getAttribute('aria-pressed'), 'true');
  assert.equal(page.ui.field('panelToggle').textContent, LABELS.panelClose);
});

test('القرار ٢٨: المطوي العادي لا يطوي زر اللوحة، والمخفي بالإعدادات لا يظهر في القائمة', () => {
  const folded = narrow();
  assert.equal(folded.ui.size(), 'folded');
  assert.deepEqual(shownKinds(folded), ['download', 'upload', 'panel', 'badge']);
  click(folded.ui.btn('badge'), 0);
  assert.ok(folded.ui.field('panelToggle') === null);
  const hidden = narrow({ state: makeState({ arabic: arabic(), prefs: prefsWith({ panelEntry: false }) }), timeRight: 300 });
  assert.equal(hidden.ui.size(), 'folded');
  assert.deepEqual(shownKinds(hidden), ['download', 'upload', 'badge']);
  click(hidden.ui.btn('badge'), 0);
  assert.ok(hidden.ui.field('panelToggle') === null, 'زر أخفاه المستخدم لا يعود من القائمة');
});

test('القرار ٢٨ مع ع-ل: سبب تعذّر ظهور اللوحة وصفٌ لزرها في القائمة، وفتحها منه يقول لماذا', async () => {
  const link = createPanelLink();
  const page = narrow({ state: makeState({ arabic: arabic(), prefs: prefsWith({ panelOpen: false }) }), timeRight: 300, link });
  link.setPanelIssue('PL_COLUMN_NOT_FOUND');
  page.env.win.advance(1000);
  const msg = messageFor('PL_COLUMN_NOT_FOUND');
  click(page.ui.btn('badge'), 0);
  assert.equal(page.ui.field('panelToggle').getAttribute('aria-description'), msg);
  click(page.ui.field('panelToggle'));
  await settle();
  assert.ok(page.ui.toasts().some((t) => t.tone === 'warning' && t.text.includes(msg)));
});

test('القرار ٢٨: الطي والتركيز على زر اللوحة في الشريط ينقله إلى الشارة، واتساع الشريط والتركيز عليه في القائمة يبقيه فيها', () => {
  const page = narrow();
  page.ui.btn('panel').focus();
  page.left.children[1].rect = { ...page.left.children[1].rect, right: 300, width: 180 };
  page.env.win.resize(page.player);
  assert.equal(page.ui.size(), 'folded-panel');
  assert.ok(page.env.doc._focused === page.ui.btn('badge'), 'إلى الشارة التي صار فيها، لا إلى الصفحة');
  click(page.ui.btn('badge'), 0);
  page.ui.field('panelToggle').focus();
  page.left.children[1].rect = { ...page.left.children[1].rect, right: 242, width: 122 };
  page.env.win.resize(page.player);
  assert.equal(page.ui.size(), 'folded');
  assert.ok(page.ui.field('panelToggle') === null);
  const focused = page.ui.layerHost().shadowRoot.activeElement;
  assert.ok(focused && focused.getAttribute('data-first') !== null, 'إلى أول عنصر في القائمة');
});
