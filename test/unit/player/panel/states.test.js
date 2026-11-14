// أشكال اللوحة وحالاتها: المغلقة (لا شيء في الصفحة) والمفتوحة والمخفي زرها (وتراجعه)، وقائمة الخيارات، وسطر الحالة من الحالة الفعلية، ونص اللوحة
// (العربية وحدها / مع لغة الأصل بسببه حين لا أصل)، وجارٍ التحميل، ولا ترجمة عربية، والخطأ، والعمود الضيق.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messageFor } from '../../../../src/core/errors/index.js';
import { isolate } from '../../../../src/ui/format.js';
import { DEFAULT_PREFS, mergePrefs } from '../../../../src/core/model/prefs.js';
import { UNDO_MS } from '../../../../src/player/panel/session.js';
import { A, B, arCues, click, english, enCues, flush, hidden, key, makeState, ui, watchPage } from './harness.js';

const prefsWith = (ui) => mergePrefs(DEFAULT_PREFS, { ui });
const ago = (p, n) => p.controller.calls.filter((c) => c[0] === n);
const lastPrefs = (p) => ago(p, 'updatePrefs').at(-1)[1];

test('مغلقة افتراضيًا (قرار سلطان 2026-11-03): لا شيء في صفحة يوتيوب — لا زر في العمود ولا لوحة ولا رسالة؛ وزرها في شريط المشغّل', () => {
  assert.equal(DEFAULT_PREFS.ui.panelOpen, false);
  const page = watchPage({ state: makeState({ prefs: DEFAULT_PREFS }) });
  page.mount();
  const v = ui(page);
  assert.equal(page.handle.peek().mode, 'none');
  assert.equal(hidden(v.host), true, 'المضيف مخفي');
  assert.equal(v.entry, null, 'لا زر في العمود الجانبي');
  assert.equal(hidden(v.panel), true);
  assert.equal(hidden(v.toast), true);
  assert.equal(page.handle.peek().rows, 0, 'لا صفوف مبنية');
});

test('الفتح من زرها في الشريط أو من الإعدادات (التفضيل نفسه panelOpen=true): تظهر المفتوحة فورًا، والإغلاق يخفيها', () => {
  const page = watchPage({ state: makeState({ prefs: prefsWith({ panelOpen: false }) }) });
  page.mount();
  page.controller.set({ prefs: prefsWith({ panelOpen: true }) });
  const v = ui(page);
  assert.equal(page.handle.peek().mode, 'open');
  assert.equal(hidden(v.host), false);
  assert.equal(hidden(v.panel), false);
  page.controller.set({ prefs: prefsWith({ panelOpen: false }) });
  assert.equal(page.handle.peek().mode, 'none');
  assert.equal(hidden(v.host), true);
});

test('الزر مخفي (panelEntry=false): لا شيء يُرسم (المضيف مخفي) ولو كانت اللوحة مفتوحة في التفضيل', () => {
  const page = watchPage({ state: makeState({ prefs: prefsWith({ panelEntry: false, panelOpen: true }) }) });
  const handle = page.mount();
  const v = ui(page);
  assert.equal(handle.peek().mode, 'none');
  assert.equal(hidden(v.host), true);
  assert.equal(hidden(v.panel), true);
  assert.equal(hidden(v.toast), true);
  assert.equal(handle.peek().rows, 0, 'لا صفوف مبنية');
});

test('الزر يعود من الإعدادات أو نافذة الأيقونة: اللوحة كما في تفضيلها (مغلقة لا تظهر، ومفتوحة تظهر فورًا)', () => {
  const page = watchPage({ state: makeState({ prefs: prefsWith({ panelEntry: false, panelOpen: false }) }) });
  const handle = page.mount();
  assert.equal(handle.peek().mode, 'none');
  page.controller.set({ prefs: prefsWith({ panelEntry: true, panelOpen: false }) });
  assert.equal(handle.peek().mode, 'none');
  assert.equal(hidden(ui(page).host), true);
  page.controller.set({ prefs: prefsWith({ panelEntry: true, panelOpen: true }) });
  assert.equal(handle.peek().mode, 'open');
  assert.equal(hidden(ui(page).host), false);
});

