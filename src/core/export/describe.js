// وصف المسار الملتقط بأسماء مفهومة لقائمة الاختيار (P6): «English – يدوي، 412 مقطعًا».
import { t } from '../../i18n/index.js';
import { COUNT_FORMS, formatCount } from '../../ui/format.js';

const kindLabel = (kind) => t(kind === 'asr' ? 'core.export.kind.asr' : 'core.export.kind.manual');

/**
 * اسم اللغة: en ← English، وen-GB ← English (GB). ما بعد الشرطة يُكتب بأحرف كبيرة كما هو (رمز منطقة).
 * @param {string} lang
 */
export function languageLabel(lang) {
  const [, ...rest] = String(lang).split(/[-_]/);
  return rest.length ? `English (${rest.join('-').toUpperCase()})` : 'English';
}

/** @param {{ lang: string, kind: 'manual' | 'asr' }} track «English – يدوي» */
export const trackLabel = (track) => `${languageLabel(track.lang)} – ${kindLabel(track.kind)}`;

/**
 * @param {{ lang: string, kind: 'manual' | 'asr', ok: boolean, cueCount: number }} track TrackInfo
 * @returns {string}
 */
export function describeTrack(track) {
  const label = trackLabel(track);
  if (!track.ok || track.cueCount < 1) return t('core.export.describe.invalid', { label });
  return t('core.export.describe.valid', { label, count: formatCount(track.cueCount, COUNT_FORMS.cue) });
}
