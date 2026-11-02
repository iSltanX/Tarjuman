// ذهاب وإياب الإصدار الثاني (P11): تصدير مقسّم بالمحتوى ← ترجمة بأرقام الأجزاء وأزمنتها ← استيراد الأجزاء ← مطابقة البصمة؛
// وملف استكمال للناقص ← ترجمته ← ملف التصحيح ← ترجمة كاملة مطابقة لا يُمس فيها غير الناقص.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compare } from '../../../src/core/compare/index.js';
import { buildExport, buildPatchPackage } from '../../../src/core/export/index.js';
import { applyPatch, readImport, readPatch } from '../../../src/core/import/index.js';
import { parseSrtLenient } from '../../../src/core/srt/lenient.js';
import { realTrack } from '../../helpers/fixtures.js';
import { fileOf } from '../../fixtures/srt/index.js';
import { REAL_ARABIC, realArabic } from '../../fixtures/v2/index.js';

const NOW = '2026-11-02T10:00:00.000Z';
const VIDEO = 'iG9CE55wbtY';
const { cues: EN } = realTrack('manual');
const AR = parseSrtLenient(realArabic(REAL_ARABIC.manual)).cues;
const TRACK = { key: 'en|manual', lang: 'en', kind: 'manual', capturedAt: NOW, source: 'capture', cues: EN };

/** «النموذج»: يعيد ملف SRT نفسه بنص عربي من العيّنة الحقيقية لكل رقم، والأرقام والأزمنة كما هي. */
const translate = (srt) => `${srt.trimEnd().split('\n\n').map((block) => {
  const [n, time] = block.split('\n');
  return `${n}\n${time}\n${AR[Number(n) - 1].text}`;
}).join('\n\n')}\n`;

test('تصدير مقسّم عند الجمل ← ترجمة كل جزء بترقيمه ← استيراد الأجزاء معًا: مطابقة تامة للبصمة والاستعادة متاحة', async () => {
  const exp = buildExport({ videoId: VIDEO, track: TRACK, mode: 'normal', split: { size: 120, by: 'content' }, now: NOW });
  assert.equal(exp.files.length, 4);
  const files = exp.files.map((f) => fileOf(translate(f.text), f.name.replace('.en.', '.ar.')));
  const r = await readImport(files, { fingerprints: [exp.fingerprint] });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.deepEqual(r.cues.map((c) => c.text), AR.map((c) => c.text));
  assert.deepEqual([r.comparison.matched, r.comparison.restoreTimingAvailable], [true, true]);
});

test('ملف استكمال للناقص والفارغ ← ترجمته ← ملف التصحيح: ترجمة كاملة مطابقة، وغير الناقص لم يُمس', async () => {
  const { fingerprint } = buildExport({ videoId: VIDEO, track: TRACK, mode: 'normal', now: NOW });
  const current = AR.filter((c) => ![57, 58, 300].includes(c.n)).map((c) => (c.n === 201 ? { ...c, text: '' } : c));
  const report = compare(current, fingerprint);
  const numbers = [...report.missing, ...report.empty].sort((a, b) => a - b);
  assert.deepEqual(numbers, [57, 58, 201, 300]);

  const pkg = buildPatchPackage({ videoId: VIDEO, title: 'Do schools kill creativity?', fingerprint, englishTracks: [TRACK], numbers });
  assert.equal(pkg.ok, true);
  const back = translate(pkg.file.text);
  const read = await readPatch(fileOf(back, pkg.file.name.replace('.en.', '.ar.')), { fingerprint, cues: current });
  assert.equal(read.ok, true, JSON.stringify(read.error));
  assert.deepEqual(read.plan.items.map((x) => [x.n, x.action]), [[57, 'insert'], [58, 'insert'], [201, 'replace'], [300, 'insert']]);
  const done = applyPatch(current, read.plan);
  assert.deepEqual(done, AR);
  assert.equal(compare(done, fingerprint).matched, true);
});
