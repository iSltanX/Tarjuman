// حارس الملف الثنائي عند الاستيراد (الفكرة ١١، ح-49): ملف صدّره ترجمان «مع الأصل» (src/core/export/bilingual.js) ثم رُفع ترجمةً
// يُحفظ نصه «الترجمة ثم الأصل» بصمت، ولا يلتقطه فحص «غير مترجم» لوجود حروف لغة الترجمة فيه. فإن طابق آخرُ سطر في أكثر مقاطعه
// (فوق النصف) نصَّ الأصل المحاذي له (originalLookup على مسار أصل محفوظ، EnglishTrack.cues، كما في لوحة النص) أو نصَّ مقطع أصل
// بعينه (فلا تُفوّته إزاحة صُدِّر بها الملف «بتوقيت المشاهدة»)، كان تحذيرًا برمز IM_BILINGUAL في مراجعة الاستيراد، ومعه
// «أزل سطر الأصل من كل مقطع» بنقرة: لا يُزال شيء قبلها، ولا يُرفض الملف. وبلا أصل محفوظ لا حارس (قيد معروف). منطق نقي بلا DOM.
import { flatText, originalLookup } from '../align/original.js';
import { sanitizeText } from '../text/sanitize.js';

/** @typedef {import('../model/cue.js').Cue} Cue */
/** @typedef {{ code: 'IM_BILINGUAL', count: number, total: number, indexes: number[], lang: string | null }} Bilingual */

const TAG_RE = /<\/?[A-Za-z][^<>]*>|\{\\[^{}]*\}/g;
/** صورة سطر للمقارنة وحدها (لا تغيّر نصًا): بلا محارف مخفية ولا وسوم تنسيق، وكيانات WebVTT الثلاثة مفكوكة، ومسافاته موحّدة. */
const form = (s) => sanitizeText(String(s)).text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(TAG_RE, '')
  .replace(/\s+/g, ' ')
  .trim();

/**
 * هل الملف الوارد ثنائي اللغة بمسار أصل محفوظ؟ يُوازن بكل مسار ويُؤخذ أكثرها مطابقة. المقطع ذو السطر الواحد لا يُعدّ (المقطع غير
 * المترجم شأن فحص «غير مترجم»)، والحكم بأكثر من نصف مقاطع الملف، فاسم لاتيني في سطر أخير من مقاطع قليلة لا ينذر.
 * @param {Cue[]} cues مقاطع الملف الوارد كما قُرئت
 * @param {{ lang?: string, cues?: Cue[] }[] | null | undefined} tracks مسارات الأصل المحفوظة للفيديو (record.english)
 * @returns {Bilingual | null}
 */
export function bilingualCheck(cues, tracks) {
  if (!Array.isArray(cues) || !cues.length || !Array.isArray(tracks)) return null;
  let best = null;
  for (const t of tracks) {
    const original = Array.isArray(t?.cues) ? t.cues : [];
    if (!original.length) continue;
    const lookup = originalLookup(original);
    const singles = new Set(original.map((c) => form(flatText(c.text))).filter(Boolean));
    const indexes = [];
    cues.forEach((c, i) => {
      const lines = String(c.text).split('\n');
      if (lines.length < 2) return;
      const last = form(lines[lines.length - 1]);
      if (last && (singles.has(last) || last === form(lookup(c.startMs, c.endMs)))) indexes.push(i);
    });
    if (!best || indexes.length > best.indexes.length) best = { indexes, lang: typeof t.lang === 'string' ? t.lang : null };
  }
  if (!best || best.indexes.length * 2 <= cues.length) return null;
  return { code: 'IM_BILINGUAL', count: best.indexes.length, total: cues.length, indexes: best.indexes, lang: best.lang };
}

/**
 * المقاطع بلا آخر سطر حيث طابق الأصل (indexes من bilingualCheck)، وغيرها كما هو. لا يغيّر المدخلات.
 * @template {{ text: string }} C @param {C[]} cues @param {number[]} indexes @returns {C[]}
 */
export function withoutLastLines(cues, indexes) {
  const drop = new Set(indexes);
  return cues.map((c, i) => (drop.has(i) ? { ...c, text: String(c.text).split('\n').slice(0, -1).join('\n') } : c));
}
