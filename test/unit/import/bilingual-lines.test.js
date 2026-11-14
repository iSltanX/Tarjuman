// تحقق 2.3.0 (ص-١٨، بقرار سلطان): شرط «سطران فأكثر» في حارس الملف الثنائي (bilingualCheck، IM_BILINGUAL) كان بلا حارس: حذفه ينجو من
// الاختبارات كلها. وأثره أن ملفًا أكثره غير مترجم (مقطع بسطر واحد هو نص الأصل) يُعلَن «مصدَّرًا مع الأصل»، فيُفرَّغ مقطعه بزر الإزالة
// بدل أن يظهر تحذير «غير مترجم». المقطع ذو السطر الواحد شأن فحص «غير مترجم»، لا الحارس.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bilingualCheck, readImport } from '../../../src/core/import/index.js';
import { formatSrtTime } from '../../../src/core/srt/time.js';
import { englishTrack, fingerprint } from '../../helpers/fixtures.js';
import { fileOf } from '../../fixtures/srt/index.js';

const VIDEO = 'iG9CE55wbtY';
const cue = (n, startMs, endMs, text) => ({ n, startMs, endMs, text });
const EN = Array.from({ length: 8 }, (_, i) => cue(i + 1, 1000 + i * 3000, 3500 + i * 3000, `Line ${i + 1} & more`));
const TRACK = englishTrack({ cues: EN });
const FP = fingerprint({ videoId: VIDEO, track: TRACK });
const srtOf = (cues) => cues.map((c, i) => `${i + 1}\n${formatSrtTime(c.startMs)} --> ${formatSrtTime(c.endMs)}\n${c.text}\n`).join('\n');

test('سطران فأكثر: ملف أكثره غير مترجم بسطر واحد هو نص الأصل لا يُعلَن ثنائيًا، والملف المصدَّر مع الأصل يُعلَن', async () => {
  // ستة من ثمانية بسطر واحد هو نص الأصل حرفيًا (غير مترجمة)، ومقطعان مترجمان بسطر واحد.
  const untranslated = EN.map((c, i) => (i < 6 ? c : { ...c, text: `السطر ${c.n}` }));
  assert.equal(bilingualCheck(untranslated, [TRACK]), null, 'السطر الواحد لا يُعدّ ولو طابق الأصل');
  const r = await readImport(fileOf(srtOf(untranslated), 'talk.ar.srt'), { fingerprints: [FP], originals: [TRACK] });
  assert.equal(r.ok, true);
  assert.equal(r.bilingual, null, 'لا تحذير IM_BILINGUAL، فلا زر يفرّغ المقاطع');
  assert.equal(r.cues[0].text, 'Line 1 & more', 'النص كما قُرئ');
  // ومع مقطعين ثنائيين حقيقيين: اثنان من ثمانية، لا أكثرها.
  const two = untranslated.map((c, i) => (i >= 6 ? { ...c, text: `${c.text}\n${EN[i].text}` } : c));
  assert.equal(bilingualCheck(two, [TRACK]), null);
  // والضابط: الملف نفسه «الترجمة ثم الأصل» في كل مقطع يُعلَن بعدده.
  const dual = EN.map((c) => ({ ...c, text: `السطر ${c.n}\n${c.text}` }));
  assert.deepEqual(bilingualCheck(dual, [TRACK]), { code: 'IM_BILINGUAL', count: 8, total: 8, indexes: [0, 1, 2, 3, 4, 5, 6, 7], lang: 'en', line: 'last' });
});
