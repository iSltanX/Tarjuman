// جلسة الطبقة على مشغّل بعينه (P5): تجمع المتحكم (الحالة) والمزامنة (المقطع الظاهر) والمراقبة (التنقل والإعلان
// والشريط وملء الشاشة) والعرض (Shadow DOM) في حلقة قرار واحدة. تنتهي بتدمير المشغّل أو إعادة رسمه، وتعيد
// نقطة التركيب إنشاءها. لا تكتب في المتحكم ولا في التخزين، ولا ترمي إليهما: الإخفاق رمز في التشخيص.
import { TjError } from '../../core/errors/index.js';
import { createSyncEngine } from '../sync/engine.js';
import { hostParent } from '../watch/fullscreen.js';
import { watchNavigation } from '../watch/navigation.js';
import { watchPlayerState } from '../watch/player-state.js';
import { getMainVideo } from '../youtube-dom.js';
import { createCaptionHider } from './caption-hider.js';
import { decide } from './decision.js';
import { layoutFor } from './layout.js';
import { splitLines } from './text.js';
import { createOverlayView } from './view.js';

const linesOf = (cue) => (cue ? splitLines(cue.text) : []);

/**
 * @param {{
 *   controller: { getState: () => import('../../content/controller.js').ControllerState, subscribe: (fn: (s: any) => void) => () => void },
 *   doc: Document, win: Window, player: HTMLElement,
 * }} deps
 */
export function createOverlaySession({ controller, doc, win, player }) {
  const counts = { renders: 0, renderFailures: 0, refreshes: 0, hostMoves: 0, fullscreenUnreachable: 0 };
  let lastCode = null;
  let destroyed = false;
  let hidden = null;
  let unreachableReported = false;
  // ملء شاشة لا يستضيف أبناءً: المضيف خارج DOM عمدًا، فلا يُعدّ ذلك عطبًا يستدعي إعادة بناء الجلسة كل دورة.
  let unreachableNow = false;

  const fail = (code, err) => {
    lastCode = code;
    if (code === 'PL_RENDER_FAILED') counts.renderFailures++;
    return new TjError(code, { cause: err, detail: err instanceof Error ? `${err.name}: ${err.message}` : undefined });
  };

  const view = createOverlayView({ doc, win });
  const hider = createCaptionHider({ doc, win });
  const engine = createSyncEngine({
    win,
    onFrame(frame) {
      try {
        view.render({ ar: linesOf(frame.ar), en: linesOf(frame.en) });
        counts.renders++;
      } catch (err) {
        fail('PL_RENDER_FAILED', err);
      }
    },
  });

  function place() {
    const { parent, reason } = hostParent(doc, player);
    unreachableNow = reason === 'unreachable';
    if (reason === 'unreachable') {
      if (!unreachableReported) {
        unreachableReported = true;
        counts.fullscreenUnreachable++;
        fail('PL_FULLSCREEN_HOST');
      }
      return;
    }
    unreachableReported = false;
    if (view.host.parentNode !== parent) {
      const first = !view.host.parentNode;
      view.attachTo(parent);
      if (!first) counts.hostMoves++; // النقل بين الآباء (ملء الشاشة أو إعادة رسم)، لا الإلحاق الأول
    }
  }

  /** الحلقة الوحيدة: كل مدخل (حالة المتحكم، التنقل، المشغّل) يمر هنا فتتفق الأجزاء الأربعة على قرار واحد. */
  function refresh() {
    if (destroyed) return;
    counts.refreshes++;
    try {
      const nav = nav$.state();
      const snap = pw.snapshot();
      const d = decide(controller.getState(), { videoId: nav.videoId, navigating: nav.navigating, ad: snap.ad });
      place();
      engine.setVideo(getMainVideo(doc));
      hider.set(d.hideNative);
      view.setAppearance({ background: d.appearance.background });
      view.setLayout(layoutFor({ appearance: d.appearance, playerHeight: snap.height, chromeLift: snap.lift }));
      if (hidden !== !d.visible) {
        hidden = !d.visible;
        view.setHidden(hidden);
      }
      engine.setSource({ ar: d.ar, en: d.en, offsetMs: d.offsetMs });
    } catch (err) {
      fail('PL_RENDER_FAILED', err);
      // عند الإخفاق يُغلَق ولا يُفتَح (الإخفاء مقدَّم على العرض): لا ترجمة تبقى فوق إعلان أو فيديو آخر.
      try {
        hidden = true;
        view.setHidden(true);
        engine.setSource({ ar: null, en: null, offsetMs: 0 });
      } catch {
        // لا شيء بعد هذا: الإخفاق الأول سُجّل
      }
    }
  }

  /** يوقف ما أُنشئ فقط: يُستدعى عند إخفاق البناء في منتصفه وعند التدمير. */
  let nav$ = null;
  let pw = null;
  let off = null;
  function teardown() {
    off?.();
    nav$?.stop();
    pw?.stop();
    engine.destroy();
    hider.destroy();
    view.destroy();
  }

  try {
    nav$ = watchNavigation({ win, onChange: refresh });
    pw = watchPlayerState({ doc, win, player, onChange: refresh });
    off = controller.subscribe(refresh);
    refresh();
  } catch (err) {
    destroyed = true;
    teardown();
    throw err;
  }

  return {
    player,
    /** المشغّل والمضيف ما زالا في الصفحة (يوتيوب لم يعد رسمهما). */
    healthy: () => !destroyed && player.isConnected && (view.isConnected() || unreachableNow),
    /** فحص خفيف دوري: إعادة المضيف إلى موضعه وربط عنصر فيديو جديد إن استُبدل. */
    check() {
      if (destroyed) return;
      try {
        place();
        engine.setVideo(getMainVideo(doc));
      } catch (err) {
        fail('PL_RENDER_FAILED', err);
      }
    },
    peek: (withBox) => view.peek(withBox),
    diagnostics: () => ({
      ...counts, lastCode, styleMode: view.styleMode, captionsHidden: hider.isOn(), hidden, engine: engine.stats(),
    }),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      teardown();
    },
  };
}
