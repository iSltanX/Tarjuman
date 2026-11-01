// اختيار البصمة للمقارنة (عقد interfaces §٦): الأحدث بين المطابقة عددًا لمقاطع الملف، وإلا الأحدث مطلقًا.
// عند تساوي الزمن تفوز الأخيرة في القائمة (أُضيفت لاحقًا).

/** @typedef {import('../model/tracks.js').Fingerprint} Fingerprint */

const newest = (list) => list.reduce((best, f) => (best === null || Date.parse(f.createdAt) >= Date.parse(best.createdAt) ? f : best), null);

/**
 * @param {Fingerprint[] | null | undefined} fingerprints بصمات الفيديو المحفوظة
 * @param {number} count عدد مقاطع الملف المستورد
 * @returns {Fingerprint | null}
 */
export function selectFingerprint(fingerprints, count) {
  if (!Array.isArray(fingerprints) || !fingerprints.length) return null;
  return newest(fingerprints.filter((f) => f.count === count)) ?? newest(fingerprints);
}
