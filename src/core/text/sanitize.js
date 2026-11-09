// التنقية الموحدة للنص الوارد من خارج الإضافة: نص الالتقاط، ونص ملف SRT المرفوع، وعنوان الفيديو، قبل التخزين وقبل التصدير.
// تزيل ما يخفي نصًا أو يقلب عرضه ولا يحتاجه أي نص مشروع:
// - محارف الوسوم U+E0000–U+E007F، وهي نص لا يُرى ويصل إلى النموذج (ومقبول أن يصير علم التقسيمات الفرعية علمًا أسود).
// - تضمين الاتجاه وتجاوزه U+202A–U+202E، وعزله U+2066–U+2069.
// - U+FEFF في أي موضع؛ وBOM في أول الملف يزيله المحلّل قبل وصول النص إلى هنا.
// وتبقى ZWSP وZWNJ وZWJ وLRM وRLM (U+200B–U+200F): مشروعة في الفارسية والأردية والتايلاندية وتسلسلات الإيموجي.
// (تُبنى من نص بتهريب مضاعف ليبقى المصدر مقروءًا بلا محارف خفية حرفية.)
const HIDDEN = new RegExp('[\\u{E0000}-\\u{E007F}\\u202A-\\u202E\\u2066-\\u2069\\uFEFF]', 'gu');

/**
 * @param {string} text
 * @returns {{ text: string, removed: number }} النص بعد التنقية وعدد المحارف المزالة
 */
export function sanitizeText(text) {
  let removed = 0;
  const clean = String(text).replace(HIDDEN, () => {
    removed++;
    return '';
  });
  return { text: clean, removed };
}

/**
 * تنقية نصوص مقاطع؛ المقطع السليم يبقى هو نفسه.
 * @template {{ text: string }} C
 * @param {C[]} cues
 * @returns {{ cues: C[], removed: number }}
 */
export function sanitizeCues(cues) {
  let removed = 0;
  const out = cues.map((c) => {
    const r = sanitizeText(c.text);
    removed += r.removed;
    return r.removed ? { ...c, text: r.text } : c;
  });
  return { cues: out, removed };
}
