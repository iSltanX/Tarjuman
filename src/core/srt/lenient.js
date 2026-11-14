// محلّل SRT متسامح للملفات المستوردة، وهي نص غير موثوق من نموذج أو أداة خارجية. يقبل BOM وCRLF والفاصلة والنقطة
// في الأزمنة والأسطر الزائدة والترقيم غير المتسلسل، ويجرّد وسوم التنسيق نصيًا ولا يفسّر أي HTML. كل تحويل للنص يعود
// في notes، وما لا يُحلَّل يرمي TjError برقم السطر. لا يعدّل التوقيت ولا الترقيم أبدًا. (الصارم لمخرجات ترجمان: parser.js)
// ملفات TXT وMarkdown (R48) بالمحلّل نفسه: تُزال أغلفة محددة واضحة فقط بملاحظة — أسوار ``` و~~~، والتأكيد حول سطر
// الرقم أو الزمن كله (**12** و`00:00:01,000 --> …`)، والعناوين والفقرات قبل الملف وبعده. وما داخل نص المقطع يبقى حرفيًا.
// وWebVTT المرقّم كالذي يصدّره ترجمان (تحقق 2.3.0، ص-١٤) بالمحلّل نفسه أيضًا، بقواعد صيغته حين تسبق ترويستُه أول سطر زمن (VTT_*).
import { TjError, messageFor } from '../errors/index.js';
import { isBlankText, lfLines } from '../model/cue.js';
import { LIMITS } from '../model/validate.js';
import { sanitizeText } from '../text/sanitize.js';
import { ambiguousNumbers } from '../import/ambiguous.js';
import { joinList } from '../../i18n/index.js';

const MAX_CUE_NUMBER = LIMITS.maxCues * 10;
const EXCERPT_CHARS = 60;

