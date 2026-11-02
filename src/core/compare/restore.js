// الاستعادة اليدوية للتوقيت (R14 وR50). لا تُتاح إلا عند تطابق العدد والترقيم مع البصمة تمامًا **ومحاذاة متحققة**: كل
// مقطع يقابل نظيره بتوقيته واحدًا بواحد (src/core/align)، فلا يكفي أن يعيد دمجٌ وشطرٌ العدد إلى أصله. المعاينة لا تغيّر
// شيئًا، والتطبيق دالة منفصلة تُستدعى بعد تأكيد المستخدم وحده؛ ولا يستدعيها المقارن ولا الاستيراد أبدًا. تغيّر التوقيت
// المحفوظ فقط، ولا تمسّ النص ولا الأرقام ولا إزاحة العرض.
import { alignCues, isIdentity } from '../align/index.js';
import { TjError } from '../errors/index.js';

/** @typedef {import('../model/cue.js').Cue} Cue */
/** @typedef {import('../model/tracks.js').Fingerprint} Fingerprint */

/**
 * التطابق البنيوي وحده: عدد المقاطع يساوي عدد البصمة وترقيم الملف 1..العدد بالترتيب.
 * @param {Cue[]} cues
 * @param {Fingerprint | null} fingerprint
 */
export function sameStructure(cues, fingerprint) {
  if (!fingerprint || !Array.isArray(fingerprint.cues) || !Array.isArray(cues)) return false;
  const count = cues.length;
  if (count === 0 || count !== fingerprint.count || count !== fingerprint.cues.length) return false;
  return cues.every((c, i) => c.n === i + 1 && fingerprint.cues[i].n === i + 1);
}

/**
 * محاذاة الملف بالبصمة (البصمة بلا نص، فالتوقيت والترقيم وحدهما).
 * @param {Cue[]} cues
 * @param {Fingerprint} fingerprint
 */
export const alignToFingerprint = (cues, fingerprint) => alignCues(fingerprint.cues.map((c) => ({ ...c, text: '' })), cues);

/**
 * الاستعادة تتاح حين يتطابق البناء وتتحقق المحاذاة هوية (ثقة عالية، وكل مقطع بنظيره في موضعه).
 * @param {Cue[]} cues
 * @param {Fingerprint | null} fingerprint
 */
export function canRestore(cues, fingerprint) {
  if (!sameStructure(cues, fingerprint)) return false;
  return isIdentity(alignToFingerprint(cues, fingerprint), fingerprint.count, cues.length);
}

/**
 * ما سيتغير لو طُبّقت الاستعادة: كل مقطع يختلف زمنه عن الأصل ولو دون عتبة الانحراف، بالقديم والجديد.
 * معاينة فقط.
 * @param {Cue[]} cues
 * @param {Fingerprint | null} fingerprint
 * @returns {{ available: boolean, changes: { n: number, from: { startMs: number, endMs: number }, to: { startMs: number, endMs: number } }[] }}
 */
export function previewRestoreTiming(cues, fingerprint) {
  if (!canRestore(cues, fingerprint)) return { available: false, changes: [] };
  const changes = [];
  cues.forEach((c, i) => {
    const s = fingerprint.cues[i];
    if (c.startMs !== s.startMs || c.endMs !== s.endMs) {
      changes.push({ n: c.n, from: { startMs: c.startMs, endMs: c.endMs }, to: { startMs: s.startMs, endMs: s.endMs } });
    }
  });
  return { available: true, changes };
}

/**
 * مقاطع جديدة بأزمنة الأصل. تُستدعى بعد تأكيد المستخدم وحده؛ وتحفظ الأرقام والنص حرفيًا ولا تمسّ المدخلات.
 * @param {Cue[]} cues
 * @param {Fingerprint | null} fingerprint
 * @returns {Cue[]}
 * @throws {TjError} CMP_RESTORE_UNAVAILABLE إن لم تُتح
 */
export function applyRestoreTiming(cues, fingerprint) {
  if (!canRestore(cues, fingerprint)) throw new TjError('CMP_RESTORE_UNAVAILABLE');
  return cues.map((c, i) => ({ n: c.n, startMs: fingerprint.cues[i].startMs, endMs: fingerprint.cues[i].endMs, text: c.text }));
}
