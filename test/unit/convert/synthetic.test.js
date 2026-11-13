// اختبارات المحوّل والثوابت على بنى اصطناعية تحاكي json3. العينات الحقيقية في real-fixtures.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJson3, dedupeExact, ConvertError } from '../../../src/core/convert/json3.js';
import { convertManual } from '../../../src/core/convert/manual.js';
import { convertAsr, detectRollingOverlap } from '../../../src/core/convert/asr.js';
import { checkInvariants } from '../../../src/core/convert/invariants.js';
import { convertTrack } from '../../../src/core/convert/index.js';
import { splitWords, wrapLines } from '../../../src/core/convert/text.js';

const body = (events) => JSON.stringify({ wireMagic: 'pb3', events });
const win = { tStartMs: 0, dDurationMs: 99999, id: 1, wpWinPosId: 1, wsWinStyleId: 1 };

test('parseJson3: الأحداث النصية فقط، وأخطاء واضحة', () => {
  const p = parseJson3(body([win, { tStartMs: 10, dDurationMs: 5, segs: [{ utf8: 'Hi' }] }, { tStartMs: 20, aAppend: 1, segs: [{ utf8: '\n' }] }]));
  assert.equal(p.events.length, 1);
  assert.equal(p.stats.windowEvents, 1);
  assert.equal(p.stats.newlineEvents, 1);
  assert.throws(() => parseJson3(''), (e) => e instanceof ConvertError && e.code === 'EX_EMPTY_BODY');
  assert.throws(() => parseJson3('<transcript/>'), (e) => e.code === 'EX_UNSUPPORTED_FORMAT');
  assert.throws(() => parseJson3('{}'), (e) => e.code === 'EX_UNSUPPORTED_FORMAT');
  assert.throws(() => parseJson3(body([win])), (e) => e.code === 'EX_EMPTY_BODY');
});

test('dedupeExact: يحذف المطابق حرفيًا فقط', () => {
  const p = parseJson3(body([
    { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: 'a b' }] },
    { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: 'a b' }] },
    { tStartMs: 0, dDurationMs: 1001, segs: [{ utf8: 'a b' }] },
    { tStartMs: 2000, dDurationMs: 1000, segs: [{ utf8: 'c' }] },
    { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: 'a b' }] },
  ]));
  const d = dedupeExact(p.events);
  assert.equal(d.removed, 2);
  assert.equal(d.events.length, 3);
});

test('اليدوي: القصّ والدمج دون فقد نص', () => {
  const p = parseJson3(body([
    { tStartMs: 0, dDurationMs: 3000, segs: [{ utf8: 'top line' }] },
    { tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: 'bottom line' }] },
    { tStartMs: 1900, dDurationMs: 1000, segs: [{ utf8: 'next  one\n second' }] },
    { tStartMs: 5000, segs: [{ utf8: 'no duration' }] },
  ]));
  const { cues, report } = convertManual(p.events);
  assert.deepEqual(cues, [
    { startMs: 0, endMs: 1900, text: 'top line\nbottom line' },
    { startMs: 1900, endMs: 2900, text: 'next one\nsecond' },
    { startMs: 5000, endMs: 7000, text: 'no duration' },
  ]);
  assert.equal(report.merged, 1);
  const words = p.events.flatMap((e) => splitWords(e.text));
  assert.equal(checkInvariants({ sourceWords: words, cues, durationMs: 8000 }).ok, true);
});

function asrEvent(start, dur, words) {
  return { tStartMs: start, dDurationMs: dur, wWinId: 1, segs: words.map(([t, w], i) => ({ utf8: i ? ` ${w}` : w, ...(i ? { tOffsetMs: t } : {}), acAsrConf: 0 })) };
}

test('ASR: كلمات كاملة بالترتيب، ومقاطع بلا تداخل', () => {
  const events = [
    win,
    asrEvent(100, 5000, [[0, 'so'], [300, 'today'], [600, "we're"], [900, 'going']]),
    { tStartMs: 2000, wWinId: 1, aAppend: 1, segs: [{ utf8: '\n' }] },
    asrEvent(2000, 5000, [[0, 'to'], [250, 'talk'], [500, 'about'], [800, 'captions.']]),
    asrEvent(4500, 3000, [[0, 'Then'], [2000, 'after'], [2200, 'a'], [2400, 'pause']]),
  ];
  const r = convertTrack({ body: body(events), trackKind: 'asr', durationMs: 10000 });
  assert.equal(r.ok, true, JSON.stringify(r.invariants));
  assert.deepEqual(r.cues.map((c) => c.text.replace(/\n/g, ' ')), ["so today we're going", 'to talk about captions.', 'Then', 'after a pause']);
  assert.equal(r.cues[0].endMs, r.cues[1].startMs);
  assert.equal(r.report.inferredKind, 'asr');
  assert.match(r.srt, /^1\n00:00:00,100 --> /);
});

test('ASR: كلمة مقسومة على مقطعين جزئيين بلا مسافة تبقى كلمة واحدة', () => {
  const ev = { tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: 'don' }, { utf8: "'t", tOffsetMs: 200 }, { utf8: ' stop', tOffsetMs: 400 }] };
  const r = convertTrack({ body: body([ev]), trackKind: 'asr', durationMs: 3000 });
  assert.equal(r.ok, true);
  assert.equal(r.cues[0].text, "don't stop");
});

