// قائمة التحميل وتدفقه (P6-AC4، وP12-AC4 وP12-AC8 الجزء الآلي، وجولة الصقل): حالة المسار الملتقط، واختيار المسار والوضع،
// وزرّان مستقلان في صف: «تنزيل الملف» فوق وحدات P3 وP10 (convertCaptured ← buildExport ← saveFile لكل ملف ← recordExport) دون
// أي نسخ، و«نسخ التعليمات» وحده دون عرض نصها ولا ملف، ولكلٍّ سطر نتيجته؛ وإشارة القاموس، والتقسيم الاحتياطي عند الجمل أو الصمت
// بأحجام أجزائه، وخطوات اختيار English عند التقاط مسار عربي أو مترجم آليًا، ورسالة واضحة لكل حالة خاصة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messageFor } from '../../../../src/core/errors/index.js';
import { PREVIEW_MS } from '../../../../src/player/controls/session.js';
import { INSTRUCTIONS, click, makeState, mountPage, settle, trackInfo } from './harness.js';

const DL = 'تنزيل الملف';
// اسم الملف في «نُزّل» معزول LTR (تدقيق 7a66f91، C6، U49).
const named = (name) => `نُزّل ${String.fromCodePoint(0x2066)}${name}${String.fromCodePoint(0x2069)}`;
const open = (page) => {
  click(page.ui.btn('download'));
  assert.equal(page.ui.menuOpen(), true);
  assert.equal(page.ui.menuLabel(), 'تحميل الأصل');
};
const lines = (page) => page.ui.menu().querySelectorAll('.line').map((l) => [l.getAttribute('data-fid'), l.getAttribute('data-tone'), l.textContent]);
const withTrack = (over = {}) => mountPage({ state: makeState({ captured: [trackInfo()], ...over }) });

test('لم يُلتقط مسار: إرشاد لتفعيل CC واختيار English، و«لماذا؟» يكشف سطري الشرح، ولا زر تنزيل', () => {
  const page = mountPage();
  open(page);
  assert.match(page.ui.menuText(), /فعّل الترجمة \(CC\) واختر English، ثم افتح هذه القائمة\./);
  assert.ok(page.ui.item(DL) === null);
  assert.equal(page.ui.menuText().includes('لا يرسل أي طلب'), false);
  click(page.ui.item('لماذا؟'));
  assert.match(page.ui.menuText(), /ترجمان يقرأ الترجمة التي يجلبها المشغّل لك، ولا يرسل أي طلب من عنده\./);
  assert.equal(page.ui.item('لماذا؟').getAttribute('aria-expanded'), 'true');
  assert.equal(page.ui.menuText().includes('CC ثم الإعدادات'), false, 'الخطوات لرفض المسار وحده');
});

test('مسار عربي أو مترجم آليًا: رسالته وخطوات اختيار English بسطر، وملاحظة Brave في Brave وحده', () => {
  for (const code of ['EX_NOT_ENGLISH', 'EX_TRANSLATED_TRACK']) {
    const chrome = mountPage({ state: makeState({ captureIssue: { code, at: 1 } }) });
    open(chrome);
    const alert = chrome.ui.menu().querySelector('.alert');
    assert.ok(alert.textContent.includes(messageFor(code)));
    assert.equal(alert.querySelector('.steps').textContent, 'CC ثم الإعدادات ثم «الترجمة» ثم English');
    assert.ok(alert.querySelector('.note-in') === null, 'لا ملاحظة Brave في Chrome');
  }
  const brave = mountPage({ state: makeState({ captureIssue: { code: 'EX_NOT_ENGLISH', at: 1 } }), brave: true });
  open(brave);
  assert.equal(brave.ui.menu().querySelector('.note-in').textContent, 'Brave قد يختار العربية أولًا؛ اختر English مرة');
});

