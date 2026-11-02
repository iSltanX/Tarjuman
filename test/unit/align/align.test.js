// المحاذاة بالتوقيت (P11-AC1): التقابل ودرجة الثقة والأسباب على ملفات مركّبة من 2400 مقطع وعيّنتي P1 الحقيقيتين، واختبار
// خصائص: تحويلات عشوائية معروفة الأصل (دمج وشطر وحذف وإضافة) تُستعاد بنيتها كما هي، والثقة منخفضة عند الشك.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alignCues, isIdentity, toBlocks } from '../../../src/core/align/index.js';
import { convertTrack } from '../../../src/core/convert/index.js';
import { parseSrtLenient } from '../../../src/core/srt/lenient.js';
import { realTrack } from '../../helpers/fixtures.js';
import { deepFreeze } from '../../fixtures/srt/index.js';
import {
  REAL_ARABIC, arabicTwin, driftSome, dropAt, longTrack, mergeSplitShift, realArabic, renumber, rng, shiftAll,
} from '../../fixtures/v2/index.js';

const EN = deepFreeze(longTrack(2400));
const AR = deepFreeze(arabicTwin(EN));
const identity = (r, n) => r.pairs.length === n && r.pairs.every((p, i) => p.a === i && p.b === i);
const has = (r, fragment) => r.reasons.some((x) => x.includes(fragment));

test('ترجمة سليمة من 2400 مقطع: هوية تامة بثقة عالية وبلا أسباب', () => {
  const r = alignCues(EN, AR);
  assert.equal(r.confidence, 'high');
  assert.ok(identity(r, EN.length));
  assert.deepEqual(r.reasons, []);
  assert.ok(isIdentity(r, EN.length, AR.length));
});

test('عيّنتا P1 الحقيقيتان ومقابلاهما العربيان (يدوي عادي 427، وتلقائي «مقاطع أطول» 729): هوية بثقة عالية', () => {
  const manual = realTrack('manual');
  const arManual = parseSrtLenient(realArabic(REAL_ARABIC.manual)).cues;
  const r1 = alignCues(manual.cues, arManual);
  assert.equal(manual.cues.length, 427);
  assert.ok(isIdentity(r1, 427, arManual.length), r1.reasons.join(' | '));

  const asr = realTrack('asr');
  const long = convertTrack({ body: asr.body, trackKind: 'asr', durationMs: asr.fixture.durationMs, mode: 'long' });
  const arLong = parseSrtLenient(realArabic(REAL_ARABIC.asrLong)).cues;
  const r2 = alignCues(long.cues, arLong);
  assert.equal(arLong.length, 729);
  assert.ok(isIdentity(r2, long.cues.length, 729), r2.reasons.join(' | '));
});

test('دمج وشطر يعيدان العدد إلى أصله مع إزاحة بمقطع: تُكشف البنية والإزاحة، والمحاذاة ليست هوية', () => {
  const { cues, mergeIndex, splitIndex } = mergeSplitShift(AR, { mergeIndex: 400, splitIndex: 1600 });
  assert.equal(cues.length, EN.length);
  assert.ok(cues.every((c, i) => c.n === i + 1), 'الترقيم متسلسل كالأصل');
  const r = alignCues(EN, cues);
  assert.equal(r.confidence, 'high');
  assert.equal(isIdentity(r, EN.length, cues.length), false);
  const blocks = toBlocks(r.pairs);
  const merge = blocks.find((b) => b.a.length === 2);
  const split = blocks.find((b) => b.b.length === 2);
  assert.deepEqual(merge, { a: [mergeIndex, mergeIndex + 1], b: [mergeIndex] });
  assert.deepEqual(split, { a: [splitIndex], b: [splitIndex - 1, splitIndex] });
  assert.equal(blocks.length, EN.length - 1, 'كل ما عداهما 1:1 (الدمج كتلة من مقطعين، والشطر كتلة من مقطع)');
  // بين الدمج والشطر يقابل المقطع j الأصل j+1.
  const mid = blocks.find((b) => b.b[0] === 1000);
  assert.deepEqual(mid, { a: [1001], b: [1000] });
  assert.ok(has(r, 'دمج') && has(r, 'شطر') && has(r, 'الترقيم لا يطابق التوقيت'), r.reasons.join(' | '));
});

test('نقص بترقيم أصلي، ونقص بإعادة ترقيم: التقابل بالتوقيت نفسه في الحالتين', () => {
  const dropped = [7, 300, 301, 1999];
  const kept = dropAt(AR, dropped);
  for (const cues of [kept, renumber(kept)]) {
    const r = alignCues(EN, cues);
    assert.equal(r.confidence, 'high', r.reasons.join(' | '));
    assert.deepEqual(r.pairs.filter((p) => p.b === null).map((p) => p.a), dropped);
    assert.equal(r.pairs.filter((p) => p.a === null).length, 0);
    assert.ok(has(r, 'مقاطع في الأصل بلا مقابل'));
  }
  assert.ok(has(alignCues(EN, renumber(kept)), 'الترقيم لا يطابق التوقيت'));
});

