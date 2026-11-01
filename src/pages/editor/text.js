// نصوص المحرّر العربية (figma-design-brief.md §١١ و§١٦): النطاق قبل الفعل وبعده، والعدّ بالعربية بمطابقة
// الصفة للمعدود، والإزاحة بعلامتها، وتقرير المقارنة سطورًا. دوال نقية بلا DOM.
import { COUNT_FORMS, formatCount, formatOffset } from '../../ui/format.js';

const MAX_LIST = 8;

// صيغ العدّ بصيغة formatCount. «error» للعدّ المستقل في رأس اللوحة، و«errorToFix» مفعولًا به لـ«صحّح».
export const COUNT = Object.freeze({
  error: Object.freeze({ one: 'خطأ واحد', two: 'خطآن', few: 'أخطاء', many: 'خطأً', single: 'خطأ' }),
  errorToFix: Object.freeze({ one: 'خطأ التوقيت', two: 'خطأي التوقيت', few: 'أخطاء توقيت', many: 'خطأ توقيت', single: 'خطأ توقيت' }),
  warning: Object.freeze({ one: 'تحذير واحد', two: 'تحذيران', few: 'تحذيرات', many: 'تحذيرًا', single: 'تحذير' }),
});

/** صيغة العدد: one وtwo وfew وmany وsingle كما في formatCount. @param {number} n */
function form(n) {
  if (n === 1) return 'one';
  if (n === 2) return 'two';
  const mod = n % 100;
  if (mod >= 3 && mod <= 10) return 'few';
  return mod >= 11 ? 'many' : 'single';
}

/** «1، 2، 3…» بحد ثمانية أرقام. @param {number[]} ns */
export const numberList = (ns) => ns.slice(0, MAX_LIST).join('، ') + (ns.length > MAX_LIST ? '…' : '');

/** مقدار بالثواني بخانة عشرية على الأقل وثلاث على الأكثر: 0.5 و1.0 و1.25 و0.001. @param {number} ms */
export function seconds(ms) {
  const v = Math.abs(ms) / 1000;
  const s = v.toFixed(3).replace(/0+$/, '');
  return s.endsWith('.') ? `${s}0` : s;
}

/** صفة تطابق المعدود بحسب صيغة العدد. @param {number} n @param {Record<'one' | 'two' | 'few' | 'many' | 'single', string>} adj */
const agree = (n, adj) => adj[form(n)];

/** مفعول «صحّح»: «صحّح 3 أخطاء توقيت أولًا» (§١٦.٣). @param {number} n */
export const errorsToFix = (n) => formatCount(n, COUNT.errorToFix);

/** «3 أخطاء · 5 تحذيرات»، أو «لا مشكلات». @param {{ errors: number, warnings: number }} r */
export function issuesSummary({ errors, warnings }) {
  if (!errors && !warnings) return 'لا مشكلات';
  return [errors ? formatCount(errors, COUNT.error) : null, warnings ? formatCount(warnings, COUNT.warning) : null].filter(Boolean).join(' · ');
}

/** «لديك 12 تغييرًا غير محفوظ» بمطابقة الصفة: «تغييران غير محفوظين» و«3 تغييرات غير محفوظة». @param {number} n */
export function unsavedSentence(n) {
  const adj = agree(n, { one: 'غير محفوظ', two: 'غير محفوظين', few: 'غير محفوظة', many: 'غير محفوظ', single: 'غير محفوظ' });
  return `لديك ${formatCount(n, COUNT_FORMS.change)} ${adj}`;
}

/** مؤشر الرأس: «● تغييرات غير محفوظة (12)» أو «محفوظ ✓». @param {number} n @param {boolean} dirty */
export const saveStatus = (n, dirty) => (dirty ? `تغييرات غير محفوظة (${n})` : 'محفوظ ✓');

/**
 * تسمية خيار النطاق: «المقطع 57» و«المحددة (3)» و«الملف كله».
 * @param {'cue' | 'selection' | 'all'} kind @param {{ activeN?: number | null, selected?: number }} ctx
 */
export function scopeOption(kind, { activeN = null, selected = 0 } = {}) {
  if (kind === 'cue') return activeN === null ? 'المقطع' : `المقطع ${activeN}`;
  if (kind === 'selection') return selected ? `المحددة (${selected})` : 'المحددة';
  return 'الملف كله';
}

/**
 * موضوع الفعل في الجملة: «المقطع 57» و«3 مقاطع» و«الملف كله (2140 مقطعًا)».
 * @param {'cue' | 'selection' | 'all'} kind @param {{ activeN?: number | null, selected?: number, total: number }} ctx
 */
