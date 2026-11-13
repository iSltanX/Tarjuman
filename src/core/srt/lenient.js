// محلّل SRT متسامح للملفات المستوردة، وهي نص غير موثوق من نموذج أو أداة خارجية. يقبل BOM وCRLF والفاصلة والنقطة
// في الأزمنة والأسطر الزائدة والترقيم غير المتسلسل، ويجرّد وسوم التنسيق نصيًا ولا يفسّر أي HTML. كل تحويل للنص يعود
// في notes، وما لا يُحلَّل يرمي TjError برقم السطر. لا يعدّل التوقيت ولا الترقيم أبدًا. (الصارم لمخرجات ترجمان: parser.js)
// ملفات TXT وMarkdown (R48) بالمحلّل نفسه: تُزال أغلفة محددة واضحة فقط بملاحظة — أسوار ``` و~~~، والتأكيد حول سطر
// الرقم أو الزمن كله (**12** و`00:00:01,000 --> …`)، والعناوين والفقرات قبل الملف وبعده. وما داخل نص المقطع يبقى حرفيًا.
import { TjError, messageFor } from '../errors/index.js';
import { isBlankText } from '../model/cue.js';
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
/** حدّ لنص المقطع أينما وقع: سطر فارغ أو سياج أو عنوان (U38). @param {string} line */
const textBoundary = (line) => {
  const t = line.trim();
  return t === '' || FENCE_RE.test(t) || HEADING_RE.test(t);
};

/**
 * سطر فيه محرف خفي باقٍ بعد التنقية وحده (RLM أو LRM أو ZWSP أو ZWNJ، تكتبه نماذج فاصلًا؛ تحقق Gemini، ع-٧). يُسقط من نص المقطع
 * أينما وقع، وليس حدًّا يقطعه (تحقق الجولة الثانية، ن-٣): بعد آخر سطر مرئي فاصل بين مقطعين يُسقط بلا ملاحظة، وقبل سطر مرئي
 * (وسط النص أو أوله) يُسقط بملاحظة IM_NOTE_CONTROL ويبقى النص كله للمقطع كما في 2.2.0؛ فلا يُرفض ملف كان يُقبل، ولا يصير نص
 * آخر مقطع «شرحًا بعد الملف» فيُحفظ فارغًا. أما ما فرغ بالتنقية وحدها (تجاوز اتجاه أو وسوم) فيُزال بملاحظته كما كان.
 * @param {string} line
 */
const hiddenOnly = (line) => {
  const t = line.trim();
  return t !== '' && isBlankText(t) && sanitizeText(t).text.trim() !== '';
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
      if (textBoundary(lines[i])) inText = false;
      continue;
    }
    const m = TIME_RE.exec(form);
    const numbered = i > 0 && NUMBER_RE.test(bare(lines[i - 1]));
    if (!m) {
      if (inText && !numbered) continue;
      throw new TjError('IM_BAD_TIME', { params: { line: i + 1 } });
    }
    if (!numbered) throw new TjError('IM_MISSING_NUMBER', { params: { line: i + 1 } });
    if (HAS_INDIC.test(lines[i]) || HAS_INDIC.test(lines[i - 1])) indicDigits = true;
    if (form !== raw) timeMarks++;
    emphasized += Number(wrapped(lines[i])) + Number(wrapped(lines[i - 1]));
    heads.push({ num: i - 1, time: i, m });
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
  sortOut(lines.slice(0, heads[0].num), chatterBefore, 0);

  const cues = [];
  let tagged = 0;
  let controlled = 0;
  let hidden = 0;
  let trimmed = 0;
  let literalHtml = 0;
  const reversed = [];
  let irregular = null;
  heads.forEach((h, k) => {
    const last = k === heads.length - 1;
    const body = lines.slice(h.time + 1, last ? lines.length : heads[k + 1].num);
    // النص حتى أول حدّ: سطر فارغ أو سياج أو عنوان، في أي مقطع (كتلتان مسيّجتان متلاصقتان، أو عنوان ملاصق؛ U38). ما بعده:
    // الأسوار والأسطر الفارغة تُتجاوز، وغيرها نص ضائع برقم سطره، أو ذيل الشرح في آخر مقطع.
    const stop = body.findIndex(textBoundary);
    const raw = stop === -1 ? body : body.slice(0, stop);
    const rest = stop === -1 ? [] : body.slice(stop);
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
    const noTags = t.replace(FORMAT_TAG_RE, '').replace(OVERRIDE_RE, '');
    if (noTags !== t) {
      tagged++;
      t = cleanLines(noTags);
    }
    const noControls = t.replace(CONTROL_CHARS, '');
    if (noControls !== t) {
      controlled++;
      t = cleanLines(noControls);
    } else if (hiddenInside) controlled++;
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

  const warnings = [];
  if (irregular) warnings.push({ code: 'IM_NUMBERING_IRREGULAR', params: irregular });
  if (literalHtml) warnings.push({ code: 'IM_HTML_LITERAL', params: { count: literalHtml } });
  warnings.push(...reversed);
  return { cues, notes, warnings, ambiguous };
}
