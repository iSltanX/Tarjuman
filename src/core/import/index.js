// تدفق الاستيراد (عقد interfaces §٦): قراءة آمنة لملف أو أجزاء، وتحليل متسامح بملاحظات، ودمج بالأرقام، واختيار البصمة،
// ومقارنة تُرفق بالنتيجة. لا كتابة في التخزين هنا (يتولاها المتحكم أو withArabicImport)، ولا تعديل للتوقيت ولا للنص إلا
// ما يُذكر في notes. الاستعادة اليدوية للتوقيت من src/core/compare ولا يستدعيها هذا التدفق أبدًا.
import { DEFAULT_DRIFT_MS, compare, currentComparison, fingerprintCoverage } from '../compare/index.js';
import { TjError, messageFor, toErrorInfo } from '../errors/index.js';
import { joinList, t } from '../../i18n/index.js';
import { LIMITS } from '../model/validate.js';
import { langFromFileName } from '../lang/index.js';
import { parseSrtLenient } from '../srt/lenient.js';
import { selectFingerprint } from './fingerprint.js';
import { mergeParts } from './merge.js';
import { MAX_FILES, MAX_FILE_BYTES, readFileText } from './read-file.js';
import { clip, displayName, toList } from './files.js';
import { bilingualCheck, withoutMatchedLines } from './bilingual.js';
import { COUNT_FORMS, formatCount } from '../../ui/format.js';

/** العدد الذي يؤنَّث معه الفعل (3 إلى 10، و103…). @param {number} n */
const isFewCount = (n) => n % 100 >= 3 && n % 100 <= 10;

export { MAX_FILES, MAX_FILE_BYTES, mergeParts, selectFingerprint };
export { applyPatch, applyPatchDetailed, cuesKey, partsStatus, planPatchCues, readPatch } from './patch.js';
export { findContinuation, withContinuation } from './continuation.js';
export { ambiguousMarks, ambiguousNumbers } from './ambiguous.js';
export { REVIEW_THRESHOLDS, classTransitions, reviewIncoming, sameExport, videoIdFromName } from './review.js';
export { bilingualCheck, withoutLastLines, withoutMatchedLines } from './bilingual.js';

const NAMES_NOTE_CHARS = 300;
// تحذير لكل مقطع نهايته ليست بعد بدايته، وما يزيد على هذا الحد يُذكر عدده في تحذير واحد، فلا يبني ملف معيب آلاف الصفوف في تبويب يوتيوب.
const MAX_TIME_WARNINGS = 20;
// «part01of02» بنمط أسماء ترجمان كله، لا «part01» وحده فيبقى «of02» في الاسم (تدقيق 7a66f91، U38).
const PART_MARK = /[._ -]?part[._ -]?\d+(?:of\d+)?/i;

/** اسم الجزء الأول بحسب الأرقام بلا علامة «part N» إن بقي اسم صالح، وإلا كما هو. */
function mergedFileName(order) {
  const stripped = order[0].replace(PART_MARK, '');
  return stripped && !stripped.startsWith('.') ? stripped : order[0];
}

function threshold(settings) {
  const v = settings?.thresholds?.driftMs;
  return Number.isInteger(v) && v >= 10 && v <= 5000 ? v : DEFAULT_DRIFT_MS;
}

/** تحذيرات القراءة بعد حصر صفوف الزمن المعكوس. @param {{ code: string, params?: object }[]} list */
function capTimeWarnings(list) {
  const isTime = (w) => w.code === 'IM_CUE_TIME_NOT_AFTER_START';
  const extra = list.filter(isTime).length - MAX_TIME_WARNINGS;
  if (extra <= 0) return list;
  let seen = 0;
  const kept = list.filter((w) => !isTime(w) || ++seen <= MAX_TIME_WARNINGS);
  return [...kept, { code: 'IM_CUE_TIME_MORE', params: { count: extra } }];
}

