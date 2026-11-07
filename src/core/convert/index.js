// نقطة دخول التحويل: json3 ← مقاطع ← ثوابت ← SRT. لا يُصدَّر شيء إن فشل ثابت واحد.
import { ConvertError, parseJson3, dedupeExact, sortEvents, inferKind } from './json3.js';
import { convertManual } from './manual.js';
import { convertAsr } from './asr.js';
import { mergeLong } from './long.js';
import { DURATION_SLACK_MS, checkInvariants } from './invariants.js';
import { splitWords } from './text.js';

export { ConvertError } from './json3.js';
export { LONG_DEFAULTS, normalizeLongOptions } from './long.js';

/** عتبة «قد يكون ناقصًا» الافتراضية (Q6)، والإعداد thresholds.completeness يغيّرها في حدود 0.5..1 (تدقيق 7a66f91، U37). */
export const COMPLETENESS_RATIO = 0.85;
/** @param {unknown} v @returns {number} العتبة الصالحة، وإلا الافتراضية */
export const normalizeCompleteness = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0.5 && v <= 1 ? v : COMPLETENESS_RATIO);

/**
 * الوضعان تحت الثوابت نفسها: «عادي» مقطع لكل وحدة نص كما يعطيها المحوّل، و«مقاطع أطول» يضم المتجاورة منها
 * (long.js) حتى سطرين ونحو 12 ثانية. longOptions تضبط أرقام الوضع الطويل، وcompletenessRatio عتبة تحذير الاكتمال.
 * وآخر نهاية تتجاوز المدة بأكثر من الهامش ومقطعها يبدأ داخلها تُقص إلى المدة (تدقيق 7a66f91، I10)، فلا يبقى لثابت
 * الحدود إلا نص يبدأ بعد نهاية الفيديو، ورمزه EX_BEYOND_DURATION لا EX_INVARIANT_FAILED (U39).
 * @param {{
 *   body: string, trackKind: 'manual' | 'asr' | 'auto', durationMs?: number | null, asrOptions?: object,
 *   mode?: 'normal' | 'long', longOptions?: Partial<typeof import('./long.js').LONG_DEFAULTS>, completenessRatio?: number
 * }} input
 * @returns {{
 *   ok: boolean, code: string | null, message: string | null,
 *   cues: object[], srt: string | null, invariants: object | null, warnings: string[], report: object
 * }}
 */
export function convertTrack({ body, trackKind: requested, durationMs = null, asrOptions, mode = 'normal', longOptions, completenessRatio }) {
  if (mode !== 'normal' && mode !== 'long') throw new RangeError(`وضع تحويل غير معروف: ${mode}`);
  // auto (AA1): النوع من البنية نفسها، لمسار ترجمه يوتيوب آليًا فلا يُعرف شكل جسمه من نوع أصله.
  let trackKind = requested === 'auto' ? 'manual' : requested;
  const report = { trackKind, mode };
  try {
    const parsed = parseJson3(body);
    report.stats = parsed.stats;
    report.inferredKind = inferKind(parsed);
    if (requested === 'auto') {
      trackKind = report.inferredKind;
      report.trackKind = trackKind;
      report.kindFromStructure = true;
    }
    const deduped = dedupeExact(parsed.events);
    report.duplicatesRemoved = deduped.removed;
    const sorted = sortEvents(deduped.events);
    report.eventsReordered = sorted.reordered;
    const events = sorted.events;
    const sourceWords = events.flatMap((e) => splitWords(e.text));
    const converted = trackKind === 'asr' ? convertAsr(events, asrOptions) : convertManual(events);
    report.converter = converted.report;
    let produced = converted.cues;
    if (mode === 'long') {
      const merged = mergeLong(produced, longOptions);
      produced = merged.cues;
      report.long = merged.report;
    }
    const known = Number.isFinite(durationMs) && durationMs > 0;
    const tail = produced[produced.length - 1];
    report.endClampedToDuration = Boolean(known && tail && tail.endMs > durationMs + DURATION_SLACK_MS && tail.startMs < durationMs);
    if (report.endClampedToDuration) produced = [...produced.slice(0, -1), { ...tail, endMs: durationMs }];
    const cues = produced.map((c, i) => ({ n: i + 1, ...c }));
    const invariants = checkInvariants({ sourceWords, cues, durationMs });
    const warnings = [];
    const lastEnd = cues.length ? cues[cues.length - 1].endMs : 0;
    report.lastEndMs = lastEnd;
    report.firstStartMs = cues.length ? cues[0].startMs : null;
    report.cueCount = cues.length;
    report.sourceWords = sourceWords.length;
    if (known) {
      report.completeness = Math.round((lastEnd / durationMs) * 1000) / 1000;
      if (lastEnd < durationMs * normalizeCompleteness(completenessRatio)) warnings.push('EX_MAYBE_INCOMPLETE');
    } else {
      report.completeness = null;
    }
    if (report.inferredKind !== trackKind) warnings.push('KIND_MISMATCH');
    if (!invariants.ok) {
      const boundsOnly = invariants.results.every((r) => r.ok || r.key === 'bounds');
      const code = boundsOnly ? 'EX_BEYOND_DURATION' : 'EX_INVARIANT_FAILED';
      return { ok: false, code, message: 'فشل ثابت أو أكثر', cues, srt: null, invariants, warnings, report };
    }
    return { ok: true, code: null, message: null, cues, srt: invariants.srt, invariants, warnings, report };
  } catch (err) {
    if (err instanceof ConvertError) {
      report.errorDetail = err.detail;
      return { ok: false, code: err.code, message: err.message, cues: [], srt: null, invariants: null, warnings: [], report };
    }
    throw err;
  }
}
