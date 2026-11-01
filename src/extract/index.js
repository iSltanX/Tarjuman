// واجهة ExtractorAdapter (عقد docs/contracts/interfaces.md §٢): نقطة الدخول الوحيدة من سكربت المحتوى
// إلى الاستخراج. أنشأتها P2 رقيقة فوق وحدات P1 دون تعديلها (طلب مسجّل في ملف P2)، وتملكها P3 بعد ذلك:
// تغيّر ما خلفها كما تشاء، وتحفظ التوقيعات أدناه لأن src/content مجمَّد.
// لا تخزين دائم هنا ولا روابط: الجسم الخام يبقى في ذاكرة الجلسة للفيديو الحالي فقط.
import { checkAcceptance, convertCapture } from './capture-adapter.js';
import { createCaptureStore } from './capture-store.js';
import { createPendingBuffer } from './pending.js';
import { validateCaptureMessage } from './message.js';

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
  const captures = createCaptureStore();
  const pending = createPendingBuffer();
  /** @type {Map<string, { info: TrackInfo, result: ConvertResult }>} المفتاح lang|kind للفيديو الحالي */
  const converted = new Map();
  /** @type {Rejection | null} */
  let lastRejection = null;
  const listeners = new Set();
  const emit = () => {
    for (const fn of listeners) fn();
  };

  function sync(current) {
    if (!captures.setCurrentVideo(current)) return;
    converted.clear();
    lastRejection = null;
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
    const dMs = durationMs();
    const entry = captures.accept({
      videoId: msg.videoId, lang: msg.lang, trackKind: msg.trackKind, format: msg.format, transport: msg.transport,
      bodyLength: msg.bodyLength, body: msg.body, acceptedFor: current,
      meta: { hasPot: msg.hasPot, capsAsr: msg.capsAsr, kindParam: msg.kindParam },
    });
    const conv = convertCapture(entry, dMs);
    const key = `${msg.lang}|${msg.trackKind}`;
    const result = {
      ok: conv.ok, code: conv.code, key, lang: msg.lang, kind: msg.trackKind, mode: 'normal',
      cues: conv.ok ? conv.cues : [], warnings: conv.warnings, report: conv.report,
    };
    converted.set(key, {
      result,
      info: {
        key, lang: msg.lang, kind: msg.trackKind, capturedAt: new Date(entry.at).toISOString(),
        ok: conv.ok, code: conv.code, warnings: conv.warnings.slice(), cueCount: result.cues.length,
        completeness: conv.report.completeness ?? null, lastEndMs: conv.report.lastEndMs ?? null,
      },
    });
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
    /** @returns {TrackInfo[]} المسارات المقبولة للفيديو الحالي */
    tracks: () => [...converted.values()].map((x) => ({ ...x.info, warnings: x.info.warnings.slice() })),
    /**
     * @param {string} key
     * @param {{ mode?: 'normal' | 'long' }} [opts]
     * @returns {ConvertResult}
     */
    convert(key, { mode = 'normal' } = {}) {
      const hit = converted.get(key);
      const [lang = '', kind = 'manual'] = String(key).split('|');
      if (!hit) return { ok: false, code: 'EX_NO_TRACK', key, lang, kind, mode, cues: [], warnings: [], report: null };
      if (mode !== 'normal') return { ...hit.result, ok: false, code: 'TJ_NOT_IMPLEMENTED', mode, cues: [] };
      return { ...hit.result, cues: hit.result.cues.map((c) => ({ ...c })), warnings: hit.result.warnings.slice() };
    },
    /** @returns {Rejection | null} آخر رفض يخص الفيديو الحالي (لا فيديو آخر ولا معاينة) */
    lastRejection: () => (lastRejection ? { ...lastRejection } : null),
    /** @param {() => void} fn @returns {() => void} */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** أعداد ورموز فقط، بلا جسم ولا نص ولا رابط. */
    diagnostics: () => ({
      currentVideoId: captures.currentVideoId,
      navigations: captures.navigations,
      accepted: captures.accepted().length,
      rejected: captures.rejected().reduce((m, r) => ({ ...m, [r.code]: (m[r.code] ?? 0) + 1 }), {}),
      pending: pending.size,
    }),
  };
}
