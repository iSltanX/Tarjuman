// نصوص أدوات الشريط (مواصفة التصميم الأولى §٥.٢ و§٦ و§١٦.١) ودوالها النقية: التلميحات بالخطوة الحالية، ومعنى
// الإزاحة بالكلمات، وملخص المقارنة في سطر، وقراءة الثواني من حقل. أرقام لاتينية، والإزاحة بعلامتها (formatOffset).
import { t, texts, joinList } from '../../i18n/index.js';
import { COUNT_FORMS, formatCount, formatTimecode, isolate, ltrInline, offsetInline } from '../../ui/format.js';
import { languageName as sharedLanguageName } from '../../ui/lang.js';
import { trackDescription } from '../../ui/track.js';

/** نصوص الأدوات من الفهرس (player.controls) باللغة الحالية عند كل قراءة. */
export const LABELS = texts('player.controls');

const T = (key, params) => t(`player.controls.${key}`, params);

/** @type {Intl.DisplayNames | null} */
/**
 * اسم اللغة بالعربية من رمز المسار الفعلي بلهجته إن عُرفت (en ← الإنجليزية، en-GB ← الإنجليزية (المملكة المتحدة))، من الدالة
 * المشتركة (src/ui/lang.js)؛ وما لا يعرفه المتصفح يبقى رمزه، وبلا رمز أو برمز غير محدد null.
 * @param {string | null | undefined} lang
 * @returns {string | null}
 */
export const languageName = (lang) => sharedLanguageName(lang);

/**
 * تسمية وضع «الترجمة فوق الأصل» باسم لغة الأصل الفعلية: الظاهرة بلغتها الأساسية («فوق الإنجليزية»)، واسم الوصول الكامل
 * بلهجتها («الترجمة فوق الإنجليزية (المملكة المتحدة)»)؛ وبلا أصل «فوق الأصل».
 * @param {string | null | undefined} lang
 * @returns {{ short: string, aria: string }}
 */
export function dualLabels(lang) {
  const full = languageName(lang);
  if (!full) return { short: LABELS.segDual, aria: LABELS.modeDual };
  const base = languageName(String(lang).trim().split(/[-_]/)[0]) ?? full;
  return { short: T('dualShort', { name: base }), aria: T('dualAria', { name: full }) };
}

/**
 * سطر المسار الملتقط في قائمة التحميل بالوصف الواحد مع نافذة الإضافة (ح-57، src/ui/track.js): «الإنجليزية · يدوية · 412 مقطعًا»
 * (اسم لغته الفعلي، ونوعه، وعدد مقاطعه)؛ والمترجم آليًا من يوتيوب بلغة أصله: «العربية، ترجمها يوتيوب آليًا عن الإنجليزية · 412 مقطعًا» (ق٢).
 * @param {{ lang: string, kind: 'manual' | 'asr', via?: string | null, cueCount: number }} t
 * @param {{ state?: 'captured' | 'saved' | null }} [o] حاله في آخره («محفوظة» للأصل المحفوظ من تنزيل سابق)
 */
export const trackLine = (t, { state = null } = {}) => trackDescription(t, { count: t.cueCount, state });

/**
 * سطر لغات الفيديو الأخرى في قائمة التحميل (قرار سلطان 2026-11-07 بعد لقطات AA4): عددها حين تُعرف قائمة مسارات الفيديو، ثم خطوات
 * اختيارها من يوتيوب؛ وبلا قائمة معروفة الخطوات وحدها. «أخرى» بعد مسار ملتقط، وبلا التقاط «في هذا الفيديو 13 لغة».
 * وcounted: false حين قيل العدد في رسالة الحالة (ccLanguagesLine)، فالخطوات وحدها.
 * @param {number | null} n عدد اللغات المختلفة التي لم تُلتقط، وnull حين لا تُعرف
 * @param {{ other?: boolean, counted?: boolean }} [o]
 */
