// تدقيق V2 الموحد، المجموعة WG-2 على النموذج (U-011 وU-012 وU-013): مرجع الترجمة المُخلى، وحدود المسارات والبصمات بقاعدة إسقاط
// واحدة في الدمج وفي التصدير.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitLimits, mergeLang, packLang, storedTrack } from '../../../src/core/model/lang-store.js';
import { withExport } from '../../../src/core/model/transitions.js';
import { bundleFromRecord, syncActive } from '../../../src/core/model/bundle.js';
import { validateBundle } from '../../../src/core/model/slots.js';
import { validateVideoRecord } from '../../../src/core/model/video.js';
import { NOW, VIDEO_ID as A, comparison, fingerprint, makeCues, videoRecord } from '../../helpers/fixtures.js';
import { sampleBundle } from '../../helpers/fixtures-v2.js';

const track = (lang, kind = 'manual') => ({ key: `${lang}|${kind}`, lang, kind, capturedAt: NOW, source: 'capture', cues: makeCues(3, { text: (i) => `${lang} ${i}` }) });
const fp = (t, n) => fingerprint({ track: t, id: `fp_t${String(n).padStart(9, '0')}` });

test('AV2 U-011: storedTrack يبقي مقارنة مرجع فارغ لبصمة غائبة، ولا يحفظ مرجعًا (meta === null)', () => {
  const t = { ...sampleBundle().slots[1].track, fingerprintId: null, comparison: comparison({ fingerprintId: 'fp_gone000001' }) };
  const { track: out, meta } = storedTrack(t, new Set());
  assert.equal(out.fingerprintId, null);
  assert.equal(out.comparison.fingerprintId, 'fp_gone000001');
  assert.deepEqual(out.comparison, t.comparison);
  assert.equal(meta, null);
});

test('AV2 U-011: مرجع بصمة أجنبية ما زال يُصفَّر ويُحفظ في المرافق (السلوك الموثق)', () => {
  const t = { ...sampleBundle().slots[1].track, fingerprintId: 'fp_ja0000001', comparison: comparison({ fingerprintId: 'fp_ja0000001' }) };
  const { track: out, meta } = storedTrack(t, new Set(['fp_test000001']));
  assert.equal(out.fingerprintId, null);
  assert.equal(out.comparison, null);
  assert.equal(meta.ref.fingerprintId, 'fp_ja0000001');
  assert.deepEqual(meta.ref.comparison, t.comparison);
});

test('AV2 U-011: حزمة فيها ترجمة بمرجع مُخلى تُعبّأ وتُدمج بلا فقد المقارنة، والإسقاط يجتاز مدقق السجل', () => {
  const b = sampleBundle();
  Object.assign(b.slots[1].track, { fingerprintId: null, comparison: comparison({ fingerprintId: 'fp_gone000001' }) });
  const p = packLang(b);
  assert.equal(validateVideoRecord(p.record).ok, true);
  assert.deepEqual(p.alts[1].comparison, b.slots[1].track.comparison);
  assert.equal(p.lang.slots[1], null);
});

/** حزمة سجلها بمسارات وبصمات معطاة، ومرجع نشطتها بصمة معطاة. */
function bundleWith(tracks, prints, refId) {
  const b = sampleBundle({ previous: false });
  b.record.english = tracks;
  b.record.fingerprints = prints;
  Object.assign(b.slots[0].track, { fingerprintId: refId, comparison: refId ? comparison({ fingerprintId: refId }) : null });
  b.record.arabic = structuredClone(b.slots[0].track);
  b.slots[1].track.fingerprintId = null;
  b.slots[1].track.comparison = null;
  return b;
}

test('AV2 U-012: fitLimits يُسقط بصمات الأجنبي أولًا ثم الإنجليزي، الأقدم غير المشار إليه، ولا يمس المشار إليه', () => {
  const en = track('en');
  const ja = track('ja');
  const prints = [fp(en, 1), fp(ja, 2), fp(en, 3), fp(en, 4), fp(en, 5), fp(en, 6), fp(en, 7), fp(en, 8), fp(en, 9), fp(en, 10), fp(en, 11)];
  const r = fitLimits([en, ja], prints, new Set([prints[1].id]));
  assert.equal(r.fingerprints.length, 10);
  assert.equal(r.changed, true);
  assert.ok(r.fingerprints.some((f) => f.id === prints[1].id), 'بصمة المرجع الأجنبي باقية');
  assert.equal(r.fingerprints.some((f) => f.id === prints[0].id), false, 'أقدم إنجليزية غير مشار إليها سقطت');
  // أجنبية غير مشار إليها تُسقط قبل أي إنجليزية أقدم منها.
  const prints2 = [fp(en, 1), fp(en, 3), fp(en, 4), fp(en, 5), fp(en, 6), fp(en, 7), fp(en, 8), fp(en, 9), fp(en, 10), fp(en, 11), fp(ja, 2)];
  const r2 = fitLimits([en, ja], prints2, new Set());
  assert.equal(r2.fingerprints.some((f) => f.trackKey === ja.key), false);
  assert.equal(r2.fingerprints.length, 10);
});

