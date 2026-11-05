// TJ-46، جزء rows.js:188: «(+N)» بعد رسالة عربية بلا عزل. محاكاة UBA مبسّطة (UAX #9) للأصناف الموجودة في هذه الأسطر وحدها:
// AL (عربي)، EN (أرقام لاتينية)، ES (+)، CS (.)، WS، ON (أقواس ونقطتان)، وعزل LRI…PDI. فقرة RTL (المستوى 1). ثم L2 وL4 (المرآة).
import { ROOT, log } from './harness.mjs';

const LRI = '⁦';
const PDI = '⁩';
const cls = (ch) => {
  if (ch === LRI) return 'LRI';
  if (ch === PDI) return 'PDI';
  if (/[؀-ۿ]/.test(ch)) return 'AL';
  if (/[0-9]/.test(ch)) return 'EN';
  if (ch === '+' || ch === '-' || ch === '−') return ch === '−' ? 'ES' : 'ES';
  if (ch === '.' || ch === ',' || ch === ':') return ch === ':' ? 'CS' : 'CS';
  if (ch === ' ') return 'WS';
  if (/[A-Za-z]/.test(ch)) return 'L';
  return 'ON';
};
const strongDir = (t) => (t === 'L' ? 'L' : t === 'R' || t === 'AL' || t === 'EN' || t === 'AN' ? 'R' : null);

/** يحل سلسلة تشغيل معزولة واحدة بمستوى level (W1–W7، N1–N2، I1–I2). */
function resolveRun(types, level) {
  const sos = level % 2 ? 'R' : 'L';
  const t = types.slice();
  const n = t.length;
  // W2: EN بعد AL يصير AN
  for (let i = 0; i < n; i++) if (t[i] === 'EN') { for (let j = i - 1; j >= -1; j--) { const s = j < 0 ? sos : t[j]; if (['L', 'R', 'AL'].includes(s)) { if (s === 'AL') t[i] = 'AN'; break; } } }
  for (let i = 0; i < n; i++) if (t[i] === 'AL') t[i] = 'R'; // W3
  for (let i = 1; i < n - 1; i++) { // W4
    if (t[i] === 'ES' && t[i - 1] === 'EN' && t[i + 1] === 'EN') t[i] = 'EN';
    else if (t[i] === 'CS' && t[i - 1] === t[i + 1] && (t[i - 1] === 'EN' || t[i - 1] === 'AN')) t[i] = t[i - 1];
  }
  for (let i = 0; i < n; i++) if (t[i] === 'ES' || t[i] === 'CS') t[i] = 'ON'; // W6
  for (let i = 0; i < n; i++) if (t[i] === 'EN') { for (let j = i - 1; j >= -1; j--) { const s = j < 0 ? sos : t[j]; if (s === 'L' || s === 'R') { if (s === 'L') t[i] = 'L'; break; } } } // W7
  const isNI = (x) => ['WS', 'ON', 'LRI', 'PDI'].includes(x);
  for (let i = 0; i < n;) { // N1/N2
    if (!isNI(t[i])) { i++; continue; }
    let j = i;
    while (j < n && isNI(t[j])) j++;
    const before = i === 0 ? sos : strongDir(t[i - 1]);
    const after = j === n ? sos : strongDir(t[j]);
    const dir = before === after ? before : sos;
    for (let k = i; k < j; k++) t[k] = dir;
    i = j;
  }
  return t.map((x) => (level % 2 ? (x === 'L' || x === 'EN' || x === 'AN' ? level + 1 : level) : (x === 'R' ? level + 1 : x === 'AN' || x === 'EN' ? level + 2 : level)));
}

function visual(str) {
  const chars = [...str];
  const types = chars.map(cls);
  const levels = new Array(chars.length);
  // العزل: ما بين LRI وPDI سلسلة LTR بمستوى 2، وLRI وPDI نفساهما محايدان في السلسلة الخارجية.
  const outerIdx = [];
  for (let i = 0; i < chars.length; i++) {
    if (types[i] === 'LRI') {
      const end = types.indexOf('PDI', i);
      const inner = [];
      for (let k = i + 1; k < end; k++) inner.push(k);
      resolveRun(inner.map((k) => types[k]), 2).forEach((lv, q) => (levels[inner[q]] = lv));
      outerIdx.push(i, end);
      i = end;
    } else outerIdx.push(i);
  }
  resolveRun(outerIdx.map((k) => types[k]), 1).forEach((lv, q) => (levels[outerIdx[q]] = lv));
  // L2
  const order = chars.map((_, i) => i);
  const max = Math.max(...levels);
  for (let lv = max; lv >= 1; lv--) {
    for (let i = 0; i < order.length;) {
      if (levels[order[i]] < lv) { i++; continue; }
      let j = i;
      while (j < order.length && levels[order[j]] >= lv) j++;
      order.splice(i, j - i, ...order.slice(i, j).reverse());
      i = j;
    }
  }
  const mirror = { '(': ')', ')': '(' };
  return order.map((i) => (levels[i] % 2 && mirror[chars[i]] ? mirror[chars[i]] : chars[i])).filter((c) => c !== LRI && c !== PDI).join('');
}

const { ltrInline, offsetInline } = await import(`${ROOT}/src/ui/format.js`);
const msg = 'التوقيت متداخل مع المقطع 2';
for (const [label, s] of [
  ['rows.js:188 كما هو', `${msg} (+2)`],
  ['معزولًا بـltrInline (اقتراح)', `${msg} (${ltrInline('+2')})`],
  ['ضابط CL-001: الإزاحة بلا عزل', 'الإزاحة +0.5 ث'],
  ['ضابط CL-001: offsetInline', `الإزاحة ${offsetInline(500)} ث`],
]) {
  log(`${label}: المنطقي ${JSON.stringify(s.replace(/[⁦⁩]/g, ''))} ⇒ العرض من اليسار إلى اليمين: ${JSON.stringify(visual(s))}`);
}