test('انحراف يسير في 5% من المقاطع (±300ms): هوية بثقة عالية', () => {
  const { cues, touched } = driftSome(AR, { rate: 0.05, maxMs: 300 });
  assert.ok(touched.length > 80);
  const r = alignCues(EN, cues);
  assert.ok(isIdentity(r, EN.length, cues.length), r.reasons.join(' | '));
});

test('إزاحة عامة (+1.7 ث لكل الأزمنة) تُقدَّر وتُطرح بسبب ظاهر، والتقابل هوية؛ وإيقاف التقدير يُضعف الثقة', () => {
  const shifted = shiftAll(AR, 1700);
  const r = alignCues(EN, shifted);
  assert.ok(identity(r, EN.length));
  assert.equal(r.confidence, 'high');
  assert.ok(has(r, 'إزاحة عامة 1.7'), r.reasons.join(' | '));
  assert.equal(alignCues(EN, shifted, { offset: 0 }).confidence, 'low');
});

test('مقطع واحد شاذ الزمن (خطأ في سطر توقيت) يبقى مع رقمه بمرساة الترقيم، والثقة عالية', () => {
  const cues = AR.map((c, i) => (i === 1200 ? { ...c, startMs: c.startMs + 3_600_000, endMs: c.endMs + 3_600_000 } : { ...c }));
  const r = alignCues(EN, cues);
  assert.ok(isIdentity(r, EN.length, cues.length), r.reasons.join(' | '));
  assert.ok(has(r, 'إلا الرقم') && has(r, 'غير متصاعدة'));
});

test('ثقة منخفضة عند الشك: ملف فيديو آخر، وقائمة فارغة، ومقاطع كثيرة لا يجمعها إلا الرقم', () => {
  const other = arabicTwin(longTrack(2400, { seed: 999 }));
  const r = alignCues(EN, other);
  assert.equal(r.confidence, 'low');
  assert.ok(r.reasons.length > 0);
  assert.equal(alignCues(EN, []).confidence, 'low');
  assert.equal(alignCues([], AR).confidence, 'low');
  // نصف المقاطع بأزمنة بعيدة عن مواضعها والترقيم وحده يجمعها.
  const scrambled = AR.map((c, i) => (i % 2 ? { ...c, startMs: c.startMs + 90_000, endMs: c.endMs + 90_000 } : { ...c }));
  assert.equal(alignCues(EN, scrambled).confidence, 'low');
});

test('مقاطع متكدسة في لحظة واحدة لا تستنزف الذاكرة ولا تنهار حتى 50,000: ثقة منخفضة بسبب ظاهر', () => {
  for (const count of [4000, 50000]) {
    const piled = Array.from({ length: count }, (_, i) => ({ n: i + 1, startMs: 1000, endMs: 2000, text: 'x' }));
    const r = alignCues(piled, piled);
    assert.equal(r.confidence, 'low');
    assert.ok(has(r, 'متكدسة'));
  }
});

test('ملف صغير كل أزواجه لا يجمعها إلا الرقم ليس محاذاة متحققة؛ ومقطع شاذ واحد في ملف من ثمانية مقبول', () => {
  const a = [{ n: 1, startMs: 1000, endMs: 3000, text: '' }, { n: 2, startMs: 4000, endMs: 6000, text: '' }];
  const far = a.map((c) => ({ ...c, startMs: c.startMs + 14000, endMs: c.endMs + 14000 }));
  const r = alignCues(a, far, { offset: 0 });
  assert.equal(r.confidence, 'low');
  assert.equal(isIdentity(r, 2, 2), false);
  const eight = longTrack(8, { seed: 3 });
  const oneOff = eight.map((c, i) => (i === 4 ? { ...c, startMs: c.startMs + 600_000, endMs: c.endMs + 600_000 } : c));
  assert.ok(isIdentity(alignCues(eight, oneOff), 8, 8));
});

test('انجراف تدريجي (4ms لكل مقطع حتى 0.8 ث) هوية بثقة عالية؛ ونصف المقاطع مبعثرة بالرقم وحده منخفضة', () => {
  const a = Array.from({ length: 200 }, (_, i) => ({ n: i + 1, startMs: i * 3000, endMs: i * 3000 + 2000, text: '' }));
  const drift = a.map((c, i) => ({ ...c, startMs: c.startMs + 4 * i, endMs: c.endMs + 4 * i }));
  const r = alignCues(a, drift);
  assert.ok(isIdentity(r, 200, 200), r.reasons.join(' | '));
  assert.ok(has(r, 'انجراف تدريجي'));
  const scattered = a.map((c, i) => (i % 2 ? { ...c, startMs: c.startMs + 90_000, endMs: c.endMs + 90_000 } : c));
  assert.equal(alignCues(a, scattered).confidence, 'low');
});

