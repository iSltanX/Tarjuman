// العمود الإنجليزي المرجعي، وصفوف «ناقص في الترجمة»، وانتقال الحفظ (الأصل لا يُستبدل بصمت).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRows, editTransition, englishReference, pickEnglishTrack } from '../../../src/core/edit/index.js';
import { validateVideoRecord } from '../../../src/core/model/video.js';
import { TjError } from '../../../src/core/errors/index.js';
import { NOW, englishTrack, fingerprint, makeCues, videoRecord } from '../../helpers/fixtures.js';

const LATER = '2026-11-02T10:00:00.000Z';
const valid = (r) => {
  const v = validateVideoRecord(r);
  assert.equal(v.ok, true, `${v.path}: ${v.reason}`);
};

test('المرجع بوضع «عادي»: لكل مقطع عربي نص المقطع الإنجليزي برقمه، ولو عُدّل توقيت العربي', () => {
  const en = makeCues(3, { text: (i) => `line ${i}` });
  const fp = fingerprint({ track: englishTrack({ cues: en }) });
  const ar = makeCues(3).map((c) => ({ ...c, startMs: c.startMs + 9000, endMs: c.endMs + 9000 }));
  assert.deepEqual(englishReference(ar, en, fp), ['line 1', 'line 2', 'line 3']);
});

test('المرجع بوضع «مقاطع أطول»: نوافذ البصمة تجمع المقاطع العادية التي تقع منتصفاتها فيها', () => {
  const en = makeCues(4, { text: (i) => `line ${i}` });
  const fp = { ...fingerprint({ track: englishTrack({ cues: en }) }), mode: 'long', count: 2, cues: [
    { n: 1, startMs: en[0].startMs, endMs: en[1].endMs }, { n: 2, startMs: en[2].startMs, endMs: en[3].endMs },
  ] };
  const ar = [{ n: 1, startMs: 0, endMs: 1, text: 'أ' }, { n: 2, startMs: 2, endMs: 3, text: 'ب' }, { n: 7, startMs: 4, endMs: 5, text: 'زائد' }];
  assert.deepEqual(englishReference(ar, en, fp), ['line 1 line 2', 'line 3 line 4', '']);
});

test('المرجع بلا بصمة: بالتوقيت المفتوح للعربي، والمسار المختار يدوي قبل التلقائي أو مسار البصمة', () => {
  const en = makeCues(2, { text: (i) => `line ${i}` });
  assert.deepEqual(englishReference(makeCues(2), en, null), ['line 1', 'line 2']);
  assert.deepEqual(englishReference(makeCues(2), [], null), ['', '']);
  const asr = englishTrack({ kind: 'asr' });
  const manual = englishTrack({ kind: 'manual' });
  assert.equal(pickEnglishTrack([asr, manual], null), manual);
  assert.equal(pickEnglishTrack([asr, manual], { trackKey: 'en|asr' }), asr);
  assert.equal(pickEnglishTrack([], null), null);
});

test('الصفوف: «ناقص في الترجمة» في موضعه بين المقاطع بحسب الرقم', () => {
  const cues = [{ n: 1 }, { n: 2 }, { n: 5 }];
  assert.deepEqual(buildRows(cues, [3, 4, 6]), [
    { type: 'cue', index: 0 }, { type: 'cue', index: 1 }, { type: 'missing', n: 3 }, { type: 'missing', n: 4 },
    { type: 'cue', index: 2 }, { type: 'missing', n: 6 },
  ]);
  assert.deepEqual(buildRows(cues, []), [{ type: 'cue', index: 0 }, { type: 'cue', index: 1 }, { type: 'cue', index: 2 }]);
});

test('الحفظ: النسخة الحالية تُكتب والأصل باقٍ، والإزاحة تُكتب في الخطوة نفسها إن مُرِّرت', () => {
  const rec = videoRecord({ offset: 500 });
  const cues = rec.arabic.original.map((c) => ({ ...c, startMs: c.startMs + 500, endMs: c.endMs + 500 }));
  const r = editTransition(rec, { cues, displayOffsetMs: 0 }, LATER);
  valid(r);
  assert.deepEqual(r.arabic.original, rec.arabic.original, 'الأصل المستورد لا يُمس');
  assert.deepEqual(r.arabic.current, cues);
  assert.equal(r.arabic.editedAt, LATER);
  assert.equal(r.view.displayOffsetMs, 0);
  const keep = editTransition(rec, { cues }, LATER);
  assert.equal(keep.view.displayOffsetMs, 500, 'بلا تثبيت لا تُمس الإزاحة');
  assert.equal(rec.arabic.current, null, 'المدخل لم يتغير');
});

test('الحفظ بمقاطع مطابقة للأصل يعيد «الأصل المستورد» بدل نسخة معدّلة مطابقة', () => {
  const rec = videoRecord();
  const edited = editTransition(rec, { cues: rec.arabic.original.map((c, i) => (i ? c : { ...c, text: 'معدَّل' })) }, LATER);
  const back = editTransition(edited, { cues: rec.arabic.original, displayOffsetMs: 0 }, NOW);
  valid(back);
  assert.equal(back.arabic.current, null);
  assert.equal(back.arabic.editedAt, null);
});

test('الحفظ يُرفض بأخطاء التوقيت (حماية ثانية خلف الواجهة)', () => {
  const rec = videoRecord();
  const cues = rec.arabic.original.map((c, i) => (i ? c : { ...c, endMs: c.startMs - 1 }));
  assert.throws(() => editTransition(rec, { cues }, LATER), (e) => e instanceof TjError && e.code === 'ED_SAVE_HAS_ERRORS');
  assert.throws(() => editTransition(videoRecord({ arabic: false }), { cues }, LATER), (e) => e.code === 'ST_NO_RECORD');
});

test('المرجع مع نافذة طويلة تحتوي نوافذ بعدها: المنتصف يُنسب إلى أسبق نافذة تحويه (مراجعة)', () => {
  const ar = [{ n: 1, startMs: 0, endMs: 100000 }, { n: 2, startMs: 10000, endMs: 20000 }, { n: 3, startMs: 30000, endMs: 40000 }];
  const en = [{ n: 1, startMs: 49000, endMs: 51000, text: 'x' }, { n: 2, startMs: 14000, endMs: 16000, text: 'y' }];
  assert.deepEqual(englishReference(ar, en, null), ['x', 'y', '']);
});
