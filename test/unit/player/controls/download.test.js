// قائمة التحميل وتدفقه (P6-AC4 الجزء الآلي): حالة المسار الملتقط، واختيار المسار والوضع، وتنزيل SRT فوق وحدات P3
// (convertCaptured ← buildExport ← download لكل ملف ← recordExport)، و«نسخ تعليمات الترجمة» بما يعيده buildExport دون
// عرضه، والتقسيم الاحتياطي المطوي، ورسالة واضحة لكل حالة خاصة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messageFor } from '../../../../src/core/errors/index.js';
import { DONE_MS, TOAST_MS } from '../../../../src/player/controls/session.js';
import { INSTRUCTIONS, click, makeState, mountPage, settle, trackInfo } from './harness.js';

const open = (page) => {
  click(page.ui.btn('download'));
  assert.equal(page.ui.menuOpen(), true);
  assert.equal(page.ui.menuLabel(), 'تحميل الترجمة');
};

test('لم يُلتقط مسار: إرشاد لتفعيل CC واختيار English، و«لماذا؟» يكشف سطري الشرح، ولا زر تنزيل', () => {
  const page = mountPage();
  open(page);
  assert.match(page.ui.menuText(), /فعّل الترجمة \(CC\) واختر English، ثم افتح هذه القائمة\./);
  assert.equal(page.ui.item('تنزيل SRT'), null);
  assert.equal(page.ui.menuText().includes('لا يرسل أي طلب'), false);
  click(page.ui.item('لماذا؟'));
  assert.match(page.ui.menuText(), /ترجمان يقرأ الترجمة التي يجلبها المشغّل لك، ولا يرسل أي طلب من عنده\./);
  assert.equal(page.ui.item('لماذا؟').getAttribute('aria-expanded'), 'true');
});

test('رفض الالتقاط أو مسار تالف أو بث جارٍ: رسالة المجال نفسها (messageFor) وما يمكن فعله', () => {
  const p1 = mountPage({ state: makeState({ captureIssue: { code: 'EX_TRANSLATED_TRACK', at: 1 } }) });
  open(p1);
  assert.ok(p1.ui.menuText().includes(messageFor('EX_TRANSLATED_TRACK')));
  const p2 = mountPage({ state: makeState({ captured: [trackInfo({ ok: false, code: 'EX_EMPTY_BODY', cueCount: 0 })] }) });
  open(p2);
  assert.ok(p2.ui.menuText().includes(messageFor('EX_EMPTY_BODY')));
  assert.equal(p2.ui.item('تنزيل SRT'), null);
  const p3 = mountPage();
  p3.env.doc.querySelector('#movie_player').appendChild(Object.assign(p3.env.doc.createElement('div'), { className: 'ytp-live-badge' }));
  p3.env.doc.defaultView.getComputedStyle = () => ({ display: 'inline-block' });
  p3.env.win.advance(1100);
  open(p3);
  assert.ok(p3.ui.menuText().includes(messageFor('EX_LIVE')));
});

test('مسار واحد: سطر الحالة بوصفه، ووضع التصدير من الإعدادات بشرحه، وتحذير النقص بالزمنين', () => {
  const page = mountPage({ state: makeState({ captured: [trackInfo({ warnings: ['EX_MAYBE_INCOMPLETE'], lastEndMs: 760000 })] }) });
  open(page);
  const text = page.ui.menuText();
  assert.match(text, /English – يدوي، 412 مقطعًا✓/);
  assert.match(text, /مقاطع كما في يوتيوب، للتزامن الأدق\./);
  assert.match(text, /آخر ترجمة عند 12:40 والفيديو 18:05؛ قد يكون النص ناقصًا\./);
  click(page.ui.item('مقاطع أطول'));
  assert.match(page.ui.menuText(), /جمل أطول ليفهم النموذج السياق، بالترقيم والتوقيت نفسيهما\./);
  assert.equal(page.ui.item('مقاطع أطول').getAttribute('aria-checked'), 'true');
});

test('أكثر من مسار: قائمة اختيار (اليدوي أولًا)، والتنزيل للمختار', async () => {
  const page = mountPage({ state: makeState({ captured: [trackInfo({ key: 'en|asr', kind: 'asr', cueCount: 600 }), trackInfo()] }) });
  open(page);
  const radios = page.ui.menu().querySelectorAll('[role="menuitemradio"]');
  assert.deepEqual(radios.map((r) => r.textContent), ['English – يدوي، 412 مقطعًا', 'English – تلقائي، 600 مقطع']);
  assert.equal(radios[0].getAttribute('aria-checked'), 'true');
  click(radios[1]);
  click(page.ui.item('تنزيل SRT'));
  await settle();
  assert.equal(page.flows.built[0].track.key, 'en|asr');
  assert.equal(page.flows.built[0].track.kind, 'asr');
});

