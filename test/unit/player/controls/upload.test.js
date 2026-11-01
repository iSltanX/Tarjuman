// الرفع والعرض (P6-AC5 الجزء الآلي): دون ترجمة يفتح منتقي الملفات مباشرة، والفحص والمقارنة فوق readImport بالبصمات
// المحفوظة، ثم loadArabic وملخص النتيجة؛ ومع ترجمة قائمة باسم الملف والملخص ووضع العرض والاستبدال بتأكيد يذكر تصفير
// الإزاحة. لا تحميل لنتيجة قُرئت لفيديو سابق.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messageFor } from '../../../../src/core/errors/index.js';
import { AR_CUES, arabic, chooseFiles, click, makeState, matched, mountPage, settle } from './harness.js';

const file = (name) => ({ name });

test('دون ترجمة: زر الرفع يفتح منتقي الملفات مباشرة (لا قائمة)، ويقبل SRT وأجزاءه', () => {
  const page = mountPage();
  let opened = 0;
  page.ui.fileInput().addEventListener('click', () => opened++);
  click(page.ui.btn('upload'));
  assert.equal(opened, 1);
  assert.equal(page.ui.menuOpen(), false);
  assert.equal(page.ui.fileInput().getAttribute('accept'), '.srt,application/x-subrip,text/plain');
  assert.equal(page.ui.fileInput().hasAttribute('multiple'), true);
});

test('اختيار ملف: فحص ومقارنة بالبصمات المحفوظة والإعدادات، ثم التحميل وملخص المقارنة في قائمة العرض', async () => {
  const fps = [{ id: 'fp_test000001' }];
  const page = mountPage({ state: makeState({ saved: { fingerprints: fps } }) });
  click(page.ui.btn('upload'));
  chooseFiles(page.ui, [file('talk.ar.srt')]);
  assert.equal(page.ui.btn('upload').querySelector('.spin').hasAttribute('hidden'), false, 'فحص جارٍ');
  await settle();
  assert.deepEqual(page.flows.reads[0].names, ['talk.ar.srt']);
  assert.strictEqual(page.flows.reads[0].opts.fingerprints, fps);
  assert.strictEqual(page.flows.reads[0].opts.settings, page.controller.getState().settings);
  const load = page.controller.calls.find((c) => c[0] === 'loadArabic');
  assert.deepEqual(Object.keys(load[1]).sort(), ['comparison', 'cues', 'fileName', 'fingerprintId', 'notes'], 'مدخل loadArabic بعقده');
  assert.deepEqual(load[2], { replace: false });
  assert.equal(page.ui.menuLabel(), 'الترجمة العربية');
  const text = page.ui.menuText();
  assert.match(text, /talk\.ar\.srt/);
  assert.match(text, /5 مقاطع/);
  assert.match(text, /مطابق للأصل ✓/);
  assert.match(text, /التفاصيل الكاملة في المحرّر: افتحه من أيقونة ترجمان أعلى المتصفح\./);
  assert.equal(page.handle.diagnostics().session.imports, 1);
});

test('ملف تالف أو بترميز آخر: رسالة القراءة كما هي (برقم السطر) باقية حتى الإغلاق، ولا تحميل', async () => {
  const page = mountPage();
  page.flows.readResult = () => ({ ok: false, error: { code: 'IM_BAD_TIME', message: messageFor('IM_BAD_TIME', { line: 214 }), line: 214 } });
  click(page.ui.btn('upload'));
  chooseFiles(page.ui, [file('bad.srt')]);
  await settle();
  assert.equal(page.controller.calls.some((c) => c[0] === 'loadArabic'), false);
  assert.deepEqual(page.ui.toasts().map((t) => t.tone), ['error']);
  assert.match(page.ui.toasts()[0].text, /السطر 214/);
});

