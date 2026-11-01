// نموذج البيانات: العينات المطابقة للعقد صالحة، والمدققات صارمة، والإعدادات متسامحة في القراءة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS, LIMITS, assertValid, createVideoRecord, mergeSettings, normalizeSettings, pagePath,
  parseTrackKey, summarizeVideo, trackKey, validateArabicTrack, validateComparisonReport, validateCue,
  validateEnglishTrack, validateFingerprint, validateIndexEntry, validateSettings, validateVideoRecord, videoParam,
  watchUrl, newFingerprintId, arabicCues,
} from '../../../src/core/model/index.js';
import { TjError } from '../../../src/core/errors/index.js';
import { NOW, comparison, englishTrack, fingerprint, makeCues, realTrack, videoRecord } from '../../helpers/fixtures.js';

const okr = (r, msg) => assert.equal(r.ok, true, `${msg ?? ''} ${r.path}: ${r.reason}`);
const bad = (r, pathPart) => {
  assert.equal(r.ok, false, 'المتوقع رفض');
  if (pathPart) assert.ok(r.path.includes(pathPart), `${r.path} لا يحوي ${pathPart}`);
};

test('عينات المساعدات مطابقة للعقد', () => {
  okr(validateEnglishTrack(englishTrack()));
  okr(validateFingerprint(fingerprint()));
  okr(validateComparisonReport(comparison()));
  okr(validateComparisonReport(comparison({ fingerprintId: null })));
  okr(validateVideoRecord(videoRecord()));
  okr(validateVideoRecord(videoRecord({ arabic: false })));
  okr(validateSettings(normalizeSettings(DEFAULT_SETTINGS)));
});

test('المقطع: بنيوي فقط، ونهاية قبل بداية ليست خطأ نموذج', () => {
  okr(validateCue({ n: 1, startMs: 0, endMs: 0, text: '' }));
  okr(validateCue({ n: 3, startMs: 5000, endMs: 4000, text: 'خطأ توقيت يعرضه المحرّر' }));
  bad(validateCue({ n: 0, startMs: 0, endMs: 1, text: 'x' }), '.n');
  bad(validateCue({ n: 1, startMs: -1, endMs: 1, text: 'x' }), 'startMs');
  bad(validateCue({ n: 1, startMs: 1.5, endMs: 2, text: 'x' }), 'startMs');
  bad(validateCue({ n: 1, startMs: 0, endMs: LIMITS.maxTimeMs + 1, text: 'x' }), 'endMs');
  bad(validateCue({ n: 1, startMs: 0, endMs: 1, text: 'a\u0000b' }), 'text');
  bad(validateCue({ n: 1, startMs: 0, endMs: 1, text: 'x', html: '<b>' }), 'html');
  bad(validateCue({ n: 1, startMs: 0, endMs: 1 }), 'text');
});

test('المسار الإنجليزي: لغة إنجليزية ومفتاح lang|kind ومقطع واحد على الأقل', () => {
  okr(validateEnglishTrack(englishTrack({ lang: 'en-GB', kind: 'asr' })));
  bad(validateEnglishTrack({ ...englishTrack(), lang: 'ar', key: 'ar|manual' }), 'lang');
  bad(validateEnglishTrack({ ...englishTrack(), key: 'en|asr' }), 'key');
  bad(validateEnglishTrack(englishTrack({ cues: [] })), 'cues');
  bad(validateEnglishTrack({ ...englishTrack(), source: 'innertube' }), 'source');
  assert.equal(trackKey('en', 'asr'), 'en|asr');
  assert.deepEqual(parseTrackKey('en-GB|manual'), { lang: 'en-GB', kind: 'manual' });
  assert.equal(parseTrackKey('ar|manual'), null);
  assert.equal(parseTrackKey('en|manual|x'), null);
});

