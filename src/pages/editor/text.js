// نصوص المحرّر (مواصفة التصميم الأولى §١١ و§١٦): النطاق قبل الفعل وبعده، والعدّ بقواعد لغة الواجهة ومطابقة الصفة للمعدود، والإزاحة
// بعلامتها، وتقرير المقارنة سطورًا. دوال نقية بلا DOM؛ والنصوص في الفهرس (src/i18n/*/editor.js) وتُحسب عند الاستدعاء لا عند تحميل الوحدة.
import { joinList, t, texts } from '../../i18n/index.js';
import { languageName } from '../../ui/lang.js';
import { COUNT_FORMS, formatCount, ltrInline, offsetInline } from '../../ui/format.js';
import { absoluteTime } from '../library/model.js';

const MAX_LIST = 8;
const FSI = String.fromCodePoint(0x2068);
const PDI = String.fromCodePoint(0x2069);

/** اسم يكتبه المستخدم (قد يكون إنجليزيًا) معزولًا اتجاهًا داخل جملة، فلا تنقلب علامات ترقيمه (تدقيق 7a66f91، U27). @param {string} s */
export const isolate = (s) => `${FSI}${s}${PDI}`;

// صيغ العدّ بصيغة formatCount من الفهرس باللغة الحالية. «error» للعدّ المستقل في رأس اللوحة، و«errorToFix» مفعولًا به لـ«صحّح».
export const COUNT = texts('editor.count');

/** «1، 2، 3…» بحد ثمانية أرقام (فاصل اللغة). @param {number[]} ns */
export const numberList = (ns) => joinList(ns.slice(0, MAX_LIST)) + (ns.length > MAX_LIST ? '…' : '');

/** مقدار بالثواني بخانة عشرية على الأقل وثلاث على الأكثر: 0.5 و1.0 و1.25 و0.001. @param {number} ms */
export function seconds(ms) {
  const v = Math.abs(ms) / 1000;
  const s = v.toFixed(3).replace(/0+$/, '');
  return s.endsWith('.') ? `${s}0` : s;
}

/** مفعول «صحّح»: «صحّح 3 أخطاء توقيت أولًا» (§١٦.٣). @param {number} n */
export const errorsToFix = (n) => formatCount(n, COUNT.errorToFix);

/** «3 أخطاء · 5 تحذيرات»، أو «لا مشكلات». @param {{ errors: number, warnings: number }} r */
export function issuesSummary({ errors, warnings }) {
  if (!errors && !warnings) return t('editor.issues.none');
  return [errors ? formatCount(errors, COUNT.error) : null, warnings ? formatCount(warnings, COUNT.warning) : null].filter(Boolean).join(' · ');
}

/** «لديك 12 تغييرًا غير محفوظ» بمطابقة الصفة في العربية: «تغييران غير محفوظين» و«3 تغييرات غير محفوظة». @param {number} n */
export const unsavedSentence = (n) => t('editor.unsaved.sentence', { n, count: formatCount(n, COUNT_FORMS.change) });

/**
 * مؤشر الرأس: «تغييرات غير محفوظة (12)»، أو «زمن غير صالح» لمسودة زمن وحدها (كانت «محفوظ»؛ U27)، أو «محفوظ» (الرمز من الشارة
 * لا من نص بخط آخر).
 * @param {number} n @param {boolean} dirty @param {number} [drafts] حقول زمن بنص لم يُقرأ
 */
export const saveStatus = (n, dirty, drafts = 0) => (dirty ? t('editor.status.unsaved', { n }) : drafts ? t('editor.status.invalidTime') : t('editor.status.saved'));

/**
 * ما يضيع بالمغادرة أو التبديل: التغييرات غير المحفوظة، وحقول الزمن بنص غير صالح لم يُعتمد. كانت مسودة الزمن وحدها تُكتب
 * «لديك 0 تغيير غير محفوظ» (تدقيق 7a66f91، U27).
 * @param {number} n @param {number} drafts
 */
export function pendingSentence(n, drafts) {
  const field = drafts ? t('editor.unsaved.field', { n: drafts, count: formatCount(drafts, COUNT.field) }) : '';
  if (!n && drafts) return t('editor.unsaved.fieldsOnly', { field });
  return drafts ? t('editor.unsaved.both', { changes: unsavedSentence(n), field }) : unsavedSentence(n);
}

