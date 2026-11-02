// فرق ترجمتين والدمج الثلاثي (P11-AC2): الأعداد والقائمة بمحاذاة التوقيت لا بالرقم وحده؛ والدمج يبقي التعديل حيث لم يتغير
// الجديد، ويسرد التعارض ولا يحسمه بصمت، ويرفض عند ضعف الثقة بسبب مكتوب. واختبارات خصائص على 2400 مقطع.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffTranslations, mergeThreeWay } from '../../../src/core/align/index.js';
import { deepFreeze } from '../../fixtures/srt/index.js';
import {
  arabicTwin, dropAt, longTrack, mergeAt, renumber, rng, shiftAll, splitAt,
} from '../../fixtures/v2/index.js';

const EN = longTrack(2400);
const BASE = deepFreeze(arabicTwin(EN));
const edit = (cues, changes) => cues.map((c, i) => (changes[i] ? { ...c, ...changes[i] } : { ...c }));

test('فرق ترجمتين متطابقتين: كل المقاطع بلا تغيير ولا قائمة', () => {
  const d = diffTranslations(BASE, BASE.map((c) => ({ ...c })));
  assert.deepEqual(d, { aligned: true, confidence: 'high', counts: { textChanged: 0, timingChanged: 0, added: 0, removed: 0, unchanged: 2400 }, changes: [] });
});

test('فرق بالأعداد والقائمة: نص، وتوقيت، والاثنان، وإضافة، وحذف', () => {
  const incoming = edit(BASE, {
    3: { text: 'نص جديد' }, 9: { text: 'آخر' }, 40: { startMs: BASE[40].startMs + 200 }, 41: { text: 'ثالث', endMs: BASE[41].endMs - 150 },
  });
  const changed = dropAt(incoming, [500]);
  changed.splice(1200, 0, { n: 9999, startMs: BASE[1199].endMs + 1, endMs: BASE[1199].endMs + 2, text: 'مضاف' });
  const d = diffTranslations(BASE, changed);
  assert.equal(d.aligned, true);
  assert.deepEqual(d.counts, { textChanged: 3, timingChanged: 2, added: 1, removed: 1, unchanged: 2400 - 5 });
  assert.deepEqual(d.changes.map((c) => [c.n, c.kind]), [[4, 'text'], [10, 'text'], [41, 'timing'], [42, 'text-timing'], [501, 'removed'], [9999, 'added']]);
  assert.deepEqual(d.changes[0].before, BASE[3]);
  assert.equal(d.changes[0].after.text, 'نص جديد');
});

test('دون مقارنة مضللة بالرقم: مقطع ساقط بإعادة ترقيم يظهر حذفًا واحدًا، لا تغيير كل ما بعده', () => {
  const incoming = renumber(dropAt(BASE, [100]));
  const d = diffTranslations(BASE, incoming);
  assert.deepEqual(d.counts, { textChanged: 0, timingChanged: 0, added: 0, removed: 1, unchanged: 2399 });
  assert.deepEqual(d.changes, [{ n: 101, kind: 'removed', before: BASE[100], after: null }]);
});

test('الدمج والشطر في الوارد يظهران تغييرين بنيويين بمقاطعهما', () => {
  const d = diffTranslations(BASE, splitAt(mergeAt(BASE, 10), 30));
  assert.deepEqual(d.changes.map((c) => c.kind), ['merged', 'split']);
  assert.equal(d.changes[0].before.length, 2);
  assert.equal(d.changes[1].after.length, 2);
  assert.deepEqual([d.counts.textChanged, d.counts.timingChanged, d.counts.unchanged], [2, 2, 2400 - 3]);
});

test('ترجمتان لا تتقابلان (فيديو آخر): غير محاذاة، والاستبدال كامل بلا قائمة', () => {
  const other = arabicTwin(longTrack(300, { seed: 4242, startMs: 9_000_000 }));
  const d = diffTranslations(BASE, other);
  assert.equal(d.aligned, false);
  assert.equal(d.confidence, 'low');
  assert.deepEqual(d.counts, { textChanged: 0, timingChanged: 0, added: 300, removed: 2400, unchanged: 0 });
  assert.deepEqual(d.changes, []);
});

