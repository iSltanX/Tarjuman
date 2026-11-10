// المتحكم (عقد interfaces §١): مصدر الحالة الوحيد في صفحة يوتيوب. يعرف الفيديو الحالي وسجله المحفوظ
// والمسارات الملتقطة والإزاحة ووضع العرض والإعدادات، ويطبّق عقد التوقيت: الإزاحة تُحفظ لكل فيديو ولا تمس
// التوقيت المحفوظ، والاستيراد يصفّرها بإشعار، والتصدير الإنجليزي لا يتأثر بها. الطبقة والأدوات تقرآن
// الحالة وتشتركان في تغيّرها، ولا تكتبان في التخزين إلا عبر أفعاله. وفي الإصدار الثاني (عقد interfaces §١٢) يعرف حزمة
// الفيديو (الترجمات الثلاث والسابقة والعلامات) والتفضيلات، ويبدّل النشطة ويرفع إلى خانة ويعلّم المقطع بتراجع.
import { trackComparison } from '../core/compare/index.js';
import { sameExport } from '../core/import/review.js';
import { withContinuation } from '../core/import/continuation.js';
import { TjError, toErrorInfo } from '../core/errors/index.js';
import {
  bundleFromRecord, referencedFingerprints, slotModels, withActiveSlot, withMark, withMarksReplaced, withSlotLang, withSlotUpload,
} from '../core/model/bundle.js';
import { isVideoId } from '../core/model/ids.js';
import { DEFAULT_PREFS, normalizePrefs } from '../core/model/prefs.js';
import { normalizeLangPrefs } from '../core/model/lang-prefs.js';
import { DEFAULT_SETTINGS, normalizeSettings } from '../core/model/settings.js';
import { normalizeOffset } from '../core/model/timing.js';
import { rankUsable } from '../core/model/track-order.js';
import { markAnchor, sameAnchor } from '../core/model/marks.js';
import { canonical } from '../core/store/version.js';
import { withArabicImport, withExport, withExportRefreshed, withView } from '../core/model/transitions.js';
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
 *   previous: null | { from: 1 | 2 | 3, savedAt: string }, prefs: import('../core/model/prefs.js').Prefs,
 *   langPrefs: import('../core/model/lang-prefs.js').LangPrefs, available: import('../extract/message.js').TrackList | null
 * }} ControllerState langPrefs (AA3): تفضيلات اللغات لاقتراح لغة الملف عند الرفع («إلى» في نافذة الإضافة)
 * @typedef {ReturnType<typeof createController>} Controller
 */