test('المفتوحة: الرأس (الشعار والعنوان) وزرا «إخفاء زر اللوحة» والإغلاق باسميهما (ح4: لا قائمة «⋯»)', () => {
  const page = watchPage();
  page.mount();
  const v = ui(page);
  assert.equal(hidden(v.panel), false);
  assert.equal(v.q('.title').textContent, 'النص المتزامن');
  assert.equal(v.panel.getAttribute('aria-label'), 'النص المتزامن — ترجمان');
  const [hide, close] = v.qa('.head .b');
  assert.ok(hide === v.q('.head .hide'));
  assert.equal(hide.getAttribute('aria-label'), 'إخفاء زر اللوحة');
  assert.equal(hide.hasAttribute('aria-haspopup'), false, 'زر مباشر لا يفتح قائمة');
  assert.equal(close.getAttribute('aria-label'), 'إغلاق اللوحة');
  assert.ok(v.q('.head .mark'), 'رمز الشعار');
  assert.equal(v.q('.head .mark').getAttribute('viewBox'), '0 0 240 195', 'رمز الشعار وحده دون الاسم (إطار 240 × 195)');
  assert.equal(v.q('.head .mark').getAttribute('width'), '22', 'رأس اللوحة 22 كلوحة 12');
  assert.equal(v.q('.head .tj-logo__word'), null);
  const ds = v.q('.head .mark').children.map((p) => p.getAttribute('d'));
  assert.deepEqual(ds.slice(0, 2), ['M84 0L115.5 51L60 102L28.5 51Z', 'M180 0L211.5 51L156 102L124.5 51Z'], 'نقطتا التاء نقطتا قلم');
  assert.match(ds[2], /^M0 123C52 123 /, 'الكتاب بالنسخة الصغيرة تحت 32 بكسل');
});

test('الإغلاق: panelOpen=false وحده، فتختفي من الصفحة ويبقى زرها في الشريط (panelEntry لا يُمس)', () => {
  const page = watchPage();
  page.mount();
  click(ui(page).qa('.head .b')[1]);
  assert.deepEqual(lastPrefs(page), { ui: { panelOpen: false } });
  const v = ui(page);
  assert.equal(page.handle.peek().mode, 'none');
  assert.equal(hidden(v.host), true);
  assert.equal(page.controller.getState().prefs.ui.panelEntry, true);
});

test('ح4: «إخفاء زر اللوحة» زر مباشر في الرأس بتلميح يقول أين يعود، ولا قائمة «⋯» ولا بنود', () => {
  const page = watchPage();
  page.mount();
  const v = ui(page);
  const hide = v.q('.head .hide');
  assert.equal(hide.getAttribute('title'), 'إخفاء زر اللوحة: من كل صفحات الفيديو. تعيده من نافذة الإضافة أو الإعدادات.');
  assert.ok(v.q('.menu') === null, 'لا قائمة');
  assert.equal(v.qa('[role="menuitem"]').length, 0);
  click(hide);
  assert.equal(page.handle.peek().mode, 'toast', 'ضغطة واحدة تخفي، والرسالة فيها «تراجع»');
});

test('الإخفاء: panelEntry=false وpanelOpen=false معًا، ثم رسالة «أُخفي زر النص المتزامن» بتراجع', () => {
  const page = watchPage();
  page.mount();
  const v = ui(page);
  click(v.q('.head .hide'));
  assert.deepEqual(lastPrefs(page), { ui: { panelEntry: false, panelOpen: false } });
  assert.equal(page.handle.peek().mode, 'toast');
  assert.equal(hidden(v.toast), false);
  assert.ok(v.toast.textContent.includes('أُخفي زر النص المتزامن'));
  assert.ok(v.toast.textContent.includes('تراجع'));
  assert.equal(hidden(v.panel), true);
  assert.equal(hidden(v.host), false, 'المضيف باقٍ ليحمل الرسالة');
  assert.ok(v.q('.menu') === null);
});

