// مفاتيح التخزين (عقد storage §١ و§٧ و§١٣). لا مفتاح خارج هذه القائمة. مفاتيح الإصدار الثاني لا تبدأ بـvideo: ولا index:
// وليست meta ولا settings، فيتجاهلها parseKey في حزمة الإصدار الأول (يعيد null) ولا تدخل قراءته ولا أحداثه. ومفاتيح 2.0.0
// (lang: وlangPrefs، AA1) جديدة كذلك على 1.1.0، فيتجاهلها parseKey فيه ولا تدخل مدققاته.
import { isVideoId } from '../model/ids.js';

export const KEY_META = 'meta';
export const KEY_SETTINGS = 'settings';
export const KEY_PREFS = 'prefs';
export const KEY_SAVES = 'saves';
/** تفضيلات اللغات في 2.0.0 (AA1): زوج التعليمات واللغات الأخيرة. مفتاح مستقل لأن prefs يقرؤه 1.1.0 بمدقق صارم. */
export const KEY_LANG_PREFS = 'langPrefs';
/** لغة واجهة الإضافة (عقد storage §١٤): مفتاح مستقل، لا يقرؤه أي إصدار سابق ولا يمس لغات الفيديو والترجمة. */
export const KEY_UI_LOCALE = 'uiLocale';
/**
 * قوائم المصطلحات لكل زوج لغتين (الفكرة ٨، عقد storage §١٥): مفتاح مستقل لا حقل في prefs ولا في المصطلح، لأن كاتب 1.1.0 يطبّع
 * prefs قبل كل كتابة فيُسقط ما لا يعرفه. يتجاهله parseKey في الإصدارات السابقة، ويزيله «مسح كل البيانات».
 */
export const KEY_GLOSSARIES = 'glossaries';
const VIDEO = 'video:';
const INDEX = 'index:';
const BUNDLE = 'bundle:';
const ALTS = 'alts:';
const PREV = 'prev:';
const MARKS = 'marks:';
const LANG = 'lang:';
const DRAFT = 'draft:';

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
/** بيانات اللغة للفيديو (AA1، عقد storage §١٣). @param {string} videoId */
export const langKey = (videoId) => `${LANG}${videoId}`;

/**
 * مسودة المحرّر للفيديو (الفكرة ٩، ح-48، عقد storage §١٦): خارج companionKeys وCOMPANION_KINDS عمدًا، فلا تدخل بصمة القيم الخام
 * (printKeys) ولا تُطلق onChange للمشغّل والمحفوظات، ولا تقرؤها الحزمة. تُزال مع الفيديو وفي كنس اليتيم و«مسح كل البيانات».
 * @param {string} videoId
 */
export const draftKey = (videoId) => `${DRAFT}${videoId}`;

/** توابع الفيديو في الإصدار الثاني و2.0.0 (تُزال معه). */
export const companionKeys = (videoId) => [bundleKey(videoId), altsKey(videoId), prevKey(videoId), marksKey(videoId), langKey(videoId)];

const PER_VIDEO = [[VIDEO, 'video'], [INDEX, 'index'], [BUNDLE, 'bundle'], [ALTS, 'alts'], [PREV, 'prev'], [MARKS, 'marks'], [LANG, 'lang'], [DRAFT, 'draft']];
export const COMPANION_KINDS = Object.freeze(['bundle', 'alts', 'prev', 'marks', 'lang']);

/**
 * @param {string} key
 * @returns {{ kind: 'meta' | 'settings' | 'prefs' | 'saves' | 'langPrefs' | 'uiLocale' | 'glossaries' }
 *   | { kind: 'video' | 'index' | 'bundle' | 'alts' | 'prev' | 'marks' | 'lang' | 'draft', videoId: string } | null}
 */
export function parseKey(key) {
  if (key === KEY_META) return { kind: 'meta' };
  if (key === KEY_SETTINGS) return { kind: 'settings' };
  if (key === KEY_PREFS) return { kind: 'prefs' };
  if (key === KEY_SAVES) return { kind: 'saves' };
  if (key === KEY_LANG_PREFS) return { kind: 'langPrefs' };
  if (key === KEY_UI_LOCALE) return { kind: 'uiLocale' };
  if (key === KEY_GLOSSARIES) return { kind: 'glossaries' };
  for (const [prefix, kind] of PER_VIDEO) {
    if (key.startsWith(prefix)) {
      const videoId = key.slice(prefix.length);
      return isVideoId(videoId) ? { kind, videoId } : null;
    }
  }
  return null;
}
