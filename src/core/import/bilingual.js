// حارس الملف الثنائي عند الاستيراد (الفكرة ١١، ح-49): ملف صدّره ترجمان «مع الأصل» (src/core/export/bilingual.js) ثم رُفع ترجمةً
// يُحفظ نصه «الترجمة ثم الأصل» بصمت، ولا يلتقطه فحص «غير مترجم» لوجود حروف لغة الترجمة فيه. فإن طابق آخرُ سطر في أكثر مقاطعه
// (فوق النصف) نصَّ الأصل المحاذي له (originalLookup على مسار أصل محفوظ، EnglishTrack.cues، كما في لوحة النص)، كان تحذيرًا برمز
// IM_BILINGUAL في مراجعة الاستيراد، ومعه «أزل سطر الأصل من كل مقطع» بنقرة: لا يُزال شيء قبلها، ولا يُرفض الملف. وبلا أصل محفوظ
// لا حارس (قيد معروف). منطق نقي بلا DOM.
// تحقق 2.3.0 (ص-١ وص-٢٣، بقرار سلطان): المحاذاة بعد تقدير فرق الزمن بين الملف والأصل المحفوظ (shiftCandidates)، فلا تُفوّته إزاحة
// صُدِّر بها «بتوقيت المشاهدة» ولو ضُمّ في سطر أصله مقطعان (كانت المطابقة بنص مقطع أصل بعينه، فالتقطت 498 من 729 في ترجمة ميدواي
// «مقاطع أطول» بإزاحة +1.5 ث). وتلك المطابقة بلا زمن أُسقطت، فملف بلغة الأصل وحدها كل مقطع فيه مقطعا أصل سطرًا تحت سطر لا يُحكم
// ثنائيًا (كان 213 من 213، و«الإزالة» تحذف كلامًا مشروعًا). والثنائي المعكوس (سطر الأصل أول المقطع والترجمة تحته) يُعرف كذلك
// (line: 'first')، وتُزيل النقرة أول سطر فيه.
import { flatText, originalLookup } from '../align/original.js';
import { isValidOffset } from '../model/timing.js';
import { sanitizeText } from '../text/sanitize.js';

/** @typedef {import('../model/cue.js').Cue} Cue */
/** @typedef {'last' | 'first'} OriginalLine موضع سطر الأصل في المقطع: آخره كما يصدّر ترجمان، أو أوله في الثنائي المعكوس */
/** @typedef {{ code: 'IM_BILINGUAL', count: number, total: number, indexes: number[], lang: string | null, line: OriginalLine }} Bilingual */

const TAG_RE = /<\/?[A-Za-z][^<>]*>|\{\\[^{}]*\}/g;
/** صورة سطر للمقارنة وحدها (لا تغيّر نصًا): بلا محارف مخفية ولا وسوم تنسيق، وكيانات WebVTT الثلاثة مفكوكة، ومسافاته موحّدة. */
const form = (s) => sanitizeText(String(s)).text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(TAG_RE, '')
  .replace(/\s+/g, ' ')
  .trim();

/** نص أصل يتكرر في المسار أكثر من هذا (كـ«[Music]») لا يُقدَّر به فرق الزمن: فروقه كثيرة ولا تدل على موضع. */
const MAX_ANCHOR_REPEAT = 3;
/** عدد الفروق الأكثر تكرارًا التي تُجرَّب بعد الصفر. */
const SHIFT_TRIES = 3;

/**
 * فروق الزمن المرشّحة بين الملف الوارد والأصل المحفوظ: الصفر أولًا، ثم أكثر الفروق تكرارًا بين بداية مقطع في الملف وبداية مقطع أصل
 * نصه أول سطر الأصل فيه (السطر الأخير أو الأول، إلى حد كلمة). فالمقطع الذي ضُمّ في سطر أصله مقطعان يدل بأولهما، ويبدأ المقطع
 * في الزمن المحفوظ حيث يبدأ أصله الأول. والفرق إزاحة صالحة وحدها (isValidOffset: شبكة 100 م.ث وحد ±10 دقائق)، لأن ترجمان لا يزيح
 * الملف المصدَّر إلا بإزاحة العرض كلها (exportTiming)، فلا يُرشَّح فرق عابر.
 * @param {{ startMs: number, first: string, last: string }[]} rows @param {Cue[]} original @returns {number[]}
 */
