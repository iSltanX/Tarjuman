// ذهاب وإياب (P4-AC6): تصدير عيّنة حقيقية ← محاكاة ترجمة نموذج بأخطاء معروفة ← readImport ← تقرير مطابق للمتوقع.
// المتوقع مكتوب من الأخطاء المزروعة نفسها لا من شيفرة المقارن. يعمل أولًا على «مصدّر العقد» (صيغة ملف وبصمة data-model
// قبل دمج P3)، وإن وُجدت src/core/export (بعد دمج P3) يُعاد كل سيناريو على تصديرها وبصمتها الحقيقيين.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRestoreTiming, previewRestoreTiming } from '../../../src/core/compare/index.js';
import { messageFor } from '../../../src/core/errors/index.js';
import { readImport } from '../../../src/core/import/index.js';
import { DEFAULT_SETTINGS } from '../../../src/core/model/settings.js';
import { withArabicImport } from '../../../src/core/model/transitions.js';
import { validateVideoRecord } from '../../../src/core/model/video.js';
import { validateComparisonReport } from '../../../src/core/model/tracks.js';
import { parseSrtLenient } from '../../../src/core/srt/lenient.js';
import { formatSrtTime } from '../../../src/core/srt/time.js';
import { fileOf } from '../../fixtures/srt/index.js';
import { NOW, VIDEO_ID, englishTrack, fingerprint, realTrack, videoRecord } from '../../helpers/fixtures.js';

const manual = englishTrack({ kind: 'manual', cues: realTrack('manual').cues });
const asr = englishTrack({ kind: 'asr', cues: realTrack('asr').cues });

// --- مصدّرا الاختبار -----------------------------------------------------------------------------------------

/** نص SRT يحفظ الأرقام كما هي (أجزاء التصدير الاحتياطي ترقيمها مستمر لا يبدأ من 1). */
const srtText = (cues) => cues.map((c) => `${c.n}\n${formatSrtTime(c.startMs)} --> ${formatSrtTime(c.endMs)}\n${c.text}\n`).join('\n');

/** ما يقوله العقد: ملف (أو أجزاء بترقيم مستمر) وبصمة بصيغة data-model §٤. */
function contractExporter(track, { size = null } = {}) {
  if (!size) return { files: [{ name: `${VIDEO_ID}.en.${track.kind}.normal.srt`, text: srtText(track.cues) }], fingerprint: fingerprint({ videoId: VIDEO_ID, track }) };
  const files = [];
  const parts = [];
  for (let i = 0; i < track.cues.length; i += size) {
    const chunk = track.cues.slice(i, i + size);
    parts.push({ index: parts.length + 1, from: chunk[0].n, to: chunk.at(-1).n });
    files.push({ name: `${VIDEO_ID}.en.${track.kind}.normal.part${parts.length}.srt`, text: srtText(chunk) });
  }
  return { files, fingerprint: fingerprint({ videoId: VIDEO_ID, track, parts }) };
}

/** تصدير P3 الحقيقي: غياب الوحدة فشل لا تخطٍّ. */
const p3 = await import('../../../src/core/export/index.js');
const p3Exporter = typeof p3?.buildExport === 'function'
  ? (track, { size = null } = {}) => {
    const out = p3.buildExport({
      videoId: VIDEO_ID, title: 'عينة الذهاب والإياب', track: { key: track.key, lang: track.lang, kind: track.kind, cues: track.cues },
      mode: 'normal', split: size ? { size } : null, now: NOW,
    });
    return { files: out.files, fingerprint: out.fingerprint };
  }
  : null;

// --- محاكاة النموذج ------------------------------------------------------------------------------------------

const arabicOf = (cue) => cue.text.split('\n').map((_, k) => `ترجمة المقطع ${cue.n} سطر ${k + 1}`).join('\n');
const sourceOf = (files) => files.flatMap((f) => parseSrtLenient(f.text).cues).sort((a, b) => a.n - b.n);

