// قائمة خيارات التوقيت (P6-AC3 الجزء الآلي): القيمة الكبيرة ومعناها، والإدخال الدقيق بالتحقق دون تطبيق الخاطئ،
// والخطوة (0.5 و1 ومخصصة)، وإعادة الضبط، وشرح الإشارة؛ والحقل لا يمرر الضغطات إلى اختصارات يوتيوب، والقائمة تُغلق
// بالنقر خارجها أو Esc أو إعادة الضغط، ويعود التركيز إلى زرها، وقائمة واحدة مفتوحة في كل مرة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messageFor } from '../../../../src/core/errors/index.js';
import { DEFAULT_SETTINGS } from '../../../../src/core/model/settings.js';
import { arabic, click, key, makeState, mountPage, pointerdown, settle, trackInfo } from './harness.js';

const page0 = (over = {}) => mountPage({ state: makeState({ arabic: arabic(), ...over }) });
const openTiming = (page) => {
  click(page.ui.btn('badge'));
  assert.equal(page.ui.menuLabel(), 'توقيت الترجمة');
};
const type = (input, value) => {
  input.value = value;
  input.dispatchEvent({ type: 'input', target: input, bubbles: true });
};

test('القيمة الحالية بخط كبير ومعناها بالكلمات، والشرح الثابت للإشارة، وتتحدث مع ± دون إغلاق', () => {
  const page = page0({ view: { displayOffsetMs: 500, displayMode: 'ar' } });
  openTiming(page);
  const big = () => page.ui.menu().querySelector('.big');
  assert.equal(big().textContent, '+0.5 ث');
  assert.equal(big().getAttribute('data-sign'), 'positive');
  assert.match(page.ui.menuText(), /تظهر الترجمة لاحقًا بنصف ثانية/);
  assert.match(page.ui.menuText(), /\+ تأخير: تظهر لاحقًا · − تقديم: تظهر أبكر/);
  assert.match(page.ui.menuText(), /الإزاحة لهذا الفيديو فقط وتُحفظ\./);
  assert.equal(page.ui.field('offset').value, '+0.5');
  click(page.ui.btn('minus'));
  click(page.ui.btn('minus'));
  click(page.ui.btn('minus'));
  assert.equal(page.ui.menuOpen(), true, '− و+ يبقيان في الشريط والقائمة مكمّلة لهما');
  assert.equal(big().textContent, '−1.0 ث');
  assert.match(page.ui.menuText(), /تظهر الترجمة أبكر بثانية واحدة/);
  assert.equal(page.ui.field('offset').value, '−1.0');
});

test('الإدخال الدقيق: يقبل -2.3 و4.5 وصيغ الأرقام العربية، ويرفض غير الصالح بخطأ تحته دون تطبيقه', () => {
  const page = page0();
  openTiming(page);
  const input = () => page.ui.field('offset');
  type(input(), '-2.3');
  key(input(), 'Enter');
  assert.deepEqual(page.controller.calls.at(-1), ['setOffset', -2300]);
  assert.equal(page.controller.getState().view.displayOffsetMs, -2300);
  assert.equal(input().value, '−2.3', 'القيمة بعد التطبيق بصيغتها');
  type(input(), '٤٫٥');
  input().dispatchEvent({ type: 'change', target: input() });
  assert.equal(page.controller.getState().view.displayOffsetMs, 4500);
  const calls = page.controller.calls.length;
  for (const bad of ['abc', '1.2.3', '', '700', '-601']) {
    type(input(), bad);
    key(input(), 'Enter');
    assert.equal(page.controller.calls.length, calls, `لا تطبيق لـ«${bad}»`);
    assert.equal(input().getAttribute('aria-invalid'), 'true');
    assert.ok(page.ui.menuText().includes(messageFor('CT_OFFSET_INVALID')));
    assert.equal(input().value, bad, 'النص المكتوب يبقى ليُصحَّح');
  }
  type(input(), '1.25');
  key(input(), 'Enter');
  assert.equal(page.controller.getState().view.displayOffsetMs, 1300, 'شبكة 100ms');
  assert.equal(input().getAttribute('aria-invalid'), 'false');
});

