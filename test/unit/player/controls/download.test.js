// قائمة التحميل وتدفقه (P6-AC4، وP12-AC4 وP12-AC8 الجزء الآلي، وجولة الصقل، وAA3 لوحة 10): حالة المسار الملتقط، واختيار المسار
// والوضع، و«تنزيل الملف» وحده فوق وحدات P3 وP10 (convertCaptured ← buildExport ← saveFile لكل ملف ← recordExport) بسطر نتيجته،
// وسطر «تعليمات الترجمة من نافذة الإضافة» مكان زر النسخ (AA3)، والمسارات الأخرى في الفيديو بخطوات اختيارها من يوتيوب (ق١)،
// والتقسيم الاحتياطي عند الجمل أو الصمت بأحجام أجزائه، ورسالة واضحة لكل حالة خاصة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messageFor } from '../../../../src/core/errors/index.js';
import { PREVIEW_MS } from '../../../../src/player/controls/session.js';
import { LABELS } from '../../../../src/player/controls/text.js';
import { click, makeState, mountPage, settle, trackInfo } from './harness.js';

const DL = 'تنزيل الملف';
// اسم الملف في «نُزّل» معزول LTR (تدقيق 7a66f91، C6، U49).
const named = (name) => `نُزّل ${String.fromCodePoint(0x2066)}${name}${String.fromCodePoint(0x2069)}`;
const open = (page) => {
  click(page.ui.btn('download'));
  assert.equal(page.ui.menuOpen(), true);
  assert.equal(page.ui.menuLabel(), 'تنزيل الأصل');
};
const lines = (page) => page.ui.menu().querySelectorAll('.line').map((l) => [l.getAttribute('data-fid'), l.getAttribute('data-tone'), l.textContent]);
const withTrack = (over = {}) => mountPage({ state: makeState({ captured: [trackInfo()], ...over }) });

test('لم يُلتقط مسار: إرشاد لتفعيل CC واختيار English، و«لماذا؟» يكشف سطري الشرح، ولا زر تنزيل', () => {
  const page = mountPage();
  open(page);
  assert.match(page.ui.menuText(), /فعّل ترجمة يوتيوب \(CC\) واختر اللغة التي تريدها، ثم افتح هذه القائمة\./);
  assert.ok(page.ui.item(DL) === null);
  assert.equal(page.ui.menuText().includes('لا يرسل أي طلب'), false);
  click(page.ui.item('لماذا؟'));
  assert.match(page.ui.menuText(), /ترجمان يقرأ الترجمة التي يجلبها المشغّل لك، ولا يرسل أي طلب من عنده\./);
  assert.equal(page.ui.item('لماذا؟').getAttribute('aria-expanded'), 'true');
  assert.equal(page.ui.menuText().includes('CC ثم الإعدادات'), false, 'الخطوات لرفض المسار وحده');
});

test('رفض مسار (قديم أو مستقبلي): رسالته وحدها، وخلف «لماذا؟» خطوات اختيار لغة من يوتيوب بسطر عام، وملاحظة Brave في Brave وحده (ت-٩)', () => {
  for (const code of ['EX_NOT_ENGLISH', 'EX_TRANSLATED_TRACK']) {
    const chrome = mountPage({ state: makeState({ captureIssue: { code, at: 1 } }) });
    open(chrome);
    const alert = chrome.ui.menu().querySelector('.alert');
    assert.ok(alert.textContent.includes(messageFor(code)));
    assert.ok(alert.querySelector('.steps') === null, 'الخطوات خلف «لماذا؟»');
    click(chrome.ui.item('لماذا؟'));
    assert.equal(chrome.ui.menu().querySelector('[data-fid="otherLangs"] .steps').textContent, 'لاختيار لغة أخرى: CC ثم الإعدادات ثم «الترجمة» ثم اللغة التي تريدها');
    assert.ok(chrome.ui.menu().querySelector('.note-in') === null, 'لا ملاحظة Brave في Chrome');
  }
  const brave = mountPage({ state: makeState({ captureIssue: { code: 'EX_NOT_ENGLISH', at: 1 } }), brave: true });
  open(brave);
  click(brave.ui.item('لماذا؟'));
  assert.equal(brave.ui.menu().querySelector('.note-in').textContent, 'في Brave قد تظهر لغة المتصفح أولًا؛ فاختر اللغة التي تريدها من قائمة الترجمة في يوتيوب.');
});