export function otherLanguagesLine(n, { other = true, counted = true } = {}) {
  if (n === null || n < 1) return T('otherPickNone', { steps: LABELS.pickSteps });
  if (!counted) return T('pickWhich', { n, steps: LABELS.pickSteps });
  const what = T('otherWhat', { n, other, count: formatCount(n, COUNT_FORMS.language) });
  return T('otherInVideo', { n, what, steps: LABELS.pickSteps });
}

/**
 * سطر لغات الفيديو الأخرى بعد مسار ملتقط في سطر واحد (ح-61): «في هذا الفيديو 62 لغة أخرى.»، وطريقة الاختيار خلف «كيف؟».
 * @param {number} n عدد اللغات الأخرى (1 فأكثر)
 */
export const otherSummaryLine = (n) => T('otherSummary', { what: T('otherWhat', { n, other: true, count: formatCount(n, COUNT_FORMS.language) }) });

/**
 * رسالة القائمة بلا التقاط ولغات الفيديو معروفة (القرار ٢٩): «في هذا الفيديو 3 لغات: فعّل ترجمة يوتيوب (CC) واختر إحداها، فتظهر
 * في هذه القائمة.» بدل CT_NOT_CAPTURED وعددٍ خلف «لماذا؟». @param {number} n
 */
export const ccLanguagesLine = (n) => T('ccLanguages', { n, count: formatCount(n, COUNT_FORMS.language) });

/**
 * سطر الترجمة في قائمتها: «العربية · 412 مقطعًا» باسم لغتها (و«· معدّلة» حين عُدّلت)، و«لغة غير محددة» بلا لغة.
 * @param {number} count @param {boolean} edited @param {string | null} [lang]
 */
export const translationLine = (count, edited, lang = null) => `${(lang && languageName(lang)) || LABELS.translationUnknown} · ${formatCount(count, COUNT_FORMS.cue)}${edited ? ` · ${LABELS.edited}` : ''}`;

/** تلميح الزر مع حالته: «تحميل الأصل (SRT) · المسار جاهز»؛ وبلا حالة الاسم وحده. @param {string} name @param {string | null} state */
export const withState = (name, state) => (state ? `${name} · ${state}` : name);

/** «عند 12:34»: اللحظة المرجعية للمزامنة بالجملة. @param {string} time */
export const syncAt = (time) => T('syncAt', { time });
/** الرسالة العابرة بعد تبديل الترجمة: «الترجمة 2». @param {number} n */
export const slotToast = (n) => T('slotToast', { n });
/** @param {number} n رقم المقطع */
export const markToast = (n) => T('markToast', { n });
/** «عُلّم للمراجعة: مقطعان.» (ف6). @param {number} n */
export const markedAmbiguousText = (n) => T('markedAmbiguous', { count: formatCount(n, COUNT_FORMS.cue) });
/** @param {number} ms «الإزاحة −3.2 ث» */
export const offsetToast = (ms) => T('offsetToast', { offset: offsetInline(ms) });
/**
 * «وضع العرض: الترجمة فوق الإنجليزية» (الفكرة ١٠): رسالة أمر تبديل الوضع، بتسميات قائمة «الترجمة» نفسها.
 * @param {'ar' | 'dual' | 'off'} mode @param {string | null} [lang] لغة الأصل لوضع «فوق الأصل»
 */
export const modeToast = (mode, lang = null) => T('modeToast', { mode: mode === 'dual' ? dualLabels(lang).aria : mode === 'off' ? LABELS.modeOff : LABELS.modeAr });
/**
 * «نُزّل VIDEOID.en.manual.normal.srt» (رمز النجاح SVG بجانبه في القائمة): الاسم معزول LTR، فشرطة أول معرّف مثل «-xyz…» لا
 * تنتقل إلى آخره (تدقيق 7a66f91، U49)؛ وسطر النتيجة يرسمه عنصرًا ذريًا (menus.js richText) فلا تنقلب أجزاؤه إن انكسر سطره.
 * @param {string} name
 */
