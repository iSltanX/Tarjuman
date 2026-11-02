// نقطة تركيب أدوات شريط المشغّل (عقد interfaces §٣، تملكها P6). mountControls تُستدعى مرة عند document_start قبل
// وجود المشغّل، فتنتظر #movie_player وأدوات شريطه اليمنى بنفسها (MutationObserver على المستند ما داما غائبين)، وتركّب
// جلسة عليهما، وتعيد المجموعة إلى بداية الشريط إن أعاد يوتيوب رسمه (مراقب على الشريط وفحص خفيف كل ثانية وعند أحداث
// يوتيوب). لا ترمي أبدًا: الإخفاق رمز في state وفي diagnostics، ويبقى المشغّل سليمًا. deps للاختبار وحده.
import { TjError } from '../../core/errors/index.js';
import { buildExport, download } from '../../core/export/index.js';
import { readImport, reviewIncoming } from '../../core/import/index.js';
import { createStore } from '../../core/store/index.js';
import { EVENTS, getPlayer, getRightControls } from '../youtube-dom.js';
import { createControlsSession } from './session.js';

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
  exportFlow: Object.freeze({ buildExport, download }),
  importFlow: Object.freeze({ readImport, reviewIncoming, knownVideos }),
});

/**
 * @param {import('../../content/controller.js').Controller} controller
 * @param {{ doc?: Document, win?: Window, exportFlow?: object, importFlow?: object, now?: () => number }} [deps]
 * @returns {import('../overlay/index.js').MountHandle & { diagnostics: () => object, peek: () => object | null }}
 */
export function mountControls(controller, deps = {}) {
  const win = deps.win ?? window;
  const doc = deps.doc ?? win.document;
  const flows = { exportFlow: deps.exportFlow ?? DEFAULT_FLOWS.exportFlow, importFlow: deps.importFlow ?? DEFAULT_FLOWS.importFlow };
  /** @type {'stub' | 'waiting' | 'mounted' | 'error'} */
  let state = 'waiting';
  /** @type {ReturnType<typeof createControlsSession> | null} */
  let session = null;
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
    const player = getPlayer(doc);
    const right = player ? getRightControls(doc) : null;
    if (!player || !right) {
      if (session && player && session.player === player && session.healthy()) return; // الشريط يُعاد رسمه الآن
      dropSession();
      observeBar(null);
      if (state !== 'error' || failures < MAX_FAILURES) state = 'waiting';
      observePage(true);
      return;
    }
    if (session && session.player === player && session.healthy()) {
      session.check();
      observeBar(right);
      return;
    }
    dropSession();
    if (failures >= MAX_FAILURES) return;
    attempts++;
    try {
      session = createControlsSession({ controller, doc, win, player, flows, now: deps.now });
      state = 'mounted';
      failures = 0;
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

  const onPage = () => {
    failures = 0;
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
      observePage(false);
      observeBar(null);
      win.clearInterval(health);
      if (coalesce) win.clearTimeout(coalesce);
      doc.removeEventListener(EVENTS.navigateFinish, onPage);
      doc.removeEventListener(EVENTS.pageDataUpdated, onPage);
      dropSession();
      state = 'stub';
    },

    /** أعداد ورموز فقط: لا نص مقاطع ولا أسماء ملفات ولا روابط (R36). */
    diagnostics: () => ({
      state, attempts, failures, lastCode: lastError?.code ?? null, lastDetail: lastError?.detail ?? null,
      session: session ? session.diagnostics() : null,
    }),

    /** للحزام الحي وحده: ما يظهر الآن ومواضع الأزرار. لا يدخل التشخيص. */
    peek: () => (session ? session.peek() : null),
  };
}
