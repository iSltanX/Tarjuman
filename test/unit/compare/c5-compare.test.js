// تدقيق 7a66f91، المرحلة C5، U29: «مطابق للأصل» يشترط غياب الدمج والشطر، فلا يقول التقرير الحاضر وشارة المشغّل «مطابق» لملف
// قال تقرير استيراده «توقيت مختلف في 11» (user-guide.md: «إن تطابقت الأرقام والتوقيت»). على عيّنة TED الحقيقية.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildExport } from '../../../src/core/export/index.js';
import { currentComparison, trackComparison } from '../../../src/core/compare/current.js';
import { readImport } from '../../../src/core/import/index.js';
import { writeSrt } from '../../../src/core/srt/writer.js';
import { comparisonSummary } from '../../../src/player/controls/text.js';
import { fileOf } from '../../fixtures/srt/index.js';
import { NOW, englishTrack, realTrack } from '../../helpers/fixtures.js';

const VIDEO = 'iG9CE55wbtY';
const EN = realTrack('manual').cues;
const FP = buildExport({ videoId: VIDEO, track: englishTrack({ cues: EN }), mode: 'normal', now: NOW, rand: () => 0.5 }).fingerprint;
const BASE = EN.map((c) => ({ n: c.n, startMs: c.startMs, endMs: c.endMs, text: `ترجمة ${c.n}` }));

/** دمج 10+11 وشطر 20 ثم إعادة ترقيم: العدد 427 كما هو والترقيم متسلسل. */
function mergedAndSplit() {
  const m = { ...BASE[9], endMs: BASE[10].endMs, text: 'مدموج' };
  const s = BASE[19];
  const mid = Math.round((s.startMs + s.endMs) / 2);
  return [...BASE.slice(0, 9), m, ...BASE.slice(11, 19), { ...s, endMs: mid, text: 'شطر أ' }, { ...s, startMs: mid, text: 'شطر ب' }, ...BASE.slice(20)]
    .map((c, i) => ({ ...c, n: i + 1 }));
}

async function imported(cues) {
  const r = await readImport(fileOf(writeSrt(cues), `${VIDEO}.en.manual.normal.ar.srt`), { fingerprints: [FP] });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return { fileName: r.fileName, importedAt: NOW, original: r.cues, current: null, editedAt: null, fingerprintId: r.fingerprintId, comparison: r.comparison, notes: [] };
}

test('U29: دمج وشطر متوازنان بالعدد والترقيم نفسيهما: لا «مطابق للأصل» في التقرير الحاضر ولا في شارة المشغّل', async () => {
  const track = await imported(mergedAndSplit());
  assert.equal(track.comparison.matched, false, 'تقرير الاستيراد كما كان');
  assert.equal(track.comparison.countTarget, 427);
  const now = trackComparison(track, [FP]);
  assert.equal(now.matched, false);
  const badge = comparisonSummary(now);
  assert.notEqual(badge.text, 'مطابق للأصل');
  assert.equal(badge.tone, 'warn');
});

test('U29: تعديل المستخدم بالدمج والشطر في المحرّر كذلك: النسخة الحاضرة لا تُوصف «مطابقة للأصل»', async () => {
  const track = await imported(BASE);
  const edited = mergedAndSplit();
  assert.equal(currentComparison(edited, FP).matched, false);
  assert.equal(trackComparison({ ...track, current: edited }, [FP]).matched, false);
});

test('U29 حارس: المطابق تمامًا «مطابق للأصل»، وحذف مقطع بإعادة الترقيم يبقى «ناقص» بالمحاذاة', async () => {
  const exact = await imported(BASE);
  assert.equal(trackComparison(exact, [FP]).matched, true);
  assert.equal(comparisonSummary(trackComparison(exact, [FP])).text, 'مطابق للأصل');
  const dropped = await imported(BASE.filter((c) => c.n !== 4).map((c, i) => ({ ...c, n: i + 1 })));
  const now = trackComparison(dropped, [FP]);
  assert.equal(now.matched, false);
  assert.deepEqual(now.missing, [4]);
});
