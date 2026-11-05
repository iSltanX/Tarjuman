// H-03: نسخة احتياطية قرب حد 512 م.ب وحد طول النص في V8. (1) حد V8 الفعلي وسلوك JSON.stringify عند تجاوزه، (2) ما تعرضه صفحة
// الإعدادات إن رمى JSON.stringify داخل createBackup (حقن RangeError نفسه دون بناء نصف غيغابايت من الحزم)، (3) قراءة ملف يرمي
// text() عنده (المسار الوحيد الذي يبلغه ملف ASCII بين 536,870,889 و536,870,912 بايت)، (4) حساب ما ينشئه ترجمان نفسه.
import { constants } from 'node:buffer';
import { backup, buttonNamed, mountSettings, newStore, noPause, out, sampleBundle, seedBundle, settle, textOf, findAll, IDS, errors } from './_h.mjs';

const MAX = constants.MAX_STRING_LENGTH;
// (1)
{
  const s = 'a'.repeat(270_000_000);
  let r;
  try { r = `ok ${JSON.stringify([s, s]).length}`; } catch (e) { r = `${e.name}: ${e.message}`; }
  out('H-03 (1) حد V8', { node: process.version, MAX_STRING_LENGTH: MAX, maxBytes512MiB: 512 * 1024 * 1024, diff: 512 * 1024 * 1024 - MAX, jsonStringifyTwo270M: r });
}
// (2)
{
  const dst = newStore();
  await seedBundle(dst.store, sampleBundle({ videoId: IDS[0] }));
  const m = await mountSettings(dst);
  const real = dst.store.getPrefs;
  dst.store.getPrefs = async () => ({ ...(await real()), toJSON() { throw new RangeError('Invalid string length'); } });
  buttonNamed(m.root, 'إنشاء نسخة احتياطية').click();
  await settle(20);
  const alerts = findAll(m.root, (e) => e.classList?.contains?.('tj-alert')).map((e) => textOf(e)).filter((t) => /نسخة|خطأ|تعذّر/.test(t));
  out('H-03 (2) RangeError من JSON.stringify داخل createBackup', { saves: m.calls.saves.length, alerts });
}
// (3)
{
  const r = await backup.readBackup({ size: MAX + 10, text: async () => { throw new RangeError('Invalid string length'); } }, { pause: noPause });
  out('H-03 (3) text() يرمي لملف تحت 512 MiB', { ok: r.ok, code: r.code, message: errors.messageFor(r.code) });
}
// (4)
{
  const units = 256 * 1024 * 1024;
  out('H-03 (4) أقصى ما ينشئه ترجمان', { maxSavedUnits: units, belowV8: units < MAX, note: 'النص المحفوظ ≤ 256 Mi وحدة، فقراءته تعطي النص نفسه ≤ 256 Mi وحدة أيًا كان حجمه بالبايت' });
}
