// تحقق مستقل: DS-TJ-45. نسب التباين محسوبة هنا من قيم tokens.css نفسها (WCAG 2.x، عتبة sRGB 0.04045)، بالوضعين، وبمقارنة
// كتلتي الداكن (prefers-color-scheme وdata-theme) ورموز اللوحة player/panel/tokens.js.
import { T, imp, log } from './common.mjs';
import { readFileSync } from 'node:fs';

const css = readFileSync(`${T}/src/ui/tokens.css`, 'utf8');
function block(re) {
  const m = re.exec(css);
  let i = css.indexOf('{', m.index) + 1; let d = 1; const s = i;
  while (d) { if (css[i] === '{') d++; else if (css[i] === '}') d--; i++; }
  return Object.fromEntries([...css.slice(s, i - 1).matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map((x) => [x[1], x[2].trim()]));
}
const light = block(/^:root \{/m);
const darkMedia = block(/:root:not\(\[data-theme="light"\]\) \{/);
const darkAttr = block(/^:root\[data-theme="dark"\] \{/m);
const dark = { ...light, ...darkAttr };
const hex = (v) => { const m = /^#([0-9a-f]{6})$/i.exec(v); if (!m) return null; return [0, 2, 4].map((k) => parseInt(m[1].slice(k, k + 2), 16)); };
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const L = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const val = (vars, name) => { let v = vars[name]; for (let i = 0; i < 5 && v?.startsWith('var('); i++) v = vars[v.slice(6, -1)]; return v; };

const same = ['muted', 'selected-soft', 'brand-soft', 'text-2'].map((k) => `${k}: ${darkMedia[`tj-${k}`]} / ${darkAttr[`tj-${k}`]}`);
log(`كتلتا الداكن: ${same.join(' | ')}`);
const pairs = [
  ['tj-muted', 'tj-selected-soft', 'البطاقة النشطة (.tj-caption 13px، .lib-prevl 12px) + صف المحرّر المحدد (.ed-row__n 12px، .ed-row__dur، .ed-row__en 13px)'],
  ['tj-muted', 'tj-brand-soft', 'صف اللوحة الحالي .en 12px + صف المحفوظات المقصود .lib-row--target'],
  ['tj-text-2', 'tj-selected-soft', 'البديل المقترح (.lib-card__file، text-2)'],
  ['tj-warning', 'tj-selected-soft', '.ed-row__msg (13px) في صف محدد'],
  ['tj-danger', 'tj-selected-soft', '.ed-row__msg--error / حذف… في البطاقة النشطة'],
  ['tj-brand-text', 'tj-selected-soft', 'استعادة السابقة (.lib-prevl__restore)'],
  ['tj-muted', 'tj-surface', 'للمقارنة: الخافت على البطاقة'],
  ['tj-muted', 'tj-surface-2', 'للمقارنة: الخافت على surface-2'],
];
for (const [mode, vars] of [['فاتح', light], ['داكن', dark]]) {
  for (const [fg, bg, where] of pairs) {
    const f = val(vars, fg); const b = val(vars, bg);
    const r = ratio(hex(f), hex(b));
    log(`${mode} | ${fg} ${f} على ${bg} ${b} = ${r.toFixed(2)}:1 ${r < 4.5 ? '(< 4.5)' : ''} | ${where}`);
  }
}
const PT = await imp('src/player/panel/tokens.js');
const tok = PT.PANEL_TOKENS ?? PT.default ?? PT;
log(`رموز اللوحة: ${JSON.stringify(Object.keys(PT))}`);
