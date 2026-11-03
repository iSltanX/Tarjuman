// نقطة تركيب لوحة النص المتزامن (عقد interfaces §٤، نقطة تركيب ثالثة؛ docs/identity-redesign.md §٤). mountPanel تُستدعى مرة عند
// document_start قبل وجود صفحة المشاهدة، فتنتظر عمود يوتيوب الثانوي بنفسها (MutationObserver على المستند ما دام غائبًا)، وتركّب
// جلسة تضع المضيف أول أبنائه، وتعيد المضيف إلى موضعه إن أعاد يوتيوب رسم العمود أو أدرج قبله (فحص خفيف كل ثانية وعند أحداث
// يوتيوب)، وتزيله عند مغادرة صفحة الفيديو. لا ترمي أبدًا: الإخفاق رمز في state وفي diagnostics ويبقى المشغّل سليمًا.
import { TjError } from '../../core/errors/index.js';
import { loadUiFonts } from '../overlay/fonts.js';
import { EVENTS, videoIdFromLocation } from '../youtube-dom.js';
import { findColumn } from './column.js';
import { createPanelSession } from './session.js';

/**
 * @typedef {{ state: 'stub' | 'waiting' | 'mounted' | 'error', unmount: () => void }} MountHandle
 */

export const HEALTH_MS = 1000;
/** محاولات التركيب الفاشلة المتتالية قبل التوقف (تُصفَّر عند انتقال صفحة جديدة). */
export const MAX_FAILURES = 3;
const COALESCE_MS = 50;

/**
 * @param {import('../../content/controller.js').Controller} controller
 * @param {{ doc?: Document, win?: Window, uiFonts?: typeof loadUiFonts | null }} [env] uiFonts للاختبار (null بلا خطوط)
 * @returns {MountHandle & { diagnostics: () => object, peek: () => object | null }}
 */
export function mountPanel(controller, env = {}) {
  const win = env.win ?? window;
  const doc = env.doc ?? win.document;
  const fontsLoader = env.uiFonts !== undefined ? env.uiFonts : loadUiFonts;
  /** @type {'stub' | 'waiting' | 'mounted' | 'error'} */
  let state = 'waiting';
  /** @type {ReturnType<typeof createPanelSession> | null} */
  let session = null;
  /** @type {MutationObserver | null} */
  let observer = null;
  let stopped = false;
  let coalesce = 0;
  let attempts = 0;
  let failures = 0;
  let lastError = null;
  /** @type {{ loaded: string[], failed: string[] } | 'pending' | null} */
  let fonts = null;

  const MO = win.MutationObserver ?? globalThis.MutationObserver;

  function dropSession() {
    session?.destroy();
    session = null;
  }

  function stopObserving() {
    observer?.disconnect();
    observer = null;
  }

  function startObserving() {
    if (observer || stopped || !MO) return;
    observer = new MO(schedule);
    observer.observe(doc.documentElement, { childList: true, subtree: true });
  }

  /** خطوط الواجهة تُطلب عند أول تركيب ناجح، وما تعذّر منها يُعاد عند التركيب التالي؛ لا ترمي ولا تؤخر التركيب. */
  function requestFonts() {
    if (!fontsLoader || fonts === 'pending' || (fonts && !fonts.failed.length)) return;
    fonts = 'pending';
    Promise.resolve()
      .then(() => fontsLoader({ doc, win }))
      .then((r) => {
        fonts = r;
      }, () => {
        fonts = { loaded: [], failed: ['all'] };
      });
  }

  function tryMount() {
    if (stopped) return;
    // خارج صفحة الفيديو لا لوحة: تُدمَّر الجلسة (وتخرج من DOM) وتعود الحالة إلى الانتظار.
    if (videoIdFromLocation(win.location) === null) {
      dropSession();
      state = 'waiting';
      stopObserving();
      return;
    }
    const column = findColumn(doc);
    if (!column) {
      session?.detach();
      if (state !== 'error' || failures < MAX_FAILURES) state = 'waiting';
      startObserving();
      return;
    }
    stopObserving();
    if (!session) {
      if (failures >= MAX_FAILURES) return;
      attempts++;
      try {
        session = createPanelSession({ controller, doc, win });
        requestFonts();
      } catch (err) {
        session = null;
        failures++;
        state = 'error';
        lastError = new TjError('PL_MOUNT_FAILED', { cause: err, detail: err instanceof Error ? `${err.name}: ${err.message}` : undefined });
        return;
      }
    }
    session.attach(column);
    state = 'mounted';
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
      fonts: fonts === 'pending' ? 'pending' : fonts ? { loaded: [...fonts.loaded], failed: [...fonts.failed] } : null,
    }),

    /** للحزام الحي وحده: ما يظهر الآن. لا يدخل التشخيص. */
    peek: () => (session ? session.peek() : null),
  };
}
