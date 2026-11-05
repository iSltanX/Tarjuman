// TJ-31 (PIPE-10) وTJ-33 (PIPE-12) ← U38، ومعها اقتراحات FINDINGS §٧ غير المنقولة (4 و5 و6): المحلل المتسامح وقراءة الملف.
import { mod, out, fileOf } from './lib.mjs';
const { parseSrtLenient } = await mod('core/srt/lenient.js');
const { readImport } = await mod('core/import/index.js');
const { readFileText } = await mod('core/import/read-file.js');
const P = (s) => { try { const r = parseSrtLenient(s); return { ok: true, cues: r.cues.map((c) => [c.n, c.startMs, c.text]), warnings: r.warnings }; } catch (e) { return { err: e.code, line: e.params?.line }; } };
const T1 = '00:00:01,000 --> 00:00:02,000';
console.log('== TJ-31: زمن سالب');
out('مقطع وحيد بزمن سالب', P(`1\n-${T1}\nأ\n`));
out('المقطع الثاني من اثنين بزمن سالب', P(`1\n${T1}\nأ\n\n2\n-00:00:03,000 --> 00:00:04,000\nب\n`));
out('المقطع الثاني من ثلاثة بزمن سالب', P(`1\n${T1}\nأ\n\n2\n-00:00:03,000 --> 00:00:04,000\nب\n\n3\n00:00:05,000 --> 00:00:06,000\nج\n`));
out('ناقص الطباعة U+2212', P(`1\n${T1}\nأ\n\n2\n−00:00:03,000 --> 00:00:04,000\nب\n\n3\n00:00:05,000 --> 00:00:06,000\nج\n`));
out('نهاية سالبة', P(`1\n00:00:01,000 --> -00:00:02,000\nأ\n`));
out('للمقارنة (U38): سهم →', P(`1\n00:00:01,000 → 00:00:02,000\nأ\n\n2\n00:00:03,000 → 00:00:04,000\nب\n`));
console.log('== TJ-33: UTF-16 بلا BOM');
const ar = `1\n${T1}\nمرحبًا\n`;
const le = (s, bom) => { const b = []; if (bom) b.push(0xff, 0xfe); for (const c of s) { const u = c.charCodeAt(0); b.push(u & 0xff, u >> 8); } return new Uint8Array(b); };
const be = (s, bom) => { const b = []; if (bom) b.push(0xfe, 0xff); for (const c of s) { const u = c.charCodeAt(0); b.push(u >> 8, u & 0xff); } return new Uint8Array(b); };
for (const [label, bytes] of [['UTF-16LE مع BOM', le(ar, true)], ['UTF-16LE بلا BOM', le(ar, false)], ['UTF-16BE مع BOM', be(ar, true)], ['UTF-16BE بلا BOM', be(ar, false)], ['UTF-16LE بلا BOM، نص لاتيني فقط', le(`1\n${T1}\nhello\n`, false)]]) {
  const r = await readImport(fileOf(bytes, 'x.srt'));
  out(label, r.ok ? 'ok' : r.error.code);
}
console.log('== اقتراحات FINDINGS §٧ غير المنقولة');
out('(4) آخر سطر في النص رقم وفُقد رقم المقطع التالي', P(`1\n${T1}\nالعام\n2020\n00:00:03,000 --> 00:00:04,000\nب\n`));
out('(6) سطر نص «10:30 --> 11:00»', P(`1\n${T1}\nالموعد\n10:30 --> 11:00\n\n2\n00:00:03,000 --> 00:00:04,000\nب\n`));
{
  const part = (from, n) => Array.from({ length: n }, (_, i) => `${from + i}\n00:00:${String(from + i).padStart(2, '0')},000 --> 00:00:${String(from + i).padStart(2, '0')},500\nن${from + i}\n`).join('\n');
  for (const names of [['counterpart1.ar.srt', 'counterpart2.ar.srt'], ['VID.ar.manual.normal.part01of02.srt', 'VID.ar.manual.normal.part02of02.srt']]) {
    const r = await readImport([fileOf(part(1, 3), names[0]), fileOf(part(4, 3), names[1])]);
    out(`(5)/U38: اسم الدمج لـ${names.join(' + ')}`, r.ok ? r.fileName : r.error.code);
  }
}