/**
 * تلميح اختصار بحسب المنصة: «⌘Z» و«⇧⌘Z» في ماك، و«Ctrl+Z» و«Ctrl+Shift+Z» في غيره (U27: كانت برموز ماك وحدها). معزولًا LTR،
 * فلا يظهر «(F⌘)» داخل جملة عربية (⌘ و⇧ محايدان يأخذان اتجاه الفقرة؛ تحقق Fable للتصميم، ت-٨).
 * @param {string} key الحرف @param {{ mac: boolean, shift?: boolean }} o
 */
export const keyHint = (key, { mac, shift = false }) => ltrInline(mac ? `${shift ? '⇧' : ''}⌘${key}` : `Ctrl+${shift ? 'Shift+' : ''}${key}`);

/** ماك أم لا، من النافذة (userAgentData ثم platform). @param {Window | null | undefined} win */
export const isMac = (win) => /mac/i.test(String(win?.navigator?.userAgentData?.platform ?? win?.navigator?.platform ?? ''));

/**
 * تسمية خيار النطاق: «المقطع 57» و«المحددة (3)» و«الملف كله».
 * @param {'cue' | 'selection' | 'all'} kind @param {{ activeN?: number | null, selected?: number }} ctx
 */
export function scopeOption(kind, { activeN = null, selected = 0 } = {}) {
  if (kind === 'cue') return activeN === null ? t('editor.scope.cue') : t('editor.scope.cueN', { n: activeN });
  if (kind === 'selection') return selected ? t('editor.scope.selectionN', { n: selected }) : t('editor.scope.selection');
  return t('editor.scope.all');
}

/**
 * موضوع الفعل في الجملة: «المقطع 57» و«3 مقاطع» و«الملف كله (2140 مقطعًا)».
 * @param {'cue' | 'selection' | 'all'} kind @param {{ activeN?: number | null, selected?: number, total: number }} ctx
 */
export function scopeTarget(kind, { activeN = null, selected = 0, total }) {
  if (kind === 'cue') return t('editor.scope.cueTarget', { n: activeN });
  if (kind === 'selection') return selected === 1 ? t('editor.scope.selectedOne') : formatCount(selected, COUNT_FORMS.cue);
  return t('editor.scope.allTarget', { count: formatCount(total, COUNT_FORMS.cue) });
}

/**
 * سطر ما قبل التطبيق: «سيُؤخَّر 3 مقاطع 0.5 ث (تظهر لاحقًا)»، وما بعده: «أُخِّر 3 مقاطع 0.5 ث».
 * @param {string} target من scopeTarget @param {number} deltaMs موقّع @param {'before' | 'after'} when
 */
export function shiftSentence(target, deltaMs, when) {
  const later = deltaMs > 0;
  const key = `editor.shift.${when}${later ? 'Later' : 'Earlier'}`;
  return t(key, { target, sec: seconds(deltaMs) });
}

/** التنبيه قبل نقل الملف كله والإزاحة مفعّلة (عقد التوقيت §٣). @param {number} offsetMs */
export const offsetNotice = (offsetMs) => t('editor.offset.notice', { off: offsetInline(offsetMs) });

/** سطر الإزاحة الثابت. @param {number} offsetMs */
export const offsetLine = (offsetMs) => t('editor.offset.line', { off: offsetInline(offsetMs) });

/**
 * اسم الوصول لخانة في محدد خانة التحرير: «الترجمة 2، قيد التحرير، النشطة في المشغّل» أو «الترجمة 3، فارغة».
 * @param {{ n: number, filled: boolean, active: boolean }} slot active هنا النشطة في المشغّل
 * @param {{ editing: boolean }} o
 */
export function editSlotLabel(slot, { editing }) {
  if (!slot.filled) return t('common.slot.labelEmpty', { n: slot.n });
  return joinList([t('common.slot.label', { n: slot.n }), editing ? t('editor.slot.editing') : null, slot.active ? t('editor.slot.activeInPlayer') : null].filter(Boolean));
}

/**
 * سطر تحت الرأس يفرّق خانة التحرير عن النشطة (R43): الحفظ هنا لا يغيّر ما يُعرض في المشغّل.
 * @param {number} editing @param {number | null} active @param {string | null} name
 */
