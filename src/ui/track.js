// وصف مسار الأصل الواحد (ح-57، الجولة الخامسة 2026-11-14): نص واحد باللغتين لنافذة الإضافة وقائمة «تنزيل الأصل» ولوحة النص المتزامن.
// اليدوي والتلقائي بنوعهما («الإنجليزية · يدوية»، «الإنجليزية · تلقائية»)، والمترجم آليًا من يوتيوب بمصدره وحده بلا نوع («الإنجليزية،
// ترجمها يوتيوب آليًا عن العربية»)؛ ثم عدد المقاطع بـformatCount، ثم حاله إن طُلبت («ملتقطة» أو «محفوظة»). وكانت ثلاث صيغ للمسار
// نفسه: «الإنجليزية (ترجمة يوتيوب الآلية) ملتقطة · تلقائية» في النافذة، و«مترجمة آليًا من يوتيوب عن العربية» في القائمة، و«ترجمة
// يوتيوب الآلية عن العربية» في اللوحة. لا DOM هنا.
import { t } from '../i18n/index.js';
import { COUNT_FORMS, formatCount } from './format.js';
import { languageName } from './lang.js';

/**
 * @param {{ lang?: string | null, kind?: 'manual' | 'asr' | string | null, via?: string | null }} track رمز لغة المسار ونوعه ولغة
 *   مصدره إن كان ترجمة يوتيوب الآلية (tlang)
 * @param {{ count?: number | null, state?: 'captured' | 'saved' | null, region?: boolean }} [o] count: عدد المقاطع بعد الوصف؛ state:
 *   حال المسار في آخره؛ region: الاسم بلهجته (الشريط والنافذة) أو بلغته الأساسية وحدها (اللوحة)
 * @returns {string}
 */
export function trackDescription(track, { count = null, state = null, region = true } = {}) {
  const name = languageName(track?.lang, { region }) ?? t('common.track.original');
  const head = track?.via
    ? t('common.track.via', { name, source: languageName(track.via, { region }) ?? track.via })
    : `${name} · ${t(`common.track.kind.${track?.kind === 'asr' ? 'asr' : 'manual'}`)}`;
  return [head, Number.isInteger(count) ? formatCount(count, COUNT_FORMS.cue) : null, state ? t(`common.track.state.${state}`) : null].filter(Boolean).join(' · ');
}
