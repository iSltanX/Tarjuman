#!/usr/bin/env node
// فحص مواد المتاجر (جولة النشر T6، store/): كل حقل نصي معلّم بـ`<!-- field: … -->` في store/*.md يُقاس بحدود جدول T1
// (store/README.md §٣)، وكل صورة بمقاسها وصيغتها وشفافيتها كما يطلبها متجرها. بلا اعتماديات: PNG يُفك بـzlib.
//   node scripts/release/store-assets.mjs --check
// الحدود المعتمدة هنا هي ما ثبت في T1 (والمصدر بجانب كل حد)؛ وما لم يُتحقق منه لا يُخترع له حد.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { manifestMessages, manifestText } from '../targets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const STORE_DIR = 'store';
export const TEXT_FILES = Object.freeze(['listing.ar.md', 'listing.en.md', 'submission.md', 'reviewers.en.md']);

/** وسوم AMO الثابتة كما أعادتها /api/v5/addons/tags/ في 2026-11-04. */
export const AMO_TAGS = Object.freeze(['ad blocker', 'anti malware', 'anti tracker', 'antivirus', 'chat', 'container', 'content blocker', 'coupon', 'dailymotion', 'dark mode', 'dndbeyond', 'download', 'facebook', 'google', 'image search', 'mp3', 'music', 'password manager', 'pinterest', 'pixiv', 'privacy', 'reddit', 'roblox', 'scholar', 'search', 'security', 'shopping', 'social media', 'streaming', 'torrent', 'translate', 'twitch', 'twitter', 'user scripts', 'video converter', 'video downloader', 'vpn', 'wayback machine', 'whatsapp', 'word counter', 'youtube', 'zoom']);

const URL_RE = /https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|org|dev|io|net)\b/i;
const OTHER_BROWSER_RE = /\b(?:Chrome|Chromium|Firefox|Brave|Edge|Opera|Safari|Vivaldi)\b|كروم|فايرفوكس|فيرفكس|إيدج|بريف|أوبرا|سفاري/i;
const INVISIBLE_RE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/;
const TRADEMARK = 'YouTube علامة تجارية لشركة Google LLC';
const TRADEMARK_EN = 'YouTube is a trademark of Google LLC';
const DESCRIPTION = { noOtherBrowser: true, trademark: true, brandMax: 5, noDownloader: true };
const DESCRIPTION_EN = { ...DESCRIPTION, trademark: TRADEMARK_EN };

/**
 * الحقول وحدودها: max/min بالمحارف (نقاط الترميز)، وnoUrl، وقواعد الوصف. المصدر في store/README.md §٣.
 * @type {Record<string, { max?: number, min?: number, noUrl?: boolean, equalsManifest?: 'name'|'description', lines?: { max: number, each: number, words: number }, tags?: boolean, slug?: boolean, noOtherBrowser?: boolean, trademark?: boolean | string, locale?: 'en', brandMax?: number, noDownloader?: boolean }>}
 */
export const FIELD_RULES = Object.freeze({
  'manifest.name': { max: 45, equalsManifest: 'name', noOtherBrowser: true, noDownloader: true }, // Chrome 75، وAMO 50، وEdge بحسب MDN 45
  'manifest.description': { max: 132, equalsManifest: 'description', noOtherBrowser: true, noDownloader: true }, // Chrome best-listing
  'en.manifest.name': { max: 45, equalsManifest: 'name', locale: 'en', noOtherBrowser: true, noDownloader: true },
  'en.manifest.description': { max: 132, equalsManifest: 'description', locale: 'en', noOtherBrowser: true, noDownloader: true },
  'en.chromium.description': { min: 250, max: 10000, ...DESCRIPTION_EN },
  'en.amo.summary': { max: 250, noUrl: true, noOtherBrowser: true, noDownloader: true },
  'en.amo.description': { max: 15000, ...DESCRIPTION_EN },
  'amo.summary': { max: 250, noUrl: true, noOtherBrowser: true, noDownloader: true }, // AMO
  'chromium.description': { min: 250, max: 10000, ...DESCRIPTION }, // Edge: من 250 إلى 10,000
  'amo.description': { max: 15000, ...DESCRIPTION }, // AMO
  'amo.releaseNotes': { max: 3000, noOtherBrowser: true }, // addons-server
  'amo.slug': { max: 30, slug: true },
  'amo.tags': { tags: true, lines: { max: 10, each: 30, words: 100 } },
  'edge.searchTerms': { lines: { max: 7, each: 30, words: 21 } }, // Partner Center
  'reviewer.singlePurpose': { min: 50 },
  'reviewer.permission.storage': { min: 30 },
  'reviewer.permission.unlimitedStorage': { min: 30 },
  'reviewer.permission.downloads': { min: 30 },
  'reviewer.permission.host': { min: 30 },
  'reviewer.chrome': { min: 200 },
  'reviewer.edge': { min: 30 },
  'reviewer.amo': { min: 200, max: 2970 }, // Notes for Reviewers: الحد 3000 لكن AMO يعدّ السطر الجديد محرفين
});

