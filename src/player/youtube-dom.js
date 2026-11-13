// كل ما يعتمد على أسماء يوتيوب الداخلية غير الرسمية في ملف واحد (R39، عقد interfaces §٧): المحددات،
// والأصناف، والأحداث، وصيغ العناوين. لا محدد يوتيوب خارج هذا الملف؛ الحاجة إلى محدد جديد طلب ملف مشترك.
// كل دالة تأخذ doc/win لتُختبر دون متصفح، ولا تغيّر DOM يوتيوب.
import { videoIdFromLocation } from '../core/model/video-location.js';
import { sanitizeText } from '../core/text/sanitize.js';

/**
 * لغة واجهة يوتيوب الفعلية كما يعلنها في جذر صفحته (html[lang]، ولا علاقة لها بلغة الفيديو أو ترجماته)، أو null.
 * @param {Document} [doc]
 * @returns {string | null}
 */
export const youtubeUiLanguage = (doc = document) => doc.documentElement?.getAttribute?.('lang') || null;

export const SELECTORS = Object.freeze({
  player: '#movie_player',
  video: '#movie_player video.html5-main-video',
  rightControls: '#movie_player .ytp-right-controls',
  leftControls: '#movie_player .ytp-left-controls',
  // منزلق الصوت: يتسع حين يمر المؤشر على زر الصوت ويعود صفرًا بعده.
  volumePanel: '#movie_player .ytp-left-controls .ytp-volume-panel',
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
  // عنوان الفصل في الأدوات اليسرى: يتمدد ويُقتطع، فلا يُحسب من المساحة اللازمة لها.
  chapter: 'ytp-chapter-container',
  // زمن المشغّل («1:02 / 20:03») في الأدوات اليسرى: ينضغط داخل حاويته حين يضيق الشريط، فيُقاس قصّه بعرض نصه (ت-١).
  timeDisplay: 'ytp-time-display',
});

export const EVENTS = Object.freeze({
  navigateStart: 'yt-navigate-start',
  navigateFinish: 'yt-navigate-finish',
  pageDataUpdated: 'yt-page-data-updated',
});

// ———— مواضع لوحة النص وسمات صفحة المشاهدة (الفكرة ١، الجولة الثالثة) ————
// كانت محددات اللوحة في panel/column.js وسمة الوضع الداكن في panel/session.js، وكلها أسماء ليوتيوب خارج هذا الملف (R39). ولا تدخل
// SELECTORS: مفاتيحها مربوطة بخط أساس «هل تغيّر يوتيوب؟» وبخريطة الوجود في تشخيص الصفحة، فللوحة وسماتها سجلّان مستقلان.

/** معرّف #below: الموضع البديل للوحة تحت الفيديو (العمود الواحد، أو عمود يقع فوق المشغّل). */
const BELOW_ID = 'below';

/**
 * محددات مواضع لوحة النص المتزامن (src/player/panel/column.js): العمود الثانوي داخل ytd-watch-flexy ثم مطلقًا (احتياط لتغيّر
 * البنية)، و#below وصندوق بيانات الفيديو فيه، وحاوية العمودين وعموداها.
 */
export const PANEL_SELECTORS = Object.freeze({
  flexy: 'ytd-watch-flexy',
  secondaryInner: 'ytd-watch-flexy #secondary-inner',
  secondary: 'ytd-watch-flexy #secondary',
  anySecondaryInner: '#secondary-inner',
  anySecondary: '#secondary',
  below: `ytd-watch-flexy #${BELOW_ID}`,
  // يوتيوب يضعه داخل صندوق في #below لا ابنًا مباشرًا له.
  belowAnchor: 'ytd-watch-metadata',
  columns: 'ytd-watch-flexy #columns',
  primary: 'ytd-watch-flexy #primary',
});