test('التراجع يعيد الأمرين: الزر واللوحة مفتوحة كما كانت، وتختفي الرسالة', () => {
  const page = watchPage();
  page.mount();
  const v = ui(page);
  click(v.q('.head .hide'));
  click(v.q('.act'));
  assert.deepEqual(lastPrefs(page), { ui: { panelEntry: true, panelOpen: true } });
  assert.equal(page.handle.peek().mode, 'open');
  assert.equal(hidden(v.toast), true);
  assert.equal(page.env.win.pendingTimers() > 0, true, 'مؤقتات الجلسة الدورية فقط');
  page.env.win.advance(UNDO_MS + 100);
  assert.equal(page.handle.peek().mode, 'open', 'انتهاء المهلة لا يمس شيئًا بعد التراجع');
});

test('التراجع بعد إخفاء من لوحة كانت مغلقة (من زر مخفي لاحقًا) يعيد الزر مغلقًا', () => {
  const page = watchPage({ state: makeState({ prefs: prefsWith({ panelOpen: false }) }) });
  page.mount();
  page.controller.set({ prefs: prefsWith({ panelOpen: true }) });
  click(ui(page).q('.head .hide'));
  page.controller.set({ prefs: prefsWith({ panelEntry: false, panelOpen: false }) });
  click(ui(page).q('.act'));
  assert.deepEqual(lastPrefs(page), { ui: { panelEntry: true, panelOpen: true } });
});

test('الرسالة تدوم ستّ ثوانٍ بالضبط ثم يزول كل شيء (المضيف مخفي) والزر يبقى مخفيًا', () => {
  const page = watchPage();
  page.mount();
  click(ui(page).q('.head .hide'));
  assert.equal(UNDO_MS, 6000);
  page.env.win.advance(UNDO_MS - 100);
  assert.equal(page.handle.peek().mode, 'toast');
  page.env.win.advance(200);
  assert.equal(page.handle.peek().mode, 'none');
  assert.equal(hidden(ui(page).host), true);
  assert.equal(page.controller.getState().prefs.ui.panelEntry, false, 'لم يُعاد الزر');
});

test('الرسالة تُغلق إن عاد الزر من مكان آخر قبل انقضاء المهلة', () => {
  const page = watchPage();
  page.mount();
  click(ui(page).q('.head .hide'));
  assert.equal(page.handle.peek().mode, 'toast');
  page.controller.set({ prefs: prefsWith({ panelEntry: true, panelOpen: false }) });
  assert.equal(page.handle.peek().mode, 'none');
  assert.equal(hidden(ui(page).toast), true);
  page.controller.set({ prefs: prefsWith({ panelEntry: false, panelOpen: false }) });
  assert.equal(page.handle.peek().mode, 'none', 'إخفاء لاحق من مكان آخر لا يوقظ الرسالة القديمة');
});

test('فشل كتابة التفضيل أثناء الإخفاء: تُسحب الرسالة ويبقى الزر، ولا يُرمى', async () => {
  const page = watchPage({ controllerOpts: { prefsFail: true } });
  const handle = page.mount();
  click(ui(page).q('.head .hide'));
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((r) => setImmediate(r));
  assert.equal(handle.peek().mode, 'open', 'التفضيل لم يتغير');
  assert.equal(hidden(ui(page).toast), true);
  assert.ok(handle.diagnostics().session.actionFailures >= 1);
});

test('سطر الحالة من الحالة الفعلية: «متزامن · الترجمة 2 «مراجعة» · 3 مقاطع»', () => {
  const page = watchPage();
  page.mount();
  assert.equal(ui(page).status.textContent, `متزامن · الترجمة 2 «${isolate('مراجعة')}» · 3 مقاطع`);
});

test('سطر الحالة يتبع تبديل الخانة وعدد المقاطع، ويحذف الاسم إن لم تُسمَّ الخانة', () => {
  const page = watchPage();
  page.mount();
  const cues = arCues(412);
  page.controller.set({
    arabic: { cues, edited: false, fileName: 'b.srt', comparison: null }, activeSlot: 3,
    slots: [1, 2, 3].map((n) => ({ n, filled: n === 3, active: n === 3, name: null, edited: false, cueCount: n === 3 ? 412 : 0 })),
  });
  assert.equal(ui(page).status.textContent, 'متزامن · الترجمة 3 · 412 مقطعًا');
  page.controller.set({ arabic: { cues: arCues(1), edited: false, fileName: 'b.srt', comparison: null } });
  assert.equal(ui(page).status.textContent, 'متزامن · الترجمة 3 · مقطع واحد');
});

