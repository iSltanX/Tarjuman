// نصوص أدوات الشريط (figma-design-brief §٥.٢ و§٦ و§١٦.١) ودوالها النقية: التلميحات بالخطوة الحالية، ومعنى
// الإزاحة بالكلمات، وملخص المقارنة في سطر، وقراءة الثواني من حقل. أرقام لاتينية، والإزاحة بعلامتها (formatOffset).
import { COUNT_FORMS, formatCount, formatTimecode, isolate, ltrInline, offsetInline } from '../../ui/format.js';
import { languageName as sharedLanguageName } from '../../ui/lang.js';

export const LABELS = Object.freeze({
  group: 'أدوات ترجمان',
  download: 'تحميل الأصل (SRT)',
  upload: 'رفع الترجمة العربية (SRT)',
  translation: 'الترجمة',
  panel: 'النص المتزامن',
  panelOpen: 'فتح النص المتزامن',
  panelClose: 'إغلاق النص المتزامن',
  downloadTitle: 'تحميل الأصل',
  displayTitle: 'الترجمة',
  languageTitle: 'اللغة',
  originalFallback: 'الأصل',
  kindManual: 'يدوية',
  kindAsr: 'تلقائية',
  arabicName: 'العربية',
  edited: 'معدّلة',
  timingTitle: 'توقيت الترجمة',
  confirmTitle: 'استبدال الترجمة؟',
  whyLink: 'لماذا؟',
  why: 'ترجمان يقرأ الترجمة التي يجلبها المشغّل لك، ولا يرسل أي طلب من عنده.',
  trackChoice: 'المسار',
  modeNormal: 'عادي',
  modeLong: 'مقاطع أطول',
  modeNormalNote: 'مقاطع كما في يوتيوب، للتزامن الأدق',
  modeLongNote: 'جمل أطول ليفهم النموذج السياق، بالترقيم والتوقيت نفسيهما',
  checking: 'جارٍ التنزيل…',
  copyNeedsTrack: 'يتاح النسخ بعد التقاط مسار الأصل.',
  fallback: 'خيارات احتياطية',
  split: 'تقسيم الملف إلى أجزاء (للملفات الطويلة جدًا)',
  splitSize: 'مقاطع لكل جزء',
  modeAr: 'العربية وحدها',
  // بلا مسار أصلي لا لغة تُسمّى: «فوق الأصل». ومعه يُسمّى باسم لغته (dualLabels).
  modeDual: 'العربية فوق الأصل',
  modeOff: 'إخفاء الترجمة',
  segAr: 'العربية',
  segDual: 'فوق الأصل',
  segOff: 'إخفاء',
  displayMode: 'وضع العرض',
  exportMode: 'وضع التصدير',
  replace: 'استبدال…',
  uploadMore: 'رفع ترجمة…',
  replaceConfirm: 'استبدال',
  save: 'حفظ',
  uploadTitle: 'رفع ترجمة',
  saveTo: 'حفظ في',
  saveNew: 'جديدة',
  saveNewLabel: 'حفظ كترجمة جديدة',
  savesAsNew: 'تُحفظ ترجمةً جديدة',
  keepEdits: 'إبقاء تعديلاتي',
  nameOther: 'الاسم يشير إلى فيديو آخر',
  markReview: 'علّم للمراجعة',
  undo: 'تراجع',
  sync: 'مزامنة بجملة…',
  syncTitle: 'مزامنة بجملة',
  earlier: 'أبكر',
  later: 'أحدث',
  back: 'رجوع',
  downloadFile: 'تنزيل الملف',
  downloadFileHint: 'ملف الأصل (SRT) وحده',
  copyShort: 'نسخ التعليمات',
  copyHint: 'تعليمات الترجمة وحدها، لترفقها مع الملف',
  copied: 'نُسخت التعليمات',
  copyFailed: 'تعذّر النسخ — أعد المحاولة',
  // كلمات لا رموز (← و⚙ خارج الخطين المضمّنين، فيرسمها Brave بخطوط نظام متفرقة؛ تدقيق 5fedcb9، CL-017).
  englishSteps: 'CC ثم الإعدادات ثم «الترجمة» ثم English',
  braveNote: 'Brave قد يختار العربية أولًا؛ اختر English مرة',
  partsLabel: 'أحجام الأجزاء',
  cancel: 'إلغاء',
  offsetResetNote: 'ستُصفَّر إزاحة العرض لأن الملف الجديد يحمل توقيته.',
  slots: 'الترجمة النشطة',
  importing: 'جارٍ فحص الملف ومقارنته…',
  offsetField: 'الإزاحة بالثواني',
  seconds: 'ث',
  stepField: 'خطوة الأزرار',
  stepCustom: 'مخصص',
  stepCustomField: 'الخطوة بالثواني',
  reset: 'تصفير',
  resetHint: 'إعادة الإزاحة إلى 0',
  signLegend: '+ تأخير · − تقديم · تُحفظ لهذا الفيديو',
  close: 'إغلاق',
  // حالة زرّي الشريط في تلميحهما ووصفهما (لا نقطة ملوّنة على الزر).
  stateReady: 'المسار جاهز',
  stateIncomplete: 'قد يكون المسار ناقصًا',
  stateDownloading: 'جارٍ التنزيل…',
  stateDiffers: 'فيها فروق عن الأصل',
  slotsFull: 'الخانات الثلاث ممتلئة؛ الرفع استبدال.',
  sentenceNow: 'أي جملة تُقال الآن؟',
});

