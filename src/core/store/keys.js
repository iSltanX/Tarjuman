// مفاتيح التخزين (عقد storage §١). لا مفتاح خارج هذه القائمة.
import { isVideoId } from '../model/ids.js';

export const KEY_META = 'meta';
export const KEY_SETTINGS = 'settings';
const VIDEO = 'video:';
const INDEX = 'index:';

/** @param {string} videoId */
export const videoKey = (videoId) => `${VIDEO}${videoId}`;
/** @param {string} videoId */
export const indexKey = (videoId) => `${INDEX}${videoId}`;

/**
 * @param {string} key
 * @returns {{ kind: 'meta' | 'settings' } | { kind: 'video' | 'index', videoId: string } | null}
 */
export function parseKey(key) {
  if (key === KEY_META) return { kind: 'meta' };
  if (key === KEY_SETTINGS) return { kind: 'settings' };
  for (const [prefix, kind] of [[VIDEO, 'video'], [INDEX, 'index']]) {
    if (key.startsWith(prefix)) {
      const videoId = key.slice(prefix.length);
      return isVideoId(videoId) ? { kind, videoId } : null;
    }
  }
  return null;
}
