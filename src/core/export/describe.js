// وصف المسار الملتقط بأسماء مفهومة لقائمة الاختيار (P6): «English – يدوي، 412 مقطعًا».
import { COUNT_FORMS, formatCount } from '../../ui/format.js';

const KIND_LABELS = Object.freeze({ manual: 'يدوي', asr: 'تلقائي' });

/**
 * اسم اللغة: en ← English، وen-GB ← English (GB). ما بعد الشرطة يُكتب بأحرف كبيرة كما هو (رمز منطقة).
 * @param {string} lang
 */
export function languageLabel(lang) {
  const [, ...rest] = String(lang).split(/[-_]/);
  return rest.length ? `English (${rest.join('-').toUpperCase()})` : 'English';
}

/** @param {{ lang: string, kind: 'manual' | 'asr' }} track «English – يدوي» */
export const trackLabel = (track) => `${languageLabel(track.lang)} – ${KIND_LABELS[track.kind] ?? KIND_LABELS.manual}`;

/**
 * @param {{ lang: string, kind: 'manual' | 'asr', ok: boolean, cueCount: number }} track TrackInfo
 * @returns {string}
 */
export function describeTrack(track) {
  const label = trackLabel(track);
  if (!track.ok || track.cueCount < 1) return `${label}، غير صالح للتصدير`;
  return `${label}، ${formatCount(track.cueCount, COUNT_FORMS.cue)}`;
}
