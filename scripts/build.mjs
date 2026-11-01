#!/usr/bin/env node
// بناء الإضافة غير المعبأة في dist/: سكربتا المحتوى مجمّعان بـesbuild (سكربتات المحتوى لا تقبل وحدات ES)،
// والصفحات والبيان منسوخة كما هي.
import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
// --out <مجلد> يبني في مجلد آخر (مثل نسخة الجلسة اليدوية خارج المستودع) دون مسّ dist/.
const outArg = process.argv.indexOf('--out');
const OUT = outArg > -1 ? path.resolve(process.argv[outArg + 1]) : path.join(ROOT, 'dist');

const entries = {
  'main-world/capture': 'main-world/capture.js',
  'content/main': 'content/main.js',
  'pages/poc/poc': 'pages/poc/poc.js',
};

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
});
await cp(path.join(SRC, 'manifest.json'), path.join(OUT, 'manifest.json'));
for (const f of ['index.html', 'poc.css']) await cp(path.join(SRC, 'pages/poc', f), path.join(OUT, 'pages/poc', f));
console.log(`بُنيت الإضافة في ${path.relative(ROOT, OUT)}/`);
