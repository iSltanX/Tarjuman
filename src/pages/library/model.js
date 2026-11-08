// نموذج المحفوظات بلا DOM (P7-AC2/AC3، وP13-AC1/AC3/AC6، والهوية): البحث بالعنوان والمعرّف، والفرز بالحالات الخمس بأعدادها
// من ملخص الفرز، والترتيب، والتجميع بالتاريخ (اليوم وهذا الأسبوع وأقدم)، وبيانات الصف (شارة الحالة الوحيدة، وسطر «عُدّل منذ ·
// N مقطعًا»، والترجمات الموجودة وأول خانة فارغة للرفع)، ومدة الفيديو، وخيارات التصدير بأسباب التعطيل، وملخص المقارنة،
// وما يسرده حوار الحذف، وأهداف حوار الرفع وأعداد فروقه، وحالة الصفحة في جزء العنوان. كل ما هنا دوال نقية على مدخل المحفوظات
// (IndexEntry ومعه summary وslots، عقد data-model §٩ و§١٥) فتُختبر بلا متصفح.
import { diffTranslations } from '../../core/align/index.js';
import { messageFor } from '../../core/errors/index.js';
import { isVideoId, parseTrackKey } from '../../core/model/ids.js';
import { getLocale, joinList, t as tr } from '../../i18n/index.js';
import { languageName, pairLabel } from '../../ui/lang.js';
import { COUNT_FORMS, formatCount, ltrInline, offsetInline } from '../../ui/format.js';

/** حجم الدفعة المعروضة: عرض تدريجي لمحفوظات كثيرة. */
export const PAGE_SIZE = 50;
/** نص بلا عنوان محفوظ باللغة الحالية (يُحسب عند كل قراءة). */
export const noTitleText = () => tr('library.row.noTitle');

/**
 * صيغ جمع من الفهرس تُقرأ باللغة الحالية عند كل استعمال، فيبقى التصدير قيمةً تُمرَّر إلى formatCount كما كانت.
 * @param {string} key
 */
const formsOf = (key) => new Proxy(Object.freeze({}), { get: (_, k) => (typeof k === 'string' ? tr(key)?.[k] : undefined) });

/** عنصر بقيمة label تُحسب عند القراءة لا عند تحميل الوحدة. */
const labelled = (value, key) => Object.freeze({ value, get label() { return tr(key); } });

/**
 * أقسام الفرز (R46، مواصفة التصميم §١٩.٧): «الكل» والحالات الخمس، من مُلخّص الفهرس (بانتظار الترجمة ومترجمة) وملخص الفرز
 * (معدّلة، و«تحذيرات آلية» من الفحص الآلي للمقارنة، و«تحتاج مراجعة» من علامات المراجعة البشرية؛ منفصلتان).
 */
export const FILTERS = Object.freeze(['all', 'awaiting', 'translated', 'edited', 'warnings', 'review'].map((v) => labelled(v, `library.filter.${v}`)));
export const FILTER_VALUES = Object.freeze(FILTERS.map((f) => f.value));
export const SORTS = Object.freeze([labelled('updated', 'library.sort.updated'), labelled('title', 'library.sort.title')]);

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
 * مدخل المحفوظات للعرض: مُلخّص الفهرس ومعه ملخص الفرز ونماذج 1 2 3 والزوج اللغوي لكل خانة (AA3) من listLibrary.
 * @param {{ entry: import('../../core/model/video.js').IndexEntry, summary: object, slots: object[], pairs?: ({ from: string | null, to: string | null } | null)[] }[]} items
 */
export const libraryEntries = (items) => items.map((x) => ({ ...x.entry, summary: x.summary, slots: x.slots, pairs: x.pairs ?? null }));

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
const FOLD = { 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ى': 'ي', 'ة': 'ه' }; // i18n-ignore: بيانات بحث لا نص معروض

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
    const collator = new Intl.Collator(getLocale(), { sensitivity: 'base', numeric: true });
    return list.sort((a, b) => {
      if (!a.title !== !b.title) return a.title ? -1 : 1;
      return collator.compare(a.title ?? a.videoId, b.title ?? b.videoId) || collator.compare(a.videoId, b.videoId);
    });
  }
  return list.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
}

/**
 * التاريخ نسبيًا بلغة الواجهة («قبل ساعتين» / «2 hours ago»). الزمن المستقبلي (ساعة جهاز متقدمة) «الآن»، وغير الصالح فارغ.
 * @param {string} iso @param {number} nowMs
 */
