#!/usr/bin/env node
// فحص آلي لخلو العينات والسجلات من pot والتواقيع والروابط وملفات الارتباط والرموز ومسارات الجهاز المحلية.
// يمرّ على test/fixtures/ وعينات test/e2e/fixtures/ (ترجمات حقيقية). الوثائق السردية (.md) فيهما قد تذكر روابط مراجع
// عامة، أما روابط يوتيوب وجوجل والأسرار فممنوعة فيها أيضًا. يخرج برمز 1 عند أي اكتشاف.
// ويمتد (تدقيق V2، U-047) إلى كل ملف نصي متتبَّع في Git خارج هذه النطاقات: الأسرار ومسارات الجهاز المحلية، دون قاعدة الروابط
// (الشيفرة والوثائق تذكر روابط عامة بحق)، إلا ما ورد في EXCLUDED أدناه بسببه. وحين لا يتوفر Git يمشي على الشجرة نفسها.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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

// استثناءات الفحص الموسَّع وحده (لا نطاقات العيّنات أعلاه) بالسطر لا بالملف: كل بند ملف وسببه وبصمات أسطره بعينها، فأي اكتشاف
// آخر في الملف نفسه يُرفض، وبصمة لا تطابق سطرًا في ملف موجود تُرفض أيضًا (استثناء قديم). والبصمة SHA-256 للسطر (أول 16 محرفًا)،
// لئلا يحمل هذا الملف نص الأسطر نفسها. وإضافة بند تحتاج سببًا يُكتب هنا.
const EXTRA_TEXT = /\.(json|srt|txt|log|md|csv|ndjson|js|mjs|cjs|css|html|yml|yaml|svg|webmanifest|toml)$|(^|\/)\.[a-z]+ignore$/i;
const EXTRA_IGNORED_TYPES = ['url', 'timedtext-path']; // الروابط العامة ومسار timedtext مذكوران في الشيفرة والوثائق بحق
const LINE_EXEMPT = new Map([
  ['src/core/diagnostics/sanitize.js', 'تعريف أنماط التنقية: يحوي أسماء الترويسات وملفات الارتباط', ['5603b54289fbccf6']],
  ['test/fixtures/v1/src/core/diagnostics/sanitize.js', 'نسخة مصدرية مجمَّدة: تعريف الأنماط نفسه', ['5603b54289fbccf6']],
  ['test/fixtures/v1.1/src/core/diagnostics/sanitize.js', 'نسخة مصدرية مجمَّدة: تعريف الأنماط نفسه', ['5603b54289fbccf6']],
  ['test/unit/diagnostics/sanitize.test.js', 'نماذج أسرار وهمية لاختبار التنقية', ['f38ee967f67ab1a8', '321a8e5630055327', 'b7171d5def232d29', 'd8822ca1e2c47023', 'ee94ec1a5bc18220']],
  ['test/unit/report/personal-secrets.test.js', 'نماذج أسرار وهمية لاختبار تقرير التشخيص', ['ad91c6ef66bbb33b', '837c17ea01181401', '1d1b9849615b7238', 'a2b98efd45cf107c', '6234aee3918c30e0']],
  ['test/unit/pages/settings/report.test.js', 'نماذج ملفات ارتباط وهمية لاختبار البلاغ', ['b67a6bbedbd048e0']],
  ['test/e2e/static/messages-diagnostics.test.js', 'نماذج ملفات ارتباط وهمية لاختبار رسائل التشخيص', ['c96c2e21c06a8a1b']],
  ['test/unit/extract/extract.test.js', 'روابط timedtext وهمية بمعاملات pot وهمية', ['93e56ec49da7ce84']],
  ['test/unit/extract/extractor.test.js', 'روابط timedtext وهمية بمعاملات pot وهمية', ['c2b9c48a77a8a3bb']],
  ['test/unit/model/errors.test.js', 'رابط وهمي بمعاملات وهمية لاختبار تنقية الأخطاء', ['f723cb84b6fdb17e']],
  ['test/unit/player/overlay/errors.test.js', 'رابط وهمي بمعاملات وهمية لاختبار تنقية الأخطاء', ['c0c436ea86429128']],
  ['test/integration/roundtrip/roundtrip.test.js', 'سلاسل طويلة وهمية لاختبار الذهاب والإياب', ['b4a09348b44395c1', 'fd2ba1b88c6879a0']],
  ['test/unit/store/av2-wg2.test.js', 'سلاسل طويلة وهمية لاختبار التخزين', ['e30135d389ab7022', 'e30135d389ab7022']],
  ['test/live/audit-c1/run.mjs', 'ترويسة وهمية في سيناريو حي مقصود', ['014edc09a6e9c8dc']],
  ['test/unit/pages/settings/view.test.js', 'مسار جهاز وهمي لاختبار عرض المسارات', ['fd15e34e5363a892', '5102d6b3791cb8d2', '1f530b30bc84f574']],
  ['test/unit/release/store.test.js', 'مسار جهاز وهمي لاختبار مواد المتاجر', ['5777f18baa029532']],
  ['test/unit/save/save.test.js', 'مسار جهاز وهمي لاختبار مكان الحفظ', ['f2a4fdc00a8c2a70', 'b0209bd1611ee454']],
].map(([file, why, hashes]) => [file, { why, hashes: new Set(hashes) }]));
// تجزئات سلامة الحزم تشبه الرموز الطويلة: سطر integrity وحده بصيغته، في ملف القفل وحده.
const LOCK_FILE = 'package-lock.json';
const LOCK_INTEGRITY = /^\s*"integrity": "sha512-[A-Za-z0-9+/]+={0,2}",?$/;
const lineHash = (line) => createHash('sha256').update(line).digest('hex').slice(0, 16);
/** هل هذا السطر مستثنى في ملفه؟ */
const lineExempt = (rel, line) => (rel === LOCK_FILE ? LOCK_INTEGRITY.test(line) : LINE_EXEMPT.get(rel)?.hashes.has(lineHash(line)) === true);
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
let exempted = 0;
for (const rel of everything) {
  if (seen.has(rel) || !EXTRA_TEXT.test(rel)) continue;
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
  const lines = text.split('\n');
  const lineOf = (index) => lines[text.slice(0, index).split('\n').length - 1];
  const hits = [
    ...findSecrets(text, EXTRA_IGNORED_TYPES).map((f) => [f.index, `${f.type} ${f.sample}`]),
    ...[...text.matchAll(LOCAL_PATH)].map((m) => [m.index, `local-path ${m[0]}`]),
  ];
  for (const [index, what] of hits) {
    if (lineExempt(rel, lineOf(index))) exempted++;
    else findings.push(`${rel}@${index}: ${what}`);
  }
  const listed = LINE_EXEMPT.get(rel);
  if (listed) {
    const present = new Set(lines.map(lineHash));
    for (const h of listed.hashes) if (!present.has(h)) findings.push(`${rel}: استثناء لسطر لم يعد موجودًا (${h})`);
  }
}

if (!scanned) findings.push('لا ملف نصيًا في نطاقات الفحص (test/fixtures وtest/e2e/fixtures)');
if (findings.length) {
  console.error(`check-secrets: ${findings.length} اكتشاف في ${scanned} ملف\n- ${findings.slice(0, 50).join('\n- ')}`);
  process.exit(1);
}
console.log(`check-secrets: ناجح (${scanned} ملف بلا pot ولا تواقيع ولا روابط ولا ملفات ارتباط ولا مسارات محلية؛ منها ${extra} خارج نطاقات العيّنات، و${exempted} اكتشافًا مستثنى بسطره)`);