export const downloadedLine = (name) => T('downloadedLine', { name: ltrInline(name) });
/** «نُزّل 3 أجزاء». @param {string} parts عدد الأجزاء بكلماته */
export const downloadedParts = (parts) => T('downloadedParts', { parts });
/** «جزآن»، «3 أجزاء»، «11 جزءًا» بعد «نُزّل». @param {number} n */
export const partsWord = (n) => T('partsWord', { n });

/** @param {number} n «سيُستبدل 12 تعديلًا يدويًا» (والمفرد والمثنى بصيغتيهما). */
export const editsLine = (n) => T('editsLine', { n });

/** @param {number} conflicts ما يأخذه الملف الجديد لتعارضه مع التعديلات */
export const keptLine = (conflicts) => (conflicts ? T('keptConflicts', { n: conflicts }) : T('keptAll'));

/**
 * «الاسم يشير إلى فيديو آخر · ‹العنوان مقصوصًا إلى 40 محرفًا›». العنوان معزول (FSI…PDI) كما في المحفوظات، فلا تنقلب كلمات
 * «10 Tips for Beginners» ولا تنتقل «?» إلى أوله (تدقيق 7a66f91، U49، DS-TJ-46). @param {string | null} title
 */
export function nameOtherLine(title) {
  const text = String(title ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return LABELS.nameOther;
  const chars = Array.from(text);
  return `${LABELS.nameOther} · ${isolate(chars.length > 40 ? `${chars.slice(0, 39).join('').trimEnd()}…` : text)}`;
}

/**
 * الاستبدال يمحو النسخة السابقة المحفوظة الآن، ولو كانت من خانة أخرى (تدقيق 7a66f91، U76): تُسمّى خانتها، والسطر نفسه في حوار
 * المحفوظات (library/model.js previousLostText).
 * @param {number} from خانة السابقة @param {number} target الخانة الهدف
 */
export const previousLostLine = (from, target) => T('previousLost', { from: from === target ? T('previousFromThis') : T('previousFromSlot', { n: from }) });

/** عدد المحارف بأرقام مجمّعة: «18,400 محرف»، «12 محرفًا»، «5 محارف». @param {number} n */
export const charsText = (n) => T('chars', { n, grouped: n.toLocaleString('en-US') });

/** «ملف طويل: 427 مقطعًا.» (ف4، وسطر واحد منذ ح-61). @param {{ count: number, chars: number | null }} f */
export const longFileLine = (f) => T('longFileShort', { count: formatCount(f.count, COUNT_FORMS.cue) });
/**
 * تفصيل «ملف طويل» خلف «لماذا؟» (ح-61): «طوله 32,140 حرفًا. إن عجز نموذجك عن ملف بهذا الطول فقسّمه من «تقسيم الملفات الطويلة» أدناه.»
 * @param {{ count: number, chars: number | null }} f
 */
export const longFileWhy = (f) => T('longFileWhy', { chars: f.chars === null ? null : charsText(f.chars) });

/** صف جزء في التقسيم الاحتياطي: «1 · 1–200 · 18,400 محرف». @param {{ index: number, from: number, to: number, chars: number }} p */
export const partRow = (p) => T('partRow', { index: p.index, from: p.from, to: p.to, chars: charsText(p.chars) });

/** اسم الوصول لخانة ترجمة: «الترجمة 2، نشطة» أو «الترجمة 3، فارغة». @param {{ n: number, active: boolean, filled: boolean }} s */
export const slotLabel = (s) => t(s.active ? 'common.slot.labelActive' : s.filled ? 'common.slot.label' : 'common.slot.labelEmpty', { n: s.n });

/** استبدال خانة بالرفع: «استبدال الترجمة 2، نشطة» (والعنوان باسمها إن سُمّيت). @param {{ n: number, active: boolean, filled: boolean, name?: string | null }} s */
export const replaceSlotLabel = (s) => T('replaceSlot', { label: slotLabel(s) });
/** @param {{ n: number, active: boolean, filled: boolean, name?: string | null }} s */
export const replaceSlotTitle = (s) => (s.name ? T('replaceSlotNamed', { label: slotLabel(s), name: isolate(s.name) }) : replaceSlotLabel(s));

/** «راجع بقية الملاحظات (2) في المحرّر.» @param {number} n */
export const moreNotesLine = (n) => T('moreNotes', { n });

/**
 * سطر يدل على «أكمل الناقص» في نافذة الإضافة حين تنقص الترجمة مقاطع (ف1). نص بلا زر ولا رابط: المشغّل للمشاهدة (§٦.٥)،
 * ولا رابط منه إلى صفحات الإضافة.
 * @param {{ fingerprintId?: string | null, missing?: number[] } | null | undefined} cmp
 */
export const completeHintLine = (cmp) => (cmp?.fingerprintId && cmp.missing?.length ? T('completeHint') : null);

/** خيار «إكمال N» في «حفظ في» (ف3). @param {number} n */
export const completeOptionText = (n) => T('completeOption', { n });
/** @param {number} n */
export const completeOptionLabel = (n) => T('completeOptionLabel', { n });
/**
 * سطر ما يضيفه الإكمال وما يبقى بعده (ف3).
 * @param {{ n: number, adds: number, remaining: number, renumbered?: boolean }} c
 */
export const completeLine = (c) => [
  T('completeLine', { n: c.n, adds: formatCount(c.adds, COUNT_FORMS.cue, { case: 'acc' }), addsN: c.adds }),
  c.remaining ? T('completeRemaining', { n: c.remaining, count: formatCount(c.remaining, COUNT_FORMS.cue) }) : T('completeDone'),
  c.renumbered ? T('completeRenumbered') : null,
].filter(Boolean).join(' ');

/**
 * الخطوة بالثواني بلا أصفار زائدة: 500 ← «0.5»، و1000 ← «1»، و1500 ← «1.5».
 * @param {number} ms
 */
export const stepSeconds = (ms) => String(Math.round(ms / 100) / 10);

/** @param {number} stepMs */
export const minusTip = (stepMs) => T('minusTip', { step: stepSeconds(stepMs) });
/** @param {number} stepMs */
export const plusTip = (stepMs) => T('plusTip', { step: stepSeconds(stepMs) });

/** @param {number} ms */
const sign = (ms) => (Math.round(ms / 100) === 0 ? 0 : Math.sign(ms));

/** @param {number} ms «الإزاحة: +0.5 ث (تظهر الترجمة لاحقًا). اضغط للخيارات» */
export function badgeTip(ms) {
  const s = sign(ms);
  return T(s > 0 ? 'badgeLater' : s < 0 ? 'badgeEarlier' : 'badgeZero', { offset: offsetInline(ms) });
}

/** @param {number} ms التلميح العابر بعد ± لثانية: «+1.0 ث · تظهر لاحقًا» */
export function nudgeFlash(ms) {
  const s = sign(ms);
  return T(s > 0 ? 'nudgeLater' : s < 0 ? 'nudgeEarlier' : 'nudgeZero', { offset: offsetInline(ms) });
}

/** @param {number} absMs مقدار موجب: «بنصف ثانية»، «بثانية واحدة»، «بثانيتين»، وإلا «بـ1.5 ث». */
const amountWords = (absMs) => T('amount', { tenths: Math.round(absMs / 100) });

/** @param {number} ms معنى الإزاحة بالكلمات تحت قيمتها الكبيرة في قائمة التوقيت. */
export function offsetMeaning(ms) {
  const s = sign(ms);
  if (s === 0) return T('meaningZero');
  return T(s > 0 ? 'meaningLater' : 'meaningEarlier', { amount: amountWords(Math.abs(ms)) });
}

const LIST_MAX = 6;
/** @param {number[]} ns «57، 58، 201» وبعد ستة أرقام «…» (الفاصل من لغة الواجهة) */
const listOf = (ns) => joinList([...ns.slice(0, LIST_MAX), ...(ns.length > LIST_MAX ? ['…'] : [])]);

/**
 * ملخص المقارنة في سطر (§٦.٢): «مطابق للأصل ✓» أو «3 مقاطع ناقصة: 57، 58، 201» أو «توقيت مختلف في 12 مقطعًا»
 * أو «لا بصمة للمقارنة…». tone=warn حين تكشف المقارنة نقصًا أو زيادة أو انحرافًا أو مقاطع بلا ترجمة.
 * @param {import('../../core/model/tracks.js').ComparisonReport | null | undefined} cmp
 * @returns {{ tone: 'ok' | 'warn' | 'info', text: string }}
 */
export function comparisonSummary(cmp) {
  if (!cmp || !cmp.fingerprintId) return { tone: 'info', text: T('cmpNoFingerprint') };
  const parts = [];
  const count = (n) => formatCount(n, COUNT_FORMS.cue);
  if (cmp.missing.length) parts.push(`${T('missingCues', { n: cmp.missing.length, count: count(cmp.missing.length) })}: ${listOf(cmp.missing)}`);
  if (cmp.extra.length) parts.push(`${T('extraCues', { n: cmp.extra.length, count: count(cmp.extra.length) })}: ${listOf(cmp.extra)}`);
  if (cmp.drift.length) parts.push(T('driftCues', { n: cmp.drift.length, count: count(cmp.drift.length) }));
  const untranslated = [...new Set([...cmp.empty, ...cmp.noArabic])].length;
  if (untranslated) parts.push(T('untranslatedCues', { count: count(untranslated) }));
  // معاينة الرفع بالمحاذاة (FA-04): ملف أُعيد ترقيمه يُقال إنه قورن بتوقيته، فلا يُظن النقص من آخره.
  if (cmp.renumbered) parts.push(T('cmpRenumbered'));
  else if (!parts.length && cmp.numbering === 'different') parts.push(T('cmpNumbering'));
  if (!parts.length) return { tone: cmp.matched ? 'ok' : 'warn', text: cmp.matched ? T('cmpMatched') : T('cmpDiffers') };
  return { tone: 'warn', text: parts.join(' · ') };
}

/** @param {number} n */
export const cueCount = (n) => formatCount(n, COUNT_FORMS.cue);

/** زمن مختصر للرسائل: «12:40» أو «1:02:05» (لا ملي ثوانٍ). @param {number} ms */
export function shortTime(ms) {
  const [h, m, s] = formatTimecode(ms).split(',')[0].split(':');
  return Number(h) ? `${Number(h)}:${m}:${s}` : `${Number(m)}:${s}`;
}

// الأرقام الهندية العربية (٠–٩) والفارسية (۰–۹) تُبنى من رموزها لا حروفًا في الشيفرة.
const DIGITS = Object.fromEntries([0x0660, 0x06f0].flatMap((base) => Array.from({ length: 10 }, (_, i) => [String.fromCodePoint(base + i), String(i)])));

/**
 * ثوانٍ من نص الحقل: «1.5» و«-2.3» و«+4» و«−0.5» (ناقص الطباعة) و«٢٫٥» (أرقام وفاصلة عربية). غير الصالح null.
 * @param {string} raw
 * @returns {number | null}
 */
export function parseSeconds(raw) {
  const s = String(raw ?? '')
    .replace(/[\u0660-\u0669\u06f0-\u06f9]/g, (d) => DIGITS[d])
    .replace(/[\u066b,]/g, '.')
    .replace(/[−–]/g, '-')
    .replace(/[\s\u200e\u200f\u061c]/g, '');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s)) return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

/** «تراجع» مزامنة بجملة بعد تبدّل الترجمة النشطة أو استبدالها: لا يُكتب في غيرها (CX-004). */
export const syncUndoStaleLine = () => T('syncUndoStale');