test('لغات الفيديو الأخرى (ق١، قرار سلطان 2026-11-07): سطر واحد بعددها وخطوات اختيارها من يوتيوب، لا صف لكل مسار ولا زر يبدّله', () => {
  // en يدوي ملتقط، وen تلقائي ليس لغة أخرى، وes وja لغتان أخريان.
  const available = { videoId: 'AAAAAAAAAAA', tracks: [{ lang: 'en', kind: 'manual', name: 'English' }, { lang: 'en', kind: 'asr', name: null }, { lang: 'es', kind: 'manual', name: 'Español' }, { lang: 'ja', kind: 'asr', name: null }], translatable: true };
  const page = mountPage({ state: makeState({ captured: [trackInfo()], available }) });
  open(page);
  const menu = page.ui.menu();
  assert.equal(menu.querySelectorAll('.row.available').length, 0, 'لا صف لكل مسار');
  const note = menu.querySelector('[data-fid="otherLangs"]');
  assert.equal(note.getAttribute('data-count'), '2');
  assert.equal(note.querySelector('.steps').textContent, `في هذا الفيديو لغتان أخريان. لاختيار إحداها: ${LABELS.pickSteps}`);
  assert.equal(note.querySelector('button'), null, 'لا تبديل من الإضافة');
  assert.equal(page.ui.menuText().includes('Español'), false, 'ولا أسماء المسارات');
  assert.equal(page.ui.menuText().includes(LABELS.machineSteps), false, 'الترجمة الآلية بلا التقاط وحده');
  // بلا التقاط: عدد كل لغات الفيديو في سطر «فعّل CC» نفسه (القرار ٢٩)، وخطوات الاختيار بلا عدد وخطوات ترجمة يوتيوب الآلية حين
  // يتيحها خلف «لماذا؟» (ت-٩).
  const none = mountPage({ state: makeState({ available }) });
  open(none);
  assert.ok(none.ui.menuText().includes('في هذا الفيديو 3 لغات: فعّل ترجمة يوتيوب (CC) واختر إحداها، ثم افتح هذه القائمة.'));
  assert.equal(none.ui.menu().querySelector('[data-fid="otherLangs"]'), null, 'خلف «لماذا؟»');
  click(none.ui.item('لماذا؟'));
  const n2 = none.ui.menu().querySelector('[data-fid="otherLangs"]');
  assert.equal(n2.getAttribute('data-count'), '3');
  assert.equal(n2.querySelector('.steps').textContent, `لاختيار إحداها: ${LABELS.pickSteps}`);
  assert.ok(n2.textContent.includes(LABELS.machineSteps));
  // قائمة الفيديو غير معروفة بعد مسار ملتقط: الخطوات وحدها؛ ولا لغة أخرى معروفة: لا سطر.
  const unknown = mountPage({ state: makeState({ captured: [trackInfo()] }) });
  open(unknown);
  assert.equal(unknown.ui.menu().querySelector('[data-fid="otherLangs"] .steps').textContent, `لاختيار لغة أخرى: ${LABELS.pickSteps}`);
  const only = mountPage({ state: makeState({ captured: [trackInfo()], available: { ...available, tracks: available.tracks.slice(0, 2), translatable: false } }) });
  open(only);
  assert.equal(only.ui.menu().querySelector('[data-fid="otherLangs"]'), null);
  // وفي Brave ملاحظته مع سطر اللغات.
  const brave = mountPage({ state: makeState({ captured: [trackInfo()], available }), brave: true });
  open(brave);
  assert.equal(brave.ui.menu().querySelector('[data-fid="otherLangs"] .note-in').textContent, LABELS.braveNote);
});

