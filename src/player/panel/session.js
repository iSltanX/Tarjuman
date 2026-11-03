// جلسة اللوحة في عمود يوتيوب الثانوي: تجمع حالة المتحكم (المقاطع والإزاحة والخطوة والتفضيلات) وحالة الصفحة (الفيديو والتنقل
// وملء الشاشة والمشغّل) وحالة الواجهة المحلية (التتبّع، ورسالة التراجع، وحقل الخطوة) في حلقة عرض واحدة. تنتهي بمغادرة صفحة
// الفيديو أو بالتدمير، وتنقل المضيف بين الأعمدة إن أعاد يوتيوب رسمها دون أن تفقد حالتها المحلية.
// لا تكتب في التخزين إلا عبر أفعال المتحكم (updatePrefs وupdateSettings وnudgeOffset وresetOffset وreload)، ولا ترمي إليه:
// الإخفاق رمز في التشخيص. والمقطع الحالي بقاعدة الطبقة نفسها (indexFor.find بـlookupMs)، فيتفق الصف المميَّز مع ما على الشاشة.
import { TjError, toErrorInfo, messageFor } from '../../core/errors/index.js';
import { lookupMs } from '../../core/model/timing.js';
import { parseSeconds } from '../controls/text.js';
import { watchNavigation } from '../watch/navigation.js';
import { getMainVideo, getPlayer, isAdShowing, isPlayerFullscreen, seekMainVideo } from '../youtube-dom.js';
import { FALLBACK_HEIGHT, createColumnMirror, isBeside, placeHost } from './column.js';
import { createFollow } from './follow.js';
import { derive } from './model.js';
import { createPanelView } from './view.js';

/** رسالة «أُخفي زر النص المتزامن» وفيها «تراجع»: وقت كافٍ للقرار (كرسائل التراجع في الأدوات). */
export const UNDO_MS = 6000;
const STEP = Object.freeze({ min: 100, max: 10000 });
const COALESCE_MS = 50;
const VIDEO_EVENTS = ['timeupdate', 'seeking', 'seeked', 'ratechange', 'pause', 'play', 'playing', 'ended', 'loadedmetadata', 'emptied', 'durationchange'];

/**
 * @param {{
 *   controller: import('../../content/controller.js').Controller,
 *   doc: Document, win: Window,
 * }} deps
 */
