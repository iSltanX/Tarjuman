// PLY-07: readPatch يقرأ كل الملفات ويجمع مقاطعها ويرتبها قبل كشف التكرار، وبلا حد تراكمي لعدد المقاطع.
import { readFileSync } from 'node:fs';
import { TJ, imp, log } from './common.mjs';
const { readPatch, readImport } = await imp('src/core/import/index.js');
const { fingerprint, englishTrack, makeCues } = await imp('test/helpers/fixtures.js');

const fp = fingerprint({ track: englishTrack({ cues: makeCues(2) }) });
const srt = (cues) => cues.map((c) => `${c.n}\n${t(c.startMs)} --> ${t(c.endMs)}\nنص ${c.n}\n`).join('\n');
const t = (ms) => { const z = (n, w = 2) => String(n).padStart(w, '0'); return `${z(Math.floor(ms / 3600000))}:${z(Math.floor(ms / 60000) % 60)}:${z(Math.floor(ms / 1000) % 60)},${z(ms % 1000, 3)}`; };
const body = srt(makeCues(2));
let reads = 0;
const files = Array.from({ length: 50 }, (_, i) => ({ name: `part${i + 1}.ar.srt`, size: body.length * 2, arrayBuffer: async () => { reads++; return new TextEncoder().encode(body).buffer; } }));
const r = await readPatch(files, { fingerprint: fp, cues: makeCues(2) });
log('readPatch بخمسين ملفًا مكررًا: قراءات arrayBuffer =', reads, '| النتيجة =', r.ok ? 'ok' : r.error.code);
const src = readFileSync(`${TJ}/src/core/import/patch.js`, 'utf8');
log('حد تراكمي للمقاطع في readPatch؟', /maxCues|IM_TOO_MANY_CUES/.test(src), '| مقابل readImport (index.js:63-67):', /total > LIMITS\.maxCues/.test(readFileSync(`${TJ}/src/core/import/index.js`, 'utf8')));
// تجاوز عدد البصمة: ملف ثانٍ يحمل أرقامًا خارج المرجع يُكتشف بعد قراءة الكل أيضًا
reads = 0;
const big = srt(makeCues(400));
const files2 = Array.from({ length: 20 }, (_, i) => ({ name: `p${i}.srt`, size: big.length * 2, arrayBuffer: async () => { reads++; return new TextEncoder().encode(big).buffer; } }));
const r2 = await readPatch(files2, { fingerprint: fp, cues: makeCues(2) });
log('عشرون ملفًا بأرقام 1..400 لمرجع من مقطعين: قراءات =', reads, '| النتيجة =', r2.ok ? 'ok' : r2.error.code);
log('مستدعو readPatch خارج core:', 'src/pages/editor/app.js:926 (المحرّر وحده، لا المشغّل)');
