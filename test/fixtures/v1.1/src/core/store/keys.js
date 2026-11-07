// مفاتيح التخزين (عقد storage §١ و§٧). لا مفتاح خارج هذه القائمة. مفاتيح الإصدار الثاني لا تبدأ بـvideo: ولا index:
// وليست meta ولا settings، فيتجاهلها parseKey في حزمة الإصدار الأول (يعيد null) ولا تدخل قراءته ولا أحداثه.
import { isVideoId } from '../model/ids.js';

export const KEY_META = 'meta';
export const KEY_SETTINGS = 'settings';
export const KEY_PREFS = 'prefs';
export const KEY_SAVES = 'saves';
const VIDEO = 'video:';
const INDEX = 'index:';
const BUNDLE = 'bundle:';
const ALTS = 'alts:';
const PREV = 'prev:';
const MARKS = 'marks:';

/** @param {string} videoId */
export const videoKey = (videoId) => `${VIDEO}${videoId}`;
/** @param {string} videoId */
export const indexKey = (videoId) => `${INDEX}${videoId}`;
/** @param {string} videoId */
export const bundleKey = (videoId) => `${BUNDLE}${videoId}`;
/** @param {string} videoId */
export const altsKey = (videoId) => `${ALTS}${videoId}`;
/** @param {string} videoId */
export const prevKey = (videoId) => `${PREV}${videoId}`;
/** @param {string} videoId */
export const marksKey = (videoId) => `${MARKS}${videoId}`;

/** توابع الفيديو في الإصدار الثاني (تُزال معه). */
export const companionKeys = (videoId) => [bundleKey(videoId), altsKey(videoId), prevKey(videoId), marksKey(videoId)];

const PER_VIDEO = [[VIDEO, 'video'], [INDEX, 'index'], [BUNDLE, 'bundle'], [ALTS, 'alts'], [PREV, 'prev'], [MARKS, 'marks']];
export const COMPANION_KINDS = Object.freeze(['bundle', 'alts', 'prev', 'marks']);

/**
 * @param {string} key
 * @returns {{ kind: 'meta' | 'settings' | 'prefs' | 'saves' }
 *   | { kind: 'video' | 'index' | 'bundle' | 'alts' | 'prev' | 'marks', videoId: string } | null}
 */
export function parseKey(key) {
  if (key === KEY_META) return { kind: 'meta' };
  if (key === KEY_SETTINGS) return { kind: 'settings' };
  if (key === KEY_PREFS) return { kind: 'prefs' };
  if (key === KEY_SAVES) return { kind: 'saves' };
  for (const [prefix, kind] of PER_VIDEO) {
    if (key.startsWith(prefix)) {
      const videoId = key.slice(prefix.length);
      return isVideoId(videoId) ? { kind, videoId } : null;
    }
  }
  return null;
}
