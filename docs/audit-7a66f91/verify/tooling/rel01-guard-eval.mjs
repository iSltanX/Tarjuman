// يقيّم شرط الحارس في scripts/build.mjs:27-28 عند 7a66f91 (منسوخًا حرفيًا) على مسارات مرشّحة، دون تشغيل البناء ولا الحذف.
// وبعد C8 (U60) يقيّم معه الحارس الحالي outDirProblem من scripts/targets.mjs في الشجرة المفحوصة، إن وُجد.
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { TJ_ROOT } from '../_root.mjs';
const ROOT = TJ_ROOT;
const SRC = path.join(ROOT, 'src');
const inside = (child, parent) => !path.relative(parent, child).startsWith('..') && !path.isAbsolute(path.relative(parent, child));
const refused = (OUT) => inside(ROOT, OUT) || inside(OUT, SRC);
const cands = ['.', '..', 'src', 'src/x', 'dist', '.git', 'scripts', 'docs', 'docs/evidence/T8', 'test', 'node_modules', '.claude/worktrees', os.homedir(), path.join(os.homedir(), 'Documents'), '<reports>', 'src/..foo'];
const { outDirProblem } = await import(pathToFileURL(path.join(ROOT, 'scripts/targets.mjs')));
for (const c of cands) {
  const OUT = path.resolve(ROOT, c);
  const now = outDirProblem ? await outDirProblem(OUT, { root: ROOT }) : undefined;
  const current = now === undefined ? '' : `  | الحالي: ${now === null ? 'يُقبل (غائب أو فارغ أو مجلد بناء)' : `يُرفض (${now})`}`;
  console.log(`${refused(OUT) ? 'يُرفض ' : 'يُقبل ويُمسح'}  --out ${c}  →  ${OUT}${current}`);
}
