// الهوية الثالثة «باذنجاني على رمادي» (قرار سلطان 2026-11-04، docs/identity-v3.md): قيم لوحة التصميم المعتمدة في tokens.css
// ورموز المشغّل بالوضعين، وتطابق كتلتي الداكن (النظام وdata-theme)، ونسب التباين التي نجحت في المعاينة محسوبةً من الملف نفسه.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
/** قيمة الرمز في الوضع: الداكن يتجاوز الفاتح فيما يذكره وحده. */
const value = (mode, name) => (mode === 'dark' ? DARK.get(name) ?? LIGHT.get(name) : LIGHT.get(name));

// قيم لوحة التصميم «ترجمان — الهوية والشاشات» (project/tj.css، الإصدار 1793758690-fa7d).
const BOARD = {
  light: {
    '--tj-bg': '#F6F5F4', '--tj-surface': '#FEFEFD', '--tj-surface-2': '#E8E7E6', '--tj-control': '#E8E7E6',
    '--tj-control-hover': '#DFDDDD', '--tj-control-pressed': '#D4D2D2',
    '--tj-text': '#221C21', '--tj-text-2': '#5B575A', '--tj-muted': '#666165', '--tj-border-input': '#817E80',
    '--tj-brand': '#6B2D5E', '--tj-brand-hover': '#5B2951', '--tj-brand-pressed': '#4E2646', '--tj-brand-ink': '#FEFEFD',
    '--tj-selected': '#E1D4DD', '--tj-selected-ink': '#5B2951', '--tj-selected-soft': '#F5F1F3', '--tj-selected-mark': '#6B2D5E',
    '--tj-selected-section': 'rgb(107 45 94 / 6%)', '--tj-selected-section-ink': '#5B2951', '--tj-selected-section-icon': '#6B2D5E',
    '--tj-brand-soft': '#F5F1F3', '--tj-success': '#2E6A4C', '--tj-warning': '#8A5B10', '--tj-danger': '#B0302A',
  },
  dark: {
    '--tj-bg': '#121112', '--tj-surface': '#1E1D1E', '--tj-surface-2': '#2B292A', '--tj-control': '#2B292A',
    '--tj-control-hover': '#363435', '--tj-control-pressed': '#413F40',
    '--tj-text': '#F1EDEF', '--tj-text-2': '#B5B2B3', '--tj-muted': '#939192', '--tj-border-input': '#827F81',
    '--tj-brand': '#D9A7CB', '--tj-brand-hover': '#E0BCD6', '--tj-brand-pressed': '#B98FAD', '--tj-brand-ink': '#0E0E0E',
    '--tj-selected': '#4B3E48', '--tj-selected-ink': '#E6CEDF', '--tj-selected-soft': '#312B2F', '--tj-selected-mark': '#D9A7CB',
    '--tj-selected-section': 'rgb(217 167 203 / 9%)', '--tj-selected-section-ink': '#E6CEDF', '--tj-selected-section-icon': '#D9A7CB',
    '--tj-brand-soft': '#312B2F', '--tj-success': '#8DCDA9', '--tj-warning': '#E6C077', '--tj-danger': '#F4A58C',
  },
};

test('قيم لوحة التصميم المعتمدة بالوضعين في tokens.css', () => {
  for (const mode of ['light', 'dark']) {
    for (const [name, want] of Object.entries(BOARD[mode])) assert.equal(value(mode, name), want, `${mode} ${name}`);
  }
});

test('كتلتا الداكن (وضع النظام وdata-theme="dark") متطابقتان رمزًا رمزًا', () => {
  assert.deepEqual([...DARK_MEDIA.entries()].sort(), [...DARK.entries()].sort());
});

