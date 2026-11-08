#!/usr/bin/env node
// فحص آلي لخلو العينات والسجلات من pot والتواقيع والروابط وملفات الارتباط والرموز ومسارات الجهاز المحلية.
// يمرّ على test/fixtures/ وعينات test/e2e/fixtures/ (ترجمات حقيقية). الوثائق السردية (.md) فيهما قد تذكر روابط مراجع
// عامة، أما روابط يوتيوب وجوجل والأسرار فممنوعة فيها أيضًا. يخرج برمز 1 عند أي اكتشاف.
// ويمتد (تدقيق V2، U-047) إلى كل ملف نصي متتبَّع في Git خارج هذه النطاقات: الأسرار ومسارات الجهاز المحلية، دون قاعدة الروابط
// (الشيفرة والوثائق تذكر روابط عامة بحق)، إلا ما ورد في EXCLUDED أدناه بسببه. وحين لا يتوفر Git يمشي على الشجرة نفسها.
import { execFileSync } from 'node:child_process';
import { readFile, readdir, realpath, lstat, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findSecrets } from '../src/core/diagnostics/sanitize.js';

// --root <مجلد> لفحص شجرة أخرى (لاختبار الفحص نفسه، تدقيق Fable، FA-11).
const rootArg = process.argv.indexOf('--root');
if (rootArg > -1 && !process.argv[rootArg + 1]) {
  console.error('check-secrets: --root يحتاج مجلدًا');
  process.exit(2);
}
const ROOT = rootArg > -1 ? path.resolve(process.argv[rootArg + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCOPES = ['test/fixtures', 'test/e2e/fixtures'];
const TEXT = /\.(json|srt|txt|log|md|csv|ndjson)$/i;
const SENSITIVE_HOST = /(?:youtu\.?be|youtube|google|googlevideo|ytimg|ggpht)/i;
// مسارات الجهاز المحلية (اسم المستخدم والقرص ومجلدات الجلسات المؤقتة) لا تدخل العيّنات ولا السجلات؛ تُكتب برمز عام مثل $SCRATCH/.
const LOCAL_PATH = /(?:\/Users\/[^/\s"'`]+\/|\/private\/(?:tmp|var)\/|\/Volumes\/[^/\s"'`]+\/|\b[A-Za-z]:\\Users\\)/g;

// ما يُستثنى من الفحص الموسَّع وحده (لا من نطاقات العيّنات أعلاه)، وسبب كل بند. إضافة بند تحتاج سببًا يُكتب هنا.
const EXTRA_TEXT = /\.(json|srt|txt|log|md|csv|ndjson|js|mjs|cjs|css|html|yml|yaml|svg|webmanifest|toml)$|(^|\/)\.[a-z]+ignore$/i;
const EXTRA_IGNORED_TYPES = ['url', 'timedtext-path']; // الروابط العامة ومسار timedtext مذكوران في الشيفرة والوثائق بحق
const EXCLUDED = [
  // تعريف الأنماط نفسه وسلسلة التوريد.
  ['src/core/diagnostics/sanitize.js', 'تعريف أنماط التنقية: يحوي أسماء الترويسات وملفات الارتباط'],
  ['test/fixtures/', 'نسخ مصدرية قديمة مجمَّدة للإصدارات السابقة (تحوي تعريف الأنماط نفسه)؛ ونصوصها غير الشيفرة تُفحص بنطاقات العيّنات أعلاه'],
  ['package-lock.json', 'تجزئات سلامة الحزم تشبه الرموز الطويلة'],
  // اختبارات تحوي نماذج وهمية مقصودة لاختبار التنقية والكشف.
  ['test/unit/diagnostics/sanitize.test.js', 'نماذج أسرار وهمية لاختبار التنقية'],
  ['test/unit/report/personal-secrets.test.js', 'نماذج أسرار وهمية لاختبار تقرير التشخيص'],
  ['test/unit/pages/settings/report.test.js', 'نماذج ملفات ارتباط وهمية لاختبار البلاغ'],
  ['test/e2e/static/messages-diagnostics.test.js', 'نماذج ملفات ارتباط وهمية لاختبار رسائل التشخيص'],
  ['test/unit/extract/extract.test.js', 'روابط timedtext وهمية بمعاملات pot وهمية'],
  ['test/unit/extract/extractor.test.js', 'روابط timedtext وهمية بمعاملات pot وهمية'],
  ['test/unit/model/errors.test.js', 'رابط وهمي بمعاملات وهمية لاختبار تنقية الأخطاء'],
  ['test/unit/player/overlay/errors.test.js', 'رابط وهمي بمعاملات وهمية لاختبار تنقية الأخطاء'],
  ['test/integration/roundtrip/roundtrip.test.js', 'سلاسل طويلة وهمية لاختبار الذهاب والإياب'],
  ['test/unit/store/av2-wg2.test.js', 'سلاسل طويلة وهمية لاختبار التخزين'],
  ['test/live/audit-c1/run.mjs', 'ترويسة وهمية في سيناريو حي مقصود'],
  ['test/unit/pages/settings/view.test.js', 'مسار جهاز وهمي لاختبار عرض المسارات'],
  ['test/unit/release/store.test.js', 'مسار جهاز وهمي لاختبار مواد المتاجر'],
  ['test/unit/save/save.test.js', 'مسار جهاز وهمي لاختبار مكان الحفظ'],
];
const isExcluded = (rel) => EXCLUDED.some(([p]) => (p.endsWith('/') ? rel.startsWith(p) : rel === p));
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'release', '.claude', 'coverage', '.web-ext-artifacts']);

/** الملفات المتتبَّعة إن كان الجذر جذر مستودع Git، وإلا null (الشجرة تُمشى بدلًا منها). */
async function trackedFiles(root) {
  try {
    const run = (...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    if ((await realpath(run('rev-parse', '--show-toplevel').trim())) !== (await realpath(root))) return null;
    return run('ls-files', '-z').split('\0').filter(Boolean);
  } catch {
    return null;
  }
}

async function walkAll(dir, base = dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) out.push(...(await walkAll(path.join(dir, e.name), base)));
    } else if (e.isFile()) out.push(path.relative(base, path.join(dir, e.name)).split(path.sep).join('/'));
  }
  return out;
}

