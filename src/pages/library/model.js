// نموذج المحفوظات بلا DOM (P7-AC2/AC3، وP13-AC1/AC3/AC6): البحث بالعنوان والمعرّف، والفرز بالحالات الخمس بأعدادها من ملخص
// الفرز، والترتيب، وتجميع بيانات الصف (شارات الملفات والإزاحة والتاريخ ونماذج 1 2 3)، وخيارات التصدير بأسباب التعطيل،
// وملخص المقارنة، وبطاقات «الترجمات…» والنسخة السابقة، وأهداف حوار الرفع وأعداد فروقه، وحالة الصفحة في جزء العنوان. كل ما
// هنا دوال نقية على مدخل المحفوظات (IndexEntry ومعه summary وslots، عقد data-model §٩ و§١٥) فتُختبر بلا متصفح.
import { diffTranslations } from '../../core/align/index.js';
import { messageFor } from '../../core/errors/index.js';
import { isVideoId } from '../../core/model/ids.js';
import { COUNT_FORMS, formatCount, offsetInline } from '../../ui/format.js';

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

/**
 * بيانات الصف للعرض: لا DOM هنا.
 * @param {import('../../core/model/video.js').IndexEntry} e @param {number} nowMs
 */
export function rowModel(e, nowMs) {
  /** @type {{ tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'edited', text: string, id: string, title?: string }[]} */
  const badges = [];
  for (const kind of ['manual', 'asr']) {
    if (e.english.some((t) => t.kind === kind)) badges.push({ tone: 'neutral', text: `EN ${EN_KIND[kind]}`, id: `en-${kind}`, title: `المسار الإنجليزي ${EN_KIND[kind]} محفوظ` });
  }
  if (e.arabic) badges.push(e.arabic.edited ? { tone: 'edited', text: 'AR معدّلة', id: 'ar-edited', title: 'عُدّلت في المحرّر بعد الرفع' } : { tone: 'info', text: 'AR الأصل', id: 'ar-original', title: 'الترجمة العربية كما رُفعت' });
  const warning = e.arabic ? warningText(e.arabic) : null;
  if (warning) badges.push({ tone: 'warning', text: warning, id: 'warning', title: 'الفحص الآلي: المقارنة بالأصل الإنجليزي' });
  const todo = summaryOf(e).marks.todo;
  if (todo > 0) badges.push({ tone: 'brand', text: `تحتاج مراجعة ${todo}`, id: 'review', title: 'مقاطع علّمتها «أعود إليه»' });
  return {
    videoId: e.videoId,
    title: e.title,
    displayTitle: e.title ?? NO_TITLE_TEXT,
    hasTitle: Boolean(e.title),
    /** اسم الوصول للأوامر: العنوان إن وُجد وإلا المعرّف. */
    accessName: e.title ?? e.videoId,
    badges,
    offsetText: e.view.displayOffsetMs !== 0 ? `الإزاحة ${offsetInline(e.view.displayOffsetMs)} ث` : null,
    relative: relativeTime(e.updatedAt, nowMs),
    absolute: absoluteTime(e.updatedAt),
    hasArabic: Boolean(e.arabic),
    edited: Boolean(e.arabic?.edited),
    fileName: e.arabic?.fileName ?? null,
    cueText: e.arabic ? formatCount(e.arabic.cueCount, COUNT_FORMS.cue) : null,
    /** نماذج 1 2 3 (من الحزمة، أو من الفهرس لسجل الإصدار الأول: النشطة في 1). */
    slots: e.slots ?? [1, 2, 3].map((n) => ({ n, filled: n === 1 && Boolean(e.arabic), active: n === 1 && Boolean(e.arabic), name: null, edited: n === 1 && Boolean(e.arabic?.edited), cueCount: n === 1 ? e.arabic?.cueCount ?? 0 : 0 })),
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
 * ملخص المقارنة لحوار الاستبدال: نبرة وأسطر قصيرة.
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

// ---- الإصدار الثاني: الترجمات الثلاث والنسخة السابقة والرفع (P13) ----

/** «النص الدراسي» يحتاج ترجمة نشطة. @param {{ arabic: unknown }} e */
export const studyGate = (e) => (e.arabic ? null : messageFor('PG_STUDY_NO_ARABIC'));

const MODE_LABEL = Object.freeze({ normal: 'عادي', long: 'مقاطع أطول' });

/**
 * وصف بصمة مرجع المقارنة: نوع المسار والوضع والعدد وتاريخ التصدير (والتقسيم إن وُجد).
 * @param {import('../../core/model/tracks.js').Fingerprint} fp @param {string} [date] التاريخ منسقًا
 */
export function fingerprintLabel(fp, date = '') {
  const kind = EN_KIND[String(fp.trackKey).split('|')[1]] ?? '';
  const parts = [`الإنجليزية ${kind}`.trim(), MODE_LABEL[fp.mode] ?? fp.mode, formatCount(fp.count, COUNT_FORMS.cue)];
  if (fp.parts) parts.push(`${fp.parts.length} أجزاء`);
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

/**
 * بطاقة النسخة السابقة: «من الترجمة 2 · قبل ساعة · 0.6 م.ب».
 * @param {{ from: number, savedAt: string, track: { fileName: string, original: unknown[] } } | null} p
 * @param {number | null} bytes @param {number} nowMs @param {(n: number) => string} formatSize
 */
export function previousCard(p, bytes, nowMs, formatSize) {
  if (!p) return null;
  const parts = [`من الترجمة ${p.from}`, relativeTime(p.savedAt, nowMs)];
  if (Number.isFinite(bytes) && bytes > 0) parts.push(formatSize(bytes));
  return { from: p.from, line: parts.join(' · '), fileName: p.track.fileName, absolute: absoluteTime(p.savedAt), cueText: formatCount(p.track.original.length, COUNT_FORMS.cue) };
}
