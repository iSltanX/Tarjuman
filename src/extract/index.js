// واجهة ExtractorAdapter (عقد docs/contracts/interfaces.md §٢): نقطة الدخول الوحيدة من سكربت المحتوى
// إلى الاستخراج. تملكها P3 وتحفظ التوقيعات أدناه لأن src/content مجمَّد؛ وما خلفها يتغير كما يشاء.
// ذاكرة المسارات للفيديو الحالي وحده وفي الجلسة فقط: الجسم الخام لا يُخزَّن ولا يُرسَل، ولا رابط ولا رمز.
import { LIMITS } from '../core/model/validate.js';
import { COMPLETENESS_RATIO, normalizeCompleteness, normalizeLongOptions } from '../core/convert/index.js';
import { checkAcceptance, convertCapture } from './capture-adapter.js';
import { createCaptureStore } from './capture-store.js';
import { createPendingBuffer } from './pending.js';
import { MAX_BODY_CHARS, validateCaptureMessage } from './message.js';

const MODES = Object.freeze(['normal', 'long']);
const MAX_RUNS_PER_TRACK = 6;
const MAX_RECENT_REJECTIONS = 20;
/**
 * حد إجمالي لمحارف أجسام المسارات المحتفظ بها للفيديو الحالي: ضعف حد الرسالة الواحدة، فيبقى أكبر مسارين ممكنين، والأحدث
 * يبقى دائمًا وإن تجاوزه وحده (تدقيق 7a66f91، U33). الأجسام الحقيقية نحو مليون محرف لخمسين دقيقة ASR.
 */
export const MAX_CAPTURED_CHARS = 2 * MAX_BODY_CHARS;

/**
 * @typedef {{
 *   key: string, lang: string, kind: 'manual' | 'asr', capturedAt: string,
 *   ok: boolean, code: string | null, warnings: string[], cueCount: number,
 *   completeness: number | null, lastEndMs: number | null
 * }} TrackInfo
 * @typedef {{
 *   ok: boolean, code: string | null, key: string, lang: string, kind: 'manual' | 'asr', mode: 'normal' | 'long',
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
 * }} env maxCapturedChars: حد المحارف الإجمالي (MAX_CAPTURED_CHARS افتراضيًا؛ الاختبار يصغّره)
 */
export function createExtractor(env) {
  const now = env.now ?? (() => Date.now());
  const durationMs = env.durationMs ?? (() => null);
  const isLive = env.isLive ?? (() => false);
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
  const listeners = new Set();
  let listenerFailures = 0;
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

  function sync(current) {
    if (!captures.setCurrentVideo(current)) return;
    slots.clear();
    lastRejection = null;
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
      key, lang: slot.entry.lang, kind: slot.entry.trackKind, capturedAt: new Date(slot.entry.at).toISOString(),
      ok: conv.ok, code: conv.code, warnings: conv.warnings.slice(), cueCount: conv.ok ? conv.cues.length : 0,
      completeness: conv.report.completeness ?? null, lastEndMs: conv.report.lastEndMs ?? null,
    };
  }

  /**
   * @param {import('./message.js').CaptureMessage} msg بعد validateCaptureMessage
   * @param {number} [pendingAgeMs]
   */
  function evaluate(msg, pendingAgeMs) {
    const current = env.currentVideoId();
    sync(current);
    const decision = checkAcceptance(msg, { currentVideoId: current, isLive: isLive() });
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
    const key = `${msg.lang}|${msg.trackKind}`;
    // يُحوَّل قبل أن يحل محل شيء: التقاط لا يُحوَّل (بنية معيبة، أو بلا أحداث نصية) لا يحل محل التقاط سليم للمفتاح
    // نفسه، بل يُسجَّل رفضًا في التشخيص ويبقى السليم (تدقيق 7a66f91، U32). وبلا سابق سليم يبقى خانةً ليرى المستخدم رمزه.
    // وفشل الحدود وحده يتبع المدة اللحظية (تُعاد قراءتها عند كل طلب)، فلا يُبقي السابق: الأحدث يحل محله كما كان.
    const probe = { entry: { body: msg.body, trackKind: msg.trackKind }, runs: new Map() };
    const conv = run(probe, 'normal');
    const prev = slots.get(key);
    if (!conv.ok && conv.code !== 'EX_BEYOND_DURATION' && prev && run(prev, 'normal').ok) {
      captures.reject({
        code: conv.code, detail: 'لم يُحوَّل، والالتقاط السليم السابق باقٍ', videoId: msg.videoId, currentVideoId: current, lang: msg.lang,
        trackKind: msg.trackKind, hasTlang: msg.hasTlang, format: msg.format, bodyLength: msg.bodyLength,
      });
      return { accepted: false, code: conv.code };
    }
    const entry = captures.accept({
      videoId: msg.videoId, lang: msg.lang, trackKind: msg.trackKind, format: msg.format, transport: msg.transport,
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

  return {
    /**
     * بيانات MAIN → ISOLATED كما مرّرها الجسر (غير موثوقة): تُتحقق بنيتها هنا ثم تُقيَّم بقواعد القبول.
     * @param {unknown} data
     * @returns {{ accepted: boolean, code: string | null }}
     */
    handleMessage(data) {
      const msg = validateCaptureMessage(data);
      return msg ? evaluate(msg) : { accepted: false, code: null };
    },
    /** يُستدعى عند تغيّر الفيديو المعروض: يفرّغ ما لا يخصه ويعيد تقييم ما انتظر له. */
    setVideo(videoId) {
      sync(videoId);
      for (const { msg, ageMs } of pending.take(videoId, now())) evaluate(msg, ageMs);
      emit();
    },
    /** @returns {TrackInfo[]} المسارات المقبولة للفيديو الحالي بترتيب الالتقاط */
    tracks: () => [...slots].map(([key, slot]) => infoOf(key, slot)),
    /**
     * @param {string} key
     * @param {{ mode?: 'normal' | 'long', long?: object }} [opts] long: أرقام الوضع الطويل (LONG_DEFAULTS)
     * @returns {ConvertResult} نسخة مستقلة كل مرة
     */
    convert(key, { mode = 'normal', long } = {}) {
      const [rawLang = '', rawKind] = String(key).split('|');
      const failed = (code, lang = rawLang, kind = rawKind) => ({
        ok: false, code, key, lang, kind: kind === 'asr' ? 'asr' : 'manual', mode, cues: [], warnings: [], report: null,
      });
      if (!MODES.includes(mode)) return failed('MD_INVALID');
      const slot = slots.get(key);
      if (!slot) return failed('EX_NO_TRACK');
      const conv = run(slot, mode, long);
      return {
        ok: conv.ok, code: conv.code, key, lang: slot.entry.lang, kind: slot.entry.trackKind, mode,
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
      listenerFailures,
      tracks: [...slots].map(([key, slot]) => {
        const info = infoOf(key, slot);
        const conv = run(slot, 'normal');
        return {
          key, lang: info.lang, kind: info.kind, ok: info.ok, code: info.code, warnings: info.warnings, cueCount: info.cueCount,
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
