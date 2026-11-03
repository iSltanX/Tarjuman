// تذييل اللوحة: «توقيت الترجمة» المشترك مع أزرار المشغّل. الإزاحة واحدة (view.displayOffsetMs في المتحكم): − و+ بنداءات
// nudgeOffset، وتصفير resetOffset، والخطوة بمسار الإعدادات نفسه الذي تستعمله قائمة التوقيت في المشغّل (updateSettings)،
// وما يتغير في الشريط أو الطبقة يظهر هنا وبالعكس.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountOverlay } from '../../../../src/player/overlay/index.js';
import { arCues, click, hidden, key, makeState, settle, ui, watchPage } from './harness.js';

const calls = (p, name) => p.controller.calls.filter((c) => c[0] === name);
const foot = (p) => ({
  value: ui(p).q('.off__val b').textContent,
  mean: ui(p).q('.off__val .mean').textContent,
  zero: ui(p).q('.off__val').classList.contains('zero'),
});

test('التذييل: العنوان والتلميح «مشترك مع أزرار المشغّل» وزر «تصفير»', () => {
  const page = watchPage();
  page.mount();
  const text = ui(page).q('.foot').textContent;
  assert.ok(text.includes('توقيت الترجمة'));
  assert.ok(text.includes('مشترك مع أزرار المشغّل'));
  assert.ok(text.includes('تصفير'));
  assert.equal(hidden(ui(page).q('.foot')), false);
});

test('القيمة والمعنى: «+0.5 ث · تظهر لاحقًا»، و«−1.0 ث · تظهر أبكر»، وعند الصفر «0.0 · في توقيتها المحفوظ»', () => {
  const page = watchPage();
  page.mount();
  assert.deepEqual(foot(page), { value: '0.0', mean: ' · في توقيتها المحفوظ', zero: true });
  page.controller.set({ view: { displayOffsetMs: 500, displayMode: 'ar' } });
  assert.deepEqual(foot(page), { value: '+0.5', mean: ' · تظهر لاحقًا', zero: false });
  assert.equal(ui(page).q('.off__val').textContent, '+0.5 ث · تظهر لاحقًا');
  page.controller.set({ view: { displayOffsetMs: -1000, displayMode: 'ar' } });
  assert.deepEqual(foot(page), { value: '−1.0', mean: ' · تظهر أبكر', zero: false });
  assert.equal(ui(page).q('.off__val').getAttribute('aria-live'), 'polite');
});

test('زرّا − «تقديم» و+ «تأخير»: nudgeOffset(−1) وnudgeOffset(+1) بالخطوة، وأسماء الوصول بالخطوة الحالية', () => {
  const page = watchPage();
  page.mount();
  const [minus, plus] = ui(page).qa('.off .b');
  assert.equal(minus.getAttribute('aria-label'), 'تقديم الترجمة 0.5 ث (تظهر أبكر)');
  assert.equal(plus.getAttribute('aria-label'), 'تأخير الترجمة 0.5 ث (تظهر لاحقًا)');
  assert.ok(minus.textContent.includes('تقديم') && plus.textContent.includes('تأخير'));
  click(plus);
  click(plus);
  click(minus);
  assert.deepEqual(calls(page, 'nudgeOffset'), [['nudgeOffset', 1], ['nudgeOffset', 1], ['nudgeOffset', -1]]);
  assert.equal(page.controller.getState().view.displayOffsetMs, 500);
  assert.equal(foot(page).value, '+0.5');
  page.controller.set({ settings: { ...page.controller.getState().settings, offsetStepMs: 1500 } });
  assert.equal(ui(page).qa('.off .b')[1].getAttribute('aria-label'), 'تأخير الترجمة 1.5 ث (تظهر لاحقًا)');
  click(ui(page).qa('.off .b')[1]);
  assert.equal(page.controller.getState().view.displayOffsetMs, 2000, 'الخطوة من إعدادات المتحكم');
});

test('تصفير: resetOffset، وهو معطّل عند الصفر (لا نداء)', () => {
  const page = watchPage({ state: makeState({ view: { displayOffsetMs: 1000, displayMode: 'ar' } }) });
  page.mount();
  const reset = () => ui(page).q('.foot .b--ghost');
  assert.ok(reset().textContent.includes('تصفير'));
  assert.equal(reset().hasAttribute('aria-disabled'), false);
  click(reset());
  assert.deepEqual(calls(page, 'resetOffset'), [['resetOffset']]);
  assert.equal(page.controller.getState().view.displayOffsetMs, 0);
  assert.equal(reset().getAttribute('aria-disabled'), 'true');
  click(reset());
  assert.equal(calls(page, 'resetOffset').length, 1, 'لا نداء عند الصفر');
});

