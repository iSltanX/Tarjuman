#!/usr/bin/env node
// مولّد أصول الشعار للهوية الخامسة «التاء» (docs/identity.md، لوحة الهوية 04): ملفا المصدر SVG للرمزين #logo و#logoS، وأيقونات
// الإضافة والمتجر PNG بقواعد البلاطة: بلاطة الأرجوان العميق #762E61 بالوضعين بزاوية 22% من الضلع، والرمز بالورق #FEF8FC بعرض 68%
// منها وهامش 16% من كل جهة، مرفوعًا قليلًا عن المركز. المسارات من src/ui/logo.js نفسها (لا نسخة ثانية)، والرمز في إطار اللوحة
// 240 × 204 (أخفض 9 من إطار logo.js). و48 من النسخة الصغيرة المتجهة، و128 الرسم 96 والحشو الشفاف 16 من كل جهة (أيقونة البيان
// وأيقونة متجر Chrome واحدة)، وشعار Edge ‏300 بلاطة 240 على أرضية الصفحة #F9F5F8 بلا شفافية. أما 16 و32 فمرسومتان بكسلًا بكسلًا
// (لوحة 01)، فلا تُولَّدان بتصغير: يُنسخان كما هما من tools/brand/pixel/.
//
// يرسم بلا متصفح ولا شبكة ولا اعتمادية: المسارات تُسطَّح مضلعات (المنحنيات بقطع صغيرة)، وتُملأ بقاعدة nonzero بأخذ 16 عيّنة رأسية
// لكل بكسل وتغطية أفقية دقيقة لكل عيّنة، ثم تُركّب بألفا sRGB، ويُكتب PNG بـzlib المربوط بـNode. الناتج حتمي في بكسلاته: المدخلات
// نفسها تعطي الرأس والبكسلات نفسها. أما البايتات المضغوطة فتتبع مكتبة zlib (zlib النظام في macOS غير المضمّنة في نسخ Node الرسمية،
// كما في U63 للأرشيفات)، فالمطابقة والفحص بالمحتوى بعد فك الضغط (assetContent).
//
//   command node tools/brand/icons.mjs            يكتب src/icons/tarjuman-icon-{16,32,48,128}.png وملفي المصدر في tools/brand/،
//                                                 وأيقونة متجر Chrome ‏128 وشعار Edge ‏300 في store/icons/
//   command node tools/brand/icons.mjs --check    يفشل إن اختلف ملف متتبَّع عمّا يولّده أو ينسخه، في رأسه أو بكسلاته (أو بايتاته لغير PNG)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';
import { LOGO_VIEWBOX, MARK_BOOK, MARK_BOOK_SMALL, MARK_DOTS } from '../../src/ui/logo.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const PLUM = '#762E61';
export const PAPER = '#FEF8FC';
/** أرضية الصفحة الفاتحة (--tj-bg) تحت بلاطة شعار Edge. */
export const EDGE_GROUND = '#F9F5F8';

/** الرمز في إطار اللوحة 04 (240 × 204): أخفض 9 من إطار logo.js. */
export const FRAME_DY = 9;
/** نسب البلاطة من ضلعها: الزاوية، وعرض الرمز، والهامش، والرفع البصري (من رسوم اللوحة: 1.35 من 48، و2.69 من 96، و6.73 من 240). */
export const TILE = Object.freeze({ radius: 0.22, mark: 0.68, inset: 0.16, lift: 0.02804 });

/**
 * الأيقونات المولّدة: اللوح، وضلع البلاطة وموضعها فيه، والنسخة الصغيرة أم الأساسية، وأرضية معتمة إن كانت.
 * @type {Record<string, { size: number, tile: number, at: number, small: boolean, ground?: string }>}
 */
export const TILE_ICONS = Object.freeze({
  48: { size: 48, tile: 48, at: 0, small: true },
  128: { size: 128, tile: 96, at: 16, small: false },
  edge300: { size: 300, tile: 240, at: 30, small: false, ground: EDGE_GROUND },
});

