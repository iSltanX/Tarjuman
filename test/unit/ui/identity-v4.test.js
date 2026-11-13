// الهوية الرابعة «كتابٌ مفتوح» (قرار سلطان 2026-11-07، docs/identity.md): قيم لوحة الهوية (project/tj.css، الإصدار
// 1794035287-e3de) في tokens.css ورموز المشغّل بالوضعين، وتطابق كتلتي الداكن، والتباين محسوبًا من الملف نفسه (كل نص ≥ 4.5:1 على
// السطح الذي يحمله، وغير النص ≥ 3:1)، والحارس الذي يمنع عودة ألوان الهويات السابقة إلى src/، وقواعد المكوّنات والأسطح.
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

// رموز اللوحة (tj.css) بأسماء المنتج: --t-bg ← --tj-bg، و--t-ink ← --tj-text، و--t-primary ← --tj-brand، وهكذا.
const BOARD = {
  light: {
    '--tj-bg': '#F3EFE6', '--tj-surface': '#FFFDF8', '--tj-surface-2': '#EAE5DA', '--tj-surface-3': '#DFD9CC', '--tj-control': '#DFD9CC',
    '--tj-text': '#182E2B', '--tj-text-2': '#4A5A58', '--tj-muted': '#596865', '--tj-on-ink': '#FFFDF8',
    '--tj-border': '#E2DDD2', '--tj-border-strong': '#CDC6B8', '--tj-border-input': '#85908D',
    '--tj-brand': '#1E4A44', '--tj-brand-hover': '#173C37', '--tj-brand-pressed': '#112E2A', '--tj-brand-ink': '#FFFFFF',
    '--tj-accent': '#B9705A', '--tj-accent-hover': '#A6604B', '--tj-accent-text': '#8F4A36', '--tj-accent-fill': '#A05C47', '--tj-accent-soft': '#F6E7E0', '--tj-focus': '#B9705A',
    '--tj-selected': '#1E4A44', '--tj-selected-ink': '#FFFFFF', '--tj-selected-soft': '#E6EFEC', '--tj-selected-soft-ink': '#1E4A44',
    '--tj-success': '#2A6E46', '--tj-success-bg': '#E3F0E7', '--tj-warning': '#8F5414', '--tj-warning-bg': '#F7EAD9',
    '--tj-danger': '#B4383E', '--tj-danger-bg': '#F8E3E3', '--tj-info': '#38679A', '--tj-info-bg': '#E3ECF5',
    '--tj-logo-glyph': '#1E4A44', '--tj-logo-word': '#182E2B', '--tj-logo-tile': '#1E4A44', '--tj-logo-on-tile': '#F3EFE6',
  },
  dark: {
    '--tj-bg': '#0F1917', '--tj-surface': '#16221F', '--tj-surface-2': '#1E2B28', '--tj-surface-3': '#263431', '--tj-control': '#263431',
    '--tj-text': '#EDE9E0', '--tj-text-2': '#B6B9B2', '--tj-muted': '#8F9893', '--tj-on-ink': '#0F1917',
    '--tj-border': '#26332F', '--tj-border-strong': '#33423D', '--tj-border-input': '#7E8A86',
    '--tj-brand': '#EDE9E0', '--tj-brand-hover': '#FFFFFF', '--tj-brand-pressed': '#CFCBC2', '--tj-brand-ink': '#0F1917',
    '--tj-accent': '#D9937B', '--tj-accent-text': '#E2A48E', '--tj-accent-fill': '#D9937B', '--tj-accent-soft': '#33251F', '--tj-focus': '#D9937B',
    '--tj-selected': '#EDE9E0', '--tj-selected-ink': '#0F1917', '--tj-selected-soft': '#1F2F2B', '--tj-selected-soft-ink': '#CFE0DA',
    '--tj-success': '#7CC79A', '--tj-warning': '#E4B06A', '--tj-danger': '#F08C8C', '--tj-info': '#8FB4DC',
    '--tj-logo-glyph': '#EDE9E0', '--tj-logo-word': '#EDE9E0', '--tj-logo-tile': '#1E4A44',
  },
};

test('قيم لوحة الهوية بالوضعين في tokens.css (الصنوبر يفعل، والطين يُشير، والعاج يحمل القراءة)', () => {
  for (const mode of ['light', 'dark']) {
    for (const [name, want] of Object.entries(BOARD[mode])) assert.equal(value(mode, name), want, `${mode} ${name}`);
  }
});

test('كتلتا الداكن (وضع النظام وdata-theme="dark") متطابقتان رمزًا رمزًا، وبلاطة الشعار صنوبر بالوضعين', () => {
  assert.deepEqual([...DARK_MEDIA.entries()].sort(), [...DARK.entries()].sort());
  assert.equal(value('light', '--tj-logo-tile'), value('dark', '--tj-logo-tile'));
});

