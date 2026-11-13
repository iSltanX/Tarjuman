// واجهة ExtractorAdapter (عقد docs/contracts/interfaces.md §٢): نقطة الدخول الوحيدة من سكربت المحتوى
// إلى الاستخراج. تملكها P3 وتحفظ التوقيعات أدناه لأن src/content مجمَّد؛ وما خلفها يتغير كما يشاء.
// ذاكرة المسارات للفيديو الحالي وحده وفي الجلسة فقط: الجسم الخام لا يُخزَّن ولا يُرسَل، ولا رابط ولا رمز. والصفحة بلا فيديو
// (المشغّل المصغّر) تُبقي مسارات آخر فيديو محجوبة حتى يعود فتظهر، أو يأتي غيره فتُمسح (تحقق Gemini، Y4-أ).
import { LIMITS } from '../core/model/validate.js';
import { parseTrackKey, trackKey } from '../core/model/ids.js';
import { COMPLETENESS_RATIO, normalizeCompleteness, normalizeLongOptions } from '../core/convert/index.js';
import { checkAcceptance, convertCapture, trackOf } from './capture-adapter.js';
import { createCaptureStore } from './capture-store.js';
import { createPendingBuffer } from './pending.js';
import { MAX_BODY_CHARS, validateCaptureMessage, validateSeenMessage, validateTracklistMessage } from './message.js';

const MODES = Object.freeze(['normal', 'long']);
const NO_SLOTS = new Map();
const MAX_RUNS_PER_TRACK = 6;
const MAX_RECENT_REJECTIONS = 20;
/**
 * حد إجمالي لمحارف أجسام المسارات المحتفظ بها للفيديو الحالي: ضعف حد الرسالة الواحدة، فيبقى أكبر مسارين ممكنين، والأحدث
 * يبقى دائمًا وإن تجاوزه وحده (تدقيق 7a66f91، U33). الأجسام الحقيقية نحو مليون محرف لخمسين دقيقة ASR.
 */
export const MAX_CAPTURED_CHARS = 2 * MAX_BODY_CHARS;
/**
 * ن-٦ (قرار سلطان 2026-11-13: «حكم البث يخص الفيديو الملتقط نفسه»): بعد تبدّل الفيديو تبقى شارة بث السابق ظاهرة لحظات (قيست حتى
 * 787 م.ث في Brave و552 في Edge و506 في Firefox، في التحقق المستقل للجولة الثانية)، فالتقاط يُقيَّم فيها (ومنه ما انتظر تبدّل العنوان)
 * لا يُحكم عليه بها: يُمسك ويُعاد تقييمه كل LIVE_RECHECK_MS، فيُقبل متى زالت الشارة، ولا يُرفض EX_LIVE إلا إن بقيت ظاهرة حتى
 * تنقضي LIVE_SETTLE_MS من التبدّل، وحينها هي شارة الفيديو نفسه. وبعد هذه المدة يُحكم بالشارة فورًا كما كان.
 */
export const LIVE_SETTLE_MS = 3000;
export const LIVE_RECHECK_MS = 250;
const MAX_LIVE_HELD = 8;

/**
 * @typedef {{
 *   key: string, lang: string, kind: 'manual' | 'asr', via: string | null, capturedAt: string,
 *   ok: boolean, code: string | null, warnings: string[], cueCount: number,
 *   completeness: number | null, lastEndMs: number | null
 * }} TrackInfo via: لغة المسار الذي ترجمه يوتيوب آليًا عنه، وnull للأصلي (AA1)
 * @typedef {{
 *   ok: boolean, code: string | null, key: string, lang: string, kind: 'manual' | 'asr', via: string | null, mode: 'normal' | 'long',
 *   cues: { n: number, startMs: number, endMs: number, text: string }[], warnings: string[], report: object | null
 * }} ConvertResult
 * @typedef {{ code: string, at: number, videoId: string | null }} Rejection
 */

