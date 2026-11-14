// الشعار «التاء» (docs/identity.md، لوحة الهوية 01): مسارات الرمزين #logo و#logoS حرفيًا من اللوحة على شبكة m = 12، والنسخة
// الصغيرة تحت 32 بكسل، والتركيب (الرمز ثم الاسم نصًّا بـCairo 800)، وأصول الشعار (ملفا المصدر وأيقونات الإضافة والمتجر) تطابق
// ما يولّده tools/brand/icons.mjs من المسارات نفسها أو ينسخه، وسكربت المحتوى لا يحمل غير الرمز.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOGO_RATIO, LOGO_VIEWBOX, MARK_BOOK, MARK_BOOK_SMALL, MARK_DOTS, SMALL_BELOW, logo, logoMark } from '../../../src/ui/logo.js';
import {
  DRAWN, FRAME_DY, OUTPUTS, PAPER, PIXEL_ICONS, PLUM, TILE, TILE_ICONS, assetContent, closeAsset, decodePng, markPolygons, matchesOutput,
  png, render, roundedRect, sameAsset, tileIcon, tileLayers,
} from '../../../tools/brand/icons.mjs';
import { newDocument } from '../pages/library/fake-dom.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const M = 12;

test('الرمزان حرفيًا من لوحة الهوية 01 («القيم في logo.js»)', () => {
  assert.equal(LOGO_VIEWBOX, '0 0 240 195');
  assert.equal(LOGO_RATIO, 240 / 195);
  assert.deepEqual(MARK_DOTS, ['M84 0L115.5 51L60 102L28.5 51Z', 'M180 0L211.5 51L156 102L124.5 51Z']);
  assert.equal(MARK_BOOK, 'M0 111C52 111 90 133 114 150Q120 154.5 126 150C150 133 188 111 240 111L240 195L0 195Z');
  assert.equal(MARK_BOOK_SMALL, 'M0 123C52 123 90 141 112 158Q120 162.5 128 158C150 141 188 123 240 123L240 195L0 195Z');
  assert.equal(SMALL_BELOW, 32);
});

/** رؤوس مسار بأوامر مطلقة: كل زوج أرقام بعد أمره. */
const points = (d) => [...d.matchAll(/(-?\d+(?:\.\d+)?)[ ,]+(-?\d+(?:\.\d+)?)/g)].map((x) => [Number(x[1]), Number(x[2])]);

test('شبكة m = 12: الإطار 20m × 16.25m، والجسم بطرفين على 10m وقاعدة على 17m وثنية عرضها 1m، والصغيرة أخفض 1m وثنيتها أعرض', () => {
  assert.deepEqual(LOGO_VIEWBOX.split(' ').map(Number), [0, 0, 20 * M, 16.25 * M]);
  // اللوحة ترسم الرمز في إطار 240 × 204 (أخفض FRAME_DY من إطار الشيفرة)، وقياساتها بالشبكة من أعلى ذلك الإطار.
  assert.equal(FRAME_DY, 9);
  const at = (y) => (y + FRAME_DY) / M;
  const book = points(MARK_BOOK);
  const small = points(MARK_BOOK_SMALL);
  assert.equal(at(book[0][1]), 10, 'الطرفان على 10m');
  assert.equal(at(book.at(-1)[1]), 17, 'القاعدة على 17m');
  assert.equal(Math.max(...book.map(([x]) => x)), 20 * M, 'العرض 20m');
  assert.equal(at(small[0][1]), 11, 'الصغيرة: الطرفان أخفض 1m');
  const fold = (d) => {
    const q = d.match(/(-?[\d.]+) (-?[\d.]+)Q(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)/).slice(1).map(Number);
    return { width: q[4] - q[0], bottom: 0.25 * q[1] + 0.5 * q[3] + 0.25 * q[5] };
  };
  assert.equal(fold(MARK_BOOK).width, 1 * M, 'ثنية الكعب انحناءة عرضها 1m');
  assert.ok(fold(MARK_BOOK_SMALL).width > fold(MARK_BOOK).width, 'والصغيرة أعرض');
  assert.ok(Math.abs(at(fold(MARK_BOOK).bottom) - 13.5) < 0.1, `ثنية الكعب على 13.5m (${at(fold(MARK_BOOK).bottom)})`);
});

