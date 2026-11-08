// نصوص المحرّر العربية (مواصفة التصميم الأولى §١١ و§١٦): النطاق قبل الفعل وبعده، والعدّ بالعربية بمطابقة
// الصفة للمعدود، والإزاحة بعلامتها، وتقرير المقارنة سطورًا. دوال نقية بلا DOM.
import { languageName } from '../../ui/lang.js';
import { COUNT_FORMS, formatCount, ltrInline, offsetInline } from '../../ui/format.js';
import { PART_FORMS, absoluteTime } from '../library/model.js';

const MAX_LIST = 8;
const FSI = String.fromCodePoint(0x2068);
const PDI = String.fromCodePoint(0x2069);

/** اسم يكتبه المستخدم (قد يكون إنجليزيًا) معزولًا اتجاهًا داخل جملة عربية، فلا تنقلب علامات ترقيمه (تدقيق 7a66f91، U27). @param {string} s */
export const isolate = (s) => `${FSI}${s}${PDI}`;

// صيغ العدّ بصيغة formatCount. «error» للعدّ المستقل في رأس اللوحة، و«errorToFix» مفعولًا به لـ«صحّح».
export const COUNT = Object.freeze({
  error: Object.freeze({ one: 'خطأ واحد', two: 'خطآن', few: 'أخطاء', many: 'خطأً', single: 'خطأ' }),
  errorToFix: Object.freeze({ one: 'خطأ التوقيت', two: 'خطأي التوقيت', few: 'أخطاء توقيت', many: 'خطأ توقيت', single: 'خطأ توقيت' }),
  warning: Object.freeze({ one: 'تحذير واحد', two: 'تحذيران', few: 'تحذيرات', many: 'تحذيرًا', single: 'تحذير' }),
  match: Object.freeze({ one: 'موضع واحد', two: 'موضعان', few: 'مواضع', many: 'موضعًا', single: 'موضع' }),
  mark: Object.freeze({ one: 'علامة واحدة', two: 'علامتان', few: 'علامات', many: 'علامة', single: 'علامة' }),
  markOther: Object.freeze({ one: 'علامة أخرى', two: 'علامتان أخريان', few: 'علامات أخرى', many: 'علامة أخرى', single: 'علامة أخرى' }),
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

/**
 * مؤشر الرأس: «تغييرات غير محفوظة (12)»، أو «زمن غير صالح» لمسودة زمن وحدها (كانت «محفوظ»؛ U27)، أو «محفوظ» (الرمز من الشارة
 * لا من نص بخط آخر).
 * @param {number} n @param {boolean} dirty @param {number} [drafts] حقول زمن بنص لم يُقرأ
 */
export const saveStatus = (n, dirty, drafts = 0) => (dirty ? `تغييرات غير محفوظة (${n})` : drafts ? 'زمن غير صالح' : 'محفوظ');

const FIELD_FORMS = Object.freeze({ one: 'حقل زمن واحد', two: 'حقلا زمن', few: 'حقول زمن', many: 'حقل زمن', single: 'حقل زمن' });

/**
 * ما يضيع بالمغادرة أو التبديل: التغييرات غير المحفوظة، وحقول الزمن بنص غير صالح لم يُعتمد. كانت مسودة الزمن وحدها تُكتب
 * «لديك 0 تغيير غير محفوظ» (تدقيق 7a66f91، U27).
 * @param {number} n @param {number} drafts
 */
export function pendingSentence(n, drafts) {
  const field = drafts ? `${formatCount(drafts, FIELD_FORMS)} ${agree(drafts, { one: 'غير صالح', two: 'غير صالحين', few: 'غير صالحة', many: 'غير صالح', single: 'غير صالح' })}` : '';
  if (!n && drafts) return `لديك ${field}`;
  return drafts ? `${unsavedSentence(n)}، و${field}` : unsavedSentence(n);
}

/**
 * تلميح اختصار بحسب المنصة: «⌘Z» و«⇧⌘Z» في ماك، و«Ctrl+Z» و«Ctrl+Shift+Z» في غيره (U27: كانت برموز ماك وحدها).
 * @param {string} key الحرف @param {{ mac: boolean, shift?: boolean }} o
 */
export const keyHint = (key, { mac, shift = false }) => (mac ? `${shift ? '⇧' : ''}⌘${key}` : `Ctrl+${shift ? 'Shift+' : ''}${key}`);

/** ماك أم لا، من النافذة (userAgentData ثم platform). @param {Window | null | undefined} win */
export const isMac = (win) => /mac/i.test(String(win?.navigator?.userAgentData?.platform ?? win?.navigator?.platform ?? ''));

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
export const offsetNotice = (offsetMs) => `إزاحة العرض ${offsetInline(offsetMs)} ث مفعّلة؛ النقل هنا يُضاف إليها.`;

/** سطر الإزاحة الثابت. @param {number} offsetMs */
export const offsetLine = (offsetMs) => `إزاحة العرض أثناء المشاهدة: ${offsetInline(offsetMs)} ث — منفصلة عن التوقيت المحفوظ`;

/**
 * اسم الوصول لخانة في محدد خانة التحرير: «الترجمة 2، قيد التحرير، النشطة في المشغّل» أو «الترجمة 3، فارغة».
 * @param {{ n: number, filled: boolean, active: boolean }} slot active هنا النشطة في المشغّل
 * @param {{ editing: boolean }} o
 */
export function editSlotLabel(slot, { editing }) {
  if (!slot.filled) return `الترجمة ${slot.n}، فارغة`;
  return [`الترجمة ${slot.n}`, editing ? 'قيد التحرير' : null, slot.active ? 'النشطة في المشغّل' : null].filter(Boolean).join('، ');
}

/**
 * سطر تحت الرأس يفرّق خانة التحرير عن النشطة (R43): الحفظ هنا لا يغيّر ما يُعرض في المشغّل.
 * @param {number} editing @param {number | null} active @param {string | null} name
 */
export function activeSlotLine(editing, active, name) {
  const who = name ? `تحرّر الترجمة ${editing} «${isolate(name)}»` : `تحرّر الترجمة ${editing}`;
  if (editing === active) return `${who}، وهي النشطة في المشغّل.`;
  return `${who}. النشطة في المشغّل الترجمة ${active}، والحفظ هنا لا يغيّرها.`;
}

/**
 * اسم مرجع المقارنة في قائمته: نوع المسار ووضعه وأجزاؤه وتاريخ تصديره، قصيرًا بالعربية بدل اسم الملف الطويل.
 * @param {{ trackKey: string, mode: string, parts: unknown[] | null, createdAt: string } | null} fp
 */
export function refLabel(fp) {
  if (!fp) return 'مرجع غير محفوظ';
  const kind = fp.trackKey.endsWith('|asr') ? 'تلقائي' : 'يدوي';
  const mode = fp.mode === 'long' ? 'مقاطع أطول' : 'عادي';
  // التاريخ بصيغة المحفوظات ونافذة الأيقونة وبتوقيت الجهاز، لا ISO خامًا بتوقيت UTC (تدقيق Fable، UX-07)، و«جزآن» لا «2 أجزاء».
  const parts = fp.parts ? ` · ${formatCount(fp.parts.length, PART_FORMS)}` : '';
  return `${kind} · ${mode}${parts} · ${absoluteTime(fp.createdAt)}`;
}

/**
 * خيار العمود المرجعي: مسار الأصل باسم لغته الفعلية («الإنجليزية»، «اليابانية»؛ AA3) أو «الأصل» بلا لغة، أو «الترجمة 3 — مراجعة».
 * @param {'en' | number} v @param {string | null} [name] @param {string | null} [lang] لغة مسار الأصل
 */
export const refOptionLabel = (v, name = null, lang = null) => (v === 'en' ? (lang && languageName(lang)) || 'الأصل' : name ? `الترجمة ${v} — ${isolate(name)}` : `الترجمة ${v}`);

// ---- العلامات (R53): «أعود إليه» و«راجعته»، والتبديل بينهما من زر الصف ----
export const MARK_LABEL = Object.freeze({ todo: 'أعود إليه', done: 'راجعته' });
/** ما بعد العلامة الحالية في التبديل: بلا ← أعود إليه ← راجعته ← بلا. @param {'todo' | 'done' | null} kind */
export const nextMark = (kind) => (kind === null ? 'todo' : kind === 'todo' ? 'done' : null);

/** اسم زر العلامة بما سيفعله. @param {number} n @param {{ kind: 'todo' | 'done' } | null} mark */
export function markActionLabel(n, mark) {
  const next = nextMark(mark?.kind ?? null);
  return next ? `علّم المقطع ${n} «${MARK_LABEL[next]}»` : `أزل علامة المقطع ${n}`;
}

/**
 * شارة الصف: أيقونة flag لـ«أعود إليه» وcheck لـ«راجعته» (SVG لا رمز نصي يسقط إلى خط نظام؛ تدقيق 5fedcb9، CL-010)، و«؟» لعلامة
 * قد تكون انتقلت.
 * @param {{ kind: 'todo' | 'done', state: string }} m @returns {{ icon: 'flag' | 'check', suffix: string }}
 */
export const markBadge = (m) => ({ icon: m.kind === 'todo' ? 'flag' : 'check', suffix: m.state === 'moved' ? '؟' : '' });

/** @param {{ kind: 'todo' | 'done', state: string, others?: number }} m others علامات أخرى على المقطع نفسه (بعد دمج؛ U100) */
export const markTitle = (m) => `${MARK_LABEL[m.kind]}${m.state === 'moved' ? ' — قد تكون انتقلت: تحقق أنها على المقطع الصحيح' : ''}${m.others ? ` (ومعها ${formatCount(m.others, COUNT.markOther)} على المقطع نفسه)` : ''}`;

// ---- البنية والقفز ----
/** معاينة الدمج قبل التطبيق. @param {{ n: number }} a @param {{ n: number }} b @param {{ startMs: number, endMs: number, text: string }} merged @param {(ms: number) => string} tc */
export const mergePreview = (a, b, merged, tc) => `سيُدمج المقطع ${a.n} مع ${b.n}: ${tc(merged.startMs)} ← ${tc(merged.endMs)}، والنصان سطرًا بعد سطر (${merged.text.split('\n').length} أسطر). التراجع يعيدهما.`;

/** معاينة الشطر عند المؤشر. @param {number} n @param {string} head @param {string} tail */
export const splitPreview = (n, head, tail) => `سيُشطر المقطع ${n} عند المؤشر: «${oneLine(head)}» | «${oneLine(tail)}»، والزمن بنسبة النص. التراجع يعيده.`;

const oneLine = (s) => {
  const flat = s.replace(/\s*\n\s*/g, ' ');
  return flat.length > 28 ? `${flat.slice(0, 27)}…` : flat;
};

/** نتيجة القفز (R56). @param {{ ok: boolean, via?: 'open' | 'new', code?: string }} r @param {string} at @param {(code: string) => string} message */
export function seekResult(r, at, message) {
  if (!r.ok) return { tone: 'danger', text: `تعذّر الانتقال في الفيديو: ${message(r.code)}` };
  return r.via === 'open'
    ? { tone: 'success', text: `انتقل تبويب الفيديو المفتوح إلى ${at}.` }
    : { tone: 'success', text: `لا تبويب مفتوح لهذا الفيديو، فُتح في تبويب جديد عند ${at}.` };
}

/**
 * نتيجة الحفظ عبر saveFile (R65) رسالةً عابرة: أين حُفظ الملف بحسب الوضع، أو الرجوع إلى التنزيل المعتاد، أو السبب.
 * @param {{ ok: boolean, mode?: string, code?: string }} r @param {string} name
 * @param {{ mode: string, folder: string } | undefined} location @param {(code: string) => string} message
 */
export function saveMessage(r, name, location, message) {
  // الاسم معزول LTR: شرطة أول معرّف مثل «-xyz…» لا تنتقل إلى آخره (تدقيق 7a66f91، U49، GEM-022b).
  const file = ltrInline(name);
  if (!r.ok) return { tone: r.code === 'SV_CANCELLED' ? 'info' : 'danger', text: `${file}: ${message(r.code)}` };
  if (r.mode === 'blob') return { tone: 'info', text: `${file}: ${message('SV_FALLBACK_BLOB')}` };
  if (r.pending) return { tone: 'info', text: `${file}: ${message('SV_PENDING')}` };
  // «مجلد X داخل التنزيلات» لا «التنزيلات/X»: الشرطة بين عربي ولاتيني تنقلب في اتجاه النص.
  if (r.mode === 'subfolder') return { tone: 'success', text: `حُفظ ${file} في مجلد ${location?.folder ?? 'Tarjuman'} داخل التنزيلات.` };
  if (r.mode === 'ask') return { tone: 'success', text: `حُفظ ${file} حيث اخترت.` };
  return { tone: 'success', text: `حُفظ ${file} في مجلد التنزيلات.` };
}

/** طُلبت خانة فارغة فعُرضت النشطة. @param {number | null} requested @param {number} opened */
export const slotFallback = (requested, opened) => `الترجمة ${requested} فارغة، فعُرضت الترجمة ${opened}.`;

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
  if (r.matched) lines.push({ tone: 'success', text: 'مطابق للأصل' });
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
