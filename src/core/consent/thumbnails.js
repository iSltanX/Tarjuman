// موافقة صور المحفوظات في Firefox (قرار سلطان 2026-11-04، docs/site/README.md «حكم required: none»): الصور تُطلب من
// i.ytimg.com بمعرّف كل فيديو محفوظ، وهو نقل إلى طرف ثالث بتعريف Mozilla، أقرب فئاته browsingActivity. فبناء Firefox يعلنها
// في data_collection_permissions.optional (scripts/targets.mjs)، ولا تُعرض الصور فيه إلا بالموافقة والمفتاح معًا؛ والمفتاح يطلب
// الموافقة عند تفعيله، فتبقى مطفأة حتى يوافق المستخدم. وعائلة Chromium بلا آلية موافقة كهذه: الصور بالمفتاح وحده كما كانت.
// والمستخدم يسحب الموافقة من صفحة إضافات Firefox، فتُقرأ لحظة الحاجة ولا تُحفظ.

/** فئة Mozilla لصور المحفوظات. */
export const THUMBS_DATA = 'browsingActivity';

/** هدف البناء من عنوان الصفحة، كتشخيص البلاغ: moz-extension: في Firefox وحده. @param {Location} [loc] */
export const buildTarget = (loc = globalThis.location) => (loc?.protocol === 'moz-extension:' ? 'firefox' : 'chromium');

/** هل تحتاج الصور موافقة؟ في Firefox وحده. @param {'chromium' | 'firefox'} target */
export const needsConsent = (target) => target === 'firefox';

/**
 * الموافقة ممنوحة الآن؟ Chromium: نعم دائمًا. Firefox: browsingActivity في data_collection من permissions.getAll()، وأي فشل «لا».
 * @param {{ permissions: { getAll: () => Promise<{ data_collection?: string[] }> } }} api @param {'chromium' | 'firefox'} target
 * @returns {Promise<boolean>}
 */
export function thumbnailsConsent(api, target) {
  if (!needsConsent(target)) return Promise.resolve(true);
  return Promise.resolve()
    .then(() => api.permissions.getAll())
    .then((p) => Array.isArray(p?.data_collection) && p.data_collection.includes(THUMBS_DATA), () => false);
}

/**
 * طلب الموافقة: يُستدعى أول ما في تفعيل المفتاح قبل أي انتظار، فـFirefox لا يطلبها خارج فعل المستخدم. والممنوحة سابقًا تعيد
 * true بلا سؤال. Chromium: true بلا طلب.
 * @param {{ permissions: { request: (p: object) => Promise<boolean> } }} api @param {'chromium' | 'firefox'} target
 * @returns {Promise<boolean>}
 */
export function requestThumbnailsConsent(api, target) {
  if (!needsConsent(target)) return Promise.resolve(true);
  try {
    return Promise.resolve(api.permissions.request({ data_collection: [THUMBS_DATA] })).then((granted) => granted === true, () => false);
  } catch {
    return Promise.resolve(false);
  }
}

/** هل تُعرض الصور؟ المفتاح والموافقة معًا. @param {unknown} pref @param {boolean} granted */
export const thumbnailsShown = (pref, granted) => pref === true && granted === true;
