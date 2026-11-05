// حساب: سطر سبب البند المعطّل في القائمة المنسدلة (.tj-menu__hint بالخافت داخل بند opacity 0.55) فوق البطاقة، بالوضعين.
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const L = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
const hx = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (fg, a, bg) => fg.map((c, i) => c * a + bg[i] * (1 - a));
const ratio = (a, b) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
for (const [mode, muted, text, surface] of [['فاتح', '#666165', '#221C21', '#FEFEFD'], ['داكن', '#939192', '#F1EDEF', '#1E1D1E']]) {
  const s = hx(surface);
  console.log(`${mode}: السبب (muted×0.55) = ${ratio(mix(hx(muted), 0.55, s), s).toFixed(2)}:1 | التسمية (text×0.55) = ${ratio(mix(hx(text), 0.55, s), s).toFixed(2)}:1`);
}