test('رفض آخر أو مسار تالف أو بث جارٍ: رسالة المجال نفسها (messageFor) بلا خطوات', () => {
  const p2 = mountPage({ state: makeState({ captured: [trackInfo({ ok: false, code: 'EX_EMPTY_BODY', cueCount: 0 })] }) });
  open(p2);
  assert.ok(p2.ui.menuText().includes(messageFor('EX_EMPTY_BODY')));
  assert.ok(p2.ui.item(DL) === null);
  const p3 = mountPage();
  p3.env.doc.querySelector('#movie_player').appendChild(Object.assign(p3.env.doc.createElement('div'), { className: 'ytp-live-badge' }));
  p3.env.doc.defaultView.getComputedStyle = () => ({ display: 'inline-block' });
  p3.env.win.advance(1100);
  open(p3);
  assert.ok(p3.ui.menuText().includes(messageFor('EX_LIVE')));
});

test('مسار واحد: سطر الحالة بوصفه، ووضع التصدير من الإعدادات وشرحه في التلميح، وتحذير النقص بالزمنين، والزران المستقلان في صف', () => {
  const page = mountPage({ state: makeState({ captured: [trackInfo({ warnings: ['EX_MAYBE_INCOMPLETE'], lastEndMs: 760000 })] }) });
  open(page);
  const text = page.ui.menuText();
  assert.match(text, /اللغة/);
  assert.match(text, /الإنجليزية · يدوية · 412 مقطعًا/);
  assert.ok(page.ui.menu().querySelector('.row.status svg.glyph'), 'علامة الالتقاط رمز SVG لا محرف');
  assert.equal(page.ui.menu().querySelector('.row.status').getAttribute('data-tone'), 'warn', 'مسار قد يكون ناقصًا: علامة تحذير لا علامة سلامة');
  assert.equal(text.includes('مقاطع كما في يوتيوب'), false, 'لا سطر شرح في المشغّل');
  assert.equal(page.ui.field('mode:normal').getAttribute('title'), 'مقاطع كما في يوتيوب، للتزامن الأدق', 'الشرح في التلميح');
  assert.match(text, /آخر ترجمة عند 12:40 والفيديو 18:05؛ قد يكون النص ناقصًا\./);
  const dl = page.ui.item(DL);
  assert.equal(dl.className, 'primary');
  assert.equal(dl.getAttribute('aria-label'), null, 'اسم الوصول هو النص الظاهر (ومنه «جارٍ التنزيل…»)');
  assert.equal(dl.getAttribute('aria-description'), 'ملف الأصل (SRT) وحده');
  assert.equal(page.ui.field('copy').getAttribute('aria-description'), 'تعليمات الترجمة وحدها، لترفقها مع الملف');
  assert.equal(page.ui.field('copy').className, 'secondary');
  assert.equal(page.ui.field('copy').textContent, 'نسخ التعليمات');
  assert.ok(dl.parentNode === page.ui.field('copy').parentNode, 'الزران في صف واحد');
  assert.equal(dl.parentNode.className, 'actions inline');
  assert.equal(page.ui.menu().querySelectorAll('button').filter((b) => /تنزيل ونسخ/.test(b.textContent)).length, 0, 'لا إجراء مركّب');
  assert.ok(page.ui.menu().querySelector('.tag') === null, 'لا قاموس: لا إشارة');
  click(page.ui.item('مقاطع أطول'));
  assert.equal(page.ui.field('mode:long').getAttribute('title'), 'جمل أطول ليفهم النموذج السياق، بالترقيم والتوقيت نفسيهما');
  assert.equal(page.ui.item('مقاطع أطول').getAttribute('aria-checked'), 'true');
});

test('أكثر من مسار: قائمة اختيار (اليدوي أولًا)، والتنزيل للمختار', async () => {
  const page = mountPage({ state: makeState({ captured: [trackInfo({ key: 'en|asr', kind: 'asr', cueCount: 600 }), trackInfo()] }) });
  open(page);
  const radios = page.ui.menu().querySelectorAll('button.item[role="radio"]');
  assert.deepEqual(radios.map((r) => r.textContent), ['الإنجليزية · يدوية · 412 مقطعًا', 'الإنجليزية · تلقائية · 600 مقطع']);
  assert.equal(radios[0].getAttribute('aria-checked'), 'true');
  click(radios[1]);
  click(page.ui.item(DL));
  await settle();
  assert.equal(page.flows.built[0].track.key, 'en|asr');
  assert.equal(page.flows.built[0].track.kind, 'asr');
});

