// حفظ التركيز عبر إعادة بناء القائمة والتوسيع: إعادة الرسم تهدم العقدة المركّزة فيسقط التركيز إلى body (فيضيع مستخدم لوحة
// المفاتيح بعد «تفعيل» أو حفظ اسم أو حذف). لكل عنصر تفاعلي data-fk فريد بمعرّف فيديوه («AAAAAAAAAAA:card-2:activate»)؛
// يُلتقط قبل الرسم ويُعاد بعده، وإن زال العنصر (بطاقة حُذفت) فإلى بديله (زر التوسيع في صفه).

/** مفتاح العنصر المركّز إن كان داخل الجذر وله مفتاح. @param {Document} doc @param {HTMLElement} root @returns {string | null} */
export function captureFocus(doc, root) {
  const a = doc.activeElement;
  if (!a || a === doc.body || !root.contains(a)) return null;
  return a.getAttribute?.('data-fk') ?? null;
}

/** @param {HTMLElement} root @param {string | null} fk @param {string | null} [fallback] */
export function restoreFocus(root, fk, fallback = null) {
  if (!fk) return;
  const find = (k) => root.querySelector(`[data-fk="${k}"]`);
  (find(fk) ?? (fallback ? find(fallback) : null))?.focus?.({ preventScroll: true });
}

/** مفتاح بديل: زر توسيع الصف نفسه. @param {string} fk */
export const toggleKeyOf = (fk) => `${fk.split(':')[0]}:toggle`;
