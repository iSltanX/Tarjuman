// أدوات اختبار التزامن بين سياقين فوق مساحة تخزين واحدة (تدقيق 7a66f91، C2، DS-T-02). المساحة مشتركة كما في المتصفح،
// ولكل سياق مخزنه. armBeforeSet يُدخل فعل السياق الآخر في الفاصل بين آخر فحص وset، وهو الفاصل الذي كان العقد يقر به.

/** يمرّر n مهمة لاحقة (setTimeout 0)، فتنتهي سلاسل الوعود ويصل onChanged المعلّق. */
export async function turns(n = 40) {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
}

/** نتيجة وعد بلا رمي: { ok, value } أو { ok: false, code }. */
export function settled(p) {
  return Promise.resolve(p).then((value) => ({ ok: true, value }), (err) => ({ ok: false, code: err?.code ?? String(err), detail: err?.detail }));
}

/**
 * عند أول area.set تحمل المفتاح key بعد التسليح: يبدأ run (فعل السياق الآخر) ويُمهَل حتى ينتهي أو تمر turnsMax مهمة، ثم
 * تقع تلك الكتابة. قبل C2 كان الفعل الآخر يكتمل كله في هذا الفاصل؛ ومع الكاتب الواحد يبقى في طابوره حتى تنتهي.
 * @param {{ set: Function }} area المساحة الخام (يُستبدل set فيها مرة ثم يعود)
 * @param {string} key
 * @param {() => unknown} run
 * @returns {Promise<{ ok: boolean, value?: unknown, code?: string }>} نتيجة run
 */
export function armBeforeSet(area, key, run, { turnsMax = 40 } = {}) {
  const original = area.set;
  return new Promise((resolve) => {
    area.set = async (items) => {
      if (Object.hasOwn(items, key)) {
        area.set = original;
        const other = settled(Promise.resolve().then(run));
        resolve(other);
        await Promise.race([other, turns(turnsMax)]);
      }
      return original(items);
    };
  });
}