export function activeSlotLine(editing, active, name) {
  const who = name ? t('editor.slot.whoNamed', { n: editing, name: isolate(name) }) : t('editor.slot.who', { n: editing });
  if (editing === active) return t('editor.slot.lineActive', { who });
  return t('editor.slot.lineOther', { who, active });
}

/**
 * اسم مرجع المقارنة في قائمته: نوع المسار ووضعه وأجزاؤه وتاريخ تصديره، قصيرًا بدل اسم الملف الطويل.
 * @param {{ trackKey: string, mode: string, parts: unknown[] | null, createdAt: string } | null} fp
 */
export function refLabel(fp) {
  if (!fp) return t('editor.ref.unsaved');
  const kind = fp.trackKey.endsWith('|asr') ? t('editor.ref.kindAuto') : t('editor.ref.kindManual');
  const mode = fp.mode === 'long' ? t('editor.ref.modeLong') : t('editor.ref.modeNormal');
  // التاريخ بصيغة المحفوظات ونافذة الأيقونة وبتوقيت الجهاز، لا ISO خامًا بتوقيت UTC (تدقيق Fable، UX-07)، و«جزآن» لا «2 أجزاء».
  const parts = fp.parts ? ` · ${formatCount(fp.parts.length, COUNT.part)}` : '';
  return `${kind} · ${mode}${parts} · ${absoluteTime(fp.createdAt)}`;
}

/**
 * خيار العمود المرجعي: مسار الأصل باسم لغته الفعلية («الإنجليزية»، «اليابانية»؛ AA3) أو «الأصل» بلا لغة، أو «الترجمة 3 — مراجعة».
 * @param {'en' | number} v @param {string | null} [name] @param {string | null} [lang] لغة مسار الأصل
 */
export const refOptionLabel = (v, name = null, lang = null) => (v === 'en'
  ? (lang && languageName(lang)) || t('editor.ref.original')
  : name ? t('editor.ref.slotNamed', { n: v, name: isolate(name) }) : t('common.slot.label', { n: v }));

// ---- العلامات (R53): «أعود إليه» و«راجعته»، والتبديل بينهما من زر الصف ----
export const MARK_LABEL = texts('editor.markLabel');
/** ما بعد العلامة الحالية في التبديل: بلا ← أعود إليه ← راجعته ← بلا. @param {'todo' | 'done' | null} kind */
export const nextMark = (kind) => (kind === null ? 'todo' : kind === 'todo' ? 'done' : null);

/** اسم زر العلامة بما سيفعله. @param {number} n @param {{ kind: 'todo' | 'done' } | null} mark */
export function markActionLabel(n, mark) {
  const next = nextMark(mark?.kind ?? null);
  return next ? t('editor.mark.set', { n, label: MARK_LABEL[next] }) : t('editor.mark.remove', { n });
}

/**
 * شارة الصف: أيقونة flag لـ«أعود إليه» وcheck لـ«راجعته» (SVG لا رمز نصي يسقط إلى خط نظام؛ تدقيق 5fedcb9، CL-010)، و«؟» لعلامة
 * قد تكون انتقلت.
 * @param {{ kind: 'todo' | 'done', state: string }} m @returns {{ icon: 'flag' | 'check', suffix: string }}
 */
export const markBadge = (m) => ({ icon: m.kind === 'todo' ? 'flag' : 'check', suffix: m.state === 'moved' ? t('editor.mark.movedSuffix') : '' });

/** @param {{ kind: 'todo' | 'done', state: string, others?: number }} m others علامات أخرى على المقطع نفسه (بعد دمج؛ U100) */
export const markTitle = (m) => `${MARK_LABEL[m.kind]}${m.state === 'moved' ? t('editor.mark.movedNote') : ''}${m.others ? t('editor.mark.others', { count: formatCount(m.others, COUNT.markOther) }) : ''}`;

// ---- البنية والقفز ----
/** معاينة الدمج قبل التطبيق. @param {{ n: number }} a @param {{ n: number }} b @param {{ startMs: number, endMs: number, text: string }} merged @param {(ms: number) => string} tc */
export const mergePreview = (a, b, merged, tc) => t('editor.structure.merge', {
  a: a.n, b: b.n, range: t('editor.range', { from: tc(merged.startMs), to: tc(merged.endMs) }), lines: formatCount(merged.text.split('\n').length, COUNT.line),
});

