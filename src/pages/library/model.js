// نموذج المحفوظات بلا DOM (P7-AC2/AC3، وP13-AC1/AC3/AC6، والهوية): البحث بالعنوان والمعرّف، والفرز بالحالات الخمس بأعدادها
// من ملخص الفرز، والترتيب، والتجميع بالتاريخ (اليوم وهذا الأسبوع وأقدم)، وبيانات الصف (شارة الحالة الوحيدة، وسطر «عُدّل منذ ·
// N مقطعًا»، والترجمات الموجودة وأول خانة فارغة للرفع)، ومدة الفيديو، وخيارات التصدير بأسباب التعطيل، وملخص المقارنة،
// وما يسرده حوار الحذف، وأهداف حوار الرفع وأعداد فروقه، وحالة الصفحة في جزء العنوان. كل ما هنا دوال نقية على مدخل المحفوظات
// (IndexEntry ومعه summary وslots، عقد data-model §٩ و§١٥) فتُختبر بلا متصفح.
import { diffTranslations } from '../../core/align/index.js';
import { messageFor } from '../../core/errors/index.js';
import { isVideoId } from '../../core/model/ids.js';
import { COUNT_FORMS, formatCount, ltrInline, offsetInline } from '../../ui/format.js';

/** حجم الدفعة المعروضة: عرض تدريجي لمحفوظات كثيرة. */
export const PAGE_SIZE = 50;
export const NO_TITLE_TEXT = 'بلا عنوان محفوظ';

/**
 * أقسام الفرز (R46، مواصفة التصميم §١٩.٧): «الكل» والحالات الخمس، من مُلخّص الفهرس (بانتظار الترجمة ومترجمة) وملخص الفرز
 * (معدّلة، و«تحذيرات آلية» من الفحص الآلي للمقارنة، و«تحتاج مراجعة» من علامات المراجعة البشرية؛ منفصلتان).
 */
export const FILTERS = Object.freeze([
  Object.freeze({ value: 'all', label: 'الكل' }),
  Object.freeze({ value: 'awaiting', label: 'بانتظار الترجمة' }),
  Object.freeze({ value: 'translated', label: 'مترجمة' }),
  Object.freeze({ value: 'edited', label: 'معدّلة' }),
  Object.freeze({ value: 'warnings', label: 'تحذيرات آلية' }),
  Object.freeze({ value: 'review', label: 'تحتاج مراجعة' }),
]);
export const FILTER_VALUES = Object.freeze(FILTERS.map((f) => f.value));
export const SORTS = Object.freeze([Object.freeze({ value: 'updated', label: 'آخر تعديل' }), Object.freeze({ value: 'title', label: 'العنوان' })]);

/** ملخص الفرز لمدخل بلا رأس حزمة (سجل الإصدار الأول): من مُلخّص الفهرس وحده (عقد data-model §١٥). */
const summaryOf = (e) => e.summary ?? {
  filled: e.arabic ? 1 : 0, edited: e.arabic?.edited ? 1 : 0, warned: e.arabic && e.arabic.matched === false ? 1 : 0, marks: { todo: 0, done: 0 },
};

const MATCH = {
  all: () => true,
  awaiting: (e) => e.arabic === null,
  translated: (e) => e.arabic !== null,
  edited: (e) => summaryOf(e).edited > 0,
  warnings: (e) => summaryOf(e).warned > 0,
  review: (e) => summaryOf(e).marks.todo > 0,
};

/**
 * مدخل المحفوظات للعرض: مُلخّص الفهرس ومعه ملخص الفرز ونماذج 1 2 3 من listLibrary.
 * @param {{ entry: import('../../core/model/video.js').IndexEntry, summary: object, slots: object[] }[]} items
 */
export const libraryEntries = (items) => items.map((x) => ({ ...x.entry, summary: x.summary, slots: x.slots }));

