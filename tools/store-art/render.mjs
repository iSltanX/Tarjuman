#!/usr/bin/env node
// مواد المتاجر المرئية للإصدار 2.0.0 من لوحة الهوية 18 (AA5)، تحل محل t6-art.mjs (الهوية الثالثة):
//   store/promo/small-promo-440x280.png        البلاطة الصغيرة (Chrome وEdge)
//   store/promo/marquee-1400x560.png           Marquee في Chrome، وLarge tile في Edge
//   store/screenshots/chromium/0{1,2,3}-*.png  الإطارات الثلاث 1280×800 (Chrome وEdge)
//   store/screenshots/firefox/0{1,2,3}-*.png   الإطارات نفسها 1280×960 (AMO): الشريط العلوي 256 بدل 176 والواجهة لا تُمط
// وأيقونة المتجر 128 وشعار Edge ‏300 يولّدهما tools/brand/icons.mjs بلا متصفح. والقوالب في هذا المجلد بقيم اللوحة وأحجامها حرفيًا،
// والواجهة داخل كل إطار لقطة حقيقية من حزمة 2.0.0 التقطها test/live/aa4/site-shots.mjs (مجلد --shots خارج المستودع).
// يرسم كل قالب في Chrome بلا نافذة بمعامل 1 فيخرج بمقاس المتجر تمامًا، بملف تعريف مؤقت، ولا يفتح شبكة: القوالب لا تطلب إلا ملفات محلية.
// **يفتح Chrome بلا نافذة عند تشغيله أو استيراده:** بإذن سلطان وحده (docs/development.md، «الاختبارات الحية»).
//   command node tools/store-art/render.mjs --shots <مجلد اللقطات الخام> [--only promo,marquee,shots]
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const SHOTS = val('shots') ? path.resolve(val('shots')) : null;
const ONLY = val('only')?.split(',') ?? null;
const CHROME = process.env.TJ_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/** المادة: القالب، والمقاس، والقيم، والمخرج. */
const FRAMES = [
  { tpl: 'shot-01', name: '01-overlay.png' },
  { tpl: 'shot-02', name: '02-popup.png' },
  { tpl: 'shot-03', name: '03-editor.png' },
];
const JOBS = [
  { group: 'promo', tpl: 'promo', size: [440, 280], out: 'store/promo/small-promo-440x280.png' },
  { group: 'marquee', tpl: 'marquee', size: [1400, 560], out: 'store/promo/marquee-1400x560.png' },
  ...FRAMES.map((f) => ({ group: 'shots', tpl: f.tpl, size: [1280, 800], vars: { H: 800, BAND: 176 }, out: `store/screenshots/chromium/${f.name}` })),
  ...FRAMES.map((f) => ({ group: 'shots', tpl: f.tpl, size: [1280, 960], vars: { H: 960, BAND: 256 }, out: `store/screenshots/firefox/${f.name}` })),
];

function fill(html, vars) {
  let s = html.replaceAll('{{ROOT}}', pathToFileURL(ROOT).href).replaceAll('{{HERE}}', pathToFileURL(HERE).href);
  for (const [k, v] of Object.entries(vars ?? {})) s = s.replaceAll(`{{${k}}}`, String(v));
  return s.replace(/\{\{SHOT:([\w.-]+)\}\}/g, (_, f) => {
    if (!SHOTS) throw new Error('القالب يحتاج لقطة حقيقية: مرّر --shots <مجلد>');
    const file = path.join(SHOTS, f);
    if (!existsSync(file)) throw new Error(`لقطة غائبة: ${file}`);
    return pathToFileURL(file).href;
  });
}

if (!existsSync(CHROME)) {
  console.error(`Chrome غير موجود في ${CHROME}. مرّر مساره في TJ_CHROME.`);
  process.exit(1);
}
const work = mkdtempSync(path.join(tmpdir(), 'tj-store-art-'));
try {
  for (const job of JOBS) {
    if (ONLY && !ONLY.includes(job.group)) continue;
    const page = path.join(work, `${job.tpl}-${job.size[1]}.html`);
    writeFileSync(page, fill(readFileSync(path.join(HERE, `${job.tpl}.html`), 'utf8'), job.vars));
    const out = path.join(ROOT, job.out);
    const r = spawnSync(CHROME, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio', '--no-first-run', '--no-default-browser-check',
      '--disable-extensions', '--allow-file-access-from-files', `--user-data-dir=${path.join(work, 'profile')}`,
      '--force-device-scale-factor=1', `--window-size=${job.size[0]},${job.size[1]}`, '--virtual-time-budget=5000',
      `--screenshot=${out}`, pathToFileURL(page).href,
    ], { encoding: 'utf8', timeout: 60_000 });
    if (r.status !== 0 || !existsSync(out)) throw new Error(`تعذّر رسم ${job.out}: ${(r.stderr || r.error?.message || '').slice(0, 400)}`);
    console.log(`✓ ${job.out} · ${job.size[0]}×${job.size[1]} · ${Math.round(statSync(out).size / 1024)} ك.ب`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