/** حدّ النموذج 50 ملاحظة وكل ملاحظة ≤ 500 محرف؛ الفائض يُختصر بملاحظة تذكر عدده. */
function capNotes(notes) {
  const clipped = notes.map((n) => clip(n, LIMITS.maxNoteChars));
  if (clipped.length <= LIMITS.maxNotes) return clipped;
  const kept = clipped.slice(0, LIMITS.maxNotes - 1);
  return [...kept, messageFor('IM_NOTE_MORE', { count: clipped.length - kept.length })];
}

/**
 * @param {File | File[] | FileList} fileOrFiles أكثر من ملف = أجزاء احتياطية تُدمج بالأرقام
 * @param {{ fingerprints?: import('../model/tracks.js').Fingerprint[], settings?: import('../model/settings.js').Settings, lang?: string | null,
 *   originals?: { lang?: string, cues?: import('../model/cue.js').Cue[] }[] }} [opts]
 *   lang لغة الملف التي اختارها المستخدم (AA1/AA3)؛ وبلا اختيار من رمز صريح في اسم الملف، وإلا null. originals مسارات الأصل
 *   المحفوظة للفيديو (record.english) لحارس الملف الثنائي (الفكرة ١١، ح-49)؛ وبلاها لا حارس.
 * @returns {Promise<
 *   { ok: true, fileName: string, cues: import('../model/cue.js').Cue[], comparison: import('../model/tracks.js').ComparisonReport | null,
 *     fingerprintId: string | null, notes: string[], warnings: { code: string, params?: Record<string, string | number> }[],
 *     lang: string | null, ambiguous: number[] | null, bilingual: import('./bilingual.js').Bilingual | null }
 *   ambiguous: أرقام «المواضع الغامضة» التي ذكرها النموذج في سطر بعد الملف (ف6)، أو null
 *   bilingual: الملف مصدَّر «مع الأصل» (IM_BILINGUAL)، تعرضه المراجعة تحذيرًا بزر الإزالة (withoutOriginalLines)، أو null
 *   lang: لغة الملف من رمز صريح في اسمه (talk.ja.srt)، وإلا null «غير محددة» حتى يختارها المستخدم (AA1؛ لا تخمين من النص)
 *   | { ok: false, error: { code: string, message: string, line?: number } }>}
 */