test('ترجمة يوتيوب الآلية الملتقطة موسومة بلغة أصلها وفي آخر القائمة، ولا تُختار افتراضيًا (ق٢)', () => {
  const page = mountPage({ state: makeState({ captured: [trackInfo({ key: 'ar|asr|en', lang: 'ar', kind: 'asr', via: 'en', cueCount: 30 }), trackInfo({ key: 'en|asr', kind: 'asr', cueCount: 30 })] }) });
  open(page);
  const radios = page.ui.menu().querySelectorAll('button.item[role="radio"]');
  assert.deepEqual(radios.map((r) => r.textContent), ['الإنجليزية · تلقائية · 30 مقطعًا', 'العربية · مترجمة آليًا من يوتيوب عن الإنجليزية · 30 مقطعًا']);
  assert.equal(radios[0].getAttribute('aria-checked'), 'true');
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
  assert.equal(page.ui.field('mode:normal').getAttribute('title'), 'مقاطع قصيرة قريبة من تقسيم يوتيوب، للتزامن الأدق مع الكلام', 'الشرح في التلميح');
  assert.match(text, /آخر ترجمة عند 12:40 والفيديو 18:05؛ قد يكون النص ناقصًا\./);
  const dl = page.ui.item(DL);
  assert.equal(dl.className, 'primary');
  assert.equal(dl.getAttribute('aria-label'), null, 'اسم الوصول هو النص الظاهر (ومنه «جارٍ التنزيل…»)');
  assert.equal(dl.getAttribute('aria-description'), 'ملف الأصل (SRT) وحده');
  // تعليمات الترجمة من نافذة الإضافة (AA3، لوحة 10): لا زر نسخ في المشغّل، وسطر يدل عليها.
  assert.ok(page.ui.field('copy') === null, 'لا زر نسخ');
  assert.equal(page.ui.menu().querySelectorAll('button').filter((b) => /نسخ/.test(b.textContent)).length, 0);
  assert.equal(page.ui.field('instructionsNote').textContent, 'انسخ تعليمات الترجمة من نافذة الإضافة.');
  assert.equal(dl.parentNode.className, 'actions');
  click(page.ui.item('مقاطع أطول'));
  assert.equal(page.ui.field('mode:long').getAttribute('title'), 'يدمج المقاطع المتجاورة في جمل أطول ليفهم النموذج السياق، فيتغير عدد المقاطع وترقيمها وحدود توقيتها');
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
  // قبل التنزيل قياس طول الملف وحده (ف4: 412 مقطعًا فوق حد 200)، ثم التحويل والبصمة.
  const names = page.controller.calls.map((c) => c[0]);
  assert.deepEqual(names.slice(-2), ['convertCaptured', 'recordExport']);
  assert.ok(names.slice(0, -2).every((x) => x === 'convertCaptured'));
  assert.deepEqual(page.controller.calls.at(-2), ['convertCaptured', 'en|manual', 'long']);
  const spec = page.flows.built[0];
  assert.equal(spec.videoId, 'AAAAAAAAAAA');
  assert.equal(spec.title, 'محاضرة');
  assert.equal(spec.mode, 'long');
  assert.equal(spec.split, null);
  assert.equal(spec.track.cues[0].startMs, 1000, 'المقاطع كما أعطاها المتحكم: لا إزاحة فيها (+3 ث مهملة)');
  assert.deepEqual(page.flows.downloads, [{ name: 'AAAAAAAAAAA.en.manual.long.srt', hasDoc: true }]);
  assert.deepEqual(page.controller.calls.at(-1)[1], { trackKey: 'en|manual', fingerprint: { id: 'fp_new0000001', mode: 'long', parts: null } });
  assert.deepEqual(lines(page), [['saveLine', 'ok', named('AAAAAAAAAAA.en.manual.long.srt')]]);
  assert.ok(page.ui.menu().querySelector('[data-fid="saveLine"] svg.glyph'), 'رمز النجاح SVG');
  assert.equal(page.ui.toasts().length, 0, 'النتيجة في القائمة لا رسالة فوق الفيديو');
  assert.equal(page.handle.diagnostics().session.downloads, 1);
  assert.equal('copies' in page.handle.diagnostics().session, false, 'لا نسخ في المشغّل');
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

test('التقسيم تحت «تقسيم الملفات الطويلة»: مفتوح للملف الطويل دون تفعيله (ف4)، عند الجمل أو الصمت، بأحجام الأجزاء قبل التنزيل، والتحقق، وحفظ كل جزء', async () => {
  const page = withTrack();
  open(page);
  assert.equal(page.ui.menuText().includes('تقسيم الملف إلى أجزاء'), true, 'مفتوح: 412 مقطعًا فوق حد 200');
  assert.equal(page.ui.field('split').checked, false, 'دون تفعيل التقسيم');
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
  assert.deepEqual(rows, ['الجزء 1 · المقاطع 1–2 · 3 أحرف', 'الجزء 2 · المقاطع 3–4 · 6 أحرف', 'الجزء 3 · المقاطع 5–6 · 9 أحرف']);
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
  if (page.ui.item('تقسيم الملفات الطويلة').getAttribute('aria-expanded') !== 'true') click(page.ui.item('تقسيم الملفات الطويلة'));
  const check = page.ui.field('split');
  check.checked = true;
  check.dispatchEvent({ type: 'change', target: check });
  click(page.ui.item(DL));
  await settle();
  assert.equal(page.flows.downloads.length, 1);
  assert.deepEqual(lines(page)[0], ['saveLine', 'ok', named('AAAAAAAAAAA.en.manual.normal.part1of3.srt')]);
  assert.ok(page.ui.menuText().includes(messageFor('SV_CANCELLED')));
});

test('تبدّل الفيديو أثناء الحفظ: لا بصمة تُحفظ للفيديو الجديد، والقائمة تُغلق، وتنبيه في الصفحة الجديدة أن البصمة لم تُحفظ (ع-٦)', async () => {
  const page = withTrack();
  open(page);
  page.flows.onSave = () => page.controller.set({ videoId: 'BBBBBBBBBBB', captured: [] });
  click(page.ui.item(DL));
  await settle();
  assert.equal(page.flows.downloads.length, 1, 'الملف نُزّل');
  assert.equal(page.controller.calls.some((c) => c[0] === 'recordExport'), false);
  assert.equal(page.ui.menuOpen(), false);
  assert.deepEqual(page.ui.toasts().map((t) => t.tone), ['warning'], 'تنبيه باقٍ حتى يُغلق');
  assert.equal(page.ui.toasts()[0].text.includes(messageFor('CT_FINGERPRINT_VIDEO_CHANGED')), true);
  // وأُلغي حوار الحفظ وقد تبدّل الفيديو: لم ينزل شيء، فلا تنبيه.
  const cancelled = withTrack();
  open(cancelled);
  cancelled.flows.saveResults = [{ ok: false, code: 'SV_CANCELLED' }];
  cancelled.flows.onSave = () => cancelled.controller.set({ videoId: 'BBBBBBBBBBB', captured: [] });
  click(cancelled.ui.item(DL));
  await settle();
  assert.equal(cancelled.flows.downloads.length, 0);
  assert.equal(cancelled.ui.toasts().length, 0);
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
  assert.equal(page.ui.menu().querySelector('.title').textContent, 'تنزيل الأصل');
  assert.equal(page.ui.menuLabel(), 'تنزيل الأصل');
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
