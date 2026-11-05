// محرّك UBA مبسّط منسوخ حرفيًا من سكربت DeepSeek (evidence/agents/ui/bidi.mjs، الأسطر 9–162) بعد قراءته كاملًا: دوال نقية بلا
// استيراد ولا وصول. يُعايَر في v05-bidi.mjs بحالات معروفة قبل استعماله.
const LRI = 0x2066, RLI = 0x2067, FSI = 0x2068, PDI = 0x2069;
function cls(ch) {
  const c = ch.codePointAt(0);
  if (c === LRI) return 'LRI'; if (c === RLI) return 'RLI'; if (c === FSI) return 'FSI'; if (c === PDI) return 'PDI';
  if (c === 0x200E) return 'L'; if (c === 0x200F) return 'R'; if (c === 0x061C) return 'AL';
  if (c >= 0x30 && c <= 0x39) return 'EN';
  if (c >= 0x06F0 && c <= 0x06F9) return 'EN';
  if ((c >= 0x0660 && c <= 0x0669) || c === 0x066B || c === 0x066C) return 'AN';
  if (ch === '+' || ch === '-' || c === 0x2212) return 'ES';
  if ('#$%°±‰'.includes(ch) || c === 0x066A) return 'ET';
  if (',.:/'.includes(ch) || c === 0x00A0 || c === 0x060C) return 'CS';
  if (ch === ' ' || (c >= 0x2000 && c <= 0x200A)) return 'WS';
  if (/\p{M}/u.test(ch)) return 'NSM';
  if (/\p{Script=Arabic}/u.test(ch) && /\p{L}|\p{Lo}/u.test(ch)) return 'AL';
  if (/[\u061B\u061F\u06D4]/.test(ch)) return 'AL';
  if (/\p{Script=Hebrew}/u.test(ch)) return 'R';
  if (/\p{L}/u.test(ch)) return 'L';
  return 'ON';
}
const MIRROR = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '«': '»', '»': '«', '‹': '›', '›': '‹', '<': '>', '>': '<' };
const OPEN = { '(': ')', '[': ']', '{': '}' };
const strongOf = (t) => (t === 'L' ? 'L' : t === 'R' || t === 'AL' || t === 'EN' || t === 'AN' ? 'R' : null);
const isNI = (t) => ['WS', 'ON', 'S', 'B', 'LRI', 'RLI', 'FSI', 'PDI'].includes(t);

/** اتجاه أول حرف قوي (P2/P3) متخطيًا محتوى العوازل. */
function firstStrong(chars, from = 0, to = chars.length) {
  let depth = 0;
  for (let i = from; i < to; i++) {
    const t = cls(chars[i]);
    if (t === 'LRI' || t === 'RLI' || t === 'FSI') { depth++; continue; }
    if (t === 'PDI') { if (depth) depth--; continue; }
    if (depth) continue;
    if (t === 'L') return 'ltr';
    if (t === 'R' || t === 'AL') return 'rtl';
  }
  return null;
}

