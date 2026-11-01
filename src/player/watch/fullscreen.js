// موضع المضيف في ملء الشاشة (P5-AC4): في الحالة المعتادة عنصر ملء الشاشة هو #movie_player أو أحد آبائه، فالطبقة
// المركّبة داخل المشغّل ظاهرة معه. وإن كان عنصر ملء الشاشة غريبًا عن المشغّل (طبقة عليا لا تحوي المشغّل) فبديل النقل:
// يوضع المضيف داخل document.fullscreenElement حتى يخرج المستخدم، ثم يعود إلى المشغّل.

// عناصر لا ترسم أبناءها فلا يصلح نقل المضيف إليها.
const NO_CHILDREN = new Set(['video', 'audio', 'img', 'canvas', 'iframe', 'object', 'embed', 'input', 'textarea', 'select']);

/**
 * @param {Document} doc
 * @param {HTMLElement} player
 * @returns {{ parent: Element, reason: 'normal' | 'ancestor' | 'moved' | 'unreachable' }}
 */
export function hostParent(doc, player) {
  const fs = doc.fullscreenElement;
  if (!fs) return { parent: player, reason: 'normal' };
  if (fs === player || fs.contains(player)) return { parent: player, reason: 'ancestor' };
  // عنصر ملء الشاشة داخل المشغّل (مثل video) أو لا يرسم أبناءه: لا مكان للمضيف فيه ولا فوقه.
  if (player.contains(fs) || NO_CHILDREN.has(String(fs.tagName).toLowerCase())) return { parent: player, reason: 'unreachable' };
  return { parent: fs, reason: 'moved' };
}
