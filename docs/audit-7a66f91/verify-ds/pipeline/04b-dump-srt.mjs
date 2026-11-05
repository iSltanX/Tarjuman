// يكتب ملفي التصدير العربي من TJ-24 (أ وب) إلى مجلد العمل لقراءتهما بـffmpeg محليًا.
import { writeFileSync } from 'node:fs';
import { mod } from './lib.mjs';
import { scratchDir } from '../../verify/_root.mjs';
const { planArabicExport } = await mod('core/edit/export.js');
const OUT = scratchDir('verify-ds-pipeline', 'srt-out');
const two = (t1) => [{ n: 1, startMs: 1000, endMs: 2000, text: t1 }, { n: 2, startMs: 3000, endMs: 4000, text: 'المقطع الثاني' }];
for (const [name, t1] of [['a-header-in-text', 'انسخ هذا:\n2\n00:00:05,000 --> 00:00:06,000\nنص مدسوس'], ['b-arrow-in-text', 'الخطوة\n1 --> 2']]) {
  const p = planArabicExport({ videoId: 'iG9CE55wbtY', cues: two(t1), offsetMs: 0 });
  writeFileSync(`${OUT}/${name}.srt`, p.text);
}
console.log('written');
