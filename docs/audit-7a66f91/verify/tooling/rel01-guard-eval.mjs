// يقيّم شرط الحارس في scripts/build.mjs:27-28 (منسوخًا حرفيًا) على مسارات مرشّحة، دون تشغيل البناء ولا الحذف.
import path from 'node:path';
import os from 'node:os';
const ROOT = '<repo>';
const SRC = path.join(ROOT, 'src');
const inside = (child, parent) => !path.relative(parent, child).startsWith('..') && !path.isAbsolute(path.relative(parent, child));
const refused = (OUT) => inside(ROOT, OUT) || inside(OUT, SRC);
const cands = ['.', '..', 'src', 'src/x', 'dist', '.git', 'scripts', 'docs', 'docs/evidence/T8', 'test', 'node_modules', '.claude/worktrees', os.homedir(), path.join(os.homedir(), 'Documents'), '<reports>', 'src/..foo'];
for (const c of cands) {
  const OUT = path.resolve(ROOT, c);
  console.log(`${refused(OUT) ? 'يُرفض ' : 'يُقبل ويُمسح'}  --out ${c}  →  ${OUT}`);
}
