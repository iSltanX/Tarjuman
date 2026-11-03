// نصوص لوحة النص المتزامن ودوالها النقية (docs/identity-redesign.md §٤، ولوحات التصميم WatchPanel وPanelStates وWatchNarrow).
// أرقام لاتينية، والإزاحة بعلامتها (formatOffset)، والعدّ بالعربية (formatCount). لا شيء هنا يعرف DOM.
import { COUNT_FORMS, formatCount, formatOffset, offsetInline } from '../../ui/format.js';

export const LABELS = Object.freeze({
  title: 'النص المتزامن',
  panel: 'النص المتزامن — ترجمان',
  openEntry: 'فتح النص المتزامن',
  options: 'خيارات اللوحة',
  close: 'إغلاق اللوحة',
  closeHint: 'إغلاق اللوحة (يبقى زرها)',
  hideEntry: 'إخفاء زر اللوحة',
  hideHint: 'من كل صفحات الفيديو. تعيده من نافذة ترجمان أو الإعدادات.',
  toastHidden: 'أُخفي زر النص المتزامن',
  undo: 'تراجع',
  synced: 'متزامن',
  segGroup: 'نص اللوحة',
  arOnly: 'العربية وحدها',
  arOnlyShort: 'العربية',
  dualShort: 'مزدوج',
  noOriginal: 'لا مسار أصلي لهذا الفيديو بعد، فلا نص أصلي يُعرض.',
  follow: 'متابعة التشغيل',
  followShort: 'متابعة',
  resume: 'العودة إلى',
  listLabel: 'مقاطع الترجمة العربية',
  seekTo: 'الانتقال إلى',
  timing: 'توقيت الترجمة',
  shared: 'مشترك مع أزرار المشغّل',
  reset: 'تصفير',
  resetHint: 'إعادة الإزاحة إلى 0',
  earlier: 'تقديم',
  later: 'تأخير',
  step: 'الخطوة',
  stepGroup: 'خطوة الأزرار',
  stepCustom: 'مخصص',
  stepCustomField: 'الخطوة بالثواني',
  seconds: 'ث',
  loading: 'جارٍ قراءة الترجمة',
  emptyTitle: 'لا ترجمة عربية لهذا الفيديو بعد',
  stepDownload: 'نزّلها من زر التنزيل وترجمها بنموذجك',
  stepUpload: 'ارفع العربية من زر الترجمة في الشريط',
  stepCapture: 'شغّل ترجمة يوتيوب (CC) ليلتقط ترجمان الأصل',
  emptyNote: 'يظهر النص هنا متزامنًا فور الرفع.',
  errorTitle: 'تعذّرت قراءة الترجمة المحفوظة',
  inlineErrorTitle: 'لم يُحفظ آخر تغيير',
  retry: 'إعادة المحاولة',
});

/**
 * اسم اللغة بالعربية من رمز المسار الأصلي الفعلي (لا اسم مكتوب بالشيفرة): اللغة الأساسية من الرمز (en-GB ← en) بأسماء
 * Intl.DisplayNames، ثم الرمز كاملًا، ثم الرمز نفسه إن لم يعرفه المتصفح. لا يرمي أبدًا.
 * @param {string | null | undefined} code
 * @param {typeof Intl.DisplayNames} [DisplayNames] للاختبار
 */
export function languageName(code, DisplayNames = globalThis.Intl?.DisplayNames) {
  const raw = String(code ?? '').trim();
  if (!raw || typeof DisplayNames !== 'function') return raw;
  let names;
  try {
    names = new DisplayNames(['ar'], { type: 'language' });
  } catch {
    return raw;
  }
  for (const c of [raw.split(/[-_]/)[0], raw]) {
    try {
      const n = names.of(c);
      if (n && n.toLowerCase() !== c.toLowerCase()) return n;
    } catch {
      // رمز غير صالح عند هذا المتصفح: التالي
    }
  }
  return raw;
}

/**
 * زمن الصف: «04:05» أو «1:04:05» (دقائق بخانتين دائمًا؛ لا ملي ثوانٍ). الزمن السالب (إزاحة تسبق البداية) يُقصر على صفر.
 * @param {number} ms
 */
export function clockLabel(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

/** @param {string} text مقطع بأسطر متعددة ← سطر واحد متصل للوحة النص. */
export const flatText = (text) => String(text ?? '').replace(/\s*\n\s*/g, ' ').trim();

const sign = (ms) => (Math.round(ms / 100) === 0 ? 0 : Math.sign(ms));

/** @param {number} ms معنى الإزاحة المختصر تحت قيمتها: «تظهر لاحقًا» أو «تظهر أبكر» أو «في توقيتها المحفوظ». */
export function offsetMeaningShort(ms) {
  const s = sign(ms);
  return s > 0 ? 'تظهر لاحقًا' : s < 0 ? 'تظهر أبكر' : 'في توقيتها المحفوظ';
}

/** @param {number} ms «+0.5» أو «−1.0» أو «0.0». */
export const offsetValue = formatOffset;

/** @param {number} ms إزاحة بعلامتها داخل جملة (معزولة LTR): للتلميح واسم الوصول. */
export const offsetPhrase = (ms) => `${offsetInline(ms)} ${LABELS.seconds}`;

/** @param {number} stepMs الخطوة بالثواني بلا أصفار زائدة: 500 ← «0.5»، 1500 ← «1.5». */
export const stepLabel = (stepMs) => String(Math.round(stepMs / 100) / 10);

/** @param {number} stepMs */
export const earlierTip = (stepMs) => `تقديم الترجمة ${stepLabel(stepMs)} ${LABELS.seconds} (تظهر أبكر)`;
/** @param {number} stepMs */
export const laterTip = (stepMs) => `تأخير الترجمة ${stepLabel(stepMs)} ${LABELS.seconds} (تظهر لاحقًا)`;

/** @param {string} langName «مع الإنجليزية». */
export const withOriginal = (langName) => `مع ${langName}`;

/**
 * أجزاء سطر الحالة: «متزامن · الترجمة 2 «مراجعة» · 412 مقطعًا». الاسم يُحذف إن لم يُسمَّ، والرقم إن لم تُعرف الخانة.
 * @param {{ slot: number | null, name: string | null, count: number }} s
 * @returns {string[]}
 */
export function statusParts({ slot, name, count }) {
  const parts = [LABELS.synced];
  if (slot) parts.push(`الترجمة ${slot}${name ? ` «${name}»` : ''}`);
  parts.push(formatCount(count, COUNT_FORMS.cue));
  return parts;
}
