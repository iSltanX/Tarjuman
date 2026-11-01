// نموذج المحفوظات بلا DOM (P7-AC2/AC3): البحث بالعنوان والمعرّف، والترتيب، وتجميع بيانات الصف (شارات الملفات
// والإزاحة والتاريخ)، وخيارات التصدير بأسباب التعطيل، وملخص المقارنة لحوار الاستبدال. كل ما هنا دوال نقية على
// IndexEntry (عقد data-model §٩) فتُختبر بلا متصفح.
import { messageFor } from '../../core/errors/index.js';
import { isVideoId } from '../../core/model/ids.js';
import { COUNT_FORMS, formatCount, formatOffset } from '../../ui/format.js';

/** حجم الدفعة المعروضة: عرض تدريجي لمحفوظات كثيرة. */
export const PAGE_SIZE = 50;
export const NO_TITLE_TEXT = 'بلا عنوان محفوظ';

// يسقط التشكيل والتطويل ويوحّد الألف والياء والهاء المربوطة ليجد البحث «محاضرة» في «مُحاضَرة».
const MARKS = new RegExp('[\\u064B-\\u065F\\u0670\\u0640]', 'g');
const FOLD = { 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ى': 'ي', 'ة': 'ه' };

/** @param {unknown} s */
export function normalizeQuery(s) {
  return String(s ?? '').normalize('NFKC').replace(MARKS, '').replace(/[أإآٱىة]/g, (c) => FOLD[c]).toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * بحث بالعنوان أو المعرّف (جزء منهما، بلا تمييز حالة ولا تشكيل). الاستعلام الفارغ يعيد كل شيء بترتيبه.
 * @template {{ videoId: string, title: string | null }} E
 * @param {E[]} entries @param {string} query
 * @returns {E[]}
 */
export function searchEntries(entries, query) {
  const q = normalizeQuery(query);
  if (!q) return entries;
  return entries.filter((e) => normalizeQuery(e.title).includes(q) || e.videoId.toLowerCase().includes(q));
}

/**
 * «آخر تعديل» (الأحدث أولًا، كما يعيده الفهرس) أو «العنوان» (بلا عنوان في الآخر، ثم بالمعرّف).
 * @template {{ videoId: string, title: string | null, updatedAt: string }} E
 * @param {E[]} entries @param {'updated' | 'title'} order
 * @returns {E[]}
 */
export function sortEntries(entries, order) {
  const list = entries.slice();
  if (order === 'title') {
    const collator = new Intl.Collator('ar', { sensitivity: 'base', numeric: true });
    return list.sort((a, b) => {
      if (!a.title !== !b.title) return a.title ? -1 : 1;
      return collator.compare(a.title ?? a.videoId, b.title ?? b.videoId) || collator.compare(a.videoId, b.videoId);
    });
  }
  return list.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
}

const AGO = {
  minute: { one: 'قبل دقيقة', two: 'قبل دقيقتين', few: 'دقائق', many: 'دقيقة' },
  hour: { one: 'قبل ساعة', two: 'قبل ساعتين', few: 'ساعات', many: 'ساعة' },
  day: { one: 'أمس', two: 'قبل يومين', few: 'أيام', many: 'يومًا' },
  week: { one: 'قبل أسبوع', two: 'قبل أسبوعين', few: 'أسابيع', many: 'أسبوعًا' },
  month: { one: 'قبل شهر', two: 'قبل شهرين', few: 'أشهر', many: 'شهرًا' },
  year: { one: 'قبل سنة', two: 'قبل سنتين', few: 'سنوات', many: 'سنة' },
};

/** «قبل 3 ساعات» و«قبل 11 ساعة»؛ العدد 1 و2 كلمة واحدة بحسب الوحدة. */
function ago(n, forms) {
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;
  const mod = n % 100;
  return `قبل ${n} ${mod >= 3 && mod <= 10 ? forms.few : forms.many}`;
}

/**
 * التاريخ نسبيًا بالعربية (§٩ «قبل ساعتين»). الزمن المستقبلي (ساعة جهاز متقدمة) أو غير الصالح «الآن».
 * @param {string} iso @param {number} nowMs
 */
export function relativeTime(iso, nowMs) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const sec = Math.floor((nowMs - t) / 1000);
  if (sec < 45) return 'الآن';
  const min = Math.floor(sec / 60);
  if (min < 60) return ago(Math.max(1, min), AGO.minute);
  const hours = Math.floor(min / 60);
  if (hours < 24) return ago(hours, AGO.hour);
  const days = Math.floor(hours / 24);
  if (days < 7) return ago(days, AGO.day);
  if (days < 30) return ago(Math.floor(days / 7), AGO.week);
  if (days < 365) return ago(Math.floor(days / 30), AGO.month);
  return ago(Math.floor(days / 365), AGO.year);
}

/** التاريخ المطلق لتلميح الصف، بأرقام لاتينية. @param {string} iso */
export function absoluteTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('ar-u-nu-latn-ca-gregory', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
  } catch {
    return d.toISOString();
  }
}

