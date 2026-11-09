// تحليل json3 كما يعيده مشغّل يوتيوب. البنية مستنتجة من شيفرة مشاريع وعينات حقيقية، لا من توثيق رسمي.
import { sanitizeText } from '../text/sanitize.js';

export class ConvertError extends Error {
  /**
   * @param {string} code رمز ثابت من عقد الاستخراج (EX_…)
   * @param {string} message وصف تقني منقّى (لا روابط ولا رموز)
   * @param {object} [detail]
   */
  constructor(code, message, detail = {}) {
    super(message);
    this.name = 'ConvertError';
    this.code = code;
    this.detail = detail;
  }
}

/**
 * @typedef {{ text: string, offsetMs: number }} Seg
 * @typedef {{
 *   index: number, startMs: number, durationMs: number | null, endMs: number | null,
 *   append: boolean, segs: Seg[], text: string, hasOffsets: boolean, hasAsrConf: boolean
 * }} TextEvent
 */

/**
 * يحوّل جسم الاستجابة إلى أحداث نصية مرتبة كما وردت. أحداث النوافذ (بلا segs) وأحداث
 * الأسطر الجديدة وحدها لا تحمل كلمات فتُعدّ ولا تُحوَّل.
 * @param {string} body
 * @returns {{ events: TextEvent[], stats: object }}
 */
export function parseJson3(body) {
  if (typeof body !== 'string' || body.trim() === '') {
    throw new ConvertError('EX_EMPTY_BODY', 'جسم الاستجابة فارغ');
  }
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    throw new ConvertError('EX_UNSUPPORTED_FORMAT', 'الجسم ليس JSON صالحًا');
  }
  if (!data || typeof data !== 'object' || !Array.isArray(data.events)) {
    throw new ConvertError('EX_UNSUPPORTED_FORMAT', 'لا توجد مصفوفة events');
  }
  const stats = {
    totalEvents: data.events.length, textEvents: 0, windowEvents: 0, newlineEvents: 0,
    blankEvents: 0, appendEvents: 0, missingDuration: 0, withOffsets: 0, withAsrConf: 0, invalidSegs: 0, fractionalTimes: 0,
  };
  // الأزمنة أعداد صحيحة بالمللي ثانية في كل ما قيس؛ والكسري (لا يصدر إلا من سكربت في الصفحة) يُقرَّب ويُعدّ، فلا يُسقط
  // ثابت إعادة التحليل المسار كله (تدقيق 7a66f91، I10).
  const ms = (v) => {
    if (Number.isInteger(v)) return v;
    stats.fractionalTimes++;
    return Math.round(v);
  };
  /** @type {TextEvent[]} */
  const events = [];
  data.events.forEach((e, index) => {
    if (!e || typeof e !== 'object') throw new ConvertError('EX_UNSUPPORTED_FORMAT', `حدث غير صالح عند ${index}`);
    if (!Array.isArray(e.segs)) {
      stats.windowEvents++;
      return;
    }
    if (!Number.isFinite(e.tStartMs) || e.tStartMs < 0) {
      throw new ConvertError('EX_UNSUPPORTED_FORMAT', `tStartMs غير صالح عند ${index}`);
    }
    // القطعة كائن؛ وما سواه (رقم أو نص أو قيمة منطقية أو null) يُتجاهل ويُعدّ، فلا يرمي فحص الخصائص TypeError يُسقط
    // المستخرج كله (تدقيق 7a66f91، U32).
    const objs = e.segs.filter((s) => s !== null && typeof s === 'object' && !Array.isArray(s));
    stats.invalidSegs += e.segs.length - objs.length;
    const segs = objs.map((s) => ({
      // بعد فك JSON: المحارف الخفية قد تصل مهرّبة في الجسم الخام. وقبل فحص الفراغ والثوابت، فالحدث المخفي كله حدث فارغ.
      text: typeof s.utf8 === 'string' ? sanitizeText(s.utf8).text : '',
      offsetMs: Number.isFinite(s.tOffsetMs) ? ms(s.tOffsetMs) : 0,
    }));
    const text = segs.map((s) => s.text).join('');
    if (e.aAppend === 1) stats.appendEvents++;
    if (text.trim() === '') {
      if (text.includes('\n')) stats.newlineEvents++;
      else stats.blankEvents++;
      return;
    }
    const startMs = ms(e.tStartMs);
    const durationMs = Number.isFinite(e.dDurationMs) && e.dDurationMs >= 0 ? ms(e.dDurationMs) : null;
    if (durationMs === null) stats.missingDuration++;
    const hasOffsets = objs.some((s) => Number.isFinite(s.tOffsetMs));
    const hasAsrConf = objs.some((s) => 'acAsrConf' in s);
    if (hasOffsets) stats.withOffsets++;
    if (hasAsrConf) stats.withAsrConf++;
    events.push({
      index, startMs, durationMs, endMs: durationMs === null ? null : startMs + durationMs,
      append: e.aAppend === 1, segs, text, hasOffsets, hasAsrConf,
    });
  });
  stats.textEvents = events.length;
  if (events.length === 0) throw new ConvertError('EX_EMPTY_BODY', 'لا أحداث نصية في الاستجابة', { stats });
  return { events, stats };
}

/**
 * يحذف التكرار الحرفي فقط: حدث يطابق حدثًا محفوظًا قبله في البداية والمدة والنص معًا.
 * لا مطابقة تقريبية.
 * @param {TextEvent[]} events
 */
export function dedupeExact(events) {
  const seen = new Set();
  const kept = [];
  let removed = 0;
  for (const e of events) {
    const key = `${e.startMs}|${e.durationMs}|${e.text}`;
    if (seen.has(key)) {
      removed++;
      continue;
    }
    seen.add(key);
    kept.push(e);
  }
  return { events: kept, removed };
}

/**
 * ترتيب ثابت حسب زمن البداية (يحافظ على ترتيب المتساويين).
 * @param {TextEvent[]} events
 */
export function sortEvents(events) {
  let reordered = 0;
  for (let i = 1; i < events.length; i++) if (events[i].startMs < events[i - 1].startMs) reordered++;
  const sorted = events.map((e, i) => ({ e, i })).sort((a, b) => a.e.startMs - b.e.startMs || a.i - b.i).map((x) => x.e);
  return { events: sorted, reordered };
}

/**
 * يستنتج نوع المسار من البنية (للمقارنة مع معامل kind في الرابط فقط).
 * @param {{ events: TextEvent[], stats: object }} parsed
 * @returns {'asr' | 'manual'}
 */
export function inferKind(parsed) {
  const { stats } = parsed;
  return stats.withAsrConf > 0 || stats.withOffsets > stats.textEvents / 2 ? 'asr' : 'manual';
}