/** معاينة الشطر عند المؤشر. @param {number} n @param {string} head @param {string} tail */
export const splitPreview = (n, head, tail) => t('editor.structure.split', { n, head: oneLine(head), tail: oneLine(tail) });

const oneLine = (s) => {
  const flat = s.replace(/\s*\n\s*/g, ' ');
  return flat.length > 28 ? `${flat.slice(0, 27)}…` : flat;
};

/** نتيجة القفز (R56). @param {{ ok: boolean, via?: 'open' | 'new', code?: string }} r @param {string} at @param {(code: string) => string} message */
export function seekResult(r, at, message) {
  if (!r.ok) return { tone: 'danger', text: t('editor.seek.failed', { reason: message(r.code) }) };
  return r.via === 'open'
    ? { tone: 'success', text: t('editor.seek.opened', { at }) }
    : { tone: 'success', text: t('editor.seek.newTab', { at }) };
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
  if (r.mode === 'subfolder') return { tone: 'success', text: t('editor.save.subfolder', { file, folder: location?.folder ?? 'Tarjuman' }) };
  if (r.mode === 'ask') return { tone: 'success', text: t('editor.save.ask', { file }) };
  return { tone: 'success', text: t('editor.save.downloads', { file }) };
}

/** طُلبت خانة فارغة فعُرضت النشطة. @param {number | null} requested @param {number} opened */
export const slotFallback = (requested, opened) => t('editor.slot.fallback', { requested, opened });

/** مدة المقطع بالثواني بخانة عشرية: «2.7». @param {number} ms */
export const durationText = (ms) => (Math.round(ms / 100) / 10).toFixed(1);

/**
 * تقرير المقارنة سطورًا بنبرتها (§١٦.٣): «مطابق للأصل ✓»، «3 مقاطع ناقصة: 57، 58، 201»…
 * @param {import('../../core/model/tracks.js').ComparisonReport | null} r
 * @returns {{ tone: 'success' | 'info' | 'warning', text: string }[]}
 */
export function comparisonLines(r) {
  if (!r || r.fingerprintId === null) return [{ tone: 'info', text: t('editor.cmp.none') }];
  const lines = [];
  if (r.matched) lines.push({ tone: 'success', text: t('editor.cmp.matched') });
  lines.push({ tone: r.countSource === r.countTarget ? 'info' : 'warning', text: t('editor.cmp.count', { target: r.countTarget, source: r.countSource }) });
  if (r.numbering === 'different') lines.push({ tone: 'warning', text: t('editor.cmp.numbering') });
  if (r.missing.length) lines.push({ tone: 'warning', text: t('editor.cmp.missing', { n: r.missing.length, count: formatCount(r.missing.length, COUNT_FORMS.cue), list: numberList(r.missing) }) });
  if (r.extra.length) lines.push({ tone: 'warning', text: t('editor.cmp.extra', { list: numberList(r.extra) }) });
  if (r.drift.length) lines.push({ tone: 'warning', text: t('editor.cmp.drift', { count: formatCount(r.drift.length, COUNT_FORMS.cue, { case: 'gen' }) }) });
  if (r.empty.length) lines.push({ tone: 'warning', text: t('editor.cmp.empty', { list: numberList(r.empty) }) });
  if (r.noArabic.length) lines.push({ tone: 'warning', text: t('editor.cmp.untranslated', { list: numberList(r.noArabic) }) });
  return lines;
}

/**
 * لماذا لا تُتاح استعادة التوقيت (§١١.٢)، أو null إن أُتيحت.
 * @param {import('../../core/model/tracks.js').ComparisonReport | null} r
 */
export function restoreUnavailable(r) {
  if (!r || r.fingerprintId === null) return t('editor.cmp.restoreNoRef');
  if (r.restoreTimingAvailable) return null;
  if (r.countSource !== r.countTarget) return t('editor.cmp.restoreCount', { target: r.countTarget, source: r.countSource });
  return t('editor.cmp.restoreNumbering');
}
