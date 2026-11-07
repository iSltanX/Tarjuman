#!/usr/bin/env node
// مولّد أصول الشعار للهوية الرابعة «كتابٌ مفتوح» (docs/identity-v4.md): ملفا المصدر SVG للرمزين #logo و#logoS، وأيقونات الإضافة
// PNG بقواعد البلاطة في لوحة الهوية 03 (البند 10): بلاطة صنوبر #1E4A44 بالوضعين والرمز عاج #F3EFE6 بعرض 75% منها، وزاوية 23%
// من الضلع، ورفع بصري فوق المركز، والرمز المصحّح تحت 48. المسارات من src/ui/logo.js نفسها (لا نسخة ثانية)، والقياسات حرفيًا
// من رسوم اللوحة: 48 ← translate(6 7.9) scale(0.18) بزاوية 11، و32 ← translate(4 5.3) scale(0.12) بزاوية 7، و16 ←
// translate(2 2.7) scale(0.06) بزاوية 4، و128 هي بلاطة 48 مكبّرة (128/48).
//
// يرسم بلا متصفح ولا شبكة ولا اعتمادية: المسارات تُسطَّح مضلعات (المنحنيات والأقواس بقطع صغيرة)، وتُملأ بقاعدة nonzero بأخذ 16
// عيّنة رأسية لكل بكسل وتغطية أفقية دقيقة لكل عيّنة، ثم تُركّب بألفا sRGB، ويُكتب PNG بـzlib المدمج. الناتج حتمي: المدخلات
// نفسها تعطي البايتات نفسها.
//
//   command node tools/brand/icons.mjs            يكتب src/icons/tarjuman-icon-{16,32,48,128}.png وملفي المصدر في tools/brand/،
//                                                 وأيقونة متجر Chrome ‏128 وشعار Edge ‏300 في store/icons/ (لوحة الهوية 18)
//   command node tools/brand/icons.mjs --check    يفشل إن اختلف ملف متتبَّع عمّا يولّده
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { LOGO_VIEWBOX, MARK_BOOK, MARK_BOOK_SMALL, MARK_DOTS } from '../../src/ui/logo.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const PINE = '#1E4A44';
export const IVORY = '#F3EFE6';

/**
 * أيقونات البيان: الحجم، وزاوية البلاطة، وموضع الرمز ومقياسه داخلها، وهل هو المصحّح. من رسوم لوحة 03 (البند 10).
 * @type {Record<number, { rx: number, tx: number, ty: number, scale: number, small: boolean }>}
 */
export const MANIFEST_ICONS = Object.freeze({
  16: { rx: 4, tx: 2, ty: 2.7, scale: 0.06, small: true },
  32: { rx: 7, tx: 4, ty: 5.3, scale: 0.12, small: true },
  48: { rx: 11, tx: 6, ty: 7.9, scale: 0.18, small: false },
  128: { rx: 11 * 128 / 48, tx: 6 * 128 / 48, ty: 7.9 * 128 / 48, scale: 0.18 * 128 / 48, small: false },
});

// ---- المسارات إلى مضلعات ----

/** يقرأ مسار SVG بالأوامر المطلقة M وL وH وV وC وZ (وحدها في مسارات الشعار) إلى مضلعات مسطّحة. */
export function pathToPolygons(d, { tx = 0, ty = 0, scale = 1, steps = 48 } = {}) {
  const tokens = d.match(/[MLHVCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi);
  const polys = [];
  let poly = [];
  let cmd = null;
  let x = 0;
  let y = 0;
  let i = 0;
  const num = () => Number(tokens[i++]);
  const put = (px, py) => poly.push([tx + px * scale, ty + py * scale]);
  while (i < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[i])) cmd = tokens[i++];
    if (!/^[MLHVCZ]$/.test(cmd)) throw new Error(`أمر مسار غير مدعوم: ${cmd}`);
    if (cmd === 'Z') {
      if (poly.length) polys.push(poly);
      poly = [];
      continue;
    }
    if (cmd === 'M') {
      if (poly.length) polys.push(poly);
      poly = [];
      x = num(); y = num(); put(x, y);
      cmd = 'L';
    } else if (cmd === 'L') {
      x = num(); y = num(); put(x, y);
    } else if (cmd === 'H') {
      x = num(); put(x, y);
    } else if (cmd === 'V') {
      y = num(); put(x, y);
    } else if (cmd === 'C') {
      const [x1, y1, x2, y2, x3, y3] = [num(), num(), num(), num(), num(), num()];
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const u = 1 - t;
        put(u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3);
      }
      x = x3; y = y3;
    }
  }
  if (poly.length) polys.push(poly);
  return polys;
}

