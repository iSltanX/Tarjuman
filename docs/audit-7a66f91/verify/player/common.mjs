// مسارات مشتركة لسكربتات التحقق: النسخة المعزولة للقراءة فقط.
export const TJ = '$SCRATCH/tj';
export const imp = (rel) => import(`${TJ}/${rel}`);
export const settle = () => new Promise((r) => setTimeout(r, 0));
export const settleN = async (n = 5) => { for (let i = 0; i < n; i++) await settle(); };
export const log = (...a) => console.log(...a);