test('تنزيل SRT: التحويل بالوضع ثم البناء ثم التنزيل ثم البصمة، ونجاح ظاهر على الزر لثانيتين', async () => {
  const page = mountPage({ state: makeState({ captured: [trackInfo()], view: { displayOffsetMs: 3000, displayMode: 'ar' } }) });
  open(page);
  click(page.ui.item('مقاطع أطول'));
  click(page.ui.item('تنزيل SRT'));
  assert.match(page.ui.menuText(), /جارٍ التحقق من النص والتوقيت…/);
  assert.equal(page.ui.btn('download').querySelector('.spin').hasAttribute('hidden'), false, 'دوّار على الزر');
  await settle();
  const names = page.controller.calls.map((c) => c[0]);
  assert.deepEqual(names, ['convertCaptured', 'recordExport']);
  assert.deepEqual(page.controller.calls[0], ['convertCaptured', 'en|manual', 'long']);
  const spec = page.flows.built[0];
  assert.equal(spec.videoId, 'AAAAAAAAAAA');
  assert.equal(spec.title, 'محاضرة');
  assert.equal(spec.mode, 'long');
  assert.equal(spec.split, null);
  assert.equal(spec.track.cues[0].startMs, 1000, 'المقاطع كما أعطاها المتحكم: لا إزاحة فيها (+3 ث مهملة)');
  assert.deepEqual(page.flows.downloads, [{ name: 'AAAAAAAAAAA.en.manual.long.srt', hasDoc: true }]);
  assert.deepEqual(page.controller.calls[1][1], { trackKey: 'en|manual', fingerprint: { id: 'fp_new0000001', mode: 'long' } });
  assert.match(page.ui.menuText(), /✓ نُزّل AAAAAAAAAAA\.en\.manual\.long\.srt/);
  assert.equal(page.handle.diagnostics().session.downloads, 1);
  page.env.win.advance(DONE_MS + 10);
  assert.equal(page.ui.item('تنزيل SRT') !== null, true, 'يعود الزر بعد ثانيتين');
});

test('إخفاق البناء أو التنزيل: رسالة الرمز في القائمة ولا بصمة؛ وإخفاق حفظ البصمة بعد التنزيل يُذكر وحده', async () => {
  const page = mountPage({ state: makeState({ captured: [trackInfo()] }) });
  open(page);
  page.flows.buildError = 'EX_INVARIANT_FAILED';
  click(page.ui.item('تنزيل SRT'));
  await settle();
  assert.ok(page.ui.menuText().includes(messageFor('EX_INVARIANT_FAILED')));
  assert.equal(page.controller.calls.some((c) => c[0] === 'recordExport'), false);
  page.flows.buildError = null;
  page.flows.downloadError = 'EX_DOWNLOAD_FAILED';
  click(page.ui.item('تنزيل SRT'));
  await settle();
  assert.ok(page.ui.menuText().includes(messageFor('EX_DOWNLOAD_FAILED')));
  page.flows.downloadError = null;
  const failing = mountPage({ state: makeState({ captured: [trackInfo()] }), controllerOpts: { recordFails: true } });
  open(failing);
  click(failing.ui.item('تنزيل SRT'));
  await settle();
  assert.equal(failing.flows.downloads.length, 1, 'الملف نُزّل');
  assert.ok(failing.ui.menuText().includes(messageFor('CT_FINGERPRINT_NOT_SAVED')));
});

test('تحذيرات البناء تظهر بعد التنزيل (تقسيم لا يلزم معلومة)', async () => {
  const page = mountPage({ state: makeState({ captured: [trackInfo()] }) });
  page.flows.warnings = ['EX_SPLIT_NOT_NEEDED'];
  open(page);
  click(page.ui.item('تنزيل SRT'));
  await settle();
  assert.ok(page.ui.menuText().includes(messageFor('EX_SPLIT_NOT_NEEDED')));
});