test('النقطتان نقطتا قلم: قطر رأسي 8m وأفقي 7m بتصحيحهما البصري، والرأس 1m يمينًا والذيل 1m يسارًا، والمركزان على 4m من المحور وخط 5m', () => {
  for (const [k, d] of MARK_DOTS.entries()) {
    const [head, right, tail, left] = points(d);
    const cx = (left[0] + right[0]) / 2;
    const cy = left[1];
    assert.equal(right[1], cy, `${k}: القطر الأفقي أفقي`);
    // التجاوز البصري: الرأسان المدببان يتجاوزان خطّي الشبكة 3 وحدات، والعرض زِيد 3 وحدات (اللوحة: «التصحيح البصري» ١ و٣).
    assert.equal(tail[1] - head[1], 8 * M + 6, `${k}: القطر الرأسي`);
    assert.equal(right[0] - left[0], 7 * M + 3, `${k}: القطر الأفقي`);
    assert.equal(head[0] - cx, 1 * M, `${k}: الرأس مائل 1m يمينًا`);
    assert.equal(cx - tail[0], 1 * M, `${k}: والذيل 1m يسارًا`);
    assert.equal(Math.abs(cx - 120), 4 * M, `${k}: المركز على 4m من المحور`);
    assert.equal((cy + FRAME_DY) / M, 5, `${k}: وعلى خط 5m`);
  }
  // بينهما 1m هندسيًا، ينقص منه التصحيح (1.5 من كل جهة).
  assert.equal(points(MARK_DOTS[1])[3][0] - points(MARK_DOTS[0])[1][0], 1 * M - 3);
});

test('الرمز وحده: الأساسي من 32 فأكثر والصغير تحته، بارتفاع من النسبة، وزخرفي', () => {
  const doc = newDocument();
  for (const [w, small] of [[16, true], [24, true], [31, true], [32, false], [48, false]]) {
    const svg = logoMark({ width: w, doc });
    assert.equal(svg.getAttribute('viewBox'), LOGO_VIEWBOX);
    assert.equal(svg.getAttribute('width'), String(w));
    assert.equal(Number(svg.getAttribute('height')), Math.round((w / LOGO_RATIO) * 10) / 10);
    assert.equal(svg.getAttribute('aria-hidden'), 'true');
    const ds = [...svg.children].map((p) => p.getAttribute('d'));
    assert.deepEqual(ds, [...MARK_DOTS, small ? MARK_BOOK_SMALL : MARK_BOOK], `${w}`);
    assert.deepEqual([...svg.children].map((p) => p.getAttribute('class')), ['tj-logo__dots', 'tj-logo__dots', 'tj-logo__book']);
  }
});

test('التركيب: الرمز ثم الاسم «ترجمان» نصًّا (Cairo 800 من الأنماط)، باسم وصول واحد أو زخرفيًا', () => {
  const doc = newDocument();
  const root = logo({ width: 24, wordSize: 18, doc });
  assert.equal(root.tagName.toLowerCase(), 'span');
  assert.equal(root.className, 'tj-logo');
  assert.equal(root.getAttribute('role'), 'img');
  assert.equal(root.getAttribute('aria-label'), 'ترجمان');
  const [mark, word] = root.children;
  assert.equal(mark.getAttribute('class'), 'tj-logo__mark');
  assert.equal(word.className, 'tj-logo__word');
  assert.equal(word.textContent, 'ترجمان');
  assert.equal(word.getAttribute('aria-hidden'), 'true');
  assert.equal(word.style.fontSize, '18px');
  const deco = logo({ label: null, word: false, doc });
  assert.equal(deco.getAttribute('aria-hidden'), 'true');
  assert.equal(deco.getAttribute('role'), null);
  assert.equal(deco.children.length, 1);
});