function shiftCandidates(rows, original) {
  const starts = new Map();
  let longest = 0;
  for (const o of original) {
    const k = form(flatText(o.text));
    if (!k) continue;
    const list = starts.get(k);
    if (list) list.push(o.startMs);
    else starts.set(k, [o.startMs]);
    longest = Math.max(longest, k.length);
  }
  const tally = new Map();
  for (const r of rows) {
    for (const text of r.first === r.last ? [r.last] : [r.last, r.first]) {
      for (let end = text.indexOf(' '); ; end = text.indexOf(' ', end + 1)) {
        const cut = end === -1 ? text.length : end;
        if (cut > longest) break;
        const list = starts.get(text.slice(0, cut));
        if (list && list.length <= MAX_ANCHOR_REPEAT) {
          for (const s of list) {
            const d = r.startMs - s;
            if (d !== 0 && isValidOffset(d)) tally.set(d, (tally.get(d) ?? 0) + 1);
          }
        }
        if (end === -1) break;
      }
    }
  }
  const top = [...tally].sort((a, b) => b[1] - a[1] || Math.abs(a[0]) - Math.abs(b[0])).slice(0, SHIFT_TRIES).map(([d]) => d);
  return [0, ...top];
}

/**
 * هل الملف الوارد ثنائي اللغة بمسار أصل محفوظ؟ لكل مسار وكل فرق زمن مرشّح (shiftCandidates) يُقابَل آخر سطر في المقطع وأول سطر فيه
 * بنص الأصل المحاذي لزمنه بعد طرح الفرق، ويُؤخذ أكثرها مطابقة (والآخر عند التساوي، فهو ما يصدّره ترجمان). المقطع ذو السطر الواحد لا
 * يُعدّ (المقطع غير المترجم شأن فحص «غير مترجم»)، والحكم بأكثر من نصف مقاطع الملف، فاسم لاتيني في سطر أخير من مقاطع قليلة لا ينذر.
 * والمطابقة بالمحاذاة وحدها، لا بنص مقطع أصل في أي موضع: فالسطر الذي هو أصلٌ والمقطع يغطي غيره معه (ملف بلغة الأصل وحدها دمج
 * مقطعين سطرًا تحت سطر) لا يُعدّ.
 * @param {Cue[]} cues مقاطع الملف الوارد كما قُرئت
 * @param {{ lang?: string, cues?: Cue[] }[] | null | undefined} tracks مسارات الأصل المحفوظة للفيديو (record.english)
 * @returns {Bilingual | null}
 */
export function bilingualCheck(cues, tracks) {
  if (!Array.isArray(cues) || !cues.length || !Array.isArray(tracks)) return null;
  const rows = [];
  cues.forEach((c, i) => {
    const lines = String(c.text).split('\n');
    if (lines.length >= 2) rows.push({ i, startMs: c.startMs, endMs: c.endMs, first: form(lines[0]), last: form(lines[lines.length - 1]) });
  });
  if (rows.length * 2 <= cues.length) return null;
  let best = null;
  for (const t of tracks) {
    const original = Array.isArray(t?.cues) ? t.cues : [];
    if (!original.length) continue;
    const lookup = originalLookup(original);
    const lang = typeof t.lang === 'string' ? t.lang : null;
    for (const shift of shiftCandidates(rows, original)) {
      const found = { last: [], first: [] };
      for (const r of rows) {
        const aligned = form(lookup(r.startMs - shift, r.endMs - shift));
        if (!aligned) continue;
        if (r.last === aligned) found.last.push(r.i);
        if (r.first === aligned) found.first.push(r.i);
      }
      for (const line of /** @type {const} */ (['last', 'first'])) {
        if (!best || found[line].length > best.indexes.length) best = { indexes: found[line], lang, line };
      }
    }
  }
  if (!best || best.indexes.length * 2 <= cues.length) return null;
  return { code: 'IM_BILINGUAL', count: best.indexes.length, total: cues.length, indexes: best.indexes, lang: best.lang, line: best.line };
}

/**
 * المقاطع بلا آخر سطر حيث طابق الأصل (indexes من bilingualCheck)، وغيرها كما هو. لا يغيّر المدخلات.
 * @template {{ text: string }} C @param {C[]} cues @param {number[]} indexes @returns {C[]}
 */
export function withoutLastLines(cues, indexes) {
  const drop = new Set(indexes);
  return cues.map((c, i) => (drop.has(i) ? { ...c, text: String(c.text).split('\n').slice(0, -1).join('\n') } : c));
}

/**
 * المقاطع بلا سطر الأصل حيث طابق (bilingualCheck): آخر سطر، أو أوله في الثنائي المعكوس (line: 'first')، وغيرها كما هو. لا يغيّر
 * المدخلات.
 * @template {{ text: string }} C @param {C[]} cues @param {{ indexes: number[], line?: OriginalLine }} bilingual @returns {C[]}
 */
export function withoutMatchedLines(cues, { indexes, line = 'last' }) {
  if (line !== 'first') return withoutLastLines(cues, indexes);
  const drop = new Set(indexes);
  return cues.map((c, i) => (drop.has(i) ? { ...c, text: String(c.text).split('\n').slice(1).join('\n') } : c));
}