test('الكتابة في الحقل لا تصل إلى اختصارات يوتيوب: الأرقام والمسافة والأسهم وk وf تبقى في القائمة', () => {
  const page = page0();
  openTiming(page);
  const seen = [];
  for (const where of [page.env.doc, page.player]) where.addEventListener('keydown', (ev) => seen.push(ev.key));
  page.env.doc.addEventListener('keyup', (ev) => seen.push(`up:${ev.key}`));
  page.env.doc.addEventListener('keypress', (ev) => seen.push(`press:${ev.key}`));
  const input = page.ui.field('offset');
  for (const k of ['1', '5', ' ', 'ArrowLeft', 'ArrowRight', 'k', 'f', 'm', '.']) {
    key(input, k);
    key(input, k, 'keypress');
    key(input, k, 'keyup');
  }
  assert.deepEqual(seen, []);
  // ولا النقر داخل القائمة (تشغيل وإيقاف بالنقر على المشغّل)
  const clicks = [];
  page.player.addEventListener('click', () => clicks.push(1));
  click(page.ui.menu().querySelector('.big'));
  assert.deepEqual(clicks, []);
});

test('خطوة الأزرار: 0.5 و1 من الإعدادات، والمخصص بحقله (0.1 إلى 10) وخطؤه، وتصل التلميحات فورًا', async () => {
  const page = page0();
  openTiming(page);
  const seg = () => page.ui.menu().querySelectorAll('[role="radio"]');
  assert.deepEqual(seg().map((b) => b.textContent), ['0.5', '1', 'مخصص']);
  assert.equal(seg()[0].getAttribute('aria-checked'), 'true');
  click(seg()[1]);
  await settle();
  assert.deepEqual(page.controller.calls.at(-1), ['updateSettings', { offsetStepMs: 1000 }]);
  assert.equal(page.ui.btn('plus').getAttribute('aria-label'), 'تأخير الترجمة 1 ث (تظهر لاحقًا)');
  click(seg()[2]);
  const step = () => page.ui.field('stepText');
  assert.ok(step(), 'المخصص يكشف حقله');
  type(step(), '20');
  key(step(), 'Enter');
  await settle();
  assert.ok(page.ui.menuText().includes(messageFor('CT_STEP_INVALID')));
  assert.equal(page.controller.calls.filter((c) => c[0] === 'updateSettings').length, 1);
  type(step(), '0.3');
  key(step(), 'Enter');
  await settle();
  assert.deepEqual(page.controller.calls.at(-1), ['updateSettings', { offsetStepMs: 300 }]);
  assert.equal(page.ui.btn('minus').getAttribute('aria-label'), 'تقديم الترجمة 0.3 ث (تظهر أبكر)');
  click(page.ui.btn('plus'));
  assert.equal(page.controller.getState().view.displayOffsetMs, 300);
  // خطوة خارج الاختيارين: يُعرض «مخصص» بقيمتها عند الفتح التالي
  click(page.ui.btn('badge'));
  click(page.ui.btn('badge'));
  assert.equal(seg()[2].getAttribute('aria-checked'), 'true');
  assert.equal(page.ui.field('stepText').value, '0.3');
});

test('إخفاق حفظ الخطوة يظهر تحت الحقل', async () => {
  const page = mountPage({ state: makeState({ arabic: arabic() }), controllerOpts: { settingsFail: true } });
  openTiming(page);
  click(page.ui.menu().querySelectorAll('[role="radio"]')[1]);
  await settle();
  assert.ok(page.ui.menuText().includes(messageFor('ST_WRITE_FAILED')));
});

