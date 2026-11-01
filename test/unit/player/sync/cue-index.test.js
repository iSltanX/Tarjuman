// فهرس بحث المقاطع: الحدود (البداية شاملة والنهاية غير شاملة)، والفجوات، والتداخل وعدم الترتيب،
// ونوافذ [from, to) التي يعتمد عليها المحرّك في تخطي البحث، بمقارنة عشوائية مع بحث خطي مرجعي.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCueIndex, indexFor } from '../../../../src/player/sync/cue-index.js';

const cue = (n, startMs, endMs) => ({ n, startMs, endMs, text: `c${n}` });

/** المرجع: بين المقاطع النشطة (start ≤ ms < end) الأحدث بداية، وعند التساوي الأكبر ترتيبًا بعد الفرز المستقر. */
function reference(cues, ms) {
  const sorted = cues.map((c, i) => ({ c, i })).sort((a, b) => a.c.startMs - b.c.startMs || a.i - b.i).map((x) => x.c);
  let found = null;
  for (const c of sorted) if (c.startMs <= ms && ms < c.endMs) found = c;
  return found;
}

test('مقاطع متتالية: البداية شاملة والنهاية غير شاملة، والفجوة بلا مقطع', () => {
  const idx = createCueIndex([cue(1, 1000, 2000), cue(2, 2000, 3000), cue(3, 4000, 5000)]);
  assert.equal(idx.find(0).cue, null);
  assert.equal(idx.find(999).cue, null);
  assert.equal(idx.find(1000).cue.n, 1);
  assert.equal(idx.find(1999).cue.n, 1);
  assert.equal(idx.find(2000).cue.n, 2, 'نهاية الأول هي بداية الثاني');
  assert.equal(idx.find(3000).cue, null);
  assert.equal(idx.find(3999).cue, null);
  assert.equal(idx.find(4000).cue.n, 3);
  assert.equal(idx.find(5000).cue, null);
  assert.equal(idx.find(10 ** 9).cue, null);
});

test('زمن سالب (إزاحة تقدّم الترجمة قبل الصفر) لا يُعرض ولا يخطئ', () => {
  const idx = createCueIndex([cue(1, 0, 1000)]);
  const hit = idx.find(-500);
  assert.equal(hit.cue, null);
  assert.equal(hit.from, -Infinity);
  assert.equal(hit.to, 0);
  assert.equal(idx.find(0).cue.n, 1);
});

test('ملف فارغ', () => {
  const idx = createCueIndex([]);
  assert.equal(idx.size, 0);
  assert.deepEqual(idx.find(500), { cue: null, from: -Infinity, to: Infinity });
});

test('النافذة: داخلها يبقى الجواب نفسه، وخارجها يتغير أو يُعاد البحث', () => {
  const idx = createCueIndex([cue(1, 1000, 2000), cue(2, 4000, 5000)]);
  const a = idx.find(1500);
  assert.deepEqual([a.from, a.to], [1000, 2000]);
  const gap = idx.find(3000);
  assert.deepEqual([gap.cue, gap.from, gap.to], [null, 2000, 4000]);
  const before = idx.find(10);
  assert.deepEqual([before.cue, before.from, before.to], [null, -Infinity, 1000]);
  const after = idx.find(6000);
  assert.deepEqual([after.cue, after.from, after.to], [null, 5000, Infinity]);
});

test('مقاطع متداخلة: الأحدث بداية يظهر، ثم يعود الأقدم الباقي نشطًا', () => {
  const long = cue(1, 0, 10000);
  const short = cue(2, 3000, 4000);
  const idx = createCueIndex([long, short]);
  assert.equal(idx.find(1000).cue, long);
  assert.equal(idx.find(3500).cue, short);
  const after = idx.find(4000);
  assert.equal(after.cue, long, 'انتهى القصير والطويل ما زال نشطًا');
  assert.equal(idx.find(10000).cue, null);
});

test('ملف غير مرتب البدايات يُفرز دون تعديل المصفوفة الأصلية', () => {
  const cues = [cue(1, 5000, 6000), cue(2, 1000, 2000), cue(3, 3000, 4000)];
  const copy = structuredClone(cues);
  const idx = createCueIndex(cues);
  assert.deepEqual(cues, copy);
  assert.equal(idx.find(1500).cue.n, 2);
  assert.equal(idx.find(3500).cue.n, 3);
  assert.equal(idx.find(5500).cue.n, 1);
});

test('مقارنة عشوائية مع المرجع، وثبات الجواب داخل كل نافذة', () => {
  let seed = 20261101;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let round = 0; round < 40; round++) {
    const count = 1 + Math.floor(rnd() * 25);
    const cues = Array.from({ length: count }, (_, i) => {
      const s = Math.floor(rnd() * 60) * 100;
      return cue(i + 1, s, s + Math.floor(rnd() * 25) * 100);
    });
    if (round % 2) cues.sort((a, b) => a.startMs - b.startMs); // نصف الجولات مرتبة
    const idx = createCueIndex(cues);
    for (let ms = -200; ms <= 9000; ms += 50) {
      const hit = idx.find(ms);
      assert.equal(hit.cue, reference(cues, ms), `ms=${ms} جولة ${round}`);
      assert.ok(ms >= hit.from && ms < hit.to, 'الزمن داخل نافذته');
      // أي زمن آخر داخل النافذة (ولو سابقًا) يعطي الجواب نفسه.
      for (const probe of [hit.from, (hit.from + ms) / 2, ms, (ms + Math.min(hit.to, 12000)) / 2, hit.to - 1]) {
        if (!Number.isFinite(probe) || probe < hit.from || probe >= hit.to) continue;
        assert.equal(reference(cues, probe), hit.cue, `نافذة [${hit.from}، ${hit.to}) عند ${probe} جولة ${round}`);
      }
    }
  }
});

test('indexFor يعيد الفهرس نفسه لمرجع المصفوفة نفسه فلا يُعاد البناء', () => {
  const cues = [cue(1, 0, 1000)];
  assert.equal(indexFor(cues), indexFor(cues));
  assert.notEqual(indexFor(cues), indexFor([...cues]));
});
