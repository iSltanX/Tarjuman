// محلّل SRT متسامح للملفات المستوردة، وهي نص غير موثوق من نموذج أو أداة خارجية. يقبل BOM وCRLF والفاصلة والنقطة
// في الأزمنة والأسطر الزائدة والترقيم غير المتسلسل، ويجرّد وسوم التنسيق نصيًا ولا يفسّر أي HTML. كل تحويل للنص يعود
// في notes، وما لا يُحلَّل يرمي TjError برقم السطر. لا يعدّل التوقيت ولا الترقيم أبدًا. (الصارم لمخرجات ترجمان: parser.js)
// ملفات TXT وMarkdown (R48) بالمحلّل نفسه: تُزال أغلفة محددة واضحة فقط بملاحظة — أسوار ``` و~~~، والتأكيد حول سطر
// الرقم أو الزمن كله (**12** و`00:00:01,000 --> …`)، والعناوين والفقرات قبل الملف وبعده. وما داخل نص المقطع يبقى حرفيًا.
import { TjError, messageFor } from '../errors/index.js';
import { LIMITS } from '../model/validate.js';

const MAX_CUE_NUMBER = LIMITS.maxCues * 10;
const EXCERPT_CHARS = 60;

const INDIC_DIGITS = /[٠-٩۰-۹]/g;
const HAS_INDIC = /[٠-٩۰-۹]/;
const INVISIBLE_MARKS = /[\u061C\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g;
// تُزال من النص: C0/C1 ومحارف تجاوز الاتجاه والعزل. تبقى LRM وRLM وALM وZWNJ فهي مشروعة في العربية.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g;
// ما يشبه جزءًا من رأس مقطع عند أطراف الملف خطأ برقم السطر لا «شرح» يُحذف بصمت.
const CUE_FRAGMENT_RE = /^\d+$|-->|\d:\d\d:\d\d/;

const NUMBER_RE = /^\d+$/;
const TIME_LIKE_RE = /^\d[^\s>]*\s*-->/;
const TIME_RE = /^(\d+):([0-5]\d):([0-5]\d)[,.](\d{3})\s*-->\s*(\d+):([0-5]\d):([0-5]\d)[,.](\d{3})$/;
const FENCE_RE = /^(?:`{3,}|~{3,})[\w+-]*$/;
// غلاف تأكيد واحد يحيط بسطر الرأس كله: ** أو __ أو * أو _ أو `.
const EMPHASIS_RE = /^(\*\*|__|\*|_|`)(\S(?:.*\S)?)\1$/;

// وسوم التنسيق التي تُجرَّد وحدها، وأوامر التموضع من نمط ASS مثل {\an8}. كل وسم HTML آخر يبقى نصًا حرفيًا.
const FORMAT_TAG_RE = /<\/?(?:i|b|u|s|em|strong|font)(?:\s[^<>]*)?>/gi;
const OVERRIDE_RE = /\{\\[^{}]*\}/g;
const LITERAL_TAG_RE = /<\/?[A-Za-z][^<>]*>/;

/** أرقام لاتينية من الهندية والفارسية، لمطابقة سطور الرأس فقط؛ لا تُطبَّق على نص المقطع أبدًا. */
const latinDigits = (s) => s.replace(INDIC_DIGITS, (d) => String(d.charCodeAt(0) - (d.charCodeAt(0) >= 0x06f0 ? 0x06f0 : 0x0660)));

/** صورة السطر لمطابقة الرأس: بلا علامات اتجاه، وأرقام لاتينية، وبلا مسافات أطراف. */
const headerForm = (line) => latinDigits(line.replace(INVISIBLE_MARKS, '')).trim();

/** صورة الرأس بعد نزع غلاف التأكيد إن أحاط بالسطر كله. */
const bare = (line) => {
  const form = headerForm(line);
  const m = EMPHASIS_RE.exec(form);
  return m ? m[2].trim() : form;
};
const wrapped = (line) => EMPHASIS_RE.test(headerForm(line));

const excerpt = (s) => (s.length > EXCERPT_CHARS ? `${s.slice(0, EXCERPT_CHARS - 1)}…` : s);
const cleanLines = (text) => text.split('\n').map((l) => l.trim()).filter(Boolean).join('\n');

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

  // رأس المقطع: سطر رقم ثم سطر زمن. سطر يشبه الزمن وهو غير صالح أو بلا رقم قبله خطأ، لا نص يلتحق بما قبله.
  const heads = [];
  let indicDigits = false;
  let emphasized = 0;
  for (let i = 0; i < lines.length; i++) {
    const form = bare(lines[i]);
    if (!TIME_LIKE_RE.test(form)) continue;
    const m = TIME_RE.exec(form);
    if (!m) throw new TjError('IM_BAD_TIME', { params: { line: i + 1 } });
    if (i === 0 || !NUMBER_RE.test(bare(lines[i - 1]))) throw new TjError('IM_MISSING_NUMBER', { params: { line: i + 1 } });
    if (HAS_INDIC.test(lines[i]) || HAS_INDIC.test(lines[i - 1])) indicDigits = true;
    emphasized += Number(wrapped(lines[i])) + Number(wrapped(lines[i - 1]));
    heads.push({ num: i - 1, time: i, m });
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
      if (!t) return;
      if (FENCE_RE.test(t)) fence = true;
      else if (CUE_FRAGMENT_RE.test(bare(l)) && !(after && proseAfter(bare(l)))) throw new TjError('IM_STRAY_TEXT', { params: { line: from + i + 1 } });
      else bucket.push(t);
    });
  };
  sortOut(lines.slice(0, heads[0].num), chatterBefore, 0);

  const cues = [];
  let tagged = 0;
  let controlled = 0;
  let literalHtml = 0;
  let irregular = null;
  heads.forEach((h, k) => {
    const last = k === heads.length - 1;
    const body = lines.slice(h.time + 1, last ? lines.length : heads[k + 1].num);
    // النص حتى أول سطر فارغ (أو سياج ختامي في آخر مقطع)؛ ما بعده نص ضائع، أو ذيل الشرح في آخر مقطع.
    const stop = body.findIndex((l) => l.trim() === '' || (last && FENCE_RE.test(l.trim())));
    const textLines = stop === -1 ? body : body.slice(0, stop);
    const rest = stop === -1 ? [] : body.slice(stop);
    if (last) sortOut(rest, chatterAfter, h.time + 1 + stop, true);
    else {
      const j = rest.findIndex((l) => l.trim() !== '');
      if (j !== -1) throw new TjError('IM_STRAY_TEXT', { params: { line: h.time + 1 + stop + j + 1 } });
    }

    let t = textLines.map((l) => l.trim()).join('\n');
    const noTags = t.replace(FORMAT_TAG_RE, '').replace(OVERRIDE_RE, '');
    if (noTags !== t) {
      tagged++;
      t = cleanLines(noTags);
    }
    const noControls = t.replace(CONTROL_CHARS, '');
    if (noControls !== t) {
      controlled++;
      t = cleanLines(noControls);
    }
    if (LITERAL_TAG_RE.test(t)) literalHtml++;
    if (t.length > LIMITS.maxTextChars) throw new TjError('IM_CUE_TOO_LONG', { params: { line: h.num + 1, max: LIMITS.maxTextChars } });

    const n = Number(bare(lines[h.num]));
    if (n < 1 || n > MAX_CUE_NUMBER) throw new TjError('IM_BAD_NUMBER', { params: { line: h.num + 1, max: MAX_CUE_NUMBER } });
    const [, h1, m1, s1, f1, h2, m2, s2, f2] = h.m;
    const startMs = Number(h1) * 3600000 + Number(m1) * 60000 + Number(s1) * 1000 + Number(f1);
    const endMs = Number(h2) * 3600000 + Number(m2) * 60000 + Number(s2) * 1000 + Number(f2);
    if (startMs > LIMITS.maxTimeMs || endMs > LIMITS.maxTimeMs) throw new TjError('IM_TIME_OUT_OF_RANGE', { params: { line: h.time + 1 } });

    if (k > 0 && !irregular && n !== cues[k - 1].n + 1) irregular = { prev: cues[k - 1].n, n };
    cues.push({ n, startMs, endMs, text: t });
  });

  const notes = [];
  if (fence) notes.push(messageFor('IM_NOTE_FENCE'));
  if (chatterBefore.length) notes.push(messageFor('IM_NOTE_CHATTER_BEFORE', { count: chatterBefore.length, first: excerpt(chatterBefore[0]) }));
  if (chatterAfter.length) notes.push(messageFor('IM_NOTE_CHATTER_AFTER', { count: chatterAfter.length, first: excerpt(chatterAfter[0]) }));
  if (emphasized) notes.push(messageFor('IM_NOTE_MD_EMPHASIS', { count: emphasized }));
  if (indicDigits) notes.push(messageFor('IM_NOTE_DIGITS'));
  if (tagged) notes.push(messageFor('IM_NOTE_TAGS', { count: tagged }));
  if (controlled) notes.push(messageFor('IM_NOTE_CONTROL', { count: controlled }));

  const warnings = [];
  if (irregular) warnings.push({ code: 'IM_NUMBERING_IRREGULAR', params: irregular });
  if (literalHtml) warnings.push({ code: 'IM_HTML_LITERAL', params: { count: literalHtml } });
  return { cues, notes, warnings };
}