/** المسار المستخرج كما يُحفظ في السجل، والمترجم آليًا بلغة أصله via. */
const sourceTrack = (t, cues) => ({ key: t.key, lang: t.lang, kind: t.kind, capturedAt: t.capturedAt, source: 'capture', cues, ...(t.via ? { via: t.via } : {}) });

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
  // كل إعدادات جديدة تمر من هنا: عتبة الاكتمال تصل إلى المستخرج قبل أن تُحسب الحالة (تدقيق 7a66f91، U37).
  const applySettings = (next) => {
    settings = next;
    extractor?.setCompleteness?.(settings.thresholds.completeness);
  };
  let prefs = normalizePrefs(DEFAULT_PREFS);
  let langPrefs = normalizeLangPrefs(null);
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
  // أحداث وصلت والكتابة جارية: نسخها، أو 'reload' لما لا نسخة له (حذف، أو مسح، أو قراءة تزامنت مع كتابة، أو كتابة فشلت).
  // بعد الكتابات تُعاد القراءة إلا إن كانت كلها صدى ما كُتب هنا: مع الكاتب الواحد (تدقيق 7a66f91، C2) يصل حدث الكتابة نفسها
  // قبل ردها عادةً، فلا تتبع كل ± قراءةٌ كاملة زائدة.
  let deferred = new Set();
  // نسخ ما كتبه هذا المتحكم في النافذة نفسها (رشقة ± تمر بنسخ وسيطة كلها صداه).
  let written = new Set();
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
    const captured = extractor ? rankUsable(extractor.tracks()) : [];
    if (captured.length) {
      const t = captured[0];
      const cues = stable('english', `${videoId}|captured:${t.key}@${t.capturedAt}`, () => extractor.convert(t.key).cues);
      return { key: t.key, kind: t.kind, lang: t.lang, via: t.via ?? null, cues, source: 'captured' };
    }
    const s = saved ? rankUsable(saved.english)[0] ?? null : null;
    if (!s) return null;
    const cues = stable('english', `${videoId}|saved:${s.key}@${s.capturedAt}`, () => s.cues);
    return { key: s.key, kind: s.kind, lang: s.lang, via: s.via ?? null, cues, source: 'saved' };
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
      // قائمة مسارات الفيديو كما في بيانات المشغّل (AA1): ما يمكن أن يختاره المستخدم من يوتيوب، لا ما التُقط.
      available: extractor?.available ? extractor.available() : null,
      captureIssue: extractor ? extractor.lastRejection() : null,
      arabic: a ? {
        // الخانة والملف في المفتاح: ترجمتان بتاريخ استيراد واحد لا تلتبسان بعد التبديل.
        cues: stable('arabic', `${videoId}|${activeSlot}|${a.fileName}|${a.importedAt}|${a.editedAt}`, () => a.current ?? a.original),
        edited: a.current !== null, fileName: a.fileName,
        // لغة الترجمة (AA1)، وnull «غير محددة» لما حُفظ قبل 2.0.0 أو بلا لغة.
        lang: a.lang ?? null,
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
      langPrefs,
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

  /** بعد آخر كتابة جارية: يُعاد قراءة السجل إن وصل أثناءها حدث غير صدى ما انتهت إليه الحالة. */
  function settleDeferred() {
    if (pendingWrites || !deferred.size) return;
    const seen = deferred;
    const own = written;
    deferred = new Set();
    written = new Set();
    if ([...seen].some((v) => !own.has(v))) reloadIfNewer();
  }

  /** كتابة واحدة في سجل الفيديو الحالي؛ الأحداث الخارجية أثناءها تؤجَّل حتى تنتهي. */
  async function writeRecord(fn) {
    const id = requireVideo();
    pendingWrites++;
    try {
      const next = await store.updateVideo(id, fn);
      if (id === videoId) saved = next;
      written.add(versionOf(next));
      writeEpoch++;
      return { id, next };
    } catch (err) {
      deferred.add('reload');
      throw err;
    } finally {
      pendingWrites--;
      settleDeferred();
    }
  }

  /** كتابة واحدة في حزمة الفيديو الحالي (الإصدار الثاني)، بقواعد writeRecord نفسها. */
  async function writeBundle(fn, opts) {
    const id = requireVideo();
    pendingWrites++;
    try {
      const next = await store.updateBundle(id, fn, opts);
      if (id === videoId) saved = next ? next.record : null;
      written.add(versionOf(next ? next.record : null));
      writeEpoch++;
      return { id, next };
    } catch (err) {
      deferred.add('reload');
      throw err;
    } finally {
      pendingWrites--;
      settleDeferred();
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
        deferred.add('reload');
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

  /** هوية الترجمة النشطة في السجل: ملفها ووقت استيرادها (لكل خانة ملفها، والاستبدال يغيّر الوقت). */
  const activeKey = (rec) => (rec?.arabic ? `${rec.arabic.fileName}|${rec.arabic.importedAt}` : null);

  /**
   * الإزاحة ووضع العرض: يتغيّران فورًا في الحالة، ويُحفظان في السجل إن وُجد؛ وبلا سجل يبقيان للجلسة.
   * أثناء قراءة سجل الفيديو (loading) لا أثر لها: الأدوات تعطّلها حتى تكتمل.
   * الإزاحة للترجمة التي يراها المستخدم وحدها (تدقيق 7a66f91، U12): إن صارت النشطة غيرها من مكان آخر قبل وصول إشعاره لا تُكتب،
   * ويُعرض المخزَّن مع CT_ACTIVE_CHANGED. و± فرقٌ (`delta`) يُضاف إلى المخزَّن، فلا تمحو ضغطةٌ ضغطةً من تبويب آخر.
   * @param {Partial<{ displayOffsetMs: number, displayMode: string }>} patch @param {{ delta?: number }} [opts]
   */
  async function setView(patch, { delta } = {}) {
    if (loading) return state;
    const seen = activeKey(saved);
    const offsetChange = 'displayOffsetMs' in patch;
    view = { ...view, ...patch };
    changed();
    if (!saved) return state;
    let stale = false;
    try {
      await writeRecord((rec) => {
        if (!rec) return undefined;
        if (offsetChange && activeKey(rec) !== seen) {
          stale = true;
          return undefined;
        }
        const p = delta === undefined ? patch : { ...patch, displayOffsetMs: normalizeOffset(rec.view.displayOffsetMs + delta) };
        return withView(rec, p, iso());
      });
      error = null;
      if (stale) notice = { code: 'CT_ACTIVE_CHANGED', tone: 'info', at: now() };
      // المخزَّن هو المعروض حين لا كتابة أخرى جارية: ± من تبويب آخر تظهر هنا، والمرفوضة لا تبقى.
      if (saved && !pendingWrites && (stale || delta !== undefined)) view = { ...saved.view };
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
    const t = rankUsable(extractor.tracks())[0];
    if (!t) return null;
    const conv = extractor.convert(t.key, { mode: 'normal' });
    return conv.ok ? sourceTrack(t, conv.cues) : null;
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
        applySettings(await store.getSettings());
        if (!saved && !loading) view = { ...view, displayMode: settings.displayModeDefault };
        if (typeof store.getPrefs === 'function') prefs = await store.getPrefs();
        if (typeof store.getLangPrefs === 'function') langPrefs = await store.getLangPrefs();
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
      return setView({ displayOffsetMs: normalizeOffset(view.displayOffsetMs + dir * settings.offsetStepMs) }, { delta: dir * settings.offsetStepMs });
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
      const englishTrack = sourceTrack({ ...info, key: conv.key, lang: conv.lang, kind: conv.kind, via: conv.via }, conv.cues);
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
     * بعد تنزيل المسار الإنجليزي المحفوظ من المشغّل بلا التقاط حي (تدقيق Fable، FA-17، بقرار سلطان 2026-11-07): البصمة تُحفظ
     * كما يحفظها تصدير المحفوظات (exportEnglish) إن لم تكن بصمة التصدير نفسه محفوظة، فلا تتراكم نسخ متطابقة؛ والمسار المحفوظ
     * كما هو. الإزاحة لا تدخل.
     * @param {{ trackKey: string, fingerprint: import('../core/model/tracks.js').Fingerprint }} p
     * @returns {Promise<{ stored: boolean }>}
     */
    async recordSavedExport({ trackKey, fingerprint }) {
      const vid = requireVideo();
      const track = saved?.english.find((t) => t.key === trackKey) ?? null;
      if (!track) throw new TjError('EX_NO_TRACK');
      const keep = referencedFingerprints(bundleFor(saved));
      let stored = false;
      let refreshed = false;
      const { id } = await writeRecord((rec) => {
        stored = false;
        refreshed = false;
        if (!rec) return undefined;
        // التصدير المعروف لا يُكرَّر، لكنه يصير «آخر تنزيل» (تدقيق V2، U-024): البصمة نفسها تُحدَّث وتنتقل إلى الأحدث.
        const same = (f) => sameExport(f, fingerprint) && f.parts === null && fingerprint.parts === null;
        if (rec.fingerprints.some(same)) {
          const next = withExportRefreshed(rec, same, iso());
          refreshed = next !== null;
          return next ?? undefined;
        }
        stored = true;
        return withExport(rec, {
          videoId: vid, title: page.title?.() ?? null, durationMs: page.durationMs?.() ?? null, englishTrack: rec.english.find((t) => t.key === trackKey) ?? track, fingerprint,
          displayMode: view.displayMode === 'off' ? settings.displayModeDefault : view.displayMode,
        }, iso(), { keep });
      });
      if ((stored || refreshed) && id === videoId) changed();
      return { stored };
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
      applySettings(await store.setSettings(patch));
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
      // الاستبدال تأكيدٌ على ما رآه المستخدم (U12): إن تغيّرت ترجمة الخانة أو النسخة السابقة قبله رُفض بـST_CONFLICT، فلا تُسقط
      // نسخةٌ كان يمكن استعادتها. والمقارنة بالمحتوى لا بالنسخة، فـ± معلّقة من هذا التبويب نفسه لا ترفضه.
      const basis = (b) => canonical({ track: b?.slots[n - 1]?.track ?? null, previous: b?.previous ?? null });
      const seen = replace ? basis(bundleFor(saved)) : null;
      let wrote;
      try {
        wrote = await writeBundle((b) => {
          if (seen !== null && basis(b) !== seen) throw new TjError('ST_CONFLICT', { detail: `slot=${n}` });
          result = withSlotUpload(b, n, {
            videoId: vid, title: page.title?.() ?? null, durationMs: page.durationMs?.() ?? null, ...input,
            englishTrack, displayModeDefault: settings.displayModeDefault,
          }, iso(), { replace, activate });
          return result.bundle;
        });
      } catch (err) {
        if (err instanceof TjError && err.code === 'ST_CONFLICT') await reloadIfNewer();
        throw err;
      }
      const { id, next } = wrote;
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
     * «إكمال الترجمة N» (ف3): الناتج نسخة حالية للخانة بملاحظة (withContinuation). يُرفض بـST_CONFLICT إن تغيّرت ترجمة الخانة
     * عمّا حُسب عليه الإكمال (cont.base)، فلا يُكتب ناتج قديم فوق ما تغيّر.
     * @param {import('../core/import/continuation.js').Continuation} cont @param {string} note
     */
    async completeSlot(cont, note) {
      requireVideo();
      const n = cont.n;
      const seen = canonical(cont.base);
      const { id, next } = await writeBundle((b) => {
        const track = b?.slots[n - 1]?.track ?? null;
        if (!track || canonical(track.current ?? track.original) !== seen) throw new TjError('ST_CONFLICT', { detail: `slot=${n}` });
        return withContinuation(b, cont, note, iso());
      });
      if (id === videoId && next) {
        view = { ...next.record.view };
        error = null;
        changed();
      }
      return { n };
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
      // المقطع الذي يراه المستخدم برقمه (FS-2): إن تغيّر محتوى الخانة من مكان آخر فصار الرقم لمقطع آخر رُفضت العلامة.
      const seenCue = state.arabic?.cues[index] ?? null;
      let before = [];
      let mark = null;
      const { id, next } = await writeBundle((b) => {
        if (!b || b.active !== slot) throw new TjError('ST_NO_RECORD');
        const track = b.slots[slot - 1].track;
        const cue = track ? (track.current ?? track.original)[index] : null;
        if (seenCue && (!cue || !sameAnchor(markAnchor(cue), markAnchor(seenCue)))) throw new TjError('ST_CONFLICT', { detail: `cue=${index}` });
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

    /**
     * لغة ترجمة خانة ممتلئة (AA3): رمز أو null «غير محددة»، من قائمة الترجمة في المشغّل. لا يمس النص ولا التوقيت.
     * @param {1 | 2 | 3} n @param {string | null} lang
     */
    async setSlotLang(n, lang) {
      if (loading) return state;
      requireVideo();
      if (!bundleFor(saved)?.slots[n - 1]?.track) throw new TjError('ST_SLOT_EMPTY', { detail: `slot=${n}` });
      const { id, next } = await writeBundle((b) => (b ? withSlotLang(b, n, lang, iso()) : undefined), { touch: false });
      if (id === videoId && next) {
        error = null;
        changed();
      }
      return state;
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
        applySettings(normalizeSettings(change.settings.newValue ?? DEFAULT_SETTINGS));
        if (!saved && !loading && view.displayOffsetMs === 0) view = { ...view, displayMode: settings.displayModeDefault };
        changed();
      }
      if (change.prefs) {
        prefs = normalizePrefs(change.prefs.newValue ?? DEFAULT_PREFS);
        changed();
      }
      if (change.langPrefs) {
        langPrefs = normalizeLangPrefs(change.langPrefs.newValue ?? null);
        changed();
      }
      if (!videoId) return;
      const mine = change.videos[videoId];
      if (!mine && !change.cleared) return;
      const nv = mine?.newValue ?? null;
      if (nv && versionOf(nv) === versionOf(saved)) return;
      if (nv && saved && Number.isInteger(nv.rev) && nv.rev < saved.rev) return;
      if (pendingWrites) {
        deferred.add(nv ? versionOf(nv) : 'reload');
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