test('الدمج الثلاثي: يبقي تعديلي حيث لم يتغير الجديد، ويأخذ الجديد حيث لم أعدّل، ويسرد التعارض بالجديد افتراضيًا', () => {
  const mine = edit(BASE, { 10: { text: 'تعديلي 10' }, 50: { text: 'تعديلي 50' }, 77: { startMs: BASE[77].startMs + 300 }, 900: { text: 'تعديلي 900' } });
  const theirs = edit(BASE, {
    50: { text: 'جديد 50' }, 77: { startMs: BASE[77].startMs - 200 }, 300: { text: 'جديد 300' }, 1200: { endMs: BASE[1200].endMs + 100 },
  });
  const r = mergeThreeWay({ base: BASE, mine, theirs });
  assert.equal(r.ok, true);
  assert.equal(r.cues.length, 2400);
  assert.equal(r.cues[10].text, 'تعديلي 10');
  assert.equal(r.cues[900].text, 'تعديلي 900');
  assert.equal(r.cues[300].text, 'جديد 300');
  assert.equal(r.cues[1200].endMs, BASE[1200].endMs + 100);
  // التعارضان: نص 50 وتوقيت 77؛ الناتج يأخذ الجديد فيهما حتى يختار المستخدم.
  assert.deepEqual(r.conflicts.map((c) => c.n), [51, 78]);
  assert.equal(r.cues[50].text, 'جديد 50');
  assert.equal(r.cues[77].startMs, BASE[77].startMs - 200);
  assert.deepEqual(r.conflicts[0].mine, [mine[50]]);
  assert.deepEqual(r.conflicts[0].theirs, [theirs[50]]);
  assert.deepEqual(r.kept, [10, 900]);
  assert.deepEqual(r.taken, [50, 77, 300, 1200]);
});

test('الدمج حقلًا حقلًا: نصي المعدّل مع توقيت الجديد في المقطع نفسه بلا تعارض', () => {
  const mine = edit(BASE, { 5: { text: 'نصي' } });
  const theirs = edit(BASE, { 5: { startMs: BASE[5].startMs + 120, endMs: BASE[5].endMs + 120 } });
  const r = mergeThreeWay({ base: BASE, mine, theirs });
  assert.deepEqual(r.cues[5], { n: 6, startMs: BASE[5].startMs + 120, endMs: BASE[5].endMs + 120, text: 'نصي' });
  assert.deepEqual([r.kept, r.taken, r.conflicts], [[5], [5], []]);
});

test('التغيير نفسه في الطرفين ليس تعارضًا؛ واختيار المستخدم يحسم التعارض فيخرج من القائمة', () => {
  const same = mergeThreeWay({ base: BASE, mine: edit(BASE, { 7: { text: 'واحد' } }), theirs: edit(BASE, { 7: { text: 'واحد' } }) });
  assert.deepEqual([same.conflicts, same.cues[7].text], [[], 'واحد']);

  const mine = edit(BASE, { 7: { text: 'تعديلي' } });
  const theirs = edit(BASE, { 7: { text: 'جديد' } });
  assert.equal(mergeThreeWay({ base: BASE, mine, theirs }).conflicts.length, 1);
  const chosen = mergeThreeWay({ base: BASE, mine, theirs }, { resolve: { 8: 'mine' } });
  assert.deepEqual([chosen.conflicts, chosen.cues[7].text, chosen.kept], [[], 'تعديلي', [7]]);
  const viaMap = mergeThreeWay({ base: BASE, mine, theirs }, { resolve: new Map([[8, 'theirs']]) });
  assert.deepEqual([viaMap.conflicts, viaMap.cues[7].text, viaMap.taken], [[], 'جديد', [7]]);
});