export function createPanelSession({ controller, doc, win }) {
  const counts = { renders: 0, renderFailures: 0, hostMoves: 0, syncs: 0, rebuilds: 0, actionFailures: 0 };
  let lastCode = null;
  let destroyed = false;
  /** @type {HTMLElement | null} */
  let column = null;
  /** @type {{ restore: boolean, seen: boolean } | null} */
  let toast = null;
  let toastTimer = 0;
  const step = { custom: false, text: /** @type {string | null} */ (null), error: /** @type {string | null} */ (null) };
  let anchor = -1;
  let loc = null;
  let locGeneration = -1;
  let ready = false;
  /** أول وضع للتمرير بعد البناء أو الفتح لم يُنجَز لغياب التخطيط (قائمة مخفية أو مضيف غير مدرج بعد). */
  let snapNext = false;
  let resumeState = { visible: false, label: '' };
  let rafId = 0;
  let checkTimer = 0;
  /** @type {any} */
  let video = null;

  const fail = (code, err) => {
    lastCode = code;
    if (code === 'PL_RENDER_FAILED') counts.renderFailures++;
    return new TjError(code, { cause: err, detail: err instanceof Error ? `${err.name}: ${err.message}` : undefined });
  };
  /** فعل على المتحكم: لا يرمي ولا يترك وعدًا مرفوضًا بلا معالج؛ الإخفاق رمز في التشخيص. */
  const act = (fn) => {
    const onError = (err) => {
      counts.actionFailures++;
      lastCode = toErrorInfo(err).code;
    };
    try {
      const r = fn();
      if (r && typeof r.then === 'function') r.then(undefined, onError);
    } catch (err) {
      onError(err);
    }
  };
  const setPrefs = (patch) => act(() => controller.updatePrefs(patch));
  const offset = () => controller.getState().view?.displayOffsetMs ?? 0;

  // ———— التتبّع والاستئناف ————
  let view = null;
  let follow = null;

  function updateResume() {
    const visible = ready && !follow.on && anchor >= 0;
    resumeState = { visible, label: visible ? view.transcript.labelOf(anchor) : '' };
    view.setResume(resumeState.visible, resumeState.label);
  }

  /**
   * يضع الصف الحالي والماضي والتقدم من زمن الفيديو. ما دام الزمن داخل نافذة الجواب السابق لا يبحث ولا يمس إلا شريط التقدم.
   * @param {{ snap?: boolean }} [o] snap: أول وضع بعد البناء أو الفتح (موضع التمرير فورًا)
   */
  function syncPlayback({ snap = false } = {}) {
    if (destroyed || !ready) return;
    const tr = view.transcript;
    const timeline = tr.timeline();
    if (!timeline || !timeline.size || isAdShowing(doc)) return;
    if (locGeneration !== tr.generation) {
      loc = null;
      locGeneration = tr.generation;
    }
    const v = video;
    if (!v || !Number.isFinite(v.currentTime)) {
      tr.mark({ row: -1, past: 0 });
      anchor = -1;
      loc = null;
      updateResume();
      return;
    }
    const ms = lookupMs(v.currentTime, offset());
    counts.syncs++;
    if (snap || !loc || ms < loc.from || ms >= loc.to) {
      loc = timeline.locate(ms);
      tr.mark(loc);
      anchor = loc.anchor;
      if (follow.on) follow.reveal(anchor, { force: snap, instant: snap });
      if (snap && !view.transcript.list.clientHeight) snapNext = true;
      updateResume();
    }
    const c = loc.cue;
    tr.progress(c && c.endMs > c.startMs ? (ms - c.startMs) / (c.endMs - c.startMs) : 0);
  }

  // ———— الفيديو الرئيسي ————
  const playing = () => !!video && !video.paused && !video.ended;
  function tick() {
    rafId = 0;
    if (destroyed || !ready || !playing()) return;
    syncPlayback();
    rafId = win.requestAnimationFrame(tick);
  }
  function startLoop() {
    if (!rafId && !destroyed && ready && playing()) rafId = win.requestAnimationFrame(tick);
  }
  function stopLoop() {
    if (!rafId) return;
    win.cancelAnimationFrame(rafId);
    rafId = 0;
  }
  const onVideoEvent = () => {
    syncPlayback();
    if (playing()) startLoop();
    else stopLoop();
  };
  function bindVideo() {
    const next = getMainVideo(doc);
    if (next === video) return;
    stopLoop();
    for (const t of VIDEO_EVENTS) video?.removeEventListener(t, onVideoEvent);
    video = next ?? null;
    for (const t of VIDEO_EVENTS) video?.addEventListener(t, onVideoEvent);
    loc = null;
    syncPlayback();
    startLoop();
  }

  // ———— الهندسة ————
  function measure() {
    const p = getPlayer(doc);
    const pr = p?.getBoundingClientRect?.() ?? null;
    const cr = column?.getBoundingClientRect?.() ?? null;
    const place = isBeside(pr, cr) ? 'beside' : 'below';
    const heightPx = place === 'beside' ? (pr && pr.height > 0 ? Math.round(pr.height) : FALLBACK_HEIGHT) : null;
    const width = Math.round((view.host.getBoundingClientRect?.() ?? {}).width ?? 0);
    view.setLayout({ place, heightPx, width });
  }

  // ———— أفعال المستخدم ————
  function clearToast() {
    if (toastTimer) win.clearTimeout(toastTimer);
    toastTimer = 0;
    toast = null;
  }

  function saveStep(ms) {
    render();
    if (controller.getState().settings.offsetStepMs === ms) return;
    act(async () => {
      try {
        await controller.updateSettings({ offsetStepMs: ms });
      } catch (err) {
        step.error = toErrorInfo(err).message;
        throw err;
      } finally {
        render();
      }
    });
  }

  const on = {
    open: () => setPrefs({ ui: { panelOpen: true } }),
    close: () => setPrefs({ ui: { panelOpen: false } }),
    setDual: (v) => setPrefs({ ui: { panelDual: v } }),
    hide() {
      const restore = controller.getState().prefs?.ui?.panelOpen === true;
      clearToast();
      toast = { restore, seen: false };
      toastTimer = win.setTimeout(() => {
        toastTimer = 0;
        toast = null;
        render();
      }, UNDO_MS);
      act(async () => {
        try {
          await controller.updatePrefs({ ui: { panelEntry: false, panelOpen: false } });
        } catch (err) {
          clearToast();
          render();
          throw err;
        }
      });
    },
    undo() {
      // الرسالة تبقى حتى يُحفظ الإظهار (صدى التخزين أو نهاية الحفظ)، فلا تختفي اللوحة لحظةً بينهما (مراجعة الهوية L3).
      if (!toast || toast.undoing) return;
      const restore = toast.restore;
      if (toastTimer) win.clearTimeout(toastTimer);
      toastTimer = 0;
      toast.undoing = true;
      act(async () => {
        try {
          await controller.updatePrefs({ ui: { panelEntry: true, panelOpen: restore } });
        } finally {
          clearToast();
          render();
        }
      });
      render();
    },
    setFollow(v) {
      if (v) follow.resume(anchor);
      else follow.set(false);
    },
    resume: () => follow.resume(anchor),
    reset() {
      if (Math.round(offset() / 100) !== 0) act(() => controller.resetOffset());
    },
    nudge: (dir) => act(() => controller.nudgeOffset(dir)),
    step(v) {
      step.error = null;
      if (v === 'custom') {
        step.custom = true;
        render();
        return;
      }
      step.custom = false;
      step.text = null;
      saveStep(Number(v));
    },
    stepText: (t) => {
      step.text = String(t);
    },
    applyStep(text) {
      const v = parseSeconds(text);
      const ms = v === null ? NaN : Math.round(v * 1000);
      if (!Number.isInteger(ms) || ms < STEP.min || ms > STEP.max || ms % 100 !== 0) {
        step.text = String(text);
        step.error = messageFor('CT_STEP_INVALID');
        render();
        return;
      }
      step.text = null;
      step.error = null;
      saveStep(ms);
    },
    retry: () => act(() => controller.reload?.()),
    seek(ms) {
      seekMainVideo(ms, doc);
      syncPlayback();
    },
  };

  view = createPanelView({ doc, win, on });
  const mirror = createColumnMirror({ doc, win });
  follow = createFollow({ win, list: view.transcript.list, rowEl: (i) => view.transcript.rowEl(i), onChange: () => render() });

  // ———— الحلقة الوحيدة ————
  function render() {
    if (destroyed) return;
    counts.renders++;
    try {
      const s = controller.getState();
      const prefsUi = s.prefs?.ui;
      const nav = nav$.state();
      const fullscreen = isPlayerFullscreen(doc);
      const model = derive(s, { videoId: nav.videoId, navigating: nav.navigating, visible: nav.videoId !== null && !fullscreen }, { toast: !!toast });
      // رسالة التراجع تُغلق إن عاد الزر من مكان آخر (نافذة الأيقونة أو الإعدادات) بعد أن رُصد مخفيًا.
      if (toast) {
        if (prefsUi?.panelEntry === false) toast.seen = true;
        else if (toast.seen) clearToast();
      }
      // الواجهة العربية: اللوحة يمين الفيديو بتبديل العمودين ما دامت ظاهرة في العمود الثانوي (وتبقى كذلك خلف ملء الشاشة).
      const inSecondary = !!column && column.id !== 'below';
      mirror.update(inSecondary && (model.mode !== 'none' || (fullscreen && mirror.active)));
      measure();
      const out = view.render(model, {
        follow: follow.on,
        resume: resumeState,
        step,
        toast: !!toast,
      });
      ready = out.mode === 'open' && out.kind === 'ready';
      if (!ready) {
        anchor = -1;
        loc = null;
        snapNext = false;
        resumeState = { visible: false, label: '' };
        // الإخفاء المؤقت بصفوف جاهزة (ملء الشاشة) يُبقي حالة التتبّع؛ وما عداه (إغلاق، تحميل، فيديو آخر) يعيده مفعّلًا.
        if (!(out.mode === 'none' && out.kind === 'ready')) follow.reset();
      }
      if (out.rebuilt) counts.rebuilds++;
      if (ready) {
        if (out.rebuilt || out.becameReady || snapNext) {
          loc = null;
          snapNext = false;
          syncPlayback({ snap: true });
        } else {
          syncPlayback();
          updateResume();
        }
        startLoop();
      }
    } catch (err) {
      fail('PL_RENDER_FAILED', err);
    }
  }

  // ———— المراقبة ————
  const MO = win.MutationObserver ?? globalThis.MutationObserver;
  const RO = win.ResizeObserver ?? globalThis.ResizeObserver;
  let themeObserver = null;
  let columnObserver = null;
  let resizeObserver = null;
  let observedPlayer = null;
  let nav$ = null;
  let off = null;
  const onWin = () => render();
  const onFullscreen = () => render();

  const isDark = () => doc.documentElement.hasAttribute('dark');

  function teardown() {
    off?.();
    nav$?.stop();
    themeObserver?.disconnect();
    columnObserver?.disconnect();
    resizeObserver?.disconnect();
    doc.removeEventListener('fullscreenchange', onFullscreen);
    win.removeEventListener('resize', onWin);
    stopLoop();
    if (checkTimer) win.clearTimeout(checkTimer);
    checkTimer = 0;
    for (const t of VIDEO_EVENTS) video?.removeEventListener(t, onVideoEvent);
    video = null;
    clearToast();
    mirror?.restore();
    view?.destroy();
  }

  /** مراقب جديد عند تغيّر المشغّل (لا disconnect ثم observe): يوتيوب يستبدل عنصر المشغّل عند إعادة الرسم. */
  function observeGeometry() {
    if (!RO) return;
    const p = getPlayer(doc);
    if (resizeObserver && p === observedPlayer) return;
    resizeObserver?.disconnect();
    observedPlayer = p;
    resizeObserver = new RO(onResize);
    if (p) resizeObserver.observe(p);
    resizeObserver.observe(view.host);
  }
  const onResize = () => {
    measure();
    render();
  };

  try {
    nav$ = watchNavigation({ win, onChange: render });
    off = controller.subscribe(render);
    if (MO) {
      themeObserver = new MO(() => view.setTheme(isDark()));
      themeObserver.observe(doc.documentElement, { attributes: true, attributeFilter: ['dark'] });
    }
    doc.addEventListener('fullscreenchange', onFullscreen);
    win.addEventListener('resize', onWin);
    view.setTheme(isDark());
    render();
  } catch (err) {
    destroyed = true;
    teardown();
    throw err;
  }

  /** فحص خفيف دوري: موضع المضيف، وربط الفيديو والمراقبة بعناصر يوتيوب الحالية، وإعادة الرسم. */
  function check() {
    if (destroyed) return;
    try {
      if (column && placeHost(view.host, column)) {
        counts.hostMoves++;
        snapNext = true;
      }
      view.setTheme(isDark());
      bindVideo();
      observeGeometry();
      render();
    } catch (err) {
      fail('PL_RENDER_FAILED', err);
    }
  }

  /** تجميع تغيّرات أبناء العمود (يوتيوب يغيّرها كثيرًا) في فحص واحد. */
  function scheduleCheck() {
    if (checkTimer || destroyed) return;
    checkTimer = win.setTimeout(() => {
      checkTimer = 0;
      check();
    }, COALESCE_MS);
  }

  return {
    /** يضع المضيف أول ابن في العمود (ينقله من عمود قديم)، ويربط الفيديو والمراقبة، ويعيد الرسم. */
    attach(next) {
      if (destroyed) return;
      try {
        if (column !== next) {
          columnObserver?.disconnect();
          columnObserver = null;
          column = next;
          if (MO) {
            columnObserver = new MO(scheduleCheck);
            columnObserver.observe(next, { childList: true });
          }
        }
        if (placeHost(view.host, next)) {
          counts.hostMoves++;
          snapNext = true;
        }
        check();
      } catch (err) {
        fail('PL_RENDER_FAILED', err);
      }
    },
    /** العمود غاب (يوتيوب يعيد رسمه): يخرج المضيف من DOM وتبقى الحالة، وسيعود عند ظهور عمود. */
    detach() {
      if (destroyed || !column) return;
      columnObserver?.disconnect();
      columnObserver = null;
      column = null;
      mirror.restore();
      view.host.remove();
    },
    check,
    healthy: () => !destroyed && !!column && column.isConnected && view.host.parentNode === column,
    get column() {
      return column;
    },
    host: view.host,
    peek: (o) => ({ ...view.peek(o), anchor, follow: follow.on, ready, mirrored: mirror.active }),
    diagnostics() {
      const p = view.peek();
      return {
        ...counts, lastCode, mode: p.mode, kind: p.kind, rows: p.rows, follow: follow.on, place: p.place, narrow: p.narrow, wide: p.wide,
        theme: p.theme, styleMode: view.styleMode, anchor, toast: !!toast, video: !!video, mirrored: mirror.active,
      };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      teardown();
    },
    /** للاختبار والحزام: عناصر العرض. */
    view,
    follow,
  };
}
