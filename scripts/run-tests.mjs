#!/usr/bin/env node
// يشغّل كل ملفات *.test.js تحت مجلد بـnode:test. غياب الاختبارات فشل، إلا بـ--allow-empty لمجلد لم تُكتب
// اختباراته بعد (مثل test/integration قبل W3)، فيُبلَّغ «لا اختبارات بعد» وينجح.
//   node scripts/run-tests.mjs test/unit
//   node scripts/run-tests.mjs --allow-empty test/integration
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

const args = process.argv.slice(2);
const allowEmpty = args.includes('--allow-empty');
const dirs = args.filter((a) => a !== '--allow-empty');
const files = (await Promise.all(dirs.map((d) => walk(path.resolve(ROOT, d))))).flat().sort();
if (!files.length) {
  if (!allowEmpty) {
    console.error(`run-tests: لا ملفات اختبار في ${dirs.join('، ') || '(لا مجلد)'}`);
    process.exit(1);
  }
  console.log(`run-tests: لا اختبارات بعد في ${dirs.join('، ')}`);
  process.exit(0);
}
const r = spawnSync(process.execPath, ['--test', ...files.map((f) => path.relative(ROOT, f))], { cwd: ROOT, stdio: 'inherit' });
process.exit(r.status ?? 1);
