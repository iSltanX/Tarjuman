// نصوص أدوات الشريط (figma-design-brief §٥.٢ و§٦ و§١٦.١) ودوالها النقية: التلميحات بالخطوة الحالية، ومعنى
// الإزاحة بالكلمات، وملخص المقارنة في سطر، وقراءة الثواني من حقل. أرقام لاتينية، والإزاحة بعلامتها (formatOffset).
import { COUNT_FORMS, formatCount, formatOffset, formatTimecode } from '../../ui/format.js';

export const LABELS = Object.freeze({
  group: 'أدوات ترجمان',
  download: 'تحميل الترجمة الإنجليزية (SRT)',
  upload: 'رفع الترجمة العربية (SRT)',
  downloadTitle: 'تحميل الترجمة',
  displayTitle: 'الترجمة العربية',
  timingTitle: 'توقيت الترجمة',
  confirmTitle: 'استبدال الترجمة؟',
  whyLink: 'لماذا؟',
  why: 'ترجمان يقرأ الترجمة التي يجلبها المشغّل لك، ولا يرسل أي طلب من عنده.',
  trackChoice: 'المسار',
  modeNormal: 'عادي',
  modeLong: 'مقاطع أطول',
  modeNormalNote: 'مقاطع كما في يوتيوب، للتزامن الأدق.',
  modeLongNote: 'جمل أطول ليفهم النموذج السياق، بالترقيم والتوقيت نفسيهما.',
  downloadSrt: 'تنزيل SRT',
  checking: 'جارٍ التحقق من النص والتوقيت…',
  copyInstructions: 'نسخ تعليمات الترجمة',
  copyNeedsTrack: 'يتاح النسخ بعد التقاط المسار الإنجليزي.',
  fallback: 'خيارات احتياطية',
  split: 'تقسيم الملف إلى أجزاء (للملفات الطويلة جدًا)',
  splitSize: 'مقاطع لكل جزء',
  modeAr: 'العربية وحدها',
  modeDual: 'العربية فوق الإنجليزية',
  modeOff: 'إخفاء الترجمة',
  replace: 'استبدال الملف…',
  replaceConfirm: 'استبدال',
  cancel: 'إلغاء',
  offsetResetNote: 'ستُصفَّر إزاحة العرض لأن الملف الجديد يحمل توقيته.',
  editorHint: 'التفاصيل الكاملة في المحرّر: افتحه من أيقونة ترجمان أعلى المتصفح.',
  importing: 'جارٍ فحص الملف ومقارنته…',
  offsetField: 'الإزاحة بالثواني',
  seconds: 'ث',
  stepField: 'خطوة الأزرار',
  stepCustom: 'مخصص',
  stepCustomField: 'الخطوة بالثواني',
  reset: 'إعادة الضبط إلى 0',
  signLegend: '+ تأخير: تظهر لاحقًا · − تقديم: تظهر أبكر',
  perVideo: 'الإزاحة لهذا الفيديو فقط وتُحفظ.',
  close: 'إغلاق',
});

/**
 * الخطوة بالثواني بلا أصفار زائدة: 500 ← «0.5»، و1000 ← «1»، و1500 ← «1.5».
 * @param {number} ms
 */
export const stepSeconds = (ms) => String(Math.round(ms / 100) / 10);

/** @param {number} stepMs */
export const minusTip = (stepMs) => `تقديم الترجمة ${stepSeconds(stepMs)} ث (تظهر أبكر)`;
/** @param {number} stepMs */
export const plusTip = (stepMs) => `تأخير الترجمة ${stepSeconds(stepMs)} ث (تظهر لاحقًا)`;

/** @param {number} ms */
const sign = (ms) => (Math.round(ms / 100) === 0 ? 0 : Math.sign(ms));

/** @param {number} ms «الإزاحة: +0.5 ث (تظهر الترجمة لاحقًا). اضغط للخيارات» */
export function badgeTip(ms) {
  const s = sign(ms);
  const meaning = s > 0 ? ' (تظهر الترجمة لاحقًا)' : s < 0 ? ' (تظهر الترجمة أبكر)' : '';
  return `الإزاحة: ${formatOffset(ms)} ث${meaning}. اضغط للخيارات`;
}

/** @param {number} ms التلميح العابر بعد ± لثانية: «+1.0 ث · تظهر لاحقًا» */
export function nudgeFlash(ms) {
  const s = sign(ms);
  return `${formatOffset(ms)} ث · ${s > 0 ? 'تظهر لاحقًا' : s < 0 ? 'تظهر أبكر' : 'في توقيتها المحفوظ'}`;
}

/** @param {number} absMs مقدار موجب: «بنصف ثانية»، «بثانية واحدة»، «بثانيتين»، وإلا «بـ1.5 ث». */
function amountWords(absMs) {
  const tenths = Math.round(absMs / 100);
  if (tenths === 5) return 'بنصف ثانية';
  if (tenths === 10) return 'بثانية واحدة';
  if (tenths === 20) return 'بثانيتين';
  return `بـ${(tenths / 10).toFixed(1)} ث`;
}

