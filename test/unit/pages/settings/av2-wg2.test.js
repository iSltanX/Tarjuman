// تدقيق V2 الموحد، المجموعة WG-2 على الإعدادات (U-010 وU-015): تشخيص المحفوظات يعدّ مسارات اللغات الأخرى وبصماتها، وتحذير
// النسخة الجزئية يسمّي بيانات اللغات بالعربية.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../../src/core/store/index.js';
import { buildExport } from '../../../../src/core/export/index.js';
import { readImport } from '../../../../src/core/import/index.js';
import { withExport, withArabicImport } from '../../../../src/core/model/transitions.js';
import { writeSrt } from '../../../../src/core/srt/writer.js';
import { PART_NAMES } from '../../../../src/pages/settings/data.js';
import { collectDiagnostics } from '../../../../src/pages/settings/diagnostics.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW, VIDEO_ID as A, makeCues } from '../../../helpers/fixtures.js';

test('AV2 U-010: التشخيص لفيديو مصدره ياباني بترجمة ناقصة: withEnglish وfingerprints وmismatched تعدّه', async () => {
  let t = Date.parse(NOW);
  const now = () => (t += 1000);
  const store = createStore({ area: createMemoryArea({ unlimited: true, chromiumKeyOrder: true }), now });
  const ja = { key: 'ja|manual', lang: 'ja', kind: 'manual', capturedAt: NOW, source: 'capture', cues: makeCues(3, { text: (i) => `行 ${i}` }) };
  const built = buildExport({ videoId: A, track: ja, mode: 'normal', now: Date.parse(NOW), target: 'ar' });
  await store.updateVideo(A, (rec) => withExport(rec, { videoId: A, englishTrack: ja, fingerprint: built.fingerprint }, new Date(now()).toISOString(), { keep: [] }));
  const saved = await store.getVideo(A);
  const imp = await readImport(new File([writeSrt(ja.cues.slice(0, 2).map((c) => ({ ...c, text: `ترجمة ${c.n}` })))], `${A}.ar.srt`), { fingerprints: saved.fingerprints, lang: 'ar' });
  await store.updateVideo(A, (rec) => withArabicImport(rec, { videoId: A, fileName: imp.fileName, cues: imp.cues, comparison: imp.comparison, fingerprintId: imp.fingerprintId, notes: imp.notes, lang: 'ar', englishTrack: ja }, new Date(now()).toISOString()).record);
  const report = JSON.parse(await collectDiagnostics({ store, version: '2.0.0', nav: {}, api: {} }));
  assert.equal(report.sections.library.videos, 1);
  assert.equal(report.sections.library.withArabic, 1);
  assert.equal(report.sections.library.withEnglish, 1);
  assert.ok(report.sections.library.fingerprints >= 1);
  assert.equal(report.sections.library.mismatched, 1);
});

test('AV2 U-015: تحذير النسخة الجزئية يسمّي lang بالعربية', () => {
  assert.equal(PART_NAMES.lang, 'بيانات اللغات');
  const line = ['lang'].map((k) => PART_NAMES[k] ?? k).join('، ');
  assert.equal(line.includes('lang'), false);
});
