#!/usr/bin/env node
// مولّد صور واجهة المستودع (README وصورة المعاينة) من قوالب HTML في هذا المجلد، بالهوية المعتمدة نفسها التي تشحنها الإضافة
// (الرابعة «كتابٌ مفتوح»، docs/identity.md): الألوان من src/ui/tokens.css، والخطوط من src/ui/fonts.css، والرمز من
// src/ui/logo.js، والأيقونات من src/ui/icons.js، والإصدار من package.json. فلا لون ولا شعار منسوخ يمكن أن ينجرف عن المنتج.
// والقالبان banner وsocial من لوحة الهوية 18 «تطبيقات الهوية» بمقاسيهما؛ وhow-it-works لا لوحة له، فهو القالب السابق نفسه
// برموز الهوية الجديدة.
//
//   command node tools/readme-assets/render.mjs            يرسم كل الصور في .github/assets/
//   command node tools/readme-assets/render.mjs banner     يرسم قالبًا واحدًا (banner أو how-it-works أو social)
//
// يحتاج Google Chrome على الجهاز (أو مساره في TJ_CHROME). يرسم بلا نافذة بملف تعريف مؤقت خارج المستودع، ولا يفتح شبكة:
// القوالب لا تطلب إلا ملفات محلية. لا يدخل شيء من هذا المجلد في حزم الإضافة.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LOGO_VIEWBOX, MARK_BOOK, MARK_BOOK_SMALL, MARK_DOTS, SMALL_BELOW } from '../../src/ui/logo.js';
import { ICONS, ICON_VIEWBOX } from '../../src/ui/icons.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const OUT = path.join(ROOT, '.github/assets');
const VERSION = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

/** القوالب: المقاس بالبكسل المنطقي، والوضعان، ومعامل الرسم. banner وsocial بمقاسَي لوحة 18. */
const JOBS = {
  banner: { size: [1200, 300], themes: ['light', 'dark'], scale: 2 },
  'how-it-works': { size: [1280, 340], themes: ['light', 'dark'], scale: 2 },
  social: { size: [1280, 640], themes: ['dark'], scale: 1, out: 'social-preview.png' },
};

const CHROME = process.env.TJ_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * رمز الشعار SVG بعرضه: النقطتان بصنف tj-mark__dots (بالطين في القالب من 48 فأكثر، كلوحة 18) والكتاب بصنف tj-mark__book،
 * والمصحّح تحت 32.
 */
function markSvg(width) {
  const book = width < SMALL_BELOW ? MARK_BOOK_SMALL : MARK_BOOK;
  const paths = [...MARK_DOTS.map((d) => ['tj-mark__dots', d]), ['tj-mark__book', book]].map(([c, d]) => `<path class="${c}" d="${d}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" class="tj-mark" viewBox="${LOGO_VIEWBOX}" width="${width}" aria-hidden="true">${paths}</svg>`;
}
/** أيقونة الهوية على شبكة 20 بخط 1.75. */
function iconSvg(name, size) {
  const parts = ICONS[name];
  if (!parts) throw new Error(`أيقونة غير معروفة: ${name}`);
  const body = parts.map(([tag, a]) => `<${tag}${Object.entries(a).map(([k, v]) => ` ${k}="${esc(String(v))}"`).join('')}/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${ICON_VIEWBOX}" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/** يملأ القالب: {{ROOT}} مسار المستودع، و{{THEME}}، و{{VERSION}}، و{{MARK:w}}، و{{ICON:name:s}}. */
function fill(html, theme) {
  return html
    .replaceAll('{{ROOT}}', pathToFileURL(ROOT).href)
    .replaceAll('{{THEME}}', theme)
    .replaceAll('{{VERSION}}', VERSION)
    .replace(/\{\{MARK:(\d+)\}\}/g, (_, w) => markSvg(Number(w)))
    .replace(/\{\{ICON:([a-z-]+):(\d+)\}\}/g, (_, n, s) => iconSvg(n, Number(s)));
}

function render(name, job) {
  const tpl = readFileSync(path.join(HERE, `${name}.html`), 'utf8');
  const work = mkdtempSync(path.join(tmpdir(), 'tj-readme-assets-'));
  try {
    for (const theme of job.themes) {
      const page = path.join(work, `${name}-${theme}.html`);
      writeFileSync(page, fill(tpl, theme));
      const out = path.join(OUT, job.out || `${name}-${theme}.png`);
      const r = spawnSync(CHROME, [
        '--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
        '--no-first-run', '--no-default-browser-check', '--disable-extensions',
        '--allow-file-access-from-files', `--user-data-dir=${path.join(work, 'profile')}`,
        `--force-device-scale-factor=${job.scale}`, `--window-size=${job.size[0]},${job.size[1]}`,
        '--virtual-time-budget=4000', `--screenshot=${out}`, pathToFileURL(page).href,
      ], { encoding: 'utf8', timeout: 60_000 });
      if (r.status !== 0 || !existsSync(out)) {
        throw new Error(`تعذّر رسم ${name} (${theme}): ${(r.stderr || r.error?.message || '').slice(0, 400)}`);
      }
      console.log(`✓ ${path.relative(ROOT, out)} · ${job.size[0] * job.scale}×${job.size[1] * job.scale} · ${Math.round(statSync(out).size / 1024)} ك.ب`);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (!existsSync(CHROME)) {
  console.error(`Chrome غير موجود في ${CHROME}. مرّر مساره في TJ_CHROME.`);
  process.exit(1);
}
const only = process.argv.slice(2);
for (const [name, job] of Object.entries(JOBS)) {
  if (only.length && !only.includes(name)) continue;
  render(name, job);
}
