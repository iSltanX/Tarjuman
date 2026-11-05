// موافقة صور المحفوظات في Firefox (قرار سلطان 2026-11-04، docs/site/README.md «حكم required: none»): الصور تُطلب من
// i.ytimg.com بمعرّف كل فيديو محفوظ، وهو نقل إلى طرف ثالث بتعريف Mozilla، أقرب فئاته browsingActivity. فبناء Firefox يعلنها
// في data_collection_permissions.optional (scripts/targets.mjs)، ولا تُعرض الصور فيه إلا بالموافقة والمفتاح معًا؛ والمفتاح يطلب
// الموافقة عند تفعيله، فتبقى مطفأة حتى يوافق المستخدم. وعائلة Chromium بلا آلية موافقة كهذه: الصور بالمفتاح وحده كما كانت.
// والمستخدم يسحب الموافقة من صفحة إضافات Firefox، فتُقرأ لحظة الحاجة ولا تُحفظ: عند الفتح، ومع أحداث الأذونات، وعند ظهور
// الصفحة، وقبل إسناد عنوان كل صورة (تدقيق 7a66f91، U01).

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

/**
 * مراقبة الموافقة (تدقيق 7a66f91، U01): سحبها من صفحة إضافات Firefox لا يكتب في التخزين، فالصفحات المفتوحة تسمعه من
 * permissions.onRemoved وonAdded. fn({ revoked }) حيث revoked أن الحدث سحبٌ يذكر browsingActivity بعينها (فتُطفأ الصور فورًا قبل
 * إعادة القراءة)؛ وأي حدث آخر إشارة لإعادة القراءة. Chromium، أو غياب الحدثين: لا شيء. يعيد دالة إلغاء الاشتراك.
 * @param {{ permissions?: { onAdded?: object, onRemoved?: object } }} api @param {'chromium' | 'firefox'} target
 * @param {(e: { revoked: boolean }) => void} fn
 * @returns {() => void}
 */
export function watchThumbnailsConsent(api, target, fn) {
  if (!needsConsent(target)) return () => {};
  const subs = [];
  const on = (event, handler) => {
    try {
      if (typeof event?.addListener !== 'function') return;
      event.addListener(handler);
      subs.push(() => { try { event.removeListener(handler); } catch { /* سياق أُغلق */ } });
    } catch {
      // حدث غير مدعوم: إعادة القراءة عند الظهور وقبل كل صورة تكفي (الصفحات).
    }
  };
  on(api?.permissions?.onRemoved, (p) => fn({ revoked: Array.isArray(p?.data_collection) && p.data_collection.includes(THUMBS_DATA) }));
  on(api?.permissions?.onAdded, () => fn({ revoked: false }));
  return () => { for (const off of subs.splice(0)) off(); };
}
