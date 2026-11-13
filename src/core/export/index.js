// تدفق التصدير (عقد interfaces §٥): وحدة نقية تستهلكها أدوات الشريط (P6) والمحفوظات (P7) والمحرّر (P8).
// الإنجليزي: controller.convertCaptured(key, { mode }) ← buildExport ← download لكل ملف ← controller.recordExport.
// العربي: exportTiming (عقد التوقيت §٥) ← buildArabicExport ← download. لا كتابة في التخزين هنا.
import { TjError, messageFor } from '../errors/index.js';
import { joinList } from '../../i18n/index.js';
import { validateCues } from '../model/cue.js';
import { newFingerprintId, isVideoId, parseTrackKey } from '../model/ids.js';
import { EXPORT_MODES, validateFingerprint } from '../model/tracks.js';
import { assertValid } from '../model/validate.js';
import { sanitizeCues } from '../text/sanitize.js';
import { DEFAULT_TARGET_LANG } from '../model/lang-prefs.js';
import { textHash } from './hash.js';
import { instructions } from './instructions.js';
import { fileName } from './names.js';
import { splitPlan } from './parts.js';
import { assertWritable, verifyReread, verifyRoundTrip, writableArabic, writeSrtFrom } from './write.js';

export { fileName, translationLang } from './names.js';
export { GLOSSARY_LIMITS, glossaryParagraph, instructions, patchInstructions } from './instructions.js';
export { describeTrack, languageLabel, trackLabel } from './describe.js';
export { download, SRT_MIME } from './download.js';
export { CONTENT_SPLIT, UPLOAD_LIMITS, planParts, planPartsByContent, splitPlan } from './parts.js';
export { fnv1a64, textHash } from './hash.js';
export { buildPatchPackage, patchFileName } from './patch.js';
export { buildStudyText, studyTiming, studyTimingNote } from './study.js';
export { buildReviewReport } from './report.js';

const invalid = (what) => new TjError('MD_INVALID', { detail: `تصدير: ${what}` });

/** @param {number | string | Date} now @returns {number} */
function toMs(now) {
  const ms = now instanceof Date ? now.getTime() : typeof now === 'string' ? Date.parse(now) : now;
  if (!Number.isFinite(ms)) throw invalid('now');
  return ms;
}

/**
 * @typedef {{ name: string, text: string, part: { index: number, total: number, from: number, to: number } | null, cueCount: number }} ExportFile
 * part وcueCount إضافتان على العقد (name وtext): تفيدان واجهة الأجزاء ولا يعتمد عليهما غير الواجهات.
 */

/**
 * ملفات SRT الإنجليزية لمسار ملتقط مع بصمته وتعليمات النموذج. المقاطع تأتي جاهزة بالوضع المطلوب من
 * controller.convertCaptured؛ و`mode` هنا يسمّي الملف والبصمة والتعليمات. يرمي TjError برمز واضح.
 * @param {{
 *   videoId: string, title?: string | null,
 *   track: { key: string, lang: string, kind: 'manual' | 'asr', via?: string | null, cues: import('../model/cue.js').Cue[], warnings?: string[] },
 *   target?: string | null,
 *   mode: 'normal' | 'long', split?: { size: number, by?: 'count' | 'content' } | null, now?: number | string | Date, rand?: () => number
 * }} spec title لا يُكتب في أي ملف ولا بصمة (خصوصية)، ويدخل نص التعليمات وحده بوصفه بيانات. split.by (إضافة P11 على العقد):
 *   'count' التوزيع المتوازن القديم (الافتراضي)، و'content' عند حدود الجمل أو الصمت (planPartsByContent).
 * @returns {{ files: ExportFile[], fingerprint: import('../model/tracks.js').Fingerprint, instructions: string, warnings: string[] }}
 */
