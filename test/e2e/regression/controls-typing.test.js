// إصلاح تكامل P9 (قرار سلطان في W4، product-spec §٦.٤): القائمة التي فيها التركيز يكتب المستخدم في حقلها تبقى ظاهرة
// ولو أخفى يوتيوب شريطه، حتى يغادر حقلها أو يغلقها؛ وما عداها يتبع الشريط كما في P6. يستعمل حزام P6 قراءةً فقط.
// الـDOM الوهمي لا يطلق focusin/focusout بنفسه، فيطلقهما الاختبار كما يفعل المتصفح عند التركيز ومغادرته.
//   node scripts/run-tests.mjs test/e2e/regression
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layerCss } from '../../../src/player/controls/styles.js';
import { arabic, click, makeState, mountPage } from '../../unit/player/controls/harness.js';

const withArabic = () => makeState({ arabic: arabic() });
const layerOf = (ui) => ui.layerHost().shadowRoot.querySelector('.layer');
const typing = (ui) => layerOf(ui).hasAttribute('data-typing');

function focusField(ui, fid) {
  const el = ui.field(fid);
  el.focus();
  el.dispatchEvent({ type: 'focusin', bubbles: true });
  return el;
}

function leave(el, to = null) {
  el.dispatchEvent({ type: 'focusout', bubbles: true, relatedTarget: to });
  if (to) {
    to.focus();
    to.dispatchEvent({ type: 'focusin', bubbles: true });
  } else {
    el.blur();
  }
}

test('الكتابة في حقل الإدخال الدقيق تبقي قائمة التوقيت ظاهرة والشريط مخفي، ومغادرة الحقل تعيدها إلى قاعدة الشريط', () => {
  const page = mountPage({ state: withArabic() });
  const { ui } = page;
  click(ui.btn('badge'));
  assert.equal(ui.menuOpen(), true);
  const field = focusField(ui, 'offset');
  assert.equal(typing(ui), true, 'التركيز في حقل يُكتب فيه');
  page.player.classList.add('ytp-autohide');
  assert.equal(ui.barState(), 'hidden');
  assert.equal(typing(ui), true, 'إخفاء الشريط لا يُسقط حالة الكتابة');
  assert.equal(ui.menuOpen(), true);
  leave(field);
  assert.equal(typing(ui), false, 'مغادرة الحقل تعيد القائمة إلى قاعدة الشريط');
  assert.equal(ui.menuOpen(), true, 'القائمة لا تُغلق؛ تتبع الشريط بالشفافية كما في P6');
  page.player.classList.remove('ytp-autohide');
  assert.equal(ui.barState(), 'shown');
});

test('الانتقال من حقل إلى زر في القائمة نفسها يُنهي الكتابة، ومن حقل إلى حقل يبقيها', () => {
  const page = mountPage({ state: withArabic() });
  const { ui } = page;
  click(ui.btn('badge'));
  const field = focusField(ui, 'offset');
  const reset = ui.menu().querySelectorAll('button').find((b) => b.getAttribute('data-fid')) ?? null;
  assert.ok(reset, 'في قائمة التوقيت زر بمعرّف');
  leave(field, reset);
  assert.equal(typing(ui), false, 'الزر ليس حقل كتابة');
  const again = focusField(ui, 'offset');
  assert.equal(typing(ui), true);
  const other = ui.field('stepText');
  if (other) {
    leave(again, other);
    assert.equal(typing(ui), true, 'حقل الخطوة المخصصة حقل كتابة أيضًا');
  }
});

test('إغلاق القائمة يُسقط حالة الكتابة، وفتح قائمة أخرى لا يرثها', () => {
  const page = mountPage({ state: withArabic() });
  const { ui } = page;
  click(ui.btn('badge'));
  focusField(ui, 'offset');
  assert.equal(typing(ui), true);
  click(ui.btn('badge'));
  assert.equal(ui.menuOpen(), false);
  assert.equal(typing(ui), false);
  click(ui.btn('download'));
  assert.equal(ui.menuOpen(), true);
  assert.equal(typing(ui), false, 'قائمة جديدة بلا تركيز في حقل');
});

test('الأنماط: الشريط المخفي يُخفي الطبقة إلا في حالة الكتابة، والتلميح لا يظهر والشريط مخفي', () => {
  const css = layerCss();
  assert.match(css, /\.layer\[data-bar="hidden"\]:not\(\[data-typing\]\) \{ opacity: 0; \}/);
  assert.match(css, /\.layer\[data-bar="hidden"\]:not\(\[data-typing\]\) \* \{ pointer-events: none !important; \}/);
  assert.match(css, /\.layer\[data-bar="hidden"\]\[data-typing\] \.tip \{ display: none; \}/);
  assert.doesNotMatch(css, /\.layer\[data-bar="hidden"\] \{ opacity: 0; \}/, 'لا قاعدة إخفاء مطلقة تتجاوز حالة الكتابة');
});

test('peek للحزام الحي يبلّغ حالة الكتابة دون نص', () => {
  const page = mountPage({ state: withArabic() });
  click(page.ui.btn('badge'));
  focusField(page.ui, 'offset');
  assert.equal(page.handle.peek().layer.typing, true);
});
