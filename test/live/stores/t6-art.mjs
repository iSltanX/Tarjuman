#!/usr/bin/env node
// المواد المرئية للمتاجر (جولة النشر T6) بالهوية الثالثة «المعيّنان المتشابكان» و«باذنجاني على رمادي» (docs/identity-v3.md):
// أيقونة متجر Chrome (128 والرسم 96 بحشو شفاف 16)، وشعار Edge (300)، وصورتا الترويج (440×280 و1400×560)، وإطارات اللقطات
// (1280×800 لمتجري Chromium و1280×960 لـFirefox) بعنوان عربي قصير فوق لقطة حقيقية من t6-shots.mjs. تُرسم صفحات HTML محلية في
// Chrome بلا نافذة بمعامل 1 فتخرج بالمقاس تمامًا، بخطوط ترجمان المضمّنة (Cairo وAlmarai، OFL) وشعاره ومساراته من src/ui/logo.js،
// والألوان من src/ui/tokens.css. لا شبكة ولا إضافة.
//   command node test/live/stores/t6-shots.mjs     (اللقطات الخام أولًا)
//   command node test/live/stores/t6-art.mjs [--only icons|promo|frames]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROFILE_ROOT, Page, launch, sleep } from '../harness/browser.mjs';
import { MARK_PATH } from '../../../src/ui/logo.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const ONLY = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
const RAW = path.join(PROFILE_ROOT, 't6-work', 'raw');
const WORK = path.join(PROFILE_ROOT, 't6-work', 'art');
const STORE = path.join(ROOT, 'store');

