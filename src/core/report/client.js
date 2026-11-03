// إرسال البلاغ (جولة النشر T2.1، عقد iSltanX/app-reports v1): الاستثناء الوحيد من «لا شبكة» في الإضافة، في هذا الملف وحده
// (الفحص الثابت والتدقيق يسمّيانه بسطره ومضيفه). طلب واحد إلى خادم القناة بعد ضغطة المستخدم على «أرسل البلاغ» في صفحة
// الإعدادات، وبإذن مضيفه الاختياري يُطلب في الضغطة نفسها؛ وبلا إذن لا يُرسل شيء. ومفتاح Idempotency-Key معرّف عشوائي واحد
// لكل بلاغ يُعاد في محاولاته، فلا يُفتح بلاغ مكرر إن ضاع الرد؛ ولا يعرّف المستخدم ولا جهازه. ولا ملفات ارتباط ولا ترويسة غير
// Content-Type وIdempotency-Key، ولا إعادة تلقائية. العامل الخلفي للحفظ وحده، وسكربتا المحتوى وعالم الصفحة بلا شبكة.

export const REPORTS_ORIGIN = 'https://app-reports.isultantf.workers.dev';
export const REPORTS_ENDPOINT = `${REPORTS_ORIGIN}/v1/reports`;
export const REPORTS_HOST_PATTERN = `${REPORTS_ORIGIN}/*`;
export const SEND_TIMEOUT_MS = 30_000;

/**
 * @typedef {'permission' | 'network' | 'timeout' | 'invalid' | 'too-large' | 'unsupported' | 'rate-limited' | 'server' | 'unexpected'} SendFailure
 * @typedef {{ ok: true, id: number, replayed: boolean } | { ok: false, failure: SendFailure, status: number | null, retryAfterSeconds?: number }} SendOutcome
 */

/** هل تنفع إعادة المحاولة بالبلاغ نفسه؟ (جدول الردود في العقد: 400 و413 و415 بلا إعادة). @param {SendFailure} failure */
export const retryable = (failure) => !['invalid', 'too-large', 'unsupported'].includes(failure);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const isIdempotencyKey = (value) => typeof value === 'string' && UUID.test(value);

/** Retry-After بالثواني أو بتاريخ HTTP. @param {string | null} header */
export function parseRetryAfter(header, now = Date.now()) {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.max(0, Math.ceil((at - now) / 1000)) : undefined;
}

/** يفسّر الرد بجدول العقد. @param {Response} response @returns {Promise<SendOutcome>} */
export async function classify(response) {
  const { status } = response;
  if (status === 201 || status === 200) {
    const body = await response.json().catch(() => null);
    const id = body?.id;
    if (Number.isInteger(id) && id > 0) return { ok: true, id, replayed: status === 200 };
    return { ok: false, failure: 'unexpected', status };
  }
  if (status === 400) return { ok: false, failure: 'invalid', status };
  if (status === 413) return { ok: false, failure: 'too-large', status };
  if (status === 415) return { ok: false, failure: 'unsupported', status };
  if (status === 429) {
    const after = parseRetryAfter(response.headers.get('retry-after'));
    return { ok: false, failure: 'rate-limited', status, ...(after === undefined ? {} : { retryAfterSeconds: after }) };
  }
  if (status >= 500) return { ok: false, failure: 'server', status };
  return { ok: false, failure: 'unexpected', status };
}

/**
 * ما يلزم الإرسال من إذن: مضيف القناة وحده، وفي Firefox معه موافقة «البيانات التقنية والتفاعل» الاختيارية (اسم المتصفح
 * وإصداره والنظام في البلاغ).
 * @param {'chromium' | 'firefox'} target
 */
export const reportPermissions = (target) => (target === 'firefox'
  ? { origins: [REPORTS_HOST_PATTERN], data_collection: ['technicalAndInteraction'] }
  : { origins: [REPORTS_HOST_PATTERN] });

/**
 * طلب الإذن: يُستدعى أول ما في ضغطة «أرسل البلاغ» قبل أي انتظار، فالمتصفح لا يطلبه خارج فعل المستخدم. ومنحه سابقًا يعيد true بلا سؤال.
 * @param {{ permissions: { request: (p: object) => Promise<boolean> } }} api @param {'chromium' | 'firefox'} target
 * @returns {Promise<boolean>}
 */
export function requestReportPermission(api, target) {
  // استدعاء متزامن داخل الضغطة نفسها، لا بعد وعد (Firefox يشترط أن يكون الطلب أثناء معالجة فعل المستخدم).
  try {
    return Promise.resolve(api.permissions.request(reportPermissions(target))).then((granted) => granted === true, () => false);
  } catch {
    return Promise.resolve(false);
  }
}

/** إذن مضيف القناة ممنوح الآن؟ يُقرأ لحظة الطلب. */
export const hostGranted = (api) => Promise.resolve().then(() => api.permissions.contains({ origins: [REPORTS_HOST_PATTERN] })).catch(() => false);

/** الطلب الوحيد للبلاغ: fetch صفحة الإعدادات نفسها. */
const pageFetch = (url, init) => globalThis.fetch(url, init);

/**
 * يرسل البلاغ مرة واحدة. request وgranted للاختبار بخادم وهمي.
 * @param {object} payload @param {string} key
 * @param {{ granted: () => Promise<boolean>, request?: (url: string, init: RequestInit) => Promise<Response>, timeoutMs?: number }} deps
 * @returns {Promise<SendOutcome>}
 */
export async function sendReport(payload, key, { granted, request = pageFetch, timeoutMs = SEND_TIMEOUT_MS }) {
  if (!isIdempotencyKey(key)) return { ok: false, failure: 'unexpected', status: null };
  if (!(await Promise.resolve().then(granted).catch(() => false))) return { ok: false, failure: 'permission', status: null };
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await request(REPORTS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify(payload),
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
    return await classify(response);
  } catch {
    return { ok: false, failure: timedOut ? 'timeout' : 'network', status: null };
  } finally {
    clearTimeout(timer);
  }
}
