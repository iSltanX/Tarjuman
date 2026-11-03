#!/usr/bin/env node
// بناء الإضافة غير المعبأة في dist/: سكربتا المحتوى وسكربتات الصفحات مجمّعة بـesbuild (IIFE، فسكربتات
// المحتوى لا تقبل وحدات ES)، والبيان وملفات HTML وCSS منسوخة كما هي. لا شيفرة بعيدة ولا خطوط من الشبكة.
//   --dev       بناء التطوير: خطاف الحزام الحي في العالم المعزول ومعرض المكوّنات، وversion_name ينتهي بـ-dev
//   --out <dir> مجلد آخر (مثل نسخة جلسة يدوية خارج المستودع) دون مسّ dist/
//   --target <chromium|firefox>  الهدف (scripts/targets.mjs): chromium افتراضيًا في dist/، وfirefox في dist-firefox/. الشيفرة
//               واحدة، ويختلف البيان وحده بطبقة Firefox.
import { build } from 'esbuild';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_OUT, TARGETS, targetManifest } from './targets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const argv = process.argv.slice(2);
const DEV = argv.includes('--dev');
const targetArg = argv.indexOf('--target');
const TARGET = targetArg > -1 ? argv[targetArg + 1] : 'chromium';
if (!TARGETS.includes(TARGET)) {
  console.error(`build: هدف غير معروف ${TARGET} (المعتمد: ${TARGETS.join('، ')})`);
  process.exit(1);
}
const outArg = argv.indexOf('--out');
const OUT = outArg > -1 ? path.resolve(argv[outArg + 1]) : path.join(ROOT, DEFAULT_OUT[TARGET]);
// المجلد يُمسح قبل البناء: لا يكون جذر المستودع ولا أبًا له ولا داخل src.
const inside = (child, parent) => !path.relative(parent, child).startsWith('..') && !path.isAbsolute(path.relative(parent, child));
if (inside(ROOT, OUT) || inside(OUT, SRC)) {
  console.error(`build: مجلد الإخراج غير آمن للمسح: ${OUT}`);
  process.exit(1);
}

const PAGES = ['popup', 'library', 'settings', 'editor'];

const entries = {
  'main-world/capture': 'main-world/capture.js',
  'content/main': 'content/main.js',
  // العامل الخلفي للحفظ وحده (الإصدار الثاني): سكربت كلاسيكي مجمّع، فلا "type": "module" في البيان.
  'background/worker': 'background/worker.js',
  ...Object.fromEntries(PAGES.map((p) => [`pages/${p}/main`, `pages/${p}/main.js`])),
  ...(DEV ? { 'ui/gallery/gallery': 'ui/gallery/gallery.js', 'dev/harness-bridge': 'dev/harness-bridge.js' } : {}),
  ...(DEV && TARGET === 'firefox' ? { 'dev/harness-background': 'dev/harness-background.js' } : {}),
};

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await build({
  entryPoints: Object.fromEntries(Object.entries(entries).map(([out, src]) => [out, path.join(SRC, src)])),
  outdir: OUT,
  bundle: true,
  format: 'iife',
  target: 'chrome111',
  charset: 'utf8',
  legalComments: 'none',
  logLevel: 'warning',
  // بناء الإنتاج يحذف خطاف التطوير نصًا (لا شيفرة ميتة في الحزمة).
  define: { __TJ_DEV__: DEV ? 'true' : 'false' },
  minifySyntax: true,
});

// HTML وCSS: الصفحات وأساس الواجهة، وملفات الخطوط (الترجمة والواجهة) ورخصها، وأيقونات الإضافة كما هي. معرض المكوّنات
// للتطوير وحده.
for (const file of [...(await walk(path.join(SRC, 'pages'))), ...(await walk(path.join(SRC, 'ui'))), ...(await walk(path.join(SRC, 'icons')))]) {
  const rel = path.relative(SRC, file);
  if (!/\.(html|css)$/.test(rel) && !rel.startsWith(path.join('ui', 'fonts') + path.sep) && !/^icons\/[a-z0-9-]+\.png$/.test(rel)) continue;
  if (!DEV && rel.startsWith(path.join('ui', 'gallery'))) continue;
  await mkdir(path.dirname(path.join(OUT, rel)), { recursive: true });
  await cp(file, path.join(OUT, rel));
}

const manifest = targetManifest(JSON.parse(await readFile(path.join(SRC, 'manifest.json'), 'utf8')), TARGET);
if (DEV) {
  manifest.version_name = `${manifest.version}-dev`;
  // جسر الحزام الحي (جولة النشر T3) بعد سكربت المحتوى في عالمه المعزول نفسه: بناء التطوير وحده.
  manifest.content_scripts.find((c) => c.js.includes('content/main.js')).js.push('dev/harness-bridge.js');
  // وفي Firefox سكربت خلفية يفتح صفحات الإضافة لجسر الحزام (عامل Chromium ملف واحد، وCDP ينتقل إليها بنفسه).
  if (TARGET === 'firefox') manifest.background.scripts.push('dev/harness-background.js');
}
await writeFile(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

// حزمة الإنتاج بلا خطاف تطوير (سكربت المحتوى وصفحات الإضافة): يفشل البناء إن بقي.
if (!DEV) {
  for (const out of Object.keys(entries)) {
    const content = await readFile(path.join(OUT, `${out}.js`), 'utf8');
    if (content.includes('__tarjuman') || content.includes('__TJ_DEV__')) {
      console.error(`build: خطاف التطوير باقٍ في حزمة الإنتاج (${out}.js)`);
      process.exit(1);
    }
  }
}
const shown = path.relative(ROOT, OUT);
console.log(`بُنيت الإضافة${DEV ? ' (تطوير)' : ''}${TARGET === 'chromium' ? '' : ` لـ${TARGET}`} في ${shown.startsWith('..') ? OUT : shown}/`);