test('البصمة: ترقيم متسلسل، والأجزاء بترقيم مستمر يغطي الكل', () => {
  const t = englishTrack({ cues: makeCues(10) });
  okr(validateFingerprint(fingerprint({ track: t, parts: [{ index: 1, from: 1, to: 4 }, { index: 2, from: 5, to: 10 }] })));
  bad(validateFingerprint(fingerprint({ track: t, parts: [{ index: 1, from: 1, to: 4 }, { index: 2, from: 6, to: 10 }] })), 'parts');
  bad(validateFingerprint(fingerprint({ track: t, parts: [{ index: 1, from: 1, to: 4 }, { index: 2, from: 5, to: 9 }] })), 'parts');
  bad(validateFingerprint(fingerprint({ track: t, parts: [{ index: 1, from: 1, to: 10 }] })), 'parts');
  const fp = fingerprint({ track: t });
  bad(validateFingerprint({ ...fp, count: 9 }), 'count');
  bad(validateFingerprint({ ...fp, cues: fp.cues.map((c, i) => ({ ...c, n: i + 2 })) }), 'cues');
  bad(validateFingerprint({ ...fp, id: 'bad' }), '.id');
  bad(validateFingerprint({ ...fp, textHash: 'abc' }), 'textHash');
  bad(validateFingerprint({ ...fp, cues: fp.cues.map((c) => ({ ...c, text: 'لا نص في البصمة' })) }), 'text');
  assert.match(newFingerprintId(1700000000000, () => 0.5), /^fp_[a-z0-9]{6,40}$/);
});

test('تقرير المقارنة: الاستعادة لا تُتاح إلا عند تطابق العدد والترقيم، والمطابقة تعني غياب الفروق', () => {
  const c = comparison();
  bad(validateComparisonReport({ ...c, countTarget: 4 }), 'restoreTimingAvailable');
  bad(validateComparisonReport({ ...c, numbering: 'different' }), 'restoreTimingAvailable');
  bad(validateComparisonReport({ ...c, restoreTimingAvailable: false, missing: [3] }), 'matched');
  okr(validateComparisonReport({ ...c, matched: false, restoreTimingAvailable: true, drift: [{ n: 2, startDeltaMs: 300, endDeltaMs: -200 }] }));
  bad(validateComparisonReport({ ...comparison({ fingerprintId: null }), matched: true }));
  bad(validateComparisonReport({ ...comparison({ fingerprintId: null }), countSource: 5 }));
  bad(validateComparisonReport({ ...c, missing: [0] }), 'missing');
});

test('الترجمة العربية: النسخة الحالية وتاريخ تعديلها معًا، والأصل غير فارغ', () => {
  const a = videoRecord().arabic;
  okr(validateArabicTrack(a));
  okr(validateArabicTrack({ ...a, current: makeCues(5), editedAt: NOW }));
  bad(validateArabicTrack({ ...a, current: makeCues(5) }), 'editedAt');
  bad(validateArabicTrack({ ...a, editedAt: NOW }), 'editedAt');
  bad(validateArabicTrack({ ...a, original: [] }), 'original');
  bad(validateArabicTrack({ ...a, fileName: '' }), 'fileName');
});

test('سجل الفيديو: صارم في المفاتيح والإزاحة والمراجع', () => {
  const r = videoRecord();
  bad(validateVideoRecord({ ...r, extra: 1 }), 'extra');
  bad(validateVideoRecord({ ...r, schema: 2 }), 'schema');
  bad(validateVideoRecord({ ...r, rev: 0 }), 'rev');
  bad(validateVideoRecord({ ...r, view: { displayOffsetMs: 250, displayMode: 'ar' } }), 'displayOffsetMs');
  bad(validateVideoRecord({ ...r, view: { displayOffsetMs: 600100, displayMode: 'ar' } }), 'displayOffsetMs');
  okr(validateVideoRecord({ ...r, view: { displayOffsetMs: -600000, displayMode: 'off' } }));
  bad(validateVideoRecord({ ...r, view: { displayOffsetMs: 0, displayMode: 'en' } }), 'displayMode');
  bad(validateVideoRecord({ ...r, english: [r.english[0], r.english[0]] }), 'english');
  bad(validateVideoRecord({ ...r, english: [] }), 'fingerprints');
  bad(validateVideoRecord({ ...r, fingerprints: [] }), 'arabic.fingerprintId');
  bad(validateVideoRecord({ ...r, fingerprints: [{ ...r.fingerprints[0], videoId: 'BBBBBBBBBBB' }] }), 'fingerprints');
  bad(validateVideoRecord({ ...r, videoId: 'short' }), 'videoId');
  const empty = createVideoRecord({ videoId: 'AAAAAAAAAAA', now: NOW });
  bad(validateVideoRecord(empty), 'rev');
  okr(validateVideoRecord({ ...empty, rev: 1 }));
  assert.equal(arabicCues(r), r.arabic.original);
  assert.equal(arabicCues({ ...r, arabic: { ...r.arabic, current: makeCues(2), editedAt: NOW } }).length, 2);
  assert.equal(arabicCues(null), null);
  assert.throws(() => assertValid(validateVideoRecord({ ...r, rev: -1 }), 'video'), (e) => e instanceof TjError && e.code === 'MD_INVALID');
});

