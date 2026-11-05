// التقسيم الاحتياطي (R11 وR60): لا يعمل إلا بطلب صريح، بترقيم مستمر يغطي 1..count دون فجوة ولا تداخل.
// planParts: size هو الحد الأقصى للجزء، والتوزيع متوازن فلا يبقى جزء أخير ضئيل (401 مقطعًا بحد 200 ← 134 و134 و133).
// planPartsByContent: العدد نفسه من الأجزاء، وكل حد يُنقل إلى نهاية جملة أو صمت قريب ضمن تفاوت مكتوب، فلا تنقطع جملة بين
// جزأين ما أمكن.
import { endsSentence } from '../convert/text.js';
import { TjError } from '../errors/index.js';
import { MAX_FILES, MAX_FILE_BYTES } from '../import/read-file.js';

/**
 * @param {number} count عدد المقاطع
 * @param {number} size أقصى مقاطع في الجزء
 * @returns {{ index: number, from: number, to: number }[] | null} null إن لم يلزم تقسيم (count ≤ size)
 */
export function planParts(count, size) {
  if (!Number.isInteger(count) || count < 1) throw new RangeError(`عدد مقاطع غير صالح: ${count}`);
  if (!Number.isInteger(size) || size < 1) throw new RangeError(`حجم جزء غير صالح: ${size}`);
  if (count <= size) return null;
  const total = Math.ceil(count / size);
  const base = Math.floor(count / total);
  const extra = count % total;
  const parts = [];
  let from = 1;
  for (let index = 1; index <= total; index++) {
    const len = base + (index <= extra ? 1 : 0);
    parts.push({ index, from, to: from + len - 1 });
    from += len;
  }
  return parts;
}

/**
 * التفاوت المكتوب: كل حد يقع ضمن ±15% من طول الجزء المتوازن (مقطع واحد على الأقل) حول موضعه المتوازن، فيبقى طول كل جزء
 * ضمن ±30% من المتوازن (وقد يزيد على size بمقدار التفاوت). الصمت فاصل لا يقل عن 1.5 ث بين نهاية مقطع وبداية التالي.
 */
export const CONTENT_SPLIT = Object.freeze({ tolerance: 0.15, silenceMs: 1500 });

/**
 * @param {{ startMs: number, endMs: number, text: string }[]} cues المقاطع بالترتيب (الإنجليزية المصدَّرة)
 * @param {number} size أقصى مقاطع في الجزء المتوازن
 * @returns {{ index: number, from: number, to: number }[] | null} null إن لم يلزم تقسيم
 */
export function planPartsByContent(cues, size) {
  if (!Array.isArray(cues) || cues.length < 1) throw new RangeError('مقاطع غير صالحة للتقسيم');
  const balanced = planParts(cues.length, size);
  if (!balanced) return null;
  const count = cues.length;
  const total = balanced.length;
  const target = count / total;
  const tol = Math.max(1, Math.round(target * CONTENT_SPLIT.tolerance));
  // درجة الحد بعد المقطع e (رقمه من 1): نهاية جملة وصمت معًا أفضل، ثم الصمت، ثم نهاية الجملة، والأقرب إلى الموضع المتوازن.
  const score = (e, ideal) => {
    const gap = cues[e].startMs - cues[e - 1].endMs;
    const silence = gap >= CONTENT_SPLIT.silenceMs ? 3 : Math.max(0, gap) / CONTENT_SPLIT.silenceMs;
    return (endsSentence(cues[e - 1].text) ? 2 : 0) + silence - (Math.abs(e - ideal) / (tol + 1)) * 0.5;
  };
  const parts = [];
  let from = 1;
  for (let index = 1; index < total; index++) {
    const ideal = balanced[index - 1].to;
    const lo = Math.max(from, ideal - tol);
    const hi = Math.min(count - (total - index), ideal + tol);
    let best = Math.min(Math.max(ideal, lo), hi);
    let bestScore = -Infinity;
    for (let e = lo; e <= hi; e++) {
      const s = score(e, ideal);
      if (s > bestScore || (s === bestScore && Math.abs(e - ideal) < Math.abs(best - ideal))) {
        best = e;
        bestScore = s;
      }
    }
    parts.push({ index, from, to: best });
    from = best + 1;
  }
  parts.push({ index: total, from, to: count });
  return parts;
}

/**
 * حد الرفع الذي تُقرأ به الأجزاء العربية معًا: عدد الملفات وحجم كل ملف، من قراءة الاستيراد نفسها (read-file.js).
 */
export const UPLOAD_LIMITS = Object.freeze({ files: MAX_FILES, bytes: MAX_FILE_BYTES });

// رأس المقطع في الملف: الرقم (حتى 6 أرقام) وسطر الزمن (29 محرفًا) وأسطر جديدة وسطر فاصل.
const HEADER_BYTES = 40;
const encoder = new TextEncoder();

/**
 * حجم الملف العربي المتوقع لكل مقطع: رأسه، ونصه بايتات UTF-8 ومثلها مرة أخرى بعدد محارفه، فالحرف العربي بايتان في UTF-8
 * والإنجليزي بايت واحد. تقدير أعلى، فيُرفض ما قد لا يُرفع ولا يُقبل ما يُرفض بعد الترجمة.
 * @param {{ text: string }[]} cues
 */
function uploadEstimates(cues) {
  return cues.map((c) => HEADER_BYTES + encoder.encode(String(c.text)).length + String(c.text).length);
}

/**
 * خطة التقسيم الاحتياطي ضمن حد الرفع (تدقيق 7a66f91، U31، القرار Q23): حجم الجزء لا يقل عن ceil(count/files)، فلا يتجاوز
 * عدد الأجزاء حد الملفات، ويُرفع الحجم المطلوب إليه بتنبيه (raised). وكل جزء بحجمه المتوقع ضمن حد البايتات، وإلا خطأ قبل
 * التنزيل: EX_SPLIT_PART_TOO_LARGE إن كان حجم أصغر يكفي، وEX_SPLIT_IMPOSSIBLE إن لم يكفِ أي حجم ضمن حد الملفات.
 * @param {{ startMs: number, endMs: number, text: string }[]} cues
 * @param {{ size: number, by?: 'count' | 'content' }} split
 * @param {{ files: number, bytes: number }} [limits]
 * @returns {{ ranges: { index: number, from: number, to: number }[], size: number, raised: boolean } | null} null إن لم يلزم تقسيم
 */
export function splitPlan(cues, split, limits = UPLOAD_LIMITS) {
  const minSize = Math.ceil(cues.length / limits.files);
  const size = Math.max(split.size, minSize);
  const plan = (n) => (split.by === 'content' ? planPartsByContent(cues, n) : planParts(cues.length, n));
  const ranges = plan(size);
  if (!ranges) return null;
  const est = uploadEstimates(cues);
  const fits = (rs) => rs.every((r) => {
    let sum = 0;
    for (let i = r.from - 1; i < r.to; i++) sum += est[i];
    return sum <= limits.bytes;
  });
  if (!fits(ranges)) {
    const smallest = size > minSize ? plan(minSize) : null;
    const max = `${Math.round((limits.bytes / (1024 * 1024)) * 10) / 10} م.ب`;
    throw new TjError(smallest && fits(smallest) ? 'EX_SPLIT_PART_TOO_LARGE' : 'EX_SPLIT_IMPOSSIBLE', { params: { max, files: limits.files } });
  }
  return { ranges, size, raised: size > split.size };
}
