#!/usr/bin/env node
// يبني صفحة عيّنة RTL المحلية في مجلد خارج المستودع (افتراضيًا ~/Library/Application Support/Tarjuman-test/rtl-sample).
//   node test/live/overlay/rtl-sample/build.mjs [--out <مجلد>]
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const outArg = argv.indexOf('--out');
export const OUT = outArg > -1 ? path.resolve(argv[outArg + 1]) : path.join(os.homedir(), 'Library/Application Support/Tarjuman-test/rtl-sample');

await mkdir(OUT, { recursive: true });
await build({ entryPoints: [path.join(HERE, 'entry.js')], outfile: path.join(OUT, 'rtl-sample.js'), bundle: true, format: 'iife', target: 'chrome111', charset: 'utf8', logLevel: 'warning' });

const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>ترجمان — عيّنة RTL</title>
<style>
  body { margin: 0; padding: 24px 32px 40px; background: #f4f6f7; color: #1b2a2e; font: 16px/1.6 "Almarai", "SF Arabic", Tahoma, sans-serif; }
  h1 { margin: 0 0 4px; font-size: 24px; }
  h2 { margin: 28px 0 12px; font-size: 18px; }
  p.lead { margin: 0; color: #4b5d62; }
  .grid { display: flex; flex-wrap: wrap; gap: 20px; }
  .cell { margin: 0; }
  .cap { margin: 0 0 6px; font-size: 14px; font-weight: 700; }
  .player { position: relative; overflow: hidden; border-radius: 6px; background: radial-gradient(ellipse at 30% 30%, #4a5a63 0%, #1d252a 55%, #0b0f12 100%); }
  .note { position: absolute; left: 0; right: 0; bottom: 0; height: 48px; display: flex; align-items: center; justify-content: center; background: rgb(0 0 0 / 55%); color: #ddd; font-size: 13px; direction: ltr; }
</style>
</head>
<body>
<h1>عيّنة النص المختلط لطبقة العرض</h1>
<p class="lead">المكوّن الحقيقي نفسه (createOverlayView) خارج يوتيوب، فوق «فيديو» داكن. الاتجاه يتبع حروف كل سطر.</p>
<div id="root"></div>
<script src="rtl-sample.js"></script>
</body>
</html>
`;
await writeFile(path.join(OUT, 'index.html'), html);
console.log(OUT);
