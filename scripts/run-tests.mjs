#!/usr/bin/env node
// يشغّل كل ملفات *.test.js تحت مجلد بـnode:test. غياب الاختبارات فشل، إلا بـ--allow-empty لمجلد موجود لم تُكتب
// اختباراته بعد، فيُبلَّغ «لا اختبارات بعد» وينجح؛ والمجلد الغائب أو غير المقروء فشل دائمًا. لا سكربت في المشروع يمرّره اليوم.
//   node scripts/run-tests.mjs test/unit
//   node scripts/run-tests.mjs test/integration
// وكل اختبار مُتخطّى يُذكر باسمه وسببه في آخر المخرج، ويفشل التشغيل في CI (المتغير CI): لا تخطٍّ صامت.
// تحقق Gemini (ع-٢٩): لكل اختبار مهلة (--timeout=<ms>، والافتراضية سخية)، فاختبار معلّق يفشل باسمه بدل أن يعلّق التشغيل حتى مهلة
// CI. واختبار todo يُذكر باسمه كالمتخطّى: الفاشل منه فشلٌ دائمًا (كان node يخرج 0)، وأي todo في CI فشل.
// تحقق الجولة الثانية (ن-٧): لا --test-force-exit، فخطأ يقع بعد انتهاء الاختبار (مؤقت لاحق، وعد مرفوض متأخرًا) يُفشل التشغيل كما في
// 2.2.0. وعملية ملف بقيت حيةً بعد آخر اختباراته تخرج بالرمز 1 بعد مهلة إضافية باسمها (scripts/run-tests-exit-guard.mjs)، فلا يعلّق
// التشغيل اختبارٌ معلّق بمؤقت حي.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

/** مهلة الاختبار الواحد: أبطأ اختبار اليوم بضع ثوانٍ (البناء والتدقيق)، والمهلة أضعافه لأجهزة CI الأبطأ. */
const DEFAULT_TEST_TIMEOUT_MS = 120_000;

const args = process.argv.slice(2);
const allowEmpty = args.includes('--allow-empty');
const timeoutArg = args.find((a) => a.startsWith('--timeout='));
const timeoutMs = timeoutArg ? Number(timeoutArg.slice('--timeout='.length)) : DEFAULT_TEST_TIMEOUT_MS;
if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
  console.error(`run-tests: ${timeoutArg} ليس عددًا صحيحًا موجبًا بالملي ثانية`);
  process.exit(2);
}
const dirs = args.filter((a) => a !== '--allow-empty' && a !== timeoutArg);
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
// تقرير TAP في ملف جانبي لعدّ التخطي، ومخرج spec المعتاد كما كان.
const scratch = mkdtempSync(path.join(tmpdir(), 'tj-run-tests-'));
const tapFile = path.join(scratch, 'report.tap');
const r = spawnSync(process.execPath, [
  '--test', `--test-timeout=${timeoutMs}`, `--import=${pathToFileURL(path.join(ROOT, 'scripts/run-tests-exit-guard.mjs')).href}`,
  '--test-reporter=spec', '--test-reporter-destination=stdout', '--test-reporter=tap', `--test-reporter-destination=${tapFile}`,
  ...files.map((f) => path.relative(ROOT, f)),
], { cwd: ROOT, stdio: 'inherit' });
let skipped = [];
let todos = [];
let todoFailed = [];
try {
  const tap = readFileSync(tapFile, 'utf8').split('\n');
  /** سطور TAP بتوجيه (SKIP أو TODO): الاسم والسبب، و`not ok` للفاشل. */
  const marked = (directive) => tap.map((l) => new RegExp(`^\\s*(not )?ok \\d+ - (.*?) # ${directive}\\b\\s*(.*)$`).exec(l)).filter(Boolean)
    .map((m) => ({ failed: !!m[1], text: `${m[2]} (${m[3] || 'بلا سبب'})` }));
  skipped = marked('SKIP').map((x) => x.text);
  todos = marked('TODO').map((x) => x.text);
  todoFailed = marked('TODO').filter((x) => x.failed).map((x) => x.text);
} catch {
  console.error('run-tests: تعذّرت قراءة تقرير التخطي');
  process.exitCode = 1;
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
if (skipped.length) {
  console.error(`run-tests: مُتخطّى ${skipped.length}:\n- ${skipped.join('\n- ')}`);
  if (process.env.CI) {
    console.error('run-tests: التخطي ممنوع في CI');
    process.exit(1);
  }
}
if (todos.length) {
  console.error(`run-tests: todo ${todos.length}:\n- ${todos.join('\n- ')}`);
  if (todoFailed.length) {
    console.error(`run-tests: todo فاشل ${todoFailed.length}، والفاشل فشلٌ لا «todo»:\n- ${todoFailed.join('\n- ')}`);
    process.exit(1);
  }
  if (process.env.CI) {
    console.error('run-tests: todo ممنوع في CI');
    process.exit(1);
  }
}
if (r.signal) console.error(`run-tests: انتهت عملية node --test بالإشارة ${r.signal}`);
// تقرير لم يُقرأ (exitCode أعلاه) لا يُمحى بنجاح node.
process.exit(r.status === 0 ? (process.exitCode ?? 0) : (r.status ?? 1));
