// كل ما يعتمد على أسماء يوتيوب الداخلية غير الرسمية معزول هنا: حدث yt-navigate-finish، وصنف
// ad-showing، وعناصر المشغّل. تُراقب العنوان احتياطًا فلا يعتمد القرار على الحدث وحده.
import { videoIdFromLocation } from './video-id.js';

const POLL_MS = 500;

/**
 * @param {{ win?: Window, onChange: (id: string | null, prev: string | null) => void }} opts
 */
export function watchCurrentVideo({ win = window, onChange }) {
  let current = videoIdFromLocation(win.location);
  const check = () => {
    const id = videoIdFromLocation(win.location);
    if (id !== current) {
      const prev = current;
      current = id;
      onChange(id, prev);
    }
    return current;
  };
  win.document.addEventListener('yt-navigate-finish', check);
  win.addEventListener('popstate', check);
  const timer = win.setInterval(check, POLL_MS);
  return {
    /** يعيد المعرّف الحالي بعد فحص العنوان فورًا. */
    current: check,
    stop() {
      win.clearInterval(timer);
      win.document.removeEventListener('yt-navigate-finish', check);
      win.removeEventListener('popstate', check);
    },
  };
}

/** @param {Document} doc */
function player(doc) {
  return doc.querySelector('#movie_player');
}

/** @param {Document} doc */
export function isAdShowing(doc = document) {
  const p = player(doc);
  return !!p && p.classList.contains('ad-showing');
}

/**
 * مدة الفيديو الرئيسي بالملي ثانية، أو null أثناء الإعلان أو قبل التحميل.
 * @param {Document} doc
 */
export function mainVideoDurationMs(doc = document) {
  if (isAdShowing(doc)) return null;
  const v = doc.querySelector('#movie_player video.html5-main-video');
  if (!v || !Number.isFinite(v.duration) || v.duration <= 0) return null;
  return Math.round(v.duration * 1000);
}

/**
 * نص ترجمة يوتيوب المعروض الآن في المشغّل الرئيسي وزمن الفيديو (قراءة فقط، للتحقق في الإثبات).
 * @param {Document} doc
 * @returns {{ text: string, timeSec: number | null, ad: boolean }}
 */
export function displayedCaption(doc = document) {
  const segs = doc.querySelectorAll('#movie_player .ytp-caption-window-container .ytp-caption-segment');
  const text = [...segs].map((s) => s.textContent).join(' ').replace(/\s+/g, ' ').trim();
  const v = doc.querySelector('#movie_player video.html5-main-video');
  return { text, timeSec: v && Number.isFinite(v.currentTime) ? Math.round(v.currentTime * 1000) / 1000 : null, ad: isAdShowing(doc) };
}

/**
 * بث جارٍ: شارة البث ظاهرة وغير معطلة. تقدير من DOM يُقاس حيًا.
 * @param {Document} doc
 */
export function isLiveNow(doc = document) {
  const badge = doc.querySelector('#movie_player .ytp-live-badge');
  if (!badge) return false;
  const style = doc.defaultView?.getComputedStyle(badge);
  return !!style && style.display !== 'none' && !badge.hasAttribute('disabled');
}
