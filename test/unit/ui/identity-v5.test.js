// الهوية الخامسة «التاء» (قرار سلطان 2026-11-14، docs/identity.md): قيم لوحة الهوية 05 (والتسليم 18) في tokens.css ورموز المشغّل
// بالوضعين، وتطابق كتلتي الداكن، والتباين محسوبًا من الملف نفسه (كل نص ≥ 4.5:1 على السطح الذي يحمله، وغير النص ≥ 3:1، والأزواج
// الـ31 في اللوحة بنسبها)، والحارس الذي يمنع عودة ألوان الهويات السابقة إلى src/ وstore/، وقواعد المكوّنات والأسطح.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLAYER_TOKENS } from '../../../src/ui/player-tokens.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const css = readFileSync(path.join(ROOT, 'src/ui/tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** تصريحات أول كتلة تبدأ بهذا المحدد حرفيًا. */
function decls(selector) {
  const at = css.indexOf(`${selector} {`);
  assert.ok(at >= 0, selector);
  const start = css.indexOf('{', at) + 1;
  const body = css.slice(start, css.indexOf('}', start));
  return new Map([...body.matchAll(/(--tj-[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

const LIGHT = decls('\n:root');
const DARK_MEDIA = decls(':root:not([data-theme="light"])');
const DARK = decls(':root[data-theme="dark"]');
/** قيمة الرمز في الوضع: الداكن يتجاوز الفاتح فيما يذكره وحده، والإحالة var() تُحلّ. */
function value(mode, name) {
  const v = mode === 'dark' ? DARK.get(name) ?? LIGHT.get(name) : LIGHT.get(name);
  const ref = /^var\((--tj-[\w-]+)\)$/.exec(v ?? '');
  return ref ? value(mode, ref[1]) : v;
}

// قيم اللوحة 05 (والتسليم 18) بأسماء المنتج، بالوضعين. ونسخة اللوحة في tools/brand/identity-board-tj.css بأسماء --tj-* نفسها.
const BOARD = {
  light: {
    '--tj-bg': '#F9F5F8', '--tj-surface': '#FEFDFE', '--tj-surface-2': '#F2EAEF', '--tj-surface-3': '#E9E0E6', '--tj-control': '#E9E0E6',
    '--tj-text': '#2D1626', '--tj-text-2': '#5B4653', '--tj-muted': '#705D69', '--tj-on-ink': '#FEFDFE', '--tj-border': '#E4DBE0',
    '--tj-border-strong': '#D2C7CE', '--tj-border-input': '#91818B', '--tj-brand': '#682455', '--tj-brand-hover': '#581847',
    '--tj-brand-pressed': '#460D38', '--tj-brand-ink': '#FFFFFF', '--tj-accent': '#A5397E', '--tj-accent-hover': '#932C6E',
    '--tj-accent-text': '#8B2868', '--tj-accent-fill': '#932C6E', '--tj-accent-soft': '#FEE5F2', '--tj-focus': '#A5397E', '--tj-selected': '#682455',
    '--tj-selected-ink': '#FFFFFF', '--tj-selected-soft': '#FBE8F4', '--tj-selected-soft-ink': '#682455', '--tj-success': '#246E3A',
    '--tj-success-bg': '#E1F5E4', '--tj-warning': '#97570D', '--tj-warning-bg': '#FEEDD7', '--tj-danger': '#B63132', '--tj-danger-bg': '#FFE7E6',
    '--tj-info': '#2A669F', '--tj-info-bg': '#E2F0FF', '--tj-logo-glyph': '#682455', '--tj-logo-word': '#2D1626', '--tj-logo-tile': '#762E61',
    '--tj-logo-on-tile': '#FEF8FC', '--tj-brand-soft': '#FBE8F4', '--tj-brand-text': '#682455', '--tj-accent-ink': '#FFFFFF',
    '--tj-accent-soft-2': '#F8CEE5', '--tj-current': '#FEE5F2', '--tj-current-ink': '#8B2868', '--tj-mark': '#A5397E',
    '--tj-logo-dots-accent': '#A5397E',
  },
  dark: {
    '--tj-bg': '#150C12', '--tj-surface': '#20151D', '--tj-surface-2': '#2C1F28', '--tj-surface-3': '#372932', '--tj-control': '#372932',
    '--tj-text': '#F4EBF1', '--tj-text-2': '#C7B9C2', '--tj-muted': '#A4939D', '--tj-on-ink': '#150C12', '--tj-border': '#392B34',
    '--tj-border-strong': '#4A3A44', '--tj-border-input': '#816E7A', '--tj-brand': '#F3E2EC', '--tj-brand-hover': '#FBF2F8',
    '--tj-brand-pressed': '#DDCBD6', '--tj-brand-ink': '#150C12', '--tj-accent': '#E791C2', '--tj-accent-text': '#F3AAD3',
    '--tj-accent-fill': '#E791C2', '--tj-accent-soft': '#432135', '--tj-focus': '#E791C2', '--tj-selected': '#F3E2EC', '--tj-selected-ink': '#150C12',
    '--tj-selected-soft': '#382030', '--tj-selected-soft-ink': '#F0C5E1', '--tj-success': '#7CCD8E', '--tj-warning': '#EBB25F',
    '--tj-danger': '#F28885', '--tj-info': '#85B6E9', '--tj-logo-glyph': '#F3E2EC', '--tj-logo-word': '#F4EBF1', '--tj-logo-tile': '#762E61',
    '--tj-brand-soft': '#382030', '--tj-brand-text': '#F0C5E1', '--tj-accent-hover': '#F1A1CE', '--tj-accent-ink': '#150C12',
    '--tj-current': '#432135', '--tj-current-ink': '#F3AAD3', '--tj-mark': '#E791C2', '--tj-logo-dots-accent': '#E791C2',
    '--tj-success-bg': '#172C1C', '--tj-warning-bg': '#37250E', '--tj-danger-bg': '#3E1E1E', '--tj-info-bg': '#172839',
  },
};

test('قيم لوحة الهوية بالوضعين في tokens.css (الأرجوان العميق يفعل، والأرجوان المضيء يُشير، والورق يحمل القراءة)', () => {
  for (const mode of ['light', 'dark']) {
    for (const [name, want] of Object.entries(BOARD[mode])) assert.equal(value(mode, name), want, `${mode} ${name}`);
  }
});

test('كتلتا الداكن (وضع النظام وdata-theme="dark") متطابقتان رمزًا رمزًا، وبلاطة الشعار الأرجوانية واحدة بالوضعين', () => {
  assert.deepEqual([...DARK_MEDIA.entries()].sort(), [...DARK.entries()].sort());
  assert.equal(value('light', '--tj-logo-tile'), value('dark', '--tj-logo-tile'));
});

// ---- الحارس: لا لون من الهويات السابقة في src/ وstore/ ----
/**
 * «كتابٌ مفتوح» (الرابعة: الصنوبر والعاج والطين وليل الصنوبر، كل قيمة في tokens.css لم تبقَ)، و«باذنجاني على رمادي» (الثالثة)
 * و«بُنّ على ورق» (الثانية) وما قبلهما: قيمها المميِّزة.
 */
const RETIRED = [
  '#0F1917', '#112E2A', '#16221F', '#17291F', '#173C37', '#182E2B', '#1A2634', '#1E2B28', '#1E4A44', '#1F2F2B', '#26332F', '#263431',
  '#2A6E46', '#33251F', '#33291A', '#33423D', '#351D1D', '#38679A', '#452F27', '#4A5A58', '#596865', '#7CC79A', '#7E8A86', '#85908D',
  '#8F4A36', '#8F5414', '#8F9893', '#8FB4DC', '#A05C47', '#A6604B', '#B4383E', '#B6B9B2', '#B9705A', '#CDC6B8', '#CFCBC2', '#CFE0DA',
  '#D9937B', '#DFD9CC', '#E2A48E', '#E2DDD2', '#E3ECF5', '#E3F0E7', '#E4B06A', '#E6EFEC', '#EAE5DA', '#EDE9E0', '#EED2C6', '#F08C8C',
  '#F3EFE6', '#F6E7E0', '#F7EAD9', '#F8E3E3', '#FFFDF8',
  'rgb(30 74 68', 'rgb(243 239 230', 'rgb(185 112 90', 'rgb(15 25 23', 'rgb(217 147 123', 'rgb(24 46 43', 'rgb(237 233 224',
  '#6B2D5E', '#5B2951', '#4E2646', '#D9A7CB', '#E0BCD6', '#B98FAD', '#E1D4DD', '#F5F1F3', '#4B3E48', '#E6CEDF', '#312B2F',
  '#F6F5F4', '#FEFEFD', '#E8E7E6', '#DFDDDD', '#D4D2D2', '#121112', '#1E1D1E', '#2B292A', '#221C21', '#F1EDEF', '#0E0E0E', '#979596',
  '#5C4434', '#D6B38F', '#C9A24D', '#E2C27A', '#FAF8F4', '#1F1C1A', '#4338CA',
  'rgb(18 17 18', 'rgb(107 45 94', 'rgb(217 167 203', 'rgb(34 28 33', 'rgb(241 237 239',
];
const TEXT = /\.(?:js|mjs|css|html|json)$/;
function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (TEXT.test(name)) yield p;
  }
}

test('الحارس: لا لون من الهويات السابقة في أي ملف نصي تحت src/ وstore/', () => {
  const hits = [];
  for (const file of [...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'store'))]) {
    const text = readFileSync(file, 'utf8').toUpperCase();
    for (const c of RETIRED) if (text.includes(c.toUpperCase())) hits.push(`${path.relative(ROOT, file)}: ${c}`);
  }
  assert.deepEqual(hits, []);
});

// ---- التباين ----
const lum = (h) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('التباين بالوضعين: كل نص ≥ 4.5:1 على السطح الذي يحمله، وغير النص (حد الحقل والتركيز والطين والمفتاح) ≥ 3:1', () => {
  const SURFACES = ['--tj-bg', '--tj-surface', '--tj-surface-2'];
  const TEXT_PAIRS = [
    ...SURFACES.flatMap((s) => [['--tj-text', s], ['--tj-text-2', s], ['--tj-muted', s], ['--tj-accent-text', s]]),
    ['--tj-text', '--tj-control'], ['--tj-text', '--tj-control-hover'], ['--tj-text-2', '--tj-control'],
    ['--tj-muted', '--tj-selected-soft'], ['--tj-text-2', '--tj-selected-soft'],
    ['--tj-brand-ink', '--tj-brand'], ['--tj-brand-ink', '--tj-brand-hover'], ['--tj-brand-ink', '--tj-brand-pressed'],
    ['--tj-selected-ink', '--tj-selected'], ['--tj-selected-soft-ink', '--tj-selected-soft'], ['--tj-selected-section-ink', '--tj-selected-section'],
    ['--tj-brand-text', '--tj-brand-soft'], ['--tj-accent-text', '--tj-accent-soft'], ['--tj-current-ink', '--tj-current'], ['--tj-accent-ink', '--tj-accent-fill'],
    ['--tj-success', '--tj-success-bg'], ['--tj-warning', '--tj-warning-bg'], ['--tj-danger', '--tj-danger-bg'], ['--tj-info', '--tj-info-bg'], ['--tj-edited', '--tj-edited-bg'],
    ['--tj-danger-ink', '--tj-danger'], ['--tj-on-ink', '--tj-text'],
    ['--tj-toast-success', '--tj-text'], ['--tj-toast-warning', '--tj-text'], ['--tj-toast-danger', '--tj-text'], ['--tj-toast-accent', '--tj-text'],
  ];
  const UI_PAIRS = [
    ['--tj-border-input', '--tj-surface'], ['--tj-focus', '--tj-surface'], ['--tj-focus', '--tj-bg'], ['--tj-focus', '--tj-surface-2'],
    ['--tj-accent', '--tj-surface'], ['--tj-accent', '--tj-bg'], ['--tj-mark', '--tj-current'], ['--tj-selected-section-icon', '--tj-selected-section'],
    ['--tj-selected-mark', '--tj-surface'], ['--tj-logo-glyph', '--tj-bg'], ['--tj-logo-glyph', '--tj-surface'],
  ];
  for (const mode of ['light', 'dark']) {
    for (const [fg, bg] of TEXT_PAIRS) {
      const r = ratio(value(mode, fg), value(mode, bg));
      assert.ok(r >= 4.5, `${mode}: ${fg} على ${bg} = ${r.toFixed(2)} < 4.5`);
    }
    for (const [fg, bg] of UI_PAIRS) {
      const r = ratio(value(mode, fg), value(mode, bg));
      assert.ok(r >= 3, `${mode}: ${fg} على ${bg} = ${r.toFixed(2)} < 3`);
    }
  }
  // الشعار على بلاطته: الورق على الأرجوان.
  assert.ok(ratio(value('light', '--tj-logo-on-tile'), value('light', '--tj-logo-tile')) >= 4.5);
});

// أزواج التباين في اللوحة 05 («التباين في الفاتح» و«في الداكن»): اسم الزوج كما في اللوحة، والنص والسطح، والحد، ونسبة اللوحة بالوضعين.
const BOARD_PAIRS = [
  ['الحبر على الأرضية', '--tj-text', '--tj-bg', 4.5, 15.50, 16.47],
  ['الحبر على البطاقة', '--tj-text', '--tj-surface', 4.5, 16.50, 15.17],
  ['الحبر على الغائر', '--tj-text', '--tj-surface-2', 4.5, 14.18, 13.50],
  ['الثانوي على البطاقة', '--tj-text-2', '--tj-surface', 4.5, 8.46, 9.40],
  ['الثانوي على الغائر', '--tj-text-2', '--tj-surface-2', 4.5, 7.27, 8.36],
  ['الخافت على الأرضية', '--tj-muted', '--tj-bg', 4.5, 5.62, 6.62],
  ['الخافت على البطاقة', '--tj-muted', '--tj-surface', 4.5, 5.98, 6.10],
  ['الخافت على الغائر', '--tj-muted', '--tj-surface-2', 4.5, 5.14, 5.43],
  ['حبر الإجراء على الإجراء', '--tj-brand-ink', '--tj-brand', 4.5, 10.65, 15.46],
  ['الإجراء على الأرضية', '--tj-brand', '--tj-bg', 4.5, 9.86, 15.46],
  ['الإجراء على البطاقة', '--tj-brand', '--tj-surface', 4.5, 10.49, 14.25],
  ['نص القسم الحالي على صبغة القسم', '--tj-selected-section-ink', '--tj-selected-section', 4.5, 9.10, 9.72],
  ['نص اللحظة على البطاقة', '--tj-accent-text', '--tj-surface', 4.5, 7.96, 9.69],
  ['حبر المضيء على تعبئة المضيء', '--tj-accent-ink', '--tj-accent-fill', 4.5, 7.43, 8.44],
  ['نص المقطع الحالي على صبغة المقطع', '--tj-current-ink', '--tj-current', 4.5, 6.81, 7.63],
  ['المضيء على الأرضية', '--tj-accent', '--tj-bg', 3, 5.58, 8.44],
  ['المضيء على البطاقة', '--tj-accent', '--tj-surface', 3, 5.94, 7.78],
  ['التركيز على البطاقة', '--tj-focus', '--tj-surface', 3, 5.94, 7.78],
  ['حد الحقل على البطاقة', '--tj-border-input', '--tj-surface', 3, 3.62, 3.75],
  ['حد الحقل على الأرضية', '--tj-border-input', '--tj-bg', 3, 3.40, 4.07],
  ['النجاح على خلفيته', '--tj-success', '--tj-success-bg', 4.5, 5.46, 7.77],
  ['التحذير على خلفيته', '--tj-warning', '--tj-warning-bg', 4.5, 4.97, 7.72],
  ['الخطر على خلفيته', '--tj-danger', '--tj-danger-bg', 4.5, 5.13, 6.13],
  ['المعلومة على خلفيتها', '--tj-info', '--tj-info-bg', 4.5, 5.18, 7.05],
  ['حبر النجاح على النجاح', '--tj-success-ink', '--tj-success', 4.5, 6.24, 10.04],
  ['حبر الخطر على الخطر', '--tj-danger-ink', '--tj-danger', 4.5, 6.04, 7.90],
  ['أيقونة النجاح على الحبر', '--tj-toast-success', '--tj-text', 3, 9.42, 6.02],
  ['أيقونة التحذير على الحبر', '--tj-toast-warning', '--tj-text', 3, 9.47, 5.79],
  ['أيقونة الخطر على الحبر', '--tj-toast-danger', '--tj-text', 3, 7.39, 6.10],
  ['إجراء الإشعار على الحبر', '--tj-toast-accent', '--tj-text', 3, 8.60, 6.92],
  ['النص فوق الحبر على الحبر', '--tj-on-ink', '--tj-text', 4.5, 16.50, 16.47],
];

test('أزواج التباين الـ31 في اللوحة 05 بالوضعين: كلٌّ فوق حدّه، والنسبة المحسوبة من tokens.css هي نسبة اللوحة', () => {
  assert.equal(BOARD_PAIRS.length, 31);
  for (const [name, fg, bg, min, light, dark] of BOARD_PAIRS) {
    for (const [mode, want] of [['light', light], ['dark', dark]]) {
      const r = ratio(value(mode, fg), value(mode, bg));
      assert.ok(r >= min, `${mode}: ${name} = ${r.toFixed(2)} < ${min}`);
      assert.equal(Number(r.toFixed(2)), want, `${mode}: ${name}`);
    }
  }
});

test('استثناء مسمّى (ص1، ق14): رمز البلاطة الافتراضية في المحفوظات زخرفي بتباين منخفض عمدًا بالوضعين، ومخفي عن قارئ الشاشة', () => {
  // --tj-border-strong على --tj-surface-2: نحو 1.39 فاتحًا و1.48 داكنًا. ليس نصًا ولا عنصر تحكم ولا معلومة، فلا يخضع لحدّي 4.5 و3.
  for (const [mode, expect] of [['light', 1.39], ['dark', 1.48]]) {
    const r = ratio(value(mode, '--tj-border-strong'), value(mode, '--tj-surface-2'));
    assert.ok(Math.abs(r - expect) < 0.03, `${mode}: ${r.toFixed(2)}`);
    assert.ok(r < 3, 'خافت عمدًا');
  }
  const thumb = readFileSync(new URL('../../../src/pages/library/thumb.js', import.meta.url), 'utf8');
  assert.match(thumb, /className: 'lib-thumb__fallback', attrs: \{ 'aria-hidden': 'true' \}/);
});

test('رموز المشغّل (داكن بالوضعين): قيم اللوحة 12، والقوائم زجاج من ليل الأرجوان، والمحدد صبغة المضيء الليلي 18% بنصه، والرئيسي بالمضيء الليلي بحبر داكن', () => {
  assert.equal(PLAYER_TOKENS.menuBg, 'rgb(21 12 18 / 92%)');
  assert.equal(PLAYER_TOKENS.menuText, '#F4EBF1');
  assert.equal(PLAYER_TOKENS.menuText2, '#C7B9C2');
  assert.equal(PLAYER_TOKENS.accent, '#E791C2');
  assert.equal(PLAYER_TOKENS.accentInk, '#150C12');
  assert.equal(PLAYER_TOKENS.selected, 'rgb(231 145 194 / 18%)');
  assert.equal(PLAYER_TOKENS.selectedInk, '#E791C2');
  assert.equal(PLAYER_TOKENS.menuRadius, '10px');
  const menu = '#150C12'; // ليل القائمة دون الشفافية: أسوأ حالة فوق فيديو داكن
  assert.ok(ratio(PLAYER_TOKENS.accentInk, PLAYER_TOKENS.accent) >= 4.5);
  assert.ok(ratio(PLAYER_TOKENS.menuText, menu) >= 7 && ratio(PLAYER_TOKENS.menuText2, menu) >= 4.5);
  for (const k of ['warn', 'error', 'ok', 'accent', 'selectedInk']) assert.ok(ratio(PLAYER_TOKENS[k], menu) >= 4.5, k);
  // الترجمة فوق الفيديو لا تدخلها ألوان الهوية.
  assert.equal(PLAYER_TOKENS.subText, '#FFFFFF');
  assert.equal(PLAYER_TOKENS.subBgSoft, 'rgb(0 0 0 / 72%)');
  assert.equal(PLAYER_TOKENS.subBgSolid, 'rgb(0 0 0 / 92%)');
});

// ---- قواعد المكوّنات والأسطح ----
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
/** تصريحات القاعدة بهذا المحدد حرفيًا (أول ظهور). */
function rule(sheet, selector) {
  const at = sheet.indexOf(`${selector} {`);
  assert.ok(at >= 0, `القاعدة ${selector}`);
  return sheet.slice(sheet.indexOf('{', at) + 1, sheet.indexOf('}', at)).trim();
}
const has = (sheet, selector, decl) => assert.ok(rule(sheet, selector).includes(decl), `${selector} { … ${decl} … } ← ${rule(sheet, selector)}`);

test('المكوّنات (اللوحتان 09 و10): الأنواع الستة والأحجام الخمسة، والمختار بالأرجوان العميق بنص أبيض، والتركيز بالمضيء، والإشعار بلون الحبر', () => {
  const ui = read('src/ui/components.css');
  has(ui, '.tj-btn', 'border: 1px solid transparent; background: var(--tj-control)');
  for (const v of ['primary', 'secondary', 'outline', 'ghost', 'danger', 'accent']) assert.ok(ui.includes(`.tj-btn--${v} {`), v);
  for (const s of ['xs', 'sm', 'lg', 'xl']) assert.ok(ui.includes(`.tj-btn--${s} {`), s);
  has(ui, '.tj-btn--xl', 'min-height: var(--tj-control-xl)');
  has(ui, '.tj-btn--accent', 'background: var(--tj-accent-fill); color: var(--tj-accent-ink)');
  has(ui, '.tj-btn--primary:active:not(:disabled):not([aria-disabled="true"])', 'var(--tj-brand-pressed)');
  has(ui, '.tj-chip[aria-pressed="true"]', 'background: var(--tj-selected); color: var(--tj-selected-ink)');
  has(ui, '.tj-seg__option input:checked + .tj-seg__label', 'background: var(--tj-selected); color: var(--tj-selected-ink)');
  has(ui, '.tj-slots__slot[aria-checked="true"]', 'background: var(--tj-selected); color: var(--tj-selected-ink)');
  has(ui, '.tj-choice__option:has(input:checked)', 'background: var(--tj-selected-soft); border-color: var(--tj-brand); box-shadow: inset 0 0 0 0.5px var(--tj-brand)');
  has(ui, '.tj-field__input:focus-visible, .tj-field__input:focus', 'border-color: var(--tj-accent); box-shadow: 0 0 0 3px var(--tj-accent-track)');
  has(ui, '.tj-field__input', 'border: 1px solid var(--tj-border-input)');
  has(ui, '.tj-toast', 'background: var(--tj-text); color: var(--tj-on-ink)');
  has(ui, '.tj-toast--success .tj-icon', 'var(--tj-toast-success)');
  has(ui, '.tj-meter__fill', 'background: var(--tj-brand)');
  // التحقق المستقل لـ3.0.0 (ت٣-v3-identity-5): مسار المقياس بالسطح الثالث كاللوحة 10، وإجراء الإشعار بالمضيء بلا صبغة، والخانات بزاوية 3.
  has(ui, '.tj-meter', 'background: var(--tj-surface-3)');
  has(ui, '.tj-toast__action', 'background: transparent;\n  color: var(--tj-toast-accent)');
  has(ui, '.tj-slots__slot', 'border-radius: var(--tj-radius-sm)');
  has(ui, '.tj-menu__item', 'border-radius: var(--tj-radius-sm)');
  has(ui, '.tj-tip', 'border-radius: var(--tj-radius-sm)');
  has(ui, '.tj-sinnah', 'clip-path: polygon(62% 0, 100% 50%, 38% 100%, 0 50%)');
  assert.doesNotMatch(rule(ui, '.tj-sinnah'), /rotate\(45deg\)/, 'نقطة قلم لا معيّن مدوّر');
  has(ui, '.tj-dialog', 'border-radius: var(--tj-radius-card-lg)');
  has(ui, '.tj-logo__word', 'font-weight: 800');
  assert.match(read('src/ui/base.css'), /:focus-visible \{ outline: 2px solid var\(--tj-focus\); outline-offset: 2px; \}/);
});

test('الأسطح: الصفحة الحالية والقسم الحالي صبغة الأرجوان بأيقونة بالمضيء، والمقطع الحالي بالمضيء، والمفاتيح بالمضيء', async () => {
  const base = read('src/ui/base.css');
  has(base, '.tj-topbar__link[aria-current="page"]', 'background: var(--tj-selected-section); color: var(--tj-selected-section-ink)');
  has(base, '.tj-topbar__link[aria-current="page"] .tj-icon', 'var(--tj-selected-section-icon)');
  has(base, '.tj-container--wide', 'max-width: 1200px');
  const st = read('src/pages/settings/settings.css');
  has(st, '.st-nav__link[aria-current="page"]', 'background: var(--tj-selected-section); color: var(--tj-selected-section-ink)');
  has(st, '.st-font:has(input:checked)', 'background: var(--tj-selected); color: var(--tj-selected-ink)');
  has(st, '.st-switch__input:checked + .st-switch__track', 'background: var(--tj-accent-fill)');
  has(st, '.st-section', 'border-radius: var(--tj-radius-card)'); // بطاقة الإعدادات 8 (اللوحة 16)
  const lib = read('src/pages/library/library.css');
  has(lib, '.lib-row', 'background: var(--tj-surface); border: 1px solid var(--tj-border); border-radius: var(--tj-radius-card)');
  has(lib, '.lib-chip--active', 'background: var(--tj-selected); color: var(--tj-selected-ink)');
  has(lib, '.lib-card--active', 'background: var(--tj-selected-soft)');
  const ed = read('src/pages/editor/editor.css');
  has(ed, '.ed-seg__opt[aria-checked="true"]', 'background: var(--tj-selected); color: var(--tj-selected-ink)');
  has(ed, '.ed-tab[aria-selected="true"]::after', 'background: var(--tj-selected-mark)');
  has(ed, '.ed-row.is-selected', 'background: var(--tj-selected-soft)');
  has(ed, '.ed-time:focus-visible, .ed-row__text:focus-visible', 'border-color: var(--tj-accent)');
  const { panelCss } = await import('../../../src/player/panel/styles.js');
  const panel = panelCss();
  has(panel, '.row.cur', 'background: var(--tj-current)');
  has(panel, '.row.cur .t', 'color: var(--tj-current-ink)');
  has(panel, '.prog i', 'background: var(--tj-accent)');
  has(panel, '.switch[aria-checked="true"] .switch__track', 'background: var(--tj-accent)');
  has(panel, '.mark', 'color: var(--tj-logo-glyph)');
  const { groupCss, layerCss } = await import('../../../src/player/controls/styles.js');
  has(groupCss(), '.btn[aria-expanded="true"], .btn[aria-pressed="true"]', 'color: var(--tj-p-accent)');
  const layer = layerCss();
  has(layer, '.seg button[aria-checked="true"]', 'background: var(--tj-p-accent); color: var(--tj-p-accent-ink)');
  has(layer, 'button.item[aria-checked="true"]', 'background: var(--tj-p-selected); color: var(--tj-p-selected-ink)');
  has(layer, 'button.primary', 'background: var(--tj-p-accent); color: var(--tj-p-accent-ink)');
  assert.match(layer, /backdrop-filter: blur\(14px\)/);
});

test('مطابقة ST2 (لوحات 09–16): نقطة القلم بالمضلّع في كل الأسطح لا معيّن مدوّر، وحافة الصفحة المنحنية تحت الرؤوس الأربعة، والرقائق والشارات بزاوية الهوية', async () => {
  const sheets = ['src/ui/components.css', 'src/ui/base.css', 'src/pages/popup/popup.css', 'src/pages/library/library.css', 'src/pages/editor/editor.css', 'src/pages/settings/settings.css'].map((f) => [f, read(f)]);
  const { panelCss } = await import('../../../src/player/panel/styles.js');
  const { groupCss, layerCss } = await import('../../../src/player/controls/styles.js');
  sheets.push(['panel', panelCss()], ['controls', groupCss() + layerCss()]);
  // المعيّن المصمت المدوّر (خلفية وتدوير 45°) هو نقطة الهوية الرابعة؛ وعلامة ✓ والسهم المرسومان بحدّين مدوّرين ليسا نقطة.
  for (const [f, css] of sheets) {
    for (const [, sel, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (/rotate\(45deg\)/.test(body) && /background/.test(body) && !/border(?:-width|-inline-start|-block-end)?:\s*[^;]*(?:solid|2px)/.test(body)) assert.fail(`${f}: ${sel.trim()}: معيّن مدوّر بدل نقطة القلم`);
    }
  }
  const ui = read('src/ui/components.css');
  const edge = rule(ui, '.tj-topbar::after, .tj-popup__head::after, .ed-head::after');
  assert.match(edge, /background: var\(--tj-border-strong\)/);
  assert.match(edge, /C90 1 150 6 166 7\.2 Q170 7\.6 174 7\.2 C190 6 250 1 340 1/, 'مسار اللوحة');
  assert.match(panelCss(), /\.head::after \{[^}]*C90 1 150 6 166 7\.2/, 'ورأس لوحة النص');
  for (const [f, sel] of [['src/ui/base.css', '.tj-topbar'], ['src/pages/popup/popup.css', '.tj-popup__head'], ['src/pages/editor/editor.css', '.ed-head']]) {
    assert.doesNotMatch(rule(read(f), sel), /border-bottom/, `${sel}: لا خط مستقيم تحته`);
  }
  has(ui, '.tj-chip', 'border-radius: var(--tj-radius-sm)');
  assert.match(ownRule(ui, '.tj-chip__count'), /border-radius: var\(--tj-radius-xs\)/);
  has(ui, '.tj-pill', 'border-radius: var(--tj-radius-sm)');
  has(ui, '.tj-btn--outline', 'border-color: var(--tj-border-input)');
  has(read('src/pages/settings/settings.css'), '.st-scale__input::-webkit-slider-thumb', 'clip-path: polygon(62% 0, 100% 50%, 38% 100%, 0 50%)');
  // المقبض المشغَّل في لوحة النص من رمز موجود في مرآتها (كان ‎--tj-accent-ink الغائب عنها فصار شفافًا).
  assert.match(panelCss(), /\.switch\[aria-checked="true"\] \.switch__thumb \{ background: var\(--tj-surface\); box-shadow: none; \}/);
  assert.match(panelCss(), /\.switch__thumb \{[^}]*background: var\(--tj-surface\); box-shadow: 0 0 0 1px var\(--tj-border-input\)/, 'والمطفأ بسطح الوضع وحلقة حدّ الحقل');
  assert.match(ui, /\.tj-topbar::before \{[^}]*background: var\(--tj-surface\)/, 'ما فوق منحنى الشريط الثابت بسطحه');
  const { PANEL_LIGHT } = await import('../../../src/player/panel/tokens.js').catch(() => ({}));
  if (PANEL_LIGHT) assert.ok(!('accentInk' in PANEL_LIGHT), 'المرآة بلا accentInk، فلا يُستعمل في اللوحة');
  assert.doesNotMatch(panelCss(), /var\(--tj-accent-ink\)/, 'لا رمز خارج المرآة في اللوحة');
});

test('تدقيق Fable (UX-16): النص الصغير داخل العنصر المحايد عند المرور بالحبر (≥ 4.5:1 بالوضعين)', () => {
  for (const mode of ['light', 'dark']) {
    const hover = value(mode, '--tj-control-hover');
    assert.ok(ratio(value(mode, '--tj-muted'), hover) < 4.5, `${mode}: الخافت على المرور دون الحد، فلا يُستعمل هناك`);
    assert.ok(ratio(value(mode, '--tj-text'), hover) >= 4.5, `${mode}: الحبر على المرور`);
  }
  assert.match(read('src/ui/components.css'), /\.tj-choice__option:hover \.tj-choice__hint, \.tj-chip:hover \.tj-chip__count \{ color: var\(--tj-text\); \}/);
  assert.match(read('src/pages/settings/settings.css'), /\.st-font:hover \.st-font__tag \{ color: var\(--tj-text\); \}/);
});

/** تصريحات القاعدة التي يبدأ سطرها بهذا المحدد وحده (لا «.a:hover .b {» حين يُطلب «.b {»). */
function ownRule(sheet, selector) {
  const m = new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`).exec(sheet);
  assert.ok(m, `القاعدة ${selector}`);
  return m[1].trim();
}
/** لون فوقه طبقة سوداء بعتامة a (كبسولة العدّاد rgb(0 0 0 / 8%)). */
const underBlack = (hex, a) => `#${[1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - a)).toString(16).padStart(2, '0')).join('')}`;

test('ت-١١ (تحقق Fable للتصميم): عدّاد رقاقة التصفية ووسم «الافتراضي» في سكونهما ≥ 4.5:1 بالوضعين', () => {
  const ui = read('src/ui/components.css');
  const st = read('src/pages/settings/settings.css');
  const colorOf = (body) => /(?:^|;\s*)color:\s*var\((--tj-[\w-]+)\)/.exec(body)?.[1] ?? null;
  const count = ownRule(ui, '.tj-chip__count');
  const tag = ownRule(st, '.st-font__tag');
  // العدّاد كان يرث --tj-text-2 من الرقاقة (4.35:1 فاتحًا)، والوسم بالخافت (4.16:1 فاتحًا و4.38:1 داكنًا).
  assert.equal(colorOf(count), '--tj-text', `.tj-chip__count { ${count} }`);
  assert.equal(colorOf(tag), '--tj-text-2', `.st-font__tag { ${tag} }`);
  assert.match(count, /background: rgb\(0 0 0 \/ 8%\)/, 'كبسولة العدّاد طبقة سوداء 8% فوق خلفية الرقاقة');
  for (const mode of ['light', 'dark']) {
    const r1 = ratio(value(mode, colorOf(count)), underBlack(value(mode, '--tj-control'), 0.08));
    assert.ok(r1 >= 4.5, `${mode}: العدّاد ${r1.toFixed(2)} < 4.5`);
    const r2 = ratio(value(mode, colorOf(tag)), value(mode, '--tj-control'));
    assert.ok(r2 >= 4.5, `${mode}: الوسم ${r2.toFixed(2)} < 4.5`);
  }
  // في الرقاقة المختارة يرث العدّاد نص المختار (الأبيض على الأرجوان العميق)، لا حبر الصفحة.
  assert.match(ownRule(ui, '.tj-chip[aria-pressed="true"] .tj-chip__count'), /color: inherit/);
});

test('ت-١٢ (أ): زرّا «النتيجة السابقة/التالية» في بحث المحرّر أيقونتا الهوية (chev-up وchev-down) لا نصّا سهم', () => {
  const src = readFileSync(path.join(ROOT, 'src/pages/editor/search.js'), 'utf8');
  assert.doesNotMatch(src, /label: '[↑↓]'/, 'لا تسمية بسهم نصي');
  assert.match(src, /const prevBtn = button\(\{[^}]*icon: 'chev-up', iconOnly: true/);
  assert.match(src, /const nextBtn = button\(\{[^}]*icon: 'chev-down', iconOnly: true/);
});

test('ت-١٢ (ب): عنوان صف المحفوظات والزر الكبير وعنوان لوحة المحرّر على سلّمي الهوية §٤ (Almarai 16/14/13/12، وCairo 22/18/16/14)', () => {
  const ALMARAI = [16, 14, 13, 12];
  const CAIRO = [22, 18, 16, 14];
  const fontSize = (body) => Number((/font:\s*\d+\s+(\d+)px/.exec(body) ?? /font-size:\s*(\d+)px/.exec(body))?.[1]);
  const lib = read('src/pages/library/library.css');
  const ui = read('src/ui/components.css');
  const ed = read('src/pages/editor/editor.css');
  for (const [name, body] of [['.lib-row__title', ownRule(lib, '.lib-row__title')], ['.tj-btn--lg', ownRule(ui, '.tj-btn--lg')]]) {
    assert.ok(ALMARAI.includes(fontSize(body)), `${name} ${fontSize(body)}px خارج سلّم Almarai`);
  }
  // عنوان لوحة المحرّر بـ.tj-h4 (Cairo 14/22 في base.css)، ولا تجاوز له بـCairo 13.
  assert.doesNotMatch(ed, /\.ed-panel__head \.tj-h4 \{[^}]*13px/);
  assert.ok(CAIRO.includes(fontSize(ownRule(read('src/ui/base.css'), '.tj-h4'))));
  for (const [sheet, name] of [[lib, 'library.css'], [ui, 'components.css'], [ed, 'editor.css']]) {
    assert.doesNotMatch(sheet, /font:\s*\d+\s+13px\/\d+px var\(--tj-font-head\)/, `${name}: Cairo 13`);
  }
});

/** محتوى كل كتل @media بهذا الشرط في الورقة، متصلةً. */
function mediaBlocks(sheet, cond) {
  let out = '';
  for (let i = sheet.indexOf(`@media ${cond}`); i >= 0; i = sheet.indexOf(`@media ${cond}`, i + 1)) {
    let depth = 0;
    for (let k = sheet.indexOf('{', i); k < sheet.length; k++) {
      if (sheet[k] === '{') depth++;
      else if (sheet[k] === '}' && --depth === 0) {
        out += sheet.slice(sheet.indexOf('{', i) + 1, k);
        break;
      }
    }
  }
  return out;
}

test('ت-١٢ (د): كل قاعدة :root[data-theme="dark"] في components.css لها نظيرة بالتصريحات نفسها تحت prefers-color-scheme: dark', () => {
  // الصفحات لا تضبط data-theme (تتبع النظام)، فالقاعدة المقيّدة به وحده ميتة فيها (كبسولة العدّاد المختار ودوّامة الرئيسي).
  const ui = read('src/ui/components.css');
  const forced = [...ui.matchAll(/(?:^|\n):root\[data-theme="dark"\] ([^{]+?) \{([^}]*)\}/g)].map((m) => [m[1], m[2].trim()]);
  assert.ok(forced.length >= 2, 'القاعدتان');
  const media = mediaBlocks(ui, '(prefers-color-scheme: dark)');
  for (const [sel, body] of forced) {
    const m = new RegExp(`:root:not\\(\\[data-theme="light"\\]\\) ${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`).exec(media);
    assert.ok(m, `نظيرة ${sel} تحت وضع النظام الداكن`);
    assert.equal(m[1].trim(), body, sel);
  }
});

// ---- ت-١٢ (ج): المسافات على سلّم 2 داخل المكوّنات وسلّم 4 بين الكتل (§٥، قرار سلطان 2026-11-13) ----
/**
 * القيم الفردية المقصودة وحدها، بسببها: حدّ أو ما يكمّل حدّ 1px، أو خط شعري 1px، أو توسيط بنصف عرض، أو محاذاة بصرية لأيقونة
 * مع سطرها، أو امتداد غير مرئي لهدف الضغط. [الورقة، جزء من المحدد، الخاصية، القيمة].
 */
const ODD_ALLOWED = [
  ['src/pages/editor/editor.css', '.ed-tab[aria-selected="true"]::after', 'inset-block-end', '-1px'], // الخط فوق حدّ الشريط 1px
  ['src/pages/editor/editor.css', '.ed-row', 'padding', '8px 12px 7px'], // 7 + حدّ سفلي 1 = 8، وROW.pad = 16 في virtual.js
  ['src/pages/library/library.css', '.lib-thumb__dur', 'padding', '1px 4px'], // شعري: شارة 18 = سطر 16 + 2
  ['src/pages/library/library.css', '.lib-chip', 'padding', '0 11px'], // 11 + حدّ شفاف 1 = 12
  ['src/pages/library/library.css', '.lib-result .tj-icon', 'margin-top', '3px'], // (20 − 14) / 2: أيقونة 14 على سطر 20
  ['src/pages/settings/settings.css', '.st-scale__mark', 'margin-inline-start', '-1px'], // نصف علامة عرضها 2
  ['src/pages/settings/settings.css', '.st-scale__input::-webkit-slider-thumb', 'margin-top', '-7px'], // (مسار 4 − إبهام 18) / 2 في Chromium
  ['src/ui/base.css', '.tj-sr-only', 'margin', '-1px'], // نمط الإخفاء البصري المعياري
  ['src/ui/components.css', '.tj-choice__option > input[type="radio"]', 'margin', '3px 0 0'], // هامش المتصفح العلوي للدائرة مع سطر 20
  ['src/ui/components.css', '.tj-seg', 'padding', '3px'], // 3 + حدّ شفاف 1 = 4، والمقطّعة 40
  ['src/ui/components.css', '.tj-menu__grp', 'gap', '1px'], // شعري بين البنود
  ['src/ui/components.css', '.tj-toast__action::after', 'inset', '-5px -2px'], // امتداد هدف الضغط
  ['src/ui/components.css', '.tj-lang-pop__list', 'gap', '1px'], // شعري بين البنود
  ['player/controls', '.btn[aria-pressed="true"]::after', 'margin-left', '-7px'], // نصف خط عرضه 14
  ['player/controls', '.line', 'padding', '1px 6px'], // شعري
  ['player/controls', 'button.link', 'padding', '7px 4px'], // هدف 32 دون تغيير السطر…
  ['player/controls', 'button.link', 'margin', '-7px -4px'], // …يلغيه هامش سالب
  ['player/controls', '.toast button.act::after', 'inset', '-5px -2px'], // امتداد هدف الضغط
  ['player/panel', '.inline-error .ic', 'margin-top', '1px'], // محاذاة بصرية شعرية
  ['player/panel', '.list', 'gap', '1px'], // شعري بين الصفوف
  ['player/panel', '.en', 'margin-top', '1px'], // شعري
  ['player/panel', '.alert .ic', 'margin-top', '1px'], // محاذاة بصرية شعرية
];
const SPACING = /^(?:padding|margin|gap|row-gap|column-gap|inset|top|right|bottom|left)(?:-(?:inline|block|top|right|bottom|left)(?:-(?:start|end))?)?$/;

test('ت-١٢ (ج): لا قيمة مسافة فردية بالبكسل في الصفحات والمشغّل واللوحة إلا المقصودة المسمّاة', async () => {
  const { groupCss, layerCss } = await import('../../../src/player/controls/styles.js');
  const { panelCss } = await import('../../../src/player/panel/styles.js');
  const sheets = [...walk(path.join(ROOT, 'src'))].filter((f) => f.endsWith('.css')).map((f) => [path.relative(ROOT, f), read(path.relative(ROOT, f))]);
  sheets.push(['player/controls', `${groupCss()}\n${layerCss()}`.replace(/\/\*[\s\S]*?\*\//g, '')], ['player/panel', panelCss().replace(/\/\*[\s\S]*?\*\//g, '')]);
  const found = [];
  for (const [file, css] of sheets) {
    for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      for (const decl of body.split(';')) {
        const at = decl.indexOf(':');
        if (at < 0) continue;
        const prop = decl.slice(0, at).trim();
        const val = decl.slice(at + 1).trim();
        if (!SPACING.test(prop)) continue;
        // الفردي الصحيح وحده؛ والكسري توسيط محسوب (6.5 = (18 − 5) / 2 لمعيّن النافذة على سطره).
        if ([...val.matchAll(/(-?\d+(?:\.\d+)?)px/g)].some((m) => Math.abs(Number(m[1])) % 2 === 1)) found.push([file, selector.trim(), prop, val]);
      }
    }
  }
  const allowed = (f) => ODD_ALLOWED.find(([file, sel, prop, val]) => f[0] === file && f[1].includes(sel) && f[2] === prop && f[3] === val);
  assert.deepEqual(found.filter((f) => !allowed(f)).map((f) => `${f[0]}: ${f[1]} { ${f[2]}: ${f[3]} }`), [], 'قيم فردية غير مسمّاة');
  for (const a of ODD_ALLOWED) assert.ok(found.some((f) => allowed(f) === a), `استثناء لا موضع له: ${a.join(' ')}`);
});

test('ت-١٢ (ج): نص الهوية §٥: سلّم 2 داخل المكوّنات وسلّم 4 بين الكتل', () => {
  const doc = readFileSync(path.join(ROOT, 'docs/identity.md'), 'utf8');
  assert.doesNotMatch(doc, /مسافات على سلّم 4 \(4…64\)/);
  assert.match(doc, /سلّم 2 داخل المكوّنات/);
  assert.match(doc, /سلّم 4 بين الكتل/);
});

// ---- ت-١٢ (ب) كاملًا (تحقق مستقل، 2026-11-13): كل حجم خط على سلّمي الهوية §٤، وكل سطر على سلّم 2 ----
/** سلّما §٤: Almarai 16/14/13/12 (النص والحقول والأزرار والقوائم)، وCairo 30/22/18/16/14 (العناوين واسم المنتج). */
const BODY_SIZES = [16, 14, 13, 12];
const HEAD_SIZES = [30, 22, 18, 16, 14];

/**
 * تصريح خط واحد على سلّمي §٤ (تحقق 2.3.0، ص-١٨: كان الحارس يتخطى بصمت كل font: بصيغة غير المعتادة، وrem وcalc، وسمة style).
 * font: [مائل] [وزن رقمي أو bold…] <الحجم>[/<السطر>] var(--…font-body|head|mono)، والعائلة من رموز الهوية وحدها. الحجم بالبكسل على سلّم
 * خطه (والأحادي العرض خارجه)؛ وفي المشغّل واللوحة em وvar(--…) أيضًا، لأن مقاسهما يتبع حجم المشغّل؛ وrem و% وcalc لا في أي سطح. والسطر
 * بالبكسل زوجي، وبلا وحدة أو var مقبول. وما لا يُفهم مخالفة لا تخطٍّ، إلا inherit وinitial وunset.
 * @returns {{ seen: boolean, problems: string[] }}
 */
function fontDecl(where, prop, val, { player = false } = {}) {
  const v = val.replace(/\s*!important$/, '').trim();
  if (/^(?:inherit|initial|unset|revert)$/.test(v)) return { seen: false, problems: [] };
  const NUM = String.raw`\d+(?:\.\d+)?`;
  const SIZE = String.raw`${NUM}(?:px|em|rem|%)|var\(--[\w-]+\)|calc\([^()]*(?:\([^()]*\)[^()]*)*\)`;
  const sizeOk = (size, family) => {
    const px = new RegExp(`^(${NUM})px$`).exec(size);
    if (px) return family === 'mono' || (family === 'head' ? HEAD_SIZES : family === 'body' ? BODY_SIZES : [...new Set([...BODY_SIZES, ...HEAD_SIZES])]).includes(Number(px[1])) ? null : `الحجم ${px[1]} خارج سلّم ${family === 'head' ? 'Cairo' : family === 'body' ? 'Almarai' : 'الخطين'}`;
    if (player && (new RegExp(`^${NUM}em$`).test(size) || /^var\(--[\w-]+\)$/.test(size))) return null;
    return `الحجم ${size} بوحدة غير مسموحة هنا (البكسل على السلّم${player ? '، أو em أو var في المشغّل' : ''})`;
  };
  const lineOk = (line) => {
    if (!line || new RegExp(`^${NUM}$`).test(line) || /^var\(--[\w-]+\)$/.test(line) || line === 'normal') return null;
    const px = new RegExp(`^(${NUM})px$`).exec(line);
    if (px) return Number(px[1]) % 2 ? `السطر ${px[1]} فردي` : null;
    return `السطر ${line} بوحدة غير مسموحة`;
  };
  const problems = [];
  if (prop === 'font') {
    const m = new RegExp(String.raw`^(?:(?:normal|italic|oblique|small-caps|bold|bolder|lighter|\d{3})\s+)*(${SIZE})(?:\s*\/\s*(${NUM}(?:px)?|var\(--[\w-]+\)|normal))?\s+(.+)$`).exec(v);
    if (!m) return { seen: true, problems: [`${where} { font: ${val} } — صيغة لا يفهمها الحارس`] };
    const [, size, line, familyText] = m;
    const fam = /^var\(--[\w-]*font-(body|head|mono)\)$/.exec(familyText.trim());
    if (!fam) problems.push(`${where} { font: ${val} } — العائلة ليست رمز خط من الهوية (var(--…font-body|head|mono))`);
    const family = fam?.[1] ?? 'body';
    for (const why of [sizeOk(size, family), lineOk(line)]) if (why) problems.push(`${where} { font: ${val} } — ${why}`);
  } else if (prop === 'font-size') {
    if (!new RegExp(`^(?:${SIZE})$`).test(v)) return { seen: true, problems: [`${where} { font-size: ${val} } — صيغة لا يفهمها الحارس`] };
    const why = sizeOk(v, null);
    if (why) problems.push(`${where} { font-size: ${val} } — ${why}`);
  } else if (prop === 'line-height') {
    const why = lineOk(v);
    if (why) problems.push(`${where} { line-height: ${val} } — ${why}`);
  } else return { seen: false, problems: [] };
  return { seen: true, problems };
}

test('ت-١٢ (ب): كل حجم خط في الصفحات واللوحة والمشغّل على سلّم خطه في الهوية §٤، وكل سطر بالبكسل زوجي، ولا صيغة يتخطاها الحارس', async () => {
  const { groupCss, layerCss } = await import('../../../src/player/controls/styles.js');
  const { panelCss } = await import('../../../src/player/panel/styles.js');
  // الترجمة فوق الفيديو (overlay/styles.js) خارج السلّم بالتصميم: حجمها بمعادلة المنتج ونسبة المستخدم (docs/identity.md §٧ البند ٢).
  const sheets = [...walk(path.join(ROOT, 'src'))].filter((f) => f.endsWith('.css')).map((f) => [path.relative(ROOT, f), read(path.relative(ROOT, f)), false]);
  sheets.push(['player/controls', `${groupCss()}\n${layerCss()}`.replace(/\/\*[\s\S]*?\*\//g, ''), true], ['player/panel', panelCss().replace(/\/\*[\s\S]*?\*\//g, ''), true]);
  const off = [];
  let seen = 0;
  const take = (where, decl, player) => {
    const at = decl.indexOf(':');
    if (at < 0) return;
    const r = fontDecl(where, decl.slice(0, at).trim(), decl.slice(at + 1).trim(), { player });
    if (r.seen) seen++;
    off.push(...r.problems);
  };
  for (const [file, css, player] of sheets) {
    for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) for (const decl of body.split(';')) take(`${file}: ${selector.trim()}`, decl, player);
  }
  // وسمة style في صفحات HTML، والخط المضمّن من الشيفرة إلا موضعيه بالتصميم: كلمة الشعار بمقاسها من عرضه (logo.js) ومعاينة الترجمة بحجمها.
  for (const f of [...walk(path.join(ROOT, 'src'))].filter((x) => x.endsWith('.html'))) {
    for (const [, body] of readFileSync(f, 'utf8').matchAll(/\sstyle\s*=\s*["']([^"']*)["']/gi)) for (const decl of body.split(';')) take(`${path.relative(ROOT, f)}: [style]`, decl, false);
  }
  const INLINE_OK = ['src/ui/logo.js: w.style.fontSize = `${wordSize}px`;', 'src/ui/logo.js: w.style.lineHeight = `${Math.round(wordSize * 4 / 3)}px`;', 'src/pages/settings/view.js: stage.style.fontSize = s.fontSize;'];
  const inline = [];
  for (const f of [...walk(path.join(ROOT, 'src'))].filter((x) => x.endsWith('.js') && !x.includes(`${path.sep}overlay${path.sep}`))) {
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      if (/\.style\s*\.\s*(?:font|fontSize|lineHeight)\s*=|setProperty\(\s*['"`](?:font|font-size|line-height)['"`]/.test(line)) inline.push(`${path.relative(ROOT, f)}: ${line.trim()}`);
    }
  }
  assert.ok(seen > 150, `قُرئت ${seen} تصريحًا فقط`);
  assert.deepEqual(off, [], 'أحجام خارج السلّم');
  assert.deepEqual(inline.filter((l) => !INLINE_OK.includes(l)), [], 'خط مضمّن من الشيفرة');
  for (const l of INLINE_OK) assert.ok(inline.includes(l), `استثناء لا موضع له: ${l}`);
});

test('ت-١٢ (ب)، ص-١٨: الحارس يُسقط الصيغ التي كان يتخطاها، ويقبل ما في الهوية', () => {
  const bad = (prop, val, o) => fontDecl('x', prop, val, o).problems.length > 0;
  for (const val of ['15px var(--tj-font-body)', 'bold 15px var(--tj-font-body)', '700 15px / 20px var(--tj-font-body)', '700 14px Almarai', 'italic 700 15px var(--tj-font-body)', '700 1rem var(--tj-font-body)', '700 calc(1em + 2px) var(--tj-font-body)', '700 13px/1 var(--tj-font-head)', '700 14px/21px var(--tj-font-body)']) assert.ok(bad('font', val), val);
  for (const val of ['0.95rem', 'calc(12px + 1px)', '90%', '15px', 'large']) assert.ok(bad('font-size', val), val);
  assert.ok(bad('font-size', '0.93em'), 'em في الصفحات');
  assert.ok(bad('line-height', '1.5em'));
  for (const val of ['700 13px/1 var(--tj-font-body)', '400 14px/20px var(--tj-font-body)', '800 22px/1.3 var(--tj-font-head)', '500 11px var(--tj-font-mono)', 'inherit']) assert.ok(!bad('font', val), val);
  for (const val of ['400 var(--fs)/1.5 var(--tj-p-font-body)', '500 0.93em/1.4 var(--tj-p-font-mono)']) assert.ok(!bad('font', val, { player: true }), val);
  assert.ok(!bad('font-size', '0.93em', { player: true }));
  assert.ok(!bad('font-size', '13px') && !bad('line-height', '1.5') && !bad('line-height', '20px'));
});
