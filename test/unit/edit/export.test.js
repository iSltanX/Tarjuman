// ما يصدّره المحرّر (P8-AC4 وAC5): التوقيت المصدَّر بحسب العقد، والأخطاء تمنع، ولا يتغير شيء مخزَّن.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planArabicExport } from '../../../src/core/edit/index.js';
import { shownTimes, withArabicImport } from '../../../src/core/model/index.js';
import { parseSrtStrict } from '../../../src/core/srt/parser.js';
import { NOW, VIDEO_ID, makeCues, videoRecord } from '../../helpers/fixtures.js';

const cue = (n, startMs, endMs, text = `سطر ${n}`) => ({ n, startMs, endMs, text });

test('الإزاحة صفر: التوقيت المحفوظ دون سؤال، والاسم VIDEOID.ar.srt', () => {
  const cues = makeCues(3);
  const r = planArabicExport({ videoId: VIDEO_ID, lang: 'ar', cues, offsetMs: 0 });
  assert.equal(r.ok, true);
  assert.equal(r.timing, 'saved');
  assert.equal(r.askUser, false);
  assert.equal(r.name, `${VIDEO_ID}.ar.srt`);
  assert.equal(r.count, 3);
  assert.deepEqual(parseSrtStrict(r.text).map((c) => c.startMs), [1000, 3500, 6000]);
});

test('إزاحة غير صفرية: الظاهر افتراضيًا، والمحفوظ فقط باختيار صريح، والسؤال لازم', () => {
  const cues = makeCues(2);
  const shownR = planArabicExport({ videoId: VIDEO_ID, lang: 'ar', cues, offsetMs: 500 });
  assert.equal(shownR.timing, 'shown');
  assert.equal(shownR.askUser, true);
  assert.deepEqual(parseSrtStrict(shownR.text).map((c) => c.startMs), [1500, 4000]);
  const savedR = planArabicExport({ videoId: VIDEO_ID, lang: 'ar', cues, offsetMs: 500, choice: 'saved' });
  assert.equal(savedR.timing, 'saved');
  assert.deepEqual(parseSrtStrict(savedR.text).map((c) => c.startMs), [1000, 3500]);
  assert.deepEqual(cues, makeCues(2), 'لا يتغير المدخل');
});

test('لا تطبيق مزدوج ٤: إزاحة −2 ومقطع أول عند 1ث، تصدير «الظاهر» مرفوض بالمقطع، و«المحفوظ فقط» متاح', () => {
  const cues = makeCues(3, { startMs: 1000 });
  assert.deepEqual(planArabicExport({ videoId: VIDEO_ID, lang: 'ar', cues, offsetMs: -2000 }), { ok: false, code: 'MD_NEGATIVE_TIME', negative: [1] });
  assert.equal(planArabicExport({ videoId: VIDEO_ID, lang: 'ar', cues, offsetMs: -2000, choice: 'saved' }).ok, true);
});

test('لا تطبيق مزدوج ٢: تصدير «الظاهر» ثم استيراد الملف نفسه يصفّر الإزاحة والظاهر كما كان', () => {
  const rec = videoRecord({ offset: 500 });
  const cues = rec.arabic.original;
  const before = cues.map((c) => shownTimes(c, rec.view.displayOffsetMs));
  const file = planArabicExport({ videoId: VIDEO_ID, lang: 'ar', cues, offsetMs: rec.view.displayOffsetMs });
  const { record: back, offsetWas } = withArabicImport(rec, { videoId: VIDEO_ID, fileName: file.name, cues: parseSrtStrict(file.text) }, NOW, { replace: true });
  assert.equal(offsetWas, 500);
  assert.equal(back.view.displayOffsetMs, 0);
  assert.deepEqual(back.arabic.original.map((c) => shownTimes(c, back.view.displayOffsetMs)), before);
});

