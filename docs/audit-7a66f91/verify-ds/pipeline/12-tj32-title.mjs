// TJ-32 (PIPE-11): ما يبقى بعد cleanTitle من محارف Cf ومن Default_Ignorable_Code_Point (مسح كل نقاط Unicode).
import { mod, out } from './lib.mjs';
const { cleanTitle } = await mod('core/export/instructions.js');
const cf = /\p{Cf}/u; const di = /\p{Default_Ignorable_Code_Point}/u; const cc = /\p{Cc}/u;
const kept = { Cf: [], DIonly: [], Cc: [] };
for (let cp = 0; cp <= 0x10ffff; cp++) {
  if (cp >= 0xd800 && cp <= 0xdfff) continue;
  const ch = String.fromCodePoint(cp);
  const isCf = cf.test(ch); const isDi = di.test(ch); const isCc = cc.test(ch);
  if (!isCf && !isDi && !isCc) continue;
  const r = cleanTitle(`a${ch}b`);
  if (r === 'ab' || r === 'a b') continue; // جُرّد (أو صار مسافة كفواصل الأسطر)
  const hex = `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
  if (isCc) kept.Cc.push(hex); else if (isCf) kept.Cf.push(hex); else kept.DIonly.push(hex);
}
const ranges = (list) => { const o = []; let s = null; let p = null; for (const h of list) { const v = parseInt(h.slice(2), 16); if (s !== null && v === p + 1) { p = v; continue; } if (s !== null) o.push(s === p ? `U+${s.toString(16).toUpperCase()}` : `U+${s.toString(16).toUpperCase()}–${p.toString(16).toUpperCase()}`); s = v; p = v; } if (s !== null) o.push(s === p ? `U+${s.toString(16).toUpperCase()}` : `U+${s.toString(16).toUpperCase()}–${p.toString(16).toUpperCase()}`); return o; };
out('Cc الباقية', ranges(kept.Cc));
out('Cf الباقية', ranges(kept.Cf));
out('Default_Ignorable غير Cf الباقية', ranges(kept.DIonly));
out('مثال', JSON.stringify(cleanTitle('Talk\u{13430}\u{1BCA0} title')));