test('«تنزيل الملف»: الحفظ بـsaveFile ثم البصمة، دون أي نسخ، وسطر نتيجته وحده', async () => {
  const page = withTrack({ view: { displayOffsetMs: 3000, displayMode: 'ar' } });
  open(page);
  click(page.ui.item('مقاطع أطول'));
  const order = [];
  page.flows.onSave = () => order.push(['save', page.copied.length]);
  click(page.ui.item(DL));
  assert.match(page.ui.menuText(), /جارٍ التنزيل…/);
  assert.equal(page.ui.btn('download').querySelector('.load').hasAttribute('hidden'), false, 'دوّار على الزر');
  await settle();
  assert.deepEqual(order, [['save', 0]], 'لا نسخ قبل الحفظ ولا بعده');
  assert.deepEqual(page.copied, [], 'التنزيل لا يكتب في الحافظة');
  assert.equal(page.flows.instructionCalls.length, 0, 'ولا يبني نص التعليمات للحافظة');
  assert.deepEqual(page.controller.calls.map((c) => c[0]), ['convertCaptured', 'recordExport']);
  assert.deepEqual(page.controller.calls[0], ['convertCaptured', 'en|manual', 'long']);
  const spec = page.flows.built[0];
  assert.equal(spec.videoId, 'AAAAAAAAAAA');
  assert.equal(spec.title, 'محاضرة');
  assert.equal(spec.mode, 'long');
  assert.equal(spec.split, null);
  assert.equal(spec.track.cues[0].startMs, 1000, 'المقاطع كما أعطاها المتحكم: لا إزاحة فيها (+3 ث مهملة)');
  assert.deepEqual(page.flows.downloads, [{ name: 'AAAAAAAAAAA.en.manual.long.srt', hasDoc: true }]);
  assert.deepEqual(page.controller.calls[1][1], { trackKey: 'en|manual', fingerprint: { id: 'fp_new0000001', mode: 'long', parts: null } });
  assert.deepEqual(lines(page), [['saveLine', 'ok', named('AAAAAAAAAAA.en.manual.long.srt')]]);
  assert.ok(page.ui.menu().querySelector('[data-fid="saveLine"] svg.glyph'), 'رمز النجاح SVG');
  assert.equal(page.ui.toasts().length, 0, 'النتيجة في القائمة لا رسالة فوق الفيديو');
  assert.equal(page.handle.diagnostics().session.downloads, 1);
  assert.equal(page.handle.diagnostics().session.copies, 0);
});

test('الفعلان مستقلان: تعذّر النسخ لا يمس التنزيل وسطره يعيد المحاولة دون تنزيل، وإلغاء الحفظ لا يخفي نجاح نسخ سابق', async () => {
  const page = withTrack();
  page.env.win.navigator = {};
  page.env.doc.execCommand = () => false;
  open(page);
  click(page.ui.field('copy'));
  await settle();
  assert.deepEqual(lines(page), [['copyLine', 'error', 'تعذّر النسخ — أعد المحاولة']]);
  assert.equal(page.flows.downloads.length, 0, 'النسخ لا ينزّل');
  click(page.ui.item(DL));
  await settle();
  assert.deepEqual(lines(page), [['saveLine', 'ok', named('AAAAAAAAAAA.en.manual.normal.srt')], ['copyLine', 'error', 'تعذّر النسخ — أعد المحاولة']], 'التنزيل لا يمحو سطر النسخ ولا ينسخ');
  const retry = page.ui.menu().querySelector('[data-fid="copyLine"]');
  assert.equal(retry.tagName, 'button');
  page.env.doc.execCommand = () => true;
  click(retry);
  await settle();
  assert.deepEqual(lines(page).at(-1), ['copyLine', 'ok', 'نُسخت التعليمات']);
  assert.equal(page.flows.downloads.length, 1, 'إعادة النسخ لا تنزّل ثانية');

  const cancelled = withTrack();
  cancelled.flows.saveResults = [{ ok: false, code: 'SV_CANCELLED' }];
  open(cancelled);
  click(cancelled.ui.field('copy'));
  await settle();
  click(cancelled.ui.item(DL));
  await settle();
  assert.deepEqual(lines(cancelled), [['saveLine', 'info', messageFor('SV_CANCELLED')], ['copyLine', 'ok', 'نُسخت التعليمات']]);
  assert.deepEqual(cancelled.copied, [INSTRUCTIONS], 'نسخة واحدة من زر النسخ وحده');
  assert.equal(cancelled.controller.calls.some((c) => c[0] === 'recordExport'), false, 'لا بصمة لملف لم يُحفظ');
});

