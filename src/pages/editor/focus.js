// التركيز عبر إعادة رسم لوحة (تدقيق 7a66f91، U22): لوحات المحرّر الجانبية تُعاد بـreplaceChildren مع كل تغيير، فينفصل العنصر
// المركّز فيها ويسقط التركيز إلى body (وقارئ الشاشة يفقد موضعه). هنا يُستعاد على نظيره بعد الرسم: العنصر بالوسم والمجموعة
// والموضع والصنف والاسم نفسها، وإلا اللوحة نفسها (كزر «إزالة العلامات اليتيمة» بعد زوال قسمه). لا يمس ما لم يكن داخلها.

const FOCUSABLE = 'button, input, select, textarea, summary, a';

/** مفتاح العنصر عبر إعادة البناء: لا يتغير بتغيّر حالته (المؤشر والقيمة). @param {Element} n */
const keyOf = (n) => {
  const label = n.getAttribute('aria-label');
  return [
    n.tagName, n.getAttribute('data-group') ?? '', n.getAttribute('data-index') ?? '', n.getAttribute('data-tab') ?? '', n.className,
    label ?? '', label ? '' : (n.textContent ?? '').replace(/\s+/g, ' ').trim(),
  ].join('|');
};

/**
 * يرسم اللوحة ثم يعيد التركيز إلى نظير العنصر الذي كان مركّزًا فيها.
 * @param {HTMLElement} box @param {() => void} render
 */
export function keepFocus(box, render) {
  const doc = box.ownerDocument;
  const active = doc.activeElement;
  if (!active || active === box || !box.contains(active)) {
    render();
    return;
  }
  const key = keyOf(active);
  const at = [...box.querySelectorAll(FOCUSABLE)].filter((n) => keyOf(n) === key).indexOf(active);
  render();
  if (box.contains(active)) return;
  const peers = [...box.querySelectorAll(FOCUSABLE)].filter((n) => keyOf(n) === key);
  const target = peers[Math.max(0, at)] ?? peers[0];
  if (target) {
    target.focus({ preventScroll: true });
    return;
  }
  if (!box.hasAttribute('tabindex')) box.setAttribute('tabindex', '-1');
  box.focus({ preventScroll: true });
}