/** سمات يوتيوب التي يقرؤها ترجمان: أسماؤها لا قيمها. */
export const ATTRS = Object.freeze({
  /** تخطيط العمود الواحد (عرض ضيق): سمة على ytd-watch-flexy. */
  singleColumn: 'is-single-column',
  /** وضع يوتيوب الداكن: سمة على جذر الصفحة (html)، تتبعها ألوان اللوحة. */
  dark: 'dark',
  /** أسماء سمات ytd-watch-flexy التي تغيّر التخطيط (الأعمدة والنافذة والمسرح وملء الشاشة): مفتاح التخطيط في column.js. */
  layout: /column|window|theater|full/,
});

/** العنصر هو #below (لا العمود الثانوي). @param {{ id?: string } | null | undefined} el */
export const isBelow = (el) => el?.id === BELOW_ID;

const POLL_MS = 500;

// معرّف الفيديو المعروض من العنوان: المصدر الوحيد للحقيقة في «الفيديو الحالي»، وحدة نقية يستوردها عالم الصفحة أيضًا (U-032).
export { videoIdFromLocation };

/** @param {Document} [doc] @returns {HTMLElement | null} */
export const getPlayer = (doc = document) => doc.querySelector(SELECTORS.player);

/** @param {Document} [doc] @returns {HTMLVideoElement | null} */
export const getMainVideo = (doc = document) => doc.querySelector(SELECTORS.video);

/** @param {Document} [doc] @returns {HTMLElement | null} موضع إدراج أدوات ترجمان (بدايته) */
export const getRightControls = (doc = document) => doc.querySelector(SELECTORS.rightControls);

/** @param {Document} [doc] @returns {HTMLElement | null} أدوات الشريط اليسرى (التشغيل والصوت والوقت وعنوان الفصل) */
export const getLeftControls = (doc = document) => doc.querySelector(SELECTORS.leftControls);

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
 * العقدة زر CC في المشغّل أو عنصر داخله (رمزه). قائمة «تنزيل الأصل» لا تُغلق بالضغط عليه (ح-40). null وما ليس عقدة في
 * مستند: false.
 * @param {unknown} node
 * @returns {boolean}
 */
export function isSubtitlesButton(node) {
  const doc = /** @type {any} */ (node)?.ownerDocument;
  if (!doc || typeof doc.querySelectorAll !== 'function') return false;
  for (const b of doc.querySelectorAll(SELECTORS.subtitlesButton)) if (b.contains(node)) return true;
  return false;
}

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
 * القفز إلى زمن في الفيديو الرئيسي (رسالة tj:seek، عقد messages §٧): currentTime وحده، دون تشغيل ولا إيقاف. لا قفز أثناء
 * الإعلان ولا قبل وجود الفيديو؛ والزمن بعد النهاية يُقصر عليها.
 * @param {number} ms @param {Document} [doc]
 * @returns {boolean} هل تغيّر الزمن
 */
export function seekMainVideo(ms, doc = document) {
  if (!Number.isInteger(ms) || ms < 0 || isAdShowing(doc)) return false;
  const v = getMainVideo(doc);
  if (!v) return false;
  const sec = ms / 1000;
  v.currentTime = Number.isFinite(v.duration) && v.duration > 0 ? Math.min(sec, v.duration) : sec;
  return true;
}

/**
 * بث جارٍ: شارة البث ظاهرة. و`disabled` عليها لا تنفي البث (تحقق Gemini، Y1، ثبت حيًا في Chrome وBrave وEdge وFirefox): يضعها
 * يوتيوب ومعها `ytp-live-badge-is-livehead` ما دام المشاهد عند الحافة المباشرة، وأزالها بالرجوع عنها (Chrome وBrave وEdge)؛ وفي
 * الفيديو العادي والبث المؤرشف الشارة `display: none` (عقد الاستخراج).
 * @param {Document} [doc]
 */
export function isLiveNow(doc = document) {
  const badge = doc.querySelector(SELECTORS.liveBadge);
  if (!badge) return false;
  const style = doc.defaultView?.getComputedStyle(badge);
  return !!style && style.display !== 'none';
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
  const t = sanitizeText(doc.title || '').text.replace(/^\(\d+\+?\)\s*/, '').replace(/\s+-\s+YouTube\s*$/, '').trim();
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