// ---- الحارس: لا لون من الهويات السابقة في src/ ----
/** «باذنجاني على رمادي» (الثالثة) و«بُنّ على ورق» (الثانية) وما قبلهما: قيمها المميِّزة. */
const RETIRED = [
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

test('الحارس: لا لون من الهويات السابقة في أي ملف نصي تحت src/', () => {
  const hits = [];
  for (const file of walk(path.join(ROOT, 'src'))) {
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
  // الشعار على بلاطته: العاج على الصنوبر.
  assert.ok(ratio(value('light', '--tj-logo-on-tile'), value('light', '--tj-logo-tile')) >= 4.5);
});

test('استثناء مسمّى (ص1، ق14): رمز البلاطة الافتراضية في المحفوظات زخرفي بتباين منخفض عمدًا بالوضعين، ومخفي عن قارئ الشاشة', () => {
  // --tj-border-strong على --tj-surface-2: نحو 1.35 فاتحًا و1.39 داكنًا. ليس نصًا ولا عنصر تحكم ولا معلومة، فلا يخضع لحدّي 4.5 و3.
  for (const [mode, expect] of [['light', 1.35], ['dark', 1.39]]) {
    const r = ratio(value(mode, '--tj-border-strong'), value(mode, '--tj-surface-2'));
    assert.ok(Math.abs(r - expect) < 0.03, `${mode}: ${r.toFixed(2)}`);
    assert.ok(r < 3, 'خافت عمدًا');
  }
  const thumb = readFileSync(new URL('../../../src/pages/library/thumb.js', import.meta.url), 'utf8');
  assert.match(thumb, /className: 'lib-thumb__fallback', attrs: \{ 'aria-hidden': 'true' \}/);
});

test('رموز المشغّل (داكن بالوضعين): قيم .pl في اللوحة، والمحدد صبغة طين 18% بنص طيني، والرئيسي بالطين الليلي بحبر داكن', () => {
  assert.equal(PLAYER_TOKENS.menuBg, 'rgb(15 25 23 / 92%)');
  assert.equal(PLAYER_TOKENS.menuText, '#F1EFE8');
  assert.equal(PLAYER_TOKENS.menuText2, '#B6B9B2');
  assert.equal(PLAYER_TOKENS.accent, '#D9937B');
  assert.equal(PLAYER_TOKENS.accentInk, '#0F1917');
  assert.equal(PLAYER_TOKENS.selected, 'rgb(217 147 123 / 18%)');
  assert.equal(PLAYER_TOKENS.selectedInk, '#D9937B');
  assert.equal(PLAYER_TOKENS.menuRadius, '12px');
  const menu = '#0F1917'; // ليل القائمة دون الشفافية: أسوأ حالة فوق فيديو داكن
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

test('المكوّنات (لوحة 08): الأنواع الستة والأحجام الخمسة، والمختار صنوبر بنص عاج، والتركيز طيني، والإشعار بلون الحبر', () => {
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
  has(ui, '.tj-choice__option:has(input:checked)', 'background: var(--tj-selected-soft); border-color: var(--tj-text)');
  has(ui, '.tj-field__input:focus-visible, .tj-field__input:focus', 'border-color: var(--tj-accent); box-shadow: 0 0 0 3px var(--tj-accent-track)');
  has(ui, '.tj-field__input', 'border: 1px solid var(--tj-border-input)');
  has(ui, '.tj-toast', 'background: var(--tj-text); color: var(--tj-on-ink)');
  has(ui, '.tj-toast--success .tj-icon', 'var(--tj-toast-success)');
  has(ui, '.tj-meter__fill', 'background: var(--tj-accent)');
  has(ui, '.tj-sinnah', 'transform: rotate(45deg)');
  has(ui, '.tj-dialog', 'border-radius: var(--tj-radius-card-lg)');
  has(ui, '.tj-logo__word', 'font-weight: 800');
  assert.match(read('src/ui/base.css'), /:focus-visible \{ outline: 2px solid var\(--tj-focus\); outline-offset: 2px; \}/);
});

test('الأسطح: الصفحة الحالية والقسم الحالي صبغة صنوبرية بأيقونة طينية، والمقطع الحالي طيني، والمفاتيح بالطين', async () => {
  const base = read('src/ui/base.css');
  has(base, '.tj-topbar__link[aria-current="page"]', 'background: var(--tj-selected-section); color: var(--tj-selected-section-ink)');
  has(base, '.tj-topbar__link[aria-current="page"] .tj-icon', 'var(--tj-selected-section-icon)');
  has(base, '.tj-container--wide', 'max-width: 1200px');
  const st = read('src/pages/settings/settings.css');
  has(st, '.st-nav__link[aria-current="page"]', 'background: var(--tj-selected-section); color: var(--tj-selected-section-ink)');
  has(st, '.st-font:has(input:checked)', 'background: var(--tj-selected); color: var(--tj-selected-ink)');
  has(st, '.st-switch__input:checked + .st-switch__track', 'background: var(--tj-accent)');
  has(st, '.st-section', 'border-radius: var(--tj-radius-card-lg)');
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
  // في الرقاقة المختارة يرث العدّاد نص المختار (العاج على الصنوبر)، لا حبر الصفحة.
  assert.match(ownRule(ui, '.tj-chip[aria-pressed="true"] .tj-chip__count'), /color: inherit/);
});