test('إعادة الضبط إلى 0 تعيد الشارة الباهتة', () => {
  const page = page0({ view: { displayOffsetMs: -1500, displayMode: 'ar' } });
  openTiming(page);
  click(page.ui.item('إعادة الضبط إلى 0'));
  assert.deepEqual(page.controller.calls.at(-1), ['resetOffset']);
  assert.equal(page.ui.btn('badge').textContent, '0.0');
  assert.equal(page.ui.btn('badge').getAttribute('data-sign'), 'zero');
  assert.match(page.ui.menuText(), /الترجمة في توقيتها المحفوظ/);
});

test('الإغلاق: إعادة الضغط، والنقر خارجها، وEsc (ويعود التركيز إلى زرها)؛ والنقر داخلها لا يغلقها', () => {
  const page = page0();
  openTiming(page);
  click(page.ui.btn('badge'));
  assert.equal(page.ui.menuOpen(), false, 'إعادة الضغط');
  openTiming(page);
  pointerdown(page.ui.menu().querySelector('.big'));
  assert.equal(page.ui.menuOpen(), true, 'داخلها');
  pointerdown(page.video);
  assert.equal(page.ui.menuOpen(), false, 'خارجها');
  openTiming(page);
  page.ui.field('offset').focus();
  key(page.ui.field('offset'), 'Escape');
  assert.equal(page.ui.menuOpen(), false, 'Esc');
  assert.equal(page.env.doc._focused, page.ui.btn('badge'), 'التركيز عاد إلى الشارة');
  assert.equal(page.ui.btn('badge').getAttribute('aria-expanded'), 'false');
});

test('بلوحة المفاتيح: الفتح ينقل التركيز إلى أول عنصر (حقل الإزاحة)، وبالفأرة يبقى على الزر', () => {
  const page = page0();
  click(page.ui.btn('badge'), 0);
  assert.equal(page.env.doc._focused, page.ui.field('offset'));
  click(page.ui.btn('badge'), 0);
  click(page.ui.btn('badge'), 1);
  assert.notEqual(page.env.doc._focused, page.ui.field('offset'));
});

test('قائمة واحدة في كل مرة: فتح التوقيت يغلق التحميل، وتلميح الزر لا يظهر وقائمته مفتوحة', () => {
  const page = page0({ captured: [trackInfo()] });
  click(page.ui.btn('download'));
  assert.equal(page.ui.menuLabel(), 'تحميل الترجمة');
  click(page.ui.btn('badge'));
  assert.equal(page.ui.menuLabel(), 'توقيت الترجمة');
  assert.equal(page.ui.btn('download').getAttribute('aria-expanded'), 'false');
  assert.equal(page.ui.btn('badge').getAttribute('aria-expanded'), 'true');
  page.ui.btn('badge').dispatchEvent({ type: 'pointerenter' });
  assert.equal(page.ui.tip(), null);
});

test('إعادة بناء القائمة لا تُضيع ما يُكتب: تغيّر خارجي أثناء الكتابة يُبقي النص والتركيز', () => {
  const page = page0();
  openTiming(page);
  const input = page.ui.field('offset');
  input.focus();
  type(input, '2.');
  page.controller.set({ settings: { ...DEFAULT_SETTINGS, offsetStepMs: 1000 } });
  const again = page.ui.field('offset');
  assert.equal(again, input, 'الحقل نفسه حُدّث في مكانه');
  assert.equal(again.value, '2.');
  assert.equal(page.env.doc._focused, again);
});

test('اختفاء الترجمة العربية أو تبدّل الفيديو يغلق القائمة', () => {
  const page = page0();
  openTiming(page);
  page.controller.set({ arabic: null });
  assert.equal(page.ui.menuOpen(), false);
  page.controller.set({ arabic: arabic() });
  openTiming(page);
  page.controller.set({ videoId: 'BBBBBBBBBBB' });
  assert.equal(page.ui.menuOpen(), false);
});