test('بنية في طرف واحد: دمجي يبقى حيث لم يتغير الجديد، ويتعارض حيث غيّره؛ وحذف الجديد يُؤخذ أو يتعارض', () => {
  const mine = mergeAt(BASE, 20);
  const untouched = mergeThreeWay({ base: BASE, mine, theirs: BASE.map((c) => ({ ...c })) });
  assert.equal(untouched.cues.length, 2399);
  assert.equal(untouched.cues[20].text, `${BASE[20].text}\n${BASE[21].text}`);
  assert.deepEqual(untouched.kept, [20]);

  const clash = mergeThreeWay({ base: BASE, mine, theirs: edit(BASE, { 21: { text: 'جديد' } }) });
  assert.deepEqual(clash.conflicts.map((c) => [c.n, c.mine.length, c.theirs.length]), [[21, 1, 2]]);
  assert.equal(clash.cues.length, 2400, 'الجديد افتراضيًا: مقطعان');

  const dropped = mergeThreeWay({ base: BASE, mine: BASE.map((c) => ({ ...c })), theirs: dropAt(BASE, [600]) });
  assert.deepEqual([dropped.cues.length, dropped.conflicts], [2399, []]);
  const editedThenDropped = mergeThreeWay({ base: BASE, mine: edit(BASE, { 600: { text: 'عدّلته' } }), theirs: dropAt(BASE, [600]) });
  assert.deepEqual(editedThenDropped.conflicts.map((c) => [c.n, c.mine.length, c.theirs.length]), [[601, 1, 0]]);
});

test('مقطع أضفته في صمت يبقى؛ وإضافتان متداخلتان من الطرفين تعارض', () => {
  const t = BASE[999].endMs;
  const room = BASE[1000].startMs - t;
  assert.ok(room >= 4, 'فراغ يتسع للإضافة');
  const addMine = [...BASE.slice(0, 1000), { n: 5000, startMs: t + 1, endMs: t + 2, text: 'أضفته' }, ...BASE.slice(1000)];
  const r = mergeThreeWay({ base: BASE, mine: addMine, theirs: BASE.map((c) => ({ ...c })) });
  assert.equal(r.cues.length, 2401);
  assert.equal(r.cues[1000].text, 'أضفته');
  assert.deepEqual(r.kept, [1000]);

  // إضافتان متداخلتان مختلفتان تُضمّان إلى منطقة الأصل المجاورة: تعارض واحد مفتاحه رقم من الأصل القديم (999 و1000 → 1000).
  const addTheirs = [...BASE.slice(0, 1000), { n: 1001, startMs: t + 1, endMs: t + 3, text: 'الجديد' }, ...BASE.slice(1000)];
  const both = mergeThreeWay({ base: BASE, mine: addMine, theirs: addTheirs });
  assert.deepEqual(both.conflicts.map((c) => c.n), [BASE[999].n]);
  assert.deepEqual(both.conflicts[0].mine.map((c) => c.text), [BASE[999].text, 'أضفته', BASE[1000].text]);
  assert.deepEqual(both.conflicts[0].theirs.map((c) => c.text), [BASE[999].text, 'الجديد', BASE[1000].text]);
});