/** @type {Intl.DisplayNames | null} */
/**
 * اسم اللغة بالعربية من رمز المسار الفعلي بلهجته إن عُرفت (en ← الإنجليزية، en-GB ← الإنجليزية (المملكة المتحدة))، من الدالة
 * المشتركة (src/ui/lang.js)؛ وما لا يعرفه المتصفح يبقى رمزه، وبلا رمز أو برمز غير محدد null.
 * @param {string | null | undefined} lang
 * @returns {string | null}
 */
export const languageName = (lang) => sharedLanguageName(lang);

/**
 * تسمية وضع «العربية فوق الأصل» باسم لغة الأصل الفعلية: الظاهرة بلغتها الأساسية («فوق الإنجليزية»)، واسم الوصول
 * الكامل بلهجتها («العربية فوق الإنجليزية (المملكة المتحدة)»)؛ وبلا أصل «فوق الأصل».
 * @param {string | null | undefined} lang
 * @returns {{ short: string, aria: string }}
 */
export function dualLabels(lang) {
  const full = languageName(lang);
  if (!full) return { short: LABELS.segDual, aria: LABELS.modeDual };
  const base = languageName(String(lang).trim().split(/[-_]/)[0]) ?? full;
  return { short: `فوق ${base}`, aria: `العربية فوق ${full}` };
}

/**
 * سطر المسار الملتقط في قائمة التحميل: «الإنجليزية · يدوية · 412 مقطعًا» (اسم لغته الفعلي، ونوعه، وعدد مقاطعه).
 * @param {{ lang: string, kind: 'manual' | 'asr', cueCount: number }} t
 */
export function trackLine(t) {
  const kind = t.kind === 'asr' ? LABELS.kindAsr : LABELS.kindManual;
  return `${languageName(t.lang) ?? LABELS.originalFallback} · ${kind} · ${formatCount(t.cueCount, COUNT_FORMS.cue)}`;
}

/** سطر الترجمة في قائمتها: «العربية · 412 مقطعًا» (و«· معدّلة» حين عُدّلت). @param {number} count @param {boolean} edited */
export const translationLine = (count, edited) => `${LABELS.arabicName} · ${formatCount(count, COUNT_FORMS.cue)}${edited ? ` · ${LABELS.edited}` : ''}`;

/** تلميح الزر مع حالته: «تحميل الأصل (SRT) · المسار جاهز»؛ وبلا حالة الاسم وحده. @param {string} name @param {string | null} state */
export const withState = (name, state) => (state ? `${name} · ${state}` : name);

/** «عند 12:34»: اللحظة المرجعية للمزامنة بالجملة. @param {string} t */
export const syncAt = (t) => `عند ${t}`;
/** الرسالة العابرة بعد تبديل الترجمة: «الترجمة 2». @param {number} n */
export const slotToast = (n) => `الترجمة ${n}`;
/** @param {number} n رقم المقطع */
export const markToast = (n) => `عُلِّم المقطع ${n} للمراجعة`;
/** @param {number} ms «الإزاحة −3.2 ث» */
export const offsetToast = (ms) => `الإزاحة ${offsetInline(ms)} ث`;
/**
 * «نُزّل VIDEOID.en.manual.normal.srt» (رمز النجاح SVG بجانبه في القائمة): الاسم معزول LTR، فشرطة أول معرّف مثل «-xyz…» لا
 * تنتقل إلى آخره (تدقيق 7a66f91، U49). @param {string} name
 */
export const downloadedLine = (name) => `نُزّل ${ltrInline(name)}`;
/** «نُزّل 3 أجزاء». @param {string} parts عدد الأجزاء بكلماته */
export const downloadedParts = (parts) => `نُزّل ${parts}`;
/** @param {number} n «+ القاموس (12)»: القاموس مرفق بالتعليمات المنسوخة */
export const glossaryTag = (n) => `+ القاموس (${n})`;