test('لا أزرق ولا أحمر يوتيوب ولا بُنّ ولا ذهب في الرموز', () => {
  const all = [...LIGHT.values(), ...DARK.values()].join(' ').toUpperCase();
  for (const old of ['#5C4434', '#D6B38F', '#C9A24D', '#E2C27A', '#FAF8F4', '#1F1C1A', '#4338CA', '#FF0000', '#CC0000']) assert.ok(!all.includes(old), old);
  assert.equal(LIGHT.get('--tj-logo-glyph'), 'var(--tj-brand)', 'العلامة بالإبراز');
  assert.equal(LIGHT.get('--tj-logo-dots'), 'var(--tj-logo-glyph)', 'لا نقاط منفصلة: رمزها يتبع العلامة');
  assert.equal(LIGHT.get('--tj-logo-word'), 'var(--tj-text)', 'الاسم بالمداد');
  assert.ok(!DARK.has('--tj-logo-dots') && !DARK.has('--tj-logo-glyph'), 'ألوان الشعار مشتقة في الداكن لا مكررة');
});

const lum = (h) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('التباين بالوضعين كما نجح في المعاينة: النص على كل سطح، ونص المحدد وغير المحدد، والأزرار، والحقل، والتركيز', () => {
  const SURFACES = ['--tj-bg', '--tj-surface', '--tj-surface-2', '--tj-sunken'];
  const PAIRS = [
    ...SURFACES.map((s) => ['--tj-text', s, 7]),
    ...SURFACES.map((s) => ['--tj-text-2', s, 4.5]),
    ...SURFACES.map((s) => ['--tj-muted', s, 4.5]),
    ...SURFACES.map((s) => ['--tj-brand-text', s, 4.5]),
    ...SURFACES.map((s) => ['--tj-border-input', s, 3]),
    ...SURFACES.map((s) => ['--tj-focus', s, 3]),
    ['--tj-brand-ink', '--tj-brand', 4.5], ['--tj-brand-ink', '--tj-brand-hover', 4.5], ['--tj-brand-ink', '--tj-brand-pressed', 4.5],
    ['--tj-selected-ink', '--tj-selected', 4.5], ['--tj-text', '--tj-selected-soft', 7], ['--tj-brand-text', '--tj-brand-soft', 4.5],
    ['--tj-focus', '--tj-selected', 3], ['--tj-selected-mark', '--tj-surface', 3], ['--tj-selected-mark', '--tj-bg', 3],
    ['--tj-text', '--tj-control', 7], ['--tj-text-2', '--tj-control', 4.5], ['--tj-text', '--tj-control-pressed', 4.5],
    ['--tj-success', '--tj-success-bg', 4.5], ['--tj-danger', '--tj-danger-bg', 4.5], ['--tj-warning', '--tj-warning-bg', 4.5],
    ['--tj-danger-ink', '--tj-danger', 4.5], ['--tj-text', '--tj-bg', 4.5],
  ];
  for (const mode of ['light', 'dark']) {
    for (const [fg, bg, min] of PAIRS) {
      const r = ratio(value(mode, fg), value(mode, bg));
      assert.ok(r >= min, `${mode}: ${fg} على ${bg} = ${r.toFixed(2)} < ${min}`);
    }
  }
});

test('رموز المشغّل (داكن بالوضعين): قيم اللوحة، والمحدد صبغة باذنجانية داكنة بنص فاتح، والرئيسي بحبر داكن', () => {
  assert.equal(PLAYER_TOKENS.menuBg, 'rgb(18 17 18 / 94%)');
  assert.equal(PLAYER_TOKENS.accent, '#D9A7CB');
  assert.equal(PLAYER_TOKENS.accentInk, '#0E0E0E');
  assert.equal(PLAYER_TOKENS.selected, '#4B3E48');
  assert.equal(PLAYER_TOKENS.selectedInk, '#E6CEDF');
  const menu = '#121112'; // ليل القائمة دون الشفافية: أسوأ حالة فوق فيديو داكن
  assert.ok(ratio(PLAYER_TOKENS.selectedInk, PLAYER_TOKENS.selected) >= 4.5);
  assert.ok(ratio(PLAYER_TOKENS.accentInk, PLAYER_TOKENS.accent) >= 4.5);
  assert.ok(ratio(PLAYER_TOKENS.menuText, menu) >= 7 && ratio(PLAYER_TOKENS.menuText2, menu) >= 4.5);
  for (const k of ['warn', 'error', 'ok', 'accent']) assert.ok(ratio(PLAYER_TOKENS[k], menu) >= 4.5, k);
});

