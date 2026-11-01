// واجهة ExtractorAdapter (عقد docs/contracts/interfaces.md §٢): نقطة الدخول الوحيدة من سكربت المحتوى
// إلى الاستخراج. تملكها P3 وتحفظ التوقيعات أدناه لأن src/content مجمَّد؛ وما خلفها يتغير كما يشاء.
// ذاكرة المسارات للفيديو الحالي وحده وفي الجلسة فقط: الجسم الخام لا يُخزَّن ولا يُرسَل، ولا رابط ولا رمز.
import { LIMITS } from '../core/model/validate.js';
import { normalizeLongOptions } from '../core/convert/index.js';
import { checkAcceptance, convertCapture } from './capture-adapter.js';
import { createCaptureStore } from './capture-store.js';
import { createPendingBuffer } from './pending.js';
import { validateCaptureMessage } from './message.js';

const MODES = Object.freeze(['normal', 'long']);
const MAX_RUNS_PER_TRACK = 6;
const MAX_RECENT_REJECTIONS = 20;

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
 * }} env
 */
export function createExtractor(env) {
  const now = env.now ?? (() => Date.now());
  const durationMs = env.durationMs ?? (() => null);
  const isLive = env.isLive ?? (() => false);
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
    const id = `${mode}|${dMs ?? ''}|${opts ? JSON.stringify(opts) : ''}`;
    let hit = slot.runs.get(id);
    if (!hit) {
      hit = convertCapture(slot.entry, dMs, { mode, longOptions: opts });
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
    const entry = captures.accept({
      videoId: msg.videoId, lang: msg.lang, trackKind: msg.trackKind, format: msg.format, transport: msg.transport,
      bodyLength: msg.bodyLength, body: msg.body, acceptedFor: current,
      meta: { hasPot: msg.hasPot, capsAsr: msg.capsAsr, kindParam: msg.kindParam },
    });
    const key = `${msg.lang}|${msg.trackKind}`;
    // الالتقاط الأحدث للمفتاح نفسه يحل محل السابق (إيقاف CC وتشغيلها)، ويصير الأحدث إدراجًا.
    slots.delete(key);
    const slot = { entry, runs: new Map() };
    slots.set(key, slot);
    while (slots.size > LIMITS.maxEnglishTracks) slots.delete(slots.keys().next().value);
    const conv = run(slot, 'normal');
    lastRejection = null;
    emit();
    return { accepted: true, code: conv.code };
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
