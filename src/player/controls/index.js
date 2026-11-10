// نقطة تركيب أدوات شريط المشغّل (عقد interfaces §٣، تملكها P6). mountControls تُستدعى مرة عند document_start قبل
// وجود المشغّل، فتنتظر #movie_player وأدوات شريطه اليمنى بنفسها (MutationObserver على المستند ما داما غائبين)، وتركّب
// جلسة عليهما، وتعيد المجموعة إلى بداية الشريط إن أعاد يوتيوب رسمه (مراقب على الشريط وفحص خفيف كل ثانية وعند أحداث
// يوتيوب). لا ترمي أبدًا: الإخفاق رمز في state وفي diagnostics، ويبقى المشغّل سليمًا. deps للاختبار وحده.
import { TjError } from '../../core/errors/index.js';
import { getLocale } from '../../i18n/index.js';
import { buildExport, instructions } from '../../core/export/index.js';
import { readImport, reviewIncoming } from '../../core/import/index.js';
import { saveFile } from '../../core/save/index.js';
import { createStore } from '../../core/store/index.js';
import { loadUiFonts } from '../overlay/fonts.js';
import { EVENTS, getPlayer, getRightControls, videoIdFromLocation } from '../youtube-dom.js';
import { PLAYER_WAIT_MS, hasAnyVideo } from '../overlay/index.js';
import { createControlsSession } from './session.js';
import { createPanelLink, panelLink } from '../link.js';

export const HEALTH_MS = 1000;
/** محاولات التركيب الفاشلة المتتالية قبل التوقف (تُصفَّر عند انتقال صفحة جديدة). */
export const MAX_FAILURES = 3;
const COALESCE_MS = 50;

/** فيديوهات المحفوظات بعناوينها لقرينة اسم الملف (قراءة الفهرس وحده، عند الرفع فقط). */
let libraryStore = null;
async function knownVideos() {
  libraryStore ??= createStore();
  return (await libraryStore.listIndex()).map((e) => ({ videoId: e.videoId, title: e.title ?? null }));
}

const DEFAULT_FLOWS = Object.freeze({
  exportFlow: Object.freeze({ buildExport, instructions, saveFile }),
  importFlow: Object.freeze({ readImport, reviewIncoming, knownVideos }),
});

/**
 * @param {import('../../content/controller.js').Controller} controller
 * @param {{ doc?: Document, win?: Window, exportFlow?: object, importFlow?: object, now?: () => number, uiFonts?: typeof loadUiFonts | null, link?: ReturnType<typeof createPanelLink> }} [deps]
 *   link صلة التركيز بلوحة النص المتزامن (المشتركة افتراضيًا)
 *   uiFonts للاختبار (null بلا خطوط)
 * @returns {import('../overlay/index.js').MountHandle & { diagnostics: () => object, peek: () => object | null }}
 */