export async function readImport(fileOrFiles, { fingerprints = [], settings, lang: chosen, originals = [] } = {}) {
  let multi = false;
  let current = null;
  try {
    const files = toList(fileOrFiles);
    if (!files.length) throw new TjError('IM_NO_FILE');
    if (files.length > MAX_FILES) throw new TjError('IM_TOO_MANY_FILES', { params: { count: files.length, max: MAX_FILES } });
    multi = files.length > 1;

    const parts = [];
    const notes = [];
    const warnings = [];
    const ambiguous = new Set();
    let total = 0;
    for (const file of files) {
      current = displayName(file);
      const parsed = parseSrtLenient(await readFileText(file));
      for (const n of parsed.ambiguous?.numbers ?? []) ambiguous.add(n);
      // الحد على المجموع أيضًا: كل ملف يجتاز حده وحده، والمدقق يرفض ما فوق 50,000 بعد الدمج.
      total += parsed.cues.length;
      if (total > LIMITS.maxCues) {
        current = null;
        throw new TjError('IM_TOO_MANY_CUES', { params: { max: LIMITS.maxCues } });
      }
      parts.push({ name: current, cues: parsed.cues });
      for (const note of parsed.notes) notes.push(multi ? `«${current}»: ${note}` : note);
      for (const w of parsed.warnings) warnings.push(multi ? { ...w, params: { ...w.params, file: current } } : w);
    }
    current = null;

    let cues = parts[0].cues;
    let fileName = parts[0].name;
    if (multi) {
      const merged = mergeParts(parts);
      if (merged.overlaps.length) {
        const o = merged.overlaps[0];
        if (o.stray) throw new TjError('IM_PARTS_STRAY_NUMBER', { params: { a: o.a, b: o.b, list: joinList(o.stray) } });
        throw new TjError('IM_PARTS_OVERLAP', { params: o });
      }
      for (const gap of merged.gaps) warnings.push({ code: 'IM_PARTS_GAP', params: gap });
      cues = merged.cues;
      fileName = mergedFileName(merged.order);
      const names = joinList(merged.order);
      notes.unshift(messageFor('IM_NOTE_MERGED', {
        verb: t('core.import.mergedVerb', { few: isFewCount(files.length) }),
        files: formatCount(files.length, COUNT_FORMS.file),
        names: names.length > NAMES_NOTE_CHARS ? `${names.slice(0, NAMES_NOTE_CHARS - 1)}…` : names,
      }));
    }

    const fingerprint = selectFingerprint(fingerprints, cues.length);
    const finalNotes = capNotes(notes);
    // رمز الاسم بنص الملف (ع-٨): لا يُقبل إلا إن وافق نصه نص كتابة اللغة.
    const lang = chosen !== undefined ? chosen : langFromFileName(fileName, cues);
    const report = compare(cues, fingerprint, { driftMs: threshold(settings), target: lang });
    // ملاحظات الاستيراد أولًا ثم ما يضيفه المقارن (سبب تعذّر الاستعادة الشاملة).
    const comparison = { ...report, notes: capNotes([...notes, ...report.notes]) };
    // أرقام الغامضة الموجودة في الملف المدموج وحدها (ف6).
    const present = new Set(cues.map((c) => c.n));
    const vague = [...ambiguous].filter((n) => present.has(n)).sort((a, b) => a - b);
    // ح-49: تحذير لا رفض، ولا يُزال شيء هنا.
    const bilingual = bilingualCheck(cues, originals);
    return { ok: true, fileName, cues, comparison, fingerprintId: fingerprint ? fingerprint.id : null, notes: finalNotes, warnings: capTimeWarnings(warnings), lang, ambiguous: vague.length ? vague : null, bilingual };
  } catch (err) {
    const info = toErrorInfo(err);
    const line = err instanceof TjError ? err.params?.line : undefined;
    const error = { code: info.code, message: multi && current ? `«${current}»: ${info.message}` : info.message };
    if (line) error.line = line;
    if (info.code === 'TJ_UNEXPECTED') error.detail = info.detail;
    return { ok: false, error };
  }
}

/**
 * تقرير معاينة الرفع قبل الحفظ (تدقيق Fable، FA-04 = B1؛ بند DS-S2 بقرار سلطان 2026-11-07 بعد تأجيله في Q25 ب): ما تعرضه
 * الأسطح بعد الحفظ (التقرير الحاضر بالمحاذاة، currentComparison عبر trackComparison)، لا تقرير الحفظ بالرقم الذي يبقى وصفًا
 * للملف كما رُفع (عقد data-model §١٠، ويُحفظ كما كان). فملف أُعيد ترقيمه ينقصه المقطع 5 يُعرض «ناقص: 5» قبل الحفظ وبعده، لا
 * «ناقص: 427 · توقيت مختلف في 422» ثم «ناقص: 5». وrenumbered حين قابلت المحاذاة مقاطع بأرقام غير أرقام التصدير، فتقول المعاينة
 * إن المقارنة بالتوقيت. وبثقة محاذاة منخفضة يبقى حكم الرقم كما في currentComparison، وبلا بصمة لا مقارنة.
 * @param {import('../model/cue.js').Cue[]} cues @param {import('../model/tracks.js').Fingerprint | null} fingerprint
 * @param {{ settings?: { thresholds?: { driftMs?: number } }, notes?: string[], target?: string | null }} [o] notes ملاحظات القراءة قبل
 *   ملاحظات المقارن، وtarget لغة الملف لفحص «غير مترجم» (AA1، null لا فحص)
 * @returns {import('../model/tracks.js').ComparisonReport & { renumbered: boolean }}
 */
