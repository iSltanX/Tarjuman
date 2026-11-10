// رفع التتمة يُكمل الترجمة (ف3، 2026-11-10): ملف مرفوع يحمل المقاطع الناقصة بعينها من ترجمة محفوظة يُقترح إكمالًا لها لا
// ترجمةً ثانية ناقصة. دالة نقية فوق محرّك الاستكمال الموجود (planPatchCues وapplyPatchDetailed في patch.js): لا محرّك جديد.
// الشروط صارمة كي لا يُدمج ملف ليس تتمة: كل مقطع رقمه وزمنه من البصمة حرفيًا، والمحاذاة واثقة (لا مقطع متخطًّى لبنية أو ضعف)،
// ويقع كل مقطع في فجوة (ناقص يُدرج، أو مقطع فارغ أو بلا حرف من لغة الترجمة يُستبدل)، فلا يمس مقطعًا مترجمًا. وإلا فلا اقتراح.
import { isBlankText, untranslatedTest } from '../compare/compare.js';
import { trackComparison } from '../compare/current.js';
import { syncActive, withSlotEdit } from '../model/bundle.js';
import { parseTrackKey } from '../model/ids.js';
import { LIMITS } from '../model/validate.js';
import { applyPatchDetailed, planPatchCues } from './patch.js';

/** @typedef {import('../model/cue.js').Cue} Cue */
/** @typedef {import('../model/slots.js').Bundle} Bundle */
/**
 * @typedef {{ n: 1 | 2 | 3, cues: Cue[], adds: number, remaining: number, renumbered: boolean, base: Cue[] }} Continuation
 *   cues الترجمة بعد الإكمال (النسخة الحالية الجديدة للخانة)، وadds ما يضيفه الملف، وremaining ما يبقى ناقصًا أو غير مترجم
 *   بعده، وbase الترجمة التي حُسب عليها (يُرفض التطبيق إن تغيّرت).
 */

/**
 * هل الملف تتمة لخانة ممتلئة واحدة؟
 * @param {Bundle | null | undefined} bundle
 * @param {Cue[]} cues مقاطع الملف المرفوع (ناتج الاستيراد)
 * @returns {Continuation | null} الخانة الوحيدة المتأهلة وناتج إكمالها، أو null (لا متأهلة، أو أكثر من واحدة فلا يُخمَّن)
 */
export function findContinuation(bundle, cues) {
  if (!bundle || !Array.isArray(cues) || !cues.length) return null;
  const fingerprints = bundle.record?.fingerprints ?? [];
  /** @type {Continuation[]} */
  const found = [];
  for (const slot of bundle.slots ?? []) {
    const track = slot?.track;
    if (!track?.fingerprintId) continue;
    const fp = fingerprints.find((f) => f.id === track.fingerprintId);
    if (!fp?.cues?.length) continue;
    const base = track.current ?? track.original;
    const target = track.lang ?? null;
    const read = planPatchCues(cues, { fingerprint: fp, cues: base, target });
    if (!read.ok) continue;
    const { plan } = read;
    // ثقة المحاذاة: لا مقطع متخطًّى (فارغ أو لبنية أو لضعف)، ولا نص بلا حرف من لغة الترجمة.
    if (!plan.items.length || plan.skipped.length || plan.warnings.some((w) => w.code === 'IM_PATCH_NO_ARABIC')) continue;
    // بلا تداخل مع ما تُرجم: الاستبدال على مقطع فارغ أو غير مترجم وحده.
    const untranslated = untranslatedTest(target, parseTrackKey(fp.trackKey)?.lang ?? null);
    const gap = (text) => isBlankText(text) || (untranslated ? untranslated(text) : false);
    if (plan.items.some((it) => it.action === 'replace' && !gap(it.before.text))) continue;
    const applied = applyPatchDetailed(base, plan);
    const after = trackComparison({ ...track, current: applied.cues }, fingerprints);
    const remaining = after ? new Set([...after.missing, ...after.empty, ...after.noArabic]).size : 0;
    found.push({ n: slot.n, cues: applied.cues, adds: plan.items.length, remaining, renumbered: applied.renumbered, base });
  }
  return found.length === 1 ? found[0] : null;
}

/**
 * تطبيق الإكمال: الناتج نسخة حالية للخانة (withSlotEdit)، فيبقى الأصل المرفوع وتبقى التعديلات اليدوية فيه، ومعه ملاحظة بما
 * أُكمل. لا يُكتب شيء قبل أن يضغط المستخدم «حفظ»؛ ويُستدعى داخل كتابة الحزمة التي بُني عليها الحوار.
 * @param {Bundle} bundle @param {Continuation} cont @param {string} note نص الملاحظة بلغة الواجهة @param {string} now
 * @returns {Bundle}
 */
export function withContinuation(bundle, cont, note, now) {
  const b = withSlotEdit(bundle, cont.n, { cues: cont.cues }, now);
  const track = b.active === cont.n ? b.record.arabic : b.slots[cont.n - 1].track;
  if (track && note) track.notes = [...(track.notes ?? []), String(note).slice(0, LIMITS.maxNoteChars)].slice(-LIMITS.maxNotes);
  return syncActive(b);
}

