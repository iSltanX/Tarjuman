// جسر MAIN → ISOLATED باتجاه واحد (عقد messages §١). يقبل رسائل نافذة الصفحة نفسها وأصلها فقط، بالحقل
// source='tarjuman'، ويمرّر البيانات كما هي إلى المستخرج الذي يتحقق من بنيتها (src/extract، P3). لا يرسل
// شيئًا إلى الصفحة أبدًا، فلا أوامر من الصفحة إلى الإضافة.

export const BRIDGE_SOURCE = 'tarjuman';

/**
 * @param {(data: unknown) => void} onData بيانات غير موثوقة
 * @param {Window} [win]
 * @returns {() => void} إلغاء الاستماع
 */
export function installBridge(onData, win = window) {
  const handler = (event) => {
    if (event.source !== win || event.origin !== win.location.origin) return;
    const d = event.data;
    if (!d || typeof d !== 'object' || d.source !== BRIDGE_SOURCE) return;
    onData(d);
  };
  win.addEventListener('message', handler);
  return () => win.removeEventListener('message', handler);
}