// نطاق غائب أو لا يُقرأ فشل لا «صفر ملفات» (FA-11): كان الخطأ يُبتلع فينجح الفحص ولو نُقلت العيّنات كلها.
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (TEXT.test(e.name)) out.push(p);
  }
  return out;
}

const MAX_BYTES = 50 * 1024 * 1024;
const findings = [];
let scanned = 0;
const seen = new Set();
for (const scope of SCOPES) {
  let files;
  try {
    files = await walk(path.join(ROOT, scope));
  } catch (err) {
    findings.push(`${scope}: نطاق الفحص غائب أو لا يُقرأ (${err.code ?? err.message})`);
    continue;
  }
  for (const file of files) {
    // ملف نصي أكبر من الحد لا يُتخطى بصمت: العيّنات لا تبلغه، وما بلغه يُقسَم أو يُنقَّى قبل حفظه.
    if ((await stat(file)).size > MAX_BYTES) {
      findings.push(`${path.relative(ROOT, file)}: أكبر من 50 م.ب فلم يُفحص`);
      continue;
    }
    scanned++;
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    seen.add(rel);
    const text = await readFile(file, 'utf8');
    for (const f of findSecrets(text)) {
      if (rel.endsWith('.md') && f.type === 'url' && !SENSITIVE_HOST.test(text.slice(f.index, f.index + f.length))) continue;
      findings.push(`${rel}@${f.index}: ${f.type} ${f.sample}`);
    }
    for (const m of text.matchAll(LOCAL_PATH)) findings.push(`${rel}@${m.index}: local-path ${m[0]}`);
  }
}

// الفحص الموسَّع: بقية الملفات النصية المتتبَّعة (أو الشجرة كلها بلا Git)، بقواعد الأسرار والمسار المحلي دون قاعدة الروابط.
const everything = (await trackedFiles(ROOT)) ?? (await walkAll(ROOT).catch(() => []));
let extra = 0;
let excluded = 0;
for (const rel of everything) {
  if (seen.has(rel) || !EXTRA_TEXT.test(rel)) continue;
  if (isExcluded(rel)) {
    excluded++;
    continue;
  }
  const file = path.join(ROOT, rel);
  const info = await lstat(file).catch(() => null);
  if (!info?.isFile()) continue; // رابط رمزي أو محذوف لم يُسجَّل بعد
  if (info.size > MAX_BYTES) {
    findings.push(`${rel}: أكبر من 50 م.ب فلم يُفحص`);
    continue;
  }
  scanned++;
  extra++;
  const text = await readFile(file, 'utf8');
  for (const f of findSecrets(text, EXTRA_IGNORED_TYPES)) findings.push(`${rel}@${f.index}: ${f.type} ${f.sample}`);
  for (const m of text.matchAll(LOCAL_PATH)) findings.push(`${rel}@${m.index}: local-path ${m[0]}`);
}

if (!scanned) findings.push('لا ملف نصيًا في نطاقات الفحص (test/fixtures وtest/e2e/fixtures)');
if (findings.length) {
  console.error(`check-secrets: ${findings.length} اكتشاف في ${scanned} ملف\n- ${findings.slice(0, 50).join('\n- ')}`);
  process.exit(1);
}
console.log(`check-secrets: ناجح (${scanned} ملف بلا pot ولا تواقيع ولا روابط ولا ملفات ارتباط ولا مسارات محلية؛ منها ${extra} خارج نطاقات العيّنات، و${excluded} مستثنى بسببه)`);
