// E-1: ما الذي تكتبه نقرة ± واحدة في التخزين؟ (مفاتيح وبايتات set) لفيديو بترجمة نشطة من 2400 مقطع وخانتين أخريين.
import { imp, log } from './common.mjs';
const { createController } = await imp('src/content/controller.js');
const { createStore } = await imp('src/core/store/index.js');
const { createMemoryArea } = await imp('test/helpers/chrome-storage.js');
const { NOW, fakeExtractor, makeCues, englishTrack, fingerprint, comparison } = await imp('test/helpers/fixtures.js');

const A = 'AAAAAAAAAAA';
const N = 2400;
const ar = (label) => ({
  fileName: `${A}.${label}.ar.srt`, importedAt: NOW, original: makeCues(N, { text: (i) => `${label} سطر عربي متوسط الطول رقم ${i} للتجربة` }),
  current: null, editedAt: null, fingerprintId: null, comparison: null, notes: [],
});
const track = englishTrack({ cues: makeCues(N, { text: (i) => `english line number ${i} for the test` }) });
const fp = fingerprint({ videoId: A, track });
const t1 = ar('أولى');
const bundle = {
  videoId: A,
  record: { schema: 1, videoId: A, title: 'عنوان', durationMs: N * 2500, createdAt: NOW, updatedAt: NOW, rev: 1, english: [track], fingerprints: [fp], arabic: structuredClone(t1), view: { displayOffsetMs: 0, displayMode: 'ar' } },
  active: 1,
  slots: [
    { n: 1, name: null, track: t1, offsetMs: 0, marks: [], position: null },
    { n: 2, name: 'ثانية', track: ar('ثانية'), offsetMs: 0, marks: [], position: null },
    { n: 3, name: null, track: ar('ثالثة'), offsetMs: 0, marks: [], position: null },
  ],
  previous: null,
};
let clock = Date.parse(NOW);
const now = () => (clock += 1000);
const area = createMemoryArea({ unlimited: true });
const seed = createStore({ area, now });
await seed.updateBundle(A, () => bundle);
await area.flush();
const store = createStore({ area, now });
const c = createController({ store, extractor: fakeExtractor(), page: { title: () => 'عنوان', durationMs: () => N * 2500 }, now });
await c.start(A);
const sizes = Object.entries(area.dump()).map(([k, v]) => [k, k.length + JSON.stringify(v).length]);
log('المفاتيح المخزنة وأحجامها:', JSON.stringify(sizes));
const realSet = area.set.bind(area);
const writes = [];
area.set = async (items) => {
  writes.push(Object.entries(items).map(([k, v]) => [k, k.length + JSON.stringify(v).length]));
  return realSet(items);
};
for (let i = 0; i < 3; i++) {
  const t0 = performance.now();
  await c.nudgeOffset(1);
  log(`نقرة ${i + 1}: زمن الوعد في Node ≈ ${(performance.now() - t0).toFixed(1)}ms | المكتوب:`, JSON.stringify(writes.at(-1)), '| المجموع', writes.at(-1).reduce((s, [, b]) => s + b, 0), 'بايت');
}
