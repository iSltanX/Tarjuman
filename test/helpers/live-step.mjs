// خطوة الاختبار الحي وفحوصها (تدقيق 7a66f91، U69): منطق خالص بلا متصفح، يستورده test/live/review/run.mjs ويختبره
// test/unit/c8-live-step.test.js. كانت الخطوة تسجّل استثناءها باسمها، فإن كان فحصها الأول نجح بالاسم نفسه ظهر الاسم مرتين وبقي
// العدد كما هو، وخفي أن ما بعده لم يُنفّذ (fingerprint-upload-no-false-drift حين سقط اختيار الملف). والآن كل فحص متوقع لم يُسجَّل
// قبل الاستثناء يُسجَّل باسمه فاشلًا «لم يُنفّذ»، وإن رمت الخطوة بعد فحوصها كلها فباسم ‹الخطوة›-step.

/**
 * @param {{ checks: { id: string }[] }} result سجل النتائج
 * @param {(id: string, ok: boolean, detail?: unknown) => void} check يضيف فحصًا إلى السجل
 * @returns {(name: string, fn: () => Promise<void>, expects?: string[]) => Promise<void>}
 */
export function makeStep(result, check) {
  return async function step(name, fn, expects = [name]) {
    const before = result.checks.length;
    try {
      await fn();
    } catch (err) {
      const error = String(err?.message ?? err).replace(/https?:\/\/\S+/g, '[رابط]').slice(0, 300);
      const done = new Set(result.checks.slice(before).map((c) => c.id));
      const skipped = expects.filter((id) => !done.has(id));
      for (const id of skipped) check(id, false, { notRun: true, step: name, error });
      if (!skipped.length) check(`${name}-step`, false, { step: name, error });
    }
  };
}
