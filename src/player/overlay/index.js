// نقطة تركيب طبقة العرض (عقد interfaces §٣، تملكها P5). mountOverlay تُستدعى مرة عند document_start قبل وجود
// المشغّل، فتنتظره بنفسها (MutationObserver على المستند ما دام غائبًا)، وتركّب جلسة عليه، وتعيد التركيب إن أعاد
// يوتيوب رسم المشغّل أو أزال المضيف (فحص خفيف كل ثانية وعند أحداث يوتيوب). لا ترمي أبدًا: الإخفاق رمز في state
// وفي diagnostics، ويبقى المشغّل والأدوات سليمين. محمّل خطوط الترجمة واحد للمستند (P6)، فلا تعيد الجلسات تحميلها.
import { TjError } from '../../core/errors/index.js';
import { EVENTS, getMainVideo, getPlayer, videoIdFromLocation } from '../youtube-dom.js';
import { createFontLoader } from './fonts.js';
import { createOverlaySession } from './session.js';

/**
 * @typedef {{ state: 'stub' | 'waiting' | 'mounted' | 'error', unmount: () => void }} MountHandle
 */

export const HEALTH_MS = 1000;
/**
 * مهلة سخيّة (ف10، 2026-11-10): صفحة مشاهدة فيها عنصر فيديو ولا مشغّل يوتيوب (أو شريطه للأدوات) بعدها ⇒ حالة خطأ باسم بدل
 * «بانتظار المشغّل» إلى الأبد، تتعافى حين يظهر ما غاب. تشترك فيها الطبقة والأدوات.
 */
export const PLAYER_WAIT_MS = 15000;
/** @param {Document} doc عنصر فيديو أيًّا كان (وسم HTML قياسي، لا محدد يوتيوب): الصفحة حُمّلت أو تُحمَّل. */
export const hasAnyVideo = (doc) => !!doc.querySelector('video');
/** محاولات التركيب الفاشلة المتتالية قبل التوقف (تُصفَّر عند انتقال صفحة جديدة). */
export const MAX_FAILURES = 3;
const COALESCE_MS = 50;

/**
 * @param {import('../../content/controller.js').Controller} controller
 * @param {{ doc?: Document, win?: Window, fonts?: ReturnType<typeof createFontLoader> | null, now?: () => number }} [env] fonts وnow للاختبار
 * @returns {MountHandle & { diagnostics: () => object, peek: (withBox?: boolean) => object | null }}
 */
export function mountOverlay(controller, env = {}) {
  const win = env.win ?? window;
  const doc = env.doc ?? win.document;
  const fonts = env.fonts !== undefined ? env.fonts : createFontLoader({ doc, win });
  /** @type {'stub' | 'waiting' | 'mounted' | 'error'} */
  let state = 'waiting';
  /** @type {ReturnType<typeof createOverlaySession> | null} */
  let session = null;
  /** @type {MutationObserver | null} */
  let observer = null;
  let stopped = false;
  let coalesce = 0;
  let attempts = 0;
  let failures = 0;
  let lastError = null;
  const now = env.now ?? (() => Date.now());
  /** بدء انتظار المشغّل في صفحة مشاهدة فيها فيديو (ف10)، أو null. */
  let waitingSince = null;

  /**
   * انقضت مهلة المشغّل؟ (ف10): صفحة مشاهدة فيها عنصر فيديو ولا #movie_player منذ PLAYER_WAIT_MS. وخارج المشاهدة (الصفحة الرئيسية
   * فيها فيديو معاينة) أو بلا فيديو بعد لا مهلة.
   */
  function playerTimedOut() {
    if (videoIdFromLocation(win.location) === null || !hasAnyVideo(doc)) {
      waitingSince = null;
      return false;
    }
    const t = now();
    if (waitingSince === null) waitingSince = t;
    if (t - waitingSince < PLAYER_WAIT_MS) return false;
    if (lastError?.code !== 'PL_PLAYER_NOT_FOUND') lastError = new TjError('PL_PLAYER_NOT_FOUND', { detail: 'missing=player' });
    return true;
  }

  function dropSession() {
    session?.destroy();
    session = null;
  }

  function stopObserving() {
    observer?.disconnect();
    observer = null;
  }

  function startObserving() {
    if (observer || stopped) return;
    const MO = win.MutationObserver ?? globalThis.MutationObserver;
    if (!MO) return;
    observer = new MO(schedule);
    observer.observe(doc.documentElement, { childList: true, subtree: true });
  }

  function tryMount() {
    if (stopped) return;
    const player = getPlayer(doc);
    if (!player) {
      dropSession();
      const timedOut = playerTimedOut();
      if (state !== 'error' || failures < MAX_FAILURES) state = timedOut ? 'error' : 'waiting';
      startObserving();
      return;
    }
    waitingSince = null;
    if (lastError?.code === 'PL_PLAYER_NOT_FOUND') lastError = null;
    if (session && session.player === player && session.healthy()) {
      session.check();
      return;
    }
    dropSession();
    if (failures >= MAX_FAILURES) return;
    attempts++;
    try {
      session = createOverlaySession({ controller, doc, win, player, fonts });
      state = 'mounted';
      stopObserving();
    } catch (err) {
      dropSession();
      failures++;
      state = 'error';
      lastError = new TjError('PL_MOUNT_FAILED', { cause: err, detail: err instanceof Error ? `${err.name}: ${err.message}` : undefined });
    }
  }

  // تجميع دفعات تغيّرات DOM الكثيرة (يوتيوب) في فحص واحد.
  function schedule() {
    if (coalesce || stopped) return;
    coalesce = win.setTimeout(() => {
      coalesce = 0;
      tryMount();
    }, COALESCE_MS);
  }

  const onPage = () => {
    failures = 0;
    waitingSince = null;
    schedule();
  };
  doc.addEventListener(EVENTS.navigateFinish, onPage);
  doc.addEventListener(EVENTS.pageDataUpdated, onPage);
  const health = win.setInterval(tryMount, HEALTH_MS);
  tryMount();

  return {
    get state() {
      return state;
    },

    unmount() {
      if (stopped) return;
      stopped = true;
      stopObserving();
      win.clearInterval(health);
      if (coalesce) win.clearTimeout(coalesce);
      doc.removeEventListener(EVENTS.navigateFinish, onPage);
      doc.removeEventListener(EVENTS.pageDataUpdated, onPage);
      dropSession();
      state = 'stub';
    },

    /** أعداد ورموز فقط: لا نص مقاطع ولا روابط (R36). */
    diagnostics: () => ({
      state, attempts, failures, lastCode: lastError?.code ?? null, lastDetail: lastError?.detail ?? null,
      // الطبقة مركَّبة والمشغّل بلا عنصر فيديو يعرفه المحدد: لا تظهر الترجمة ولا خطأ، فيُبلَّغ برمز (F-04).
      videoCode: state === 'mounted' && !getMainVideo(doc) ? 'PL_NO_VIDEO_ELEMENT' : null,
      session: session ? session.diagnostics() : null,
      fonts: fonts ? fonts.diagnostics() : null,
    }),

    /** للحزام الحي وحده: ما يظهر الآن. لا يدخل التشخيص. */
    peek: (withBox) => (session ? session.peek(withBox) : null),
  };
}