test('ASR: الصيغة المتدحرجة توقف التحويل ولا تُزال تخمينًا', () => {
  // الحدث الثاني يعيد ذيل الأول بأزمنته نفسها (إعادة عرض). أما التكرار بأزمنة لاحقة فكلام جديد يُحوَّل (تدقيق 7a66f91، U28،
  // واختباراته في c4-convert.test.js).
  const events = [
    asrEvent(0, 5000, [[0, 'one'], [1000, 'two'], [2000, 'three'], [3000, 'four']]),
    asrEvent(1000, 5000, [[0, 'two'], [1000, 'three'], [2000, 'four'], [3000, 'five']]),
  ];
  const p = parseJson3(body(events));
  assert.ok(detectRollingOverlap(p.events, 3));
  const r = convertTrack({ body: body(events), trackKind: 'asr', durationMs: 6000 });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'EX_UNSUPPORTED_FORMAT');
});

test('ASR: الأحداث المكررة حرفيًا تُحذف وتُعدّ', () => {
  const e = asrEvent(0, 2000, [[0, 'hello'], [300, 'world']]);
  const r = convertTrack({ body: body([e, e, asrEvent(2500, 1000, [[0, 'again']])]), trackKind: 'asr', durationMs: 4000 });
  assert.equal(r.ok, true);
  assert.equal(r.report.duplicatesRemoved, 1);
  assert.equal(r.cues.map((c) => c.text).join(' '), 'hello world again');
});

test('ASR: لا يُقسم المقطع بين كلمتين بالزمن نفسه، والطول يُلفّ إلى سطرين', () => {
  const long = Array.from({ length: 30 }, (_, i) => [0, `word${i}`]);
  const r = convertTrack({ body: body([asrEvent(0, 5000, long)]), trackKind: 'asr', durationMs: 6000 });
  assert.equal(r.ok, true);
  assert.equal(r.cues.length, 1);
  const q = convertTrack({ body: body([asrEvent(0, 5000, long.map(([, w], i) => [i * 100, w]))]), trackKind: 'asr', durationMs: 6000 });
  assert.equal(q.ok, true);
  for (const c of q.cues) for (const line of c.text.split('\n')) assert.ok(line.length <= 42, line);
});

test('ASR (ع-٣): مجموعة دون 84 محرفًا لا تتسع في سطرين تُقطع، فلا مقطع بثلاثة أسطر ثالثها كلمة يتيمة', () => {
  // نص المقطع 17 في عيّنة ميدواي الحقيقية: 83 محرفًا، ولا فاصل يجعل الشطرين ≤ 42 فكان يُلفّ ثلاثة أسطر آخرها «Battle».
  const text = 'uh Jonathan parall the the author of shattered sword the untold story of the Battle of Midway';
  const words = text.split(' ').map((w, i) => [i * 200, w]);
  const r = convertTrack({ body: body([asrEvent(0, 5000, words)]), trackKind: 'asr', durationMs: 6000 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.cues.filter((c) => c.text.split('\n').length > 2).map((c) => c.text), []);
  assert.equal(r.cues.map((c) => c.text.replace(/\n/g, ' ')).join(' '), text, 'الكلمات كلها بترتيبها');
  assert.ok(r.cues.every((c) => c.text.split('\n').every((l) => l.length <= 42)));
  // وكلمات بالزمن نفسه لا يُقطع بينها كما كان، ولو زادت على سطرين.
  const same = convertTrack({ body: body([asrEvent(0, 5000, text.split(' ').map((w) => [0, w]))]), trackKind: 'asr', durationMs: 6000 });
  assert.equal(same.cues.length, 1);
});

test('الثوابت تكشف الفقد والتداخل والفراغ والحدود', () => {
  const cues = [{ startMs: 0, endMs: 1000, text: 'a b' }, { startMs: 1000, endMs: 2000, text: 'c' }];
  const byKey = (r) => Object.fromEntries(r.results.map((x) => [x.key, x.ok]));
  assert.equal(checkInvariants({ sourceWords: ['a', 'b', 'c'], cues, durationMs: 2000 }).ok, true);
  assert.equal(byKey(checkInvariants({ sourceWords: ['a', 'b', 'c', 'd'], cues })).words, false);
  assert.equal(byKey(checkInvariants({ sourceWords: ['a', 'c', 'b'], cues })).words, false);
  assert.equal(byKey(checkInvariants({ sourceWords: ['A', 'b', 'c'], cues })).words, false);
  assert.equal(byKey(checkInvariants({ sourceWords: ['a', 'b', 'c'], cues: [cues[0], { ...cues[1], startMs: 900 }] })).noOverlap, false);
  assert.equal(byKey(checkInvariants({ sourceWords: ['a', 'b'], cues: [cues[0], { ...cues[1], text: ' ' }] })).noEmpty, false);
  assert.equal(byKey(checkInvariants({ sourceWords: ['a', 'b', 'c'], cues, durationMs: -1 })).bounds, true);
  assert.equal(byKey(checkInvariants({ sourceWords: ['a', 'b', 'c'], cues, durationMs: 1 })).bounds, true, 'هامش 2s');
  assert.equal(byKey(checkInvariants({ sourceWords: ['a', 'b', 'c'], cues: [cues[0], { ...cues[1], endMs: 4000 }], durationMs: 1000 })).bounds, false);
  assert.equal(byKey(checkInvariants({ sourceWords: ['a', 'b', 'c'], cues: [cues[0], { ...cues[1], startMs: 0, endMs: 2000 }] })).monotonic, false);
  assert.equal(checkInvariants({ sourceWords: [], cues: [] }).ok, false);
});

test('الاكتمال: تحذير لا رفض', () => {
  const r = convertTrack({ body: body([{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: 'short' }] }]), trackKind: 'manual', durationMs: 60000 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.warnings, ['EX_MAYBE_INCOMPLETE']);
});

test('wrapLines', () => {
  assert.equal(wrapLines('short', 42), 'short');
  const t = 'the quick brown fox jumps over the lazy dog and keeps running far';
  const w = wrapLines(t, 42).split('\n');
  assert.equal(w.length, 2);
  assert.equal(w.join(' '), t);
});
