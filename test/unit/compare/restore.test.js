// الاستعادة اليدوية للتوقيت (P4-AC4): لا تُتاح إلا عند تطابق العدد والترقيم، والمعاينة تُرجع الفروق دون أن تطبّق شيئًا،
// والتطبيق دالة منفصلة لا يستدعيها شيء سوى المستخدم بعد تأكيده، ولا تمسّ النص ولا الأرقام.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRestoreTiming, compare, previewRestoreTiming } from '../../../src/core/compare/index.js';
import { TjError } from '../../../src/core/errors/index.js';
import { parseSrtLenient } from '../../../src/core/srt/lenient.js';
import { validateCues } from '../../../src/core/model/cue.js';
import { baseFingerprint, readSrtFixture } from '../../fixtures/srt/index.js';

const cuesOf = (name) => parseSrtLenient(readSrtFixture(name)).cues;
const fp = baseFingerprint();
const deepFreeze = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    Object.values(o).forEach(deepFreeze);
  }
  return o;
};
const UNAVAILABLE = ['missing.ar.srt', 'dropped-renumbered.ar.srt', 'extra.ar.srt'];

test('المعاينة عند التطابق: كل مقطع يختلف زمنه عن الأصل (ولو دون عتبة الانحراف)، بالقديم والجديد', () => {
  const p = previewRestoreTiming(cuesOf('drifted.ar.srt'), fp);
  assert.equal(p.available, true);
  assert.deepEqual(p.changes, [
    { n: 3, from: { startMs: 6300, endMs: 7800 }, to: { startMs: 6000, endMs: 8000 } },
    { n: 6, from: { startMs: 13600, endMs: 15500 }, to: { startMs: 13500, endMs: 15500 } },
    { n: 7, from: { startMs: 16000, endMs: 18101 }, to: { startMs: 16000, endMs: 18000 } },
  ]);
});

test('مقاطع مطابقة تمامًا: متاحة بلا فروق، والتطبيق ينتج نسخة مساوية', () => {
  const clean = cuesOf('clean.ar.srt');
  assert.deepEqual(previewRestoreTiming(clean, fp), { available: true, changes: [] });
  const applied = applyRestoreTiming(clean, fp);
  assert.deepEqual(applied, clean);
  assert.notEqual(applied[0], clean[0]);
});

test('لا تُتاح عند اختلاف العدد أو الترقيم: معاينة فارغة، والتطبيق يرمي CMP_RESTORE_UNAVAILABLE', () => {
  const clean = cuesOf('clean.ar.srt');
  const renum = (ns) => clean.map((c, i) => ({ ...c, n: ns[i] }));
  const cases = {
    ...Object.fromEntries(UNAVAILABLE.map((f) => [f, cuesOf(f)])),
    'ترقيم مكرر': renum([1, 2, 3, 3, 5, 6, 7, 8]),
    'ترقيم يبدأ من 2': renum([2, 3, 4, 5, 6, 7, 8, 9]),
    'ترتيب مختلف': renum([2, 1, 3, 4, 5, 6, 7, 8]),
    'بلا مقاطع': [],
  };
  for (const [label, cues] of Object.entries(cases)) {
    assert.deepEqual(previewRestoreTiming(cues, fp), { available: false, changes: [] }, label);
    assert.throws(() => applyRestoreTiming(cues, fp), (e) => e instanceof TjError && e.code === 'CMP_RESTORE_UNAVAILABLE' && /[؀-ۿ]/.test(e.message), label);
  }
});

test('بلا بصمة لا استعادة', () => {
  const clean = cuesOf('clean.ar.srt');
  assert.deepEqual(previewRestoreTiming(clean, null), { available: false, changes: [] });
  assert.throws(() => applyRestoreTiming(clean, null), (e) => e.code === 'CMP_RESTORE_UNAVAILABLE');
});

test('الإتاحة في المعاينة والتطبيق هي نفسها في تقرير المقارنة، على كل العينات', () => {
  for (const name of ['clean', 'missing', 'dropped-renumbered', 'extra', 'drifted', 'untranslated'].map((n) => `${n}.ar.srt`)) {
    const cues = cuesOf(name);
    assert.equal(previewRestoreTiming(cues, fp).available, compare(cues, fp).restoreTimingAvailable, name);
  }
});

test('التطبيق يُرجع مقاطع جديدة بأزمنة الأصل، ويحفظ الأرقام والنص حرفيًا، ولا يمسّ المدخلات', () => {
  const drifted = deepFreeze(cuesOf('drifted.ar.srt'));
  const finger = deepFreeze(baseFingerprint());
  const before = JSON.stringify(drifted);
  const restored = applyRestoreTiming(drifted, finger);
  assert.equal(JSON.stringify(drifted), before);
  assert.deepEqual(restored.map((c) => [c.n, c.text]), drifted.map((c) => [c.n, c.text]));
  assert.deepEqual(restored.map((c) => [c.startMs, c.endMs]), finger.cues.map((c) => [c.startMs, c.endMs]));
  assert.deepEqual(validateCues(restored, 'cues', { min: 1 }), { ok: true });
  assert.ok(restored.every((c) => !Object.isFrozen(c)));
  assert.deepEqual(Object.keys(restored[0]), ['n', 'startMs', 'endMs', 'text']);
});

test('بعد التطبيق: لا انحراف ومطابقة، والتطبيق مرتان يعطي النتيجة نفسها، والنص الفارغ والإنجليزي يبقيان', () => {
  const restored = applyRestoreTiming(cuesOf('drifted.ar.srt'), fp);
  const report = compare(restored, fp);
  assert.deepEqual([report.drift, report.matched], [[], true]);
  assert.deepEqual(applyRestoreTiming(restored, fp), restored);
  const un = applyRestoreTiming(cuesOf('untranslated.ar.srt'), fp);
  assert.deepEqual(un.map((c) => c.text), cuesOf('untranslated.ar.srt').map((c) => c.text), 'الاستعادة لا تصلح النص');
});

test('المعاينة لا تطبّق شيئًا ولا تشارك مراجعها: تعديل نتيجتها لا يغيّر المقاطع ولا البصمة', () => {
  const cues = cuesOf('drifted.ar.srt');
  const finger = baseFingerprint();
  const p = previewRestoreTiming(cues, finger);
  p.changes[0].to.startMs = 1;
  p.changes[0].from.startMs = 2;
  p.changes.length = 0;
  assert.deepEqual(cues, cuesOf('drifted.ar.srt'));
  assert.deepEqual(finger, baseFingerprint());
  assert.equal(previewRestoreTiming(cues, finger).changes[0].to.startMs, 6000);
});
