#!/usr/bin/env node
// بناء الإضافة غير المعبأة في dist/: سكربتا المحتوى وسكربتات الصفحات مجمّعة بـesbuild (IIFE، فسكربتات
// المحتوى لا تقبل وحدات ES)، والبيان وملفات HTML وCSS منسوخة كما هي. لا شيفرة بعيدة ولا خطوط من الشبكة.
//   --dev       بناء التطوير: خطاف الحزام الحي في العالم المعزول ومعرض المكوّنات، وversion_name ينتهي بـ-dev
//   --out <dir> مجلد آخر (مثل نسخة جلسة يدوية خارج المستودع) دون مسّ dist/
import { build } from 'esbuild';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const argv = process.argv.slice(2);
const DEV = argv.includes('--dev');
const outArg = argv.indexOf('--out');
const OUT = outArg > -1 ? path.resolve(argv[outArg + 1]) : path.join(ROOT, 'dist');
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
  ...Object.fromEntries(PAGES.map((p) => [`pages/${p}/main`, `pages/${p}/main.js`])),
  ...(DEV ? { 'ui/gallery/gallery': 'ui/gallery/gallery.js' } : {}),
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

// HTML وCSS: الصفحات وأساس الواجهة. معرض المكوّنات للتطوير وحده.
for (const file of [...(await walk(path.join(SRC, 'pages'))), ...(await walk(path.join(SRC, 'ui')))]) {
  const rel = path.relative(SRC, file);
  if (!/\.(html|css)$/.test(rel)) continue;
  if (!DEV && rel.startsWith(path.join('ui', 'gallery'))) continue;
  await mkdir(path.dirname(path.join(OUT, rel)), { recursive: true });
  await cp(file, path.join(OUT, rel));
}

const manifest = JSON.parse(await readFile(path.join(SRC, 'manifest.json'), 'utf8'));
if (DEV) manifest.version_name = `${manifest.version}-dev`;
await writeFile(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

// حزمة الإنتاج بلا خطاف تطوير: يفشل البناء إن بقي.
if (!DEV) {
  const content = await readFile(path.join(OUT, 'content/main.js'), 'utf8');
  if (content.includes('__tarjuman') || content.includes('__TJ_DEV__')) {
    console.error('build: خطاف التطوير باقٍ في حزمة الإنتاج');
    process.exit(1);
  }
}
const shown = path.relative(ROOT, OUT);
console.log(`بُنيت الإضافة${DEV ? ' (تطوير)' : ''} في ${shown.startsWith('..') ? OUT : shown}/`);
