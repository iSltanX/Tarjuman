// ف3 (2026-11-10): الملف المرفوع تتمة لترجمة محفوظة؟ على عيّنات test/fixtures/srt (خط أساس من 8 مقاطع): الجزء الأول ثم
// الثاني، و1–5 ثم 6–8، وترجمة كاملة ثانية، وملف يتداخل مع ما تُرجم، وتوقيت مختلف، وأكثر من خانة متأهلة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findContinuation } from '../../../src/core/import/continuation.js';
import { planPatchCues } from '../../../src/core/import/patch.js';
import { trackComparison } from '../../../src/core/compare/current.js';
import { parseSrtLenient } from '../../../src/core/srt/lenient.js';
import { baseFingerprint, readSrtFixture } from '../../fixtures/srt/index.js';

const fp = baseFingerprint({ id: 'fp_base000001' });
const cuesOf = (name) => parseSrtLenient(readSrtFixture(name)).cues;
const clean = cuesOf('clean.ar.srt');

/** حزمة بخانات ممتلئة بالمقاطع المعطاة، بلغة عربية ومرجعها البصمة. */
function bundleWith(...slotsCues) {
  const track = (cues) => (cues ? { fileName: 'x.ar.srt', importedAt: '2026-11-10T00:00:00.000Z', original: cues, current: null, editedAt: null, fingerprintId: fp.id, comparison: null, notes: [], lang: 'ar' } : null);
  return {
    videoId: fp.videoId, active: 1, previous: null,
    record: { fingerprints: [fp] },
    slots: [1, 2, 3].map((n) => ({ n, name: null, track: track(slotsCues[n - 1] ?? null), offsetMs: 0, marks: [], position: null })),
  };
}

test('الجزء الأول ثم الثاني: تتمة للخانة 1، والناتج 8 مقاطع مطابقة للأصل', () => {
  const r = findContinuation(bundleWith(cuesOf('part1.ar.srt')), cuesOf('part2.ar.srt'));
  assert.ok(r);
  assert.equal(r.n, 1);
  assert.equal(r.adds, cuesOf('part2.ar.srt').length);
  assert.equal(r.remaining, 0);
  assert.equal(r.cues.length, 8);
  const cmp = trackComparison({ fingerprintId: fp.id, original: r.cues, current: null, comparison: null, lang: 'ar' }, [fp]);
  assert.equal(cmp.matched, true, 'مطابق للأصل');
  assert.deepEqual(r.cues.map((c) => c.text), clean.map((c) => c.text));
});

test('1–5 ثم 6–8: تتمة، ويبقى صفر', () => {
  const r = findContinuation(bundleWith(clean.slice(0, 5)), clean.slice(5));
  assert.equal(r?.n, 1);
  assert.equal(r.adds, 3);
  assert.equal(r.remaining, 0);
});

test('تتمة جزئية: 1–3 ثم 4–5 تضيف 2 ويبقى 3 ناقصة', () => {
  const r = findContinuation(bundleWith(clean.slice(0, 3)), clean.slice(3, 5));
  assert.deepEqual([r?.n, r?.adds, r?.remaining], [1, 2, 3]);
});

test('ترجمة كاملة ثانية للفيديو نفسه: ليست تتمة (تمس مقاطع مترجمة)', () => {
  assert.equal(findContinuation(bundleWith(clean.slice(0, 5)), clean), null);
});

test('ملف يتداخل مع ما تُرجم: ليس تتمة', () => {
  assert.equal(findContinuation(bundleWith(clean.slice(0, 5)), clean.slice(3)), null, '4 و5 مترجمان');
});

test('توقيت مختلف عن البصمة أو أرقام خارجها: ليس تتمة', () => {
  const shifted = clean.slice(5).map((c) => ({ ...c, startMs: c.startMs + 40, endMs: c.endMs + 40 }));
  assert.equal(findContinuation(bundleWith(clean.slice(0, 5)), shifted), null);
  assert.equal(findContinuation(bundleWith(clean.slice(0, 5)), [{ ...clean[7], n: 9 }]), null);
});

test('يملأ مقطعًا فارغًا في موضعه (استبدال لا إدراج)، ولا يمس غيره', () => {
  const holes = clean.map((c) => (c.n === 3 ? { ...c, text: '' } : c));
  const r = findContinuation(bundleWith(holes), [clean[2]]);
  assert.equal(r?.adds, 1);
  assert.deepEqual(r.cues.map((c) => c.text), clean.map((c) => c.text));
});

test('خانتان متأهلتان: لا يُخمَّن، فلا اقتراح', () => {
  assert.equal(findContinuation(bundleWith(clean.slice(0, 5), clean.slice(0, 5)), clean.slice(5)), null);
});

test('بلا ترجمة محفوظة أو بلا بصمة: لا اقتراح (أول رفع لا يتغير)', () => {
  assert.equal(findContinuation(bundleWith(), clean), null);
  const b = bundleWith(clean.slice(0, 5));
  b.slots[0].track.fingerprintId = null;
  assert.equal(findContinuation(b, clean.slice(5)), null);
  assert.equal(findContinuation(null, clean), null);
});

test('planPatchCues: الخطة نفسها من مقاطع في الذاكرة، والخطأ نتيجة لا رمي', () => {
  const ok = planPatchCues(clean.slice(5), { fingerprint: fp, cues: clean.slice(0, 5), target: 'ar' });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.plan.items.map((x) => [x.n, x.action]), [[6, 'insert'], [7, 'insert'], [8, 'insert']]);
  const bad = planPatchCues([{ ...clean[0], startMs: 5 }], { fingerprint: fp, cues: [], target: 'ar' });
  assert.equal(bad.ok, false);
  assert.equal(bad.error.code, 'IM_PATCH_TIME_MISMATCH');
  assert.equal(planPatchCues(clean, { fingerprint: null }).error.code, 'IM_PATCH_NO_REFERENCE');
});