/** أيقونتا البيان المرسومتان بكسلًا بكسلًا، ومصدرهما المتتبَّع. */
export const PIXEL_ICONS = Object.freeze({ 16: 'tools/brand/pixel/tarjuman-icon-16.png', 32: 'tools/brand/pixel/tarjuman-icon-32.png' });

// ---- المسارات إلى مضلعات ----

/** يقرأ مسار SVG بالأوامر المطلقة M وL وH وV وC وQ وZ (وحدها في مسارات الشعار) إلى مضلعات مسطّحة. */
export function pathToPolygons(d, { tx = 0, ty = 0, scale = 1, steps = 48 } = {}) {
  const tokens = d.match(/[MLHVCQZ]|-?\d*\.?\d+(?:e-?\d+)?/gi);
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
    if (!/^[MLHVCQZ]$/.test(cmd)) throw new Error(`أمر مسار غير مدعوم: ${cmd}`);
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
    } else if (cmd === 'Q') {
      const [x1, y1, x2, y2] = [num(), num(), num(), num()];
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const u = 1 - t;
        put(u * u * x + 2 * u * t * x1 + t * t * x2, u * u * y + 2 * u * t * y1 + t * t * y2);
      }
      x = x2; y = y2;
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
/**
 * PNG بعمق 8 بلا مرشّح، RGBA أو RGB (rgb: للوح معتم كشعار Edge، والألفا فيه 255 كلها)، وزلب بمستوى 9 افتراضيًا (level للاختبار
 * وحده: ضغط آخر للبكسلات نفسها).
 */
export function png(w, h, rgba, { level = 9, rgb = false } = {}) {
  const ch = rgb ? 3 : 4;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = rgb ? 2 : 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * ch + 1) * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < ch; c++) raw[y * (w * ch + 1) + 1 + x * ch + c] = rgba[(y * w + x) * 4 + c];
    }
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level })), chunk('IEND', Buffer.alloc(0))]);
}

// ---- الأصول ----

/** الرمز (النقطتان والكتاب) مضلعاتٍ بموضع ومقياس. */
export function markPolygons({ tx, ty, scale, small }) {
  return [...MARK_DOTS, small ? MARK_BOOK_SMALL : MARK_BOOK].flatMap((d) => pathToPolygons(d, { tx, ty, scale }));
}

/** طبقتا البلاطة بضلع tile عند (at، at): البلاطة الأرجوانية، والرمز بالورق بنسب TILE. */
export function tileLayers({ tile, at, small }) {
  const scale = (TILE.mark * tile) / 240;
  const tx = at + TILE.inset * tile;
  const ty = at + TILE.inset * tile + TILE.lift * tile + FRAME_DY * scale;
  return [
    { polys: roundedRect(tile, tile, TILE.radius * tile).map((poly) => poly.map(([x, y]) => [x + at, y + at])), color: PLUM },
    { polys: markPolygons({ tx, ty, scale, small }), color: PAPER },
  ];
}

/** أيقونة مولّدة باسمها في TILE_ICONS (48 أو 128 أو edge300). */
export function tileIcon(name) {
  const spec = TILE_ICONS[name];
  if (!spec) throw new Error(`أيقونة غير معتمدة: ${name}`);
  const ground = spec.ground ? [{ polys: [[[0, 0], [spec.size, 0], [spec.size, spec.size], [0, spec.size]]], color: spec.ground }] : [];
  return png(spec.size, spec.size, render(spec.size, spec.size, [...ground, ...tileLayers(spec)]), { rgb: !!spec.ground });
}