test('نص اللوحة: «الترجمة وحدها» و«مع ‹اسم لغة الأصل›» باسم اللغة الحقيقي', () => {
  const page = watchPage({ state: makeState({ english: english({ lang: 'en' }) }) });
  page.mount();
  const [ar, dual] = ui(page).segs();
  const names = new Intl.DisplayNames(['ar'], { type: 'language' });
  assert.equal(ar.textContent, 'الترجمة وحدها');
  assert.equal(dual.textContent, `مع ${names.of('en')}`);
  assert.equal(ar.getAttribute('aria-checked'), 'false', 'التفضيل الافتراضي panelDual=true');
  assert.equal(dual.getAttribute('aria-checked'), 'true');
  assert.equal(dual.hasAttribute('aria-disabled'), false);
});

test('اسم لغة الأصل ليس «الإنجليزية» مكتوبة: لغة أخرى تعطي اسمها', () => {
  const names = new Intl.DisplayNames(['ar'], { type: 'language' });
  for (const lang of ['fr', 'de', 'es', 'ja']) {
    const page = watchPage({ state: makeState({ english: english({ lang, cues: enCues(2) }) }) });
    page.mount();
    assert.equal(ui(page).segs()[1].textContent, `مع ${names.of(lang)}`, lang);
    assert.ok(!ui(page).segs()[1].textContent.includes(names.of('en')) || lang === 'en');
  }
});

test('تبديل النص: الضغط على «مع …» يكتب panelDual=true، و«الترجمة وحدها» تكتب false', () => {
  const page = watchPage({ state: makeState({ english: english(), prefs: prefsWith({ panelOpen: true, panelDual: false }) }) });
  page.mount();
  const [ar, dual] = ui(page).segs();
  assert.equal(ar.getAttribute('aria-checked'), 'true');
  click(dual);
  assert.deepEqual(lastPrefs(page), { ui: { panelDual: true } });
  assert.equal(ui(page).segs()[1].getAttribute('aria-checked'), 'true');
  click(ui(page).segs()[0]);
  assert.deepEqual(lastPrefs(page), { ui: { panelDual: false } });
});

test('تنقل الأسهم بين خيارَي النص: اليسار التالي واليمين السابق (RTL)', () => {
  const page = watchPage({ state: makeState({ english: english(), prefs: prefsWith({ panelOpen: true, panelDual: false }) }) });
  page.mount();
  const group = ui(page).q('.segs');
  key(ui(page).segs()[0], 'ArrowLeft');
  assert.deepEqual(lastPrefs(page), { ui: { panelDual: true } });
  key(ui(page).segs()[1], 'ArrowRight');
  assert.deepEqual(lastPrefs(page), { ui: { panelDual: false } });
  assert.equal(group.getAttribute('role'), 'radiogroup');
});

test('لا مسار أصلي: «مع الأصل» معطّل بسببه (aria وtitle)، والنقر لا يكتب، والمحدد «العربية وحدها»', () => {
  const page = watchPage({ state: makeState({ english: null }) });
  page.mount();
  const [ar, dual] = ui(page).segs();
  assert.equal(dual.getAttribute('aria-disabled'), 'true');
  assert.ok(dual.getAttribute('title').includes('الأصل غير ملتقط'));
  assert.ok(dual.getAttribute('aria-label').includes('الأصل غير ملتقط'));
  assert.equal(ar.getAttribute('aria-checked'), 'true');
  assert.equal(dual.getAttribute('aria-checked'), 'false');
  click(dual);
  assert.equal(ago(page, 'updatePrefs').length, 0);
  key(ar, 'ArrowLeft');
  assert.equal(ago(page, 'updatePrefs').length, 0, 'الأسهم لا تصل إلى المعطّل');
  assert.ok(!dual.textContent.includes('الإنجليزية'), 'لا لغة مكتوبة بلا مسار');
});