test('أخطاء التوقيت تمنع التصدير بعددها، دون إصلاح', () => {
  const cues = [cue(1, 1000, 900), cue(2, 2000, 3000)];
  assert.deepEqual(planArabicExport({ videoId: VIDEO_ID, lang: 'ar', cues, offsetMs: 0 }), { ok: false, code: 'ED_EXPORT_HAS_ERRORS', count: 1 });
  const drafts = new Map([['1:start', 'x']]);
  assert.deepEqual(planArabicExport({ videoId: VIDEO_ID, lang: 'ar', cues: makeCues(2), offsetMs: 0, drafts }), { ok: false, code: 'ED_EXPORT_HAS_ERRORS', count: 1 });
});

test('التداخل والنص الفارغ يمنعان التصدير بأرقام المقاطع (لا يُكتب SRT سليم منهما)', () => {
  const cues = [cue(1, 0, 1500), cue(2, 1400, 3000), cue(3, 4000, 5000, '')];
  assert.deepEqual(planArabicExport({ videoId: VIDEO_ID, lang: 'ar', cues, offsetMs: 0 }), { ok: false, code: 'ED_EXPORT_BLOCKED', list: [1, 3] });
});

test('الأصل المستورد يُصدَّر باسمه، والأرقام تُكتب من 1', () => {
  const cues = [cue(5, 1000, 2000), cue(9, 3000, 4000)];
  const r = planArabicExport({ videoId: VIDEO_ID, lang: 'ar', cues, offsetMs: 0, variant: 'original' });
  assert.equal(r.name, `${VIDEO_ID}.ar.original.srt`);
  assert.deepEqual(parseSrtStrict(r.text).map((c) => c.n), [1, 2]);
});

test('معرّف غير صالح أو ملف بلا مقاطع: رمز واضح بلا استثناء', () => {
  assert.equal(planArabicExport({ videoId: 'bad', cues: makeCues(1), offsetMs: 0 }).code, 'TJ_BAD_VIDEO_ID');
  assert.equal(planArabicExport({ videoId: VIDEO_ID, lang: 'ar', cues: [], offsetMs: 0 }).code, 'ST_NO_RECORD');
});

test('الفكرة ١١: الصيغة والمحتوى: WebVTT ومع الأصل بمحاذاة الزمن المحفوظ ثم الإزاحة، وبلا أصل يُصدَّر وحده باسمه، والسهم يُرفض برسالته', () => {
  const cues = makeCues(2);
  const english = makeCues(2, { text: (i) => `line ${i}` });
  const r = planArabicExport({ videoId: VIDEO_ID, lang: 'ar', cues, offsetMs: 500, format: 'vtt', bilingual: true, original: english, sourceLang: 'en' });
  assert.equal(r.ok, true);
  assert.equal(r.name, `${VIDEO_ID}.ar.dual-en.vtt`);
  assert.equal(r.timing, 'shown');
  assert.ok(r.text.startsWith('WEBVTT\n\n1\n00:00:01.500 --> 00:00:03.500\nسطر 1\nline 1\n'), r.text);
  const alone = planArabicExport({ videoId: VIDEO_ID, lang: 'ar', cues, offsetMs: 0, format: 'srt', bilingual: true, original: [], sourceLang: 'en' });
  assert.equal(alone.name, `${VIDEO_ID}.ar.srt`);
  assert.doesNotMatch(alone.text, /line/);
  const arrow = planArabicExport({ videoId: VIDEO_ID, lang: 'ar', cues: [cue(1, 1000, 2000, 'أ --> ب')], offsetMs: 0, format: 'vtt' });
  assert.equal(arrow.ok, false);
  assert.equal(arrow.code, 'EX_TEXT_BREAKS_VTT');
  assert.match(arrow.message, /1/);
  assert.equal(planArabicExport({ videoId: VIDEO_ID, lang: 'ar', cues, offsetMs: 0, format: 'ass' }).code, 'MD_INVALID');
});
