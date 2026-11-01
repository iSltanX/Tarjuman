// المقارن (P4-AC3): النقص والزيادة وانحراف التوقيت بعتبة قابلة للضبط والفراغ والمقاطع بلا حرف عربي، لكل حالة اختبار.
// التقرير وصف فقط: لا يعدّل المدخلات، ويجتاز مدقق عقد البيانات دائمًا.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compare } from '../../../src/core/compare/index.js';
import { parseSrtLenient } from '../../../src/core/srt/lenient.js';
import { validateComparisonReport } from '../../../src/core/model/tracks.js';
import { baseFingerprint, deepFreeze, readSrtFixture } from '../../fixtures/srt/index.js';
import { makeCues } from '../../helpers/fixtures.js';

const cuesOf = (name) => parseSrtLenient(readSrtFixture(name)).cues;
const fp = baseFingerprint();
const run = (name, opts) => compare(cuesOf(name), fp, opts);
const valid = (report) => assert.deepEqual(validateComparisonReport(report), { ok: true }, JSON.stringify(report));

test('مطابقة تامة: كل الحقول فارغة، والاستعادة متاحة، والتقرير يربط البصمة', () => {
  const r = run('clean.ar.srt');
  assert.deepEqual(r, {
    fingerprintId: fp.id, matched: true, countSource: 8, countTarget: 8, numbering: 'same',
    missing: [], extra: [], drift: [], empty: [], noArabic: [], restoreTimingAvailable: true, driftThresholdMs: 100, notes: [],
  });
  valid(r);
});

test('النقص: المقطعان 4 و5 ناقصان بترقيم أصلي، فيختلف العدد والترقيم وتُمنع الاستعادة', () => {
  const r = run('missing.ar.srt');
  assert.deepEqual([r.missing, r.extra, r.drift], [[4, 5], [], []]);
  assert.deepEqual([r.countSource, r.countTarget, r.numbering], [8, 6, 'different']);
  assert.deepEqual([r.matched, r.restoreTimingAvailable], [false, false]);
  valid(r);
});

test('النقص بإعادة ترقيم: العدد مختلف والترقيم متسلسل، والانحراف يبدأ عند الموضع الذي سقط عنده المقطع', () => {
  const r = run('dropped-renumbered.ar.srt');
  assert.deepEqual([r.countSource, r.countTarget, r.numbering], [8, 7, 'same']);
  assert.deepEqual([r.missing, r.extra], [[8], []]);
  assert.deepEqual(r.drift, [4, 5, 6, 7].map((n) => ({ n, startDeltaMs: 2500, endDeltaMs: 2500 })));
  assert.deepEqual([r.matched, r.restoreTimingAvailable], [false, false]);
  valid(r);
});

test('الزيادة: المقطعان 9 و10 زائدان، والاستعادة ممنوعة لاختلاف العدد', () => {
  const r = run('extra.ar.srt');
  assert.deepEqual([r.missing, r.extra, r.drift], [[], [9, 10], []]);
  assert.deepEqual([r.countSource, r.countTarget, r.numbering], [8, 10, 'same']);
  assert.deepEqual([r.matched, r.restoreTimingAvailable], [false, false]);
  valid(r);
});

test('انحراف التوقيت: فوق العتبة فقط (العربي − البصمة)، والعتبة نفسها ليست انحرافًا، والاستعادة متاحة', () => {
  const r = run('drifted.ar.srt');
  assert.deepEqual(r.drift, [
    { n: 3, startDeltaMs: 300, endDeltaMs: -200 },
    { n: 7, startDeltaMs: 0, endDeltaMs: 101 },
  ]);
  assert.equal(r.driftThresholdMs, 100);
  assert.deepEqual([r.missing, r.extra], [[], []]);
  assert.deepEqual([r.matched, r.restoreTimingAvailable], [false, true]);
  valid(r);
});

test('عتبة الانحراف قابلة للضبط', () => {
  assert.deepEqual(run('drifted.ar.srt', { driftMs: 50 }).drift.map((d) => d.n), [3, 6, 7]);
  assert.deepEqual(run('drifted.ar.srt', { driftMs: 100 }).drift.map((d) => d.n), [3, 7]);
  assert.deepEqual(run('drifted.ar.srt', { driftMs: 101 }).drift.map((d) => d.n), [3]);
  assert.deepEqual(run('drifted.ar.srt', { driftMs: 300 }).drift, []);
  const loose = run('drifted.ar.srt', { driftMs: 300 });
  assert.deepEqual([loose.matched, loose.driftThresholdMs], [true, 300], 'بلا انحراف فوق عتبتها تصير مطابقة');
  assert.equal(run('drifted.ar.srt').driftThresholdMs, 100, 'الافتراضي 100ms');
  for (const bad of [-1, 1.5, 60001, NaN, '100']) assert.throws(() => run('clean.ar.srt', { driftMs: bad }), RangeError, String(bad));
});

test('الفراغ والمقاطع بلا حرف عربي: تحذيرات محتوى لا تمنع المطابقة', () => {
  const r = run('untranslated.ar.srt');
  assert.deepEqual(r.empty, [7], 'المقطع الفارغ');
  assert.deepEqual(r.noArabic, [4], 'الإنجليزي وحده؛ ♪ رموز بلا حروف، والمختلط فيه حرف عربي');
  assert.equal(r.matched, true, 'التوقيت والترقيم والعدد مطابقة');
  assert.equal(r.restoreTimingAvailable, true);
  valid(r);
});

