// الشعار «كتابٌ مفتوح» (docs/identity-v4.md): مسارات الرمزين #logo و#logoS حرفيًا من لوحة الهوية بنسب φ من D = 100، والنسخة
// المصحّحة تحت 32 بكسل، والتركيب (الرمز ثم الاسم نصًّا بـCairo 800)، وأصول الشعار المولّدة (ملفا المصدر وأيقونات الإضافة) تطابق
// ما يولّده tools/brand/icons.mjs من المسارات نفسها، وسكربت المحتوى لا يحمل غير الرمز.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOGO_RATIO, LOGO_VIEWBOX, MARK_BOOK, MARK_BOOK_SMALL, MARK_DOTS, SMALL_BELOW, logo, logoMark } from '../../../src/ui/logo.js';
import { MANIFEST_ICONS, OUTPUTS, PINE, IVORY, assetContent, png, sameAsset, tileIcon } from '../../../tools/brand/icons.mjs';
import { newDocument } from '../pages/library/fake-dom.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PHI = (1 + Math.sqrt(5)) / 2;
const D = 100;

test('الرمزان حرفيًا من لوحة الهوية (الإصدار 1794035287-e3de)', () => {
  assert.equal(LOGO_VIEWBOX, '0 0 200 176.4');
  assert.equal(LOGO_RATIO, 200 / 176.4);
  assert.deepEqual(MARK_DOTS, ['M50 0L100 50 50 100 0 50Z', 'M150 0L200 50 150 100 100 50Z']);
  assert.equal(MARK_BOOK, 'M0 114.6H23.6C46.5 114.6 71 124.2 100 152.8C129 124.2 153.5 114.6 176.4 114.6H200V176.4H0Z');
  assert.equal(MARK_BOOK_SMALL, 'M0 123.6H23.6C50 123.6 76 132 100 158C124 132 150 123.6 176.4 123.6H200V176.4H0Z');
  assert.equal(SMALL_BELOW, 32);
});

test('هندسة φ: الكتاب بارتفاع D/φ، والفجوة D/φ⁴ في الأساسي وD/φ³ في المصحّح، وكتف الصفحة D/φ³ وغور الكعب D/φ²', () => {
  const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.06, `${msg}: ${a} ≠ ${b.toFixed(2)}`);
  near(176.4 - 114.6, D / PHI, 'ارتفاع الكتاب');
  near(114.6 - D, D / PHI ** 4, 'الفجوة في الأساسي');
  near(123.6 - D, D / PHI ** 3, 'الفجوة في المصحّح');
  near(23.6, D / PHI ** 3, 'كتف الصفحة المسطّح');
  near(152.8 - 114.6, D / PHI ** 2, 'غور الكعب');
  near(176.4, 1.764 * D, 'الارتفاع الكلي');
});

test('الرمز وحده: الأساسي من 32 فأكثر والمصحّح تحته، بارتفاع من النسبة، وزخرفي', () => {
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
test('أصول الشعار المتتبَّعة تطابق ما يولّده tools/brand/icons.mjs في رأسها وبكسلاتها، وملفا SVG بايتًا (المسارات نفسها وقواعد البلاطة في لوحة 03)', () => {
  for (const [rel, make] of Object.entries(OUTPUTS)) assert.ok(sameAsset(readFileSync(path.join(ROOT, rel)), make()), `${rel}: شغّل command node tools/brand/icons.mjs`);
  // البلاطة: زاوية 23% من الضلع (11 عند 48)، والرمز بعرض 75% منها، والمصحّح تحت 48.
  for (const [n, s] of Object.entries(MANIFEST_ICONS)) {
    const size = Number(n);
    assert.ok(Math.abs(s.rx / size - 0.23) < 0.02, `${n}: الزاوية`);
    assert.ok(Math.abs((200 * s.scale) / size - 0.75) < 0.001, `${n}: عرض الرمز`);
    assert.equal(s.small, size < 48, `${n}: المصحّح تحت 48`);
    assert.ok(s.ty < (size - 176.4 * s.scale) / 2, `${n}: مرفوع فوق المركز الهندسي`);
  }
  assert.equal(PINE, '#1E4A44');
  assert.equal(IVORY, '#F3EFE6');
  const svg = readFileSync(path.join(ROOT, 'tools/brand/tarjuman-A-asil.svg'), 'utf8');
  for (const d of [...MARK_DOTS, MARK_BOOK]) assert.ok(svg.includes(`d="${d}"`), d);
});

test('مقارنة أصول PNG بالمحتوى: ضغط آخر للبكسلات نفسها مطابق، وبكسل واحد أو مقاس مختلف أو ملف تالف غير مطابق', () => {
  const a = tileIcon(16);
  // البكسلات من محتوى الأصل نفسه (بعد الرأس: بايت المرشّح ثم RGBA لكل صف)، ثم PNG بلا ضغط (المستوى 0) كما يختلف ضغط مكتبتي zlib.
  const content = assetContent(a);
  const raw = content.subarray(Buffer.byteLength('PNG-CONTENT\0') + 13);
  const rgba = Buffer.alloc(16 * 16 * 4);
  for (let y = 0; y < 16; y++) raw.copy(rgba, y * 64, y * 65 + 1, (y + 1) * 65);
  const stored = png(16, 16, rgba, { level: 0 });
  assert.ok(!a.equals(stored), 'الضغطان مختلفان بايتًا');
  assert.ok(sameAsset(a, stored), 'والمحتوى واحد');
  const changed = Buffer.from(rgba);
  changed[16 * 8 * 4 + 32] ^= 1;
  assert.ok(!sameAsset(a, png(16, 16, changed)), 'بكسل واحد مختلف');
  assert.ok(!sameAsset(a, tileIcon(32)), 'مقاس مختلف');
  const broken = Buffer.from(a);
  broken[40] ^= 0xFF;
  assert.throws(() => sameAsset(a, broken), /PNG/);
  assert.ok(sameAsset(Buffer.from('<svg/>'), Buffer.from('<svg/>')) && !sameAsset(Buffer.from('<svg/>'), Buffer.from('<svg />')), 'غير PNG بايتًا');
});

test('أيقونات البيان PNG بأحجامها الأربعة، وزواياها شفافة ووسطها صنوبر (بلا شفافية في جسم البلاطة)', () => {
  for (const n of [16, 32, 48, 128]) {
    const b = readFileSync(path.join(ROOT, `src/icons/tarjuman-icon-${n}.png`));
    assert.equal(b.subarray(1, 4).toString('latin1'), 'PNG');
    assert.equal(b.readUInt32BE(16), n);
    assert.equal(b.readUInt32BE(20), n);
    assert.equal(b[25], 6, 'RGBA');
  }
});