test('إخفاق البناء أو الحفظ: رسالة الرمز في القائمة ولا بصمة؛ والرجوع إلى Blob يُذكر؛ وإخفاق البصمة يُذكر وحده', async () => {
  const page = withTrack();
  open(page);
  page.flows.buildError = 'EX_INVARIANT_FAILED';
  click(page.ui.item(DL));
  await settle();
  assert.ok(page.ui.menuText().includes(messageFor('EX_INVARIANT_FAILED')));
  assert.equal(page.copied.length, 0, 'لا نسخ لتصدير لم يُبنَ');
  assert.equal(page.controller.calls.some((c) => c[0] === 'recordExport'), false);
  page.flows.buildError = null;
  page.flows.saveResults = [{ ok: false, code: 'SV_BAD_FILE' }];
  click(page.ui.item(DL));
  await settle();
  assert.deepEqual(lines(page)[0], ['saveLine', 'error', messageFor('SV_BAD_FILE')]);
  assert.equal(page.handle.diagnostics().session.lastCode, 'SV_BAD_FILE');

  const blob = withTrack();
  blob.flows.saveResults = [{ ok: true, mode: 'blob', downloadId: null }];
  open(blob);
  click(blob.ui.item(DL));
  await settle();
  assert.ok(blob.ui.menuText().includes(messageFor('SV_FALLBACK_BLOB')));
  assert.equal(blob.controller.calls.filter((c) => c[0] === 'recordExport').length, 1);

  const failing = mountPage({ state: makeState({ captured: [trackInfo()] }), controllerOpts: { recordFails: true } });
  open(failing);
  click(failing.ui.item(DL));
  await settle();
  assert.equal(failing.flows.downloads.length, 1, 'الملف نُزّل');
  assert.ok(failing.ui.menuText().includes(messageFor('CT_FINGERPRINT_NOT_SAVED')));
});

test('تحذيرات البناء تظهر بعد التنزيل (تقسيم لا يلزم معلومة)', async () => {
  const page = withTrack();
  page.flows.warnings = ['EX_SPLIT_NOT_NEEDED'];
  open(page);
  click(page.ui.item(DL));
  await settle();
  assert.ok(page.ui.menuText().includes(messageFor('EX_SPLIT_NOT_NEEDED')));
});