test('تحذيرات القراءة وملاحظات التنظيف تظهر في قائمة العرض بعد الرفع', async () => {
  const page = mountPage();
  page.flows.readResult = (files) => ({
    ok: true, fileName: files[0].name, cues: AR_CUES, fingerprintId: 'fp_test000001', notes: ['أُزيل سياج ``` حول الملف.'],
    comparison: matched({ notes: ['أُزيل سياج ``` حول الملف.'] }), warnings: [{ code: 'IM_NUMBERING_IRREGULAR', params: { n: 7, prev: 5 } }],
  });
  click(page.ui.btn('upload'));
  chooseFiles(page.ui, [file('x.srt')]);
  await settle();
  const text = page.ui.menuText();
  assert.match(text, /أُزيل سياج/);
  assert.match(text, /الترقيم غير متسلسل: جاء المقطع 7 بعد المقطع 5/);
});

test('مع ترجمة: قائمة العرض بالأوضاع الثلاثة، والمزدوج معطّل بسبب ظاهر دون مسار إنجليزي', () => {
  const page = mountPage({ state: makeState({ arabic: arabic() }) });
  click(page.ui.btn('upload'));
  assert.equal(page.ui.menuOpen(), true);
  const radios = page.ui.menu().querySelectorAll('[role="menuitemradio"]');
  assert.deepEqual(radios.map((r) => r.getAttribute('data-fid')), ['mode:ar', 'mode:dual', 'mode:off']);
  assert.equal(radios[0].getAttribute('aria-checked'), 'true');
  assert.equal(radios[1].getAttribute('aria-disabled'), 'true');
  assert.match(radios[1].textContent, /استخرج الإنجليزية لهذا الفيديو أولًا/);
  click(radios[1]);
  assert.equal(page.controller.calls.length, 0, 'المعطّل لا يُطبَّق');
  click(radios[2]);
  assert.deepEqual(page.controller.calls, [['setDisplayMode', 'off']]);
  assert.equal(page.ui.menu().querySelector('[data-fid="mode:off"]').getAttribute('aria-checked'), 'true');
  page.controller.set({ english: { key: 'en|manual', kind: 'manual', lang: 'en', cues: [], source: 'saved' } });
  click(page.ui.menu().querySelector('[data-fid="mode:dual"]'));
  assert.deepEqual(page.controller.calls.at(-1), ['setDisplayMode', 'dual']);
});

test('ملخص المقارنة بلونه: نقص بأرقامه، وتوقيت مختلف، وبلا بصمة', () => {
  const p1 = mountPage({ state: makeState({ arabic: arabic({ comparison: matched({ matched: false, missing: [57, 58, 201], countTarget: 2 }) }) }) });
  click(p1.ui.btn('upload'));
  const s1 = p1.ui.menu().querySelector('.summary');
  assert.equal(s1.textContent, '3 مقاطع ناقصة: 57، 58، 201');
  assert.equal(s1.getAttribute('data-tone'), 'warn');
  const p2 = mountPage({ state: makeState({ arabic: arabic({ comparison: matched({ matched: false, drift: Array.from({ length: 12 }, (_, i) => ({ n: i + 1, startDeltaMs: 300, endDeltaMs: 300 })) }) }) }) });
  click(p2.ui.btn('upload'));
  assert.equal(p2.ui.menu().querySelector('.summary').textContent, 'توقيت مختلف في 12 مقطعًا');
  const p3 = mountPage({ state: makeState({ arabic: arabic({ comparison: null }) }) });
  click(p3.ui.btn('upload'));
  assert.equal(p3.ui.menu().querySelector('.summary').textContent, 'لا بصمة للمقارنة؛ عُرض الملف كما هو.');
});

