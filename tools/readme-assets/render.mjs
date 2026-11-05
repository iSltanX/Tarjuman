#!/usr/bin/env node
// مولّد صور واجهة المستودع (README وصورة المعاينة) من قوالب HTML في هذا المجلد، بالهوية المعتمدة نفسها التي تشحنها
// الإضافة: الألوان من src/ui/tokens.css، والخطوط من src/ui/fonts.css، والشعار من src/ui/logo.js، والأيقونات من
// src/ui/icons.js، واللقطات الحقيقية من store/screenshots/. فلا لون ولا شعار منسوخ يمكن أن ينجرف عن المنتج.
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
import { logo, MARK_PATH } from '../../src/ui/logo.js';
import { ICONS } from '../../src/ui/icons.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const OUT = path.join(ROOT, '.github/assets');

/** القوالب: المقاس بالبكسل المنطقي، والوضعان، ومعامل الرسم. */
const JOBS = {
  banner: { size: [1280, 400], themes: ['light', 'dark'], scale: 2 },
  'how-it-works': { size: [1280, 340], themes: ['light', 'dark'], scale: 2 },
  social: { size: [1280, 640], themes: ['brand'], scale: 1, out: 'social-preview.png' },
};

const CHROME = process.env.TJ_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/** مستند وهمي صغير يكفي logo() لتبني SVG، ثم يُسلسل نصًّا. */
function fakeDoc() {
  const make = (tag) => ({
    tag, attrs: {}, kids: [],
    setAttribute(k, v) { this.attrs[k] = String(v); },
    append(...k) { this.kids.push(...k); },
  });
  return { createElementNS: (_ns, tag) => make(tag) };
}
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
function serialize(n) {
  const attrs = Object.entries(n.attrs).map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
  const xmlns = n.tag === 'svg' ? ' xmlns="http://www.w3.org/2000/svg"' : '';
  return `<${n.tag}${xmlns}${attrs}>${n.kids.map(serialize).join('')}</${n.tag}>`;
}

function logoSvg(height) {
  return serialize(logo({ height, label: 'ترجمان', doc: fakeDoc() }));
}
function markSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true"><path fill-rule="evenodd" d="${MARK_PATH}"/></svg>`;
}
function iconSvg(name, size) {
  const parts = ICONS[name];
  if (!parts) throw new Error(`أيقونة غير معروفة: ${name}`);
  const body = parts.map(([tag, a]) => `<${tag}${Object.entries(a).map(([k, v]) => ` ${k}="${esc(String(v))}"`).join('')}/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/** يملأ القالب: {{ROOT}} مسار المستودع، و{{THEME}}، و{{LOGO:h}} و{{MARK:s}} و{{ICON:name:s}}. */
function fill(html, theme) {
  return html
    .replaceAll('{{ROOT}}', pathToFileURL(ROOT).href)
    .replaceAll('{{THEME}}', theme)
    .replace(/\{\{LOGO:(\d+)\}\}/g, (_, h) => logoSvg(Number(h)))
    .replace(/\{\{MARK:(\d+)\}\}/g, (_, s) => markSvg(Number(s)))
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
