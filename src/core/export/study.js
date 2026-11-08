// النص الدراسي (R58): الترجمة العربية (أو العربية فوق الإنجليزية) فقرات للقراءة، لكل فقرة رابط إلى زمنها في الفيديو. لا تلخيص
// ولا تغيير: نص كل مقطع كما هو، وفواصل الأسطر داخله مسافة. الفقرة تنقطع عند صمت طويل، أو بعد ستة مقاطع عند نهاية جملة، أو
// عند اثني عشر مقطعًا. الإنجليزي (للثنائي) يُوزَّع على الفقرات بمنتصف زمنه، فيصح مع أي وضع تصدير.
import { TjError, messageFor } from '../errors/index.js';
import { joinList, t } from '../../i18n/index.js';
import { validateCues } from '../model/cue.js';
import { assertValid } from '../model/validate.js';
import { joinWords, endsSentence } from '../convert/text.js';
import { checkFormat, clock, docTitle, mdEscape, mdEscapeLine, timeUrl, videoUrl } from './doc.js';

/** @typedef {import('../model/cue.js').Cue} Cue */

export const STUDY_PARAGRAPH = Object.freeze({ gapMs: 2000, sentenceCues: 6, maxCues: 12 });

/**
 * توقيت روابط النص الدراسي في المحفوظات والمحرّر معًا: حيث يظهر كل مقطع في الفيديو (المحفوظ + إزاحة العرض). وما تجعله الإزاحة
 * (أو خطأ توقيت في المحرّر) قبل بداية الفيديو يبدأ رابطه من 0:00 وحده، وأرقامه في `clamped` ليعلنها السطح؛ ولا تسقط الإزاحة
 * عن بقية المقاطع (تدقيق مستقل 2026-11-04: كان مقطع سالب واحد يعيد كل المقاطع إلى المحفوظ بلا إزاحة وبلا تنبيه).
 * والإنجليزي للثنائي بالإزاحة نفسها (عقد التوقيت، القاعدة ٩: الإزاحة لطبقة ترجمان كلها)، فيُوزَّع على الفقرات بالمرجع الزمني
 * الذي بُنيت به، لا بالمحفوظ وهي مزاحة (تدقيق 7a66f91، U30: كانت ±1 ث تنقل 8–10 أسطر من TED إلى فقرة أخرى). ما يقع منه قبل
 * الصفر يُقص إليه ولا يُعلن، فهو لا يحمل رابطًا.
 * @param {Cue[]} cues @param {number} displayOffsetMs @param {Cue[] | null} [english]
 * @returns {{ cues: Cue[], clamped: number[], english: Cue[] | null }}
 */
export function studyTiming(cues, displayOffsetMs, english = null) {
  const shift = Number.isInteger(displayOffsetMs) ? displayOffsetMs : 0;
  const clamped = [];
  const move = (c, onClamp) => {
    const startMs = c.startMs + shift;
    const endMs = c.endMs + shift;
    if (startMs >= 0 && endMs >= 0) return { ...c, startMs, endMs };
    onClamp?.(c.n);
    return { ...c, startMs: Math.max(0, startMs), endMs: Math.max(0, endMs) };
  };
  const out = cues.map((c) => move(c, (n) => clamped.push(n)));
  return { cues: out, clamped, english: Array.isArray(english) ? english.map((c) => move(c)) : null };
}