export function previewComparison(cues, fingerprint, { settings, notes = [], target = null } = {}) {
  const driftMs = threshold(settings);
  const coverage = fingerprint ? fingerprintCoverage(fingerprint, cues) : { ok: false };
  const report = fingerprint ? currentComparison(cues, fingerprint, { driftMs, coverage, target }) : compare(cues, null, { driftMs, target });
  const renumbered = !!coverage.ok && coverage.pairs.some(([i, j]) => fingerprint.cues[i].n !== cues[j].n);
  return { ...report, renumbered, notes: capNotes([...notes, ...report.notes]) };
}

/**
 * «أزل سطر الأصل من كل مقطع» بعد نقرة المستخدم في مراجعة الاستيراد (الفكرة ١١، ح-49): نتيجة readImport بلا سطر الأصل في المقاطع
 * التي طابق فيها (آخر سطر، أو أوله في الثنائي المعكوس: bilingual.line)، وملاحظة IM_NOTE_BILINGUAL_REMOVED بعددها وموضعه (كل تحويل
 * للنص يُذكر في notes)، والمقارنة بالمرجع نفسه من جديد، وstripped عددها وstrippedLine موضعه. وما ليس ثنائيًا يعود كما هو. لا كتابة
 * في التخزين.
 * @template {Extract<Awaited<ReturnType<typeof readImport>>, { ok: true }>} R
 * @param {R} result
 * @param {{ fingerprints?: import('../model/tracks.js').Fingerprint[], settings?: import('../model/settings.js').Settings }} [opts]
 * @returns {R & { stripped?: number, strippedLine?: 'last' | 'first' }}
 */
export function withoutOriginalLines(result, { fingerprints = [], settings } = {}) {
  if (!result?.ok || !result.bilingual) return result;
  const { count, line = 'last' } = result.bilingual;
  const cues = withoutMatchedLines(result.cues, result.bilingual);
  // لغة الملف من اسمه تُقرأ من جديد على نص الترجمة وحده: النص الثنائي (حروف الأصل اللاتينية مع العربية) لا يجتاز فحص الكتابة،
  // فكانت «غير محددة» بعد الإزالة لملف اسمه ID.ar.dual-en.srt (الجولة الحية). واللغة القائمة لا تُستبدل.
  const lang = result.lang ?? langFromFileName(result.fileName, cues);
  const raw = [...result.notes, messageFor('IM_NOTE_BILINGUAL_REMOVED', { count, line })];
  const fingerprint = result.fingerprintId ? fingerprints.find((f) => f.id === result.fingerprintId) ?? null : null;
  const report = compare(cues, fingerprint, { driftMs: threshold(settings), target: lang });
  return { ...result, cues, lang, notes: capNotes(raw), comparison: { ...report, notes: capNotes([...raw, ...report.notes]) }, bilingual: null, stripped: count, strippedLine: line };
}

/**
 * نتيجة readImport بالمرجع الأقرب (R50): ما يقترحه فحص الملف الوارد (reviewIncoming.suggested، بالمحاذاة والأرقام) إن اختلف
 * عن اختيار readImport بالعدد أو الأحدث، فتُعاد المقارنة به. يستعمله المشغّل كما تفعل المحفوظات، فيحفظ السطحان المرجع
 * والتقرير نفسيهما للملف نفسه (P13-AC2؛ تدقيق 5fedcb9، GM-011).
 * @param {Extract<Awaited<ReturnType<typeof readImport>>, { ok: true }>} result
 * @param {string | null | undefined} suggested @param {import('../model/tracks.js').Fingerprint[]} fingerprints
 * @param {{ thresholds?: { driftMs?: number } } | undefined} settings
 */
export function withSuggestedReference(result, suggested, fingerprints, settings) {
  if (!result?.ok || !suggested || suggested === result.fingerprintId) return result;
  const fp = (fingerprints ?? []).find((f) => f.id === suggested);
  if (!fp) return result;
  const report = compare(result.cues, fp, { driftMs: threshold(settings), target: result.lang ?? null });
  return { ...result, fingerprintId: fp.id, comparison: { ...report, notes: capNotes([...result.notes, ...report.notes]) } };
}