/** @param {string} md @returns {{ id: string, text: string }[]} */
export function parseFields(md) {
  const out = [];
  const re = /<!-- field: ([a-zA-Z.]+) -->\s*\n```text\n([\s\S]*?)\n```/g;
  for (let m = re.exec(md); m; m = re.exec(md)) out.push({ id: m[1], text: m[2] });
  return out;
}

const chars = (s) => [...s].length;

/**
 * @param {{ id: string, text: string }} field @param {{ name: string, description: string }} manifest نصا البيان العربيان
 * @param {Record<string, { name: string, description: string }>} [locales] نصا البيان لكل لغة أخرى، للحقول التي لها locale
 * @returns {string[]} المشكلات بالعربية
 */
export function checkField({ id, text }, manifest, locales = {}) {
  const rule = FIELD_RULES[id];
  if (!rule) return [`حقل غير معروف: ${id}`];
  const p = [];
  const n = chars(text);
  if (!text.trim()) p.push('فارغ');
  if (rule.max && n > rule.max) p.push(`طوله ${n} وحده ${rule.max}`);
  if (rule.min && n < rule.min) p.push(`طوله ${n} وأدناه ${rule.min}`);
  if (INVISIBLE_RE.test(text)) p.push('فيه محرف اتجاه أو محرف غير مرئي');
  if (rule.noUrl && URL_RE.test(text)) p.push('فيه رابط والحقل يمنعه');
  if (rule.equalsManifest && text !== (rule.locale ? locales[rule.locale] : manifest)?.[rule.equalsManifest]) p.push(`لا يطابق ${rule.equalsManifest} في البيان`);
  if (rule.noOtherBrowser) {
    const m = OTHER_BROWSER_RE.exec(text);
    if (m) p.push(`يذكر متصفحًا: ${m[0]}`);
  }
  if (rule.noDownloader && /downloader/i.test(text)) p.push('فيه «downloader»');
  if (rule.trademark && !text.includes(typeof rule.trademark === 'string' ? rule.trademark : TRADEMARK)) p.push('بلا جملة إسناد علامة يوتيوب');
  if (rule.brandMax) {
    const yt = (text.match(/يوتيوب|YouTube/g) ?? []).length;
    const g = (text.match(/Google/g) ?? []).length;
    if (yt > rule.brandMax) p.push(`«يوتيوب» ${yt} مرات والحد ${rule.brandMax}`);
    if (g > rule.brandMax) p.push(`«Google» ${g} مرات والحد ${rule.brandMax}`);
  }
  if (rule.lines) {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length > rule.lines.max) p.push(`${lines.length} سطرًا والحد ${rule.lines.max}`);
    for (const l of lines) if (chars(l) > rule.lines.each) p.push(`«${l}» أطول من ${rule.lines.each}`);
    const words = lines.reduce((a, l) => a + l.split(/\s+/).length, 0);
    if (words > rule.lines.words) p.push(`${words} كلمة والحد ${rule.lines.words}`);
    if (rule.tags) for (const l of lines) if (!AMO_TAGS.includes(l)) p.push(`«${l}» ليس من وسوم AMO`);
  }
  if (rule.slug && !/^[a-z0-9-]+$/.test(text)) p.push('الرابط بغير الأحرف اللاتينية الصغيرة والأرقام والشرطة');
  return p;
}

// ---------------------------------------------------------------- PNG

/** يفك PNG بعمق 8 ولون RGB أو RGBA بلا تشابك. @returns {{ width: number, height: number, channels: 3|4, pixels: Buffer }} */
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('ليس PNG');
  let p = 8;
  let width = 0;
  let height = 0;
  let type = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const kind = buf.toString('latin1', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (kind === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8) throw new Error(`عمق ${data[8]} غير مدعوم`);
      type = data[9];
      if (type !== 2 && type !== 6) throw new Error(`نوع لون ${type} غير مدعوم`);
      if (data[12] !== 0) throw new Error('صورة متشابكة');
    } else if (kind === 'IDAT') {
      idat.push(data);
    } else if (kind === 'IEND') {
      break;
    }
    p += 12 + len;
  }
  const channels = type === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[y * stride + x - channels] : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? pixels[(y - 1) * stride + x - channels] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      pixels[y * stride + x] = v & 0xff;
    }
  }
  return { width, height, channels, pixels };
}
const alphaAt = (img, x, y) => (img.channels === 4 ? img.pixels[(y * img.width + x) * 4 + 3] : 255);

