// سبب الرفض (الفكرة ٤-ب، الجولة الثالثة، ح-38): رمز قصير من قائمة مغلقة يحدد موضع الرفض داخل رمزه (EX_…)، فيُقرأ في تشخيص الصفحة
// بلا نص ولا رابط: التدحرج من غيره تحت EX_UNSUPPORTED_FORMAT، والحالة من الجسم الفارغ تحت EX_EMPTY_BODY. كل رفض في القبول
// (src/extract/capture-adapter.js) والتحليل (json3.js) والتحويل (asr.js وindex.js) يحمل واحدًا منها، والتشخيص يمرّره بـreasonOf.

export const REASONS = Object.freeze([
  // القبول: الفيديو، واللغة، والجسم، والصيغة، والبث. وxhr-document رد XHR بنوع document لا يُقرأ نصه (الإنذار المبكر).
  'no-video', 'wrong-video', 'bad-v', 'bad-lang', 'bad-tlang', 'status', 'truncated', 'blank', 'xhr-document',
  'fmt-srv3', 'fmt-vtt', 'fmt-other', 'default-not-json', 'live',
  // التحليل (json3)، والجسم الفارغ عنده blank كما في القبول.
  'not-json', 'no-events', 'bad-event', 'bad-start', 'no-text-events',
  // التحويل: التدحرج بأساسه (عقد الاستخراج)، والثوابت، وفشل ثابت الحدود وحده.
  'rolling-time', 'rolling-pattern', 'invariant', 'beyond-duration',
  // ما ليس سببه من القائمة.
  'other',
]);

/**
 * سبب رفض صيغة لا محلّل لها (القبول، وسجل المحلّلات في index.js): fmt-srv3 وfmt-vtt باسميهما، وdefault-not-json لطلب بلا fmt جسمه
 * ليس JSON، وfmt-other لما سواها.
 * @param {string} format صنف fmt (FORMATS في src/extract/timedtext-params.js)
 */
export const formatReason = (format) => (format === 'srv3' ? 'fmt-srv3' : format === 'vtt' ? 'fmt-vtt' : format === 'default' ? 'default-not-json' : 'fmt-other');

/**
 * سبب x (خطأ أو قرار قبول أو تقرير تحويل) إن كان من القائمة، وإلا 'other'؛ فلا يعبر التشخيصَ نصٌّ حر.
 * @param {unknown} x
 * @returns {string}
 */
export function reasonOf(x) {
  const r = x !== null && typeof x === 'object' ? /** @type {{ reason?: unknown }} */ (x).reason : undefined;
  return typeof r === 'string' && REASONS.includes(r) ? r : 'other';
}