// ---- قواعد الأزرار والخيارات بلا إطار دائم والتحديد بدرجتين في الصفحات واللوحة والمشغّل ----
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
/** تصريحات القاعدة بهذا المحدد حرفيًا (أول ظهور). */
function rule(sheet, selector) {
  const at = sheet.indexOf(`${selector} {`);
  assert.ok(at >= 0, `القاعدة ${selector}`);
  return sheet.slice(sheet.indexOf('{', at) + 1, sheet.indexOf('}', at)).trim();
}
const has = (sheet, selector, decl) => assert.ok(rule(sheet, selector).includes(decl), `${selector} { … ${decl} … } ← ${rule(sheet, selector)}`);

test('المكوّنات المشتركة: الزر الثانوي بلا حد بخلفية الزر، والرئيسي يغمق بالضغط، والمختار صبغة بنص أغمق', () => {
  const ui = read('src/ui/components.css');
  has(ui, '.tj-btn', 'border: 1px solid transparent; background: var(--tj-control)');
  has(ui, '.tj-btn--secondary', 'background: var(--tj-control)');
  assert.doesNotMatch(rule(ui, '.tj-btn--secondary'), /border/);
  has(ui, '.tj-btn:hover:not(:disabled):not([aria-disabled="true"])', 'var(--tj-control-hover)');
  has(ui, '.tj-btn:active:not(:disabled):not([aria-disabled="true"]):not(.tj-btn--primary):not(.tj-btn--danger)', 'var(--tj-control-pressed)');
  has(ui, '.tj-btn--primary:active:not(:disabled):not([aria-disabled="true"])', 'var(--tj-brand-pressed)');
  has(ui, '.tj-chip', 'border: 1px solid transparent; background: var(--tj-control)');
  has(ui, '.tj-chip[aria-pressed="true"]', 'background: var(--tj-selected); color: var(--tj-selected-ink)');
  has(ui, '.tj-seg__option input:checked + .tj-seg__label', 'background: var(--tj-selected); color: var(--tj-selected-ink)');
  has(ui, '.tj-slots__slot[aria-checked="true"]', 'background: var(--tj-selected); color: var(--tj-selected-ink)');
  has(ui, '.tj-choice__option', 'border: 1px solid transparent');
  has(ui, '.tj-choice__option:has(input:checked)', 'background: var(--tj-selected); color: var(--tj-selected-ink)');
  assert.match(rule(ui, '.tj-toast__action'), /border: 0;/, 'زر «تراجع» في الرسالة بلا إطار');
  // ما يبقى بحدّه عمدًا: حقول الكتابة.
  has(ui, '.tj-field__input', 'border: 1px solid var(--tj-border-input)');
});

