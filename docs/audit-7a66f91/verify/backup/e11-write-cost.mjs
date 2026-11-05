// E-11: كلفة كتابة بسيطة (± إزاحة لخانة) لحزمة كبيرة: ثلاث ترجمات مربوطة ببصمة بانحراف 150ms (> 100) فلا يختصر
// trackComparison إلى التقرير المحفوظ، وذاكرته بهوية مصفوفة المقاطع (WeakMap) وكل كتابة تنسخ الحزمة.
import { createMemoryArea, createStore, load, out } from './_h.mjs';

const { withSlotOffset, withSlotUpload } = await load('src/core/model/bundle.js');
const { withExport } = await load('src/core/model/transitions.js');
const { trackComparison } = await load('src/core/compare/current.js');
const ID = 'AAAAAAAAAAA';
const now = '2026-11-01T00:00:00.000Z';

async function build(N, withFp) {
  const en = Array.from({ length: N }, (_, i) => ({ n: i + 1, startMs: 1000 + i * 2500, endMs: 3000 + i * 2500, text: `line ${i + 1}` }));
  const fp = { id: 'fp_big0000001', videoId: ID, trackKey: 'en|manual', mode: 'normal', count: N, cues: en.map(({ n, startMs, endMs }) => ({ n, startMs, endMs })), textHash: 'fnv1a64:0123456789abcdef', fileName: null, createdAt: now, parts: null };
  const store = createStore({ area: createMemoryArea({ unlimited: true }) });
  await store.updateVideo(ID, () => withExport(null, { videoId: ID, englishTrack: { key: 'en|manual', lang: 'en', kind: 'manual', capturedAt: now, source: 'capture', cues: en }, fingerprint: fp }, now));
  for (const slot of [1, 2, 3]) {
    const ar = en.map((c) => ({ ...c, startMs: c.startMs + 150, text: `ترجمة ${slot} ${c.n}` }));
    await store.updateBundle(ID, (b) => withSlotUpload(b, slot, { videoId: ID, fileName: `s${slot}.srt`, cues: ar, fingerprintId: withFp ? fp.id : null, comparison: null, notes: [] }, now, { replace: true, activate: slot === 1 }).bundle);
  }
  return store;
}
for (const N of [1500, 5000, 20000]) {
  for (const withFp of [true, false]) {
    const store = await build(N, withFp);
    const times = [];
    for (let k = 0; k < 3; k++) {
      const t = performance.now();
      await store.updateBundle(ID, (b) => withSlotOffset(b, 1, (k + 1) * 100, now));
      times.push(Math.round(performance.now() - t));
    }
    // كلفة مقارنة واحدة على نسخة جديدة من المسار (ما يحدث بعد structuredClone في كل كتابة).
    const b = await store.getBundle(ID);
    const t1 = performance.now();
    trackComparison(structuredClone(b.slots[1].track), b.record.fingerprints);
    const cmpMs = Math.round(performance.now() - t1);
    const same = b.slots[1].track;
    trackComparison(same, b.record.fingerprints);
    const t2 = performance.now();
    trackComparison(same, b.record.fingerprints);
    const cmpMemoMs = +(performance.now() - t2).toFixed(2);
    out(`N=${N} fingerprint=${withFp}`, { writeMs: times, oneComparisonFreshMs: cmpMs, oneComparisonSameArrayMs: cmpMemoMs });
  }
}