/**
 * @param {{
 *   currentVideoId: () => string | null,
 *   durationMs?: () => number | null,
 *   isLive?: () => boolean,
 *   now?: () => number,
 *   maxCapturedChars?: number,
 *   setTimeout?: (fn: () => void, ms: number) => unknown,
 *   clearTimeout?: (id: unknown) => void,
 * }} env maxCapturedChars: حد المحارف الإجمالي (MAX_CAPTURED_CHARS افتراضيًا؛ الاختبار يصغّره)؛ setTimeout وclearTimeout لإعادة
 *   تقييم الممسوك بشارة البث (ن-٦)، ومؤقتات الصفحة افتراضيًا (الاختبار يحقن مؤقتات وهمية)
 */
export function createExtractor(env) {
  const now = env.now ?? (() => Date.now());
  const durationMs = env.durationMs ?? (() => null);
  const isLive = env.isLive ?? (() => false);
  const setTimer = env.setTimeout ?? ((fn, ms) => globalThis.setTimeout(fn, ms));
  const clearTimer = env.clearTimeout ?? ((id) => globalThis.clearTimeout(id));
  const maxCapturedChars = Number.isInteger(env.maxCapturedChars) && env.maxCapturedChars > 0 ? env.maxCapturedChars : MAX_CAPTURED_CHARS;
  /** عتبة «قد يكون ناقصًا» من الإعدادات، يمرّرها المتحكم بـsetCompleteness (تدقيق 7a66f91، U37). */
  let completeness = COMPLETENESS_RATIO;
  // مخزن الالتقاط مالك الأجسام، والخانات تشير إلى مدخلاته نفسها؛ وما يُطرد من الخانات يُحرَّر منه (U33).
  const captures = createCaptureStore({ now });
  const pending = createPendingBuffer();
  /**
   * مسارات الفيديو الحالي بمفتاح lang|kind (الإدراج الأقدم أولًا). التحويل يُحسب عند الطلب بالمدة المعروفة
   * حينها ويُخزَّن بحسب (الوضع، المدة، الخيارات)، فالتقاط سبق معرفة المدة يُفحص بحدودها لاحقًا.
   * @type {Map<string, { entry: import('./capture-store.js').AcceptedCapture, runs: Map<string, ReturnType<typeof convertCapture>> }>}
   */
  const slots = new Map();
  /** @type {Rejection | null} */
  let lastRejection = null;
  /** قائمة مسارات الفيديو الحالي كما في بيانات المشغّل (AA1)، أو null قبل وصولها. @type {import('./message.js').TrackList | null} */
  let listed = null;
  const listeners = new Set();
  let listenerFailures = 0;
  /** طلبات الترجمة التي رآها غلافا الالتقاط للفيديو المعروض، وأكبر عدّ في الصفحة كلها (ف7). أعداد فقط. */
  let seen = { videoId: /** @type {string | null} */ (null), count: 0 };
  let seenPage = 0;
  /** متى صار الفيديو الحالي هو المعروض (ن-٦): شارة البث قبل LIVE_SETTLE_MS منه قد تكون للسابق. */
  let videoSince = now();
  /** التقاطات الفيديو الحالي الممسوكة بشارة بث قد لا تخصه (ن-٦)، بترتيب وصولها، ومؤقت إعادة تقييمها. @type {import('./message.js').CaptureMessage[]} */
  let liveHeld = [];
  let liveTimer = /** @type {unknown} */ (null);
  // كل مشترك على حدة: استثناء في أحدهم لا يخرج من معالج رسالة الجسر ولا يحرم غيره.
  const emit = () => {
    for (const fn of [...listeners]) {
      try {
        fn();
      } catch {
        listenerFailures++;
      }
    }
  };

  /** الفيديو الذي تخصه الخانات (كلها لفيديو واحد)، أو null إن خلت. */
  const slotsVideo = () => slots.values().next().value?.entry.videoId ?? null;
  /** خانات الفيديو الحالي؛ وفي صفحة بلا فيديو لا شيء، وإن بقيت فيها خانات آخر فيديو (Y4-أ). */
  const visibleSlots = () => (captures.currentVideoId === null ? NO_SLOTS : slots);

  function sync(current) {
    if (!captures.setCurrentVideo(current)) return;
    lastRejection = null;
    // ن-٦: الممسوك يخص الفيديو السابق، فيسقط؛ ومدة الشك في الشارة تبدأ من هنا.
    videoSince = now();
    dropLive();
    if (listed && listed.videoId !== current) listed = null;
    // Y4-أ: صفحة بلا فيديو لا تمسح مسارات آخر فيديو (المخزن يُبقي أجسامها)، فتعود بالعودة إليه؛ والفيديو الآخر يمسحها.
    if (current !== null && slotsVideo() !== current) slots.clear();
  }

  /**
   * @param {{ entry: { body: string, trackKind: 'manual' | 'asr' }, runs: Map<string, object> }} slot
   * @param {'normal' | 'long'} mode
   * @param {object} [longOptions] خيارات الوضع الطويل؛ الافتراضية إن غابت
   */
  function run(slot, mode, longOptions) {
    const dMs = durationMs();
    const opts = mode === 'long' && longOptions ? normalizeLongOptions(longOptions) : undefined;
    const id = `${mode}|${dMs ?? ''}|${completeness}|${opts ? JSON.stringify(opts) : ''}`;
    let hit = slot.runs.get(id);
    if (!hit) {
      hit = convertCapture(slot.entry, dMs, { mode, longOptions: opts, completenessRatio: completeness });
      if (slot.runs.size >= MAX_RUNS_PER_TRACK) slot.runs.delete(slot.runs.keys().next().value);
      slot.runs.set(id, hit);
    }
    return hit;
  }

  /** @returns {TrackInfo} */
  function infoOf(key, slot) {
    const conv = run(slot, 'normal');
    return {
      key, lang: slot.entry.lang, kind: slot.entry.trackKind, via: slot.entry.via ?? null, capturedAt: new Date(slot.entry.at).toISOString(),
      ok: conv.ok, code: conv.code, warnings: conv.warnings.slice(), cueCount: conv.ok ? conv.cues.length : 0,
      completeness: conv.report.completeness ?? null, lastEndMs: conv.report.lastEndMs ?? null,
    };
  }

  function dropLive() {
    liveHeld = [];
    if (liveTimer !== null) clearTimer(liveTimer);
    liveTimer = null;
  }

  /** ن-٦: يُمسك التقاط الفيديو الحالي حتى يُعرف أن شارة البث له، بحد عدد ومحارف كمخزن الانتظار (الأحدث يبقى). */
  function holdLive(msg) {
    liveHeld.push(msg);
    let total = liveHeld.reduce((n, m) => n + m.body.length, 0);
    while (liveHeld.length > 1 && (liveHeld.length > MAX_LIVE_HELD || total > MAX_BODY_CHARS)) total -= liveHeld.shift().body.length;
    if (liveTimer === null) liveTimer = setTimer(recheckLive, LIVE_RECHECK_MS);
  }

  /**
   * ن-٦: زالت الشارة فيُقيَّم الممسوك بكل القواعد (فيُقبل)، أو انقضت مدة الشك وهي ظاهرة فيُحكم بها (EX_LIVE كما كان)؛ وإلا يُعاد
   * بعد LIVE_RECHECK_MS. وتبدّل الفيديو أثناءه يسقطه (sync).
   */
  function recheckLive() {
    liveTimer = null;
    if (!liveHeld.length) return;
    sync(env.currentVideoId());
    if (!liveHeld.length) return;
    if (isLive() && now() - videoSince < LIVE_SETTLE_MS) {
      liveTimer = setTimer(recheckLive, LIVE_RECHECK_MS);
      return;
    }
    const held = liveHeld;
    liveHeld = [];
    for (const msg of held) evaluate(msg, 0, true);
  }

  /**
   * @param {import('./message.js').CaptureMessage} msg بعد validateCaptureMessage
   * @param {number} [pendingAgeMs]
   * @param {boolean} [settled] حكم البث نهائي (بعد الإمساك، ن-٦)، فلا يُمسك ثانية
   */
  function evaluate(msg, pendingAgeMs, settled = false) {
    const current = env.currentVideoId();
    sync(current);
    const decision = checkAcceptance(msg, { currentVideoId: current, isLive: isLive() });
    // ن-٦: شارة بث بعد تبدّل الفيديو بقليل قد تكون للسابق: لا حكم بها الآن، ولا رفض يظهر للمستخدم.
    if (!decision.accepted && decision.code === 'EX_LIVE' && !settled && now() - videoSince < LIVE_SETTLE_MS) {
      holdLive(msg);
      return { accepted: false, code: decision.code };
    }
    if (!decision.accepted) {
      captures.reject({
        code: decision.code, detail: decision.detail, videoId: msg.videoId, currentVideoId: current, lang: msg.lang,
        trackKind: msg.trackKind, hasTlang: msg.hasTlang, format: msg.format, bodyLength: msg.bodyLength,
      });
      if (decision.code === 'EX_WRONG_VIDEO' && pendingAgeMs === undefined) pending.add(msg, now());
      // رفض فيديو آخر أو معاينة أو إعلان لا يخص المستخدم؛ غيره يُعرض له.
      if (decision.code !== 'EX_WRONG_VIDEO' && decision.code !== 'EX_NO_VIDEO') {
        lastRejection = { code: decision.code, at: now(), videoId: current };
        emit();
      }
      return { accepted: false, code: decision.code };
    }
    const track = trackOf(msg);
    const key = trackKey(track.lang, track.kind, track.via);
    // يُحوَّل قبل أن يحل محل شيء: التقاط لا يُحوَّل (بنية معيبة، أو بلا أحداث نصية) لا يحل محل التقاط سليم للمفتاح
    // نفسه، بل يُسجَّل رفضًا في التشخيص ويبقى السليم (تدقيق 7a66f91، U32). وبلا سابق سليم يبقى خانةً ليرى المستخدم رمزه.
    // وفشل الحدود وحده يتبع المدة اللحظية (تُعاد قراءتها عند كل طلب)، فلا يُبقي السابق: الأحدث يحل محله كما كان.
    // وجسم مطابق لآخر التقاط للمفتاح نفسه (إيقاف CC وتشغيلها، أو رسالة مكررة من الصفحة) لا يُحوَّل من جديد: تحويلاته هي نفسها
    // (تدقيق Fable، FA-07: نحو 120 م.ث لكل تكرار بستين ألف حدث).
    const prev = slots.get(key);
    const probe = { entry: { body: msg.body, trackKind: msg.trackKind, via: track.via }, runs: prev && prev.entry.body === msg.body ? prev.runs : new Map() };
    const conv = run(probe, 'normal');
    if (!conv.ok && conv.code !== 'EX_BEYOND_DURATION' && prev && run(prev, 'normal').ok) {
      captures.reject({
        code: conv.code, detail: 'لم يُحوَّل، والالتقاط السليم السابق باقٍ', videoId: msg.videoId, currentVideoId: current, lang: msg.lang,
        trackKind: msg.trackKind, hasTlang: msg.hasTlang, format: msg.format, bodyLength: msg.bodyLength,
      });
      return { accepted: false, code: conv.code };
    }
    const entry = captures.accept({
      videoId: msg.videoId, lang: track.lang, trackKind: track.kind, via: track.via, format: msg.format, transport: msg.transport,
      bodyLength: msg.bodyLength, body: msg.body, acceptedFor: current,
      meta: { hasPot: msg.hasPot, capsAsr: msg.capsAsr, kindParam: msg.kindParam },
    });
    // الالتقاط الأحدث للمفتاح نفسه يحل محل السابق (إيقاف CC وتشغيلها)، ويصير الأحدث إدراجًا.
    slots.delete(key);
    slots.set(key, { entry, runs: probe.runs });
    evict();
    lastRejection = null;
    emit();
    return { accepted: true, code: conv.code };
  }

  /** الأقدم يُطرد من الخانات ومن المخزن معًا فوق ثمانية مسارات أو فوق الحد الإجمالي، والأحدث يبقى (U33). */
  function evict() {
    let total = 0;
    for (const s of slots.values()) total += s.entry.body.length;
    while (slots.size > 1 && (slots.size > LIMITS.maxEnglishTracks || total > maxCapturedChars)) {
      const [oldKey, old] = slots.entries().next().value;
      slots.delete(oldKey);
      captures.release(old.entry);
      total -= old.entry.body.length;
    }
  }

  /**
   * «رُئي طلب ترجمة» من غلافي الالتقاط (ف7): يُعدّ للفيديو المعروض وحده، وأكبر عدّ في الصفحة. لا يُبلّغ المشتركين.
   * @param {unknown} data
   */
  function handleSeen(data) {
    const m = validateSeenMessage(data);
    if (!m) return { accepted: false, code: null };
    const current = env.currentVideoId();
    sync(current);
    if (seen.videoId !== current) seen = { videoId: current, count: 0 };
    if (current && m.videoId === current) seen.count++;
    seenPage = Math.max(seenPage, m.seen);
    return { accepted: true, code: null };
  }

  /**
   * قائمة المسارات من بيانات المشغّل (AA1): تُقبل للفيديو المعروض وحده، وتُبلَّغ المشتركين كل مرة ولو لم تتغير (تحقق Gemini،
   * Y3): عالم الصفحة يعيد إرسالها بعد تغيّر عنوان المستند، فيعيد المتحكم حساب عنوان الفيديو.
   * @param {unknown} data
   */
  function handleTracklist(data) {
    const list = validateTracklistMessage(data);
    if (!list) return { accepted: false, code: null };
    const current = env.currentVideoId();
    sync(current);
    if (list.videoId !== current) return { accepted: false, code: 'EX_WRONG_VIDEO' };
    listed = list;
    emit();
    return { accepted: true, code: null };
  }

  return {
    /**
     * بيانات MAIN → ISOLATED كما مرّرها الجسر (غير موثوقة): تُتحقق بنيتها هنا ثم تُقيَّم بقواعد القبول.
     * @param {unknown} data
     * @returns {{ accepted: boolean, code: string | null }}
     */
    handleMessage(data) {
      pending.prune(now());
      if (data && typeof data === 'object' && data.kind === 'tracklist') return handleTracklist(data);
      if (data && typeof data === 'object' && data.kind === 'seen') return handleSeen(data);
      const msg = validateCaptureMessage(data);
      return msg ? evaluate(msg) : { accepted: false, code: null };
    },
    /**
     * قائمة مسارات الفيديو الحالي كما في بيانات المشغّل (AA1): اللغة والنوع والاسم المعروض، وهل يترجم يوتيوب آليًا. null قبل
     * وصولها أو لفيديو آخر. لا تعني أن المسار جُلب: الملتقط في tracks().
     * @returns {import('./message.js').TrackList | null}
     */
    available: () => (listed && listed.videoId === env.currentVideoId() ? structuredClone(listed) : null),
    /**
     * يُستدعى عند تغيّر الفيديو المعروض: يفرّغ ما لا يخصه ويعيد تقييم ما انتظر له. والمعرّف null (المشغّل المصغّر وصفحات بلا
     * فيديو) يحجب مسارات آخر فيديو ولا يمسحها، فتعود بالعودة إليه (Y4-أ).
     */
    setVideo(videoId) {
      sync(videoId);
      if (seen.videoId !== videoId) seen = { videoId, count: 0 };
      for (const { msg, ageMs } of pending.take(videoId, now())) evaluate(msg, ageMs);
      emit();
    },
    /** @returns {TrackInfo[]} المسارات المقبولة للفيديو الحالي بترتيب الالتقاط */
    tracks: () => [...visibleSlots()].map(([key, slot]) => infoOf(key, slot)),
    /**
     * @param {string} key
     * @param {{ mode?: 'normal' | 'long', long?: object }} [opts] long: أرقام الوضع الطويل (LONG_DEFAULTS)
     * @returns {ConvertResult} نسخة مستقلة كل مرة
     */
    convert(key, { mode = 'normal', long } = {}) {
      const parsed = parseTrackKey(key);
      const [rawLang = '', rawKind] = String(key).split('|');
      const failed = (code, lang = parsed?.lang ?? rawLang, kind = parsed?.kind ?? rawKind) => ({
        ok: false, code, key, lang, kind: kind === 'asr' ? 'asr' : 'manual', via: parsed?.via ?? null, mode, cues: [], warnings: [], report: null,
      });
      if (!MODES.includes(mode)) return failed('MD_INVALID');
      const slot = visibleSlots().get(key);
      if (!slot) return failed('EX_NO_TRACK');
      const conv = run(slot, mode, long);
      return {
        ok: conv.ok, code: conv.code, key, lang: slot.entry.lang, kind: slot.entry.trackKind, via: slot.entry.via ?? null, mode,
        cues: conv.ok ? conv.cues.map((c) => ({ ...c })) : [], warnings: conv.warnings.slice(), report: structuredClone(conv.report),
      };
    },
    /**
     * عتبة «قد يكون ناقصًا» من الإعدادات (thresholds.completeness)، يمرّرها المتحكم عند كل تغيّر فيها. غير الصالحة
     * تعود إلى الافتراضية، والتحويلات المخزنة بعتبة أخرى لا تُعاد (العتبة في مفتاحها). لا تُبلِّغ المشتركين.
     * @param {unknown} ratio
     */
    setCompleteness(ratio) {
      completeness = normalizeCompleteness(ratio);
    },
    /** @returns {Rejection | null} آخر رفض يخص الفيديو الحالي (لا فيديو آخر ولا معاينة) */
    lastRejection: () => (lastRejection ? { ...lastRejection } : null),
    /** @param {() => void} fn @returns {() => void} */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /**
     * أعداد ورموز وأحجام فقط، بلا جسم ولا نص ولا رابط (عقد errors §٤): لكل مسار نوع الفشل وحجم الجسم وحالة
     * الثوابت الستة، ولكل رفض حديث رمزه وحجم جسمه.
     */
    diagnostics: () => ({
      currentVideoId: captures.currentVideoId,
      navigations: captures.navigations,
      accepted: captures.accepted().length,
      rejected: captures.rejected().reduce((m, r) => ({ ...m, [r.code]: (m[r.code] ?? 0) + 1 }), {}),
      pending: pending.size,
      pendingChars: pending.chars,
      listed: listed ? { tracks: listed.tracks.length, translatable: listed.translatable } : null,
      listenerFailures,
      // ف7: «طلبات مرئية» للفيديو المعروض (0 = لم يمر طلب ترجمة بالغلافين)، وأكبر عدّ في الصفحة.
      requestsSeen: seen.videoId !== null && seen.videoId === env.currentVideoId() ? seen.count : 0,
      requestsSeenPage: seenPage,
      tracks: [...visibleSlots()].map(([key, slot]) => {
        const info = infoOf(key, slot);
        const conv = run(slot, 'normal');
        return {
          key, lang: info.lang, kind: info.kind, via: info.via, ok: info.ok, code: info.code, warnings: info.warnings, cueCount: info.cueCount,
          bodyLength: slot.entry.bodyLength, format: slot.entry.format, transport: slot.entry.transport,
          completeness: info.completeness, inferredKind: conv.report.inferredKind ?? null,
          invariants: conv.invariants ? conv.invariants.results.map(({ id, key: name, ok }) => ({ id, key: name, ok })) : null,
        };
      }),
      recentRejections: captures.rejected().slice(-MAX_RECENT_REJECTIONS).map((r) => ({
        code: r.code, lang: r.lang, trackKind: r.trackKind, format: r.format, bodyLength: r.bodyLength, hasTlang: r.hasTlang,
      })),
    }),
  };
}
