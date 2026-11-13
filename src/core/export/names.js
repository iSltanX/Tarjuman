// تسمية الملفات المصدَّرة (عقد interfaces §٥، وP3-AC3): VIDEOID.<lang>.<kind>.<mode>.srt للمسار المستخرج بأي لغة (منذ 2.0.0،
// AA1)، وVIDEOID.<lang>.from-<via>.<kind>.<mode>.srt لمسار ترجمه يوتيوب آليًا عن لغة via، ولأجزاء التقسيم الاحتياطي
// VIDEOID.<lang>.<kind>.<mode>.part02of05.srt (الترقيم بعرض ثابت ليرتّب المتصفح الأجزاء كما هي). والترجمة VIDEOID.<لغتها>.srt
// (أو VIDEOID.<لغتها>.original.srt للأصل المستورد)، ولغتها من الترجمة نفسها ثم من رمز صريح في اسم ملفها، وإلا «translation»
// (لا تخمين؛ وكانت ar دائمًا قبل 2.0.0). وملف الترجمة WebVTT بالاسم نفسه بامتداد .vtt، و«مع الأصل» VIDEOID.<لغتها>.dual-<لغة الأصل>.srt|vtt
// (الفكرة ١١، ح-50): لا يُقرأ عند الرفع لغةً زائفة كما يُقرأ VIDEOID.ar-en (ar-EN).
import { TjError } from '../errors/index.js';
import { langFromFileName } from '../lang/index.js';
import { TRACK_KINDS, isSourceLang, isVideoId } from '../model/ids.js';
import { EXPORT_MODES } from '../model/tracks.js';

const pad = (n, width) => String(n).padStart(width, '0');
/** صيغتا ملف الترجمة المصدَّر (الفكرة ١١): لا .ass. */
export const SUBTITLE_FORMATS = Object.freeze(['srt', 'vtt']);

/** مقطع اللغة في اسم الملف: «_» إلى «-». @param {string} lang */
const langPart = (lang) => lang.replace(/_/g, '-');

/**
 * لغة اسم ملف الترجمة: لغتها المحفوظة، ثم رمز صريح في اسم ملفها المرفوع يوافق نصها نص كتابته (ع-٨)، وإلا null.
 * @param {{ lang?: string | null, fileName?: string | null, current?: { text: string }[] | null, original?: { text: string }[] | null } | null | undefined} track
 * @returns {string | null}
 */
export const translationLang = (track) => (track?.lang && isSourceLang(track.lang) ? track.lang
  : langFromFileName(track?.fileName ?? null, track?.current ?? track?.original ?? null));

/**
 * @param {{
 *   videoId: string, lang: string | null, kind?: 'manual' | 'asr', mode?: 'normal' | 'long', via?: string | null,
 *   translation?: boolean, variant?: 'current' | 'original', part?: { index: number, total: number } | null,
 *   format?: 'srt' | 'vtt', dualOf?: string | null
 * }} spec translation: ملف ترجمة (lang لغتها أو null)؛ وإلا مسار مستخرج لا يُسمّى بلا لغة ونوع ووضع. ولتوافق ما قبل 2.0.0
 *   lang = 'ar' بلا kind ولا mode ولا translation ملف ترجمة عربي. format وdualOf لملف الترجمة وحده (الفكرة ١١): الامتداد، ولغة
 *   الأصل في الملف الثنائي.
 * @returns {string}
 */
export function fileName({ videoId, lang, kind, mode, via = null, translation = false, variant = 'current', part = null, format = 'srt', dualOf = null }) {
  if (!isVideoId(videoId)) throw new TjError('TJ_BAD_VIDEO_ID');
  const invalid = (what) => new TjError('MD_INVALID', { detail: `اسم ملف: ${what}` });
  if (translation || (lang === 'ar' && kind === undefined && mode === undefined)) {
    if (variant !== 'current' && variant !== 'original') throw invalid('variant');
    if (lang !== null && !isSourceLang(lang)) throw invalid('lang');
    if (!SUBTITLE_FORMATS.includes(format)) throw invalid('format');
    if (dualOf !== null && !isSourceLang(dualOf)) throw invalid('dualOf');
    return `${videoId}.${lang ? langPart(lang) : 'translation'}${variant === 'original' ? '.original' : ''}${dualOf ? `.dual-${langPart(dualOf)}` : ''}.${format}`;
  }
  if (!isSourceLang(lang)) throw invalid('lang');
  if (via !== null && !isSourceLang(via)) throw invalid('via');
  if (!TRACK_KINDS.includes(kind)) throw invalid('kind');
  if (!EXPORT_MODES.includes(mode)) throw invalid('mode');
  let suffix = '';
  if (part) {
    const { index, total } = part;
    if (!Number.isInteger(index) || !Number.isInteger(total) || total < 2 || index < 1 || index > total) throw invalid('part');
    const width = Math.max(2, String(total).length);
    suffix = `.part${pad(index, width)}of${pad(total, width)}`;
  }
  return `${videoId}.${langPart(lang)}${via ? `.from-${langPart(via)}` : ''}.${kind}.${mode}${suffix}.srt`;
}