test('التقسيم مطوي تحت «خيارات احتياطية»: عند الجمل أو الصمت، بأحجام الأجزاء قبل التنزيل، والتحقق، وحفظ كل جزء', async () => {
  const page = withTrack();
  open(page);
  assert.equal(page.ui.menuText().includes('تقسيم الملف'), false, 'مطوي');
  click(page.ui.item('خيارات احتياطية'));
  const check = page.ui.field('split');
  check.checked = true;
  check.dispatchEvent({ type: 'change', target: check });
  assert.equal(page.ui.field('splitSize').value, '200', 'افتراضي الإعدادات');
  assert.deepEqual(page.flows.built.at(-1).split, { size: 200, by: 'content' }, 'المعاينة بالتقسيم بالمحتوى');
  page.flows.parts = 3;
  page.ui.field('splitSize').value = '150';
  page.ui.field('splitSize').dispatchEvent({ type: 'input', target: page.ui.field('splitSize') });
  page.env.win.advance(PREVIEW_MS + 10);
  const rows = page.ui.menu().querySelectorAll('.row.part').map((r) => r.textContent);
  assert.deepEqual(rows, ['1 · 1–2 · 3 محارف', '2 · 3–4 · 6 محارف', '3 · 5–6 · 9 محارف']);
  assert.equal(page.ui.menu().querySelector('.row.part bdi').getAttribute('dir'), 'ltr');
  page.ui.field('splitSize').value = '7';
  page.ui.field('splitSize').dispatchEvent({ type: 'input', target: page.ui.field('splitSize') });
  page.env.win.advance(PREVIEW_MS + 10);
  assert.equal(page.ui.menu().querySelectorAll('.row.part').length, 0, 'حجم غير صالح: لا أحجام');
  const built = page.flows.built.length;
  click(page.ui.item(DL));
  await settle();
  assert.equal(page.flows.built.length, built, 'لا تنزيل بحجم غير صالح');
  assert.ok(page.ui.menuText().includes(messageFor('CT_SPLIT_INVALID')));
  page.ui.field('splitSize').value = '150';
  page.ui.field('splitSize').dispatchEvent({ type: 'input', target: page.ui.field('splitSize') });
  click(page.ui.item(DL));
  await settle();
  assert.deepEqual(page.flows.built.at(-1).split, { size: 150, by: 'content' });
  assert.equal(page.flows.downloads.length, 3);
  assert.deepEqual(lines(page)[0], ['saveLine', 'ok', 'نُزّل 3 أجزاء']);
  assert.equal(page.controller.calls.filter((c) => c[0] === 'recordExport').length, 1, 'بصمة واحدة للتصدير');
});

test('إلغاء حوار الحفظ في جزء يوقف بقية الأجزاء، ويُذكر ما نُزّل', async () => {
  const page = withTrack();
  page.flows.parts = 3;
  page.flows.saveResults = [{ ok: true, mode: 'ask', downloadId: 1 }, { ok: false, code: 'SV_CANCELLED' }];
  open(page);
  click(page.ui.item('خيارات احتياطية'));
  const check = page.ui.field('split');
  check.checked = true;
  check.dispatchEvent({ type: 'change', target: check });
  click(page.ui.item(DL));
  await settle();
  assert.equal(page.flows.downloads.length, 1);
  assert.deepEqual(lines(page)[0], ['saveLine', 'ok', named('AAAAAAAAAAA.en.manual.normal.part1of3.srt')]);
  assert.ok(page.ui.menuText().includes(messageFor('SV_CANCELLED')));
});

test('«نسخ التعليمات» وحده: نص التعليمات كما هو إلى الحافظة، ولا يظهر في أي مكان، ولا ملف ولا بصمة', async () => {
  const page = withTrack();
  open(page);
  click(page.ui.field('copy'));
  await settle();
  assert.deepEqual(page.copied, [INSTRUCTIONS]);
  assert.equal(page.flows.built[0].title, 'محاضرة', 'بعنوان الفيديو الحالي');
  assert.equal(page.flows.downloads.length, 0, 'النسخ لا ينزّل ملفًا');
  assert.equal(page.controller.calls.some((c) => c[0] === 'recordExport'), false);
  assert.deepEqual(lines(page), [['copyLine', 'ok', 'نُسخت التعليمات']]);
  const everywhere = [page.ui.menuText(), ...page.ui.toasts().map((t) => t.text), page.ui.tip() ?? '', JSON.stringify(page.handle.diagnostics()), JSON.stringify(page.handle.peek())].join('\n');
  assert.equal(everywhere.includes(INSTRUCTIONS), false, 'النص لا يُعرض');
});

