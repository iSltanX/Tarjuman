// المتحكم (عقد interfaces §١): مصدر الحالة الوحيد في صفحة يوتيوب. يعرف الفيديو الحالي وسجله المحفوظ
// والمسارات الملتقطة والإزاحة ووضع العرض والإعدادات، ويطبّق عقد التوقيت: الإزاحة تُحفظ لكل فيديو ولا تمس
// التوقيت المحفوظ، والاستيراد يصفّرها بإشعار، والتصدير الإنجليزي لا يتأثر بها. الطبقة والأدوات تقرآن
// الحالة وتشتركان في تغيّرها، ولا تكتبان في التخزين إلا عبر أفعاله.
import { TjError, toErrorInfo } from '../core/errors/index.js';
import { isVideoId } from '../core/model/ids.js';
import { DEFAULT_SETTINGS, normalizeSettings } from '../core/model/settings.js';
import { normalizeOffset } from '../core/model/timing.js';
import { withArabicImport, withExport, withView } from '../core/model/transitions.js';
import { DISPLAY_MODES } from '../core/model/video.js';

/**
 * @typedef {import('../core/model/video.js').VideoRecord} VideoRecord
 * @typedef {import('../core/model/video.js').ViewState} ViewState
 * @typedef {import('../core/model/settings.js').Settings} Settings
 * @typedef {import('../core/model/cue.js').Cue} Cue
 * @typedef {import('../extract/index.js').TrackInfo} TrackInfo
 * @typedef {import('../extract/index.js').Rejection} Rejection
 * @typedef {{ code: string, tone: 'info' | 'success' | 'warning' | 'error', at: number }} Notice
 * @typedef {{
 *   videoId: string | null, title: string | null, durationMs: number | null, loading: boolean,
 *   saved: VideoRecord | null,
 *   captured: TrackInfo[], captureIssue: Rejection | null,
 *   arabic: null | { cues: Cue[], edited: boolean, fileName: string, comparison: VideoRecord['arabic']['comparison'] },
 *   english: null | { key: string, kind: 'manual' | 'asr', lang: string, cues: Cue[], source: 'captured' | 'saved' },
 *   view: ViewState, settings: Settings, notice: Notice | null,
 *   error: { code: string, message: string, detail: string | null } | null, version: number
 * }} ControllerState
 * @typedef {ReturnType<typeof createController>} Controller
 */

const KIND_ORDER = { manual: 0, asr: 1 };
const byKind = (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind];

/**
 * @param {{
 *   store: ReturnType<typeof import('../core/store/index.js').createStore>,
 *   extractor?: ReturnType<typeof import('../extract/index.js').createExtractor> | null,
 *   page?: { title?: () => string | null, durationMs?: () => number | null },
 *   now?: () => number,
 * }} deps
 */
