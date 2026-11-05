// حفظ التركيز عبر إعادة بناء القائمة والتوسيع: إعادة الرسم تهدم العقدة المركّزة فيسقط التركيز إلى body (فيضيع مستخدم لوحة
// المفاتيح بعد «تفعيل» أو حفظ اسم أو حذف). لكل عنصر تفاعلي data-fk فريد بمعرّف فيديوه («AAAAAAAAAAA:card-2:activate»)؛
// يُلتقط قبل الرسم ويُعاد بعده، وإن زال العنصر (بطاقة حُذفت) فإلى أول بديل موجود من قائمة بدائل بالترتيب. وبند قائمة مفتوحة
// بلا مفتاح يُلتقط بمفتاح زر قائمته (تدقيق 7a66f91، U58)، فيعود التركيز إلى «المزيد» الجديد بعد تحديث في الخلفية.

/**
 * مفتاح العنصر المركّز إن كان داخل الجذر: مفتاحه، أو مفتاح زر القائمة التي هو فيها.
 * @param {Document} doc @param {HTMLElement} root @returns {string | null}
 */
export function captureFocus(doc, root) {
  const a = doc.activeElement;
  if (!a || a === doc.body || !root.contains(a)) return null;
  const own = a.getAttribute?.('data-fk') ?? null;
  if (own) return own;
  for (let n = a.parentNode; n && n !== root; n = n.parentNode) {
    if (n.classList?.contains('tj-menu')) return n.querySelector('.tj-menu__button')?.getAttribute('data-fk') ?? null;
  }
  return null;
}

/**
 * يعيد التركيز إلى المفتاح أو أول بديل موجود. البديل نص يُبحث عنه في الجذر، أو { key, scope } يُبحث عنه في نطاق آخر
 * (زر التوسيع خارج جذر التوسيع، في صفه). يعيد العنصر الذي رُكّز أو null.
 * @param {HTMLElement} root @param {string | null} fk
 * @param {string | null | (string | { key: string, scope: HTMLElement | null } | null)[]} [fallback]
 * @returns {HTMLElement | null}
 */
export function restoreFocus(root, fk, fallback = null) {
  if (!fk) return null;
  const list = [fk, ...(Array.isArray(fallback) ? fallback : [fallback])];
  for (const f of list) {
    if (!f) continue;
    const key = typeof f === 'string' ? f : f.key;
    const scope = typeof f === 'string' ? root : f.scope;
    const node = scope?.querySelector(`[data-fk="${key}"]`) ?? null;
    if (!node) continue;
    node.focus?.({ preventScroll: true });
    // المخفي والمعطّل لا يقبلان التركيز: يُجرَّب البديل التالي.
    if (node.ownerDocument?.activeElement === node) return node;
  }
  return null;
}

/** مفتاح بديل: زر توسيع الصف نفسه. @param {string} fk */
export const toggleKeyOf = (fk) => `${fk.split(':')[0]}:toggle`;