/** @param {number} ms معنى الإزاحة بالكلمات تحت قيمتها الكبيرة في قائمة التوقيت. */
export function offsetMeaning(ms) {
  const s = sign(ms);
  if (s === 0) return 'الترجمة في توقيتها المحفوظ';
  return `تظهر الترجمة ${s > 0 ? 'لاحقًا' : 'أبكر'} ${amountWords(Math.abs(ms))}`;
}

// العدد مع الصفة بالمطابقة: «مقطع واحد ناقص»، «مقطعان ناقصان»، «3 مقاطع ناقصة»، «11 مقطعًا ناقصًا».
const ADJ = Object.freeze({
  missing: Object.freeze({ one: 'ناقص', two: 'ناقصان', few: 'ناقصة', many: 'ناقصًا', single: 'ناقص' }),
  extra: Object.freeze({ one: 'زائد', two: 'زائدان', few: 'زائدة', many: 'زائدًا', single: 'زائد' }),
});

/** @param {number} n @param {{ one: string, two: string, few: string, many: string, single: string }} adj */
function countWith(n, adj) {
  const mod = n % 100;
  const form = n === 1 ? adj.one : n === 2 ? adj.two : mod >= 3 && mod <= 10 ? adj.few : mod >= 11 ? adj.many : adj.single;
  return `${formatCount(n, COUNT_FORMS.cue)} ${form}`;
}

const LIST_MAX = 6;
/** @param {number[]} ns «57، 58، 201» وبعد ستة أرقام «…» */
const listOf = (ns) => `${ns.slice(0, LIST_MAX).join('، ')}${ns.length > LIST_MAX ? '، …' : ''}`;

/** @param {number} n «توقيت مختلف في 12 مقطعًا» (المجرور: «في مقطعين») */
const driftText = (n) => `توقيت مختلف في ${n === 2 ? 'مقطعين' : formatCount(n, COUNT_FORMS.cue)}`;

/**
 * ملخص المقارنة في سطر (§٦.٢): «مطابق للأصل ✓» أو «3 مقاطع ناقصة: 57، 58، 201» أو «توقيت مختلف في 12 مقطعًا»
 * أو «لا بصمة للمقارنة…». tone=warn حين تكشف المقارنة نقصًا أو زيادة أو انحرافًا أو مقاطع بلا ترجمة.
 * @param {import('../../core/model/tracks.js').ComparisonReport | null | undefined} cmp
 * @returns {{ tone: 'ok' | 'warn' | 'info', text: string }}
 */
export function comparisonSummary(cmp) {
  if (!cmp || !cmp.fingerprintId) return { tone: 'info', text: 'لا بصمة للمقارنة؛ عُرض الملف كما هو.' };
  const parts = [];
  if (cmp.missing.length) parts.push(`${countWith(cmp.missing.length, ADJ.missing)}: ${listOf(cmp.missing)}`);
  if (cmp.extra.length) parts.push(`${countWith(cmp.extra.length, ADJ.extra)}: ${listOf(cmp.extra)}`);
  if (cmp.drift.length) parts.push(driftText(cmp.drift.length));
  const untranslated = [...new Set([...cmp.empty, ...cmp.noArabic])].length;
  if (untranslated) parts.push(`${formatCount(untranslated, COUNT_FORMS.cue)} بلا ترجمة عربية`);
  if (!parts.length && cmp.numbering === 'different') parts.push('ترقيم المقاطع مختلف عن الأصل');
  if (!parts.length) return { tone: cmp.matched ? 'ok' : 'warn', text: cmp.matched ? 'مطابق للأصل ✓' : 'يختلف عن الأصل' };
  return { tone: 'warn', text: parts.join(' · ') };
}

/** @param {number} n */
export const cueCount = (n) => formatCount(n, COUNT_FORMS.cue);

/** زمن مختصر للرسائل: «12:40» أو «1:02:05» (لا ملي ثوانٍ). @param {number} ms */
export function shortTime(ms) {
  const [h, m, s] = formatTimecode(ms).split(',')[0].split(':');
  return Number(h) ? `${Number(h)}:${m}:${s}` : `${Number(m)}:${s}`;
}

const DIGITS = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9', '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' };

/**
 * ثوانٍ من نص الحقل: «1.5» و«-2.3» و«+4» و«−0.5» (ناقص الطباعة) و«٢٫٥» (أرقام وفاصلة عربية). غير الصالح null.
 * @param {string} raw
 * @returns {number | null}
 */
export function parseSeconds(raw) {
  const s = String(raw ?? '')
    .replace(/[٠-٩۰-۹]/g, (d) => DIGITS[d])
    .replace(/[٫,]/g, '.')
    .replace(/[−–]/g, '-')
    .replace(/[\s\u200e\u200f\u061c]/g, '');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s)) return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}
