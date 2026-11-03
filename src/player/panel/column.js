// عمود يوتيوب الثانوي (docs/identity-redesign.md §٤): مضيف اللوحة أول أبنائه، فيضعه يوتيوب يمين الفيديو في التخطيط العريض
// وتحته في وضع المسرح، ولا يغطي الفيديو ولا أدواته. وفي تخطيط العمود الواحد (عرض ضيق، `is-single-column`) يُخفي يوتيوب
// العمود الثانوي كله وينقل مقترحاته إلى #below، فتنتقل اللوحة إلى #below بعد بيانات الفيديو (العنوان والقناة) كما في لوحة
// WatchNarrow، وتعود إلى العمود بعودة العمودين. هنا وحدها محددات هذه المواضع (مثل محددات youtube-dom.js: غير رسمية،
// فالحاجة إلى تغييرها في ملف واحد)، وقراءة هندسة المشغّل والعمود.

/** بالترتيب: الداخلي ثم الخارجي، داخل ytd-watch-flexy أولًا ثم مطلقًا (احتياط لتغيّر البنية). */
export const COLUMN_SELECTORS = Object.freeze([
  'ytd-watch-flexy #secondary-inner',
  'ytd-watch-flexy #secondary',
  '#secondary-inner',
  '#secondary',
]);

/** تخطيط العمود الواحد: سمة على ytd-watch-flexy، والموضع البديل تحت الفيديو وبعد بيانات الفيديو فيه. */
export const SINGLE_COLUMN_ATTR = 'is-single-column';
export const BELOW_SELECTOR = 'ytd-watch-flexy #below';
export const BELOW_ANCHOR_TAG = 'ytd-watch-metadata';

/** ارتفاع احتياطي للوحة قبل أن يُعرف ارتفاع المشغّل. */
export const FALLBACK_HEIGHT = 480;

/** @param {Document} doc @returns {HTMLElement | null} العمود الثانوي، أو #below في تخطيط العمود الواحد */
export function findColumn(doc) {
  if (doc.querySelector('ytd-watch-flexy')?.hasAttribute?.(SINGLE_COLUMN_ATTR)) {
    const below = doc.querySelector(BELOW_SELECTOR);
    if (below) return below;
  }
  for (const sel of COLUMN_SELECTORS) {
    const found = doc.querySelector(sel);
    if (found) return found;
  }
  return null;
}

/**
 * يضع المضيف أول ابن في العمود، وفي #below بعد بيانات الفيديو إن وُجدت (أو يتركه إن كان كذلك). يوتيوب قد يعيد رسم العمود أو
 * يدرج قبل المضيف عنصرًا، فيُستدعى عند كل فحص دوري.
 * @param {HTMLElement} host @param {HTMLElement} column
 * @returns {boolean} هل نُقل أو أُدرج
 */
export function placeHost(host, column) {
  const anchor = column.id === 'below' ? Array.from(column.children ?? []).find((c) => c.tagName?.toLowerCase() === BELOW_ANCHOR_TAG) ?? null : null;
  const before = anchor ? anchor.nextSibling : column.firstChild;
  const placed = host.parentNode === column && (anchor ? anchor.nextSibling === host : (column.firstElementChild ?? column.firstChild) === host);
  if (placed) return false;
  column.insertBefore(host, before);
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
