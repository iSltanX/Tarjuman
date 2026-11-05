// أدوات مشتركة لتحقق بنود DeepSeek في مجال التخزين. تستورد المصدر وأدوات الاختبار من النسخة المعزولة بمسارات مطلقة (قراءة فقط).
import { TJ_ROOT } from '../../verify/_root.mjs';
export const TJ = TJ_ROOT;
export const load = (rel) => import(`${TJ}/${rel}`);
export const out = (scenario, obj) => console.log(JSON.stringify({ scenario, ...obj }));
/** يمرّر عدة مهام setTimeout حتى تنتهي سلاسل الوعود وإعادة القراءة. */
export const settleAll = async (n = 10) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };
export const clockFrom = (iso = '2026-11-01T12:00:00.000Z') => { let t = Date.parse(iso); return () => (t += 1000); };
export async function settle(p) {
  try { return { ok: true, value: await p }; } catch (e) { return { ok: false, code: e?.code ?? e?.name, detail: e?.detail ?? e?.message }; }
}
/**
 * غلاف سياق فوق مساحة مشتركة: hookBeforeSet(fn) يُنفّذ fn كاملة قبل أول set تالية لهذا السياق تحوي المفتاح المعطى،
 * أي بعد آخر إعادة فحص وقبل الكتابة (الفاصل الذي يقر به العقد §٣).
 */
export function hooked(area) {
  let hook = null;
  const wrapped = {
    ...area,
    async set(items) {
      if (hook && (!hook.key || items[hook.key] !== undefined)) { const h = hook; hook = null; await h.fn(); }
      return area.set(items);
    },
  };
  return { area: wrapped, before: (key, fn) => { hook = { key, fn }; } };
}