const EN_KIND = Object.freeze({ manual: 'يدوي', asr: 'تلقائي' });

/**
 * بيانات الصف للعرض: لا DOM هنا.
 * @param {import('../../core/model/video.js').IndexEntry} e @param {number} nowMs
 */
export function rowModel(e, nowMs) {
  /** @type {{ tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'edited', text: string, id: string }[]} */
  const badges = [];
  for (const kind of ['manual', 'asr']) {
    if (e.english.some((t) => t.kind === kind)) badges.push({ tone: 'neutral', text: `EN ${EN_KIND[kind]}`, id: `en-${kind}` });
  }
  if (e.arabic) badges.push(e.arabic.edited ? { tone: 'edited', text: 'AR معدّلة', id: 'ar-edited' } : { tone: 'info', text: 'AR الأصل', id: 'ar-original' });
  const warning = e.arabic ? warningText(e.arabic) : null;
  if (warning) badges.push({ tone: 'warning', text: warning, id: 'warning' });
  return {
    videoId: e.videoId,
    title: e.title,
    displayTitle: e.title ?? NO_TITLE_TEXT,
    hasTitle: Boolean(e.title),
    /** اسم الوصول للأوامر: العنوان إن وُجد وإلا المعرّف. */
    accessName: e.title ?? e.videoId,
    badges,
    offsetText: e.view.displayOffsetMs !== 0 ? `الإزاحة ${formatOffset(e.view.displayOffsetMs)} ث` : null,
    relative: relativeTime(e.updatedAt, nowMs),
    absolute: absoluteTime(e.updatedAt),
    hasArabic: Boolean(e.arabic),
    edited: Boolean(e.arabic?.edited),
  };
}

/** شارة تحذير المقارنة: «3 ناقصة» أو «2 زائدة» أو «توقيت مختلف في 12»؛ لا شارة إن طابق أو لا بصمة. */
function warningText(a) {
  if (a.matched !== false) return null;
  const parts = [];
  if (a.missing > 0) parts.push(`${a.missing} ناقصة`);
  if (a.extra > 0) parts.push(`${a.extra} زائدة`);
  if (a.drift > 0) parts.push(`توقيت مختلف في ${a.drift}`);
  return parts.join(' · ') || 'غير مطابقة';
}

/**
 * أوامر «تصدير SRT»: العربية الحالية، والأصل المستورد، والإنجليزية المستخرجة (مسار لكل نوع محفوظ). المعطّل
 * يذكر سببه دائمًا. المعرّف يحمل ما يحتاجه التنفيذ.
 * @param {import('../../core/model/video.js').IndexEntry} e
 * @returns {{ id: string, label: string, hint?: string, disabledReason: string | null, action: { type: 'ar', variant: 'current' | 'original' } | { type: 'en', trackKey: string } }[]}
 */