export function relativeTime(iso, nowMs) {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  const sec = Math.floor((nowMs - at) / 1000);
  if (sec < 45) return tr('library.ago.now');
  const min = Math.floor(sec / 60);
  if (min < 60) return tr('library.ago.minute', { n: Math.max(1, min) });
  const hours = Math.floor(min / 60);
  if (hours < 24) return tr('library.ago.hour', { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return tr('library.ago.day', { n: days });
  if (days < 30) return tr('library.ago.week', { n: Math.floor(days / 7) });
  if (days < 365) return tr('library.ago.month', { n: Math.floor(days / 30) });
  return tr('library.ago.year', { n: Math.floor(days / 365) });
}

/** التاريخ المطلق لتلميح الصف بلغة الواجهة، بأرقام لاتينية. @param {string} iso */
export function absoluteTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(`${getLocale()}-u-nu-latn-ca-gregory`, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
  } catch {
    return d.toISOString();
  }
}

/** نوع مسار الأصل المحفوظ بلغة الواجهة؛ فارغ لما لا يُعرف. @param {string | undefined} kind */
const kindText = (kind) => (kind === 'manual' || kind === 'asr' ? tr(`library.kind.${kind}`) : '');

export const EDIT_FORMS = formsOf('library.forms.edit');
export const MARK_FORMS = formsOf('library.forms.mark');
export const TRANSLATION_FORMS = formsOf('library.forms.translation');

/** الخانات الممتلئة بترتيب أرقامها (لا الفارغة): هي وحدها «ترجمات» الفيديو. @param {{ n: number, filled: boolean }[]} slots */
const filledOf = (slots) => slots.filter((s) => s.filled).sort((a, b) => a.n - b.n);

/** مجموع الترجمات المحفوظة في كل المحفوظات (الخانات الممتلئة)، لرأس الصفحة «N فيديو · M ترجمة». @param {{ slots?: { filled: boolean }[], arabic: unknown }[]} entries */
export const translationTotal = (entries) => entries.reduce((n, e) => n + (e.slots ? e.slots.filter((s) => s.filled).length : e.arabic ? 1 : 0), 0);

/** نص شريحة الخانة: «1 · Claude»، وبلا اسم مختصر «الترجمة 1». @param {{ n: number, name?: string | null }} s */
export const chipLabel = (s) => (s.name ? tr('library.chip.named', { n: s.n, name: s.name }) : tr('library.chip.plain', { n: s.n }));

/**
 * الحالة الوحيدة في الصف (شارة واحدة): الأولى من «تحتاج مراجعة» ثم «تحذير آلي» ثم «معدّلة»، وإلا «مترجمة»؛ وبلا ترجمة «بانتظار
 * الترجمة». ما سواها من الحالات المنطبقة في تلميح الشارة، وتفاصيلها كلها في بطاقات التوسيع.
 * @param {import('../../core/model/video.js').IndexEntry & { summary?: object }} e
 * @returns {{ tone: 'neutral' | 'info' | 'success' | 'warning' | 'edited', text: string, id: string, title: string }}
 */
export function rowStatus(e) {
  if (!e.arabic) return { tone: 'neutral', text: tr('library.status.awaiting'), id: 'awaiting', title: tr('library.status.awaitingTitle') };
  const s = summaryOf(e);
  /** @type {{ tone: 'info' | 'warning' | 'edited', text: string, id: string, title: string }[]} */
  const items = [];
  if (s.marks.todo > 0) items.push({ tone: 'info', text: tr('library.status.review', { n: s.marks.todo }), id: 'review', title: tr('library.status.reviewTitle') });
  const warning = warningText(e.arabic);
  if (warning) items.push({ tone: 'warning', text: warning, id: 'warning', title: tr('library.status.warningTitle') });
  if (e.arabic.edited || s.edited > 0) items.push({ tone: 'edited', text: tr('library.status.edited'), id: 'edited', title: tr('library.status.editedTitle') });
  const lead = items[0] ?? { tone: /** @type {const} */ ('success'), text: tr('library.status.translated'), id: 'translated', title: tr('library.status.translatedTitle') };
  return { ...lead, title: items.length > 1 ? items.map((i) => i.text).join(' · ') : lead.title };
}

/** عدد المقاطع في سطر الصف: مقاطع الترجمة النشطة، وإلا مقاطع مسار الأصل (المحفوظ يدويًا أولًا)، وإلا لا شيء. */
function cueCountText(e) {
  if (e.arabic) return formatCount(e.arabic.cueCount, COUNT_FORMS.cue);
  const track = e.english.find((t) => t.kind === 'manual') ?? e.english[0];
  return track ? tr('library.row.inOriginal', { count: formatCount(track.cueCount, COUNT_FORMS.cue) }) : null;
}

/**
 * زوج الترجمة النشطة في الصف (AA3، لوحة 19 البند ٢): من listLibrary، وإلا لغة أول مسار؛ وفيديو بلا ترجمة بلغة أصله و«إلى» المختارة
 * له في نافذة الإضافة إن وُجدت. null بلا لغة تُعرف.
 * @param {{ english: { key: string }[], arabic: object | null, slots?: { n: number, active: boolean }[], pairs?: ({ from: string | null, to: string | null } | null)[] | null }} e
 * @param {{ from: string | null, to: string | null } | null} [saved] زوج الفيديو في تفضيلات اللغات
 */
export function rowPair(e, saved = null) {
  const active = e.slots?.find((s) => s.active)?.n ?? 1;
  const p = e.pairs?.[active - 1] ?? null;
  const first = parseTrackKey(e.english[0]?.key)?.lang ?? null;
  if (e.arabic) return { from: p?.from ?? first, to: p?.to ?? null };
  const from = first ?? saved?.from ?? null;
  return from || saved?.to ? { from, to: saved?.to ?? null } : null;
}

/** سطر الزوج في الصف: «الإنجليزية ← العربية»، أو null. @param {Parameters<typeof rowPair>[0]} e @param {Parameters<typeof rowPair>[1]} [saved] */
export const pairText = (e, saved = null) => {
  const p = rowPair(e, saved);
  return p ? pairLabel({ ...p, translated: !!e.arabic }) : null;
};

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
    displayTitle: e.title ?? noTitleText(),
    hasTitle: Boolean(e.title),
    /** اسم الوصول للأوامر: العنوان إن وُجد وإلا المعرّف. */
    accessName: e.title ?? e.videoId,
    status: rowStatus(e),
    /** إزاحة عرض الترجمة النشطة إن لم تكن صفرًا، معزولة LTR (تلميح شريحتها؛ والتفصيل في بطاقة التوسيع). */
    offsetText: e.view.displayOffsetMs !== 0 ? tr('library.row.offset', { offset: offsetInline(e.view.displayOffsetMs) }) : null,
    whenText: relative ? tr('library.row.edited', { when: relative }) : null,
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
    /** سطر عمود «الترجمات» حين لا ترجمة: حالة الأصل الحقيقية. */
    sourceText: tr(e.english.length ? 'library.row.sourceReady' : 'library.row.sourceMissing'),
  };
}

