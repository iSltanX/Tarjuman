// نصوص فشل إرسال البلاغ (جولة النشر T2.1): لكل سبب في جدول الردود نصّه وخطوة ممكنة، لا رسالة عامة واحدة. وما يُنسخ ليُرسل
// يسمّي وجهته: بريد الدعم المعلن في صفحة الدعم والمتاجر (قرار T4 في جولة النشر، store/README.md §٥)، نصًّا لا رابطًا.
// النصوص في فهرس التوطين (settings.report.fail) وتتبع لغة الواجهة؛ ولا يمس هذا الملف جسم البلاغ المرسَل.
import { t } from '../../i18n/index.js';
import { RETRY_AFTER_MAX_S } from './client.js';

/** بريد الدعم (store/README.md §٥، و«تواصل» في صفحة الدعم). */
export const SUPPORT_EMAIL = 'iSultanBy@gmail.com';

const KNOWN = Object.freeze(['permission', 'network', 'timeout', 'invalid', 'too-large', 'unsupported', 'rate-limited', 'server', 'unexpected']);

/** «دقيقة» و«دقيقتين» و«5 دقائق» و«11 دقيقة»، وفوق الساعة بالساعات («ساعتين» و«3 ساعات»؛ تدقيق 7a66f91، U85). بصيغ اللغة الحالية. */
function waitText(seconds) {
  const m = Math.max(1, Math.ceil(Math.min(seconds, RETRY_AFTER_MAX_S) / 60));
  if (m < 60) return t('settings.report.wait.minute', { n: m });
  return t('settings.report.wait.hour', { n: Math.ceil(m / 60) });
}

/** @param {import('./client.js').SendFailure} failure @param {number} [retryAfterSeconds] */
export function failureText(failure, retryAfterSeconds) {
  const key = KNOWN.includes(failure) ? failure : 'unexpected';
  const base = t(`settings.report.fail.${key}`, { email: SUPPORT_EMAIL });
  if (failure !== 'rate-limited' || retryAfterSeconds === undefined) return base;
  return t('settings.report.fail.retryAfter', { base, wait: waitText(retryAfterSeconds) });
}
