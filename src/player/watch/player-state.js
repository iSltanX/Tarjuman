// مراقبة حالة المشغّل (P5): الإعلان (ad-showing وad-interrupting عبر youtube-dom)، وظهور شريط التحكم
// (ytp-autohide) وارتفاعه، وملء الشاشة، وتغيّر الحجم. المحددات كلها من youtube-dom؛ ولا مراقبة لشجرة المشغّل
// كلها (يوتيوب يحدّثها كل ثانية)، بل لسمة class على #movie_player وحجمه وحدث ملء الشاشة، ومؤقت احتياطي خفيف.
import { areControlsHidden, getChromeBottom, isAdShowing, isPlayerFullscreen } from '../youtube-dom.js';

export const STATE_POLL_MS = 500;

/**
 * @typedef {{
 *   ad: boolean, controlsHidden: boolean, fullscreen: boolean,
 *   width: number, height: number, lift: number,
 * }} PlayerSnapshot
 */

const SAME_KEYS = ['ad', 'controlsHidden', 'fullscreen', 'width', 'height', 'lift'];
const same = (a, b) => SAME_KEYS.every((k) => a[k] === b[k]);

/**
 * @param {{
 *   doc: Document, win: Window, player: HTMLElement,
 *   onChange: (s: PlayerSnapshot) => void, pollMs?: number,
 * }} opts
 */
export function watchPlayerState({ doc, win, player, onChange, pollMs = STATE_POLL_MS }) {
  /** @returns {PlayerSnapshot} */
  function read() {
    const rect = player.getBoundingClientRect();
    const controlsHidden = areControlsHidden(doc);
    let lift = 0;
    if (!controlsHidden) {
      const chrome = getChromeBottom(doc);
      const c = chrome?.getBoundingClientRect();
      // الشريط المرسوم فعلًا فقط (ارتفاعه موجب)، والمسافة من أسفل المشغّل إلى أعلاه.
      if (c && c.height > 0) lift = Math.max(0, Math.round(rect.bottom - c.top));
    }
    return {
      ad: isAdShowing(doc),
      controlsHidden,
      fullscreen: isPlayerFullscreen(doc),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      lift,
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
    stop() {
      stopped = true;
      mutation?.disconnect();
      resize?.disconnect();
      doc.removeEventListener('fullscreenchange', update);
      win.clearInterval(timer);
    },
  };
}