export function mountControls(controller, deps = {}) {
  const win = deps.win ?? window;
  const doc = deps.doc ?? win.document;
  const flows = { exportFlow: deps.exportFlow ?? DEFAULT_FLOWS.exportFlow, importFlow: deps.importFlow ?? DEFAULT_FLOWS.importFlow };
  const uiFontsLoader = deps.uiFonts !== undefined ? deps.uiFonts : loadUiFonts;
  /** خطوط الواجهة: تُطلب عند أول تركيب ناجح (ويُعاد ما تعذّر منها عند التركيب التالي)، ونتيجتها رموز في التشخيص. */
  let uiFonts = /** @type {{ loaded: string[], failed: string[] } | 'pending' | null} */ (null);
  /** @type {'stub' | 'waiting' | 'mounted' | 'error'} */
  let state = 'waiting';
  /** @type {ReturnType<typeof createControlsSession> | null} */
  let session = null;
  /** لغة الواجهة التي بُنيت بها الجلسة الحالية: كل نصوصها من مسار البناء الأول، فتبدّل اللغة يعيد بناءها (relocalize). */
  let builtLocale = getLocale();
  /** @type {MutationObserver | null} */
  let pageObserver = null;
  /** @type {MutationObserver | null} */
  let barObserver = null;
  /** @type {Element | null} */
  let observedBar = null;
  let stopped = false;
  let coalesce = 0;
  let attempts = 0;
  let failures = 0;
  let lastError = null;
  const now = deps.now ?? (() => Date.now());
  /** بدء انتظار المشغّل أو شريطه في صفحة مشاهدة فيها فيديو (ف10)، أو null. */
  let waitingSince = null;
  const MO = win.MutationObserver ?? globalThis.MutationObserver;

  function dropSession() {
    session?.destroy();
    session = null;
  }

  function observePage(on) {
    if (on && !pageObserver && !stopped && MO) {
      pageObserver = new MO(schedule);
      pageObserver.observe(doc.documentElement, { childList: true, subtree: true });
    } else if (!on && pageObserver) {
      pageObserver.disconnect();
      pageObserver = null;
    }
  }

  /** مراقب على أبناء الشريط وحده: إعادة رسمه أو إدراج زر قبل المجموعة يُصلَح خلال 50ms. */
  function observeBar(right) {
    if (observedBar === right) return;
    barObserver?.disconnect();
    barObserver = null;
    observedBar = right;
    if (!right || !MO || stopped) return;
    barObserver = new MO(schedule);
    barObserver.observe(right, { childList: true });
  }

  function tryMount() {
    if (stopped) return;
    // لغة الواجهة تبدّلت: تُعاد الجلسة بلغتها، إلا إن كان فيها تدفق رفع أو مراجعة أو تأكيد أو كتابة مفتوحة فيؤجَّل إلى الفحص التالي بعد انتهائه.
    if (session && builtLocale !== getLocale() && !session.holdsFlow()) dropSession();
    // خارج صفحة الفيديو لا أزرار (F-05): تخرج الجلسة من DOM وتعود الحالة إلى الانتظار، والتنقل إلى مشاهدة يعيدها بحدث يوتيوب أو الفحص الدوري.
    if (videoIdFromLocation(win.location) === null) {
      dropSession();
      observeBar(null);
      observePage(false);
      waitingSince = null;
      if (state !== 'error' || failures < MAX_FAILURES) state = 'waiting';
      return;
    }
    const player = getPlayer(doc);
    const right = player ? getRightControls(doc) : null;
    if (!player || !right) {
      if (session && player && session.player === player && session.healthy()) return; // الشريط يُعاد رسمه الآن
      dropSession();
      observeBar(null);
      const timedOut = playerTimedOut(player, right);
      if (state !== 'error' || failures < MAX_FAILURES) state = timedOut ? 'error' : 'waiting';
      observePage(true);
      return;
    }
    waitingSince = null;
    // ظهر ما غاب: لا يبقى في التشخيص رمز ما تعافت منه الأدوات (ف10).
    if (lastError?.code === 'CT_PLAYER_NOT_FOUND') lastError = null;
    if (session && session.player === player && session.healthy()) {
      session.check();
      observeBar(right);
      return;
    }
    dropSession();
    if (failures >= MAX_FAILURES) return;
    attempts++;
    try {
      builtLocale = getLocale();
      session = createControlsSession({ controller, doc, win, player, flows, now: deps.now, link: deps.link ?? panelLink });
      state = 'mounted';
      failures = 0;
      if (uiFontsLoader && (uiFonts === null || (uiFonts !== 'pending' && uiFonts.failed.length))) {
        uiFonts = 'pending';
        uiFontsLoader({ doc, win }).then((r) => { uiFonts = r; }, () => { uiFonts = { loaded: [], failed: ['all'] }; });
      }
      observePage(false);
      observeBar(right);
    } catch (err) {
      dropSession();
      failures++;
      state = 'error';
      lastError = new TjError('CT_MOUNT_FAILED', { cause: err, detail: err instanceof Error ? `${err.name}: ${err.message}` : undefined });
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

  /**
   * انقضت مهلة المشغّل؟ (ف10): في صفحة مشاهدة فيها فيديو ولا مشغّل أو شريط منذ PLAYER_WAIT_MS، والرمز يسمّي ما غاب. بلا فيديو بعد
   * يبدأ العدّ من جديد (الصفحة ما زالت تُحمَّل).
   * @param {Element | null} player @param {Element | null} right
   */
  function playerTimedOut(player, right) {
    if (!hasAnyVideo(doc)) {
      waitingSince = null;
      return false;
    }
    const t = now();
    if (waitingSince === null) waitingSince = t;
    if (t - waitingSince < PLAYER_WAIT_MS) return false;
    if (lastError?.code !== 'CT_PLAYER_NOT_FOUND') {
      const missing = [player ? null : 'player', right ? null : 'rightControls'].filter(Boolean);
      lastError = new TjError('CT_PLAYER_NOT_FOUND', { detail: `missing=${missing.join(',')}` });
    }
    return true;
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

    /** تدفق جارٍ (رفع أو تأكيد أو كتابة في حقل): يؤجَّل له تبديل اللغة كله (content/locale.js). */
    holdsFlow: () => session?.holdsFlow() ?? false,

    /** تبدّلت لغة الواجهة (أو هُيّئت بعد التركيب): تُبنى الجلسة من جديد بلغتها، ويؤجَّل ذلك ما دام تدفق مفتوح. */
    relocalize() {
      if (!stopped && session && builtLocale !== getLocale()) tryMount();
    },

    unmount() {
      if (stopped) return;
      stopped = true;
      observePage(false);
      observeBar(null);
      win.clearInterval(health);
      if (coalesce) win.clearTimeout(coalesce);
      doc.removeEventListener(EVENTS.navigateFinish, onPage);
      doc.removeEventListener(EVENTS.pageDataUpdated, onPage);
      dropSession();
      state = 'stub';
    },

    /**
     * ف5: نص ملصوق في نافذة الإضافة إلى خط الرفع نفسه (فحص ومقارنة وتأكيد في قائمة الترجمة). يعيد البدء أو سبب تعذّره.
     * @param {string} text @returns {{ ok: true } | { ok: false, code: string }}
     */
    importText: (text) => (session ? session.importText(text) : { ok: false, code: 'TJ_RELOAD_PAGE' }),

    /** أعداد ورموز فقط: لا نص مقاطع ولا أسماء ملفات ولا روابط (R36). */
    diagnostics: () => ({
      state, attempts, failures, lastCode: lastError?.code ?? null, lastDetail: lastError?.detail ?? null,
      uiFonts: uiFonts === 'pending' ? { pending: true } : uiFonts,
      session: session ? session.diagnostics() : null,
    }),

    /** للحزام الحي وحده: ما يظهر الآن ومواضع الأزرار. لا يدخل التشخيص. */
    peek: () => (session ? session.peek() : null),
  };
}
