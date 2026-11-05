// PLY-05 على عيّنة TED الحقيقية: كم سطرًا إنجليزيًا ينتقل إلى فقرة أخرى عند إزاحات شائعة.
import { readFileSync } from 'node:fs';
import { TJ_ROOT as T } from '../_root.mjs';
const { convertTrack } = await import(`${T}/src/core/convert/index.js`);
const { buildStudyText, studyTiming } = await import(`${T}/src/core/export/index.js`);
const en = convertTrack({ body: readFileSync(`${T}/test/fixtures/json3/manual-ted-iG9CE55wbtY.json`, 'utf8'), trackKind: 'manual', durationMs: 1203421 }).cues;
const english = en.map((c) => ({ ...c, text: `E${c.n}` }));
const arabic = en.map((c) => ({ ...c, text: `ع${c.n}` }));
const pairing = (offset) => {
  const { cues } = studyTiming(arabic, offset);
  const text = buildStudyText({ videoId: 'iG9CE55wbtY', cues, english, format: 'txt', bilingual: true }).text.split('\n');
  const map = new Map();
  for (let i = 0; i < text.length; i++) if (/^ع\d/.test(text[i])) { const ar = text[i].match(/ع(\d+)/g).map((x) => +x.slice(1)); const enl = /^E\d/.test(text[i + 1] ?? '') ? text[i + 1].match(/E(\d+)/g).map((x) => +x.slice(1)) : []; for (const n of enl) map.set(n, ar[0]); }
  return map;
};
const base = pairing(0);
let wrongAt0 = 0; // E_n في فقرة لا تحوي ع_n عند الصفر
for (const offset of [0, 500, 1000, 2000, -1000, -2000]) {
  const p = pairing(offset);
  let moved = 0; for (const [n, para] of p) if (base.get(n) !== para) moved++;
  console.log(`offset=${offset}ms: سطور إنجليزية انتقلت عن فقرة الصفر = ${moved} من ${english.length}`);
}
