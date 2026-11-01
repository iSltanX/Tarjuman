// تدفق التصدير (عقد interfaces §٥): وحدة نقية تستهلكها أدوات الشريط (P6) والمحفوظات (P7) والمحرّر (P8).
// الإنجليزي: controller.convertCaptured(key, { mode }) ← buildExport ← download لكل ملف ← controller.recordExport.
// العربي: exportTiming (عقد التوقيت §٥) ← buildArabicExport ← download. لا كتابة في التخزين هنا.
import { TjError } from '../errors/index.js';
import { validateCues } from '../model/cue.js';
import { newFingerprintId, isVideoId, parseTrackKey } from '../model/ids.js';
import { EXPORT_MODES, validateFingerprint } from '../model/tracks.js';
import { assertValid } from '../model/validate.js';
import { textHash } from './hash.js';
import { instructions } from './instructions.js';
import { fileName } from './names.js';
import { planParts } from './parts.js';
import { assertWritable, verifyRoundTrip, writeSrtFrom } from './write.js';

export { fileName } from './names.js';
export { instructions } from './instructions.js';
export { describeTrack, languageLabel, trackLabel } from './describe.js';
export { download, SRT_MIME } from './download.js';
export { planParts } from './parts.js';
export { fnv1a64, textHash } from './hash.js';

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
 *   track: { key: string, lang: string, kind: 'manual' | 'asr', cues: import('../model/cue.js').Cue[], warnings?: string[] },
 *   mode: 'normal' | 'long', split?: { size: number } | null, now?: number | string | Date, rand?: () => number
 * }} spec title لا يُكتب في أي ملف ولا بصمة (خصوصية)، ويدخل نص التعليمات وحده بوصفه بيانات
 * @returns {{ files: ExportFile[], fingerprint: import('../model/tracks.js').Fingerprint, instructions: string, warnings: string[] }}
 */
export function buildExport({ videoId, title = null, track, mode, split = null, now = Date.now(), rand }) {
  if (!isVideoId(videoId)) throw new TjError('TJ_BAD_VIDEO_ID');
  if (!EXPORT_MODES.includes(mode)) throw invalid('mode');
  const parsed = parseTrackKey(track?.key);
  if (!parsed || parsed.lang !== track.lang || parsed.kind !== track.kind) throw invalid('track.key');
  const cues = track.cues;
  if (!Array.isArray(cues) || cues.length === 0) throw new TjError('EX_NO_TRACK');
  assertValid(validateCues(cues, 'track.cues'), 'track.cues');
  assertWritable(cues);
  if (split !== null && (typeof split !== 'object' || !Number.isInteger(split.size) || split.size < 1)) throw invalid('split.size');
  const ms = toMs(now);
  const warnings = [...new Set([...(Array.isArray(track.warnings) ? track.warnings : [])])];

  const full = writeSrtFrom(cues);
  verifyRoundTrip(full, cues);
  const ranges = split ? planParts(cues.length, split.size) : null;
  if (split && !ranges) warnings.push('EX_SPLIT_NOT_NEEDED');
  const name = (part) => fileName({ videoId, lang: track.lang, kind: track.kind, mode, part });
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
    textHash: textHash(cues),
    fileName: ranges ? null : files[0].name,
    createdAt: new Date(ms).toISOString(),
    parts: ranges ? ranges.map(({ index, from, to }) => ({ index, from, to })) : null,
  };
  assertValid(validateFingerprint(fingerprint), 'fingerprint');
  return { files, fingerprint, instructions: instructions({ videoId, title, parts: ranges }), warnings };
}

/**
 * ملف SRT العربي من مقاطع بتوقيت التصدير النهائي (بعد exportTiming). يُرقَّم من 1، ولا يعدّل نصًا ولا زمنًا.
 * @param {{ videoId: string, cues: import('../model/cue.js').Cue[], variant?: 'current' | 'original' }} spec
 * @returns {{ name: string, text: string }}
 */
export function buildArabicExport({ videoId, cues, variant = 'current' }) {
  if (!isVideoId(videoId)) throw new TjError('TJ_BAD_VIDEO_ID');
  if (!Array.isArray(cues) || cues.length === 0) throw new TjError('ST_NO_RECORD');
  assertValid(validateCues(cues, 'cues'), 'cues');
  assertWritable(cues);
  const name = fileName({ videoId, lang: 'ar', variant });
  const text = writeSrtFrom(cues);
  verifyRoundTrip(text, cues);
  return { name, text };
}