test('التقسيم مطوي تحت «خيارات احتياطية»: الحجم من الإعدادات، والتحقق قبل التنزيل، وتنزيل كل جزء', async () => {
  const page = mountPage({ state: makeState({ captured: [trackInfo()] }) });
  open(page);
  assert.equal(page.ui.menuText().includes('تقسيم الملف'), false, 'مطوي');
  click(page.ui.item('خيارات احتياطية'));
  const check = page.ui.field('split');
  check.checked = true;
  check.dispatchEvent({ type: 'change', target: check });
  assert.equal(page.ui.field('splitSize').value, '200', 'افتراضي الإعدادات');
  page.ui.field('splitSize').value = '7';
  page.ui.field('splitSize').dispatchEvent({ type: 'input', target: page.ui.field('splitSize') });
  click(page.ui.item('تنزيل SRT'));
  await settle();
  assert.equal(page.flows.built.length, 0, 'لا بناء بحجم غير صالح');
  assert.ok(page.ui.menuText().includes(messageFor('CT_SPLIT_INVALID')));
  page.ui.field('splitSize').value = '150';
  page.ui.field('splitSize').dispatchEvent({ type: 'input', target: page.ui.field('splitSize') });
  page.flows.parts = 3;
  click(page.ui.item('تنزيل SRT'));
  await settle();
  assert.deepEqual(page.flows.built[0].split, { size: 150 });
  assert.equal(page.flows.downloads.length, 3);
  assert.match(page.ui.menuText(), /✓ نُزّل 3 أجزاء/);
  assert.equal(page.controller.calls.filter((c) => c[0] === 'recordExport').length, 1, 'بصمة واحدة للتصدير');
});

test('نسخ تعليمات الترجمة: نص buildExport كما هو إلى الحافظة، ولا يظهر في أي مكان، ورسالة نجاح عابرة', async () => {
  const page = mountPage({ state: makeState({ captured: [trackInfo()] }) });
  open(page);
  click(page.ui.item('نسخ تعليمات الترجمة'));
  await settle();
  assert.deepEqual(page.copied, [INSTRUCTIONS]);
  assert.equal(page.flows.built[0].title, 'محاضرة', 'بعنوان الفيديو الحالي');
  assert.equal(page.flows.downloads.length, 0, 'النسخ لا ينزّل ملفًا');
  assert.equal(page.controller.calls.some((c) => c[0] === 'recordExport'), false);
  const everywhere = [page.ui.menuText(), ...page.ui.toasts().map((t) => t.text), page.ui.tip() ?? '', JSON.stringify(page.handle.diagnostics()), JSON.stringify(page.handle.peek())].join('\n');
  assert.equal(everywhere.includes(INSTRUCTIONS), false, 'النص لا يُعرض');
  assert.deepEqual(page.ui.toasts(), [{ tone: 'success', text: '✓نُسخت تعليمات الترجمة.' }]);
  page.env.win.advance(TOAST_MS + 10);
  assert.deepEqual(page.ui.toasts(), []);
});

test('تعذّر الحافظة: بديل النسخ من حقل مؤقت، وإن فشل فرسالة «أعد المحاولة» باقية حتى الإغلاق', async () => {
  const ok = mountPage({ state: makeState({ captured: [trackInfo()] }), clipboard: 'fail' });
  let copiedByExec = null;
  ok.env.doc.execCommand = (cmd) => {
    copiedByExec = cmd;
    return true;
  };
  open(ok);
  click(ok.ui.item('نسخ تعليمات الترجمة'));
  await settle();
  assert.equal(copiedByExec, 'copy');
  assert.equal(ok.ui.toasts()[0].tone, 'success');
  assert.equal(ok.ui.layerHost().shadowRoot.querySelectorAll('textarea').length, 0, 'الحقل المؤقت أُزيل');

  const bad = mountPage({ state: makeState({ captured: [trackInfo()] }), clipboard: 'none' });
  bad.env.doc.execCommand = () => false;
  open(bad);
  click(bad.ui.item('نسخ تعليمات الترجمة'));
  await settle();
  assert.deepEqual(bad.ui.toasts().map((t) => t.tone), ['error']);
  assert.match(bad.ui.toasts()[0].text, /تعذّر النسخ إلى الحافظة\. أعد المحاولة\./);
  bad.env.win.advance(TOAST_MS * 3);
  assert.equal(bad.ui.toasts().length, 1, 'الخطأ يبقى');
  click(bad.ui.toastClose(0));
  assert.equal(bad.ui.toasts().length, 0);
});

test('تبدّل الفيديو أثناء التنزيل: لا بصمة تُحفظ للفيديو الجديد، والقائمة تُغلق', async () => {
  const page = mountPage({ state: makeState({ captured: [trackInfo()] }) });
  open(page);
  const original = page.controller.recordExport;
  page.flows.exportFlow.download = () => page.controller.set({ videoId: 'BBBBBBBBBBB', captured: [] });
  click(page.ui.item('تنزيل SRT'));
  await settle();
  assert.equal(page.controller.calls.some((c) => c[0] === 'recordExport'), false);
  assert.equal(page.ui.menuOpen(), false);
  void original;
});