export function exportOptions(e) {
  const noArabic = messageFor('PG_NO_ARABIC');
  const out = [
    { id: 'ar-current', label: 'العربية — النسخة الحالية', disabledReason: e.arabic ? null : noArabic, action: { type: 'ar', variant: 'current' } },
    {
      id: 'ar-original',
      label: 'العربية — الأصل المستورد',
      disabledReason: !e.arabic ? noArabic : e.arabic.edited ? null : messageFor('PG_ORIGINAL_SAME'),
      action: { type: 'ar', variant: 'original' },
    },
  ];
  if (!e.english.length) {
    out.push({ id: 'en', label: 'الإنجليزية — المستخرجة', disabledReason: messageFor('PG_NO_ENGLISH'), action: { type: 'en', trackKey: '' } });
  }
  for (const t of e.english) {
    out.push({
      id: `en:${t.key}`,
      label: e.english.length === 1 ? 'الإنجليزية — المستخرجة' : `الإنجليزية — ${EN_KIND[t.kind]}`,
      hint: formatCount(t.cueCount, COUNT_FORMS.cue),
      disabledReason: null,
      action: { type: 'en', trackKey: t.key },
    });
  }
  return out;
}

/** «نسخ» يعمل لكل فيديو بمعرّف صالح؛ غيره معطّل بسببه. @param {{ videoId: string }} e */
export const copyGate = (e) => (isVideoId(e.videoId) ? { enabled: true, reason: null } : { enabled: false, reason: messageFor('PG_COPY_BAD_ID') });

const NOUN = {
  missing: { one: 'مقطع واحد ناقص', two: 'مقطعان ناقصان', few: 'مقاطع ناقصة', many: 'مقطعًا ناقصًا', single: 'مقطع ناقص' },
  extra: { one: 'مقطع واحد زائد', two: 'مقطعان زائدان', few: 'مقاطع زائدة', many: 'مقطعًا زائدًا', single: 'مقطع زائد' },
  empty: { one: 'مقطع واحد فارغ', two: 'مقطعان فارغان', few: 'مقاطع فارغة', many: 'مقطعًا فارغًا', single: 'مقطع فارغ' },
};
const LIST_LIMIT = 8;
const numbers = (list) => (list.length > LIST_LIMIT ? `${list.slice(0, LIST_LIMIT).join('، ')}…` : list.join('، '));

/**
 * ملخص المقارنة لحوار الاستبدال (§١٦.٣): نبرة وأسطر قصيرة.
 * @param {import('../../core/model/tracks.js').ComparisonReport | null} r
 * @returns {{ tone: 'info' | 'success' | 'warning', lines: string[] }}
 */
export function comparisonSummary(r) {
  if (!r || r.fingerprintId === null) return { tone: 'info', lines: ['لا بصمة للمقارنة؛ عُرض الملف كما هو.'] };
  if (r.matched) return { tone: 'success', lines: ['مطابق للأصل ✓'] };
  const lines = [];
  if (r.countSource !== null && r.countSource !== r.countTarget) lines.push(`عدد المقاطع: ${r.countTarget} من ${r.countSource}`);
  if (r.missing.length) lines.push(`${formatCount(r.missing.length, NOUN.missing)}: ${numbers(r.missing)}`);
  if (r.extra.length) lines.push(`${formatCount(r.extra.length, NOUN.extra)}: ${numbers(r.extra)}`);
  if (r.numbering === 'different' && !r.missing.length && !r.extra.length) lines.push('ترقيم المقاطع يختلف عن الملف المصدَّر.');
  if (r.drift.length) lines.push(r.drift.length === 1 ? 'توقيت مختلف في مقطع واحد' : r.drift.length === 2 ? 'توقيت مختلف في مقطعين' : `توقيت مختلف في ${formatCount(r.drift.length, COUNT_FORMS.cue)}`);
  if (r.empty.length) lines.push(`${formatCount(r.empty.length, NOUN.empty)} (لم يترجمها النموذج): ${numbers(r.empty)}`);
  return { tone: 'warning', lines: lines.length ? lines : ['الملف لا يطابق الملف المصدَّر.'] };
}