test('تعريف «بلا حرف عربي»: حروف غير عربية فقط؛ الرموز والأرقام والمسافات ليست ترجمة ناقصة', () => {
  const texts = ['NASA', 'Привет', '你好', '♪ ♪', '123', '...', '   ', '[موسيقى]', 'استخدم NASA هنا', 'ملف.txt', '١٢٣', ''];
  const cues = texts.map((text, i) => ({ n: i + 1, startMs: i * 1000, endMs: i * 1000 + 500, text }));
  const r = compare(cues, null);
  assert.deepEqual(r.noArabic, [1, 2, 3]);
  assert.deepEqual(r.empty, [7, 12], 'المسافات وحدها تُعدّ فارغة');
});

test('بلا بصمة: لا مقارنة بالأصل، لكن الفراغ وعدم العربية والترقيم يُبلَّغ عنها', () => {
  const clean = compare(cuesOf('clean.ar.srt'), null);
  assert.deepEqual(clean, {
    fingerprintId: null, matched: false, countSource: null, countTarget: 8, numbering: 'same',
    missing: [], extra: [], drift: [], empty: [], noArabic: [], restoreTimingAvailable: false, driftThresholdMs: 100, notes: [],
  });
  valid(clean);
  const gaps = compare(cuesOf('missing.ar.srt'), null);
  assert.deepEqual([gaps.numbering, gaps.missing, gaps.extra, gaps.matched, gaps.restoreTimingAvailable], ['different', [], [], false, false]);
  const un = compare(cuesOf('untranslated.ar.srt'), null);
  assert.deepEqual([un.empty, un.noArabic], [[7], [4]]);
  valid(un);
});

test('الترقيم: التكرار والبدء من غير 1 وترتيب مختلف كلها «different» وتُمنع الاستعادة، وتُبلَّغ بالأرقام', () => {
  const clean = cuesOf('clean.ar.srt');
  const renum = (ns) => clean.map((c, i) => ({ ...c, n: ns[i] }));

  const dup = compare(renum([1, 2, 3, 3, 5, 6, 7, 8]), fp);
  assert.deepEqual([dup.numbering, dup.missing, dup.extra, dup.countTarget, dup.restoreTimingAvailable], ['different', [4], [3], 8, false]);
  assert.equal(dup.matched, false);
  valid(dup);

  const shifted = compare(renum([2, 3, 4, 5, 6, 7, 8, 9]), fp);
  assert.deepEqual([shifted.numbering, shifted.missing, shifted.extra, shifted.restoreTimingAvailable], ['different', [1], [9], false]);
  valid(shifted);

  const swapped = compare(renum([2, 1, 3, 4, 5, 6, 7, 8]), fp);
  assert.deepEqual([swapped.numbering, swapped.missing, swapped.extra], ['different', [], []]);
  assert.deepEqual([swapped.matched, swapped.restoreTimingAvailable], [false, false], 'نفس الأرقام لكن الترتيب مختلف');
  assert.deepEqual(swapped.drift.map((d) => d.n), [1, 2], 'المقطع 1 بزمن الثاني والعكس');
  valid(swapped);

  const triple = compare(renum([1, 1, 1, 4, 5, 6, 7, 8]), fp);
  assert.deepEqual([triple.missing, triple.extra], [[2, 3], [1]], 'التكرار يُبلَّغ مرة لكل رقم');
  valid(triple);
});

test('بصمة بأجزاء احتياطية تُقارَن كاملة، وعدد البصمة هو الذي يحكم', () => {
  const split = baseFingerprint({ parts: [{ index: 1, from: 1, to: 4 }, { index: 2, from: 5, to: 8 }] });
  const r = compare(cuesOf('clean.ar.srt'), split);
  assert.equal(r.matched, true);
  assert.equal(r.fingerprintId, split.id);
});

test('التقرير وصف فقط: لا يعدّل مدخلاته ولا يشاركها مراجعه', () => {
  const cues = deepFreeze(cuesOf('drifted.ar.srt'));
  const finger = deepFreeze(baseFingerprint());
  const r = compare(cues, finger);
  assert.equal(r.drift.length, 2);
  r.missing.push(99);
  r.drift[0].n = 99;
  assert.equal(compare(cues, finger).drift[0].n, 3);
  assert.deepEqual(cues, cuesOf('drifted.ar.srt'));
});

test('كل تقرير ينتجه المقارن يجتاز مدقق عقد البيانات، على كل العينات والعتبات', () => {
  for (const name of ['clean', 'missing', 'dropped-renumbered', 'extra', 'drifted', 'untranslated', 'injected'].map((n) => `${n}.ar.srt`)) {
    for (const finger of [fp, null]) for (const driftMs of [0, 10, 100, 5000]) valid(compare(cuesOf(name), finger, { driftMs }));
  }
});

test('ملف كبير: 50,000 مقطع في أقل من ثانيتين', () => {
  const cues = makeCues(50000, { startMs: 0, durMs: 100, gapMs: 0, text: () => 'سطر' });
  const big = { ...baseFingerprint(), count: 50000, cues: cues.map(({ n, startMs, endMs }) => ({ n, startMs, endMs })) };
  const t0 = performance.now();
  const r = compare(cues, big);
  assert.equal(r.matched, true);
  assert.ok(performance.now() - t0 < 2000, `${performance.now() - t0}ms`);
});

test('المقطع الفارغ بصريًا (محارف تنسيق ومسافات فقط) فارغ، والأرقام الهندية لا تُخفي مقطعًا إنجليزيًا', () => {
  const texts = ['\u200B', '\u200F', '\u061C \u200E', ' ', 'Hello ١٢٣', 'Hello ۱۲۳ world', 'مرحبا ١٢٣', 'ISBN ١٢٣ مرحبا'];
  const cues = texts.map((text, i) => ({ n: i + 1, startMs: i * 1000, endMs: i * 1000 + 500, text }));
  const r = compare(cues, null);
  assert.deepEqual(r.empty, [1, 2, 3, 4]);
  assert.deepEqual(r.noArabic, [5, 6]);
});