test('استبدال الملف: منتقٍ، ثم فحص، ثم تأكيد داخل المشغّل بالملخص الجديد وتنبيه تصفير الإزاحة، ثم التحميل بالاستبدال', async () => {
  const page = mountPage({ state: makeState({ arabic: arabic(), view: { displayOffsetMs: 1500, displayMode: 'ar' } }) });
  click(page.ui.btn('upload'));
  let opened = 0;
  page.ui.fileInput().addEventListener('click', () => opened++);
  click(page.ui.item('استبدال الملف…'));
  assert.equal(opened, 1);
  page.flows.readResult = (files) => ({ ok: true, fileName: files[0].name, cues: AR_CUES.slice(0, 4), comparison: matched({ matched: false, missing: [5], countTarget: 4 }), fingerprintId: 'fp_test000001', notes: [], warnings: [] });
  chooseFiles(page.ui, [file('new.ar.srt')]);
  await settle();
  assert.equal(page.ui.menuLabel(), 'استبدال الترجمة؟');
  const text = page.ui.menuText();
  assert.match(text, /new\.ar\.srt/);
  assert.match(text, /4 مقاطع/);
  assert.match(text, /مقطع واحد ناقص: 5/);
  assert.match(text, /ستُصفَّر إزاحة العرض لأن الملف الجديد يحمل توقيته\./);
  assert.equal(page.controller.calls.some((c) => c[0] === 'loadArabic'), false, 'لا شيء قبل التأكيد');
  click(page.ui.item('استبدال'));
  await settle();
  const load = page.controller.calls.find((c) => c[0] === 'loadArabic');
  assert.deepEqual(load[2], { replace: true });
  assert.equal(page.controller.getState().view.displayOffsetMs, 0);
  assert.equal(page.ui.menuLabel(), 'الترجمة العربية');
  assert.match(page.ui.toasts().map((t) => t.text).join(), /صُفّرت إزاحة العرض لأن الملف الجديد يحمل توقيته\./, 'إشعار المتحكم رسالة عابرة');
});

test('إلغاء الاستبدال يعيد قائمة العرض ولا يحمّل شيئًا؛ وإعادة الضغط على الرفع تغلقها', async () => {
  const page = mountPage({ state: makeState({ arabic: arabic() }) });
  click(page.ui.btn('upload'));
  click(page.ui.item('استبدال الملف…'));
  chooseFiles(page.ui, [file('new.ar.srt')]);
  await settle();
  assert.equal(page.ui.menuLabel(), 'استبدال الترجمة؟');
  assert.equal(page.ui.menuText().includes('ستُصفَّر'), false, 'الإزاحة صفر فلا تنبيه');
  click(page.ui.item('إلغاء'));
  assert.equal(page.ui.menuLabel(), 'الترجمة العربية');
  assert.equal(page.controller.calls.some((c) => c[0] === 'loadArabic'), false);
  click(page.ui.btn('upload'));
  assert.equal(page.ui.menuOpen(), false);
});

test('ترجمة أُضيفت من مكان آخر أثناء الفحص (ST_ARABIC_EXISTS): يُطلب التأكيد بدل الاستبدال الصامت', async () => {
  const page = mountPage();
  let release;
  page.flows.readGate = new Promise((r) => (release = r));
  click(page.ui.btn('upload'));
  chooseFiles(page.ui, [file('a.srt')]);
  page.controller.set({ arabic: arabic({ fileName: 'other.srt' }) });
  release();
  await settle();
  await settle();
  assert.equal(page.ui.menuLabel(), 'استبدال الترجمة؟');
  assert.equal(page.controller.calls.filter((c) => c[0] === 'loadArabic').length, 0);
});

test('تبدّل الفيديو أثناء الفحص: لا تحميل لنتيجة الفيديو السابق على الجديد', async () => {
  const page = mountPage();
  let release;
  page.flows.readGate = new Promise((r) => (release = r));
  click(page.ui.btn('upload'));
  chooseFiles(page.ui, [file('a.srt')]);
  page.controller.set({ videoId: 'BBBBBBBBBBB' });
  release();
  await settle();
  await settle();
  assert.equal(page.controller.calls.some((c) => c[0] === 'loadArabic'), false);
  assert.equal(page.ui.menuOpen(), false);
  assert.equal(page.ui.btn('upload').querySelector('.spin').hasAttribute('hidden'), true, 'لا دوّار عالق على الفيديو الجديد');
});

test('إخفاق الحفظ عند التحميل: رسالة المتحكم كما هي', async () => {
  const page = mountPage({ controllerOpts: { loadFails: 'ST_QUOTA_EXCEEDED' } });
  click(page.ui.btn('upload'));
  chooseFiles(page.ui, [file('a.srt')]);
  await settle();
  await settle();
  assert.ok(page.ui.toasts().some((t) => t.tone === 'error' && t.text.includes(messageFor('ST_QUOTA_EXCEEDED'))));
});
