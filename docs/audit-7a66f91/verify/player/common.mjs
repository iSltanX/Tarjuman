// مسارات مشتركة لسكربتات التحقق: النسخة المعزولة للقراءة فقط.
import { TJ_ROOT } from '../_root.mjs';
export const TJ = TJ_ROOT;
export const imp = (rel) => import(`${TJ}/${rel}`);
export const settle = () => new Promise((r) => setTimeout(r, 0));
export const settleN = async (n = 5) => { for (let i = 0; i < n; i++) await settle(); };
export const log = (...a) => console.log(...a);
