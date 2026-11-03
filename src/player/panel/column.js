// عمود يوتيوب الثانوي (docs/identity-redesign.md §٤): مضيف اللوحة أول أبنائه، فيضعه يوتيوب يمين الفيديو في التخطيط العريض
// وتحته في الضيق ووضع المسرح، ولا يغطي الفيديو ولا أدواته ولا يدفع الصفحة. هنا وحدها محددات هذا العمود (مثل محددات
// youtube-dom.js: غير رسمية، فالحاجة إلى تغييرها في ملف واحد)، وقراءة هندسة المشغّل والعمود.

/** بالترتيب: الداخلي ثم الخارجي، داخل ytd-watch-flexy أولًا ثم مطلقًا (احتياط لتغيّر البنية). */
export const COLUMN_SELECTORS = Object.freeze([
  'ytd-watch-flexy #secondary-inner',
  'ytd-watch-flexy #secondary',
  '#secondary-inner',
  '#secondary',
]);

/** ارتفاع احتياطي للوحة قبل أن يُعرف ارتفاع المشغّل. */
export const FALLBACK_HEIGHT = 480;

/** @param {Document} doc @returns {HTMLElement | null} */
export function findColumn(doc) {
  for (const sel of COLUMN_SELECTORS) {
    const found = doc.querySelector(sel);
    if (found) return found;
  }
  return null;
}

/**
 * يضع المضيف أول ابن في العمود (أو يتركه إن كان كذلك). يوتيوب قد يعيد رسم العمود أو يدرج قبل المضيف عنصرًا، فيُستدعى
 * عند كل فحص دوري.
 * @param {HTMLElement} host @param {HTMLElement} column
 * @returns {boolean} هل نُقل أو أُدرج
 */
export function placeHost(host, column) {
  const first = column.firstElementChild ?? column.firstChild;
  if (host.parentNode === column && first === host) return false;
  column.insertBefore(host, column.firstChild);
  return true;
}

/**
 * العمود بجانب المشغّل (تخطيط عريض: يبدأ فوق نهاية المشغّل ولا يتداخل معه أفقيًا) أم تحته. لا هندسة معروفة ← تحته (الأحذر).
 * @param {{ top: number, left: number, right: number, bottom: number, width: number } | null} player
 * @param {{ top: number, left: number, right: number, width: number } | null} column
 */
export function isBeside(player, column) {
  if (!player || !column || !(player.width > 0) || !(column.width > 0)) return false;
  const apart = column.left >= player.right - 4 || column.right <= player.left + 4;
  return apart && column.top < player.bottom - 4;
}