test('القاموس المرفق: إشارة «+ القاموس (2)» تحت الزرين، والنسخ بالقاموس، والتنزيل لا ينسخ؛ وغير المرفق بلا إشارة', async () => {
  const terms = [{ source: 'prompt', target: 'موجِّه', note: null }, { source: 'token', target: 'رمز', note: 'وحدة نص' }];
  const page = withTrack({ prefs: { schema: 1, glossary: { attach: true, terms }, review: { maxCps: null }, saveLocation: { mode: 'downloads', folder: 'Tarjuman' } } });
  open(page);
  assert.equal(page.ui.menu().querySelector('.tag').textContent, '+ القاموس (2)');
  click(page.ui.field('copy'));
  await settle();
  click(page.ui.item(DL));
  await settle();
  assert.deepEqual(page.copied, [`${INSTRUCTIONS}+قاموس(2)`], 'نسخة واحدة من زر النسخ، والتنزيل بعده لا ينسخ');
  assert.equal(page.flows.downloads.length, 1);
  assert.strictEqual(page.flows.instructionCalls[0].glossary, terms);
  assert.deepEqual(Object.keys(page.flows.instructionCalls[0]).sort(), ['glossary', 'parts', 'title', 'videoId']);

  const off = withTrack({ prefs: { schema: 1, glossary: { attach: false, terms }, review: { maxCps: null }, saveLocation: { mode: 'downloads', folder: 'Tarjuman' } } });
  open(off);
  assert.ok(off.ui.menu().querySelector('.tag') === null);
  click(off.ui.field('copy'));
  await settle();
  assert.deepEqual(off.copied, [INSTRUCTIONS]);
});

test('تعذّر الحافظة: بديل النسخ من حقل مؤقت داخل الجذر، ثم يُزال', async () => {
  const ok = mountPage({ state: makeState({ captured: [trackInfo()] }), clipboard: 'fail' });
  let copiedByExec = null;
  ok.env.doc.execCommand = (cmd) => {
    copiedByExec = cmd;
    return true;
  };
  open(ok);
  click(ok.ui.field('copy'));
  await settle();
  assert.equal(copiedByExec, 'copy');
  assert.deepEqual(lines(ok), [['copyLine', 'ok', 'نُسخت التعليمات']]);
  assert.equal(ok.ui.layerHost().shadowRoot.querySelectorAll('textarea').length, 0, 'الحقل المؤقت أُزيل');
});

test('تبدّل الفيديو أثناء الحفظ: لا بصمة تُحفظ للفيديو الجديد، والقائمة تُغلق', async () => {
  const page = withTrack();
  open(page);
  page.flows.onSave = () => page.controller.set({ videoId: 'BBBBBBBBBBB', captured: [] });
  click(page.ui.item(DL));
  await settle();
  assert.equal(page.controller.calls.some((c) => c[0] === 'recordExport'), false);
  assert.equal(page.ui.menuOpen(), false);
});

// اسم اللغة من رمز المسار الملتقط نفسه (Intl.DisplayNames بالعربية)، لا نص «الإنجليزية» مكتوب في الشيفرة.
const arName = (code) => new Intl.DisplayNames(['ar'], { type: 'language' }).of(code);
const languageLine = (page) => page.ui.menu().querySelector('[data-fid="language"]');

test('«اللغة»: سطر القائمة يسمّي لغة المسار الفعلية بالعربية من رمزها، ونوعه وعدد مقاطعه، ولا اسم مكتوبًا في الشيفرة', () => {
  assert.equal(arName('en'), 'الإنجليزية');
  assert.notEqual(arName('en-GB'), arName('en'), 'لهجة المنطقة تظهر في اسمها');
  for (const [lang, kind, expected] of [
    ['en', 'manual', `${arName('en')} · يدوية · 412 مقطعًا`],
    ['en-GB', 'manual', `${arName('en-GB')} · يدوية · 412 مقطعًا`],
    ['fr', 'asr', `${arName('fr')} · تلقائية · 412 مقطعًا`],
    ['de', 'manual', `${arName('de')} · يدوية · 412 مقطعًا`],
  ]) {
    const page = mountPage({ state: makeState({ captured: [trackInfo({ lang, kind, key: `${lang}|${kind}` })] }) });
    open(page);
    assert.equal(page.ui.menu().querySelectorAll('.label')[0].textContent, 'اللغة');
    assert.equal(languageLine(page).textContent, expected, lang);
    assert.equal(languageLine(page).textContent.includes('الإنجليزية'), lang === 'en' || lang === 'en-GB', 'لا «الإنجليزية» لمسار بلغة أخرى');
  }
  const fr = mountPage({ state: makeState({ captured: [trackInfo({ lang: 'fr', kind: 'asr', key: 'fr|asr' })] }) });
  open(fr);
  assert.equal(fr.ui.menuText().includes('الإنجليزية'), false, 'ولا في أي موضع آخر من القائمة (ومنها وصف زر التنزيل)');
  assert.equal(languageLine(fr).getAttribute('data-tone'), 'ok');
});