/** شارة تحذير المقارنة: «3 ناقصة» أو «2 زائدة» أو «توقيت مختلف في 12»؛ لا شارة إن طابق أو لا بصمة. */
function warningText(a) {
  if (a.matched !== false) return null;
  const parts = [];
  if (a.missing > 0) parts.push(formatCount(a.missing, NOUN.missingBadge));
  if (a.extra > 0) parts.push(formatCount(a.extra, NOUN.extraBadge));
  if (a.drift > 0) parts.push(driftText(a.drift));
  return parts.join(' · ') || tr('library.warn.mismatch');
}

/** «توقيت مختلف في 12 مقطعًا» / «Timing differs in 12 segments». @param {number} n */
const driftText = (n) => tr('library.compare.drift', { n, count: formatCount(n, COUNT_FORMS.cue) });

export const DATE_GROUPS = Object.freeze(['today', 'week', 'older'].map((key) => Object.freeze({ key, get label() { return tr(`library.group.${key}`); } })));

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
 * أوامر «تصدير SRT»: الترجمة الحالية، والأصل المستورد، ومسارات الأصل المستخرجة (مسار لكل لغة ونوع محفوظ) بأسماء لغاتها الفعلية
 * (AA3). المعطّل يذكر سببه دائمًا. المعرّف يحمل ما يحتاجه التنفيذ.
 * @param {import('../../core/model/video.js').IndexEntry} e
 * @returns {{ id: string, label: string, hint?: string, disabledReason: string | null, action: { type: 'ar', variant: 'current' | 'original' } | { type: 'en', trackKey: string } }[]}
 */
