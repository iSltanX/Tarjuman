#!/usr/bin/env node
// يشغّل كل ملفات *.test.js تحت مجلد بـnode:test. غياب الاختبارات فشل، إلا بـ--allow-empty لمجلد موجود لم تُكتب
// اختباراته بعد، فيُبلَّغ «لا اختبارات بعد» وينجح؛ والمجلد الغائب أو غير المقروء فشل دائمًا. لا سكربت في المشروع يمرّره اليوم.
//   node scripts/run-tests.mjs test/unit
//   node scripts/run-tests.mjs test/integration
import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// مجلد مطلوب غائب أو لا يُقرأ فشلٌ لا «لا اختبارات» (تدقيق Fable، FA-10): كان الخطأ يُبتلع فيُقرأ المجلد فارغًا، ومع
// --allow-empty ينجح التشغيل بلا اختبار واحد.
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
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
let files;
try {
  files = (await Promise.all(dirs.map((d) => walk(path.resolve(ROOT, d))))).flat().sort();
} catch (err) {
  console.error(`run-tests: تعذّرت قراءة ${path.relative(ROOT, err.path ?? '') || err.path || 'المجلد'} (${err.code ?? err.message})`);
  process.exit(1);
}
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
