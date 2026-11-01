#!/usr/bin/env node
// يشغّل كل ملفات *.test.js تحت مجلد بـnode:test. مجلد بلا اختبارات بعد (مثل test/integration قبل W3)
// يُبلَّغ عنه «لا اختبارات بعد» وينجح، فلا يُسجَّل غائبٌ ناجحًا ولا يُفشل الموجة.
//   node scripts/run-tests.mjs test/unit [test/integration …]
import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.name.endsWith('.test.js')) out.push(p);
  }
  return out;
}

const dirs = process.argv.slice(2);
const files = (await Promise.all(dirs.map((d) => walk(path.resolve(ROOT, d))))).flat().sort();
if (!files.length) {
  console.log(`run-tests: لا اختبارات بعد في ${dirs.join('، ')}`);
  process.exit(0);
}
const r = spawnSync(process.execPath, ['--test', ...files.map((f) => path.relative(ROOT, f))], { cwd: ROOT, stdio: 'inherit' });
process.exit(r.status ?? 1);
