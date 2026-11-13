// لوحة المشكلات (R28): تصف ولا تصلح. الأخطاء (نهاية قبل البداية، وزمن سالب، وصيغة غير صالحة، وما فوق الحد،
// ونص لا يقبله التخزين) تمنع الحفظ والتصدير. والتحذيرات (تداخل، ومدة قصيرة جدًا، وفجوة كبيرة، ونص فارغ) لا تمنع
// الحفظ؛ لكن التداخل والنص الفارغ يمنعان التصدير وحده لأن كاتب SRT يرفضهما (EX_TIMING_INVALID وEX_EMPTY_TEXT في P3).
// وتنبيهات الكثافة (R55: قراءة سريعة وسطر طويل) تحذيرات لا تمنع الحفظ ولا التصدير، بعتبة من التفضيلات أو المعايرة.
import { isBlankText, lfLines } from '../model/cue.js';
import { LIMITS } from '../model/validate.js';
import { breaksSrtText } from '../srt/lenient.js';
import { READING_DEFAULTS, densityIssues, readingMetrics } from './density.js';

/**
 * العتبات: لا تحذير في عيّنتي P1 الحقيقيتين (أقصر مقطع 719ms وأكبر فجوة 7.25ث)، فالتحذير يلفت إلى خطأ تحرير
 * محتمل لا إلى طبيعة الفيديو.
 */
export const ISSUE_LIMITS = Object.freeze({ shortMs: 300, largeGapMs: 30000 });

/**
 * @typedef {'start' | 'end' | 'text'} IssueField
 * @typedef {{
 *   code: string, tone: 'error' | 'warning', index: number, n: number, field: IssueField | null,
 *   params: Record<string, string | number> | null, blocksSave: boolean, blocksExport: boolean, density: boolean
 * }} Issue
 * @typedef {{ list: Issue[], errors: number, warnings: number, exportBlockers: Issue[], byIndex: Map<number, Issue[]> }} IssueReport
 */

const seconds = (ms) => (Math.round(ms / 100) / 10).toFixed(1);
const ERRORS = new Set(['ED_END_BEFORE_START', 'ED_NEGATIVE_TIME', 'ED_TIME_FORMAT', 'ED_TIME_RANGE', 'ED_TEXT_INVALID']);
// تمنع التصدير وحده: لا يُكتب منها SRT يُقرأ بالعدد نفسه (U78: سطر يُقرأ رأسَ مقطع).
const EXPORT_ONLY = new Set(['ED_OVERLAP', 'ED_TEXT_EMPTY', 'ED_TEXT_BLANK_LINE', 'ED_TEXT_BREAKS_SRT']);
/** رموز الكثافة: مجموعة «الكثافة» في لوحة المراجعة، منفصلة عن التوقيت والنص. */
export const DENSITY_CODES = Object.freeze(['ED_READING_FAST', 'ED_LINE_LONG']);

/**
 * @param {{ n: number, startMs: number, endMs: number, text: string }[]} cues
 * @param {{ drafts?: Map<string, string>, density?: Partial<typeof READING_DEFAULTS> | null }} [opts] drafts نص حقل زمن لم يُقرأ،
 *   بالمفتاح «الموضع:start|end»؛ وdensity عتبة تنبيهات الكثافة (غيابها يطفئها، فلا يتغير ما يمنع الحفظ والتصدير)
 * @returns {IssueReport}
 */
