#!/usr/bin/env node
// يلتقط لقطات صفحة عيّنة RTL (P5-AC2) في متصفح اختبار بلا نافذة، ويتحقق آليًا من اتجاه كل سطر في الصفحة
// الحقيقية (dir) ومن عدم تجاوز أي سطر لحدود مشغّله.
//   node test/live/overlay/rtl-sample/build.mjs --page-out <مجلد>
//   node test/live/overlay/rtl-sample/shoot.mjs --browser brave|chrome --page <مجلد> [--out docs/evidence/P5]
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BROWSERS, launch, sleep } from '../../harness/browser.mjs';
import { fullScreenshot, openTab } from '../../harness/extension.mjs';
import { SAMPLES } from '../../../unit/player/overlay/samples.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'brave');
const OUT = path.resolve(ROOT, val('out', 'docs/evidence/P5'), 'rtl-sample');
const PAGE_DIR = path.resolve(val('page', path.join(os.homedir(), 'Library/Application Support/Tarjuman-test/rtl-sample')));

const b = await launch({ browser, profile: `${browser}-p5`, headless: !argv.includes('--headed') });
const result = { browser: `${BROWSERS[browser].name} (${b.version.product})`, at: new Date().toISOString(), samples: [], checks: [] };
try {
  const page = await openTab(b.conn, pathToFileURL(path.join(PAGE_DIR, 'index.html')).href);
  await sleep(600); // التلاشي 80ms
  const peek = await page.eval(() => window.__rtlSample.peek());
  // العيّنات الاثنتا عشرة هي أول 12 إطارًا.
  SAMPLES.forEach((s, i) => {
    const got = peek[i].lines.map((l) => l.dir);
    const expected = s.dual ? [s.dirs[0], s.dirs[1]] : s.dirs;
    const ok = JSON.stringify(got) === JSON.stringify(expected);
    result.samples.push({ id: s.id, label: s.label, expectedDirs: expected, shownDirs: got, ok });
    console.log(`${ok ? '✓' : '✗'} عيّنة ${s.id} ${s.label}: ${got.join('/')}`);
  });
  // 12 عيّنة + 3 خلفيات + 3 مواضع + 4 مقاسات + إطار الشريط = 23 إطارًا، وكل طبقة لها صندوق مرئي داخل مشغّلها.
  result.checks.push({ id: 'frames', ok: peek.length === 23, count: peek.length });
  const players = await page.eval(() => [...document.querySelectorAll('.player')].map((p) => {
    const r = p.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  }));
  const inside = peek.every((p, i) => p.stage.width > 0 && p.stage.top >= players[i].top - 1 && p.stage.bottom <= players[i].bottom + 1 && p.stage.left >= players[i].left - 1 && p.stage.right <= players[i].right + 1);
  result.checks.push({ id: 'stage-inside-player', ok: inside });
  const file = await fullScreenshot(page, path.join(OUT, `${browser}-rtl-sample.png`), { width: 1400 });
  console.log(`لقطة: ${path.relative(ROOT, file)}`);
  result.screenshot = path.relative(ROOT, file);
} finally {
  await mkdir(OUT, { recursive: true });
  await writeFile(path.join(OUT, `${browser}-rtl-sample.json`), `${JSON.stringify(result, null, 2)}\n`);
  await b.close();
}
process.exit(result.samples.every((s) => s.ok) && result.checks.every((c) => c.ok) ? 0 : 1);