const NOTE_LIST = 8;
/** نص الإشعار لما قُصّ إلى بداية الفيديو، أو '' إن لم يُقص شيء. أول ثمانية أرقام ثم «…». @param {number[]} clamped */
export function studyTimingNote(clamped) {
  if (!clamped.length) return '';
  const list = clamped.length > NOTE_LIST ? `${joinList(clamped.slice(0, NOTE_LIST))}…` : joinList(clamped);
  return messageFor('EX_STUDY_CLAMPED', { list });
}
// علامات نهاية الفقرة: اتحاد علامات التحويل (endsSentence: 。 وغيرها) و«…» التي يحفظها النص الدراسي منذ R58 (AV2 U-007).
const SENTENCE_END = /[.!?؟…]["'”’»)\]]*$/u;
const endsParagraph = (t) => SENTENCE_END.test(t) || endsSentence(t);
const LINE_SPLIT = new RegExp('\\r\\n|[\\r\\n\\u0085\\u2028\\u2029]');
/**
 * نص المقطع في سطر واحد: فواصل الأسطر داخله مسافة كـ`oneLine`، إلا بين حرفين من نص لا يفصل بالمسافات (ياباني، صيني، تايلاندي…)
 * فلا شيء (AV2 U-007)؛ فمخرجات العربية والإنجليزية كما كانت بايتًا. وهو في هذا الملف وحده، و`oneLine` المشترك لم يُمس.
 * @param {unknown} text
 */
const oneLine = (text) => joinWords(String(text).split(LINE_SPLIT).map((l) => l.trim()).filter(Boolean));

/** @param {Cue[]} cues */
function paragraphs(cues) {
  const out = [];
  let cur = null;
  cues.forEach((c, i) => {
    const prev = cues[i - 1];
    const brk = !cur
      || c.startMs - prev.endMs >= STUDY_PARAGRAPH.gapMs
      || cur.cues.length >= STUDY_PARAGRAPH.maxCues
      || (cur.cues.length >= STUDY_PARAGRAPH.sentenceCues && endsParagraph(oneLine(prev.text)));
    if (brk) {
      cur = { startMs: c.startMs, cues: [] };
      out.push(cur);
    }
    cur.cues.push(c);
  });
  return out;
}

/** لكل فقرة نصوص المقاطع الإنجليزية التي يقع منتصفها بعد بدايتها وقبل بداية التالية. */
function englishByParagraph(paras, english) {
  const out = paras.map(() => []);
  for (const e of english) {
    const mid = (e.startMs + e.endMs) / 2;
    let lo = 0;
    let hi = paras.length - 1;
    let at = 0;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (paras[m].startMs <= mid) {
        at = m;
        lo = m + 1;
      } else hi = m - 1;
    }
    const t = oneLine(e.text);
    if (t) out[at].push(t);
  }
  return out;
}

/** مقطع لغة في اسم ملف: الرمز الصالح بـ«-»، وإلا البديل (لا تخمين، AA3). @param {unknown} lang @param {string} fallback */
const namePart = (lang, fallback) => (typeof lang === 'string' && /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{1,8}){0,4}$/.test(lang) ? lang.replace(/_/g, '-') : fallback);

/**
 * الاسم بلغتي الملف الفعليتين منذ AA3: VIDEOID.<لغة الترجمة>.study.<format>، وللثنائي VIDEOID.<لغة الترجمة>-<لغة الأصل>.study؛ ولغة
 * الترجمة غير المحددة «translation» كملف الترجمة نفسه (names.js)، والأصل غير المعروف «source». كانت ar وar-en ثابتتين.
 * @param {{ videoId: string, title?: string | null, cues: Cue[], english?: Cue[] | null, format: 'txt' | 'md', bilingual: boolean, lang?: string | null, sourceLang?: string | null }} spec
 * @returns {{ name: string, text: string }}
 * @throws {TjError} TJ_BAD_VIDEO_ID أو ST_NO_RECORD أو EX_STUDY_NO_ENGLISH أو MD_INVALID
 */
export function buildStudyText({ videoId, title = null, cues, english = null, format, bilingual = false, lang = null, sourceLang = null }) {
  const url = videoUrl(videoId);
  checkFormat(format);
  if (!Array.isArray(cues) || !cues.length) throw new TjError('ST_NO_RECORD');
  assertValid(validateCues(cues, 'cues'), 'cues');
  const en = bilingual && Array.isArray(english) ? english : [];
  if (bilingual) {
    if (!en.length) throw new TjError('EX_STUDY_NO_ENGLISH');
    assertValid(validateCues(en, 'english'), 'english');
  }
  const md = format === 'md';
  const paras = paragraphs(cues);
  const enText = bilingual ? englishByParagraph(paras, en) : null;
  const heading = docTitle(title);
  const lines = md ? [`# ${mdEscape(heading)}`, '', `[${t('core.export.watch')}](${url})`, ''] : [heading, url, ''];
  paras.forEach((p, k) => {
    const ar = joinWords(p.cues.map((c) => oneLine(c.text)).filter(Boolean));
    const link = timeUrl(videoId, p.startMs);
    const enLine = enText && enText[k].length ? joinWords(enText[k]) : null;
    if (md) {
      lines.push(`[${clock(p.startMs)}](${link}) ${mdEscape(ar)}`);
      if (enLine) lines.push('', `> ${mdEscapeLine(enLine)}`);
    } else {
      lines.push(`[${clock(p.startMs)}] ${link}`, ar);
      if (enLine) lines.push(enLine);
    }
    lines.push('');
  });
  const langs = `${namePart(lang, 'translation')}${bilingual ? `-${namePart(sourceLang, 'source')}` : ''}`;
  return { name: `${videoId}.${langs}.study.${format}`, text: lines.join('\n') };
}