/**
 * تحويلات عشوائية متباعدة بأصل معروف: لكل مقطع ناتج مواضع الأصل التي يغطيها (src)، والمحذوف لا يظهر، والمضاف بلا أصل.
 * @returns {{ cues: object[], src: number[][], dropped: number[] }}
 */
function mutate(base, seed, ops = 12) {
  const r = rng(seed);
  const used = new Set();
  const plan = [];
  while (plan.length < ops) {
    const i = 5 + Math.floor(r() * (base.length - 10));
    if ([...used].some((u) => Math.abs(u - i) < 4)) continue;
    used.add(i);
    plan.push({ i, kind: ['merge', 'split', 'drop', 'insert'][Math.floor(r() * 4)] });
  }
  plan.sort((x, y) => x.i - y.i);
  const out = [];
  const src = [];
  const dropped = [];
  const at = new Map(plan.map((p) => [p.i, p.kind]));
  for (let i = 0; i < base.length; i++) {
    const c = base[i];
    const kind = at.get(i);
    if (kind === 'merge') {
      const d = base[i + 1];
      out.push({ n: 0, startMs: c.startMs, endMs: d.endMs, text: `${c.text}\n${d.text}` });
      src.push([i, i + 1]);
      i++;
    } else if (kind === 'split') {
      const mid = Math.round((c.startMs + c.endMs) / 2);
      out.push({ n: 0, startMs: c.startMs, endMs: mid, text: 'أ' }, { n: 0, startMs: mid, endMs: c.endMs, text: 'ب' });
      src.push([i], [i]);
    } else if (kind === 'drop') {
      dropped.push(i);
    } else {
      out.push({ ...c });
      src.push([i]);
      if (kind === 'insert') {
        // مقطع جديد في صمت مصطنع بعد المقطع: يُزاح ما بعده ليتسع.
        const t = c.endMs + 100;
        out.push({ n: 0, startMs: t, endMs: t + 1500, text: 'مضاف' });
        src.push([]);
        for (let k = i + 1; k < base.length; k++) base[k] = { ...base[k], startMs: base[k].startMs + 3000, endMs: base[k].endMs + 3000 };
      }
    }
  }
  return { cues: out.map((c, k) => ({ ...c, n: k + 1 })), src, dropped };
}

test('خاصية: 24 ملفًا من 2000 مقطع بتحويلات عشوائية متباعدة، تُستعاد بنية كل منها كما هي بثقة عالية', () => {
  for (let seed = 1; seed <= 24; seed++) {
    const original = longTrack(2000, { seed: 100 + seed });
    const reference = original.map((c) => ({ ...c }));
    const work = original.map((c) => ({ ...c }));
    const { cues, src, dropped } = mutate(work, seed);
    // الإضافة أزاحت ما بعدها في الأصل المعدّل؛ المرجع يُزاح مثله ليبقى التقابل الزمني (الإضافة صمت جديد لا انحراف).
    work.forEach((c, i) => { reference[i] = { ...reference[i], startMs: c.startMs, endMs: c.endMs }; });
    const r = alignCues(reference, cues);
    assert.equal(r.confidence, 'high', `بذرة ${seed}: ${r.reasons.join(' | ')}`);
    const got = new Map();
    for (const p of r.pairs) {
      if (p.b === null) continue;
      if (!got.has(p.b)) got.set(p.b, []);
      if (p.a !== null) got.get(p.b).push(p.a);
    }
    src.forEach((expected, j) => assert.deepEqual(got.get(j) ?? [], expected, `بذرة ${seed}، المقطع ${j}`));
    assert.deepEqual(r.pairs.filter((p) => p.b === null).map((p) => p.a), dropped, `بذرة ${seed}: المحذوف`);
  }
});

test('خاصية: المحاذاة لا تعدّل مدخلاتها، وكل موضع يظهر في الأزواج، والأزواج رتيبة', () => {
  const { cues } = mergeSplitShift(AR);
  const frozen = deepFreeze(cues.map((c) => ({ ...c })));
  const r = alignCues(EN, frozen);
  const as = r.pairs.filter((p) => p.a !== null).map((p) => p.a);
  const bs = r.pairs.filter((p) => p.b !== null).map((p) => p.b);
  assert.deepEqual([...new Set(as)], EN.map((_, i) => i));
  assert.deepEqual([...new Set(bs)], frozen.map((_, i) => i));
  assert.ok(as.every((x, i) => i === 0 || x >= as[i - 1]) && bs.every((x, i) => i === 0 || x >= bs[i - 1]));
});

test('الأداء: محاذاة 20,000 مقطع بدمج وشطر في أقل من ثانيتين', () => {
  const big = longTrack(20000, { seed: 77 });
  const { cues } = mergeSplitShift(arabicTwin(big), { mergeIndex: 3000, splitIndex: 15000 });
  const t0 = performance.now();
  const r = alignCues(big, cues);
  const ms = performance.now() - t0;
  assert.equal(r.confidence, 'high');
  assert.ok(ms < 2000, `${Math.round(ms)}ms`);
});
