// تسمية الملفات المصدَّرة (عقد interfaces §٥، وP3-AC3): VIDEOID.en.<kind>.<mode>.srt للإنجليزي،
// وVIDEOID.ar.srt للعربي (أو VIDEOID.ar.original.srt للأصل المستورد)، ولأجزاء التقسيم الاحتياطي
// VIDEOID.en.<kind>.<mode>.part02of05.srt (الترقيم بعرض ثابت ليرتّب المتصفح الأجزاء كما هي).
import { TjError } from '../errors/index.js';
import { ENGLISH_LANG_RE, TRACK_KINDS, isVideoId } from '../model/ids.js';
import { EXPORT_MODES } from '../model/tracks.js';

const pad = (n, width) => String(n).padStart(width, '0');

/**
 * @param {{
 *   videoId: string, lang: string, kind?: 'manual' | 'asr', mode?: 'normal' | 'long',
 *   variant?: 'current' | 'original', part?: { index: number, total: number } | null
 * }} spec lang هو ar أو لغة إنجليزية (en وen-GB…)؛ والمسار الإنجليزي لا يُسمّى بلا نوع ووضع
 * @returns {string}
 */
export function fileName({ videoId, lang, kind, mode, variant = 'current', part = null }) {
  if (!isVideoId(videoId)) throw new TjError('TJ_BAD_VIDEO_ID');
  const invalid = (what) => new TjError('MD_INVALID', { detail: `اسم ملف: ${what}` });
  if (lang === 'ar') {
    if (variant !== 'current' && variant !== 'original') throw invalid('variant');
    return `${videoId}.ar${variant === 'original' ? '.original' : ''}.srt`;
  }
  if (typeof lang !== 'string' || !ENGLISH_LANG_RE.test(lang)) throw invalid('lang');
  if (!TRACK_KINDS.includes(kind)) throw invalid('kind');
  if (!EXPORT_MODES.includes(mode)) throw invalid('mode');
  let suffix = '';
  if (part) {
    const { index, total } = part;
    if (!Number.isInteger(index) || !Number.isInteger(total) || total < 2 || index < 1 || index > total) throw invalid('part');
    const width = Math.max(2, String(total).length);
    suffix = `.part${pad(index, width)}of${pad(total, width)}`;
  }
  return `${videoId}.${lang.replace(/_/g, '-')}.${kind}.${mode}${suffix}.srt`;
}
