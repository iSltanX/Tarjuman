// أدوات مشتركة لسكربتات التحقق: استيراد وحدات المصدر بمسارات مطلقة من النسخة المعزولة (قراءة فقط).
export const TJ = '$SCRATCH/tj';
export const load = (rel) => import(`${TJ}/${rel}`);
export const out = (scenario, obj) => console.log(JSON.stringify({ scenario, ...obj }));
export const tick = () => new Promise((r) => setTimeout(r, 0));
/** بوابة: wait() يعلّق حتى open(). */
export function gate() {
  let open;
  const p = new Promise((r) => { open = r; });
  return { wait: () => p, open: () => open() };
}