test('مراجعة: تعارض إضافة وتعارض تعديل متجاوران لا يتصادم مفتاحاهما مع ترقيم الجديد؛ والاختيار غير الصالح لا يحسم شيئًا', () => {
  const small = BASE.slice(0, 20);
  const t = small[9].endMs;
  const mine = [...small.slice(0, 10), { n: 900, startMs: t + 1, endMs: t + 3, text: 'إضافتي' }, ...small.slice(10)]
    .map((c) => (c.n === 11 ? { ...c, text: 'تعديلي 11' } : c));
  const theirs = renumber([...small.slice(0, 10), { n: 0, startMs: t + 1, endMs: t + 3, text: 'إضافة الجديد' }, ...small.slice(10)]
    .map((c) => (c.n === 11 ? { ...c, text: 'جديد 11' } : c)));
  const r = mergeThreeWay({ base: small, mine, theirs });
  assert.equal(new Set(r.conflicts.map((c) => c.n)).size, r.conflicts.length, 'مفاتيح التعارض فريدة');
  assert.ok(r.conflicts.every((c) => small.some((b) => b.n === c.n)), 'كل مفتاح رقم من الأصل القديم');

  const one = mergeThreeWay({ base: BASE, mine: edit(BASE, { 7: { text: 'تعديلي' } }), theirs: edit(BASE, { 7: { text: 'جديد' } }) }, { resolve: { 8: 'ours' } });
  assert.deepEqual(one.conflicts.map((c) => c.n), [8], 'قيمة غير mine وtheirs تُبقي التعارض مسرودًا');
});

test('ثقة منخفضة ترفض بسبب مكتوب ولا تُرجع دمجًا', () => {
  const other = arabicTwin(longTrack(2400, { seed: 31337 }));
  const r = mergeThreeWay({ base: BASE, mine: BASE.map((c) => ({ ...c })), theirs: other });
  assert.equal(r.ok, false);
  assert.match(r.reason, /الملف الجديد لا تتقابل مع الأصل القديم بثقة/);
  assert.equal('cues' in r, false);
  const r2 = mergeThreeWay({ base: BASE, mine: other, theirs: BASE.map((c) => ({ ...c })) });
  assert.match(r2.reason, /نسختك المعدّلة/);
});

test('نسختي مزاحة كلها (± للملف) مع تعديلات نص: تُحاذى بالإزاحة والنص، وتبقى إزاحتي وتعديلاتي', () => {
  const mine = shiftAll(edit(BASE, { 15: { text: 'نصي 15' } }), 1500);
  const theirs = edit(BASE, { 400: { text: 'جديد 400' } });
  const r = mergeThreeWay({ base: BASE, mine, theirs });
  assert.equal(r.ok, true);
  assert.deepEqual(r.conflicts, []);
  assert.equal(r.cues[15].text, 'نصي 15');
  assert.equal(r.cues[15].startMs, BASE[15].startMs + 1500);
  assert.equal(r.cues[400].text, 'جديد 400');
  assert.equal(r.cues[400].startMs, BASE[400].startMs + 1500, 'توقيتي المعدّل يبقى حيث لم يغيّر الجديد التوقيت');
});

test('خاصية: تعديلات متفرقة في الطرفين على مواضع منفصلة تُدمج كلها بلا تعارض؛ والجديد المطابق للأصل يعيد نسختي كما هي', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const r = rng(seed);
    const mineAt = new Set();
    const theirsAt = new Set();
    while (mineAt.size < 40) mineAt.add(Math.floor(r() * 2400));
    while (theirsAt.size < 40) {
      const i = Math.floor(r() * 2400);
      if (!mineAt.has(i)) theirsAt.add(i);
    }
    const mine = BASE.map((c, i) => (mineAt.has(i) ? { ...c, text: `م${seed}-${i}` } : { ...c }));
    const theirs = BASE.map((c, i) => (theirsAt.has(i) ? { ...c, text: `ج${seed}-${i}` } : { ...c }));
    const out = mergeThreeWay({ base: BASE, mine, theirs });
    assert.equal(out.ok, true);
    assert.deepEqual(out.conflicts, []);
    out.cues.forEach((c, i) => assert.equal(c.text, mineAt.has(i) ? mine[i].text : theirsAt.has(i) ? theirs[i].text : BASE[i].text));
    assert.deepEqual(out.kept, [...mineAt].sort((x, y) => x - y));
    assert.deepEqual(out.taken, [...theirsAt].sort((x, y) => x - y));

    const same = mergeThreeWay({ base: BASE, mine, theirs: BASE.map((c) => ({ ...c })) });
    assert.deepEqual(same.cues, mine);
  }
});