export function exportOptions(e) {
  const noArabic = messageFor('PG_NO_ARABIC');
  const to = rowPair(e)?.to ?? null;
  const tName = (to && languageName(to)) || tr('library.export.translationName');
  const out = [
    { id: 'ar-current', label: tr('library.export.current', { name: tName }), disabledReason: e.arabic ? null : noArabic, action: { type: 'ar', variant: 'current' } },
    {
      id: 'ar-original',
      label: tr('library.export.uploaded', { name: tName }),
      disabledReason: !e.arabic ? noArabic : e.arabic.edited ? null : messageFor('PG_ORIGINAL_SAME'),
      action: { type: 'ar', variant: 'original' },
    },
  ];
  if (!e.english.length) {
    out.push({ id: 'en', label: tr('library.export.extractedNone'), disabledReason: messageFor('PG_NO_ENGLISH'), action: { type: 'en', trackKey: '' } });
  }
  for (const t of e.english) {
    const k = parseTrackKey(t.key);
    const name = (k && languageName(k.lang)) || tr('library.export.originalName');
    const what = k?.via ? tr('library.export.autoFrom', { from: languageName(k.via) ?? k.via }) : kindText(t.kind);
    out.push({
      id: `en:${t.key}`,
      label: e.english.length === 1 && !k?.via ? tr('library.export.extractedOne', { name }) : tr('library.export.track', { name, what }),
      hint: formatCount(t.cueCount, COUNT_FORMS.cue),
      disabledReason: null,
      action: { type: 'en', trackKey: t.key },
    });
  }
  return out;
}

/**
 * زوج نسخ التعليمات من المحفوظات (AA3): زوج الفيديو المحفوظ من نافذة الإضافة، وإلا لغة أصل الترجمة النشطة ولغتها، و«إلى» الافتراضية
 * لفيديو بلا ترجمة. via لغة أصل ترجمة يوتيوب الآلية حين يكون «من» مسارها.
 * @param {Parameters<typeof rowPair>[0] & { videoId: string }} e
 * @param {import('../../core/model/lang-prefs.js').LangPrefs | null} langPrefs
 * @returns {{ from: string | null, to: string | null, via: string | null }}
 */
export function copyPair(e, langPrefs) {
  const saved = langPrefs?.videos?.[e.videoId] ?? null;
  const row = rowPair(e, saved);
  const from = saved?.from ?? row?.from ?? null;
  const to = saved?.to ?? row?.to ?? langPrefs?.pair?.to ?? null;
  const active = e.slots?.find((s) => s.active)?.n ?? 1;
  const p = e.pairs?.[active - 1] ?? null;
  const viaKey = e.english.map((t) => parseTrackKey(t.key)).find((k) => k?.via && k.lang === from);
  return { from, to, via: p?.via && p.from === from ? p.via : viaKey?.via ?? null };
}

/**
 * «نسخ» يعمل لفيديو بمعرّف صالح وزوج لغتين مختلفتين؛ غيره معطّل بسببه.
 * @param {{ videoId: string }} e @param {{ from: string | null, to: string | null } | null} [pair]
 */
export function copyGate(e, pair = null) {
  if (!isVideoId(e.videoId)) return { enabled: false, reason: messageFor('PG_COPY_BAD_ID') };
  if (pair && (!pair.from || !pair.to)) return { enabled: false, reason: messageFor('PG_PAIR_MISSING') };
  if (pair && pair.from === pair.to) return { enabled: false, reason: messageFor('PG_PAIR_SAME') };
  return { enabled: true, reason: null };
}

const NOUN = {
  missing: formsOf('library.forms.missing'),
  extra: formsOf('library.forms.extra'),
  empty: formsOf('library.forms.empty'),
  missingBadge: formsOf('library.forms.missingBadge'),
  extraBadge: formsOf('library.forms.extraBadge'),
};
const LIST_LIMIT = 8;
const numbers = (list) => (list.length > LIST_LIMIT ? `${joinList(list.slice(0, LIST_LIMIT))}…` : joinList(list));
/** «3 مقاطع ناقصة: 4، 5، 6». */
const listLine = (what, list) => tr('library.compare.listLine', { what, list: numbers(list) });

/**
 * ملخص المقارنة لحوار الاستبدال: نبرة وأسطر قصيرة.
 * @param {import('../../core/model/tracks.js').ComparisonReport | null} r
 * @returns {{ tone: 'info' | 'success' | 'warning', lines: string[] }}
 */