/**
 * يترجم نص التصدير سطرًا بسطر ثم يزرع الأخطاء المعروفة. يعيد نص الملف العربي كما يكتبه النموذج.
 * @param {string} exported
 * @param {{ english?: number[], empty?: number[], tags?: number[], drift?: Record<number, [number, number]>, shiftAll?: number,
 *   drop?: number[], renumber?: boolean, extra?: number, fence?: { before: string, after: string }, bom?: boolean, crlf?: boolean }} [faults]
 */
function modelTranslate(exported, { english = [], empty = [], tags = [], drift = {}, shiftAll = 0, drop = [], renumber = false, extra = 0, fence = null, bom = false, crlf = false } = {}) {
  let cues = parseSrtLenient(exported).cues.map((c) => {
    let text = english.includes(c.n) ? c.text : arabicOf(c);
    if (empty.includes(c.n)) text = '';
    if (tags.includes(c.n)) text = `<i>${text}</i>`;
    const [ds, de] = drift[c.n] ?? [0, 0];
    return { n: c.n, startMs: c.startMs + shiftAll + ds, endMs: c.endMs + shiftAll + de, text };
  });
  cues = cues.filter((c) => !drop.includes(c.n));
  if (renumber) cues = cues.map((c, i) => ({ ...c, n: i + 1 }));
  for (let k = 1; k <= extra; k++) {
    const last = cues.at(-1);
    cues.push({ n: last.n + 1, startMs: last.endMs + 500, endMs: last.endMs + 2500, text: `مقطع زائد ${k}` });
  }
  let text = srtText(cues);
  if (fence) text = `${fence.before}\n\n\`\`\`srt\n${text}\`\`\`\n\n${fence.after}\n`;
  if (crlf) text = text.replace(/\n/g, '\r\n');
  return bom ? `\uFEFF${text}` : text;
}

const baseExpected = (fp, countTarget) => ({
  fingerprintId: fp.id, matched: false, countSource: fp.count, countTarget, numbering: 'same', missing: [], extra: [],
  drift: [], empty: [], noArabic: [], restoreTimingAvailable: false, driftThresholdMs: 100, notes: [],
});

// الترجمة عربية كما يختارها المستخدم عند الرفع (AA1: بلا لغة معروفة لا فحص «غير مترجم»).
const doImport = (files, fp) => readImport(files, { fingerprints: [fp], settings: DEFAULT_SETTINGS, lang: 'ar' });

// --- السيناريوهات (تُعاد لكل مصدّر) -------------------------------------------------------------------------

