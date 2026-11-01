// كل ما يعتمد على أسماء يوتيوب الداخلية غير الرسمية في ملف واحد (R39، عقد interfaces §٧): المحددات،
// والأصناف، والأحداث، وصيغ العناوين. لا محدد يوتيوب خارج هذا الملف؛ الحاجة إلى محدد جديد طلب ملف مشترك.
// كل دالة تأخذ doc/win لتُختبر دون متصفح، ولا تغيّر DOM يوتيوب.

export const SELECTORS = Object.freeze({
  player: '#movie_player',
  video: '#movie_player video.html5-main-video',
  rightControls: '#movie_player .ytp-right-controls',
  chromeBottom: '#movie_player .ytp-chrome-bottom',
  progressBar: '#movie_player .ytp-progress-bar-container',
  captionWindow: '#movie_player .ytp-caption-window-container',
  captionSegment: '#movie_player .ytp-caption-window-container .ytp-caption-segment',
  subtitlesButton: '#movie_player .ytp-subtitles-button',
  liveBadge: '#movie_player .ytp-live-badge',
  inlinePreview: '#inline-preview-player',
});

export const CLASSES = Object.freeze({
  adShowing: 'ad-showing',
  adInterrupting: 'ad-interrupting',
  autohide: 'ytp-autohide',
  fullscreen: 'ytp-fullscreen',
  bigMode: 'ytp-big-mode',
  smallMode: 'ytp-small-mode',
});

export const EVENTS = Object.freeze({
  navigateStart: 'yt-navigate-start',
  navigateFinish: 'yt-navigate-finish',
  pageDataUpdated: 'yt-page-data-updated',
});

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const POLL_MS = 500;

/**
 * معرّف الفيديو المعروض من عنوان الصفحة: /watch?v= و/live/<id> (البث بعد انتهائه يُعامل كفيديو، والجاري
 * يرفضه الاستخراج برسالة). Shorts خارج النطاق فلا معرّف لها. المصدر الوحيد للحقيقة في «الفيديو الحالي».
 * @param {{ pathname: string, search: string }} loc
 * @returns {string | null}
 */
export function videoIdFromLocation(loc) {
  if (loc.pathname === '/watch') {
    const v = new URLSearchParams(loc.search).get('v');
    return v && VIDEO_ID.test(v) ? v : null;
  }
  const m = /^\/live\/([A-Za-z0-9_-]{11})(?:\/|$)/.exec(loc.pathname);
  return m ? m[1] : null;
}

/** @param {Document} [doc] @returns {HTMLElement | null} */
export const getPlayer = (doc = document) => doc.querySelector(SELECTORS.player);

/** @param {Document} [doc] @returns {HTMLVideoElement | null} */
export const getMainVideo = (doc = document) => doc.querySelector(SELECTORS.video);

/** @param {Document} [doc] @returns {HTMLElement | null} موضع إدراج أدوات ترجمان (بدايته) */
export const getRightControls = (doc = document) => doc.querySelector(SELECTORS.rightControls);

/** @param {Document} [doc] @returns {HTMLElement | null} شريط التحكم السفلي كله */
export const getChromeBottom = (doc = document) => doc.querySelector(SELECTORS.chromeBottom);

/** @param {Document} [doc] @returns {HTMLElement | null} حاوية ترجمة يوتيوب الأصلية */
export const getCaptionContainer = (doc = document) => doc.querySelector(SELECTORS.captionWindow);

/** @param {Document} [doc] */
const playerHas = (cls, doc) => {
  const p = getPlayer(doc);
  return !!p && p.classList.contains(cls);
};

/** إعلان معروض أو مقاطِع. عند الشك يُعامل كإعلان (الإخفاء مقدَّم على العرض). @param {Document} [doc] */
export const isAdShowing = (doc = document) => playerHas(CLASSES.adShowing, doc) || playerHas(CLASSES.adInterrupting, doc);

/** أدوات المشغّل مخفية الآن (الشريط اختفى). @param {Document} [doc] */
export const areControlsHidden = (doc = document) => playerHas(CLASSES.autohide, doc);

/** @param {Document} [doc] */
export const isPlayerFullscreen = (doc = document) => playerHas(CLASSES.fullscreen, doc) || !!doc.fullscreenElement;

/**
 * مدة الفيديو الرئيسي بالملي ثانية، أو null أثناء الإعلان أو قبل التحميل.
 * @param {Document} [doc]
 */
export function mainVideoDurationMs(doc = document) {
  if (isAdShowing(doc)) return null;
  const v = getMainVideo(doc);
  if (!v || !Number.isFinite(v.duration) || v.duration <= 0) return null;
  return Math.round(v.duration * 1000);
}

/**
 * بث جارٍ: شارة البث ظاهرة وغير معطلة. تقدير من DOM لم يثبت حيًا بعد (عقد الاستخراج).
 * @param {Document} [doc]
 */
export function isLiveNow(doc = document) {
  const badge = doc.querySelector(SELECTORS.liveBadge);
  if (!badge) return false;
  const style = doc.defaultView?.getComputedStyle(badge);
  return !!style && style.display !== 'none' && !badge.hasAttribute('disabled');
}

/**
 * نص ترجمة يوتيوب المعروض الآن وزمن الفيديو (قراءة فقط، للتحقق الحي).
 * @param {Document} [doc]
 * @returns {{ text: string, timeSec: number | null, ad: boolean }}
 */
export function displayedCaption(doc = document) {
  const segs = doc.querySelectorAll(SELECTORS.captionSegment);
  const text = [...segs].map((s) => s.textContent).join(' ').replace(/\s+/g, ' ').trim();
  const v = getMainVideo(doc);
  return { text, timeSec: v && Number.isFinite(v.currentTime) ? Math.round(v.currentTime * 1000) / 1000 : null, ad: isAdShowing(doc) };
}

/**
 * عنوان الفيديو من عنوان التبويب: يُسقط عدّاد الإشعارات «(3) » واللاحقة « - YouTube».
 * @param {Document} [doc]
 * @returns {string | null}
 */
export function videoTitle(doc = document) {
  const t = String(doc.title || '').replace(/^\(\d+\+?\)\s*/, '').replace(/\s+-\s+YouTube\s*$/, '').trim();
  return t && t !== 'YouTube' ? t.slice(0, 500) : null;
}

/**
 * يراقب تغيّر الفيديو المعروض: حدث يوتيوب الداخلي، وpopstate، ومراقبة العنوان كل 500ms احتياطًا،
 * فلا يعتمد القرار على الحدث وحده.
 * @param {{ win?: Window, onChange: (id: string | null, prev: string | null) => void, pollMs?: number }} opts
 */
export function watchCurrentVideo({ win = window, onChange, pollMs = POLL_MS }) {
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
  win.document.addEventListener(EVENTS.navigateFinish, check);
  win.addEventListener('popstate', check);
  const timer = win.setInterval(check, pollMs);
  return {
    /** المعرّف الحالي بعد فحص العنوان فورًا. */
    current: check,
    stop() {
      win.clearInterval(timer);
      win.document.removeEventListener(EVENTS.navigateFinish, check);
      win.removeEventListener('popstate', check);
    },
  };
}
