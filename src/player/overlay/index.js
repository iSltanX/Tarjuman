// نقطة تركيب طبقة العرض (عقد interfaces §٣، تملكها P5). mountOverlay تُستدعى مرة عند document_start قبل وجود
// المشغّل، فتنتظره بنفسها (MutationObserver على المستند ما دام غائبًا)، وتركّب جلسة عليه، وتعيد التركيب إن أعاد
// يوتيوب رسم المشغّل أو أزال المضيف (فحص خفيف كل ثانية وعند أحداث يوتيوب). لا ترمي أبدًا: الإخفاق رمز في state
// وفي diagnostics، ويبقى المشغّل والأدوات سليمين.
import { TjError } from '../../core/errors/index.js';
import { EVENTS, getPlayer } from '../youtube-dom.js';
import { createOverlaySession } from './session.js';

/**
 * @typedef {{ state: 'stub' | 'waiting' | 'mounted' | 'error', unmount: () => void }} MountHandle
 */

export const HEALTH_MS = 1000;
/** محاولات التركيب الفاشلة المتتالية قبل التوقف (تُصفَّر عند انتقال صفحة جديدة). */
export const MAX_FAILURES = 3;
const COALESCE_MS = 50;

/**
 * @param {import('../../content/controller.js').Controller} controller
 * @param {{ doc?: Document, win?: Window }} [env]
 * @returns {MountHandle & { diagnostics: () => object, peek: (withBox?: boolean) => object | null }}
 */
export function mountOverlay(controller, env = {}) {
  const win = env.win ?? window;
  const doc = env.doc ?? win.document;
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
      if (state !== 'error' || failures < MAX_FAILURES) state = 'waiting';
      startObserving();
      return;
    }
    if (session && session.player === player && session.healthy()) {
      session.check();
      return;
    }
    dropSession();
    if (failures >= MAX_FAILURES) return;
    attempts++;
    try {
      session = createOverlaySession({ controller, doc, win, player });
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
      session: session ? session.diagnostics() : null,
    }),

    /** للحزام الحي وحده: ما يظهر الآن. لا يدخل التشخيص. */
    peek: (withBox) => (session ? session.peek(withBox) : null),
  };
}
