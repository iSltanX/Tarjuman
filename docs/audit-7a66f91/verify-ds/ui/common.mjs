// مسار النسخة المعزولة وحده (للقراءة والتشغيل). لا كتابة فيها.
import { TJ_ROOT } from '../../verify/_root.mjs';
export const T = TJ_ROOT;
export const imp = (p) => import(`${T}/${p}`);
export const log = (...a) => console.log(...a);
