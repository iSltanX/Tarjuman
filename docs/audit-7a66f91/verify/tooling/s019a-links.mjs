// فاحص روابط Markdown النسبية: يقرأ ملفات .md المتتبعة من نسخة مطابقة للالتزام، ويحل كل رابط نسبي، ثم يصنّفه:
// غائب من شجرة Git عند الالتزام (عيب في المستودع) أو موجود في Git وغائب من اللقطة (أثر تصدير). قراءة فقط.
// الاستعمال: command node s019a-links.mjs <جذر النسخة> <قائمة شجرة Git> <قائمة اللقطة>
import { readFileSync } from 'node:fs';
import path from 'node:path';
const [root, gitList, snapList] = process.argv.slice(2);
const git = new Set(readFileSync(gitList, 'utf8').split('\n').filter(Boolean));
const snap = new Set(readFileSync(snapList, 'utf8').split('\n').filter(Boolean));
const dirsOf = (set) => { const d = new Set(); for (const f of set) { let p = path.posix.dirname(f); while (p !== '.' && !d.has(p)) { d.add(p); p = path.posix.dirname(p); } } return d; };
const gitDirs = dirsOf(git), snapDirs = dirsOf(snap);
const has = (set, dirs, p) => set.has(p) || dirs.has(p.replace(/\/$/, ''));
const mds = [...git].filter((f) => f.endsWith('.md'));
const repoBroken = [], snapOnly = [];
for (const f of mds) {
  const text = readFileSync(path.join(root, f), 'utf8');
  // [نص](هدف) و<a href="هدف">، دون روابط مطلقة ولا مراسٍ وحدها
  const re = /\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)|href="([^"]+)"/g;
  let m;
  while ((m = re.exec(text))) {
    let t = m[1] ?? m[2];
    if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(t)) continue;
    t = decodeURI(t.split('#')[0].split('?')[0]);
    if (!t) continue;
    const target = t.startsWith('/') ? t.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(f), t));
    const line = text.slice(0, m.index).split('\n').length;
    if (!has(git, gitDirs, target)) repoBroken.push(`${f}:${line} → ${t}`);
    else if (!has(snap, snapDirs, target)) snapOnly.push(`${f}:${line} → ${target}`);
  }
}
console.log(`ملفات md المتتبعة: ${mds.length}`);
console.log(`روابط مكسورة في المستودع عند الالتزام: ${repoBroken.length}`);
for (const x of repoBroken) console.log('  R ' + x);
console.log(`روابط سليمة في Git وغائبة من اللقطة وحدها: ${snapOnly.length}`);
const byTarget = new Map();
for (const x of snapOnly) { const t = x.split(' → ')[1].split('/').slice(0, 3).join('/'); byTarget.set(t, (byTarget.get(t) ?? 0) + 1); }
for (const [t, n] of [...byTarget].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  S ${n}× ${t}`);
