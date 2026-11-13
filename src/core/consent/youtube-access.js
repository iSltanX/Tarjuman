// إذن يوتيوب نفسه (الفكرة ٣-أ، ح-39 وح-41): الإذن الذي مُنح عند التثبيت بنمط content_scripts.matches في البيان (YOUTUBE_MATCHES)،
// لا إذن جديد ولا اختياري، والبيان لا يتغير. يسحبه المستخدم من متصفحه (Firefox: أذونات الإضافة؛ وChromium: «الوصول إلى المواقع»
// عند النقر)، فلا يُحقن سكربت المحتوى ولا تعمل أدوات ترجمان في يوتيوب. فيُقرأ بـpermissions.contains، ويُعاد طلبه بـpermissions.request
// من صفحة الإعدادات وحدها (قسم «التشخيص»)، والنافذة تحيل إليها؛ وفحص الحزمة permissions-request-settings-only يحرس ذلك. والمنح
// لا يحقن السكربت في تبويب مفتوح، فتُعاد صفحة يوتيوب تحميلًا بعده.
import { YOUTUBE_MATCHES } from '../model/ids.js';

/**
 * الإذن قائم الآن؟ true ممنوح، وfalse مسحوب، وnull لا يُعرف (غياب الواجهة أو رفضها أو قيمة غير منطقية): لا ادعاء بلا دليل.
 * @param {{ permissions?: { contains?: (p: { origins: string[] }) => Promise<boolean> } } | undefined} api
 * @returns {Promise<boolean | null>}
 */
export function youtubeAccess(api) {
  return Promise.resolve()
    .then(() => api.permissions.contains({ origins: [...YOUTUBE_MATCHES] }))
    .then((has) => (typeof has === 'boolean' ? has : null), () => null);
}

/**
 * إعادة طلب الإذن: يُستدعى أول ما في الضغطة قبل أي انتظار، فالمتصفح لا يطلبه خارج فعل المستخدم. أصل يوتيوب المعلن وحده، والممنوح
 * يعود بلا سؤال. والرفض أو الخطأ «لا».
 * @param {{ permissions?: { request?: (p: { origins: string[] }) => Promise<boolean> } } | undefined} api
 * @returns {Promise<boolean>}
 */
export function requestYoutubeAccess(api) {
  try {
    return Promise.resolve(api.permissions.request({ origins: [...YOUTUBE_MATCHES] })).then((granted) => granted === true, () => false);
  } catch {
    return Promise.resolve(false);
  }
}

/**
 * مراقبة الإذن: سحبه أو منحه من صفحة إضافات المتصفح لا يكتب في التخزين، فالصفحة المفتوحة تسمعه من permissions.onAdded وonRemoved،
 * وكل حدث إشارة لإعادة القراءة (fn). وغياب الحدثين: لا شيء، وتكفي إعادة القراءة عند ظهور الصفحة. يعيد دالة إلغاء الاشتراك.
 * @param {{ permissions?: { onAdded?: object, onRemoved?: object } } | undefined} api @param {() => void} fn
 * @returns {() => void}
 */
export function watchYoutubeAccess(api, fn) {
  const subs = [];
  const handler = () => fn();
  for (const event of [api?.permissions?.onAdded, api?.permissions?.onRemoved]) {
    try {
      if (typeof event?.addListener !== 'function') continue;
      event.addListener(handler);
      subs.push(() => { try { event.removeListener(handler); } catch { /* سياق أُغلق */ } });
    } catch {
      // حدث غير مدعوم: إعادة القراءة عند ظهور الصفحة تكفي.
    }
  }
  return () => { for (const off of subs.splice(0)) off(); };
}
