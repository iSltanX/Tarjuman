// مصدر الحزمة وبيئتها في ملفات الوصف (package.mjs وstore.mjs)، والفحص الثابت قبل أي تغليف (تدقيق 7a66f91):
// - U62: الالتزام وحال الشجرة من Git هذا المستودع وحده. فإن غاب Git، أو كانت النسخة داخل مستودع آخر، فهما null لا «نظيفة»
//   (كان dirty يُكتب false بلا Git لأن Boolean(null) خطأ، فيدّعي الوصف شجرة نظيفة لا يعرف حالها).
// - U63: بصمة الأرشيف تتبع مكتبة zlib المربوطة بـNode لا إصداره وحده (Node من Homebrew المربوط بـzlib النظام يعطي أرشيفًا غير
//   ما تعطيه النسخ الرسمية بـzlib المضمّن، والملفات داخله متطابقة بايتًا). فتُكتب البيئة مع البصمات، وضمان إعادة الإنتاج بصمات الملفات.
// - U61: npm run package يفحص المصدر بـcheck-static قبل البناء، فلا تُغلَّف شيفرة يمنعها الفحص ولو تُخطّي check:wave.
import { execFileSync, spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import path from 'node:path';

function git(root, args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

/**
 * الالتزام وحال الشجرة للمسارات المعطاة، أو null لكليهما حين لا يُعرف (لا Git، أو جذر Git غير جذر المستودع).
 * @param {string} root جذر المستودع @param {string[]} paths
 * @returns {{ commit: string|null, dirty: boolean|null }}
 */
export function sourceState(root, paths) {
  const top = git(root, ['rev-parse', '--show-toplevel']);
  let same = false;
  try {
    same = top !== null && realpathSync(top) === realpathSync(root);
  } catch {
    same = false;
  }
  if (!same) return { commit: null, dirty: null };
  const commit = git(root, ['rev-parse', '--short=12', 'HEAD']);
  const status = git(root, ['status', '--porcelain', '--', ...paths]);
  return { commit, dirty: status === null ? null : status.length > 0 };
}

/** بيئة البناء التي تتبعها بصمة الأرشيف (zlib) وتعرّف الجهاز (المعمارية والنظام). */
export function buildEnvironment() {
  return { node: process.versions.node, zlib: process.versions.zlib, arch: process.arch, platform: process.platform };
}

/** وصف حال الشجرة في سطر الختام. @param {boolean|null} dirty */
export const dirtyNote = (dirty) => (dirty === null ? ' (حال الشجرة غير معروفة: لا Git لهذا المستودع)' : dirty ? ' (من شجرة فيها تغييرات غير ملتزمة)' : '');

/**
 * الفحص الثابت على src (scripts/check-static.mjs) قبل البناء.
 * @param {string} root @returns {{ ok: boolean, output: string }}
 */
export function staticCheck(root) {
  const r = spawnSync(process.execPath, [path.join(root, 'scripts/check-static.mjs')], { cwd: root, encoding: 'utf8' });
  return { ok: r.status === 0, output: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
}