test('مُلخّص الفهرس من السجل صالح ويحمل ما تعرضه المحفوظات', () => {
  const r = videoRecord({ offset: 500 });
  r.arabic.comparison = { ...r.arabic.comparison, matched: false, restoreTimingAvailable: false, missing: [2, 3], countTarget: 3 };
  const e = summarizeVideo(r);
  okr(validateIndexEntry(e));
  assert.deepEqual(e.english, [{ key: 'en|manual', kind: 'manual', cueCount: 5 }]);
  assert.deepEqual(e.arabic, { fileName: 'AAAAAAAAAAA.ar.srt', cueCount: 5, edited: false, matched: false, missing: 2, extra: 0, drift: 0 });
  assert.equal(e.view.displayOffsetMs, 500);
  assert.equal(summarizeVideo(videoRecord({ arabic: false })).arabic, null);
});

test('الإعدادات: القراءة تعيد كل حقل تالف إلى افتراضيه، والكتابة صارمة', () => {
  assert.deepEqual(normalizeSettings(undefined), normalizeSettings(DEFAULT_SETTINGS));
  const n = normalizeSettings({ offsetStepMs: 250, displayModeDefault: 'dual', appearance: { size: 'xxl', background: 'solid' }, junk: 1 });
  assert.equal(n.offsetStepMs, 500, '250 ليست من مضاعفات 100');
  assert.equal(n.displayModeDefault, 'dual');
  assert.deepEqual(n.appearance, { size: 'm', background: 'solid', position: 'bottom' });
  okr(validateSettings(n));
  const m = mergeSettings(n, { appearance: { size: 'xl' }, offsetStepMs: 1000 });
  assert.deepEqual(m.appearance, { size: 'xl', background: 'solid', position: 'bottom' });
  okr(validateSettings(m));
  bad(validateSettings(mergeSettings(n, { offsetStepMs: 50 })), 'offsetStepMs');
  bad(validateSettings(mergeSettings(n, { thresholds: { completeness: 1.5 } })), 'completeness');
  bad(validateSettings({ ...n, extra: true }), 'extra');
  assert.equal(DEFAULT_SETTINGS.displayModeDefault, 'ar');
  assert.equal(DEFAULT_SETTINGS.offsetStepMs, 500);
});

test('عناوين الصفحات وصفحة المشاهدة', () => {
  assert.equal(pagePath('editor', { v: 'dQw4w9WgXcQ' }), 'pages/editor/index.html?v=dQw4w9WgXcQ');
  assert.equal(pagePath('library'), 'pages/library/index.html');
  assert.throws(() => pagePath('editor', { v: 'x' }), RangeError);
  assert.equal(videoParam('?v=dQw4w9WgXcQ&x=1'), 'dQw4w9WgXcQ');
  assert.equal(videoParam('?v=<script>'), null);
  assert.equal(watchUrl('dQw4w9WgXcQ'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.throws(() => watchUrl('javascript:x'), RangeError);
});

for (const kind of ['manual', 'asr']) {
  test(`عينة P1 الحقيقية (${kind}): مسار وبصمة وسجل صالحة، وحجم السجل معقول`, () => {
    const { fixture, cues } = realTrack(kind);
    const track = englishTrack({ kind, cues });
    okr(validateEnglishTrack(track));
    const fp = fingerprint({ videoId: fixture.videoId, track });
    okr(validateFingerprint(fp));
    const ar = cues.map((c) => ({ ...c, text: 'ت'.repeat(c.text.length) }));
    const rec = {
      schema: 1, videoId: fixture.videoId, title: fixture.source.title, durationMs: fixture.durationMs, createdAt: NOW, updatedAt: NOW, rev: 1,
      english: [track], fingerprints: [fp],
      arabic: { fileName: 'x.ar.srt', importedAt: NOW, original: ar, current: ar, editedAt: NOW, fingerprintId: fp.id, comparison: comparison({ fingerprintId: fp.id, count: cues.length }), notes: [] },
      view: { displayOffsetMs: 0, displayMode: 'dual' },
    };
    okr(validateVideoRecord(rec));
    const perCue = JSON.stringify(rec).length / cues.length;
    assert.ok(perCue < 600, `الحجم لكل مقطع ${perCue}`);
  });
}