/**
 * @template {{ arabic: null | { edited: boolean, matched: boolean | null } }} E
 * @param {E[]} entries @param {string} filter
 * @returns {E[]}
 */
export const filterEntries = (entries, filter) => entries.filter(MATCH[filter] ?? MATCH.all);

/** أعداد كل قسم على كل المحفوظات (لا على نتيجة البحث)، فيعرف المستخدم ما عنده بنظرة. */
export const filterCounts = (entries) => Object.fromEntries(FILTER_VALUES.map((f) => [f, entries.filter(MATCH[f]).length]));

/** @param {unknown} v */
export const isFilter = (v) => FILTER_VALUES.includes(v);

/**
 * حالة الصفحة من جزء العنوان (#q=…&f=…&s=…&v=…) وإليه: البحث والقسم والترتيب والصف المقصود بعد الرجوع من المحرّر.
 * @param {string} hash
 */
export function parsePageState(hash) {
  const p = new URLSearchParams(String(hash ?? '').replace(/^#/, ''));
  const f = p.get('f');
  const s = p.get('s');
  const v = p.get('v');
  return {
    query: p.get('q') ?? '',
    filter: isFilter(f) ? f : 'all',
    order: s === 'title' ? 'title' : 'updated',
    focusId: isVideoId(v) ? v : null,
  };
}

/** @param {{ query: string, filter: string, order: string, focusId?: string | null }} s */
export function serializePageState({ query, filter, order, focusId = null }) {
  const p = new URLSearchParams();
  if (query.trim()) p.set('q', query.trim());
  if (filter !== 'all') p.set('f', filter);
  if (order !== 'updated') p.set('s', order);
  if (focusId) p.set('v', focusId);
  const s = p.toString();
  return s ? `#${s}` : '';
}

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
 * التاريخ نسبيًا بالعربية («قبل ساعتين»). الزمن المستقبلي (ساعة جهاز متقدمة) أو غير الصالح «الآن».
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

export const EDIT_FORMS = Object.freeze({ one: 'تعديل يدوي واحد', two: 'تعديلان يدويان', few: 'تعديلات يدوية', many: 'تعديلًا يدويًا', single: 'تعديل يدوي' });
export const MARK_FORMS = Object.freeze({ one: 'علامة مراجعة واحدة', two: 'علامتا مراجعة', few: 'علامات مراجعة', many: 'علامة مراجعة', single: 'علامة مراجعة' });
export const TRANSLATION_FORMS = Object.freeze({ one: 'ترجمة واحدة', two: 'ترجمتان', few: 'ترجمات', many: 'ترجمة', single: 'ترجمة' });

/** الخانات الممتلئة بترتيب أرقامها (لا الفارغة): هي وحدها «ترجمات» الفيديو. @param {{ n: number, filled: boolean }[]} slots */
const filledOf = (slots) => slots.filter((s) => s.filled).sort((a, b) => a.n - b.n);

/** مجموع الترجمات المحفوظة في كل المحفوظات (الخانات الممتلئة)، لرأس الصفحة «N فيديو · M ترجمة». @param {{ slots?: { filled: boolean }[], arabic: unknown }[]} entries */
export const translationTotal = (entries) => entries.reduce((n, e) => n + (e.slots ? e.slots.filter((s) => s.filled).length : e.arabic ? 1 : 0), 0);

/** نص شريحة الخانة: «1 · Claude»، وبلا اسم مختصر «الترجمة 1». @param {{ n: number, name?: string | null }} s */
export const chipLabel = (s) => (s.name ? `${s.n} · ${s.name}` : `الترجمة ${s.n}`);

/**
 * الحالة الوحيدة في الصف (شارة واحدة): الأولى من «تحتاج مراجعة» ثم «تحذير آلي» ثم «معدّلة»، وإلا «مترجمة»؛ وبلا ترجمة «بانتظار
 * الترجمة». ما سواها من الحالات المنطبقة في تلميح الشارة، وتفاصيلها كلها في بطاقات التوسيع.
 * @param {import('../../core/model/video.js').IndexEntry & { summary?: object }} e
 * @returns {{ tone: 'neutral' | 'info' | 'success' | 'warning' | 'edited', text: string, id: string, title: string }}
 */
export function rowStatus(e) {
  if (!e.arabic) return { tone: 'neutral', text: 'بانتظار الترجمة', id: 'awaiting', title: 'لا ترجمة عربية محفوظة لهذا الفيديو بعد' };
  const s = summaryOf(e);
  /** @type {{ tone: 'info' | 'warning' | 'edited', text: string, id: string, title: string }[]} */
  const items = [];
  if (s.marks.todo > 0) items.push({ tone: 'info', text: `تحتاج مراجعة ${s.marks.todo}`, id: 'review', title: 'مقاطع علّمتها «أعود إليه»' });
  const warning = warningText(e.arabic);
  if (warning) items.push({ tone: 'warning', text: warning, id: 'warning', title: 'الفحص الآلي: المقارنة بالأصل الإنجليزي' });
  if (e.arabic.edited || s.edited > 0) items.push({ tone: 'edited', text: 'معدّلة', id: 'edited', title: 'عُدّلت في المحرّر بعد الرفع' });
  const lead = items[0] ?? { tone: /** @type {const} */ ('success'), text: 'مترجمة', id: 'translated', title: 'الترجمة العربية محفوظة كما رُفعت' };
  return { ...lead, title: items.length > 1 ? items.map((i) => i.text).join(' · ') : lead.title };
}

/** عدد المقاطع في سطر الصف: مقاطع الترجمة النشطة، وإلا مقاطع المسار الإنجليزي (المحفوظ يدويًا أولًا)، وإلا لا شيء. */
function cueCountText(e) {
  if (e.arabic) return formatCount(e.arabic.cueCount, COUNT_FORMS.cue);
  const track = e.english.find((t) => t.kind === 'manual') ?? e.english[0];
  return track ? `${formatCount(track.cueCount, COUNT_FORMS.cue)} إنجليزيًا` : null;
}

/**
 * بيانات الصف للعرض: لا DOM هنا.
 * @param {import('../../core/model/video.js').IndexEntry} e @param {number} nowMs
 */
export function rowModel(e, nowMs) {
  /** نماذج 1 2 3 (من الحزمة، أو من الفهرس لسجل الإصدار الأول: النشطة في 1). */
  const slots = e.slots ?? [1, 2, 3].map((n) => ({ n, filled: n === 1 && Boolean(e.arabic), active: n === 1 && Boolean(e.arabic), name: null, edited: n === 1 && Boolean(e.arabic?.edited), cueCount: n === 1 ? e.arabic?.cueCount ?? 0 : 0 }));
  const filled = filledOf(slots);
  const relative = relativeTime(e.updatedAt, nowMs);
  return {
    videoId: e.videoId,
    title: e.title,
    displayTitle: e.title ?? NO_TITLE_TEXT,
    hasTitle: Boolean(e.title),
    /** اسم الوصول للأوامر: العنوان إن وُجد وإلا المعرّف. */
    accessName: e.title ?? e.videoId,
    status: rowStatus(e),
    /** إزاحة عرض الترجمة النشطة إن لم تكن صفرًا، معزولة LTR (تلميح شريحتها؛ والتفصيل في بطاقة التوسيع). */
    offsetText: e.view.displayOffsetMs !== 0 ? `الإزاحة ${offsetInline(e.view.displayOffsetMs)} ث` : null,
    whenText: relative ? `عُدّل ${relative}` : null,
    countText: cueCountText(e),
    relative,
    absolute: absoluteTime(e.updatedAt),
    hasArabic: Boolean(e.arabic),
    edited: Boolean(e.arabic?.edited),
    fileName: e.arabic?.fileName ?? null,
    cueText: e.arabic ? formatCount(e.arabic.cueCount, COUNT_FORMS.cue) : null,
    slots,
    /** الترجمات الموجودة فقط، وأول خانة فارغة (شريحة الرفع)؛ لا تُعرض الفارغة نسخةً. */
    filled,
    nextEmpty: /** @type {1 | 2 | 3 | null} */ ([1, 2, 3].find((n) => !filled.some((s) => s.n === n)) ?? null),
    /** سطر عمود «الترجمات» حين لا ترجمة: حالة الأصل الإنجليزي الحقيقية. */
    sourceText: e.english.length ? 'الأصل جاهز' : 'الأصل غير ملتقط',
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

export const DATE_GROUPS = Object.freeze([
  Object.freeze({ key: 'today', label: 'اليوم' }),
  Object.freeze({ key: 'week', label: 'هذا الأسبوع' }),
  Object.freeze({ key: 'older', label: 'أقدم' }),
]);

/**
 * قسم التاريخ: اليوم (من منتصف ليل الجهاز)، وهذا الأسبوع (الأيام الستة السابقة له)، وأقدم؛ والزمن المستقبلي (ساعة جهاز متقدمة)
 * اليوم، وغير الصالح أقدم.
 * @param {string} iso @param {number} nowMs @returns {'today' | 'week' | 'older'}
 */
export function dateGroupOf(iso, nowMs) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'older';
  const startOfToday = new Date(nowMs);
  startOfToday.setHours(0, 0, 0, 0);
  if (t >= startOfToday.getTime()) return 'today';
  const weekStart = new Date(startOfToday);
  weekStart.setDate(weekStart.getDate() - 6);
  return t >= weekStart.getTime() ? 'week' : 'older';
}

/**
 * يجمّع المحفوظات المرتبة بـ«آخر تعديل» في اليوم وهذا الأسبوع وأقدم، بترتيبها داخل كل قسم؛ والأقسام الفارغة لا تُعاد.
 * @template {{ updatedAt: string }} E
 * @param {E[]} entries @param {number} nowMs
 * @returns {{ key: 'today' | 'week' | 'older', label: string, entries: E[] }[]}
 */
export function groupEntries(entries, nowMs) {
  return DATE_GROUPS.map((g) => ({ ...g, entries: entries.filter((e) => dateGroupOf(e.updatedAt, nowMs) === g.key) })).filter((g) => g.entries.length);
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
 * ملخص المقارنة لحوار الاستبدال: نبرة وأسطر قصيرة.
 * @param {import('../../core/model/tracks.js').ComparisonReport | null} r
 * @returns {{ tone: 'info' | 'success' | 'warning', lines: string[] }}
 */
export function comparisonSummary(r) {
  if (!r || r.fingerprintId === null) return { tone: 'info', lines: ['لا بصمة للمقارنة؛ عُرض الملف كما هو.'] };
  if (r.matched) return { tone: 'success', lines: ['مطابق للأصل'] };
  const lines = [];
  if (r.countSource !== null && r.countSource !== r.countTarget) lines.push(`عدد المقاطع: ${r.countTarget} من ${r.countSource}`);
  if (r.missing.length) lines.push(`${formatCount(r.missing.length, NOUN.missing)}: ${numbers(r.missing)}`);
  if (r.extra.length) lines.push(`${formatCount(r.extra.length, NOUN.extra)}: ${numbers(r.extra)}`);
  // معاينة الرفع بالمحاذاة (FA-04): ملف أُعيد ترقيمه يُقال إنه قورن بتوقيته، فلا يُظن النقص من آخره.
  if (r.renumbered) lines.push('ترقيم المقاطع يختلف عن الملف المصدَّر، فقورنت بتوقيتها.');
  else if (r.numbering === 'different' && !r.missing.length && !r.extra.length) lines.push('ترقيم المقاطع يختلف عن الملف المصدَّر.');
  if (r.drift.length) lines.push(r.drift.length === 1 ? 'توقيت مختلف في مقطع واحد' : r.drift.length === 2 ? 'توقيت مختلف في مقطعين' : `توقيت مختلف في ${formatCount(r.drift.length, COUNT_FORMS.cue)}`);
  if (r.empty.length) lines.push(`${formatCount(r.empty.length, NOUN.empty)} (لم يترجمها النموذج): ${numbers(r.empty)}`);
  return { tone: 'warning', lines: lines.length ? lines : ['الملف لا يطابق الملف المصدَّر.'] };
}

// ---- الإصدار الثاني: الترجمات الثلاث والنسخة السابقة والرفع (P13) ----

/** «النص الدراسي» يحتاج ترجمة نشطة. @param {{ arabic: unknown }} e */
export const studyGate = (e) => (e.arabic ? null : messageFor('PG_STUDY_NO_ARABIC'));

const MODE_LABEL = Object.freeze({ normal: 'عادي', long: 'مقاطع أطول' });
/** صيغ عدد الأجزاء («جزآن» و«11 جزءًا»؛ كانت «2 أجزاء»، U59). */
export const PART_FORMS = Object.freeze({ one: 'جزء واحد', two: 'جزآن', few: 'أجزاء', many: 'جزءًا', single: 'جزء' });
/** صيغ المسارات الإنجليزية الملتقطة في ملخص الحذف (كانت «2 مسارات إنجليزية ملتقطة»، U59). */
export const EN_TRACK_FORMS = Object.freeze({
  one: 'المسار الإنجليزي الملتقط', two: 'المساران الإنجليزيان الملتقطان', few: 'مسارات إنجليزية ملتقطة', many: 'مسارًا إنجليزيًا ملتقطًا', single: 'مسار إنجليزي ملتقط',
});

/**
 * سطر حوار الرفع حين يمحو الاستبدالُ النسخة السابقة المحفوظة (تدقيق 7a66f91، U76): تُسمّى خانتها وتاريخها، فلا يُظن أنها
 * سابقة الخانة الهدف وحدها. والسطر نفسه في تأكيد المشغّل (player/controls/text.js previousLostLine).
 * @param {{ from: number, savedAt: string }} prev @param {number} target @param {string} [date]
 */
export function previousLostText(prev, target, date = '') {
  const whose = prev.from === target ? 'من هذه الترجمة' : `من الترجمة ${prev.from}`;
  return `تحل الترجمة المستبدلة محل النسخة السابقة المحفوظة الآن (${whose}${date ? `، ${date}` : ''})، فلا يمكن استعادة تلك بعدها.`;
}

/**
 * وصف بصمة مرجع المقارنة: نوع المسار والوضع والعدد وتاريخ التصدير (والتقسيم إن وُجد).
 * @param {import('../../core/model/tracks.js').Fingerprint} fp @param {string} [date] التاريخ منسقًا
 */
export function fingerprintLabel(fp, date = '') {
  const kind = EN_KIND[String(fp.trackKey).split('|')[1]] ?? '';
  const parts = [`الإنجليزية ${kind}`.trim(), MODE_LABEL[fp.mode] ?? fp.mode, formatCount(fp.count, COUNT_FORMS.cue)];
  if (fp.parts) parts.push(formatCount(fp.parts.length, PART_FORMS));
  if (date) parts.push(date);
  return parts.join(' · ');
}

/**
 * عدد التعديلات اليدوية في ترجمة: كل تغيير في المحاذاة بين الأصل المستورد والنسخة الحالية (نص أو توقيت أو دمج أو شطر أو
 * إضافة أو حذف) تعديل واحد، ونسخة لا تحاذي أصلها تُعدّ مقاطعها كلها. صفر إن لم تُعدَّل. التعريف نفسه في المشغّل
 * (src/player/controls/replace.js) فيتطابق العدد في السطحين، ولا مقارنة بالرقم وحده (R49، وإصلاح تكامل W7).
 * @param {{ original: import('../../core/model/cue.js').Cue[], current: import('../../core/model/cue.js').Cue[] | null } | null} track
 */
export function manualEdits(track) {
  if (!track?.current) return 0;
  const d = diffTranslations(track.original, track.current);
  return d.aligned ? d.changes.length : track.current.length;
}

/**
 * أعداد ما سيتغير لو حلّ الملف الوارد محل الخانة (diffTranslations): أسطر قصيرة.
 * @param {ReturnType<typeof import('../../core/align/index.js').diffTranslations>} d
 */
export function diffCountLines(d) {
  const c = d.counts;
  if (!d.aligned) return [`لا يتحاذى الملفان بالتوقيت: سيُستبدل كل شيء (${c.removed} حالية ← ${c.added} جديدة).`];
  return [
    `يتغير النص في ${c.textChanged} · التوقيت في ${c.timingChanged} · يُضاف ${c.added} · يُحذف ${c.removed} · بلا تغيير ${c.unchanged}`,
    ...(d.confidence === 'low' ? ['المحاذاة غير مؤكدة: الأعداد تقريبية.'] : []),
  ];
}

/**
 * أهداف حوار الرفع كالمشغّل (ui-polish §٢، وproduct-spec «لا تُعرض خانة فارغة في أي محدد»): الترجمات المحفوظة بأرقامها
 * (الحفظ فيها استبدال)، ثم خيار واحد «ترجمة جديدة» للخانة الفارغة المطلوبة أو أولاها؛ وبلا محفوظ هذا الخيار وحده (يعرضه
 * الحوار سطرًا بلا محدد). لا «الترجمة 2 — فارغة» (تدقيق 5fedcb9، CL-005).
 * @param {import('../../core/model/slots.js').Bundle | null} b @param {1 | 2 | 3 | null} [preferred]
 */
export function targetOptions(b, preferred = null) {
  const filledAt = (n) => Boolean(b?.slots[n - 1]?.track);
  const out = [1, 2, 3].filter(filledAt).map((n) => {
    const s = b.slots[n - 1];
    const active = b.active === n;
    const desc = [s.name, s.track.fileName].filter(Boolean).join(' · ') + (active ? ' (نشطة)' : '');
    return { n, filled: true, active, name: s.name ?? null, label: `الترجمة ${n} — ${desc}` };
  });
  const free = (preferred === 1 || preferred === 2 || preferred === 3) && !filledAt(preferred) ? preferred : [1, 2, 3].find((n) => !filledAt(n)) ?? null;
  if (free) out.push({ n: free, filled: false, active: false, name: null, label: 'ترجمة جديدة' });
  return out;
}

/** الهدف الافتراضي: المطلوب إن مُرِّر، وإلا أول خانة فارغة، وإلا النشطة (§١٩.٣). @param {object | null} b @param {number | null} [preferred] */
export function defaultTarget(b, preferred = null) {
  if (preferred === 1 || preferred === 2 || preferred === 3) return preferred;
  const opts = targetOptions(b);
  return (opts.find((o) => !o.filled) ?? opts.find((o) => o.active) ?? opts[0]).n;
}

/** سطر تنبيه الاسم: «الاسم يشير إلى فيديو آخر» وعنوانه مقصوصًا إلى 40 محرفًا إن كان محفوظًا. */
export function nameHintText(hint, titleOf = () => null) {
  if (!hint?.differs) return null;
  const t = titleOf(hint.videoId);
  const title = t ? (Array.from(t).length > 40 ? `${Array.from(t).slice(0, 39).join('')}…` : t) : null;
  // العنوان معزول (FSI…PDI) فلا تنقلب علامات ترقيمه داخل الجملة العربية (تدقيق 5fedcb9، CL-002).
  return title ? `الاسم يشير إلى فيديو آخر: ${String.fromCodePoint(0x2068)}${title}${String.fromCodePoint(0x2069)}` : `الاسم يشير إلى فيديو آخر (${hint.videoId}).`;
}

/** «الترجمة 2» و«الترجمتان 1 و3» و«الترجمات 1 و2 و3». @param {number[]} nums */
export function slotsPhrase(nums) {
  const list = nums.map(String);
  if (list.length === 1) return `الترجمة ${list[0]}`;
  const joined = list.length === 2 ? `${list[0]} و${list[1]}` : `${list.slice(0, -1).join('، ')} و${list.at(-1)}`;
  return `${list.length === 2 ? 'الترجمتان' : 'الترجمات'} ${joined}`;
}

/**
 * ما يُحذف بالضبط وما يبقى، من الحزمة المقروءة قبل حوار التأكيد (لا نص ثابت): بنود لما يوجد فعلًا وحده، فلا يُذكر ما ليس
 * محفوظًا. `slot` حذف ترجمة واحدة (النشطة أو غيرها)، و`all` كل بيانات الفيديو.
 * @param {import('../../core/model/slots.js').Bundle} b @param {{ scope: 'all' } | { scope: 'slot', n: 1 | 2 | 3 }} what
 * @returns {{ items: string[], keeps: string[] }}
 */
export function deleteSummary(b, what) {
  const slots = what.scope === 'slot' ? [b.slots[what.n - 1]] : b.slots.filter((s) => s.track);
  const items = [];
  const keeps = [];
  const named = (s) => (s.name ? `${s.n} «${s.name}»` : String(s.n));
  if (what.scope === 'slot') {
    const s = slots[0];
    items.push(`الترجمة ${named(s)} — ملف ${ltrInline(s.track.fileName)}`);
  } else if (slots.length) {
    items.push(slots.length === 1 ? `الترجمة ${named(slots[0])}` : `${slots.length === 2 ? 'الترجمتان' : 'الترجمات'} ${slots.map(named).join(' و')}`);
  }
  // النسخة السابقة تُحذف مع الفيديو كله ولو لم تبقَ ترجمة ممتلئة (مراجعة الهوية L5).
  if (what.scope === 'all' && b.previous) items.push(`النسخة السابقة (من الترجمة ${b.previous.from})`);
  const edits = slots.reduce((n, s) => n + manualEdits(s.track), 0);
  if (edits) items.push(formatCount(edits, EDIT_FORMS));
  const marks = slots.reduce((n, s) => n + s.marks.length, 0);
  if (marks) items.push(formatCount(marks, MARK_FORMS));
  const offsets = slots.filter((s) => s.offsetMs !== 0);
  if (offsets.length) items.push(offsets.length === 1 ? `الإزاحة المحفوظة (${offsetInline(offsets[0].offsetMs)} ث)` : 'الإزاحات المحفوظة');
  if (slots.some((s) => s.position)) items.push('آخر موضع محفوظ في المحرّر');
  if (what.scope === 'all') {
    const en = b.record.english.length;
    if (en) items.push(formatCount(en, EN_TRACK_FORMS));
    if (b.record.fingerprints.length) items.push(`بصمات التصدير (${b.record.fingerprints.length})`);
    items.push('سجل الفيديو: العنوان والمدة وإعدادات العرض');
    return { items, keeps };
  }
  const others = b.slots.filter((s) => s.track && s.n !== what.n);
  if (others.length) keeps.push(`${slotsPhrase(others.map((s) => s.n))} تبقى${b.active === what.n ? `، وتصبح الترجمة ${others[0].n} النشطة` : ''}`);
  if (b.previous) keeps.push('النسخة السابقة تبقى');
  if (b.record.english.length) keeps.push('المسار الإنجليزي والبصمات تبقى');
  return { items, keeps };
}