const INDIC_DIGITS = /[٠-٩۰-۹]/g;
const HAS_INDIC = /[٠-٩۰-۹]/;
const INVISIBLE_MARKS = /[\u061C\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g;
// تُزال من النص: C0/C1. ومحارف الاتجاه والوسوم شأن sanitizeText. تبقى LRM وRLM وALM وZWNJ فهي مشروعة.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
// ما يشبه جزءًا من رأس مقطع عند أطراف الملف خطأ برقم السطر لا «شرح» يُحذف بصمت.
const CUE_FRAGMENT_RE = /^\d+$|-->|\d:\d\d:\d\d/;

const NUMBER_RE = /^\d+$/;
// يشبه سطر زمن: رقم ثم «-->» بعد timeForm، أو إشارة سالبة قبل زمن بنقطتين («-00:00:01,000 -->»)، فالسالب خطأ زمن برقم سطره لا
// نص (تدقيق 7a66f91، U38)؛ و«-5 --> 3» نثر كما كان.
const TIME_LIKE_RE = /^(?:[-\u2212](?=\d+:))?\d[^\s>]*\s*-->/;
const TIME_RE = /^(\d+):([0-5]\d):([0-5]\d)[,.](\d{3})\s*-->\s*(\d+):([0-5]\d):([0-5]\d)[,.](\d{3})$/;
const FENCE_RE = /^(?:`{3,}|~{3,})[\w+-]*$/;
// عنوان Markdown: من علامة # إلى ست ثم مسافة. «#ترجمان» بلا مسافة نص.
const HEADING_RE = /^#{1,6}\s+\S/;
// ما تكتبه النماذج في سطر الزمن بدل صيغة SRT: الفاصلة العربية «٫» و«،»، والأسهم «→» و«⟶» و«->» و«–>» و«—>» (U38).
const TIME_COMMA_RE = /[\u066B\u060C]/g;
// المسافات قبل السهم تبدأ مطابقتها من أول مسافة في متتاليتها وحده ((?<!\s)): بـ\s* في أولها كان كل موضع في متتالية مسافات
// يمسح بقيتها ثم يفشل، فسطر يبدأ بزمن ثم آلاف المسافات بحثٌ تربيعي يجمّد تبويب يوتيوب (تدقيق Fable، FA-01). المطابقات نفسها.
const ARROW_RE = /(?:(?<!\s)\s+)?(?:-->|->|[\u2013\u2014]-?>|[\u2192\u27F6])\s*/g;
// غلاف تأكيد واحد يحيط بسطر الرأس كله: ** أو __ أو * أو _ أو `.
const EMPHASIS_RE = /^(\*\*|__|\*|_|`)(\S(?:.*\S)?)\1$/;

// وسوم التنسيق التي تُجرَّد وحدها، وأوامر التموضع من نمط ASS مثل {\an8}. كل وسم HTML آخر يبقى نصًا حرفيًا.
const FORMAT_TAG_RE = /<\/?(?:i|b|u|s|em|strong|font)(?:\s[^<>]*)?>/gi;
const OVERRIDE_RE = /\{\\[^{}]*\}/g;
const LITERAL_TAG_RE = /<\/?[A-Za-z][^<>]*>/;

// WebVTT (تحقق 2.3.0، ص-١٤، بقرار سلطان: ما يصدّره ترجمان WebVTT يعود إليه بلا فساد). الملف WebVTT إن سبق أولَ سطر زمن سطرُ
// الترويسة «WEBVTT» (وحده، أو بعده مسافة ونص). وفيه وحده: الساعات في الزمن اختيارية، وإعدادات الموضع بعده تُهمل بملاحظة، وكتل
// NOTE وSTYLE وREGION تُزال بملاحظة، ووسوم الإشارة تُجرَّد كوسوم التنسيق ثم تُفك الكيانات، و«# » نص لا حدّ (لا ينتهي نص الإشارة
// إلا بسطر فارغ). والمقطع بلا رقم قبل زمنه يُرفض برسالة تخصه: ترجمان يقرأ المقاطع بأرقامها، وما يصدّره مرقّم.
const VTT_SIGNATURE_RE = /^WEBVTT(?:[ \t].*)?$/;
const VTT_TIME_RE = /^(?:(\d+):)?([0-5]\d):([0-5]\d)[,.](\d{3})\s*-->\s*(?:(\d+):)?([0-5]\d):([0-5]\d)[,.](\d{3})(?:[ \t]+(\S.*))?$/;
const VTT_BLOCK_RE = /^(?:NOTE|STYLE|REGION)(?:[ \t]|$)/;
// وسوم الإشارة سوى i وb وu (FORMAT_TAG_RE): الصنف والمتكلم واللغة والروبي، والطابع الزمني داخل النص.
const VTT_TAG_RE = /<\/?(?:c|v|lang|ruby|rt)(?:[.\s][^<>]*)?>|<(?:\d+:)?[0-5]\d:[0-5]\d\.\d{3}>/g;
const VTT_ENTITY_RE = /&(?:(amp|lt|gt|nbsp|lrm|rlm|quot|apos)|#(\d{1,7})|#[xX]([0-9A-Fa-f]{1,6}));/g;
const VTT_NAMED = Object.freeze({
  amp: '&', lt: '<', gt: '>', nbsp: String.fromCodePoint(0xa0), lrm: String.fromCodePoint(0x200e), rlm: String.fromCodePoint(0x200f), quot: '"', apos: "'",
});
/**
 * كيانات WebVTT محارفَ في مرور واحد (فـ«&amp;lt;» نصه «&lt;»): المسمّاة الشائعة، والرقمية في مدى يونيكود بلا الصفر ولا البدائل.
 * وما سواها يبقى نصًا كما ورد. @param {string} s
 */
const decodeVtt = (s) => s.replace(VTT_ENTITY_RE, (m, name, dec, hex) => {
  if (name) return VTT_NAMED[name];
  const cp = dec ? Number(dec) : Number.parseInt(hex, 16);
  return cp > 0 && cp <= 0x10ffff && (cp < 0xd800 || cp > 0xdfff) ? String.fromCodePoint(cp) : m;
});

/** أرقام لاتينية من الهندية والفارسية، لمطابقة سطور الرأس فقط؛ لا تُطبَّق على نص المقطع أبدًا. */
const latinDigits = (s) => s.replace(INDIC_DIGITS, (d) => String(d.charCodeAt(0) - (d.charCodeAt(0) >= 0x06f0 ? 0x06f0 : 0x0660)));

/** صورة السطر لمطابقة الرأس: بلا علامات اتجاه، وأرقام لاتينية، وبلا مسافات أطراف. */
const headerForm = (line) => latinDigits(sanitizeText(line).text.replace(INVISIBLE_MARKS, '')).trim();

/** صورة الرأس بعد نزع غلاف التأكيد إن أحاط بالسطر كله. */
const bare = (line) => {
  const form = headerForm(line);
  const m = EMPHASIS_RE.exec(form);
  return m ? m[2].trim() : form;
};
const wrapped = (line) => EMPHASIS_RE.test(headerForm(line));

/**
 * صورة سطر يبدأ بزمن (أرقام ثم نقطتان) لمطابقته: الفاصلة العربية «,» والأسهم «-->». وما سواه كما هو، فلا يصير «10 -> 20» أو
 * «1 → 2» شبيهًا بالزمن (مراجعة C5).
 */
const timeForm = (form) => (/^[-\u2212]?\d+:\d/.test(form)
  ? form.replace(TIME_COMMA_RE, ',').replace(ARROW_RE, (m) => (m.trim() === '-->' ? m : ' --> '))
  : form);
/**
 * السطر الفارغ: لا شيء فيه إلا مسافات ASCII وجدولة. وما سواها مما يزيله trim (U+FEFF وNBSP ومسافات يونيكود) سطرٌ خفي لا فارغ
 * (hiddenOnly)، كما تقرؤه قارئات SRT الأخرى من نص المقطع (تحقق 2.3.0، بقية ص-٢٣).
 */
const EMPTY_LINE_RE = /^[ \t]*$/;
/** حدّ لنص المقطع أينما وقع: سطر فارغ أو سياج أو عنوان (U38)، وفي WebVTT لا عنوان (ص-١٤). @param {string} line @param {boolean} [vtt] */
const textBoundary = (line, vtt = false) => {
  const t = line.trim();
  return EMPTY_LINE_RE.test(line) || FENCE_RE.test(t) || (!vtt && HEADING_RE.test(t));
};

/**
 * كتل WebVTT لا تُعرض (NOTE وSTYLE وREGION، ص-١٤): من سطر أولها بعد سطر فارغ (أو أول القطعة) حتى السطر الفارغ التالي. تُفرَّغ
 * أسطرها فلا تُعدّ شرحًا ولا نصًا ضائعًا، ويُعاد عددها لملاحظتها.
 * @param {string[]} slice @returns {{ lines: string[], count: number }}
 */
function dropVttBlocks(slice) {
  let count = 0;
  let inBlock = false;
  const lines = slice.map((l, i) => {
    if (EMPTY_LINE_RE.test(l)) {
      inBlock = false;
      return l;
    }
    if (inBlock) return '';
    if ((i === 0 || EMPTY_LINE_RE.test(slice[i - 1])) && VTT_BLOCK_RE.test(headerForm(l))) {
      inBlock = true;
      count++;
      return '';
    }
    return l;
  });
  return { lines, count };
}

/**
 * سطر فيه محرف خفي باقٍ بعد التنقية وحده (RLM أو LRM أو ZWSP أو ZWNJ، تكتبه نماذج فاصلًا؛ تحقق Gemini، ع-٧). يُسقط من نص المقطع
 * أينما وقع، وليس حدًّا يقطعه (تحقق الجولة الثانية، ن-٣): بعد آخر سطر مرئي فاصل بين مقطعين يُسقط بلا ملاحظة، وقبل سطر مرئي
 * (وسط النص أو أوله) يُسقط بملاحظة IM_NOTE_CONTROL ويبقى النص كله للمقطع كما في 2.2.0؛ فلا يُرفض ملف كان يُقبل، ولا يصير نص
 * آخر مقطع «شرحًا بعد الملف» فيُحفظ فارغًا. ومثله سطر من U+FEFF أو NBSP أو مسافة يونيكود وحدها (يزيلها trim فكان «فارغًا» يُرفض
 * الملف بعده برسالة «بعد سطر فارغ»؛ تحقق 2.3.0، بقية ص-٢٣). أما ما فرغ بالتنقية وحدها (تجاوز اتجاه أو وسوم) فيُزال بملاحظته كما كان.
 * @param {string} line
 */
const hiddenOnly = (line) => {
  if (EMPTY_LINE_RE.test(line) || !isBlankText(line)) return false;
  const t = line.trim();
  return t === '' || sanitizeText(t).text.trim() !== '';
};

const excerpt = (s) => (s.length > EXCERPT_CHARS ? `${s.slice(0, EXCERPT_CHARS - 1)}…` : s);
const cleanLines = (text) => text.split('\n').map((l) => l.trim()).filter(Boolean).join('\n');

/**
 * نص مقطع كما يقرؤه هذا المحلّل من حيث المحارف: بلا محارف تحكم ولا تجاوز اتجاه، وبلا مسافات أطراف الأسطر، وبلا سطر صار
 * فارغًا بالتجريد. يكتب به التصدير العربي فلا يحمل الملف U+202E الذي يقلب العرض في مشغّلات أخرى (تدقيق 7a66f91، U99).
 * وبلا سطر بقي فيه محرف خفي وحده (RLM أو ZWSP…): يُسقطه الاستيراد من نص المقطع (ع-٧، ن-٣)، وترجمة حُفظت قبل ذلك قد تحمله وسط نص مقطع.
 * والسطر الفارغ الخالص في نص لم يُجرَّد منه شيء يبقى، فيرفضه فحص الفراغ برقم مقطعه كما كان.
 * @param {string} text @returns {{ text: string, stripped: boolean }}
 */
export function readableText(text) {
  const s = String(text);
  const noControls = sanitizeText(s).text.replace(CONTROL_CHARS, '');
  const lines = noControls.split('\n').map((l) => l.trim());
  const hidden = (l) => l !== '' && isBlankText(l);
  const charsStripped = noControls !== s;
  const stripped = charsStripped || lines.some(hidden);
  return { text: (stripped ? lines.filter((l) => !hidden(l) && (l !== '' || !charsStripped)) : lines).join('\n'), stripped };
}

/**
 * نص كتبه المستخدم في حقل «عدّل النص» بلوحة النص (الفكرة ٦، والتحقق الأخير لـ2.3.0 ص-٢٤): يُنقّى كما ينقّي الاستيراد نص المقطع من
 * حيث المحارف، فما يُحفظ من الحقل هو ما يقرؤه الاستيراد من ملف فيه هذا النص، ولا يصل إلى التخزين ما لا يصله من ملف: فواصل الأسطر LF
 * (lfLines)، وبلا محارف خفية ولا تجاوز اتجاه ولا عزله (sanitizeText) ولا محارف تحكم C0 وC1، وبلا مسافات أطراف الأسطر، وبلا سطر فرغ
 * بالتنقية أو بقي فيه محرف خفي وحده (RLM أو ZWSP…، ن-٣)، وبلا أسطر فارغة في أوله وآخره (Shift+Enter في آخره): حدّ للمقطع لا يقرؤه
 * الاستيراد نصًا. والسطر الفارغ بين سطرين يبقى، فيقول حارس اللوحة سببه ولا يُحذف بصمت. ووسوم التنسيق (<i> و{\an8}) نص كما كُتب:
 * يجرّدها الاستيراد من ملف، والحقل لا يحذف ما يراه كاتبه. ثابتة بالتكرار.
 * @param {string} text @returns {string}
 */
export function typedText(text) {
  const out = [];
  for (const line of lfLines(text).split('\n')) {
    const clean = sanitizeText(line);
    const noControls = clean.text.replace(CONTROL_CHARS, '');
    const t = noControls.trim();
    if (t === '' ? clean.removed > 0 || noControls !== clean.text : isBlankText(t)) continue;
    out.push(t);
  }
  let from = 0;
  let to = out.length;
  while (from < to && out[from] === '') from++;
  while (to > from && out[to - 1] === '') to--;
  return out.slice(from, to).join('\n');
}

/**
 * نص مقطع فيه سطر يقرؤه هذا المحلّل (ومثله ffmpeg) رأسَ مقطع أو حدًّا له، فيتغير عدد المقاطع أو نصها عند قراءة الملف:
 * سطر زمن كامل، أو رقم يليه ما يشبه الزمن، أو سياج أو عنوان Markdown. والسطر الشبيه بالزمن بلا رقم قبله («1 --> 2») نص
 * يُقرأ كما هو (تدقيق 7a66f91، U78 وU35). السطر الفارغ شأن فحص الفراغ. وmarkdown: false يقصره على ما يغيّر عدد المقاطع في أي
 * قارئ SRT (سطر الزمن، والرقم يليه زمن)، للمسار الإنجليزي الذي يقرؤه النموذج وffmpeg لا هذا المحلّل: «# of people» فيه نص (مراجعة C5).
 * @param {string} text @param {{ markdown?: boolean }} [opts]
 * @returns {boolean}
 */
export function breaksSrtText(text, { markdown = true } = {}) {
  const lines = String(text).split('\n');
  return lines.some((line, i) => {
    const t = line.trim();
    if (markdown && t !== '' && (FENCE_RE.test(t) || HEADING_RE.test(t))) return true;
    const form = timeForm(bare(line));
    if (!TIME_LIKE_RE.test(form)) return false;
    return TIME_RE.test(form) || (i > 0 && NUMBER_RE.test(bare(lines[i - 1])));
  });
}

/**
 * @typedef {import('../model/cue.js').Cue} Cue
 * @param {string} input محتوى الملف بعد فك الترميز
 * @returns {{ cues: Cue[], notes: string[], warnings: { code: string, params?: Record<string, string | number> }[] }}
 * @throws {TjError} IM_* برقم السطر في params.line حين يكون للخطأ موضع
 */
export function parseSrtLenient(input) {
  if (typeof input !== 'string') throw new TypeError('المدخل ليس نصًا');
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const lines = text.replace(/\r\n?|\u2028|\u2029/g, '\n').split('\n');

  // WebVTT (ص-١٤): سطر الترويسة قبل أول سطر يشبه الزمن، ولو سبقه شرح أو سياج.
  let vttAt = -1;
  for (let i = 0; i < lines.length; i++) {
    if (VTT_SIGNATURE_RE.test(headerForm(lines[i]))) {
      vttAt = i;
      break;
    }
    if (TIME_LIKE_RE.test(timeForm(bare(lines[i])))) break;
  }
  const vtt = vttAt !== -1;

  // رأس المقطع: سطر رقم ثم سطر زمن. سطر زمن كامل بلا رقم قبله خطأ، وكذا سطر يشبه الزمن وهو غير صالح، إلا داخل نص مقطع
  // (بعد سطر زمن صالح وقبل أول حدّ) وليس قبله رقم: «1 --> 2» و«10:30 --> 11:00» نص منه، فما يصدّره ترجمان يقرؤه ترجمان
  // (تدقيق 7a66f91، U35). والرقم ثم ما يشبه الزمن رأس معيب ولو داخل نص.
  const heads = [];
  let indicDigits = false;
  let emphasized = 0;
  let timeMarks = 0;
  let inText = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = bare(lines[i]);
    const form = timeForm(raw);
    if (!TIME_LIKE_RE.test(form)) {
      if (textBoundary(lines[i], vtt)) inText = false;
      continue;
    }
    // في WebVTT الساعة 0 إن غابت، والإعدادات بعد الزمن تُهمل (ص-١٤).
    const v = vtt ? VTT_TIME_RE.exec(form) : null;
    const m = vtt ? v && [v[0], v[1] ?? '0', v[2], v[3], v[4], v[5] ?? '0', v[6], v[7], v[8]] : TIME_RE.exec(form);
    const numbered = i > 0 && NUMBER_RE.test(bare(lines[i - 1]));
    if (!m) {
      if (inText && !numbered) continue;
      throw new TjError(vtt ? 'IM_VTT_BAD_TIME' : 'IM_BAD_TIME', { params: { line: i + 1 } });
    }
    if (!numbered) throw new TjError(vtt ? 'IM_VTT_MISSING_NUMBER' : 'IM_MISSING_NUMBER', { params: { line: i + 1 } });
    if (HAS_INDIC.test(lines[i]) || HAS_INDIC.test(lines[i - 1])) indicDigits = true;
    if (form !== raw) timeMarks++;
    emphasized += Number(wrapped(lines[i])) + Number(wrapped(lines[i - 1]));
    heads.push({ num: i - 1, time: i, m, settings: v?.[9] ?? null });
    inText = true;
  }
  if (!heads.length) {
    if (lines.every((l) => l.trim() === '')) throw new TjError('IM_EMPTY_FILE');
    // أرقام مقاطع ونصوص بلا سطر زمن واحد: الناقص سطور التوقيت تحديدًا، ولا تُخترع أزمنة.
    throw new TjError(lines.filter((l) => NUMBER_RE.test(bare(l))).length >= 2 ? 'IM_NO_TIMING' : 'IM_NO_CUES');
  }
  if (heads.length > LIMITS.maxCues) throw new TjError('IM_TOO_MANY_CUES', { params: { max: LIMITS.maxCues } });

  let fence = false;
  const chatterBefore = [];
  const chatterAfter = [];
  // بعد الملف: التعليمات تطلب «أرقام المواضع الغامضة في سطر واحد بعد الملف»، فسطر نثري (فيه حروف ولا يبدأ برأس زمن) شرح ولو
  // ذكر زمنًا، ورقم وحيد لا يتجاوز آخر مقطع إشارة إلى مقطع لا رأس مقطع جديد؛ أما الرقم بعده فمقطع مقطوع يبقى خطأً برقم سطره
  // (تدقيق 5fedcb9، GM-012).
  const lastN = Number(bare(lines[heads[heads.length - 1].num]));
  const proseAfter = (form) => (/\p{L}/u.test(form) && !TIME_LIKE_RE.test(form)) || (NUMBER_RE.test(form) && Number(form) <= lastN);
  const sortOut = (slice, bucket, from, after = false) => {
    slice.forEach((l, i) => {
      const t = l.trim();
      if (isBlankText(t)) return;
      if (FENCE_RE.test(t)) fence = true;
      else if (CUE_FRAGMENT_RE.test(bare(l)) && !(after && proseAfter(bare(l)))) throw new TjError('IM_STRAY_TEXT', { params: { line: from + i + 1 } });
      else bucket.push(sanitizeText(t).text);
    });
  };
  let before = lines.slice(0, heads[0].num);
  let vttBlocks = 0;
  if (vtt) {
    // الترويسة وأسطرها حتى أول سطر فارغ صيغةٌ لا شرح (ص-١٤).
    let end = vttAt + 1;
    while (end < before.length && !EMPTY_LINE_RE.test(before[end])) end++;
    const dropped = dropVttBlocks(before.map((l, i) => (i >= vttAt && i < end ? '' : l)));
    before = dropped.lines;
    vttBlocks += dropped.count;
  }
  sortOut(before, chatterBefore, 0);

  const cues = [];
  let tagged = 0;
  let controlled = 0;
  let hidden = 0;
  let trimmed = 0;
  let literalHtml = 0;
  let positioned = 0;
  const reversed = [];
  let irregular = null;
  heads.forEach((h, k) => {
    const last = k === heads.length - 1;
    const body = lines.slice(h.time + 1, last ? lines.length : heads[k + 1].num);
    // النص حتى أول حدّ: سطر فارغ أو سياج أو عنوان، في أي مقطع (كتلتان مسيّجتان متلاصقتان، أو عنوان ملاصق؛ U38). ما بعده:
    // الأسوار والأسطر الفارغة تُتجاوز، وغيرها نص ضائع برقم سطره، أو ذيل الشرح في آخر مقطع.
    const stop = body.findIndex((l) => textBoundary(l, vtt));
    const raw = stop === -1 ? body : body.slice(0, stop);
    let rest = stop === -1 ? [] : body.slice(stop);
    if (vtt) {
      const dropped = dropVttBlocks(rest);
      rest = dropped.lines;
      vttBlocks += dropped.count;
    }
    // السطر الخفي وحده يُسقط، وقبل آخر سطر مرئي بملاحظة (ن-٣).
    const lastVisible = raw.findLastIndex((l) => !isBlankText(l.trim()));
    const hiddenInside = raw.slice(0, Math.max(lastVisible, 0)).some(hiddenOnly);
    const textLines = raw.filter((l) => !hiddenOnly(l));
    if (last) sortOut(rest, chatterAfter, h.time + 1 + stop, true);
    else {
      rest.forEach((l, j) => {
        const t = l.trim();
        if (FENCE_RE.test(t)) fence = true;
        // والحدّ نفسه عنوان («# » أول السطر) يُقال سببه (ع-١٢ ب): ليس بعد سطر فارغ، بل قُرئ هو عنوانًا.
        else if (!isBlankText(t)) {
          const heading = j === 0 && HEADING_RE.test(t);
          throw new TjError('IM_STRAY_TEXT', { params: { line: h.time + 1 + stop + j + 1, ...(heading ? { heading: true } : {}) } });
        }
      });
    }

    // التنقية قبل القص: trim يزيل U+FEFF عند الأطراف، فلا يُعدّ محرفًا مزالًا ولا مسافة مقصوصة.
    const clean = sanitizeText(textLines.join('\n'));
    hidden += clean.removed;
    const cleanTextLines = clean.text.split('\n');
    trimmed += cleanTextLines.filter((l) => l !== l.trim()).length;
    let t = cleanTextLines.map((l) => l.trim()).join('\n');
    if (clean.removed) t = cleanLines(t);
    const noTags = (vtt ? t.replace(VTT_TAG_RE, '') : t).replace(FORMAT_TAG_RE, '').replace(OVERRIDE_RE, '');
    if (noTags !== t) {
      tagged++;
      t = cleanLines(noTags);
    }
    const noControls = t.replace(CONTROL_CHARS, '');
    let ctl = hiddenInside;
    if (noControls !== t) {
      ctl = true;
      t = cleanLines(noControls);
    }
    if (vtt) {
      // الكيانات بعد تجريد الوسوم، فـ«&lt;i&gt;» نص «<i>» كما يعرضه ترجمان لا وسم يُجرَّد؛ وما يأتي من كيان رقمي يمر بالتنقية كما لو
      // جاء حرفيًا (ص-١٤).
      const decoded = decodeVtt(t);
      if (decoded !== t) {
        const again = sanitizeText(decoded);
        hidden += again.removed;
        const plain = again.text.replace(CONTROL_CHARS, '');
        if (plain !== again.text) ctl = true;
        t = cleanLines(plain);
      }
      if (h.settings) positioned++;
    }
    if (ctl) controlled++;
    if (LITERAL_TAG_RE.test(t)) literalHtml++;
    if (t.length > LIMITS.maxTextChars) throw new TjError('IM_CUE_TOO_LONG', { params: { line: h.num + 1, max: LIMITS.maxTextChars } });

    const n = Number(bare(lines[h.num]));
    if (n < 1 || n > MAX_CUE_NUMBER) throw new TjError('IM_BAD_NUMBER', { params: { line: h.num + 1, max: MAX_CUE_NUMBER } });
    const [, h1, m1, s1, f1, h2, m2, s2, f2] = h.m;
    const startMs = Number(h1) * 3600000 + Number(m1) * 60000 + Number(s1) * 1000 + Number(f1);
    const endMs = Number(h2) * 3600000 + Number(m2) * 60000 + Number(s2) * 1000 + Number(f2);
    if (startMs > LIMITS.maxTimeMs || endMs > LIMITS.maxTimeMs) throw new TjError('IM_TIME_OUT_OF_RANGE', { params: { line: h.time + 1 } });

    if (k > 0 && !irregular && n !== cues[k - 1].n + 1) irregular = { prev: cues[k - 1].n, n };
    if (endMs <= startMs) reversed.push({ code: 'IM_CUE_TIME_NOT_AFTER_START', params: { n, line: h.time + 1 } });
    cues.push({ n, startMs, endMs, text: t });
  });

  // «المواضع الغامضة» (ف6): سطر بعد الملف قائمته أرقام مقاطع موجودة يُعاد بأرقامه، ولا يُعدّ شرحًا أُزيل.
  const existing = new Set(cues.map((c) => c.n));
  let ambiguous = null;
  const at = chatterAfter.findIndex((l) => ambiguousNumbers(l, existing));
  if (at !== -1) {
    ambiguous = { numbers: ambiguousNumbers(chatterAfter[at], existing), line: chatterAfter[at] };
    chatterAfter.splice(at, 1);
  }

  const notes = [];
  if (ambiguous) notes.push(messageFor('IM_NOTE_AMBIGUOUS', { count: ambiguous.numbers.length, list: joinList(ambiguous.numbers.slice(0, 12).map(String).concat(ambiguous.numbers.length > 12 ? ['…'] : [])) }));
  if (fence) notes.push(messageFor('IM_NOTE_FENCE'));
  if (chatterBefore.length) notes.push(messageFor('IM_NOTE_CHATTER_BEFORE', { count: chatterBefore.length, first: excerpt(chatterBefore[0]) }));
  if (chatterAfter.length) notes.push(messageFor('IM_NOTE_CHATTER_AFTER', { count: chatterAfter.length, first: excerpt(chatterAfter[0]) }));
  if (emphasized) notes.push(messageFor('IM_NOTE_MD_EMPHASIS', { count: emphasized }));
  if (indicDigits) notes.push(messageFor('IM_NOTE_DIGITS'));
  if (timeMarks) notes.push(messageFor('IM_NOTE_TIME_MARKS', { count: timeMarks }));
  if (tagged) notes.push(messageFor('IM_NOTE_TAGS', { count: tagged }));
  if (controlled) notes.push(messageFor('IM_NOTE_CONTROL', { count: controlled }));
  if (hidden) notes.push(messageFor('IM_NOTE_HIDDEN_CHARS', { count: hidden }));
  if (trimmed) notes.push(messageFor('IM_NOTE_TRIMMED', { count: trimmed }));
  if (positioned) notes.push(messageFor('IM_NOTE_VTT_SETTINGS', { count: positioned }));
  if (vttBlocks) notes.push(messageFor('IM_NOTE_VTT_BLOCKS', { count: vttBlocks }));

  const warnings = [];
  if (irregular) warnings.push({ code: 'IM_NUMBERING_IRREGULAR', params: irregular });
  if (literalHtml) warnings.push({ code: 'IM_HTML_LITERAL', params: { count: literalHtml } });
  warnings.push(...reversed);
  return { cues, notes, warnings, ambiguous };
}
