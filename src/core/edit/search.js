// البحث والاستبدال المخطط في المحرّر (R51). البحث بتطبيع للمطابقة وحدها: تفكيك NFD، وحالة الأحرف اللاتينية، والمسافات
// وفواصل الأسطر مسافة؛ ومع ignoreMarks تسقط علامات التشكيل والتطويل (فتطابق «كتب» «كَتَبَ»، وتطابق ا «أ» و«إ» و«آ» لأن
// الهمزة والمدة علامتان بعد التفكيك). المواضع بمحارف النص الأصلي، والمطابقة تشمل ما يليها من تشكيل. الاستبدال حرفي في
// تلك المواضع وحدها: لا يمس التوقيت ولا الرقم ولا المرجع الإنجليزي، ولا استبدال لغويًا تخمينيًا.

/** @typedef {import('../model/cue.js').Cue} Cue */
/** @typedef {{ index: number, start: number, end: number }} Match */

const TATWEEL = String.fromCharCode(0x0640);
const MARKS = /\p{M}/gu;
const WORD = /[\p{L}\p{N}\p{M}]/u;

/**
 * الصورة المطبّعة ومواضع كل وحدة فيها في الأصل.
 * @param {string} text @param {boolean} ignoreMarks
 * @returns {{ norm: string, starts: number[], ends: number[] }}
 */
function normalize(text, ignoreMarks) {
  let norm = '';
  const starts = [];
  const ends = [];
  let at = 0;
  for (const ch of text) {
    let piece = ch.normalize('NFD');
    if (ignoreMarks) piece = piece.replace(MARKS, '').split(TATWEEL).join('');
    piece = piece.replace(/\s/gu, ' ').toLowerCase();
    for (let k = 0; k < piece.length; k++) {
      starts.push(at);
      ends.push(at + ch.length);
    }
    norm += piece;
    at += ch.length;
  }
  return { norm, starts, ends };
}

/**
 * @param {Cue[]} cues
 * @param {string} query
 * @param {{ field?: 'ar' | 'en', english?: string[] | null, wholeWord?: boolean, ignoreMarks?: boolean }} [opts]
 *   english نص المرجع لكل مقطع بطول المقاطع (englishReference)، للبحث فيه قراءةً فقط.
 * @returns {Match[]} index موضع المقطع، وstart وend حدّا المطابقة في نصه (أو في مرجعه) بالترتيب، بلا تداخل
 */
export function searchCues(cues, query, { field = 'ar', english = null, wholeWord = false, ignoreMarks = false } = {}) {
  if (typeof query !== 'string') return [];
  const q = normalize(query, ignoreMarks).norm;
  if (!q.trim()) return [];
  const out = [];
  cues.forEach((cue, index) => {
    const text = field === 'en' ? english?.[index] : cue.text;
    if (typeof text !== 'string' || !text) return;
    const { norm, starts, ends } = normalize(text, ignoreMarks);
    let from = 0;
    for (;;) {
      const k = norm.indexOf(q, from);
      if (k < 0) break;
      const last = k + q.length - 1;
      // حدّا المطابقة على حدود محارف المصدر: لا تبدأ ولا تنتهي داخل محرف مركّب فُكّك (ا داخل أ، وe داخل é).
      const splitsChar = (k > 0 && starts[k] === starts[k - 1]) || (last + 1 < norm.length && starts[last + 1] === starts[last]);
      if (splitsChar) {
        from = k + 1;
        continue;
      }
      if (wholeWord && ((k > 0 && WORD.test(norm[k - 1])) || (last + 1 < norm.length && WORD.test(norm[last + 1])))) {
        from = k + 1;
        continue;
      }
      // ما بين آخر محرف مطابق والمحرف المطبّع التالي تشكيل سقط في التطبيع: يدخل في المطابقة.
      const end = last + 1 < norm.length ? starts[last + 1] : text.length;
      out.push({ index, start: starts[k], end: Math.max(ends[last], end) });
      from = last + 1;
    }
  });
  return out;
}

/**
 * خطة استبدال حرفي في المواضع المختارة من نتائج البحث في العربية.
 * @param {Cue[]} cues
 * @param {Match[]} matches نتائج searchCues بالحقل ar
 * @param {string} replacement نص حرفي (لا أنماط)
 * @param {{ only?: number[] }} [opts] مواضع المطابقات المختارة في matches (الافتراضي كلها)
 * @returns {{ changes: { index: number, n: number, before: string, after: string }[] }} مقطع لكل تغيير بترتيب المقاطع
 * @throws {RangeError} لمطابقة خارج نصها أو متداخلة
 */
export function planReplace(cues, matches, replacement, { only } = {}) {
  if (typeof replacement !== 'string') throw new RangeError('نص الاستبدال ليس نصًا');
  const pick = Array.isArray(only) ? new Set(only) : null;
  const byCue = new Map();
  matches.forEach((m, k) => {
    if (pick && !pick.has(k)) return;
    const cue = cues[m.index];
    if (!cue || !Number.isInteger(m.start) || !Number.isInteger(m.end) || m.start < 0 || m.end <= m.start || m.end > cue.text.length) {
      throw new RangeError(`مطابقة غير صالحة عند ${k}`);
    }
    if (!byCue.has(m.index)) byCue.set(m.index, []);
    byCue.get(m.index).push(m);
  });
  const changes = [];
  for (const index of [...byCue.keys()].sort((a, b) => a - b)) {
    const list = byCue.get(index).sort((a, b) => a.start - b.start);
    list.forEach((m, i) => { if (i && m.start < list[i - 1].end) throw new RangeError(`مطابقتان متداخلتان في المقطع ${index}`); });
    const before = cues[index].text;
    let after = before;
    for (let i = list.length - 1; i >= 0; i--) after = after.slice(0, list[i].start) + replacement + after.slice(list[i].end);
    if (after !== before) changes.push({ index, n: cues[index].n, before, after });
  }
  return { changes };
}