// ---- الهوية من المصدر ----
const logoSrc = await readFile(path.join(ROOT, 'src/ui/logo.js'), 'utf8');
const WORD = /const WORD = '([^']+)'/.exec(logoSrc)[1];
const GLYPH = /const GLYPH = '([^']+)'/.exec(logoSrc)[1];
const VIEWBOX = /export const LOGO_VIEWBOX = '([^']+)'/.exec(logoSrc)[1];
const tokens = await readFile(path.join(ROOT, 'src/ui/tokens.css'), 'utf8');
const light = tokens.slice(0, tokens.indexOf('@media'));
const tok = (name) => new RegExp(`--tj-${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(light)[1];
const C = { bg: tok('bg'), surface: tok('surface'), border: tok('border'), text: tok('text'), text2: tok('text-2'), brand: tok('brand'), ink: tok('brand-ink'), soft: tok('brand-soft') };
const font = async (f) => `data:font/woff2;base64,${(await readFile(path.join(ROOT, 'src/ui/fonts', f))).toString('base64')}`;
const FONTS = `
@font-face { font-family: Cairo; font-weight: 700; src: url(${await font('ui/cairo-700.woff2')}) format('woff2'); }
@font-face { font-family: Almarai; font-weight: 400; src: url(${await font('subtitle/almarai-400.woff2')}) format('woff2'); }
@font-face { font-family: Almarai; font-weight: 700; src: url(${await font('subtitle/almarai-700.woff2')}) format('woff2'); }`;

/** التركيب: العلامة يمين الاسم، والعلامة بالإبراز والاسم بلون النص (أو الأحادي). */
const logo = (height, { glyph = C.brand, word = C.text } = {}) => `<svg viewBox="${VIEWBOX}" height="${height}" style="display:block" role="img" aria-label="ترجمان">
  <path d="${WORD}" fill="${word}" fill-rule="nonzero"/><path d="${GLYPH}" fill="${glyph}" fill-rule="evenodd"/></svg>`;
/**
 * البلاطة: باذنجاني بزاوية 22% والعلامة بيضاء في وسطها (docs/identity-v3.md §٢)، بمقاس العلامة في أيقونة الإضافة المشحونة نفسها
 * (src/icons/tarjuman-icon-128.png): مسار الشبكة 48 مصغّرًا إلى MARK_SCALE حول المركز. ويقارنها ضابط المطابقة أدناه بالأيقونة.
 */
export const MARK_SCALE = 0.76; // معايَر: أقل فرق عن الأيقونة المشحونة (32 بكسلًا في تنعيم الزوايا وحدها)
const tile = (size) => `<svg viewBox="0 0 48 48" width="${size}" height="${size}" style="display:block">
  <rect width="48" height="48" rx="${(48 * 0.22).toFixed(2)}" fill="${C.brand}"/>
  <g transform="translate(24 24) scale(${MARK_SCALE}) translate(-24 -24)"><path d="${MARK_PATH}" fill="${C.surface}" fill-rule="evenodd"/></g></svg>`;
const page = (w, h, bodyCss, html, { transparent = false } = {}) => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
${FONTS}
* { box-sizing: border-box; }
html, body { margin: 0; width: ${w}px; height: ${h}px; overflow: hidden; }
body { ${transparent ? 'background: transparent;' : ''} ${bodyCss} -webkit-font-smoothing: antialiased; }
</style></head><body>${html}</body></html>`;
const img = async (name) => `data:image/png;base64,${(await readFile(path.join(RAW, `${name}.png`))).toString('base64')}`;

// ---- اللقطات (التسميات والعناوين) ----
export const SHOTS = [
  { id: '01-overlay', raw: '01-overlay-panel', title: 'ترجمتك العربية فوق الفيديو', line: 'فوق الإنجليزية أو وحدها، والنص المتزامن بجانب الفيديو.' },
  { id: '02-download', raw: '02-download-menu', title: 'نزّل الأصل وترجمه بنموذجك', line: 'ملف SRT وتعليمات ترجمة جاهزة من شريط المشغّل، وتنبيه إن بدا النص ناقصًا.' },
  { id: '03-timing', raw: '03-timing', title: 'اضبط التوقيت بضغطة', line: 'زرّا − و+، أو مزامنة بجملة تسمعها. ويُحفظ التوقيت لكل ترجمة.' },
  { id: '04-editor', raw: '04-editor', title: 'راجع ترجمتك في المحرّر', line: 'النص والتوقيت، والدمج والشطر، والبحث والاستبدال.' },
  { id: '05-library', raw: '05-library', title: 'محفوظاتك في مكان واحد', line: 'حتى ثلاث ترجمات لكل فيديو، ونسخة احتياطية تنقلها معك.' },
  { id: '06-settings', raw: '06-settings', title: 'مظهر الترجمة كما تحب', line: 'وضع العرض، والخط، والحجم، والخلفية، والموضع.' },
];
const FRAMES = [
  { dir: 'chromium', w: 1280, h: 800, pageSuffix: 'wide' },
  { dir: 'firefox', w: 1280, h: 960, pageSuffix: 'tall' },
];
const BAND = 148;

async function frameHtml(shot, f) {
  const rawName = /^0[456]/.test(shot.id) ? `${shot.raw}-${f.pageSuffix}` : shot.raw;
  return page(f.w, f.h, `background: ${C.bg}; color: ${C.text};`, `
<header style="position:absolute; inset:0 0 auto 0; height:${BAND}px; padding:0 56px; display:flex; align-items:center; justify-content:space-between; gap:32px;">
  <div style="min-width:0">
    <h1 style="margin:0; font:700 38px/1.35 Cairo; letter-spacing:0;">${shot.title}</h1>
    <p style="margin:6px 0 0; font:400 19px/1.6 Almarai; color:${C.text2};">${shot.line}</p>
  </div>
  <div style="flex:none">${logo(34)}</div>
</header>
<main style="position:absolute; top:${BAND}px; right:40px; bottom:36px; left:40px; display:flex; align-items:center; justify-content:center;">
  <img src="${await img(rawName)}" style="display:block; max-width:100%; max-height:100%; border-radius:12px; border:1px solid ${C.border};">
</main>`);
}

const jobs = [];
if (!ONLY || ONLY === 'icons') {
  jobs.push({ out: 'icons/chrome-store-icon-128.png', w: 128, h: 128, transparent: true, html: page(128, 128, '', `<div style="position:absolute; left:16px; top:16px;">${tile(96)}</div>`, { transparent: true }) });
  jobs.push({ out: 'icons/edge-logo-300.png', w: 300, h: 300, transparent: true, html: page(300, 300, '', tile(300), { transparent: true }) });
  // ضابط المطابقة: البلاطة كاملة بمقاس 128 تُقارن بأيقونة الإضافة src/icons/tarjuman-icon-128.png (لا تُشحن).
  jobs.push({ out: null, work: 'tile-128-check.png', w: 128, h: 128, transparent: true, html: page(128, 128, '', tile(128), { transparent: true }) });
}
if (!ONLY || ONLY === 'promo') {
  jobs.push({
    out: 'promo/small-promo-440x280.png', w: 440, h: 280, html: page(440, 280, `background:${C.brand}; color:${C.ink}; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:18px;`, `
  ${logo(62, { glyph: C.ink, word: C.ink })}
  <p style="margin:0; font:700 22px/1.4 Almarai;">ترجمتك العربية فوق الفيديو</p>`),
  });
  jobs.push({
    out: 'promo/marquee-1400x560.png', w: 1400, h: 560, html: page(1400, 560, `background:${C.brand}; color:${C.ink};`, `
<section style="position:absolute; top:0; bottom:0; right:0; width:620px; padding:0 64px 0 28px; display:flex; flex-direction:column; justify-content:center; gap:22px;">
  ${logo(64, { glyph: C.ink, word: C.ink })}
  <h1 style="margin:8px 0 0; font:700 40px/1.35 Cairo; white-space:nowrap;">ترجمتك العربية فوق الفيديو</h1>
  <p style="margin:0; font:400 21px/1.7 Almarai; opacity:.92;">نزّل الترجمة الإنجليزية، وترجمها بالنموذج الذي تختاره، ثم شاهدها بالعربية بتوقيتها. وكل شيء على جهازك.</p>
</section>
<div style="position:absolute; top:48px; bottom:48px; left:48px; width:724px; display:flex; align-items:center; justify-content:center;">
  <img src="${await img('01b-overlay-player')}" style="display:block; max-width:100%; max-height:100%; border-radius:14px;">
</div>`),
  });
}
if (!ONLY || ONLY === 'frames') {
  for (const f of FRAMES) {
    for (const shot of SHOTS) jobs.push({ out: `screenshots/${f.dir}/${shot.id}.png`, w: f.w, h: f.h, html: await frameHtml(shot, f) });
  }
}

// ---- الرسم ----
await mkdir(WORK, { recursive: true });
const b = await launch({ browser: 'chrome', profile: 'chrome-t6-art', headless: true });
const done = [];
try {
  const p = await Page.open(b.conn, 'about:blank');
  for (const [i, job] of jobs.entries()) {
    const file = path.join(WORK, `job-${i}.html`);
    await writeFile(file, job.html);
    await p.send('Emulation.setDeviceMetricsOverride', { width: job.w, height: job.h, deviceScaleFactor: 1, mobile: false });
    await p.send('Emulation.setDefaultBackgroundColorOverride', job.transparent ? { color: { r: 0, g: 0, b: 0, a: 0 } } : {});
    await p.goto(`file://${file}`);
    await p.waitFor(() => document.fonts.status === 'loaded' && [...document.images].every((x) => x.complete), { timeoutMs: 15000 });
    await sleep(250);
    const { data } = await p.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: job.w, height: job.h, scale: 1 } });
    const buf = Buffer.from(data, 'base64');
    const out = job.out ? path.join(STORE, job.out) : path.join(WORK, job.work);
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, buf);
    done.push({ file: job.out ?? job.work, width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bytes: buf.length });
    console.log(`✓ ${job.out ?? job.work} ${buf.readUInt32BE(16)}×${buf.readUInt32BE(20)} (${buf.length} بايت)`);
  }
} finally {
  await b.close();
}
await writeFile(path.join(WORK, 'art.json'), `${JSON.stringify({ at: new Date().toISOString(), colors: C, done }, null, 2)}\n`);