test('التفضيل panelDual=true بلا أصل لا يُمحى: يعود المزدوج حين يظهر الأصل', () => {
  const page = watchPage({ state: makeState({ english: null }) });
  page.mount();
  assert.equal(page.controller.getState().prefs.ui.panelDual, true);
  page.controller.set({ english: english() });
  assert.equal(ui(page).segs()[1].getAttribute('aria-checked'), 'true');
  assert.equal(ui(page).segs()[1].hasAttribute('aria-disabled'), false);
});

test('مفتاح «متابعة التشغيل»: مفعّل افتراضيًا (حالة جلسة)، والضغط يبدّله بلا كتابة تفضيل', () => {
  const page = watchPage();
  page.mount();
  const sw = ui(page).switchEl;
  assert.equal(sw.getAttribute('role'), 'switch');
  assert.equal(sw.getAttribute('aria-checked'), 'true');
  assert.ok(sw.textContent.includes('تمرير تلقائي'));
  click(sw);
  assert.equal(ui(page).switchEl.getAttribute('aria-checked'), 'false');
  assert.equal(ago(page, 'updatePrefs').length, 0, 'لا يُحفظ');
  click(ui(page).switchEl);
  assert.equal(ui(page).switchEl.getAttribute('aria-checked'), 'true');
});

test('جارٍ التحميل: هيكل صفوف وaria-busy ومؤشر، بلا صفوف ولا شريط ولا تذييل', () => {
  const page = watchPage({ state: makeState({ loading: true, arabic: null, activeSlot: null }) });
  const handle = page.mount();
  const v = ui(page);
  assert.equal(handle.peek().kind, 'loading');
  assert.equal(hidden(v.q('.skel')), false);
  assert.ok(v.qa('.skel__row').length >= 3);
  assert.equal(v.panel.getAttribute('aria-busy'), 'true');
  assert.equal(hidden(v.q('.load')), false);
  assert.equal(handle.peek().rows, 0);
  assert.equal(hidden(v.q('.bar')), true);
  assert.equal(hidden(v.q('.foot')), true);
  page.controller.set({ loading: false, arabic: { cues: arCues(3), edited: false, fileName: 'a.srt', comparison: null }, activeSlot: 1 });
  assert.equal(handle.peek().kind, 'ready');
  assert.equal(hidden(v.q('.skel')), true);
  assert.equal(v.panel.hasAttribute('aria-busy'), false);
  assert.equal(handle.peek().rows, 3);
});

test('ق-4 وح-57: سطر الأصل في الحالة الفارغة بالوصف الواحد: ترجمة يوتيوب الآلية بلغة مصدرها، والمحفوظة «محفوظة»', () => {
  const names = new Intl.DisplayNames(['ar'], { type: 'language' });
  const captured = watchPage({ state: makeState({ arabic: null, activeSlot: null, english: english({ key: 'ar|asr|en', lang: 'ar', kind: 'asr', via: 'en', cues: enCues(412) }) }) });
  const h1 = captured.mount();
  assert.equal(h1.peek().steps[0].text, `${names.of('ar')}، ترجمها يوتيوب آليًا عن ${names.of('en')} · 412\u00A0مقطعًا · ملتقطة`);
  const saved = watchPage({ state: makeState({ arabic: null, activeSlot: null, english: english({ key: 'ar|asr|en', lang: 'ar', kind: 'asr', via: 'en', source: 'saved', cues: enCues(412) }) }) });
  const h2 = saved.mount();
  assert.equal(h2.peek().steps[0].text, `${names.of('ar')}، ترجمها يوتيوب آليًا عن ${names.of('en')} · 412\u00A0مقطعًا · محفوظة`);
});