function defineRoundtrip(label, exporter) {
  const exportManual = () => {
    const exp = exporter(manual);
    const source = sourceOf(exp.files);
    assert.equal(source.length, exp.fingerprint.count, 'ملف التصدير وبصمته يتفقان في العدد');
    assert.deepEqual(source.map(({ n, startMs, endMs }) => ({ n, startMs, endMs })), exp.fingerprint.cues, 'ملف التصدير وبصمته يتفقان في الأرقام والأزمنة');
    return { exp, source, fp: exp.fingerprint, text: exp.files[0].text };
  };

  test(`${label}: ترجمة أمينة (427 مقطعًا) ← مطابقة تامة بلا ملاحظات`, async () => {
    const { fp, text, source } = exportManual();
    const r = await doImport(fileOf(modelTranslate(text), `${VIDEO_ID}.ar.srt`), fp);
    assert.equal(r.ok, true);
    assert.deepEqual(r.comparison, { ...baseExpected(fp, source.length), matched: true, restoreTimingAvailable: true });
    assert.deepEqual([r.notes, r.warnings], [[], []]);
    assert.deepEqual(r.cues.map((c) => [c.n, c.startMs, c.endMs]), source.map((c) => [c.n, c.startMs, c.endMs]));
  });

  test(`${label}: أخطاء معروفة معًا ← تقرير مطابق للمتوقع حرفيًا`, async () => {
    const { fp, text, source } = exportManual();
    const at = (n) => source[n - 1];
    assert.ok(/\p{L}/u.test(at(88).text), 'مقطع الإبقاء بالإنجليزية فيه حروف');
    const arabic = modelTranslate(text, {
      drop: [57, 58], drift: { 12: [300, -200] }, empty: [201], english: [88], tags: [5, 6], extra: 2,
      fence: { before: 'Here is the translation:', after: 'Let me know if you need changes.' }, bom: true, crlf: true,
    });
    const r = await doImport(fileOf(arabic, 'ar.srt'), fp);
    assert.equal(r.ok, true);
    assert.deepEqual(r.comparison, {
      ...baseExpected(fp, 427),
      numbering: 'different',
      missing: [57, 58],
      extra: [428, 429],
      drift: [{ n: 12, startDeltaMs: 300, endDeltaMs: -200 }],
      empty: [201],
      noArabic: [88],
      notes: [
        messageFor('IM_NOTE_FENCE'),
        messageFor('IM_NOTE_CHATTER_BEFORE', { count: 1, first: 'Here is the translation:' }),
        messageFor('IM_NOTE_CHATTER_AFTER', { count: 1, first: 'Let me know if you need changes.' }),
        messageFor('IM_NOTE_TAGS', { count: 2 }),
      ],
    });
    assert.deepEqual(r.notes, r.comparison.notes);
    assert.deepEqual(validateComparisonReport(r.comparison), { ok: true });
    assert.equal(r.cues.find((c) => c.n === 5).text, arabicOf(at(5)), 'وسم المائل جُرّد وبقي النص');
    assert.equal(r.cues.find((c) => c.n === 88).text, at(88).text, 'الإنجليزي يبقى كما هو ولا يُصلح');
    assert.equal(r.cues.find((c) => c.n === 201).text, '');
    assert.deepEqual(previewRestoreTiming(r.cues, fp), { available: false, changes: [] });
  });

  test(`${label}: حذف مقطع مع إعادة ترقيم ← العدد مختلف والترقيم متسلسل والانحراف يبدأ عند الموضع`, async () => {
    const { fp, text, source } = exportManual();
    const r = await doImport(fileOf(modelTranslate(text, { drop: [57], renumber: true }), 'ar.srt'), fp);
    const expected = [];
    for (let n = 57; n <= 426; n++) {
      const startDeltaMs = source[n].startMs - source[n - 1].startMs;
      const endDeltaMs = source[n].endMs - source[n - 1].endMs;
      if (Math.abs(startDeltaMs) > 100 || Math.abs(endDeltaMs) > 100) expected.push({ n, startDeltaMs, endDeltaMs });
    }
    assert.ok(expected.length > 300 && expected[0].n === 57, 'العينة الحقيقية تنحرف بعد موضع الحذف');
    assert.deepEqual(r.comparison, { ...baseExpected(fp, 426), missing: [427], drift: expected });
    assert.deepEqual(previewRestoreTiming(r.cues, fp), { available: false, changes: [] }, 'اختلاف العدد يمنع الاستعادة');
  });

  test(`${label}: النموذج أزاح كل الأزمنة ← انحراف شامل، والاستعادة معاينة ثم تطبيق بتأكيد ← مطابقة، والسجل صالح`, async () => {
    const { fp, text, source } = exportManual();
    const r = await doImport(fileOf(modelTranslate(text, { shiftAll: 250 }), 'ar.srt'), fp);
    assert.deepEqual(r.comparison, {
      ...baseExpected(fp, 427),
      restoreTimingAvailable: true,
      drift: source.map((c) => ({ n: c.n, startDeltaMs: 250, endDeltaMs: 250 })),
    });
    assert.deepEqual(r.cues.map((c) => c.startMs), source.map((c) => c.startMs + 250), 'الاستيراد لا يستعيد شيئًا من نفسه');

    const preview = previewRestoreTiming(r.cues, fp);
    assert.equal(preview.available, true);
    assert.equal(preview.changes.length, 427);
    assert.deepEqual(preview.changes[0], { n: 1, from: { startMs: source[0].startMs + 250, endMs: source[0].endMs + 250 }, to: { startMs: source[0].startMs, endMs: source[0].endMs } });
    assert.deepEqual(r.cues.map((c) => c.startMs), source.map((c) => c.startMs + 250), 'المعاينة لا تطبّق');

    const restored = applyRestoreTiming(r.cues, fp);
    const after = await doImport(fileOf(srtText(restored), 'restored.srt'), fp);
    assert.deepEqual(after.comparison, { ...baseExpected(fp, 427), matched: true, restoreTimingAvailable: true });

    const record = videoRecord({ arabic: false, cues: source });
    record.fingerprints = [fp];
    record.english = [{ ...manual, cues: source }];
    const { record: next } = withArabicImport(record, { videoId: VIDEO_ID, ...r }, NOW);
    assert.deepEqual(validateVideoRecord(next, { stored: false }), { ok: true });
  });

  test(`${label}: استيراد الملف الإنجليزي بالخطأ ← مطابق توقيتًا لكن كل مقاطعه بلا حرف عربي`, async () => {
    const { fp, text, source } = exportManual();
    const r = await doImport(fileOf(text, 'english.srt'), fp);
    assert.equal(r.comparison.matched, true);
    assert.equal(r.comparison.noArabic.length, source.filter((c) => /\p{L}/u.test(c.text)).length);
    assert.ok(r.comparison.noArabic.length > 400);
  });

  test(`${label}: تصدير احتياطي مقسَّم (1,066 مقطعًا في 6 أجزاء) ← يُدمج مهما كان ترتيب الاختيار ← مطابقة`, async () => {
    const exp = exporter(asr, { size: 200 });
    assert.equal(exp.files.length, 6);
    assert.equal(exp.fingerprint.parts.length, 6);
    const translate = (f) => fileOf(modelTranslate(f.text), f.name.replace('.en.', '.ar.'));
    const arabicParts = exp.files.map(translate);
    const shuffled = [3, 1, 5, 0, 4, 2].map((i) => arabicParts[i]);
    const r = await doImport(shuffled, exp.fingerprint);
    assert.equal(r.ok, true);
    assert.equal(r.notes.length, 1, 'ملاحظة الدمج وحدها');
    assert.match(r.notes[0], /دُمجت 6 ملفات/);
    assert.deepEqual(r.comparison, { ...baseExpected(exp.fingerprint, 1066), matched: true, restoreTimingAvailable: true, notes: r.notes });
    assert.equal(r.cues.length, 1066);
    assert.deepEqual(r.warnings, []);
    assert.equal(r.fileName.includes('part'), false, r.fileName);
  });

  test(`${label}: جزء ناقص من التصدير المقسَّم ← تحذير فجوة ونقص بأرقامه`, async () => {
    const exp = exporter(asr, { size: 200 });
    const parts = exp.files.map((f) => fileOf(modelTranslate(f.text), f.name.replace('.en.', '.ar.')));
    // الجزء الثالث المحذوف من خطة أجزاء المصدّر نفسه: العقد يفرض الترقيم المستمر لا طولًا ثابتًا للجزء
    // (مصدّر العقد 401..600، وتوزيع P3 المتوازن 357..534).
    const gap = exp.fingerprint.parts[2];
    const len = gap.to - gap.from + 1;
    assert.ok(gap.from > 1 && len >= 1 && len <= 200, JSON.stringify(gap));
    const r = await doImport(parts.filter((_, i) => i !== 2), exp.fingerprint);
    assert.equal(r.ok, true);
    assert.deepEqual(r.warnings.map((w) => [w.code, w.params.from, w.params.to]), [['IM_PARTS_GAP', gap.from, gap.to]]);
    assert.deepEqual(r.comparison.missing, Array.from({ length: len }, (_, i) => gap.from + i));
    assert.deepEqual([r.comparison.countTarget, r.comparison.numbering, r.comparison.matched], [1066 - len, 'different', false]);
  });
}

defineRoundtrip('مصدّر العقد', contractExporter);
defineRoundtrip('تصدير P3 الحقيقي', p3Exporter);