export function buildExport({ videoId, title = null, track, mode, split = null, now = Date.now(), rand, target = DEFAULT_TARGET_LANG }) {
  if (!isVideoId(videoId)) throw new TjError('TJ_BAD_VIDEO_ID');
  if (!EXPORT_MODES.includes(mode)) throw invalid('mode');
  const parsed = parseTrackKey(track?.key);
  if (!parsed || parsed.lang !== track.lang || parsed.kind !== track.kind || parsed.via !== (track.via ?? null)) throw invalid('track.key');
  if (!Array.isArray(track.cues) || track.cues.length === 0) throw new TjError('EX_NO_TRACK');
  assertValid(validateCues(track.cues, 'track.cues'), 'track.cues');
  // ما حُفظ قبل 2.1.2 (أو قبل توسيع القائمة، ع-١٧) قد يحمل محارف خفية أو تحكم، فلا تصل إلى ملف النموذج. وبصمة النص على المحفوظ
  // كما هو، ليبقى ملف الاستكمال مطابقًا له.
  const cues = sanitizeCues(track.cues, { controls: true }).cues;
  assertWritable(cues);
  if (split !== null && (typeof split !== 'object' || !Number.isInteger(split.size) || split.size < 1)) throw invalid('split.size');
  if (split !== null && split.by !== undefined && split.by !== 'count' && split.by !== 'content') throw invalid('split.by');
  const ms = toMs(now);
  const warnings = [...new Set([...(Array.isArray(track.warnings) ? track.warnings : [])])];

  const full = writeSrtFrom(cues);
  verifyRoundTrip(full, cues);
  // لا إعادة قراءة متسامحة للإنجليزي: قارئه النموذج وffmpeg لا الاستيراد، وما يغيّر عدده عندهما يرفضه assertWritable.
  // الأجزاء ضمن حد الرفع (U31): حجم الجزء يُرفع بتنبيه حتى لا تتجاوز 50 ملفًا، وما لا يتسع خطأ قبل أي تنزيل.
  const plan = split ? splitPlan(cues, { size: split.size, by: split.by === 'content' ? 'content' : 'count' }) : null;
  const ranges = plan ? plan.ranges : null;
  if (split && !ranges) warnings.push('EX_SPLIT_NOT_NEEDED');
  if (plan?.raised) warnings.push('EX_SPLIT_SIZE_RAISED');
  const name = (part) => fileName({ videoId, lang: track.lang, kind: track.kind, via: track.via ?? null, mode, part });
  /** @type {ExportFile[]} */
  const files = ranges
    ? ranges.map((p) => ({
      name: name({ index: p.index, total: ranges.length }),
      text: writeSrtFrom(cues.slice(p.from - 1, p.to), p.from),
      part: { ...p, total: ranges.length },
      cueCount: p.to - p.from + 1,
    }))
    : [{ name: name(null), text: full, part: null, cueCount: cues.length }];
  if (ranges && files.map((f) => f.text).join('\n') !== full) {
    throw new TjError('EX_INVARIANT_FAILED', { detail: 'ضمّ الأجزاء لا يطابق الملف الكامل' });
  }

  const fingerprint = {
    id: newFingerprintId(ms, rand),
    videoId,
    trackKey: track.key,
    mode,
    count: cues.length,
    cues: cues.map((c, i) => ({ n: i + 1, startMs: c.startMs, endMs: c.endMs })),
    textHash: textHash(track.cues),
    fileName: ranges ? null : files[0].name,
    createdAt: new Date(ms).toISOString(),
    parts: ranges ? ranges.map(({ index, from, to }) => ({ index, from, to })) : null,
  };
  assertValid(validateFingerprint(fingerprint), 'fingerprint');
  // اللغة المطلوبة من المستدعي (الزوج المختار)؛ واللغة نفسها لا تُترجم إلى نفسها، فلا تعليمات حينها (null).
  const text = target && target !== track.lang ? instructions({ videoId, title, parts: ranges, source: track.lang, target, via: track.via ?? null }) : null;
  return { files, fingerprint, instructions: text, warnings };
}

/**
 * ملف SRT العربي من مقاطع بتوقيت التصدير النهائي (بعد exportTiming). يُرقَّم من 1، ولا يعدّل زمنًا. والنص كما يقرؤه الاستيراد:
 * بلا محارف تحكم ولا تجاوز اتجاه ولا مسافات أطراف (writableArabic)، فلا يحمل الملف U+202E. وnotes (إضافة على العقد، تدقيق
 * 7a66f91، U99) ما جُرّد من النص، وما يقرؤه الاستيراد على غير ما كُتب (وسم تنسيق يُجرَّد)، بأرقام المقاطع في الملف.
 * @param {{ videoId: string, cues: import('../model/cue.js').Cue[], variant?: 'current' | 'original' }} spec
 * @returns {{ name: string, text: string, notes: string[] }}
 */
export function buildArabicExport({ videoId, cues, variant = 'current', lang = null }) {
  if (!isVideoId(videoId)) throw new TjError('TJ_BAD_VIDEO_ID');
  if (!Array.isArray(cues) || cues.length === 0) throw new TjError('ST_NO_RECORD');
  assertValid(validateCues(cues, 'cues'), 'cues');
  // لغة الترجمة في الاسم (AA1): translationLang(track) من المستدعي، وبلا لغة «translation».
  const name = fileName({ videoId, lang, translation: true, variant });
  const { cues: clean, stripped } = writableArabic(cues);
  assertWritable(clean, { arabic: true });
  const text = writeSrtFrom(clean);
  verifyRoundTrip(text, clean);
  const changed = verifyReread(text, clean);
  const notes = [];
  if (stripped.length) notes.push(messageFor('EX_NOTE_CONTROL_STRIPPED', { list: shortNumbers(stripped) }));
  if (changed.length) notes.push(messageFor('EX_NOTE_REREAD_CHANGES', { list: shortNumbers(changed) }));
  return { name, text, notes };
}

const NOTE_LIST = 8;
/** أول ثمانية أرقام ثم «…». @param {number[]} ns */
const shortNumbers = (ns) => joinList(ns.slice(0, NOTE_LIST)) + (ns.length > NOTE_LIST ? '…' : '');