export function comparisonSummary(r) {
  if (!r || r.fingerprintId === null) return { tone: 'info', lines: [tr('library.compare.noReference')] };
  // الفارغ وغير المترجم لا يمنعان matched بعقد البيانات، لكنهما تحذير يُقال بعد سطر المطابقة البنيوية (U-027) كما في المحرّر.
  const warn = [];
  const empty = r.empty ?? [];
  const untranslated = r.noArabic ?? [];
  if (empty.length) warn.push(listLine(formatCount(empty.length, NOUN.empty), empty));
  if (untranslated.length) warn.push(tr('library.compare.untranslated', { count: formatCount(untranslated.length, COUNT_FORMS.cue), list: numbers(untranslated) }));
  if (r.matched) return warn.length ? { tone: 'warning', lines: [tr('library.compare.matches'), ...warn] } : { tone: 'success', lines: [tr('library.compare.matches')] };
  const lines = [];
  if (r.countSource !== null && r.countSource !== r.countTarget) lines.push(tr('library.compare.countLine', { target: r.countTarget, source: r.countSource }));
  if (r.missing.length) lines.push(listLine(formatCount(r.missing.length, NOUN.missing), r.missing));
  if (r.extra.length) lines.push(listLine(formatCount(r.extra.length, NOUN.extra), r.extra));
  // معاينة الرفع بالمحاذاة (FA-04): ملف أُعيد ترقيمه يُقال إنه قورن بتوقيته، فلا يُظن النقص من آخره.
  if (r.renumbered) lines.push(tr('library.compare.renumbered'));
  else if (r.numbering === 'different' && !r.missing.length && !r.extra.length) lines.push(tr('library.compare.numbering'));
  if (r.drift.length) lines.push(driftText(r.drift.length));
  lines.push(...warn);
  return { tone: 'warning', lines: lines.length ? lines : [tr('library.compare.differs')] };
}

// ---- الإصدار الثاني: الترجمات الثلاث والنسخة السابقة والرفع (P13) ----

/** «النص الدراسي» يحتاج ترجمة نشطة. @param {{ arabic: unknown }} e */
export const studyGate = (e) => (e.arabic ? null : messageFor('PG_STUDY_NO_ARABIC'));

/** وضع التقسيم بلغة الواجهة؛ ما لا يُعرف يبقى كما هو. @param {string} mode */
const modeLabel = (mode) => (mode === 'normal' || mode === 'long' ? tr(`library.mode.${mode}`) : mode);
/** صيغ عدد الأجزاء («جزآن» و«11 جزءًا»؛ كانت «2 أجزاء»، U59). */
export const PART_FORMS = formsOf('library.forms.part');
/** صيغ مسارات الأصل الملتقطة في ملخص الحذف (كانت «2 مسارات إنجليزية ملتقطة»، U59؛ وبلا لغة ثابتة منذ AA3). */
export const EN_TRACK_FORMS = formsOf('library.forms.enTrack');

/**
 * سطر حوار الرفع حين يمحو الاستبدالُ النسخة السابقة المحفوظة (تدقيق 7a66f91، U76): تُسمّى خانتها وتاريخها، فلا يُظن أنها
 * سابقة الخانة الهدف وحدها. والسطر نفسه في تأكيد المشغّل (player/controls/text.js previousLostLine).
 * @param {{ from: number, savedAt: string }} prev @param {number} target @param {string} [date]
 */
export function previousLostText(prev, target, date = '') {
  const whose = prev.from === target ? tr('library.previousLost.whoseSame') : tr('library.previousLost.whoseOther', { n: prev.from });
  return tr('library.previousLost.text', { whose, date });
}

/**
 * وصف بصمة مرجع المقارنة: نوع المسار والوضع والعدد وتاريخ التصدير (والتقسيم إن وُجد).
 * @param {import('../../core/model/tracks.js').Fingerprint} fp @param {string} [date] التاريخ منسقًا
 */
