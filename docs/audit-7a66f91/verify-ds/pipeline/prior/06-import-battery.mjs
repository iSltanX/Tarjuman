// TJ-AUD-012، L-9، L-10، L-11 (المحلّل المتسامح)، وE-9 (الترميز)، وL-8 (اسم الملف المدمج)، ودورة تصدير→استيراد لنص فيه «-->».
import { TJ_ROOT as T } from '../../../verify/_root.mjs';
const { parseSrtLenient } = await import(`${T}/src/core/srt/lenient.js`);
const { readImport } = await import(`${T}/src/core/import/index.js`);
const { readFileText } = await import(`${T}/src/core/import/read-file.js`);
const { convertTrack } = await import(`${T}/src/core/convert/index.js`);
const { buildExport } = await import(`${T}/src/core/export/index.js`);
const P = (s) => { try { const r = parseSrtLenient(s); return { ok: true, cues: r.cues.map((c) => [c.n, c.text]), notes: r.notes.length, warnings: r.warnings.map((w) => w.code) }; } catch (e) { return { err: e.code, line: e.params?.line }; } };
const head = (n, a, b) => `${n}\n00:00:0${a},000 --> 00:00:0${b},000`;
console.log('== TJ-AUD-012');
for (const [label, s] of [
  ['سطر نص «1 --> 2»', `${head(1, 1, 2)}\nالخطوة\n1 --> 2\n\n${head(2, 3, 4)}\nب\n`],
  ['سطر نص «2020 --> 2025»', `${head(1, 1, 2)}\n2020 --> 2025\n\n${head(2, 3, 4)}\nب\n`],
  ['سطر نص «١ --> ٢» بأرقام هندية', `${head(1, 1, 2)}\n١ --> ٢\n\n${head(2, 3, 4)}\nب\n`],
  ['سطر نص «من 1 --> 2» (لا يبدأ برقم)', `${head(1, 1, 2)}\nمن 1 --> 2\n\n${head(2, 3, 4)}\nب\n`],
  ['سطر نص «x --> y»', `${head(1, 1, 2)}\nx --> y\n\n${head(2, 3, 4)}\nب\n`],
]) console.log(' ', label, JSON.stringify(P(s)));
// هل يصدّر ترجمان الإنجليزي نفسه سطرًا كهذا؟ يدوي بنص «1 --> 2»
{
  const body = JSON.stringify({ events: [{ tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: 'step\n1 --> 2' }] }, { tStartMs: 3000, dDurationMs: 1000, segs: [{ utf8: 'next' }] }] });
  const c = convertTrack({ body, trackKind: 'manual', durationMs: 60000 });
  const ex = buildExport({ videoId: 'AAAAAAAAAAA', track: { key: 'en|manual', lang: 'en', kind: 'manual', cues: c.cues }, mode: 'normal', now: '2026-11-01T00:00:00.000Z', rand: () => 0.5 });
  const srt = ex.files ? ex.files[0].text : ex.text ?? ex.file?.text;
  console.log('  تحويل json3 فيه «1 --> 2» ينجح:', c.ok, '| إعادة استيراد ملف ترجمان الإنجليزي نفسه:', JSON.stringify(P(srt ?? c.srt)));
}
console.log('== L-9 (سياج وسط الملف)');
for (const [label, s] of [
  ['كتلتان متلاصقتان بلا سطر فارغ', '```srt\n' + `${head(1, 1, 2)}\nأ\n\`\`\`\n\`\`\`srt\n${head(2, 3, 4)}\nب\n\`\`\`\n`],
  ['كتلتان بينهما سطر فارغ', '```srt\n' + `${head(1, 1, 2)}\nأ\n\n\`\`\`\n\n\`\`\`srt\n${head(2, 3, 4)}\nب\n\`\`\`\n`],
  ['كتلتان: سياج ملتصق ثم سطر فارغ', '```srt\n' + `${head(1, 1, 2)}\nأ\n\`\`\`\n\n\`\`\`srt\n${head(2, 3, 4)}\nب\n\`\`\`\n`],
]) console.log(' ', label, JSON.stringify(P(s)));
console.log('== L-10 (نثر قبل الملف وبعده)');
for (const [label, s] of [
  ['نثر فيه زمن قبل الملف', `إليك الترجمة من 0:00:01 حتى النهاية:\n\n${head(1, 1, 2)}\nأ\n\n${head(2, 3, 4)}\nب\n`],
  ['النثر نفسه بعد الملف', `${head(1, 1, 2)}\nأ\n\n${head(2, 3, 4)}\nب\n\nإليك الترجمة من 0:00:01 حتى النهاية:\n`],
  ['نثر فيه «-->» قبل الملف', `الصيغة: رقم ثم زمن --> زمن\n\n${head(1, 1, 2)}\nأ\n`],
  ['نثر بلا زمن قبل الملف', `إليك الترجمة:\n\n${head(1, 1, 2)}\nأ\n`],
  ['رقم وحيد قبل الملف', `7\n\n${head(1, 1, 2)}\nأ\n`],
]) console.log(' ', label, JSON.stringify(P(s)));
console.log('== L-11 (فواصل عربية وأسهم)');
for (const [label, s] of [
  ['فاصلة عشرية عربية ٫', `1\n00:00:01٫000 --> 00:00:02٫000\nأ\n\n2\n00:00:03٫000 --> 00:00:04٫000\nب\n`],
  ['فاصلة عربية ،', `1\n00:00:01،000 --> 00:00:02،000\nأ\n\n2\n00:00:03،000 --> 00:00:04،000\nب\n`],
  ['أرقام هندية مع ٫', `١\n٠٠:٠٠:٠١٫٠٠٠ --> ٠٠:٠٠:٠٢٫٠٠٠\nأ\n\n٢\n٠٠:٠٠:٠٣٫٠٠٠ --> ٠٠:٠٠:٠٤٫٠٠٠\nب\n`],
  ['أرقام هندية مع , (مقبولة)', `١\n٠٠:٠٠:٠١,٠٠٠ --> ٠٠:٠٠:٠٢,٠٠٠\nأ\n`],
  ['سهم →', `1\n00:00:01,000 → 00:00:02,000\nأ\n\n2\n00:00:03,000 → 00:00:04,000\nب\n`],
  ['سهم ->', `1\n00:00:01,000 -> 00:00:02,000\nأ\n\n2\n00:00:03,000 -> 00:00:04,000\nب\n`],
  ['سهم –> (شرطة طويلة)', `1\n00:00:01,000 —> 00:00:02,000\nأ\n\n2\n00:00:03,000 —> 00:00:04,000\nب\n`],
  ['سهم واحد → في ملف واحد مقطع', `1\n00:00:01,000 → 00:00:02,000\nأ\n`],
]) console.log(' ', label, JSON.stringify(P(s)));
console.log('== E-9 (ترميز)');
const fileOf = (bytes, name = 'x.srt') => ({ name, size: bytes.byteLength, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
const sample = '1\n00:00:01,000 --> 00:00:02,000\nمرحبا\n';
const u16le = (s, bom) => { const b = new Uint8Array((bom ? 2 : 0) + s.length * 2); let o = 0; if (bom) { b[0] = 0xff; b[1] = 0xfe; o = 2; } for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); b[o + 2 * i] = c & 0xff; b[o + 2 * i + 1] = c >> 8; } return b; };
const u16be = (s, bom) => { const b = new Uint8Array((bom ? 2 : 0) + s.length * 2); let o = 0; if (bom) { b[0] = 0xfe; b[1] = 0xff; o = 2; } for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); b[o + 2 * i] = c >> 8; b[o + 2 * i + 1] = c & 0xff; } return b; };
for (const [label, bytes] of [['UTF-16LE مع BOM', u16le(sample, true)], ['UTF-16LE بلا BOM', u16le(sample, false)], ['UTF-16BE مع BOM', u16be(sample, true)], ['UTF-16BE بلا BOM', u16be(sample, false)], ['Windows-1256 (بايتات >0x7F)', new Uint8Array([0x31, 0x0a, 0xc7, 0xe1])]]) {
  const r = await readFileText(fileOf(bytes)).then(() => 'قُبل', (e) => e.code);
  console.log(' ', label, r);
}
console.log('== L-8 (اسم الملف بعد دمج الأجزاء)');
const srtPart = (from, to) => Array.from({ length: to - from + 1 }, (_, k) => `${from + k}\n00:00:${String(from + k).padStart(2, '0')},000 --> 00:00:${String(from + k).padStart(2, '0')},500\nنص ${from + k}\n`).join('\n');
const enc = (s) => new TextEncoder().encode(s);
for (const names of [
  ['iG9CE55wbtY.en.manual.normal.part01of02.ar.srt', 'iG9CE55wbtY.en.manual.normal.part02of02.ar.srt'],
  ['iG9CE55wbtY.ar.manual.normal.part01of02.srt', 'iG9CE55wbtY.ar.manual.normal.part02of02.srt'],
  ['translation_part1.srt', 'translation_part2.srt'],
]) {
  const r = await readImport([fileOf(enc(srtPart(1, 3)), names[0]), fileOf(enc(srtPart(4, 6)), names[1])]);
  console.log(' ', names[0], '→', r.ok ? r.fileName : JSON.stringify(r.error));
}
