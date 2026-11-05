// نصوص فشل إرسال البلاغ (جولة النشر T2.1): لكل سبب في جدول الردود نصّه وخطوة ممكنة، لا رسالة عامة واحدة. وما يُنسخ ليُرسل
// يسمّي وجهته: بريد الدعم المعلن في صفحة الدعم والمتاجر (قرار T4 في جولة النشر، store/README.md §٥)، نصًّا لا رابطًا.
import { RETRY_AFTER_MAX_S } from './client.js';

/** بريد الدعم (store/README.md §٥، و«تواصل» في صفحة الدعم). */
export const SUPPORT_EMAIL = 'iSultanBy@gmail.com';

const TEXT = Object.freeze({
  permission: 'لم يُمنح إذن الاتصال بخادم البلاغات، فلم يُرسل شيء. أعد المحاولة واقبل الإذن حين يطلبه المتصفح، أو انسخ البلاغ.',
  network: 'تعذّر الوصول إلى خادم البلاغات. تحقق من اتصالك ثم أعد المحاولة.',
  timeout: 'لم يردّ خادم البلاغات في الوقت. أعد المحاولة؛ وإن كان قد استلم البلاغ فسيعيد رقمه نفسه.',
  invalid: `رفض خادم البلاغات البلاغ لأن أحد حقوله غير مقبول. انسخه وأرسله إلى بريد الدعم ${SUPPORT_EMAIL}.`,
  'too-large': `البلاغ أكبر مما يقبله خادم البلاغات. انسخه وأرسله إلى بريد الدعم ${SUPPORT_EMAIL}.`,
  unsupported: `لم يقبل خادم البلاغات صيغة البلاغ. انسخه وأرسله إلى بريد الدعم ${SUPPORT_EMAIL}.`,
  'rate-limited': 'أُرسلت بلاغات كثيرة من شبكتك مؤخرًا، فأوقف الخادم الاستقبال مؤقتًا.',
  server: 'لم يستقبل خادم البلاغات البلاغ الآن، والعطل من جهته. أعد المحاولة بعد قليل.',
  unexpected: 'ردّ خادم البلاغات بما لا يُفهم. أعد المحاولة، أو انسخ البلاغ.',
});

const minutes = new Intl.NumberFormat('ar-u-nu-latn');

/** «دقيقة» و«دقيقتين» و«5 دقائق» و«11 دقيقة»، وفوق الساعة بالساعات («ساعتين» و«3 ساعات»؛ تدقيق 7a66f91، U85). */
function waitText(seconds) {
  const m = Math.max(1, Math.ceil(Math.min(seconds, RETRY_AFTER_MAX_S) / 60));
  if (m < 60) return m === 1 ? 'دقيقة' : m === 2 ? 'دقيقتين' : `${minutes.format(m)} ${m <= 10 ? 'دقائق' : 'دقيقة'}`;
  const h = Math.ceil(m / 60);
  return h === 1 ? 'ساعة' : h === 2 ? 'ساعتين' : `${minutes.format(h)} ${h <= 10 ? 'ساعات' : 'ساعة'}`;
}

/** @param {import('./client.js').SendFailure} failure @param {number} [retryAfterSeconds] */
export function failureText(failure, retryAfterSeconds) {
  const base = TEXT[failure] ?? TEXT.unexpected;
  if (failure !== 'rate-limited' || retryAfterSeconds === undefined) return base;
  return `${base} أعد المحاولة بعد ${waitText(retryAfterSeconds)}.`;
}