export function fingerprintLabel(fp, date = '') {
  const k = parseTrackKey(fp.trackKey);
  const kind = k?.via ? tr('library.kind.autoTranslated') : kindText(k?.kind);
  const parts = [tr('library.fingerprint.track', { name: (k && languageName(k.lang)) || tr('library.export.originalName'), kind }), modeLabel(fp.mode), formatCount(fp.count, COUNT_FORMS.cue)];
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
  if (!d.aligned) return [tr('library.diff.unaligned', { removed: c.removed, added: c.added })];
  return [
    tr('library.diff.counts', { text: c.textChanged, timing: c.timingChanged, added: c.added, removed: c.removed, unchanged: c.unchanged }),
    ...(d.confidence === 'low' ? [tr('library.diff.lowConfidence')] : []),
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
    const desc = [s.name, s.track.fileName].filter(Boolean).join(' · ') + (active ? tr('library.target.activeSuffix') : '');
    return { n, filled: true, active, name: s.name ?? null, label: tr('library.target.option', { n, desc }) };
  });
  const free = (preferred === 1 || preferred === 2 || preferred === 3) && !filledAt(preferred) ? preferred : [1, 2, 3].find((n) => !filledAt(n)) ?? null;
  if (free) out.push({ n: free, filled: false, active: false, name: null, label: tr('library.target.newOne') });
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
  return title ? tr('library.nameHint.withTitle', { title: `${String.fromCodePoint(0x2068)}${title}${String.fromCodePoint(0x2069)}` }) : tr('library.nameHint.withId', { id: hint.videoId });
}

/** «الترجمة 2» و«الترجمتان 1 و3» و«الترجمات 1 و2 و3» (وبالإنجليزية «Translations 1 and 3»). @param {number[]} nums */
export const slotsPhrase = (nums) => tr('library.slots.phrase', { nums: nums.map(String) });

/**
 * ما يُحذف بالضبط وما يبقى، من الحزمة المقروءة قبل حوار التأكيد (لا نص ثابت): بنود لما يوجد فعلًا وحده، فلا يُذكر ما ليس
 * محفوظًا. `slot` حذف ترجمة واحدة (النشطة أو غيرها)، و`all` كل بيانات الفيديو.
 * @param {import('../../core/model/slots.js').Bundle} b @param {{ scope: 'all' } | { scope: 'slot', n: 1 | 2 | 3 }} what
 * @param {{ pair?: boolean }} [o] pair: للفيديو زوج لغات محفوظ (langPrefs.videos): يُحذف مع بيانات الفيديو كلها (U-019) ويبقى مع حذف ترجمة
 * @returns {{ items: string[], keeps: string[] }}
 */
export function deleteSummary(b, what, { pair = false } = {}) {
  const slots = what.scope === 'slot' ? [b.slots[what.n - 1]] : b.slots.filter((s) => s.track);
  const items = [];
  const keeps = [];
  const named = (s) => (s.name ? tr('library.delete.named', { n: s.n, name: s.name }) : String(s.n));
  if (what.scope === 'slot') {
    const s = slots[0];
    items.push(tr('library.delete.slotItem', { name: named(s), file: ltrInline(s.track.fileName) }));
  } else if (slots.length) {
    items.push(slots.length === 1 ? tr('library.delete.allOne', { name: named(slots[0]) }) : tr('library.delete.allMany', { names: slots.map(named) }));
  }
  // النسخة السابقة تُحذف مع الفيديو كله ولو لم تبقَ ترجمة ممتلئة (مراجعة الهوية L5).
  if (what.scope === 'all' && b.previous) items.push(tr('library.delete.previous', { n: b.previous.from }));
  const edits = slots.reduce((n, s) => n + manualEdits(s.track), 0);
  if (edits) items.push(formatCount(edits, EDIT_FORMS));
  const marks = slots.reduce((n, s) => n + s.marks.length, 0);
  if (marks) items.push(formatCount(marks, MARK_FORMS));
  const offsets = slots.filter((s) => s.offsetMs !== 0);
  if (offsets.length) items.push(offsets.length === 1 ? tr('library.delete.offsetOne', { offset: offsetInline(offsets[0].offsetMs) }) : tr('library.delete.offsetMany'));
  if (slots.some((s) => s.position)) items.push(tr('library.delete.position'));
  if (what.scope === 'all') {
    const en = b.record.english.length;
    if (en) items.push(formatCount(en, EN_TRACK_FORMS));
    if (b.record.fingerprints.length) items.push(tr('library.delete.fingerprints', { n: b.record.fingerprints.length }));
    items.push(tr('library.delete.videoMeta'));
    if (pair) items.push(tr('library.delete.pair'));
    return { items, keeps };
  }
  const others = b.slots.filter((s) => s.track && s.n !== what.n);
  if (others.length) keeps.push(tr('library.delete.slotsStay', { phrase: slotsPhrase(others.map((s) => s.n)), becomes: b.active === what.n ? others[0].n : null }));
  if (b.previous) keeps.push(tr('library.delete.previousStays'));
  if (b.record.english.length) keeps.push(tr('library.delete.originalsStay'));
  if (pair) keeps.push(tr('library.delete.pairStays'));
  return { items, keeps };
}