test('«اللغة»: رمز لا يعرفه المتصفح أو غير صالح يبقى كما هو (لا خطأ)، وأكثر من مسار يسمّي كلًّا بلغته', () => {
  const odd = mountPage({ state: makeState({ captured: [trackInfo({ lang: 'xx', key: 'xx|manual' })] }) });
  open(odd);
  assert.equal(languageLine(odd).textContent, 'xx · يدوية · 412 مقطعًا');
  const bad = mountPage({ state: makeState({ captured: [trackInfo({ lang: 'a-b-c', key: 'bad|manual' })] }) });
  open(bad);
  assert.equal(languageLine(bad).textContent, 'a-b-c · يدوية · 412 مقطعًا', 'الرمز غير الصالح كما جاء');
  const many = mountPage({ state: makeState({ captured: [trackInfo({ lang: 'en', kind: 'manual' }), trackInfo({ key: 'fr|asr', lang: 'fr', kind: 'asr', cueCount: 600 })] }) });
  open(many);
  assert.deepEqual(many.ui.menu().querySelectorAll('button.item[role="radio"]').map((r) => r.textContent), [`${arName('en')} · يدوية · 412 مقطعًا`, `${arName('fr')} · تلقائية · 600 مقطع`]);
});

test('عنوان القائمة «تحميل الأصل»، واسم الوصول لها، ولا «تحميل الترجمة» في أي نص منها أو من تلميح زرها', () => {
  const page = withTrack();
  open(page);
  assert.equal(page.ui.menu().querySelector('.title').textContent, 'تحميل الأصل');
  assert.equal(page.ui.menuLabel(), 'تحميل الأصل');
  assert.equal(page.ui.menuText().includes('تحميل الترجمة'), false);
  assert.equal(page.ui.btn('download').getAttribute('aria-label').includes('الترجمة الإنجليزية'), false);
});

test('تنزيل بدأ وحوار الحفظ ما زال مفتوحًا (pending): لا «نُزّل» بل ما ينتظره المستخدم، بلا علامة نجاح', async () => {
  const page = withTrack();
  page.flows.saveResults = [{ ok: true, mode: 'ask', downloadId: 1, pending: true }];
  open(page);
  click(page.ui.item(DL));
  await settle();
  assert.deepEqual(lines(page), [['saveLine', 'info', messageFor('SV_PENDING')]]);
  assert.equal(page.ui.menuText().includes('نُزّل'), false, 'لا ادعاء بتمام الحفظ');
  assert.equal(page.ui.menu().querySelectorAll('.line').filter((l) => l.getAttribute('data-tone') === 'ok').length, 0);
  assert.equal(page.ui.menu().querySelectorAll('.alert').filter((a) => a.textContent.includes(messageFor('SV_PENDING'))).length, 0, 'لا تكرار للرسالة');
});

test('النجاح الكامل وحده يقول «نُزّل»: حفظ تام بنغمة النجاح، وإلغاء أو إخفاق بنغمتهما', async () => {
  const done = withTrack();
  open(done);
  click(done.ui.item(DL));
  await settle();
  assert.deepEqual(lines(done)[0].slice(0, 2), ['saveLine', 'ok']);
  const cancelled = withTrack();
  cancelled.flows.saveResults = [{ ok: false, code: 'SV_CANCELLED' }];
  open(cancelled);
  click(cancelled.ui.item(DL));
  await settle();
  assert.deepEqual(lines(cancelled)[0].slice(0, 2), ['saveLine', 'info']);
  assert.equal(cancelled.ui.menuText().includes('نُزّل'), false);
  const failed = withTrack();
  failed.flows.saveResults = [{ ok: false, code: 'SV_BAD_FILE' }];
  open(failed);
  click(failed.ui.item(DL));
  await settle();
  assert.deepEqual(lines(failed)[0].slice(0, 2), ['saveLine', 'error']);
  assert.equal(failed.ui.menuText().includes('نُزّل'), false);
});