export function findIssues(cues, { drafts, density = null } = {}) {
  /** @type {Issue[]} */
  const list = [];
  const draftAt = new Map();
  for (const key of drafts?.keys() ?? []) {
    const [i, field] = key.split(':');
    const index = Number(i);
    if (!Number.isInteger(index) || index < 0 || index >= cues.length) continue;
    if (!draftAt.has(index)) draftAt.set(index, []);
    draftAt.get(index).push(field);
  }
  const add = (code, index, field = null, params = null) => {
    const error = ERRORS.has(code);
    const exportOnly = EXPORT_ONLY.has(code);
    list.push({
      code, tone: error ? 'error' : 'warning', index, n: cues[index].n, field, params, blocksSave: error, blocksExport: error || exportOnly,
      density: DENSITY_CODES.includes(code),
    });
  };
  const limits = density ? { ...READING_DEFAULTS, ...density } : null;
  /** خطأ توقيت في المقطع نفسه: لا تحذير تداخل أو فجوة بجواره، فهو ضجيج فوق الخطأ. */
  const broken = (c) => !(c.startMs >= 0 && c.endMs > c.startMs && c.endMs <= LIMITS.maxTimeMs);

  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    if (c.startMs < 0 || c.endMs < 0) add('ED_NEGATIVE_TIME', i, c.startMs < 0 ? 'start' : 'end');
    else if (c.endMs <= c.startMs) add('ED_END_BEFORE_START', i, 'end');
    if (c.startMs > LIMITS.maxTimeMs || c.endMs > LIMITS.maxTimeMs) add('ED_TIME_RANGE', i, c.startMs > LIMITS.maxTimeMs ? 'start' : 'end');
    for (const field of draftAt.get(i) ?? []) add('ED_TIME_FORMAT', i, field === 'start' ? 'start' : 'end');

    // ما يرفضه مدقق المقطع (isText في النموذج) خطأ هنا، فلا يصل إلى التخزين ليفشل برسالة عامة.
    if (c.text.length > LIMITS.maxTextChars || c.text.includes('\u0000')) add('ED_TEXT_INVALID', i, 'text', { max: LIMITS.maxTextChars });
    // الفارغ بصريًا (محارف لا تُرى وحدها) فارغ كما في المقارن والتصدير العربي (تدقيق 7a66f91، U80). وفواصل الأسطر غير LF
    // سطر جديد كما يكتبها التصدير (lfLines، ع-١٧)، فيُعلن هنا السطر الفارغ أو رأس المقطع الذي تصنعه.
    else if (isBlankText(c.text)) add('ED_TEXT_EMPTY', i, 'text');
    else if (lfLines(c.text).split('\n').some((l) => l.trim() === '')) add('ED_TEXT_BLANK_LINE', i, 'text');
    else if (breaksSrtText(lfLines(c.text))) add('ED_TEXT_BREAKS_SRT', i, 'text');

    const next = cues[i + 1];
    if (broken(c)) continue;
    const duration = c.endMs - c.startMs;
    const nextOk = next && !broken(next);
    if (nextOk && c.endMs > next.startMs) add('ED_OVERLAP', i, 'end', { next: next.n });
    if (duration < ISSUE_LIMITS.shortMs) add('ED_SHORT', i, 'end', { seconds: seconds(duration) });
    if (nextOk && next.startMs - c.endMs > ISSUE_LIMITS.largeGapMs) add('ED_GAP', i, 'end', { seconds: seconds(next.startMs - c.endMs) });
    if (limits && c.text) {
      const found = densityIssues(c, limits);
      if (found.length) {
        const m = readingMetrics(c);
        if (found.includes('ED_READING_FAST')) add('ED_READING_FAST', i, 'text', { cps: m.cps, max: limits.maxCps });
        if (found.includes('ED_LINE_LONG')) add('ED_LINE_LONG', i, 'text', { chars: m.longestLine, max: limits.maxLineChars });
      }
    }
  }

  const byIndex = new Map();
  let errors = 0;
  for (const issue of list) {
    if (issue.tone === 'error') errors++;
    if (!byIndex.has(issue.index)) byIndex.set(issue.index, []);
    byIndex.get(issue.index).push(issue);
  }
  return { list, errors, warnings: list.length - errors, exportBlockers: list.filter((x) => x.blocksExport && x.tone === 'warning'), byIndex };
}
