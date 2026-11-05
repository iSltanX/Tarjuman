// مسار النسخة المعزولة وحده (للقراءة والتشغيل). لا كتابة فيها.
export const T = '$SCRATCH/tj';
export const imp = (p) => import(`${T}/${p}`);
export const log = (...a) => console.log(...a);