/** المواد المطلوبة: المسار ومقاسه وقاعدة الشفافية. والمصادر في store/README.md §٣. */
export const ASSETS = Object.freeze([
  { file: 'icons/chrome-store-icon-128.png', w: 128, h: 128, rule: 'padded16' }, // Chrome: 128 والرسم 96 بحشو شفاف 16
  { file: 'icons/edge-logo-300.png', w: 300, h: 300, rule: 'any' }, // Edge: 1:1 والموصى به 300
  { file: 'promo/small-promo-440x280.png', w: 440, h: 280, rule: 'opaque' }, // Chrome وEdge
  { file: 'promo/marquee-1400x560.png', w: 1400, h: 560, rule: 'opaque' }, // Chrome Marquee وEdge Large
]);
/** اللقطات لكل لغة من لغات الإدراج: Chrome حتى 5 وEdge حتى 6 بمقاس 1280×800، وAMO 1280×960 (يجتاز 1.6:1 الموصى به و4:3 فأكبر من 1000×750). */
export const SHOT_SETS = Object.freeze([
  { dir: 'screenshots/chromium/ar', w: 1280, h: 800, min: 1, max: 5 },
  { dir: 'screenshots/chromium/en', w: 1280, h: 800, min: 1, max: 5 },
  { dir: 'screenshots/firefox/ar', w: 1280, h: 960, min: 1, max: 10 },
  { dir: 'screenshots/firefox/en', w: 1280, h: 960, min: 1, max: 10 },
]);

/** @returns {string[]} */
export function checkImage(img, { w, h, rule }) {
  const p = [];
  if (img.width !== w || img.height !== h) return [`مقاسه ${img.width}×${img.height} والمطلوب ${w}×${h}`];
  if (rule === 'opaque') {
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (alphaAt(img, x, y) !== 255) return [`بكسل شفاف عند ${x},${y} (المطلوب صورة كاملة بلا شفافية وبزوايا مربعة)`];
      }
    }
  }
  if (rule === 'padded16') {
    let inside = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = alphaAt(img, x, y);
        const inBox = x >= 16 && x < w - 16 && y >= 16 && y < h - 16;
        if (!inBox && a !== 0) return [`الحشو غير شفاف عند ${x},${y}`];
        if (inBox && a > 0) inside++;
      }
    }
    if (inside < 96 * 96 * 0.5) p.push('الرسم داخل 96×96 أقل من نصفه');
  }
  return p;
}

// ---------------------------------------------------------------- التشغيل

export async function checkStore(root = ROOT) {
  const problems = [];
  const summary = { fields: [], assets: [], shots: {} };
  const raw = JSON.parse(await readFile(path.join(root, 'src/manifest.json'), 'utf8'));
  const messages = await manifestMessages(path.join(root, 'src'));
  const textsOf = (locale) => ({ name: manifestText(raw.name, messages[locale]), description: manifestText(raw.description, messages[locale]) });
  const manifest = textsOf('ar');
  const locales = { en: textsOf('en') };
  const seen = new Set();
  for (const f of TEXT_FILES) {
    const md = await readFile(path.join(root, STORE_DIR, f), 'utf8');
    for (const field of parseFields(md)) {
      if (seen.has(field.id)) problems.push(`${f}: ${field.id} مكرر`);
      seen.add(field.id);
      const issues = checkField(field, manifest, locales);
      summary.fields.push({ id: field.id, chars: chars(field.text) });
      for (const i of issues) problems.push(`${f}: ${field.id} — ${i}`);
    }
  }
  for (const id of Object.keys(FIELD_RULES)) if (!seen.has(id)) problems.push(`حقل بلا مادة: ${id}`);
  for (const a of ASSETS) {
    try {
      const img = decodePng(await readFile(path.join(root, STORE_DIR, a.file)));
      for (const i of checkImage(img, a)) problems.push(`${a.file} — ${i}`);
      summary.assets.push(`${a.file} ${img.width}×${img.height}`);
    } catch (err) {
      problems.push(`${a.file} — ${err.code === 'ENOENT' ? 'غير موجود' : err.message}`);
    }
  }
  const names = {};
  for (const set of SHOT_SETS) {
    const dir = path.join(root, STORE_DIR, set.dir);
    const list = (await readdir(dir).catch(() => [])).filter((n) => n.endsWith('.png')).sort();
    names[set.dir] = list;
    summary.shots[set.dir] = list.length;
    if (list.length < set.min || list.length > set.max) problems.push(`${set.dir}: ${list.length} لقطة والمسموح من ${set.min} إلى ${set.max}`);
    for (const n of list) {
      try {
        const img = decodePng(await readFile(path.join(dir, n)));
        for (const i of checkImage(img, { w: set.w, h: set.h, rule: 'opaque' })) problems.push(`${set.dir}/${n} — ${i}`);
      } catch (err) {
        problems.push(`${set.dir}/${n} — ${err.message}`);
      }
    }
  }
  if (new Set(SHOT_SETS.map((s) => names[s.dir].join(','))).size > 1) problems.push('لقطات اللغات والمتصفحات ليست المجموعة نفسها بأسمائها');
  return { problems, summary };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { problems, summary } = await checkStore();
  console.log(`الحقول: ${summary.fields.length} · الصور: ${summary.assets.length} · اللقطات: ${Object.entries(summary.shots).map(([d, n]) => `${d.split('/').pop()} ${n}`).join('، ')}`);
  if (problems.length) {
    for (const x of problems) console.log(`✗ ${x}`);
    process.exit(1);
  }
  console.log('✓ مواد المتاجر سليمة: كل حقل في حده، وكل صورة بمقاسها وشفافيتها.');
}
