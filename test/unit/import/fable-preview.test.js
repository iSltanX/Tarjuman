// تدقيق Fable (FA-04 = B1 في التقرير السابق، بند DS-S2 بقرار سلطان 2026-11-07 بعد تأجيله في Q25 ب): معاينة الرفع كانت تحكم بالرقم
// (compare) فتناقض ما يُعرض بعد الحفظ بالمحاذاة (trackComparison): عيّنة TED الحقيقية بعد إسقاط المقطع 5 وإعادة الترقيم كانت
// «مقطع واحد ناقص: 427 · توقيت مختلف في 422» قبل الحفظ و«مقطع واحد ناقص: 5» بعده. صارت المعاينة في المشغّل والمحفوظات بالحساب
// الذي تعرضه الأسطح بعد الحفظ، مع سطر «الترقيم مختلف»، ويبقى تقرير الحفظ بالرقم وصفًا للملف كما رُفع (عقد data-model §١٠).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { previewComparison, readImport } from '../../../src/core/import/index.js';
import { trackComparison } from '../../../src/core/compare/index.js';
import { parseSrtLenient } from '../../../src/core/srt/lenient.js';
import { writeSrt } from '../../../src/core/srt/writer.js';
import { DEFAULT_SETTINGS, normalizeSettings } from '../../../src/core/model/settings.js';
import { comparisonSummary as playerSummary } from '../../../src/player/controls/text.js';
import { comparisonSummary as librarySummary } from '../../../src/pages/library/model.js';
import { readFor } from '../../../src/player/controls/flows.js';
import { englishTrack, fingerprint } from '../../helpers/fixtures.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const settings = normalizeSettings(DEFAULT_SETTINGS);

/** العيّنة العربية الحقيقية (427 مقطعًا) وبصمة تصديرها، والملف نفسه بلا المقطع 5 بعد إعادة الترقيم كما يكتبه writeSrt. */
async function renumberedTed() {
  const text = await readFile(path.join(ROOT, 'test/e2e/fixtures/iG9CE55wbtY.en.manual.normal.ar.srt'), 'utf8');
  const full = parseSrtLenient(text).cues;
  const fp = fingerprint({ track: englishTrack({ cues: full.map((c) => ({ ...c, text: 'x' })) }), id: 'fp_ted00000001' });
  const dropped = full.filter((c) => c.n !== 5).map((c, i) => ({ ...c, n: i + 1 }));
  return { full, fp, file: new File([writeSrt(dropped)], 'iG9CE55wbtY.ar.srt') };
}

test('FA-04: معاينة ملف أُعيد ترقيمه تقول الناقص الحقيقي (5) بلا انحراف، وتذكر أن المقارنة بالتوقيت', async () => {
  const { fp, file } = await renumberedTed();
  const r = await readImport([file], { fingerprints: [fp], settings });
  assert.equal(r.ok, true);
  // تقرير الحفظ بالرقم كما كان (يصف الملف كما رُفع).
  assert.deepEqual([r.comparison.missing, r.comparison.drift.length], [[427], 422]);
  const p = previewComparison(r.cues, fp, { settings, notes: r.notes });
  assert.deepEqual(p.missing, [5]);
  assert.deepEqual(p.extra, []);
  assert.deepEqual(p.drift, []);
  assert.equal(p.renumbered, true);
  assert.equal(p.matched, false);
  assert.equal(playerSummary(p).text, 'مقطع واحد ناقص: 5 · الترقيم مختلف عن الأصل، والمقارنة بالتوقيت');
  assert.deepEqual(librarySummary(p).lines, ['عدد المقاطع: 426 من 427', 'مقطع واحد ناقص: 5', 'ترقيم المقاطع يختلف عن الأصل، فقورنت بتوقيتها.']);
});

test('FA-04: المعاينة تطابق ما تعرضه الأسطح بعد الحفظ (trackComparison) في النقص والزيادة والانحراف', async () => {
  const { fp, file } = await renumberedTed();
  const r = await readImport([file], { fingerprints: [fp], settings });
  const p = previewComparison(r.cues, fp, { settings, notes: r.notes });
  const saved = { original: r.cues, current: null, fingerprintId: fp.id, comparison: r.comparison };
  const after = trackComparison(saved, [fp]);
  assert.deepEqual([p.missing, p.extra, p.drift, p.matched], [after.missing, after.extra, after.drift, after.matched]);
});

test('FA-04: الملف المطابق «مطابق للأصل» بلا سطر ترقيم، وبلا مرجع «لا بصمة للمقارنة» كما كان', async () => {
  const { full, fp } = await renumberedTed();
  const same = previewComparison(full, fp, { settings });
  assert.equal(same.matched, true);
  assert.equal(same.renumbered, false);
  assert.equal(playerSummary(same).text, 'مطابق للأصل');
  assert.deepEqual(librarySummary(same).lines, ['مطابق للأصل']);
  const none = previewComparison(full, null, { settings });
  assert.equal(none.fingerprintId, null);
  assert.equal(playerSummary(none).text, 'لا بصمة للمقارنة؛ عُرض الملف كما هو.');
});

test('FA-04: قراءة المشغّل تعيد المعاينة بالمحاذاة وتُبقي تقرير الحفظ بالرقم في input', async () => {
  const { fp, file } = await renumberedTed();
  const state = { videoId: 'iG9CE55wbtY', saved: { fingerprints: [fp] }, settings };
  const r = await readFor({ controller: { getState: () => state }, importFlow: { readImport }, files: [file] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.input.comparison.missing, [427], 'تقرير الحفظ بالرقم');
  assert.deepEqual(r.preview.missing, [5], 'المعاينة بالمحاذاة');
  assert.equal(r.preview.renumbered, true);
});