export function scopeTarget(kind, { activeN = null, selected = 0, total }) {
  if (kind === 'cue') return `المقطع ${activeN}`;
  if (kind === 'selection') return selected === 1 ? 'المقطع المحدد' : formatCount(selected, COUNT_FORMS.cue);
  return `الملف كله (${formatCount(total, COUNT_FORMS.cue)})`;
}

/**
 * سطر ما قبل التطبيق: «سيُؤخَّر 3 مقاطع 0.5 ث (تظهر لاحقًا)»، وما بعده: «أُخِّر 3 مقاطع 0.5 ث».
 * @param {string} target من scopeTarget @param {number} deltaMs موقّع @param {'before' | 'after'} when
 */
export function shiftSentence(target, deltaMs, when) {
  const later = deltaMs > 0;
  if (when === 'after') return `${later ? 'أُخِّر' : 'قُدِّم'} ${target} ${seconds(deltaMs)} ث.`;
  return `${later ? 'سيُؤخَّر' : 'سيُقدَّم'} ${target} ${seconds(deltaMs)} ث (${later ? 'تظهر لاحقًا' : 'تظهر أبكر'}).`;
}

/** التنبيه قبل نقل الملف كله والإزاحة مفعّلة (عقد التوقيت §٣). @param {number} offsetMs */
export const offsetNotice = (offsetMs) => `إزاحة العرض ${formatOffset(offsetMs)} ث مفعّلة؛ النقل هنا يُضاف إليها.`;

/** سطر الإزاحة الثابت. @param {number} offsetMs */
export const offsetLine = (offsetMs) => `إزاحة العرض أثناء المشاهدة: ${formatOffset(offsetMs)} ث — منفصلة عن التوقيت المحفوظ`;

/** مدة المقطع بالثواني بخانة عشرية: «2.7». @param {number} ms */
export const durationText = (ms) => (Math.round(ms / 100) / 10).toFixed(1);

/**
 * تقرير المقارنة سطورًا بنبرتها (§١٦.٣): «مطابق للأصل ✓»، «3 مقاطع ناقصة: 57، 58، 201»…
 * @param {import('../../core/model/tracks.js').ComparisonReport | null} r
 * @returns {{ tone: 'success' | 'info' | 'warning', text: string }[]}
 */
export function comparisonLines(r) {
  if (!r || r.fingerprintId === null) return [{ tone: 'info', text: 'لا بصمة للمقارنة؛ عُرض الملف كما هو.' }];
  const lines = [];
  if (r.matched) lines.push({ tone: 'success', text: 'مطابق للأصل ✓' });
  lines.push({ tone: r.countSource === r.countTarget ? 'info' : 'warning', text: `العدد: ${r.countTarget} من ${r.countSource}` });
  if (r.numbering === 'different') lines.push({ tone: 'warning', text: 'الترقيم غير متسلسل أو مختلف عن الأصل.' });
  if (r.missing.length) {
    const adj = agree(r.missing.length, { one: 'ناقص', two: 'ناقصان', few: 'ناقصة', many: 'ناقصًا', single: 'ناقص' });
    lines.push({ tone: 'warning', text: `${formatCount(r.missing.length, COUNT_FORMS.cue)} ${adj}: ${numberList(r.missing)}` });
  }
  if (r.extra.length) lines.push({ tone: 'warning', text: `زائد عن الأصل: ${numberList(r.extra)}` });
  if (r.drift.length) lines.push({ tone: 'warning', text: `توقيت مختلف في ${formatCount(r.drift.length, COUNT_FORMS.cue)}` });
  if (r.empty.length) lines.push({ tone: 'warning', text: `بلا نص: ${numberList(r.empty)}` });
  if (r.noArabic.length) lines.push({ tone: 'warning', text: `غير مترجم: ${numberList(r.noArabic)}` });
  return lines;
}

/**
 * لماذا لا تُتاح استعادة التوقيت (§١١.٢)، أو null إن أُتيحت.
 * @param {import('../../core/model/tracks.js').ComparisonReport | null} r
 */
export function restoreUnavailable(r) {
  if (!r || r.fingerprintId === null) return 'لا بصمة للمقارنة، فلا توقيت أصلي يُستعاد.';
  if (r.restoreTimingAvailable) return null;
  if (r.countSource !== r.countTarget) return `العدد مختلف (${r.countTarget} مقابل ${r.countSource})، فلا يمكن مطابقة التوقيت بأمان.`;
  return 'الترقيم مختلف عن الأصل، فلا يمكن مطابقة التوقيت بأمان.';
}
