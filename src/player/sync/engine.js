// محرّك المزامنة (P5، عقد التوقيت §١): يقرأ video.currentTime ولا يكتب فيه أبدًا، ويبحث بـ lookupMs
// (currentTime × 1000 − الإزاحة). حلقة requestAnimationFrame تعمل أثناء التشغيل وحده؛ وعند seeked وratechange
// وpause وما شابهها يتحدّث الجواب فورًا. لا يستدعي onFrame إلا عند تغيّر المقطع الظاهر، فلا عمل DOM بلا لزوم. وبـbridgeMs تُوصل
// الفجوة الأقصر منه بين مقطع انتهى وتالٍ يبدأ: يبقى الأول ظاهرًا حتى يبدأ الثاني، فلا يبدأ تلاشٍ لا يكتمل (تدقيق 7a66f91، CL-X1).
import { lookupMs } from '../../core/model/timing.js';
import { indexFor } from './cue-index.js';

/**
 * @typedef {import('../../core/model/cue.js').Cue} Cue
 * @typedef {{ ar: Cue | null, en: Cue | null }} Frame
 */

const SLOTS = /** @type {const} */ (['ar', 'en']);
// أحداث العنصر التي تغيّر الجواب أو حالة الحلقة.
const REFRESH_EVENTS = ['seeking', 'seeked', 'ratechange', 'pause', 'ended', 'loadedmetadata', 'emptied', 'durationchange', 'timeupdate'];
const PLAY_EVENTS = ['play', 'playing'];

/**
 * @param {{
 *   win: { requestAnimationFrame: (cb: () => void) => number, cancelAnimationFrame: (id: number) => void },
 *   onFrame: (frame: Frame) => void,
 *   bridgeMs?: number,
 * }} deps bridgeMs أطول فجوة تُوصل (0: لا وصل)
 */
export function createSyncEngine({ win, onFrame, bridgeMs = 0 }) {
  /** @type {any} */
  let video = null;
  /** @type {{ ar: Cue[] | null, en: Cue[] | null }} */
  let source = { ar: null, en: null };
  let offsetMs = 0;
  /** @type {Record<string, { index: ReturnType<typeof indexFor>, from: number, to: number, cue: Cue | null } | null>} */
  const tracks = { ar: null, en: null };
  let rafId = 0;
  let destroyed = false;
  const stats = { frames: 0, lookups: 0, emits: 0, loopStarts: 0, evals: 0 };
  /** @type {Array<[string, () => void]>} */
  let bound = [];

  const hasTracks = () => SLOTS.some((s) => tracks[s]);
  const playing = () => !!video && !video.paused && !video.ended;

  /** @param {boolean} force يُبلَّغ حتى لو لم يتغير المقطع (بعد تغيير المصدر أو الإزاحة) */
  function evaluate(force) {
    stats.evals++;
    if (destroyed) return;
    let changed = force;
    if (!video) {
      // بلا فيديو لا مقطع ظاهر: يُفرَّغ ما حُسب سابقًا ولا يبقى جواب قديم.
      for (const s of SLOTS) {
        const t = tracks[s];
        if (t && t.cue) {
          t.cue = null;
          changed = true;
        }
        if (t) t.from = t.to = NaN;
      }
    } else if (hasTracks()) {
      const sec = Number.isFinite(video.currentTime) ? video.currentTime : 0;
      const ms = lookupMs(sec, offsetMs);
      for (const s of SLOTS) {
        const t = tracks[s];
        if (!t || (ms >= t.from && ms < t.to)) continue;
        const hit = t.index.find(ms);
        stats.lookups++;
        t.from = hit.from;
        t.to = hit.to;
        // فجوة قصيرة بدأت بنهاية الظاهر الآن نفسه: يبقى حتى يبدأ التالي (نافذتها [from, to) فلا بحث في إطاراتها).
        if (!hit.cue && t.cue && bridgeMs > 0 && Number.isFinite(hit.from) && Number.isFinite(hit.to)
          && hit.to - hit.from < bridgeMs && Math.abs(t.cue.endMs - hit.from) < 1) continue;
        if (hit.cue !== t.cue) {
          t.cue = hit.cue;
          changed = true;
        }
      }
    }
    if (changed) {
      stats.emits++;
      onFrame({ ar: tracks.ar?.cue ?? null, en: tracks.en?.cue ?? null });
    }
  }

  function tick() {
    rafId = 0;
    if (destroyed || !playing() || !hasTracks()) return;
    stats.frames++;
    evaluate(false);
    rafId = win.requestAnimationFrame(tick);
  }

  function startLoop() {
    if (rafId || destroyed || !playing() || !hasTracks()) return;
    stats.loopStarts++;
    rafId = win.requestAnimationFrame(tick);
  }

  function stopLoop() {
    if (!rafId) return;
    win.cancelAnimationFrame(rafId);
    rafId = 0;
  }

  const onRefresh = () => {
    evaluate(false);
    if (playing()) startLoop();
    else stopLoop();
  };
  const onPlay = () => {
    evaluate(false);
    startLoop();
  };

  function unbind() {
    for (const [type, fn] of bound) video?.removeEventListener(type, fn);
    bound = [];
  }

  return {
    /** يربط عنصر الفيديو (أو null). تبديله يعيد الربط ويحسب الجواب فورًا. */
    setVideo(next) {
      if (destroyed || next === video) return;
      stopLoop();
      unbind();
      video = next ?? null;
      if (video) {
        for (const t of REFRESH_EVENTS) bound.push([t, onRefresh]);
        for (const t of PLAY_EVENTS) bound.push([t, onPlay]);
        for (const [type, fn] of bound) video.addEventListener(type, fn);
      }
      evaluate(true);
      if (playing()) startLoop();
    },

    /**
     * المقاطع والإزاحة. المراجع نفسها لا يُعاد فهرسها. الإزاحة تغيّر وقت البحث وحده.
     * @param {{ ar?: Cue[] | null, en?: Cue[] | null, offsetMs?: number }} next
     */
    setSource(next) {
      const ar = next.ar ?? null;
      const en = next.en ?? null;
      const off = next.offsetMs ?? 0;
      if (ar === source.ar && en === source.en && off === offsetMs) return;
      source = { ar, en };
      offsetMs = off;
      for (const s of SLOTS) {
        const cues = source[s];
        tracks[s] = cues && cues.length ? { index: indexFor(cues), from: NaN, to: NaN, cue: null } : null;
      }
      evaluate(true);
      if (hasTracks() && playing()) startLoop();
      else stopLoop();
    },

    stats: () => ({
      ...stats, running: !!rafId, tracks: SLOTS.filter((s) => tracks[s]).length,
      ar: tracks.ar ? { from: tracks.ar.from, to: tracks.ar.to, cue: tracks.ar.cue?.n ?? null, size: tracks.ar.index.size } : null,
      video: video ? { connected: video.isConnected !== false, timeSec: Number.isFinite(video.currentTime) ? Math.round(video.currentTime * 100) / 100 : null } : null,
    }),

    destroy() {
      destroyed = true;
      stopLoop();
      unbind();
      video = null;
    },
  };
}