test('لا ترجمة: خطوات تدل على «زر التنزيل» و«زر الرفع» بالاسم دون تكرارهما (لا أزرار تحميل ولا رفع في اللوحة)', () => {
  const page = watchPage({ state: makeState({ arabic: null, activeSlot: null, english: english({ cues: enCues(412) }) }) });
  const handle = page.mount();
  const v = ui(page);
  assert.equal(handle.peek().kind, 'empty');
  assert.equal(hidden(v.q('.empty')), false);
  assert.ok(v.q('.empty__title').textContent.includes('لا ترجمة لهذا الفيديو'));
  const steps = handle.peek().steps;
  assert.equal(steps.length, 3);
  const names = new Intl.DisplayNames(['ar'], { type: 'language' });
  assert.equal(steps[0].text, `${names.of('en')} · يدوية · 412\u00A0مقطعًا · ملتقطة`, 'الوصف الواحد (ح-57)');
  assert.equal(steps[0].state, 'done');
  assert.ok(steps[1].text.includes('زر التنزيل'));
  assert.equal(steps[1].state, 'now');
  assert.ok(steps[2].text.includes('زر «رفع الترجمة (SRT)»'));
  assert.ok(v.q('.empty__note') === null, 'لا سطر ختامي بعد دمجه في خطوة الرفع (م-209)');
  assert.ok(v.q('.steps').textContent.includes('فيظهر نصه هنا متزامنًا مع الفيديو'));
  assert.equal(v.qa('.empty button').length, 0, 'لا زر يكرر زرّي الشريط');
  assert.equal(handle.peek().rows, 0);
  assert.equal(hidden(v.q('.foot')), true);
});

test('لا ترجمة ولا أصل ملتقط بعد: الخطوة الأولى هي الحالية', () => {
  const page = watchPage({ state: makeState({ arabic: null, activeSlot: null, english: null }) });
  const handle = page.mount();
  const steps = handle.peek().steps;
  assert.equal(steps[0].state, 'now');
  assert.ok(steps[0].text.includes('CC'));
  assert.equal(steps[1].state, '');
});

test('الأصل التلقائي المحفوظ يُسمّى كذلك في الخطوة الأولى', () => {
  const page = watchPage({ state: makeState({ arabic: null, activeSlot: null, english: english({ kind: 'asr', source: 'saved', lang: 'fr' }) }) });
  const t = page.mount().peek().steps[0].text;
  assert.equal(t, `${new Intl.DisplayNames(['ar'], { type: 'language' }).of('fr')} · تلقائية · 3\u00A0مقاطع · محفوظة`);
});

test('الخطأ: ما حدث وإعادة المحاولة → controller.reload، بلا صفوف', () => {
  const page = watchPage({ state: makeState({ arabic: null, activeSlot: null, error: { code: 'ST_READ_FAILED', message: 'تعذّرت قراءة الحفظ المحلي.', detail: null } }) });
  const handle = page.mount();
  const v = ui(page);
  assert.equal(handle.peek().kind, 'error');
  assert.equal(hidden(v.q('.err')), false);
  assert.ok(v.q('.alert__title').textContent.includes('تعذّرت قراءة الترجمة المحفوظة'));
  assert.ok(handle.peek().error.includes(messageFor('ST_READ_FAILED')));
  assert.equal(v.q('.alert').getAttribute('role'), 'alert');
  const retry = v.qa('.err .b')[0];
  assert.ok(retry.textContent.includes('إعادة المحاولة'));
  click(retry);
  assert.equal(ago(page, 'reload').length, 1);
  assert.equal(handle.peek().rows, 0);
});

test('خطأ مع ترجمة معروضة (كالكتابة المرفوضة): الصفوف باقية وتنبيه صغير بإعادة المحاولة', () => {
  const page = watchPage({ state: makeState({ error: { code: 'ST_WRITE_FAILED', message: 'تعذّر الحفظ.', detail: null } }) });
  const handle = page.mount();
  assert.equal(handle.peek().kind, 'ready');
  assert.equal(handle.peek().rows, 3);
  assert.ok(handle.peek().inlineError.includes('تعذّر الحفظ.'));
  click(ui(page).qa('.inline-error .b')[0]);
  assert.equal(ago(page, 'reload').length, 1);
  page.controller.set({ error: null });
  assert.equal(handle.peek().inlineError, null);
});