/** @param {number} n «سيُستبدل 12 تعديلًا يدويًا» (والمفرد والمثنى بصيغتيهما). */
export function editsLine(n) {
  const mod = n % 100;
  const what = n === 1 ? 'تعديل يدوي واحد' : n === 2 ? 'تعديلان يدويان' : mod >= 3 && mod <= 10 ? `${n} تعديلات يدوية` : mod >= 11 ? `${n} تعديلًا يدويًا` : `${n} تعديل يدوي`;
  return `سيُستبدل ${what}`;
}

/** @param {number} conflicts ما يأخذه الملف الجديد لتعارضه مع التعديلات */
export const keptLine = (conflicts) => (conflicts ? `تُبقى تعديلاتك، ويأخذ الملف الجديد مواضع التعارض (${conflicts})` : 'تُبقى تعديلاتك اليدوية');

/**
 * «الاسم يشير إلى فيديو آخر · ‹العنوان مقصوصًا إلى 40 محرفًا›». العنوان معزول (FSI…PDI) كما في المحفوظات، فلا تنقلب كلمات
 * «10 Tips for Beginners» ولا تنتقل «?» إلى أوله (تدقيق 7a66f91، U49، DS-TJ-46). @param {string | null} title
 */
export function nameOtherLine(title) {
  const t = String(title ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return LABELS.nameOther;
  const chars = Array.from(t);
  return `${LABELS.nameOther} · ${isolate(chars.length > 40 ? `${chars.slice(0, 39).join('').trimEnd()}…` : t)}`;
}

/**
 * الاستبدال يمحو النسخة السابقة المحفوظة الآن، ولو كانت من خانة أخرى (تدقيق 7a66f91، U76): تُسمّى خانتها، والسطر نفسه في حوار
 * المحفوظات (library/model.js previousLostText).
 * @param {number} from خانة السابقة @param {number} target الخانة الهدف
 */
export const previousLostLine = (from, target) => `تحل المستبدلة محل النسخة السابقة المحفوظة الآن (${from === target ? 'من هذه الترجمة' : `من الترجمة ${from}`})، فلا تُستعاد تلك بعدها.`;

/** عدد المحارف بأرقام مجمّعة: «18,400 محرف»، «12 محرفًا»، «5 محارف». @param {number} n */
export function charsText(n) {
  const mod = n % 100;
  const g = n.toLocaleString('en-US');
  if (n === 1) return 'محرف واحد';
  if (n === 2) return 'محرفان';
  return `${g} ${mod >= 3 && mod <= 10 ? 'محارف' : mod >= 11 ? 'محرفًا' : 'محرف'}`;
}

/** صف جزء في التقسيم الاحتياطي: «1 · 1–200 · 18,400 محرف». @param {{ index: number, from: number, to: number, chars: number }} p */
export const partRow = (p) => `${p.index} · ${p.from}–${p.to} · ${charsText(p.chars)}`;

/** اسم الوصول لخانة ترجمة: «الترجمة 2، نشطة» أو «الترجمة 3، فارغة». @param {{ n: number, active: boolean, filled: boolean }} s */
export const slotLabel = (s) => `الترجمة ${s.n}${s.active ? '، نشطة' : s.filled ? '' : '، فارغة'}`;

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
  return `الإزاحة: ${offsetInline(ms)} ث${meaning}. اضغط للخيارات`;
}

/** @param {number} ms التلميح العابر بعد ± لثانية: «+1.0 ث · تظهر لاحقًا» */
export function nudgeFlash(ms) {
  const s = sign(ms);
  return `${offsetInline(ms)} ث · ${s > 0 ? 'تظهر لاحقًا' : s < 0 ? 'تظهر أبكر' : 'في توقيتها المحفوظ'}`;
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
  // معاينة الرفع بالمحاذاة (FA-04): ملف أُعيد ترقيمه يُقال إنه قورن بتوقيته، فلا يُظن النقص من آخره.
  if (cmp.renumbered) parts.push('الترقيم مختلف عن الأصل، والمقارنة بالتوقيت');
  else if (!parts.length && cmp.numbering === 'different') parts.push('ترقيم المقاطع مختلف عن الأصل');
  if (!parts.length) return { tone: cmp.matched ? 'ok' : 'warn', text: cmp.matched ? 'مطابق للأصل' : 'يختلف عن الأصل' };
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

/** «تراجع» مزامنة بجملة بعد تبدّل الترجمة النشطة أو استبدالها: لا يُكتب في غيرها (CX-004). */
export const syncUndoStale = 'تغيّرت الترجمة النشطة، فلم يُتراجع عن مزامنة سابقتها.';