/** ملف المصدر SVG للرمز (الأساسي أو الصغير) بلون الرمز في الفاتح (--tj-logo-glyph)، حرفيًا من مسارات logo.js. */
export const GLYPH = '#682455';
export function sourceSvg({ small = false } = {}) {
  const book = small ? MARK_BOOK_SMALL : MARK_BOOK;
  const title = small ? 'ترجمان — الرمز «التاء» للنسخة الصغيرة (#logoS)' : 'ترجمان — الرمز «التاء» (#logo)';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LOGO_VIEWBOX}" width="240" height="195">
  <title>${title}</title>
  <path fill="${GLYPH}" d="${book}"/>
  <path fill="${GLYPH}" d="${MARK_DOTS[0]}"/>
  <path fill="${GLYPH}" d="${MARK_DOTS[1]}"/>
</svg>
`;
}

/**
 * ما يحدده المولّد في ملف: لـPNG رأسه (IHDR) وبكسلاته بعد فك الضغط وقطعه الأخرى بأنواعها، بعد التحقق من CRC كل قطعة (ملف تالف
 * يرمي). ولغير PNG بايتاته كما هي. فضغطٌ آخر للصورة نفسها مطابق، وبكسل واحد أو مقاس أو قطعة مختلفة غير مطابق.
 * @param {Buffer} buf
 */
export function assetContent(buf) {
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504E47 || buf.readUInt32BE(4) !== 0x0D0A1A0A) return buf;
  const ihdr = [];
  const idat = [];
  const other = [];
  let end = false;
  for (let o = 8; o < buf.length && !end;) {
    if (o + 12 > buf.length) throw new Error('PNG مقطوع');
    const n = buf.readUInt32BE(o);
    const td = buf.subarray(o + 4, o + 8 + n);
    if (o + 12 + n > buf.length || crc32(td) !== buf.readUInt32BE(o + 8 + n)) throw new Error('PNG بقطعة تالفة');
    const type = td.toString('latin1', 0, 4);
    if (type === 'IHDR') ihdr.push(td.subarray(4));
    else if (type === 'IDAT') idat.push(td.subarray(4));
    else if (type === 'IEND') end = true;
    else other.push(td);
    o += 12 + n;
  }
  if (ihdr.length !== 1 || !idat.length || !end) throw new Error('PNG بلا IHDR واحد أو IDAT أو IEND');
  return Buffer.concat([Buffer.from('PNG-CONTENT\0'), ihdr[0], inflateSync(Buffer.concat(idat)), ...other]);
}
/** أصلان متطابقان في محتواهما (assetContent). */
export const sameAsset = (a, b) => assetContent(a).equals(assetContent(b));

/** يفك PNG بعمق 8 (RGBA أو RGB) بمرشّحاته الخمسة إلى بكسلات RGBA (الألفا 255 لـRGB). */
export function decodePng(buf) {
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  const ct = buf[25];
  if (buf[24] !== 8 || (ct !== 6 && ct !== 2)) throw new Error('PNG غير مدعوم: عمق 8 وRGBA أو RGB وحدها');
  const ch = ct === 6 ? 4 : 3;
  const idat = [];
  for (let o = 8; o < buf.length;) {
    const n = buf.readUInt32BE(o);
    if (buf.toString('latin1', o + 4, o + 8) === 'IDAT') idat.push(buf.subarray(o + 8, o + 8 + n));
    o += 12 + n;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const px = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? line[i - ch] : 0;
      const up = prev[i];
      const c = i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += up;
      else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) {
        const q = a + up - c;
        const pa = Math.abs(q - a);
        const pb = Math.abs(q - up);
        const pc = Math.abs(q - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c;
      }
      line[i] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      for (let k = 0; k < ch; k++) px[(y * w + x) * 4 + k] = line[x * ch + k];
      if (ch === 3) px[(y * w + x) * 4 + 3] = 255;
    }
    prev = line;
  }
  return { w, h, ct, px };
}

/**
 * حدّ التنعيم بين بلاطة مرسومة وما يرسمه المولّد من الهندسة نفسها: بعد تركيب الاثنتين على الأبيض وعلى الأسود (ما يُرى في الشريط
 * الفاتح والداكن) لا يزيد فرق قناة على 24 من 255، ولا يتجاوز 8 إلا في 4% من البكسلات (حواف الزوايا والرمز). وإزاحة الرمز بكسلًا
 * أو تغيير لونه أو زاويته يتجاوز الحدّ.
 */
export const DRAWN_TOLERANCE = Object.freeze({ max: 24, over8: 0.04 });

/** بلاطتان متقاربتان بحدّ التنعيم: المقاس ونوع اللون نفساهما، والفرق المرئي تحت DRAWN_TOLERANCE. */
export function closeAsset(a, b) {
  const x = decodePng(a);
  const y = decodePng(b);
  if (x.w !== y.w || x.h !== y.h || x.ct !== y.ct) return false;
  for (const bg of [255, 0]) {
    let over = 0;
    for (let p = 0; p < x.w * x.h; p++) {
      let d = 0;
      for (let c = 0; c < 3; c++) {
        const va = (x.px[p * 4 + c] * x.px[p * 4 + 3] + bg * (255 - x.px[p * 4 + 3])) / 255;
        const vb = (y.px[p * 4 + c] * y.px[p * 4 + 3] + bg * (255 - y.px[p * 4 + 3])) / 255;
        d = Math.max(d, Math.abs(va - vb));
      }
      if (d > DRAWN_TOLERANCE.max) return false;
      if (d > 8) over++;
    }
    if (over > DRAWN_TOLERANCE.over8 * x.w * x.h) return false;
  }
  return true;
}

/**
 * البلاطات المرسومة في حزمة الهوية (من رسم اللوحة 04 نفسه): تُبقى كما هي ما دامت تقارب ما يولّده المولّد بحدّ التنعيم، ولا
 * تُستبدل بالمولَّد. فالكتابة لا تمسها إلا إن تجاوزته (تغيّرت الهندسة)، والفحص بالحدّ لا بالتطابق.
 */
export const DRAWN = Object.freeze(new Set(['src/icons/tarjuman-icon-48.png', 'src/icons/tarjuman-icon-128.png', 'store/icons/chrome-store-icon-128.png', 'store/icons/edge-logo-300.png']));

export const OUTPUTS = Object.freeze({
  ...Object.fromEntries(Object.entries(PIXEL_ICONS).map(([n, src]) => [`src/icons/tarjuman-icon-${n}.png`, () => readFileSync(path.join(ROOT, src))])),
  'src/icons/tarjuman-icon-48.png': () => tileIcon('48'),
  'src/icons/tarjuman-icon-128.png': () => tileIcon('128'),
  'tools/brand/tarjuman-T.svg': () => Buffer.from(sourceSvg()),
  'tools/brand/tarjuman-T-small.svg': () => Buffer.from(sourceSvg({ small: true })),
  'store/icons/chrome-store-icon-128.png': () => tileIcon('128'),
  'store/icons/edge-logo-300.png': () => tileIcon('edge300'),
});

/** الملف المتتبَّع rel يطابق ما يولّده المولّد: بالحدّ للبلاطات المرسومة، وبالمحتوى لغيرها. */
export function matchesOutput(rel, buf) {
  const made = OUTPUTS[rel]();
  return DRAWN.has(rel) ? closeAsset(buf, made) : sameAsset(buf, made);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  const stale = [];
  for (const [rel, make] of Object.entries(OUTPUTS)) {
    const file = path.join(ROOT, rel);
    const ok = existsSync(file) && matchesOutput(rel, readFileSync(file));
    if (check) {
      if (!ok) stale.push(rel);
    } else if (DRAWN.has(rel) && ok) {
      console.log(`أُبقي ${rel} (مرسوم، ضمن حدّ التنعيم)`);
    } else {
      const bytes = make();
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