test('عمود ضيق (≤ 320): تسميات مختصرة «الترجمة»/«مزدوج»/«متابعة» وبقاء الأسماء الكاملة في اسم الوصول', () => {
  const page = watchPage({ state: makeState({ english: english({ lang: 'en' }) }) });
  const handle = page.mount();
  const host = ui(page).host;
  const full = ui(page).segs().map((b) => b.textContent);
  assert.deepEqual(full[0], 'الترجمة وحدها');
  host.rect = { left: 664, top: 0, width: 300, height: 360, right: 964, bottom: 360 };
  page.env.win.resize(host);
  assert.equal(handle.peek().narrow, true);
  const [ar, dual] = ui(page).segs();
  assert.equal(ar.textContent, 'الترجمة');
  assert.equal(dual.textContent, 'مع الأصل');
  assert.ok(dual.getAttribute('aria-label').includes('مع'), 'اسم الوصول الكامل');
  assert.equal(ar.getAttribute('aria-label'), 'الترجمة وحدها');
  assert.equal(ui(page).switchEl.textContent, 'تمرير تلقائي');
  assert.equal(ui(page).switchEl.getAttribute('aria-label'), 'تمرير تلقائي');
  assert.equal(ui(page).q('.root').hasAttribute('data-narrow'), true);
  host.rect = { ...host.rect, width: 402 };
  page.env.win.resize(host);
  assert.equal(ui(page).segs()[0].textContent, 'الترجمة وحدها');
  assert.equal(ui(page).switchEl.textContent, 'تمرير تلقائي');
});

test('عمود ضيق: أزرار − و+ بأسماء وصول كاملة (الكلمات تُخفى بالأنماط لا من DOM)', () => {
  const page = watchPage();
  page.mount();
  const host = ui(page).host;
  host.rect = { left: 664, top: 0, width: 300, height: 360, right: 964, bottom: 360 };
  page.env.win.resize(host);
  const [minus, plus] = ui(page).qa('.off .b');
  assert.ok(minus.getAttribute('aria-label').includes('تقديم'));
  assert.ok(plus.getAttribute('aria-label').includes('تأخير'));
  assert.equal(ui(page).q('.root').hasAttribute('data-narrow'), true);
});

test('الفيديو الآخر في الحالة (تنقّل لم يلحقه المتحكم بعد): هيكل لا صفوف قديمة', () => {
  const page = watchPage();
  const handle = page.mount();
  assert.equal(handle.peek().rows, 3);
  page.controller.set({ videoId: B });
  assert.equal(handle.peek().kind, 'loading');
  assert.equal(handle.peek().rows, 0, 'لا تبقى صفوف الفيديو السابق');
  page.controller.set({ videoId: A });
  assert.equal(handle.peek().kind, 'ready');
  assert.equal(handle.peek().rows, 3);
});

test('مراجعة الهوية L3 وL10: الرسالة تبقى حتى يُحفظ الإظهار (لا تختفي اللوحة لحظة)، والتركيز إلى «تراجع» ثم إلى اللوحة', async () => {
  let release = null;
  let gated = false;
  const page = watchPage({ controllerOpts: { prefsGate: () => (gated ? new Promise((r) => { release = r; }) : null) } });
  page.mount();
  const v = ui(page);
  v.q('.head .hide').focus();
  click(v.q('.head .hide'));
  await flush();
  assert.equal(page.handle.peek().mode, 'toast');
  assert.ok(v.root.activeElement === v.q('.act'), 'التركيز إلى «تراجع» لا إلى body');
  gated = true;
  click(v.q('.act'));
  await flush();
  assert.equal(page.handle.peek().mode, 'toast', 'الرسالة باقية حتى يُحفظ الإظهار');
  click(v.q('.act'));
  assert.equal(page.controller.calls.filter(([n]) => n === 'updatePrefs').length, 2, 'ضغطة ثانية أثناء الحفظ لا تكرر');
  release();
  await flush();
  assert.equal(page.handle.peek().mode, 'open');
  assert.ok(v.root.activeElement === v.qa('.head .b')[1], 'التركيز إلى زر إغلاق اللوحة بعد التراجع');
});