/** مستطيل بزوايا مستديرة مضلعًا (كل ربع دائرة 24 قطعة). */
export function roundedRect(w, h, r, steps = 24) {
  const pts = [];
  const arc = (cx, cy, a0) => {
    for (let s = 0; s <= steps; s++) {
      const a = a0 + (Math.PI / 2) * (s / steps);
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  };
  arc(w - r, r, -Math.PI / 2);
  arc(w - r, h - r, 0);
  arc(r, h - r, Math.PI / 2);
  arc(r, r, Math.PI);
  return [pts];
}

// ---- الملء بالتغطية ----

const SUB = 16;

/** تغطية كل بكسل (0..1) لمجموعة مضلعات بقاعدة nonzero. */
export function coverage(polys, w, h) {
  const cov = new Float64Array(w * h);
  const edges = [];
  for (const p of polys) {
    for (let k = 0; k < p.length; k++) {
      const [x0, y0] = p[k];
      const [x1, y1] = p[(k + 1) % p.length];
      if (y0 !== y1) edges.push({ x0, y0, x1, y1, dir: y1 > y0 ? 1 : -1 });
    }
  }
  for (let row = 0; row < h; row++) {
    for (let s = 0; s < SUB; s++) {
      const sy = row + (s + 0.5) / SUB;
      const xs = [];
      for (const e of edges) {
        const lo = Math.min(e.y0, e.y1);
        const hi = Math.max(e.y0, e.y1);
        if (sy < lo || sy >= hi) continue;
        xs.push({ x: e.x0 + ((sy - e.y0) / (e.y1 - e.y0)) * (e.x1 - e.x0), dir: e.dir });
      }
      xs.sort((a, b) => a.x - b.x);
      let wind = 0;
      for (let k = 0; k < xs.length - 1; k++) {
        wind += xs[k].dir;
        if (wind === 0) continue;
        const a = Math.max(0, xs[k].x);
        const b = Math.min(w, xs[k + 1].x);
        if (b <= a) continue;
        for (let px = Math.floor(a); px < Math.ceil(b); px++) {
          const span = Math.min(b, px + 1) - Math.max(a, px);
          if (span > 0) cov[row * w + px] += span / SUB;
        }
      }
    }
  }
  return cov;
}

const hexRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** صورة RGBA بطبقات: كل طبقة مضلعات ولون، تُركّب «فوق» ما قبلها بألفا sRGB. */
export function render(w, h, layers) {
  const out = new Float64Array(w * h * 4);
  for (const { polys, color } of layers) {
    const cov = coverage(polys, w, h);
    const [r, g, b] = hexRgb(color);
    for (let p = 0; p < w * h; p++) {
      const a = Math.min(1, cov[p]);
      if (a <= 0) continue;
      const da = out[p * 4 + 3];
      const oa = a + da * (1 - a);
      for (const [c, v] of [[0, r], [1, g], [2, b]]) out[p * 4 + c] = (v * a + out[p * 4 + c] * da * (1 - a)) / oa;
      out[p * 4 + 3] = oa;
    }
  }
  const px = Buffer.alloc(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    const a = out[p * 4 + 3];
    for (let c = 0; c < 3; c++) px[p * 4 + c] = a > 0 ? Math.round(out[p * 4 + c]) : 0;
    px[p * 4 + 3] = Math.round(a * 255);
  }
  return px;
}

// ---- PNG ----

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (const b of buf) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** PNG بعمق 8 RGBA بلا مرشّح، وزلب بمستوى 9 (حتمي). */
export function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---- الأصول ----

/** الرمز (النقطتان والكتاب) مضلعاتٍ بموضع ومقياس. */
export function markPolygons({ tx, ty, scale, small }) {
  return [...MARK_DOTS, small ? MARK_BOOK_SMALL : MARK_BOOK].flatMap((d) => pathToPolygons(d, { tx, ty, scale }));
}

/** أيقونة بلاطة بحجمها (16 أو 32 أو 48 أو 128). */
export function tileIcon(size) {
  const spec = MANIFEST_ICONS[size];
  if (!spec) throw new Error(`حجم غير معتمد: ${size}`);
  return png(size, size, render(size, size, [
    { polys: roundedRect(size, size, spec.rx), color: PINE },
    { polys: markPolygons(spec), color: IVORY },
  ]));
}

/**
 * أيقونة متجر Chrome ‏128 (لوحة الهوية 18): بلاطة 48 نفسها مكبّرة إلى 96 (×2) في وسط لوح شفاف 128، فالحشو الشفاف 16 من كل جهة كما
 * يطلب المتجر (الرسم 96×96).
 */
export function storeIcon128() {
  const k = 2;
  const t = MANIFEST_ICONS[48];
  return png(128, 128, render(128, 128, [
    { polys: roundedRect(96, 96, t.rx * k).map((poly) => poly.map(([x, y]) => [x + 16, y + 16])), color: PINE },
    { polys: markPolygons({ tx: 16 + t.tx * k, ty: 16 + t.ty * k, scale: t.scale * k, small: false }), color: IVORY },
  ]));
}

/**
 * شعار Edge ‏300×300 (لوحة الهوية 18): بلاطة صنوبر بزاوية 23% (68 من 300، كما في رسم اللوحة 34 من 150) والرمز عاجًا بعرض 64% (192)
 * في الوسط تمامًا كما في اللوحة (توسيطٌ بلا رفع بصري).
 */
export function edgeLogo300() {
  const w = 192;
  const scale = w / 200;
  return png(300, 300, render(300, 300, [
    { polys: roundedRect(300, 300, 68), color: PINE },
    { polys: markPolygons({ tx: (300 - w) / 2, ty: (300 - 176.4 * scale) / 2, scale, small: false }), color: IVORY },
  ]));
}

/** ملف المصدر SVG للرمز (الأساسي أو المصحّح) بلون الصنوبر، حرفيًا من مسارات logo.js. */
export function sourceSvg({ small = false } = {}) {
  const book = small ? MARK_BOOK_SMALL : MARK_BOOK;
  const title = small ? 'ترجمان — الرمز المصحّح لما دون 32 بكسل (#logoS)' : 'ترجمان — الرمز «الأصيل المضبوط» (#logo)';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LOGO_VIEWBOX}" width="200" height="176.4">
  <title>${title}</title>
  <path fill="${PINE}" d="${MARK_DOTS[0]}"/>
  <path fill="${PINE}" d="${MARK_DOTS[1]}"/>
  <path fill="${PINE}" d="${book}"/>
</svg>
`;
}

export const OUTPUTS = Object.freeze({
  ...Object.fromEntries(Object.keys(MANIFEST_ICONS).map((n) => [`src/icons/tarjuman-icon-${n}.png`, () => tileIcon(Number(n))])),
  'tools/brand/tarjuman-A-asil.svg': () => Buffer.from(sourceSvg()),
  'tools/brand/tarjuman-A-asil-small.svg': () => Buffer.from(sourceSvg({ small: true })),
  'store/icons/chrome-store-icon-128.png': () => storeIcon128(),
  'store/icons/edge-logo-300.png': () => edgeLogo300(),
});

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  const stale = [];
  for (const [rel, make] of Object.entries(OUTPUTS)) {
    const file = path.join(ROOT, rel);
    const bytes = make();
    if (check) {
      if (!existsSync(file) || !readFileSync(file).equals(bytes)) stale.push(rel);
    } else {
      writeFileSync(file, bytes);
      console.log(`كُتب ${rel} (${bytes.length} بايت)`);
    }
  }
  if (check) {
    if (stale.length) {
      console.error(`أصول الشعار لا تطابق ما يولّده tools/brand/icons.mjs: ${stale.join('، ')}`);
      process.exit(1);
    }
    console.log('أصول الشعار مطابقة');
  }
}
