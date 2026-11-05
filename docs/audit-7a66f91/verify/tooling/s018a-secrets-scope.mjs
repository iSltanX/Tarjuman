// يطبّق منطق scripts/check-secrets.mjs نفسه (findSecrets، والإعفاء نفسه للروابط العامة في .md) على مجلدات خارج SCOPES.
// قراءة فقط. الاستعمال: command node s018a-secrets-scope.mjs <جذر النسخة> <مجلد نسبي>...
import { readFile, readdir, stat, mkdtemp, writeFile, mkdir, cp } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [root, ...scopes] = process.argv.slice(2);
const { findSecrets } = await import(pathToFileURL(path.join(root, 'src/core/diagnostics/sanitize.js')));
const TEXT = /\.(json|srt|txt|log|md|csv|ndjson)$/i;
const SENSITIVE_HOST = /(?:youtu\.?be|youtube|google|googlevideo|ytimg|ggpht)/i;
async function walk(dir) {
  let entries; try { entries = await readdir(dir, { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const e of entries) { const p = path.join(dir, e.name); if (e.isDirectory()) out.push(...await walk(p)); else if (TEXT.test(e.name)) out.push(p); }
  return out;
}
for (const scope of scopes) {
  let scanned = 0; const findings = [];
  const abs = path.join(root, scope);
  const files = (await stat(abs)).isDirectory() ? await walk(abs) : [abs];
  for (const file of files) {
    scanned++;
    const rel = path.relative(root, file);
    const text = await readFile(file, 'utf8');
    for (const f of findSecrets(text)) {
      if (rel.endsWith('.md') && f.type === 'url' && !SENSITIVE_HOST.test(text.slice(f.index, f.index + f.length))) continue;
      findings.push(`${rel}@${f.index}: ${f.type} ${text.slice(f.index, f.index + Math.min(f.length, 60))}`);
    }
  }
  console.log(`${scope}: ${scanned} ملف، ${findings.length} اكتشاف`);
  for (const x of findings.slice(0, 15)) console.log('  - ' + x);
}
