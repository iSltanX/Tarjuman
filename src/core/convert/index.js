// نقطة دخول التحويل: json3 ← مقاطع ← ثوابت ← SRT. لا يُصدَّر شيء إن فشل ثابت واحد.
import { ConvertError, parseJson3, dedupeExact, sortEvents, inferKind } from './json3.js';
import { convertManual } from './manual.js';
import { convertAsr } from './asr.js';
import { mergeLong } from './long.js';
import { checkInvariants } from './invariants.js';
import { splitWords } from './text.js';

export { ConvertError } from './json3.js';
export { LONG_DEFAULTS, normalizeLongOptions } from './long.js';

export const COMPLETENESS_RATIO = 0.85;

/**
 * الوضعان تحت الثوابت نفسها: «عادي» مقطع لكل وحدة نص كما يعطيها المحوّل، و«مقاطع أطول» يضم المتجاورة منها
 * (long.js) حتى سطرين ونحو 12 ثانية. longOptions تضبط أرقام الوضع الطويل.
 * @param {{
 *   body: string, trackKind: 'manual' | 'asr', durationMs?: number | null, asrOptions?: object,
 *   mode?: 'normal' | 'long', longOptions?: Partial<typeof import('./long.js').LONG_DEFAULTS>
 * }} input
 * @returns {{
 *   ok: boolean, code: string | null, message: string | null,
 *   cues: object[], srt: string | null, invariants: object | null, warnings: string[], report: object
 * }}
 */
export function convertTrack({ body, trackKind, durationMs = null, asrOptions, mode = 'normal', longOptions }) {
  if (mode !== 'normal' && mode !== 'long') throw new RangeError(`وضع تحويل غير معروف: ${mode}`);
  const report = { trackKind, mode };
  try {
    const parsed = parseJson3(body);
    report.stats = parsed.stats;
    report.inferredKind = inferKind(parsed);
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
    const cues = produced.map((c, i) => ({ n: i + 1, ...c }));
    const invariants = checkInvariants({ sourceWords, cues, durationMs });
    const warnings = [];
    const lastEnd = cues.length ? cues[cues.length - 1].endMs : 0;
    report.lastEndMs = lastEnd;
    report.firstStartMs = cues.length ? cues[0].startMs : null;
    report.cueCount = cues.length;
    report.sourceWords = sourceWords.length;
    if (Number.isFinite(durationMs) && durationMs > 0) {
      report.completeness = Math.round((lastEnd / durationMs) * 1000) / 1000;
      if (lastEnd < durationMs * COMPLETENESS_RATIO) warnings.push('EX_MAYBE_INCOMPLETE');
    } else {
      report.completeness = null;
    }
    if (report.inferredKind !== trackKind) warnings.push('KIND_MISMATCH');
    if (!invariants.ok) {
      return { ok: false, code: 'EX_INVARIANT_FAILED', message: 'فشل ثابت أو أكثر', cues, srt: null, invariants, warnings, report };
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