/** يحل مستويات نص (بلا فواصل فقرة) عند مستوى أساس base، ويعيد مصفوفة مستويات بطول النص. */
function resolve(chars, base) {
  const n = chars.length;
  const levels = new Array(n).fill(base);
  // تقسيم العوازل: لكل عازل مطابق، يُحل محتواه بمستوى أعلى، ويعامَل العازل وPDI كـNI في التسلسل الخارجي.
  const types = chars.map(cls);
  const outer = []; // فهارس التسلسل الخارجي
  for (let i = 0; i < n; i++) {
    const t = types[i];
    if (t === 'LRI' || t === 'RLI' || t === 'FSI') {
      // ابحث عن PDI المطابق
      let depth = 1, j = i + 1;
      for (; j < n; j++) { const u = types[j]; if (u === 'LRI' || u === 'RLI' || u === 'FSI') depth++; else if (u === 'PDI' && --depth === 0) break; }
      const dir = t === 'LRI' ? 'ltr' : t === 'RLI' ? 'rtl' : (firstStrong(chars, i + 1, j) ?? 'ltr');
      const inner = dir === 'rtl' ? (base % 2 ? base + 2 : base + 1) : (base % 2 ? base + 1 : base + 2);
      const sub = resolve(chars.slice(i + 1, j), inner);
      sub.forEach((lv, k) => { levels[i + 1 + k] = lv; });
      outer.push(i); if (j < n) outer.push(j);
      i = j;
      continue;
    }
    outer.push(i);
  }
  const e = base % 2 ? 'R' : 'L';
  const sos = e, eos = e;
  const T = outer.map((i) => (['LRI', 'RLI', 'FSI', 'PDI'].includes(types[i]) ? 'ON' : types[i]));
  // W1
  for (let k = 0; k < T.length; k++) if (T[k] === 'NSM') T[k] = k ? (['LRI', 'RLI', 'FSI', 'PDI'].includes(types[outer[k - 1]]) ? 'ON' : T[k - 1]) : sos;
  // W2
  let last = sos;
  for (let k = 0; k < T.length; k++) { if (['L', 'R', 'AL'].includes(T[k])) last = T[k]; else if (T[k] === 'EN' && last === 'AL') T[k] = 'AN'; }
  // W3
  for (let k = 0; k < T.length; k++) if (T[k] === 'AL') T[k] = 'R';
  // W4
  for (let k = 1; k < T.length - 1; k++) {
    if (T[k] === 'ES' && T[k - 1] === 'EN' && T[k + 1] === 'EN') T[k] = 'EN';
    else if (T[k] === 'CS' && T[k - 1] === 'EN' && T[k + 1] === 'EN') T[k] = 'EN';
    else if (T[k] === 'CS' && T[k - 1] === 'AN' && T[k + 1] === 'AN') T[k] = 'AN';
  }
  // W5
  for (let k = 0; k < T.length; k++) {
    if (T[k] !== 'ET') continue;
    let a = k; while (a < T.length && T[a] === 'ET') a++;
    const adj = (k > 0 && T[k - 1] === 'EN') || (a < T.length && T[a] === 'EN');
    if (adj) for (let m = k; m < a; m++) T[m] = 'EN';
    k = a - 1;
  }
  // W6
  for (let k = 0; k < T.length; k++) if (['ES', 'ET', 'CS'].includes(T[k])) T[k] = 'ON';
  // W7
  last = sos;
  for (let k = 0; k < T.length; k++) { if (T[k] === 'L' || T[k] === 'R') last = T[k]; else if (T[k] === 'EN' && last === 'L') T[k] = 'L'; }
  // N0 الأقواس
  const stack = []; const pairs = [];
  for (let k = 0; k < T.length; k++) {
    const ch = chars[outer[k]];
    if (T[k] !== 'ON') continue;
    if (OPEN[ch]) stack.push({ k, close: OPEN[ch] });
    else if (Object.values(OPEN).includes(ch)) {
      for (let s = stack.length - 1; s >= 0; s--) if (stack[s].close === ch) { pairs.push([stack[s].k, k]); stack.length = s; break; }
    }
  }
  pairs.sort((a, b) => a[0] - b[0]);
  for (const [o, c] of pairs) {
    let found = null;
    for (let k = o + 1; k < c; k++) { const s = strongOf(T[k]); if (s === e) { found = 'e'; break; } if (s) found = found ?? 'opp'; }
    if (!found) continue;
    let dir = e;
    if (found === 'opp') {
      let ctx = sos; for (let k = o - 1; k >= 0; k--) { const s = strongOf(T[k]); if (s) { ctx = s; break; } }
      dir = ctx !== e ? (e === 'L' ? 'R' : 'L') : e;
    }
    T[o] = dir; T[c] = dir;
  }
  // N1/N2
  for (let k = 0; k < T.length; k++) {
    if (!isNI(T[k])) continue;
    let a = k; while (a < T.length && isNI(T[a])) a++;
    let before = sos; for (let m = k - 1; m >= 0; m--) { const s = strongOf(T[m]); if (s) { before = s; break; } }
    let after = eos; for (let m = a; m < T.length; m++) { const s = strongOf(T[m]); if (s) { after = s; break; } }
    const d = before === after ? before : e;
    for (let m = k; m < a; m++) T[m] = d;
    k = a - 1;
  }
  // I1/I2
  outer.forEach((i, k) => {
    const t = T[k];
    if (base % 2 === 0) levels[i] = t === 'R' ? base + 1 : (t === 'AN' || t === 'EN') ? base + 2 : base;
    else levels[i] = (t === 'L' || t === 'EN' || t === 'AN') ? base + 1 : base;
  });
  return levels;
}

/** ترتيب العرض البصري (من اليسار) لسطر بفقرة اتجاهها dir. */
export function visual(text, dir) {
  const chars = Array.from(text);
  const base = dir === 'rtl' ? 1 : 0;
  const levels = resolve(chars, base);
  const order = chars.map((_, i) => i);
  const max = Math.max(...levels);
  const minOdd = Math.min(...levels.filter((l) => l % 2 === 1).concat([max + 1]));
  for (let lv = max; lv >= minOdd; lv--) {
    for (let i = 0; i < order.length; i++) {
      if (levels[order[i]] < lv) continue;
      let j = i; while (j < order.length && levels[order[j]] >= lv) j++;
      const seg = order.slice(i, j).reverse();
      order.splice(i, j - i, ...seg);
      i = j;
    }
  }
  return order.map((i) => {
    const ch = chars[i];
    if ([LRI, RLI, FSI, PDI].includes(ch.codePointAt(0))) return '';
    return levels[i] % 2 && MIRROR[ch] ? MIRROR[ch] : ch;
  }).join('');
}
