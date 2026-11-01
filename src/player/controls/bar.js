// حالة شريط يوتيوب كما تحتاجها الأدوات: ظهوره (ytp-autohide)، وملء الشاشة والوضع الكبير، وعرض المشغّل وارتفاع
// الشريط، ومنها مقاس الأزرار (عادي، ومضغوط تحت نحو 560px، وملء الشاشة). كل اسم يوتيوب من youtube-dom؛ والمراقبة
// لسمة class على #movie_player وحجمه وحدث ملء الشاشة ومؤقت احتياطي خفيف، لا لشجرة المشغّل كلها.
import { CLASSES, areControlsHidden, getChromeBottom, isPlayerFullscreen } from '../youtube-dom.js';

export const BAR_POLL_MS = 500;
/** أقل من هذا العرض تُضغط الأزرار الخمسة (figma-design-brief §٥.١) ولا يُخفى منها شيء. */
export const COMPACT_BELOW_PX = 560;
/** ارتفاع الشريط حين لا يُقاس (قبل رسمه): كما في الوضع العادي ليوتيوب. */
const DEFAULT_LIFT = 48;

/**
 * @typedef {{
 *   hidden: boolean, fullscreen: boolean, size: 'normal' | 'compact' | 'fullscreen',
 *   width: number, height: number, lift: number,
 * }} BarSnapshot
 */

/**
 * @param {{ fullscreen: boolean, big: boolean, small: boolean, width: number }} p
 * @returns {'normal' | 'compact' | 'fullscreen'}
 */
export function sizeFor({ fullscreen, big, small, width }) {
  if (fullscreen || big) return 'fullscreen';
  if (small || (width > 0 && width < COMPACT_BELOW_PX)) return 'compact';
  return 'normal';
}

const KEYS = ['hidden', 'fullscreen', 'size', 'width', 'height', 'lift'];
const same = (a, b) => KEYS.every((k) => a[k] === b[k]);

/**
 * @param {{ doc: Document, win: Window, player: HTMLElement, onChange: (s: BarSnapshot) => void, pollMs?: number }} opts
 */
export function watchBar({ doc, win, player, onChange, pollMs = BAR_POLL_MS }) {
  let lastLift = DEFAULT_LIFT;

  /** @returns {BarSnapshot} */
  function read() {
    const rect = player.getBoundingClientRect();
    const hidden = areControlsHidden(doc);
    const chrome = getChromeBottom(doc);
    const c = chrome?.getBoundingClientRect();
    // آخر ارتفاع مقيس للشريط يبقى معلومًا وهو مخفي، فتنفتح القوائم في موضعها حين يعود.
    if (!hidden && c && c.height > 0) lastLift = Math.max(0, Math.round(rect.bottom - c.top));
    const fullscreen = isPlayerFullscreen(doc);
    const width = Math.round(rect.width);
    return {
      hidden,
      fullscreen,
      size: sizeFor({ fullscreen, big: player.classList.contains(CLASSES.bigMode), small: player.classList.contains(CLASSES.smallMode), width }),
      width,
      height: Math.round(rect.height),
      lift: lastLift,
    };
  }

  let last = read();
  let stopped = false;
  const update = () => {
    if (stopped) return;
    const next = read();
    if (same(last, next)) return;
    last = next;
    onChange(next);
  };

  const MO = win.MutationObserver ?? globalThis.MutationObserver;
  const RO = win.ResizeObserver ?? globalThis.ResizeObserver;
  const mutation = MO ? new MO(update) : null;
  mutation?.observe(player, { attributes: true, attributeFilter: ['class'] });
  const resize = RO ? new RO(update) : null;
  resize?.observe(player);
  doc.addEventListener('fullscreenchange', update);
  const timer = win.setInterval(update, pollMs);

  return {
    snapshot: () => last,
    /** قراءة فورية (بعد فعل للمستخدم) دون انتظار المراقبات. */
    refresh() {
      update();
      return last;
    },
    stop() {
      stopped = true;
      mutation?.disconnect();
      resize?.disconnect();
      doc.removeEventListener('fullscreenchange', update);
      win.clearInterval(timer);
    },
  };
}