test('الصفحات: القسم الحالي أهدأ من المختار، وشرائح المحفوظات والمحرّر وبطاقات الخط بلا حد، والعلامة تحت الحالي', () => {
  const base = read('src/ui/base.css');
  has(base, '.tj-topbar__link[aria-current="page"]::after', 'background: var(--tj-selected-mark)');
  const st = read('src/pages/settings/settings.css');
  has(st, '.st-nav__link[aria-current="page"]', 'background: var(--tj-selected-section); color: var(--tj-selected-section-ink)');
  assert.doesNotMatch(rule(st, '.st-nav__link[aria-current="page"]'), /box-shadow/);
  has(st, '.st-nav__link[aria-current="page"] .tj-icon', 'var(--tj-selected-section-icon)');
  has(st, '.st-font', 'border: 1px solid transparent');
  has(st, '.st-font:has(input:checked)', 'background: var(--tj-selected); color: var(--tj-selected-ink)');
  const lib = read('src/pages/library/library.css');
  has(lib, '.lib-chip', 'border: 1px solid transparent; background: var(--tj-control)');
  has(lib, '.lib-chip--active', 'background: var(--tj-selected); color: var(--tj-selected-ink)');
  has(lib, '.lib-card--active', 'background: var(--tj-selected-soft)');
  has(lib, '.lib-toggle[aria-expanded="true"], .lib-toggle[aria-expanded="true"]:hover:not(:disabled):not([aria-disabled="true"])', 'background: var(--tj-selected); color: var(--tj-selected-ink)');
  assert.doesNotMatch(lib, /dashed/, 'لا حد متقطّع في المحفوظات');
  const ed = read('src/pages/editor/editor.css');
  has(ed, '.ed-seg', 'border: 1px solid transparent');
  has(ed, '.ed-seg__opt[aria-checked="true"]', 'background: var(--tj-selected); color: var(--tj-selected-ink)');
  has(ed, '.ed-chip', 'border: 1px solid transparent');
  has(ed, '.ed-issue', 'border: 1px solid transparent; border-radius: var(--tj-radius-md); background: var(--tj-control)');
  has(ed, '.ed-tab[aria-selected="true"]::after', 'background: var(--tj-selected-mark)');
  has(ed, '.ed-row.is-selected', 'background: var(--tj-selected-soft)');
  assert.doesNotMatch(ed, /logo-dots/, 'لا ذهب الشعار في المحرّر');
  for (const sel of ['.ed-chip--todo', '.ed-chip--done', '.ed-chip--moved']) assert.doesNotMatch(rule(ed, sel), /border/, `${sel} بلا حد`);
  has(ed, '.ed-row__text', 'border: 1px solid var(--tj-border-strong)');
  const pop = read('src/pages/popup/popup.css');
  for (const sel of ['.tj-popup__copy--success', '.tj-popup__copy--error']) has(pop, sel, 'border-color: transparent');
});

test('اللوحة والمشغّل: أزرار .b و.segs بلا حد بالمحدد، وقوائم المشغّل وزر الشريط المضغوط أو المفتوح بـ--tj-p-selected', async () => {
  const { panelCss } = await import('../../../src/player/panel/styles.js');
  const { groupCss, layerCss } = await import('../../../src/player/controls/styles.js');
  const panel = panelCss();
  has(panel, '.b', 'border: 1px solid transparent');
  has(panel, '.b', 'background: var(--tj-control)');
  has(panel, '.b[aria-expanded="true"]', 'background: var(--tj-selected); color: var(--tj-selected-ink)');
  has(panel, '.segs button[aria-checked="true"]', 'background: var(--tj-selected); color: var(--tj-selected-ink)');
  assert.doesNotMatch(panel, /border-strong\); border-radius: var\(--tj-radius-md\); background/, 'لا زر بحد بارز');
  has(panel, '.num', 'border: 1px solid var(--tj-border-input)');
  has(groupCss(), '.btn[aria-expanded="true"], .btn[aria-pressed="true"]', 'background: var(--tj-p-selected); color: var(--tj-p-selected-ink)');
  const layer = layerCss();
  has(layer, 'button.slot[aria-checked="true"]', 'background: var(--tj-p-selected); color: var(--tj-p-selected-ink)');
  has(layer, '.seg button[aria-checked="true"]', 'background: var(--tj-p-selected); color: var(--tj-p-selected-ink)');
  has(layer, 'button.item[aria-checked="true"]', 'background: var(--tj-p-selected); color: var(--tj-p-selected-ink)');
  has(layer, 'button.primary', 'background: var(--tj-p-accent); color: var(--tj-p-accent-ink)');
});
