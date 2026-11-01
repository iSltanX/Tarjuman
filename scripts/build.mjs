#!/usr/bin/env node
// بناء الإضافة غير المعبأة في dist/: سكربتا المحتوى مجمّعان بـesbuild (سكربتات المحتوى لا تقبل وحدات ES)،
// والصفحات والبيان منسوخة كما هي.
import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'dist');

const entries = {
  'main-world/capture': 'main-world/capture.js',
  'content/main': 'content/main.js',
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
await cp(path.join(SRC, 'pages/poc'), path.join(OUT, 'pages/poc'), { recursive: true });
console.log(`بُنيت الإضافة في ${path.relative(ROOT, OUT)}/`);
