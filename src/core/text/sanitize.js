// التنقية الموحدة للنص الوارد من خارج الإضافة: نص الالتقاط، ونص ملف SRT المرفوع، وعنوان الفيديو، قبل التخزين وقبل التصدير.
// تزيل ما يخفي نصًا أو يقلب عرضه ولا يحتاجه أي نص مشروع:
// - الكتلة U+E0000–U+E0FFF كلها: محارف الوسوم (نص لا يُرى يصل إلى النموذج، ومقبول أن يصير علم التقسيمات الفرعية علمًا أسود)،
//   ومكمّل محددات التنويع U+E0100–U+E01EF، وغير المعيّن المتجاهَل افتراضيًا؛ كما في تنقية العنوان (ع-١٧).
// - محددات التنويع U+FE00–U+FE0D، وU+FE0E وU+FE0F إلا واحدًا بعد محرف إيموجي (عرض الإيموجي نصًا أو صورة، ❤ مع VS16):
//   تتابع المحددات يحمل حمولة مرمّزة لا تُرى ولا تكوّن تسلسل تنويع (ع-١٧).
// - تضمين الاتجاه وتجاوزه U+202A–U+202E، وعزله U+2066–U+2069.
// - WJ ومحارف الرياضيات الخفية U+2060–U+2064، والمهملة U+206A–U+206F، وعلامات التعليق U+FFF9–U+FFFB (ع-١٧).
// - U+FEFF في أي موضع؛ وBOM في أول الملف يزيله المحلّل قبل وصول النص إلى هنا.
// - البديل اليتيم (نصف زوج UTF-16) ليس نصًا: يُزال من كل قطعة قبل وصلها، فلا يلتئم بديلان من قطعتين محرفًا مخفيًا (ع-١٧).
// وتبقى ZWSP وZWNJ وZWJ وLRM وRLM (U+200B–U+200F): مشروعة في الفارسية والأردية والتايلاندية وتسلسلات الإيموجي.
// (تُبنى من نص بتهريب مضاعف ليبقى المصدر مقروءًا بلا محارف خفية حرفية.)
const HIDDEN = new RegExp(
  '[\\u{E0000}-\\u{E0FFF}\\uFE00-\\uFE0D\\u202A-\\u202E\\u2060-\\u2064\\u2066-\\u2069\\u206A-\\u206F\\uFEFF\\uFFF9-\\uFFFB\\uD800-\\uDFFF]'
  + '|(?<!\\p{Emoji})[\\uFE0E\\uFE0F]',
  'gu',
);
// محارف التحكم C0 وC1 عدا الجدول وفواصل الأسطر والصفحات (مسافات يوحّدها التحويل): ليست نصًا. تُزال بـcontrols من نص الالتقاط
// ومن ملف الأصل المصدَّر (ع-١٧)؛ والمحلّل المتسامح يزيلها بنفسه بملاحظتها (IM_NOTE_CONTROL)، فلا تُعدّ عنده محارف مخفية.
const CONTROLS = new RegExp('[\\u0000-\\u0008\\u000E-\\u001F\\u007F-\\u009F]', 'gu');

/**
 * @param {string} text
 * @param {{ controls?: boolean }} [o] controls: وتُزال محارف التحكم C0 وC1 أيضًا
 * @returns {{ text: string, removed: number }} النص بعد التنقية وعدد المحارف المزالة
 */
export function sanitizeText(text, { controls = false } = {}) {
  let removed = 0;
  const drop = () => {
    removed++;
    return '';
  };
  let clean = String(text).replace(HIDDEN, drop);
  if (controls) clean = clean.replace(CONTROLS, drop);
  return { text: clean, removed };
}

/**
 * تنقية نصوص مقاطع؛ المقطع السليم يبقى هو نفسه.
 * @template {{ text: string }} C
 * @param {C[]} cues
 * @param {{ controls?: boolean }} [o] كما في sanitizeText
 * @returns {{ cues: C[], removed: number }}
 */
export function sanitizeCues(cues, o) {
  let removed = 0;
  const out = cues.map((c) => {
    const r = sanitizeText(c.text, o);
    removed += r.removed;
    return r.removed ? { ...c, text: r.text } : c;
  });
  return { cues: out, removed };
}
