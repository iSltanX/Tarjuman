// جذر الشيفرة المستهدفة ومجلد الكتابة المؤقت لكل سكربتات verify/ وverify-ds/ (وحدة مشتركة واحدة).
//   TJ_ROOT    جذر الشيفرة المفحوصة: المتغير إن وُجد، وإلا جذر المستودع الحالي (محسوبًا من موضع هذا الملف).
//              لإعادة الأدلة على الالتزام الأصلي: git archive 7a66f91 | tar -x -C "$DIR" ثم TJ_ROOT="$DIR".
//   TJ_SCRATCH مجلد المخرجات والنسخ المؤقتة: المتغير إن وُجد، وإلا مجلد فرعي في os.tmpdir(). لا كتابة داخل المستودع.
import os from 'node:os';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const TJ_ROOT = process.env.TJ_ROOT
  ? path.resolve(process.env.TJ_ROOT)
  : path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
export const TJ_SCRATCH = path.resolve(process.env.TJ_SCRATCH || path.join(os.tmpdir(), 'tj-audit-verify'));

/** مجلد مؤقت باسم فرعي ثابت (يُنشأ إن لم يوجد). */
export function scratchDir(...parts) {
  const dir = path.join(TJ_SCRATCH, ...parts);
  mkdirSync(dir, { recursive: true });
  return dir;
}