test('سكربت المحتوى (رأس اللوحة) يستورد مسارات الرمز وحدها، لا التركيب ولا الاسم', () => {
  const dom = readFileSync(path.join(ROOT, 'src/player/panel/dom.js'), 'utf8');
  assert.match(dom, /import \{ LOGO_RATIO, LOGO_VIEWBOX, MARK_BOOK, MARK_BOOK_SMALL, MARK_DOTS, SMALL_BELOW \} from '..\/..\/ui\/logo.js';/);
  assert.doesNotMatch(dom, /\blogo\(|logoMark\(/);
});

// المطابقة بالمحتوى لا ببايتات الضغط: ناتج deflateSync يتبع مكتبة zlib المربوطة بـNode، فسقط هذا الاختبار على GitHub (نسخ Node
// الرسمية) وهو ينجح على macOS (zlib النظام) والصورة واحدة (main@6824955).
test('أصول الشعار المتتبَّعة تطابق المولّد: 16 و32 نسخ مصدرهما المرسوم بكسلًا، وملفا SVG بايتًا، والبلاطات المرسومة بحدّ التنعيم', () => {
  for (const rel of Object.keys(OUTPUTS)) assert.ok(matchesOutput(rel, readFileSync(path.join(ROOT, rel))), `${rel}: شغّل command node tools/brand/icons.mjs`);
  for (const [n, src] of Object.entries(PIXEL_ICONS)) {
    assert.ok(readFileSync(path.join(ROOT, `src/icons/tarjuman-icon-${n}.png`)).equals(readFileSync(path.join(ROOT, src))), `${n}: نسخة بايتًا`);
    assert.ok(!DRAWN.has(`src/icons/tarjuman-icon-${n}.png`), `${n}: لا تُقارن بحدّ`);
  }
  for (const [file, book] of [['tarjuman-T.svg', MARK_BOOK], ['tarjuman-T-small.svg', MARK_BOOK_SMALL]]) {
    const svg = readFileSync(path.join(ROOT, 'tools/brand', file), 'utf8');
    for (const d of [...MARK_DOTS, book]) assert.ok(svg.includes(`d="${d}"`), `${file}: ${d}`);
    assert.ok(svg.includes('fill="#682455"'), `${file}: لون الرمز في الفاتح`);
  }
  assert.ok(readFileSync(path.join(ROOT, 'src/icons/tarjuman-icon-128.png')).equals(readFileSync(path.join(ROOT, 'store/icons/chrome-store-icon-128.png'))), 'أيقونة 128 وأيقونة المتجر واحدة');
});

test('قواعد البلاطة من اللوحة 04: الأرجوان العميق والرمز بالورق، وزاوية 22% وعرض الرمز 68% وهامشه 16%، و48 من الصغيرة، و128 رسم 96 بحشو 16، وEdge معتم', () => {
  assert.equal(PLUM, '#762E61');
  assert.equal(PAPER, '#FEF8FC');
  assert.deepEqual({ ...TILE }, { radius: 0.22, mark: 0.68, inset: 0.16, lift: 0.02804 });
  assert.deepEqual({ ...TILE_ICONS['48'] }, { size: 48, tile: 48, at: 0, small: true });
  assert.deepEqual({ ...TILE_ICONS['128'] }, { size: 128, tile: 96, at: 16, small: false });
  assert.equal(TILE_ICONS.edge300.tile, 240);
  assert.equal(TILE_ICONS.edge300.ground, '#F9F5F8');
  // قيم رسم اللوحة: 48 ← translate(7.68 7.68) ثم (0 1.35) بمقياس 0.136 لإطار 240 × 204.
  const [, mark] = tileLayers(TILE_ICONS['48']);
  const xs = mark.polys.flat().map(([x]) => x);
  assert.ok(Math.abs(Math.min(...xs) - 7.68) < 1e-9 && Math.abs(Math.max(...xs) - (7.68 + 240 * 0.136)) < 1e-9, 'الرمز بعرض 68% في الوسط');
  const edge = decodePng(readFileSync(path.join(ROOT, 'store/icons/edge-logo-300.png')));
  assert.equal(edge.ct, 2, 'شعار Edge بلا شفافية');
  assert.deepEqual([...edge.px.subarray(0, 3)], [0xF9, 0xF5, 0xF8], 'وأرضيته أرضية الصفحة');
  for (const n of [48, 128]) {
    const icon = decodePng(readFileSync(path.join(ROOT, `src/icons/tarjuman-icon-${n}.png`)));
    assert.equal(icon.px[3], 0, `${n}: الزاوية شفافة`);
    const at = TILE_ICONS[String(n)].at;
    const c = ((at + 3) * n + n / 2) * 4;
    assert.equal(icon.px[c + 3], 255, `${n}: جسم البلاطة معتم`);
    assert.deepEqual([...icon.px.subarray(c, c + 3)], [0x76, 0x2E, 0x61], `${n}: وأرجواني`);
    if (at) assert.equal(icon.px[((at / 2) * n + n / 2) * 4 + 3], 0, `${n}: والحشو شفاف`);
  }
});

test('حدّ التنعيم يقبل البلاطة المرسومة ويرفض إزاحة الرمز بكسلًا أو تغيير لونه أو مقاسه', () => {
  const spec = TILE_ICONS['48'];
  const made = tileIcon('48');
  const tracked = readFileSync(path.join(ROOT, 'src/icons/tarjuman-icon-48.png'));
  assert.ok(!sameAsset(tracked, made), 'المرسوم ليس المولَّد بكسلًا بكسلًا');
  assert.ok(closeAsset(tracked, made), 'لكنه ضمن حدّ التنعيم');
  const [tile, mark] = tileLayers(spec);
  const shifted = png(48, 48, render(48, 48, [tile, { ...mark, polys: mark.polys.map((p) => p.map(([x, y]) => [x + 1, y])) }]));
  assert.ok(!closeAsset(tracked, shifted), 'إزاحة الرمز بكسلًا');
  const recolored = png(48, 48, render(48, 48, [{ ...tile, color: '#682455' }, mark]));
  assert.ok(!closeAsset(tracked, recolored), 'لون آخر للبلاطة');
  assert.ok(!closeAsset(tracked, tileIcon('128')), 'مقاس آخر');
  const mismatched = png(48, 48, render(48, 48, [{ polys: roundedRect(48, 48, 6), color: PLUM }, { polys: markPolygons({ tx: 7.68, ty: 10.25, scale: 0.136, small: false }), color: PAPER }]));
  assert.ok(!closeAsset(tracked, mismatched), 'الزاوية والنسخة الأساسية بدل الصغيرة');
});

test('مقارنة أصول PNG بالمحتوى: ضغط آخر للبكسلات نفسها مطابق، وبكسل واحد أو مقاس مختلف أو ملف تالف غير مطابق', () => {
  const a = tileIcon('48');
  // البكسلات من محتوى الأصل نفسه (بعد الرأس: بايت المرشّح ثم RGBA لكل صف)، ثم PNG بلا ضغط (المستوى 0) كما يختلف ضغط مكتبتي zlib.
  const content = assetContent(a);
  const raw = content.subarray(Buffer.byteLength('PNG-CONTENT\0') + 13);
  const rgba = Buffer.alloc(48 * 48 * 4);
  for (let y = 0; y < 48; y++) raw.copy(rgba, y * 192, y * 193 + 1, (y + 1) * 193);
  const stored = png(48, 48, rgba, { level: 0 });
  assert.ok(!a.equals(stored), 'الضغطان مختلفان بايتًا');
  assert.ok(sameAsset(a, stored), 'والمحتوى واحد');
  const changed = Buffer.from(rgba);
  changed[48 * 24 * 4 + 96] ^= 1;
  assert.ok(!sameAsset(a, png(48, 48, changed)), 'بكسل واحد مختلف');
  assert.ok(!sameAsset(a, tileIcon('128')), 'مقاس مختلف');
  const broken = Buffer.from(a);
  broken[40] ^= 0xFF;
  assert.throws(() => sameAsset(a, broken), /PNG/);
  assert.ok(sameAsset(Buffer.from('<svg/>'), Buffer.from('<svg/>')) && !sameAsset(Buffer.from('<svg/>'), Buffer.from('<svg />')), 'غير PNG بايتًا');
});

test('أيقونات البيان PNG بأحجامها الأربعة RGBA', () => {
  for (const n of [16, 32, 48, 128]) {
    const b = readFileSync(path.join(ROOT, `src/icons/tarjuman-icon-${n}.png`));
    assert.equal(b.subarray(1, 4).toString('latin1'), 'PNG');
    assert.equal(b.readUInt32BE(16), n);
    assert.equal(b.readUInt32BE(20), n);
    assert.equal(b[25], 6, 'RGBA');
  }
});
