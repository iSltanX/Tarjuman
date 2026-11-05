// ناقل طلبات الكتابة إلى الكاتب الواحد (عقد storage §١٢ وmessages §٨؛ تدقيق 7a66f91، C2). في صفحات الإضافة وسكربت
// المحتوى: رسالة tj:store إلى العامل الخلفي، تعيد إرسال الطلب نفسه بمعرّفه بعد خطأ قناة (عامل أُعيد تشغيله أو لم يبدأ بعد)،
// والكاتب يعرف المكرر فلا يطبّقه مرتين. وفي العامل نفسه وفي الاختبارات: استدعاء مباشر للكاتب، بنسخ JSON كما تنسخ القناة.
import { isStoreReply, MESSAGE_VERSION } from '../model/messages.js';

/** فواصل إعادة الإرسال بعد خطأ قناة (م.ث)، ثم ST_WRITE_FAILED. */
export const STORE_RETRY_DELAYS = Object.freeze([150, 500, 1500]);
/** مهلة الرد قبل إعادة الإرسال: الطلب الجاري ينتظره المكرر في الكاتب، فلا يُكتب مرتين. */
export const STORE_REPLY_TIMEOUT_MS = 60_000;

const unavailable = (detail) => ({ v: MESSAGE_VERSION, ok: false, code: 'ST_WRITE_FAILED', detail });
const jsonCopy = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/** حد القناة نفسه (رسالة أكبر من حد المتصفح): لا تفيد الإعادة. */
const tooLarge = (err) => /message length|exceed|too large|maximum/i.test(String(err && err.message));

/**
 * @typedef {{ send: (req: object) => Promise<{ v: 1, ok: boolean, value?: unknown, code?: string, detail?: string | null }> }} StoreTransport
 */

/**
 * الكاتب في السياق نفسه (العامل الخلفي، والاختبارات).
 * @param {{ handle: (req: unknown) => Promise<object> }} writer
 * @returns {StoreTransport}
 */
export function localTransport(writer) {
  return { send: async (req) => jsonCopy(await writer.handle(jsonCopy(req))) };
}

/**
 * رسالة إلى العامل الخلفي.
 * @param {{ sendMessage: (msg: object) => Promise<unknown> | unknown }} runtime
 * @param {{ timeoutMs?: number, delays?: readonly number[], sleep?: (ms: number) => Promise<void> }} [opts]
 * @returns {StoreTransport}
 */
export function messageTransport(runtime, { timeoutMs = STORE_REPLY_TIMEOUT_MS, delays = STORE_RETRY_DELAYS, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const once = (req) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    Promise.resolve()
      .then(() => runtime.sendMessage(req))
      .then((r) => { clearTimeout(timer); resolve(r); }, (err) => { clearTimeout(timer); reject(err); });
  });
  return {
    async send(req) {
      for (let attempt = 0; ; attempt++) {
        let reply;
        try {
          reply = await once(req);
        } catch (err) {
          if (tooLarge(err)) return unavailable('أكبر من حد القناة');
          reply = undefined;
        }
        if (isStoreReply(reply)) return reply;
        if (attempt >= delays.length) return unavailable('العامل الخلفي لا يستجيب');
        await sleep(delays[attempt]);
      }
    },
  };
}
