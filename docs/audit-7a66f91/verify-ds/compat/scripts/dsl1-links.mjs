// DS-L1: روابط Markdown النسبية. يصنّف كل رابط في ملفات .md المتتبعة (شجرة الالتزام) إلى: مكسور في Git، أو سليم في Git
// وغائب عن اللقطة. ويعدّ ذلك مرتين: على كل ملفات .md في Git، وعلى ملفات .md الموجودة في اللقطة وحدها (نطاق DeepSeek).
// قراءة فقط. الاستعمال: command node dsl1-links.mjs <جذر النسخة> <شجرة Git> <قائمة اللقطة>
import { readFileSync } from 'node:fs';
import path from 'node:path';
const [root, gitList, snapList] = process.argv.slice(2);
const git = new Set(readFileSync(gitList, 'utf8').split('\n').filter(Boolean));
const snap = new Set(readFileSync(snapList, 'utf8').split('\n').filter((l) => l && !l.endsWith('.DS_Store')));
const dirsOf = (set) => { const d = new Set(); for (const f of set) { let p = path.posix.dirname(f); while (p !== '.' && !d.has(p)) { d.add(p); p = path.posix.dirname(p); } } return d; };
const gitDirs = dirsOf(git), snapDirs = dirsOf(snap);
const has = (set, dirs, p) => set.has(p) || dirs.has(p.replace(/\/$/, ''));
function scan(mds) {
  const broken = [], snapOnly = [], site = [];
  for (const f of mds) {
    const text = readFileSync(path.join(root, f), 'utf8');
    const re = /\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
    let m;
    while ((m = re.exec(text))) {
      let t = m[1];
      if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(t)) continue;
      const line = text.slice(0, m.index).split('\n').length;
      if (t.startsWith('/')) { site.push(`${f}:${line} → ${t}`); continue; }
      t = decodeURIComponent(t.split('#')[0].split('?')[0]);
      if (!t) continue;
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(f), t));
      if (!has(git, gitDirs, target)) broken.push(`${f}:${line} → ${t}`);
      else if (!has(snap, snapDirs, target)) snapOnly.push(`${f}:${line} → ${target}`);
    }
  }
  return { broken, snapOnly, site, uniqueTargets: new Set(snapOnly.map((x) => x.split(' → ')[1])).size };
}
const gitMd = [...git].filter((f) => f.endsWith('.md'));
const snapMd = gitMd.filter((f) => snap.has(f));
for (const [label, list] of [['كل .md في Git', gitMd], ['.md الموجودة في اللقطة وحدها (نطاق DeepSeek)', snapMd]]) {
  const r = scan(list);
  console.log(`${label}: ${list.length} ملفًا · مكسور في Git ${r.broken.length} · سليم في Git وغائب عن اللقطة ${r.snapOnly.length} رابطًا (${r.uniqueTargets} هدفًا فريدًا) · مسارات موقع ${r.site.length}`);
  for (const x of r.broken) console.log('  R', x);
}