test('AV2 U-012: fitLimits يُسقط المسار الأقدم الذي كل بصماته غير مشار إليها مع بصماته، الأجنبي أولًا', () => {
  const tracks = ['en', 'ja', 'fr', 'de', 'es', 'ko', 'it', 'pt', 'ru'].map((l) => track(l));
  const prints = tracks.map((t, i) => fp(t, i + 1));
  const r = fitLimits(tracks, prints, new Set([prints[1].id])); // مرجع المسار الياباني
  assert.equal(r.english.length, 8);
  assert.deepEqual(r.english.map((t) => t.key).includes('ja|manual'), true);
  assert.equal(r.english.some((t) => t.key === 'fr|manual'), false, 'أقدم أجنبي غير مشار إليه');
  assert.equal(r.fingerprints.some((f) => f.trackKey === 'fr|manual'), false, 'وبصمته معه');
  assert.equal(r.english.some((t) => t.key === 'en|manual'), true, 'الإنجليزي بعد الأجنبي');
});

test('AV2 U-012: mergeLang بعد رجوع إلى 1.1.0 (11 بصمة): الحزمة المدمجة صالحة وفي الحدود وبصمة المرجع باقية', () => {
  const ja = track('ja');
  const en = track('en');
  const jaFp = fp(ja, 99);
  const enPrints = Array.from({ length: 10 }, (_, i) => fp(en, i + 1));
  const full = bundleWith([en, ja], [...enPrints.slice(0, 9), jaFp], jaFp.id);
  const p = packLang(full);
  // 1.1.0 أضاف بصمة إنجليزية عاشرة: السجل الذي يقرؤه فيه 10 بصمات، والمرافق فيه اليابانية.
  const b = { videoId: A, record: structuredClone(p.record), active: 1, slots: structuredClone(full.slots), previous: null };
  b.record.fingerprints = enPrints;
  b.record.arabic.fingerprintId = null;
  b.record.arabic.comparison = null;
  b.slots[0].track = structuredClone(b.record.arabic);
  b.slots[1].track = structuredClone(full.slots[1].track);
  const langValue = { ...p.lang, base: { rev: 1, createdAt: NOW, updatedAt: NOW } };
  const stale = mergeLang(b, langValue);
  assert.equal(stale, true);
  assert.equal(b.record.fingerprints.length, 10);
  assert.ok(b.record.english.length <= 8);
  assert.equal(b.record.arabic.fingerprintId, jaFp.id);
  assert.ok(b.record.english.some((t) => t.key === 'ja|manual'));
  const v = validateBundle(syncActive(b));
  assert.equal(v.ok, true, JSON.stringify(v));
});

test('AV2 U-013: تسعة مسارات مختلفة تُصدَّر كلها: تُحفظ البصمة التاسعة ويبقى المسارات ≤ 8 وكل بصمة لمسار باقٍ', () => {
  let rec = { ...videoRecord({ arabic: false }), english: [], fingerprints: [] };
  const langs = ['en', 'ja', 'fr', 'de', 'es', 'ko', 'it', 'pt', 'ru'];
  langs.forEach((l, i) => {
    const t = track(l);
    rec = withExport(rec, { videoId: A, englishTrack: t, fingerprint: fp(t, i + 1) }, NOW);
  });
  assert.equal(rec.english.length, 8);
  assert.ok(rec.english.some((t) => t.key === 'ru|manual'), 'المسار التاسع محفوظ');
  assert.ok(rec.fingerprints.some((f) => f.id === 'fp_t000000009'), 'البصمة التاسعة محفوظة');
  const keys = new Set(rec.english.map((t) => t.key));
  assert.ok(rec.fingerprints.every((f) => keys.has(f.trackKey)), 'لا بصمة ليتيم');
  assert.equal(validateBundle(bundleFromRecord(rec)).ok, true);
});

test('AV2 U-013: المسار المشار إليه بمرجع لا يُسقط عند امتلاء الحد', () => {
  let rec = { ...videoRecord({ arabic: false }), english: [], fingerprints: [] };
  const langs = ['ja', 'fr', 'de', 'es', 'ko', 'it', 'pt', 'ru'];
  langs.forEach((l, i) => {
    const t = track(l);
    rec = withExport(rec, { videoId: A, englishTrack: t, fingerprint: fp(t, i + 1) }, NOW);
  });
  const t = track('en');
  rec = withExport(rec, { videoId: A, englishTrack: t, fingerprint: fp(t, 20) }, NOW, { keep: ['fp_t000000001'] });
  assert.ok(rec.english.some((x) => x.key === 'ja|manual'), 'مرجع محمي');
  assert.equal(rec.english.some((x) => x.key === 'fr|manual'), false, 'الأقدم غير المشار إليه سقط');
  assert.equal(rec.english.length, 8);
});