export function createController({ store, extractor = null, page = {}, now = () => Date.now() }) {
  const iso = () => new Date(now()).toISOString();
  /** @type {Settings} */
  let settings = normalizeSettings(DEFAULT_SETTINGS);
  /** @type {string | null} */
  let videoId = null;
  /** @type {VideoRecord | null} */
  let saved = null;
  let knownRev = 0;
  let loading = false;
  /** @type {ViewState} */
  let view = { displayOffsetMs: 0, displayMode: settings.displayModeDefault };
  /** @type {Notice | null} */
  let notice = null;
  let error = null;
  let version = 0;
  let loadSeq = 0;
  let pendingWrites = 0;
  let externalWhileWriting = false;
  let englishCache = { id: null, cues: null };
  const listeners = new Set();

  const defaultView = () => ({ displayOffsetMs: 0, displayMode: settings.displayModeDefault });

  function pickEnglish() {
    const captured = extractor ? extractor.tracks().filter((t) => t.ok && t.cueCount > 0).sort(byKind) : [];
    if (captured.length) {
      const t = captured[0];
      const id = `captured:${t.key}@${t.capturedAt}`;
      if (englishCache.id !== id) englishCache = { id, cues: extractor.convert(t.key).cues };
      return { key: t.key, kind: t.kind, lang: t.lang, cues: englishCache.cues, source: 'captured' };
    }
    const s = saved ? saved.english.slice().sort(byKind)[0] : null;
    return s ? { key: s.key, kind: s.kind, lang: s.lang, cues: s.cues, source: 'saved' } : null;
  }

  /** @returns {ControllerState} */
  function compute() {
    const a = saved?.arabic ?? null;
    return Object.freeze({
      videoId,
      title: saved?.title ?? (videoId ? page.title?.() ?? null : null),
      durationMs: saved?.durationMs ?? (videoId ? page.durationMs?.() ?? null : null),
      loading,
      saved,
      captured: extractor ? extractor.tracks() : [],
      captureIssue: extractor ? extractor.lastRejection() : null,
      arabic: a ? { cues: a.current ?? a.original, edited: a.current !== null, fileName: a.fileName, comparison: a.comparison } : null,
      english: videoId ? pickEnglish() : null,
      view: Object.freeze({ ...view }),
      settings,
      notice,
      error,
      version,
    });
  }

  let state = compute();
  function changed() {
    version++;
    state = compute();
    for (const fn of [...listeners]) fn(state);
  }

  function requireVideo() {
    if (!videoId) throw new TjError('TJ_NO_VIDEO');
    return videoId;
  }

  /** كتابة واحدة في سجل الفيديو الحالي؛ الأحداث الخارجية أثناءها تؤجَّل حتى تنتهي. */
  async function writeRecord(fn) {
    const id = requireVideo();
    pendingWrites++;
    try {
      const next = await store.updateVideo(id, fn);
      if (id === videoId) {
        saved = next;
        knownRev = Math.max(knownRev, next?.rev ?? 0);
      }
      return { id, next };
    } finally {
      pendingWrites--;
      if (!pendingWrites && externalWhileWriting) {
        externalWhileWriting = false;
        reloadIfNewer();
      }
    }
  }

  async function reloadIfNewer() {
    const id = videoId;
    if (!id) return;
    const seq = loadSeq;
    try {
      const rec = await store.getVideo(id);
      if (id !== videoId || seq !== loadSeq) return;
      if (rec && rec.rev <= knownRev && saved) return;
      saved = rec;
      knownRev = rec?.rev ?? 0;
      view = rec ? { ...rec.view } : defaultView();
      error = null;
    } catch (err) {
      if (id !== videoId) return;
      error = toErrorInfo(err);
    }
    changed();
  }

  /** الإزاحة ووضع العرض: يتغيّران فورًا في الحالة، ويُحفظان في السجل إن وُجد؛ وبلا سجل يبقيان للجلسة. */
  async function setView(patch) {
    view = { ...view, ...patch };
    changed();
    if (!saved) return state;
    try {
      await writeRecord((rec) => (rec ? withView(rec, patch, iso()) : undefined));
      error = null;
    } catch (err) {
      error = toErrorInfo(err);
    }
    changed();
    return state;
  }

  function preferredCapturedTrack() {
    if (!extractor) return null;
    const t = extractor.tracks().filter((x) => x.ok && x.cueCount > 0).sort(byKind)[0];
    if (!t) return null;
    const conv = extractor.convert(t.key, { mode: 'normal' });
    return conv.ok ? { key: t.key, lang: t.lang, kind: t.kind, capturedAt: t.capturedAt, source: 'capture', cues: conv.cues } : null;
  }

  const controller = {
    /** @returns {ControllerState} لقطة مجمَّدة؛ لا تُعدَّل */
    getState: () => state,

    /** @param {(s: ControllerState) => void} fn @returns {() => void} */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /** تحميل الإعدادات ثم الفيديو الحالي. يُستدعى مرة من main.js. */
    async start(initialVideoId) {
      try {
        settings = await store.getSettings();
        if (!saved) view = { ...view, displayMode: settings.displayModeDefault };
      } catch (err) {
        error = toErrorInfo(err);
      }
      changed();
      await controller.setVideo(initialVideoId ?? null);
    },

    /**
     * تبديل الفيديو: تُمسح الحالة فورًا (فلا يظهر شيء من الفيديو السابق)، ثم يُحمَّل سجل الجديد وحده.
     * @param {string | null} id
     */
    async setVideo(id) {
      const next = isVideoId(id) ? id : null;
      if (next === videoId) return;
      const seq = ++loadSeq;
      videoId = next;
      saved = null;
      knownRev = 0;
      view = defaultView();
      notice = null;
      error = null;
      englishCache = { id: null, cues: null };
      loading = !!next;
      changed();
      if (!next) return;
      try {
        const rec = await store.getVideo(next);
        if (seq !== loadSeq) return;
        saved = rec;
        knownRev = rec?.rev ?? 0;
        if (rec) view = { ...rec.view };
        if (rec?.arabic) notice = { code: 'ST_RESTORED', tone: 'info', at: now() };
      } catch (err) {
        if (seq !== loadSeq) return;
        error = toErrorInfo(err);
      }
      loading = false;
      changed();
    },

    /** @param {number} ms إزاحة العرض بالملي ثانية (تُقرَّب إلى 100 وتُقصر على ±10 دقائق) */
    setOffset: (ms) => setView({ displayOffsetMs: normalizeOffset(ms) }),

    /** @param {1 | -1} dir + تأخير (تظهر لاحقًا)، − تقديم (تظهر أبكر)، بمقدار خطوة الإعدادات */
    nudgeOffset(dir) {
      if (dir !== 1 && dir !== -1) throw new RangeError('الاتجاه 1 أو -1');
      return setView({ displayOffsetMs: normalizeOffset(view.displayOffsetMs + dir * settings.offsetStepMs) });
    },

    resetOffset: () => setView({ displayOffsetMs: 0 }),

    /** @param {'ar' | 'dual' | 'off'} mode */
    setDisplayMode(mode) {
      if (!DISPLAY_MODES.includes(mode)) throw new TjError('MD_INVALID', { detail: `displayMode=${mode}` });
      return setView({ displayMode: mode });
    },

    /**
     * ترجمة عربية من تدفق الاستيراد (P4) للفيديو الحالي. وجود ترجمة سابقة يتطلب replace=true بعد تأكيد
     * المستخدم، وإلا ST_ARABIC_EXISTS. تُصفَّر الإزاحة دائمًا، وإشعار ST_OFFSET_RESET إن لم تكن صفرًا.
     * @param {{ fileName: string, cues: Cue[], comparison?: object | null, fingerprintId?: string | null, notes?: string[] }} input
     * @param {{ replace?: boolean }} [opts]
     * @returns {Promise<VideoRecord>}
     */
    async loadArabic(input, { replace = false } = {}) {
      const vid = requireVideo();
      const offsetBefore = view.displayOffsetMs;
      const englishTrack = preferredCapturedTrack();
      let offsetWas = offsetBefore;
      const { id, next } = await writeRecord((rec) => {
        const r = withArabicImport(rec, {
          videoId: vid, title: page.title?.() ?? null, durationMs: page.durationMs?.() ?? null, ...input,
          englishTrack, displayModeDefault: settings.displayModeDefault,
        }, iso(), { replace });
        offsetWas = rec ? r.offsetWas : offsetBefore;
        return r.record;
      });
      if (id === videoId) {
        view = { ...next.view };
        notice = offsetWas !== 0 ? { code: 'ST_OFFSET_RESET', tone: 'info', at: now() } : null;
        error = null;
        changed();
      }
      return next;
    },

    /**
     * بعد تنزيل SRT إنجليزي (P6 فوق تدفق P3): يُحفظ المسار بوضعه العادي كما استُخرج والبصمة. الإزاحة لا تدخل.
     * @param {{ trackKey: string, fingerprint: import('../core/model/tracks.js').Fingerprint }} p
     * @returns {Promise<VideoRecord>}
     */
    async recordExport({ trackKey, fingerprint }) {
      const vid = requireVideo();
      if (!extractor) throw new TjError('EX_NO_TRACK');
      const info = extractor.tracks().find((t) => t.key === trackKey);
      const conv = extractor.convert(trackKey, { mode: 'normal' });
      if (!info || !conv.ok) throw new TjError(conv.code ?? 'EX_NO_TRACK');
      const englishTrack = { key: conv.key, lang: conv.lang, kind: conv.kind, capturedAt: info.capturedAt, source: 'capture', cues: conv.cues };
      const { id, next } = await writeRecord((rec) => withExport(rec, {
        videoId: vid, title: page.title?.() ?? null, durationMs: page.durationMs?.() ?? null, englishTrack, fingerprint,
        displayMode: view.displayMode === 'off' ? settings.displayModeDefault : view.displayMode,
      }, iso()));
      if (id === videoId) changed();
      return next;
    },

    /**
     * مقاطع مسار ملتقط بوضع التصدير المطلوب، كما يعطيها المستخرج (لا إزاحة فيها أبدًا).
     * @param {string} key @param {{ mode?: 'normal' | 'long' }} [opts]
     */
    convertCaptured(key, opts) {
      if (!extractor) return { ok: false, code: 'EX_NO_TRACK', key, lang: '', kind: 'manual', mode: opts?.mode ?? 'normal', cues: [], warnings: [], report: null };
      return extractor.convert(key, opts);
    },

    /** @param {Parameters<ReturnType<typeof import('../core/store/index.js').createStore>['setSettings']>[0]} patch */
    async updateSettings(patch) {
      settings = await store.setSettings(patch);
      changed();
      return settings;
    },

    dismissNotice() {
      if (!notice) return;
      notice = null;
      changed();
    },

    /** يعيد قراءة سجل الفيديو الحالي من التخزين. */
    reload: () => {
      knownRev = 0;
      return reloadIfNewer();
    },

    /**
     * تغيّرات التخزين من أي سياق (المحرّر، والمحفوظات، والإعدادات، وتبويب آخر). صدى كتابات هذا المتحكم يُتجاهل بـrev.
     * @param {import('../core/store/index.js').StoreChange} change
     */
    handleStoreChange(change) {
      if (change.settings) {
        settings = normalizeSettings(change.settings.newValue ?? DEFAULT_SETTINGS);
        if (!saved && view.displayOffsetMs === 0) view = { ...view, displayMode: settings.displayModeDefault };
        changed();
      }
      if (!videoId) return;
      const mine = change.videos[videoId];
      if (!mine && !change.cleared) return;
      const rev = mine?.newValue && Number.isInteger(mine.newValue.rev) ? mine.newValue.rev : null;
      if (rev !== null && rev <= knownRev) return;
      if (pendingWrites) {
        externalWhileWriting = true;
        return;
      }
      if (rev === null) knownRev = 0;
      reloadIfNewer();
    },
  };

  // التقاط أو رفض أو تنقل في المستخرج يغيّر الحالة.
  extractor?.subscribe(() => changed());
  return controller;
}