test('الإزاحة واحدة: أزرار المتحكم (الشريط) تظهر في اللوحة والزر المغلق، وأزرار اللوحة تظهر لدى المتحكم', () => {
  const page = watchPage();
  page.mount();
  page.controller.nudgeOffset(1); // كما يفعل زر + في شريط المشغّل
  assert.equal(foot(page).value, '+0.5');
  click(ui(page).qa('.off .b')[1]);
  assert.equal(page.controller.getState().view.displayOffsetMs, 1000);
  page.controller.set({ prefs: { ...page.controller.getState().prefs, ui: { ...page.controller.getState().prefs.ui, panelOpen: false } } });
  assert.equal(ui(page).qa('.pill')[0].textContent, '+1.0');
});

test('الإزاحة واحدة مع الطبقة: ± من اللوحة يغيّر الترجمة المعروضة فوق الفيديو، والعكس', () => {
  const page = watchPage();
  page.video.silentTo(4); // الثاني 3.5–5.5
  const overlay = mountOverlay(page.controller, { doc: page.doc, win: page.win, fonts: null });
  page.mount();
  const shown = () => overlay.peek(false).lines.map((l) => l.text).join('|');
  assert.equal(shown(), 'سطر 2');
  const rowsNow = () => ui(page).rows().map((r, i) => (r.classList.contains('cur') ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(rowsNow(), [1]);
  click(ui(page).qa('.off .b')[1]);
  click(ui(page).qa('.off .b')[1]); // +1.0 ← يبحث عن 3.0: فجوة
  assert.equal(shown(), '', 'الطبقة تتبع إزاحة اللوحة');
  assert.deepEqual(rowsNow(), [], 'واللوحة والطبقة على قاعدة واحدة');
  page.controller.setOffset(-2500); // زر المشغّل ← يبحث عن 6.5: الثالث 6.0–8.0
  assert.equal(shown(), 'سطر 3');
  assert.deepEqual(rowsNow(), [2]);
  overlay.unmount();
});

test('الخطوة: 0.5 و1 ومخصص مقطّعة بمسار قائمة التوقيت (updateSettings({ offsetStepMs }))', () => {
  const page = watchPage();
  page.mount();
  const steps = () => ui(page).qa('.segs')[1].children;
  assert.deepEqual(steps().map((b) => b.textContent), ['0.5 ث', '1 ث', 'مخصص']);
  assert.deepEqual(steps().map((b) => b.getAttribute('aria-checked')), ['true', 'false', 'false']);
  assert.equal(ui(page).qa('.segs')[1].getAttribute('aria-label'), 'خطوة الأزرار');
  click(steps()[1]);
  assert.deepEqual(calls(page, 'updateSettings'), [['updateSettings', { offsetStepMs: 1000 }]]);
  assert.equal(page.controller.getState().settings.offsetStepMs, 1000);
  assert.deepEqual(steps().map((b) => b.getAttribute('aria-checked')), ['false', 'true', 'false']);
  assert.equal(hidden(ui(page).q('.num')), true, 'لا حقل مخصص');
  click(steps()[0]);
  assert.equal(page.controller.getState().settings.offsetStepMs, 500);
  click(steps()[0]);
  assert.equal(calls(page, 'updateSettings').length, 2, 'الخطوة نفسها لا تُكتب ثانية');
});

test('الخطوة تتبع تغييرها من قائمة المشغّل (الإعدادات واحدة)', () => {
  const page = watchPage();
  page.mount();
  page.controller.set({ settings: { ...page.controller.getState().settings, offsetStepMs: 1000 } });
  assert.deepEqual(ui(page).qa('.segs')[1].children.map((b) => b.getAttribute('aria-checked')), ['false', 'true', 'false']);
  page.controller.set({ settings: { ...page.controller.getState().settings, offsetStepMs: 300 } });
  assert.deepEqual(ui(page).qa('.segs')[1].children.map((b) => b.getAttribute('aria-checked')), ['false', 'false', 'true'], 'غير المعدّة مسبقًا ← مخصص');
  assert.equal(hidden(ui(page).q('.num')), false);
  assert.equal(ui(page).q('.num').value, '0.3');
});

/** يكتب في الحقل ثم يطلق الحدث (الحدث يقرأ ev.target.value من العنصر نفسه). */
const type = (input, value, ev = { type: 'change' }) => {
  input.value = value;
  input.dispatchEvent({ ...ev });
};

test('خطوة مخصصة: الحقل بالثواني، وفتحه لا يكتب، وEnter وchange يطبّقان، والقيمة تُقرأ بأرقام عربية وفاصلة', () => {
  const page = watchPage();
  page.mount();
  click(ui(page).qa('.segs')[1].children[2]);
  const input = ui(page).q('.num');
  assert.equal(hidden(input), false);
  assert.equal(input.getAttribute('aria-label'), 'الخطوة بالثواني');
  assert.equal(input.value, '0.5', 'تبدأ بالخطوة الحالية');
  assert.equal(calls(page, 'updateSettings').length, 0, 'فتح الحقل لا يكتب');
  type(input, '0.7', { type: 'keydown', key: 'Enter' });
  assert.deepEqual(calls(page, 'updateSettings').at(-1), ['updateSettings', { offsetStepMs: 700 }]);
  type(input, '٢٫٥');
  assert.deepEqual(calls(page, 'updateSettings').at(-1), ['updateSettings', { offsetStepMs: 2500 }]);
  assert.equal(page.controller.getState().settings.offsetStepMs, 2500);
  assert.equal(ui(page).q('.num').value, '2.5');
  type(input, '0.9', { type: 'keydown', key: 'a' });
  assert.equal(calls(page, 'updateSettings').length, 2, 'مفتاح عادي لا يطبّق');
});

test('خطوة مخصصة غير صالحة: رسالة الخطأ نفسها كقائمة المشغّل، ولا كتابة، والنص المكتوب يبقى', () => {
  const page = watchPage();
  page.mount();
  click(ui(page).qa('.segs')[1].children[2]);
  const input = ui(page).q('.num');
  for (const bad of ['abc', '0', '0.05', '11', '0.35', '-1']) {
    type(input, bad);
    assert.equal(calls(page, 'updateSettings').length, 0, `«${bad}»`);
    assert.equal(hidden(ui(page).q('.field-error')), false);
    assert.equal(ui(page).q('.field-error').textContent, 'أدخل خطوة بين 0.1 و10 ثوانٍ، مثل 0.3.');
    assert.equal(ui(page).q('.num').getAttribute('aria-invalid'), 'true');
    assert.equal(ui(page).q('.num').value, bad, 'النص المكتوب لا يُستبدل');
  }
  type(input, '10');
  assert.deepEqual(calls(page, 'updateSettings').at(-1), ['updateSettings', { offsetStepMs: 10000 }]);
  assert.equal(hidden(ui(page).q('.field-error')), true, 'الخطأ يزول بقيمة صالحة');
  assert.equal(ui(page).q('.num').getAttribute('aria-invalid'), 'false');
});

test('كتابة الخطوة مرفوضة: رسالة تحت الحقل ولا رمي', async () => {
  const page = watchPage({ controllerOpts: { settingsFail: true } });
  const handle = page.mount();
  click(ui(page).qa('.segs')[1].children[1]);
  await settle();
  assert.equal(hidden(ui(page).q('.field-error')), false);
  assert.ok(ui(page).q('.field-error').textContent.length > 0);
  assert.ok(handle.diagnostics().session.actionFailures >= 1);
  assert.equal(page.controller.getState().settings.offsetStepMs, 500);
});

test('خطوة 0.5 و1 بعد المخصص: الحقل المخصص يبقى حتى يُختار ضبط معدّ مسبقًا', () => {
  const page = watchPage();
  page.mount();
  const seg = (i) => ui(page).qa('.segs')[1].children[i];
  click(seg(2));
  type(ui(page).q('.num'), '1');
  assert.equal(page.controller.getState().settings.offsetStepMs, 1000);
  assert.equal(seg(2).getAttribute('aria-checked'), 'true', 'المخصص يبقى مختارًا بعد قيمة تساوي ضبطًا معدًّا');
  click(seg(0));
  assert.equal(seg(0).getAttribute('aria-checked'), 'true');
  assert.equal(hidden(ui(page).q('.num')), true);
});

test('الإزاحة والخطوة غير متاحتين إلا في الحالة الجاهزة: لا تذييل أثناء التحميل ولا بلا ترجمة', () => {
  const loading = watchPage({ state: makeState({ loading: true, arabic: null, activeSlot: null }) });
  loading.mount();
  assert.equal(hidden(ui(loading).q('.foot')), true);
  const empty = watchPage({ state: makeState({ arabic: null, activeSlot: null }) });
  empty.mount();
  assert.equal(hidden(ui(empty).q('.foot')), true);
});

test('أثناء قراءة السجل لا تأثير للأزرار (المتحكم يتجاهلها): لا خطأ ولا تغيّر', () => {
  const page = watchPage({ state: makeState({ arabic: { cues: arCues(3) } }) });
  page.mount();
  page.controller.set({ loading: true });
  click(ui(page).qa('.off .b')[1]);
  assert.equal(page.controller.getState().view.displayOffsetMs, 0);
});
