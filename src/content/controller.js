// المتحكم (عقد interfaces §١): مصدر الحالة الوحيد في صفحة يوتيوب. يعرف الفيديو الحالي وسجله المحفوظ
// والمسارات الملتقطة والإزاحة ووضع العرض والإعدادات، ويطبّق عقد التوقيت: الإزاحة تُحفظ لكل فيديو ولا تمس
// التوقيت المحفوظ، والاستيراد يصفّرها بإشعار، والتصدير الإنجليزي لا يتأثر بها. الطبقة والأدوات تقرآن
// الحالة وتشتركان في تغيّرها، ولا تكتبان في التخزين إلا عبر أفعاله. وفي الإصدار الثاني (عقد interfaces §١٢) يعرف حزمة
// الفيديو (الترجمات الثلاث والسابقة والعلامات) والتفضيلات، ويبدّل النشطة ويرفع إلى خانة ويعلّم المقطع بتراجع.
import { trackComparison } from '../core/compare/index.js';
import { TjError, toErrorInfo } from '../core/errors/index.js';
import {
  bundleFromRecord, referencedFingerprints, slotModels, withActiveSlot, withMark, withMarksReplaced, withSlotUpload,
} from '../core/model/bundle.js';
import { isVideoId } from '../core/model/ids.js';
import { DEFAULT_PREFS, normalizePrefs } from '../core/model/prefs.js';
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
 *   error: { code: string, message: string, detail: string | null } | null, version: number,
 *   bundle: import('../core/model/slots.js').Bundle | null, activeSlot: 1 | 2 | 3 | null,
 *   slots: ReturnType<typeof slotModels>, marks: null | { slot: 1 | 2 | 3, items: import('../core/model/marks.js').Mark[] },
 *   previous: null | { from: 1 | 2 | 3, savedAt: string }, prefs: import('../core/model/prefs.js').Prefs
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
  let prefs = normalizePrefs(DEFAULT_PREFS);
  /** @type {string | null} */
  let videoId = null;
  /** @type {VideoRecord | null} */
  let saved = null;
  /** حزمة السجل المحفوظ نفسه (store.bundleOf)، أو حزمته وحده من مخزن لا يعرف الحزم؛ مرة لكل سجل. */
  let bundleMemo = { rec: null, bundle: null };
  const bundleFor = (rec) => {
    if (!rec) return null;
    if (bundleMemo.rec !== rec) bundleMemo = { rec, bundle: typeof store.bundleOf === 'function' ? store.bundleOf(rec) : bundleFromRecord(rec) };
    return bundleMemo.bundle;
  };
  let loading = false;
  /** @type {ViewState} */
  let view = { displayOffsetMs: 0, displayMode: settings.displayModeDefault };
  /** @type {Notice | null} */
  let notice = null;
  let error = null;
  let version = 0;
  let loadSeq = 0;
  let pendingWrites = 0;
  let writeEpoch = 0;
  let externalWhileWriting = false;
  let listenerFailures = 0;
  let lastListenerError = null;
  // مراجع المقاطع ثابتة ما لم يتغير مصدرها، وإن نُسخ السجل عند كل حفظ (الطبقة تبني فهرسها عليها).
  const memo = new Map();
  const stable = (slot, id, make) => {
    const hit = memo.get(slot);
    if (hit && hit.id === id) return hit.value;
    const value = make();
    memo.set(slot, { id, value });
    return value;
  };
  const listeners = new Set();

  const defaultView = () => ({ displayOffsetMs: 0, displayMode: settings.displayModeDefault });
  /** نسخة السجل: المراجعة وتاريخ الحفظ معًا، فكاتبان بالمراجعة نفسها لا يلتبسان. */
  const versionOf = (r) => (r ? `${r.rev}|${r.updatedAt}` : 'none');

  function pickEnglish() {
    const captured = extractor ? extractor.tracks().filter((t) => t.ok && t.cueCount > 0).sort(byKind) : [];
    if (captured.length) {
      const t = captured[0];
      const cues = stable('english', `${videoId}|captured:${t.key}@${t.capturedAt}`, () => extractor.convert(t.key).cues);
      return { key: t.key, kind: t.kind, lang: t.lang, cues, source: 'captured' };
    }
    const s = saved ? saved.english.slice().sort(byKind)[0] : null;
    if (!s) return null;
    const cues = stable('english', `${videoId}|saved:${s.key}@${s.capturedAt}`, () => s.cues);
    return { key: s.key, kind: s.kind, lang: s.lang, cues, source: 'saved' };
  }

  /** @returns {ControllerState} */
  function compute() {
    const a = saved?.arabic ?? null;
    const bundle = bundleFor(saved);
    const activeSlot = bundle?.active ?? null;
    return Object.freeze({
      videoId,
      title: saved?.title ?? (videoId ? page.title?.() ?? null : null),
      durationMs: saved?.durationMs ?? (videoId ? page.durationMs?.() ?? null : null),
      loading,
      saved,
      captured: extractor ? extractor.tracks() : [],
      captureIssue: extractor ? extractor.lastRejection() : null,
      arabic: a ? {
        // الخانة والملف في المفتاح: ترجمتان بتاريخ استيراد واحد لا تلتبسان بعد التبديل.
        cues: stable('arabic', `${videoId}|${activeSlot}|${a.fileName}|${a.importedAt}|${a.editedAt}`, () => a.current ?? a.original),
        edited: a.current !== null, fileName: a.fileName,
        // تقرير النسخة المعروضة (شارة المشغّل وقائمته) لا تقرير الاستيراد وحده (GM-013).
        comparison: stable('comparison', `${videoId}|${activeSlot}|${a.fileName}|${a.importedAt}|${a.editedAt}|${a.fingerprintId}|${saved.rev}`, () => trackComparison(a, saved.fingerprints)),
      } : null,
      english: videoId ? pickEnglish() : null,
      view: Object.freeze({ ...view }),
      settings,
      notice,
      error,
      version,
      bundle,
      activeSlot,
      slots: slotModels(bundle),
      marks: bundle && activeSlot ? { slot: activeSlot, items: bundle.slots[activeSlot - 1].marks } : null,
      previous: bundle?.previous ? { from: bundle.previous.from, savedAt: bundle.previous.savedAt } : null,
      prefs,
    });
  }

  let state = compute();
  /** يبلّغ كل مشترك على حدة: استثناء في مشترك لا يوقف المتحكم ولا يحرم غيره. */
  function changed() {
    version++;
    state = compute();
    for (const fn of [...listeners]) {
      try {
        fn(state);
      } catch (err) {
        listenerFailures++;
        lastListenerError = toErrorInfo(err);
      }
    }
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
      if (id === videoId) saved = next;
      writeEpoch++;
      return { id, next };
    } finally {
      pendingWrites--;
      if (!pendingWrites && externalWhileWriting) {
        externalWhileWriting = false;
        reloadIfNewer();
      }
    }
  }

  /** كتابة واحدة في حزمة الفيديو الحالي (الإصدار الثاني)، بقواعد writeRecord نفسها. */
  async function writeBundle(fn) {
    const id = requireVideo();
    pendingWrites++;
    try {
      const next = await store.updateBundle(id, fn);
      if (id === videoId) saved = next ? next.record : null;
      writeEpoch++;
      return { id, next };
    } finally {
      pendingWrites--;
      if (!pendingWrites && externalWhileWriting) {
        externalWhileWriting = false;
        reloadIfNewer();
      }
    }
  }

  /** يعيد قراءة السجل ويطبّقه إن اختلفت نسخته عمّا في الحالة. */
  async function reloadIfNewer({ force = false } = {}) {
    const id = videoId;
    if (!id) return;
    const seq = loadSeq;
    try {
      const rec = await store.getVideo(id);
      if (id !== videoId || seq !== loadSeq) return;
      // كتابة بدأت أثناء القراءة: تُطبَّق القراءة بعد انتهائها، فلا تطمس نقرة ± جارية.
      if (pendingWrites) {
        externalWhileWriting = true;
        return;
      }
      if (!force && versionOf(rec) === versionOf(saved)) return;
      saved = rec;
      view = rec ? { ...rec.view } : defaultView();
      error = null;
    } catch (err) {
      if (id !== videoId) return;
      error = toErrorInfo(err);
    }
    changed();
  }

  /**
   * الإزاحة ووضع العرض: يتغيّران فورًا في الحالة، ويُحفظان في السجل إن وُجد؛ وبلا سجل يبقيان للجلسة.
   * أثناء قراءة سجل الفيديو (loading) لا أثر لها: الأدوات تعطّلها حتى تكتمل.
   */
  async function setView(patch) {
    if (loading) return state;
    view = { ...view, ...patch };
    changed();
    if (!saved) return state;
    try {
      await writeRecord((rec) => (rec ? withView(rec, patch, iso()) : undefined));
      error = null;
    } catch (err) {
      error = toErrorInfo(err);
      // لم تُحفظ: يعود العرض إلى المحفوظ (ما لم تبقَ كتابة أخرى جارية تحسمه)، فلا تُعرض إزاحة تزول عند إعادة الفتح
      // (تدقيق 5fedcb9، GM-027.4).
      if (saved && !pendingWrites) view = { ...saved.view };
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

    /**
     * تحميل الإعدادات ثم الفيديو الحالي. يُستدعى مرة من main.js. إن تبدّل الفيديو أثناء تحميل الإعدادات
     * (تنقل مبكر) فالتبديل الأحدث هو الصحيح، ولا يُعاد إلى المعرّف القديم.
     */
    async start(initialVideoId) {
      const seq0 = loadSeq;
      try {
        settings = await store.getSettings();
        if (!saved && !loading) view = { ...view, displayMode: settings.displayModeDefault };
        if (typeof store.getPrefs === 'function') prefs = await store.getPrefs();
      } catch (err) {
        error = toErrorInfo(err);
      }
      changed();
      if (loadSeq === seq0) await controller.setVideo(initialVideoId ?? null);
    },

    /**
     * تبديل الفيديو: تُمسح الحالة ومسارات المستخرج معًا قبل أي إشعار (فلا يظهر شيء من الفيديو السابق)،
     * ثم يُحمَّل سجل الجديد وحده.
     * @param {string | null} id
     */
    async setVideo(id) {
      const next = isVideoId(id) ? id : null;
      if (next === videoId) return;
      const seq = ++loadSeq;
      videoId = next;
      saved = null;
      view = defaultView();
      notice = null;
      error = null;
      memo.clear();
      loading = !!next;
      extractor?.setVideo(next);
      changed();
      if (!next) return;
      const epoch = writeEpoch;
      try {
        const rec = await store.getVideo(next);
        if (seq !== loadSeq) return;
        // كتابة (استيراد أو تصدير) تمت أثناء القراءة: القراءة الآن أقدم منها، فيُقرأ الأحدث.
        if (writeEpoch !== epoch) {
          loading = false;
          await reloadIfNewer({ force: true });
          return;
        }
        saved = rec;
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
      // بصمات الترجمات غير النشطة والسابقة لا يسقطها حد البصمات (الإصدار الثاني).
      const keep = referencedFingerprints(bundleFor(saved));
      const { id, next } = await writeRecord((rec) => withExport(rec, {
        videoId: vid, title: page.title?.() ?? null, durationMs: page.durationMs?.() ?? null, englishTrack, fingerprint,
        displayMode: view.displayMode === 'off' ? settings.displayModeDefault : view.displayMode,
      }, iso(), { keep }));
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

    /**
     * تبديل الترجمة النشطة (الإصدار الثاني): كتابة واحدة تحفظ لكل ترجمة نصها وتعديلاتها وإزاحتها. لا أثر أثناء loading.
     * @param {1 | 2 | 3} n
     */
    async activateSlot(n) {
      if (loading) return state;
      requireVideo();
      if (!bundleFor(saved)?.slots[n - 1]?.track) throw new TjError(n === 1 || n === 2 || n === 3 ? 'ST_SLOT_EMPTY' : 'MD_INVALID', { detail: `slot=${n}` });
      const { id, next } = await writeBundle((b) => (b ? withActiveSlot(b, n, iso()) : undefined));
      if (id === videoId && next) {
        view = { ...next.record.view };
        error = null;
        changed();
      }
      return state;
    },

    /**
     * الرفع إلى خانة (الإصدار الثاني) بمدخل loadArabic ومعه current اختياري («إبقاء تعديلاتي»). الممتلئة تحتاج replace
     * وتحفظ السابقة؛ والفارغة تصبح النشطة افتراضيًا (Q16).
     * @param {1 | 2 | 3} n
     * @param {{ fileName: string, cues: Cue[], current?: Cue[] | null, comparison?: object | null, fingerprintId?: string | null, notes?: string[] }} input
     * @param {{ replace?: boolean, activate?: boolean }} [opts]
     * @returns {Promise<{ record: VideoRecord, replaced: boolean, activated: boolean }>}
     */
    async loadArabicInto(n, input, { replace = false, activate } = {}) {
      const vid = requireVideo();
      const englishTrack = preferredCapturedTrack();
      const activeBefore = bundleFor(saved)?.active ?? null;
      let result = { replaced: false, offsetWas: 0 };
      const { id, next } = await writeBundle((b) => {
        result = withSlotUpload(b, n, {
          videoId: vid, title: page.title?.() ?? null, durationMs: page.durationMs?.() ?? null, ...input,
          englishTrack, displayModeDefault: settings.displayModeDefault,
        }, iso(), { replace, activate });
        return result.bundle;
      });
      const activated = next.active === n && activeBefore !== n;
      if (id === videoId) {
        view = { ...next.record.view };
        notice = result.offsetWas !== 0 ? { code: 'ST_OFFSET_RESET', tone: 'info', at: now() }
          : result.replaced ? { code: 'ST_PREVIOUS_SAVED', tone: 'info', at: now() } : null;
        error = null;
        changed();
      }
      return { record: next.record, replaced: result.replaced, activated };
    },

    /**
     * يعلّم مقطع النشطة (برقمه في state.arabic.cues) أو يزيل علامته (kind = null)، مع تراجع بكتابة واحدة.
     * @param {{ index: number }} target @param {'todo' | 'done' | null} [kind]
     * @returns {Promise<{ mark: import('../core/model/marks.js').Mark | null, undo: () => Promise<void> }>}
     */
    async markCue({ index }, kind = 'todo') {
      requireVideo();
      const slot = bundleFor(saved)?.active ?? null;
      if (!slot) throw new TjError('ST_NO_RECORD');
      let before = [];
      let mark = null;
      const { id, next } = await writeBundle((b) => {
        if (!b || b.active !== slot) throw new TjError('ST_NO_RECORD');
        const r = withMark(b, slot, { index, kind }, iso());
        before = r.before;
        mark = r.mark;
        return r.bundle;
      });
      if (id === videoId && next) changed();
      return {
        mark,
        undo: async () => {
          const { id: uid, next: back } = await writeBundle((b) => (b && b.slots[slot - 1].track ? withMarksReplaced(b, slot, { remove: mark ? [mark] : [], add: before }, iso()) : undefined));
          if (uid === videoId && back) changed();
        },
      };
    },

    /** تفضيلات الإصدار الثاني. @param {Record<string, unknown>} patch */
    async updatePrefs(patch) {
      prefs = await store.setPrefs(patch);
      changed();
      return prefs;
    },

    dismissNotice() {
      if (!notice) return;
      notice = null;
      changed();
    },

    /** يعيد قراءة سجل الفيديو الحالي من التخزين. */
    reload: () => reloadIfNewer({ force: true }),

    /**
     * تغيّرات التخزين من أي سياق (المحرّر، والمحفوظات، والإعدادات، وتبويب آخر). صدى كتابات هذا المتحكم
     * يُعرف بنسخة السجل (المراجعة وتاريخ الحفظ)، والحدث الأقدم من الحالة يُهمل، وغيرهما يُعاد قراءته.
     * @param {import('../core/store/index.js').StoreChange} change
     */
    handleStoreChange(change) {
      if (change.settings) {
        settings = normalizeSettings(change.settings.newValue ?? DEFAULT_SETTINGS);
        if (!saved && !loading && view.displayOffsetMs === 0) view = { ...view, displayMode: settings.displayModeDefault };
        changed();
      }
      if (change.prefs) {
        prefs = normalizePrefs(change.prefs.newValue ?? DEFAULT_PREFS);
        changed();
      }
      if (!videoId) return;
      const mine = change.videos[videoId];
      if (!mine && !change.cleared) return;
      const nv = mine?.newValue ?? null;
      if (nv && versionOf(nv) === versionOf(saved)) return;
      if (nv && saved && Number.isInteger(nv.rev) && nv.rev < saved.rev) return;
      if (pendingWrites) {
        externalWhileWriting = true;
        return;
      }
      reloadIfNewer();
    },

    /** للتشخيص: أعداد ورموز فقط. */
    diagnostics: () => ({
      videoId, loading, version, pendingWrites, listenerFailures, lastListenerError,
      extractor: extractor ? extractor.diagnostics() : null,
    }),
  };

  // التقاط أو رفض أو تنقل في المستخرج يغيّر الحالة.
  extractor?.subscribe(() => changed());
  return controller;
}
