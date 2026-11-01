// وضع «مقاطع أطول» (P3-AC2): قواعد الضم على مقاطع اصطناعية، ثم الثوابت الستة على العينات الحقيقية.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LONG_DEFAULTS, mergeLong, normalizeLongOptions } from '../../../src/core/convert/long.js';
import { convertTrack } from '../../../src/core/convert/index.js';
import { endsSentence, splitWords } from '../../../src/core/convert/text.js';
import { parseSrtStrict } from '../../../src/core/srt/parser.js';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures/json3');
const index = JSON.parse(readFileSync(path.join(DIR, 'index.json'), 'utf8'));

const cue = (startMs, endMs, text) => ({ startMs, endMs, text });
const words = (cues) => cues.flatMap((c) => splitWords(c.text));

test('endsSentence: نهاية الجملة مع إغلاق الاقتباس والقوس', () => {
  for (const t of ['Done.', 'Really?', 'Wow!', 'He said "go."', "it's (fine.)", 'end.  ']) assert.equal(endsSentence(t), true, t);
  for (const t of ['and then', 'Mr', 'a, b', '3.5 million', '']) assert.equal(endsSentence(t), false, t);
});

test('الافتراضيات: سطران ونحو 12 ثانية، وخيار غير صالح يعود افتراضيه', () => {
  assert.equal(LONG_DEFAULTS.maxLines, 2);
  assert.equal(LONG_DEFAULTS.maxDurationMs, 12000);
  assert.deepEqual(normalizeLongOptions(), { ...LONG_DEFAULTS });
  const o = normalizeLongOptions({ maxDurationMs: 8000, maxLines: 0, lineChars: 'x', maxGapMs: -1, sentenceMinFill: 2 });
  assert.equal(o.maxDurationMs, 8000);
  assert.deepEqual([o.maxLines, o.lineChars, o.maxGapMs, o.sentenceMinFill], [2, 42, 1000, 0.4]);
});

test('يضم المتجاورة حتى سطرين، ويحفظ الكلمات والترتيب والتوقيت الخارجي', () => {
  const cues = [cue(0, 1000, 'one two'), cue(1000, 2000, 'three four'), cue(2000, 3000, 'five six'), cue(3000, 4000, 'seven')];
  const { cues: out, report } = mergeLong(cues);
  assert.equal(out.length, 1);
  assert.deepEqual([out[0].startMs, out[0].endMs], [0, 4000]);
  assert.deepEqual(words(out), words(cues));
  assert.deepEqual([report.before, report.after], [4, 1]);
});

test('لا يتجاوز سطرين: النص الذي لا يتسع يُقسم على مقطعين', () => {
  const line = (n) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');
  // كل مقطع ~35 حرفًا: اثنان معًا ~71 حرفًا (سطران)، والثالث يتجاوز.
  const a = line(11);
  const cues = [cue(0, 1000, a), cue(1000, 2000, a), cue(2000, 3000, a)];
  const { cues: out } = mergeLong(cues);
  assert.equal(out.length, 2);
  for (const c of out) assert.ok(c.text.split('\n').length <= 2, c.text);
  assert.deepEqual(words(out), words(cues));
});

test('لا يتجاوز الامتداد الزمني الأقصى', () => {
  const cues = Array.from({ length: 6 }, (_, i) => cue(i * 3000, i * 3000 + 3000, `w${i}`));
  const { cues: out } = mergeLong(cues); // 18s إجمالًا، 12s حدًا
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((c) => c.endMs - c.startMs), [12000, 6000]);
  const small = mergeLong(cues, { maxDurationMs: 6000 }).cues;
  assert.deepEqual(small.map((c) => c.endMs - c.startMs), [6000, 6000, 6000]);
});

test('الوقفة الطويلة فاصل طبيعي لا يُضم عبره', () => {
  const cues = [cue(0, 1000, 'before the pause'), cue(2500, 3500, 'after the pause')];
  assert.equal(mergeLong(cues).cues.length, 2);
  assert.equal(mergeLong(cues, { maxGapMs: 2000 }).cues.length, 1);
});

test('عند تجاوز الحد وسط جملة يُقطع عند آخر نهاية جملة إن امتلأ المقطع', () => {
  const cues = [
    cue(0, 3000, 'First sentence here.'),
    cue(3000, 6000, 'Second one follows now.'),
    cue(6000, 9000, 'and a third that'),
    cue(9000, 13000, 'runs on past the limit'),
  ];
  const { cues: out } = mergeLong(cues);
  // الأربعة تتجاوز 12s؛ آخر نهاية جملة داخل الأول والثاني فيُقطع عندها (امتلاء 50% من الزمن).
  assert.equal(out[0].text.replace(/\n/g, ' '), 'First sentence here. Second one follows now.');
  assert.equal(out[0].endMs, 6000);
  assert.deepEqual(words(out), words(cues));
});

test('نهاية الجملة المبكرة جدًا لا تُنتج مقطعًا ضئيلًا', () => {
  const cues = [cue(0, 300, 'Yes.'), cue(300, 3300, 'and then we went to'), cue(3300, 6300, 'the market across town'), cue(6300, 13000, 'to buy some bread')];
  const tight = mergeLong(cues, { sentenceMinFill: 0 }).cues;
  assert.equal(tight[0].text, 'Yes.', 'بلا حد امتلاء يُقطع عند «Yes.»');
  const { cues: out } = mergeLong(cues);
  assert.notEqual(out[0].text, 'Yes.', 'امتلاء 3% من الزمن أقل من 40%');
  assert.deepEqual(words(out), words(cues));
});

test('مقطع واحد أطول من الحد يبقى كما هو بأسطره', () => {
  const only = cue(0, 15000, 'a very long cue\nwith its own lines');
  const { cues: out } = mergeLong([only, cue(15000, 16000, 'next')]);
  assert.deepEqual(out[0], only);
  assert.equal(out.length, 2);
});

test('قائمة فارغة وبلا تعديل للمدخل', () => {
  assert.deepEqual(mergeLong([]).cues, []);
  const input = [cue(0, 1000, 'a'), cue(1000, 2000, 'b')];
  const frozen = structuredClone(input);
  mergeLong(input);
  assert.deepEqual(input, frozen);
});

const body = (events) => JSON.stringify({ wireMagic: 'pb3', events });

test('convertTrack بالوضع الطويل: ثوابت ستة، وSRT يُعاد تحليله، والتقرير يذكر الوضع', () => {
  const events = Array.from({ length: 12 }, (_, i) => ({ tStartMs: i * 2000, dDurationMs: 1800, segs: [{ utf8: `line ${i} text` }] }));
  const normal = convertTrack({ body: body(events), trackKind: 'manual', durationMs: 24000 });
  const long = convertTrack({ body: body(events), trackKind: 'manual', durationMs: 24000, mode: 'long' });
  assert.equal(normal.ok && long.ok, true, JSON.stringify(long.invariants));
  assert.equal(normal.report.mode, 'normal');
  assert.equal(long.report.mode, 'long');
  assert.ok(long.cues.length < normal.cues.length);
  assert.deepEqual(long.cues.map((c) => c.n), long.cues.map((_, i) => i + 1));
  assert.equal(parseSrtStrict(long.srt).length, long.cues.length);
  assert.equal(long.invariants.results.length, 6);
  assert.throws(() => convertTrack({ body: body(events), trackKind: 'manual', mode: 'huge' }), RangeError);
});

test('الأرقام قابلة للضبط من convertTrack', () => {
  const events = Array.from({ length: 8 }, (_, i) => ({ tStartMs: i * 2000, dDurationMs: 1800, segs: [{ utf8: `w${i}` }] }));
  const wide = convertTrack({ body: body(events), trackKind: 'manual', durationMs: 16000, mode: 'long' });
  const narrow = convertTrack({ body: body(events), trackKind: 'manual', durationMs: 16000, mode: 'long', longOptions: { maxDurationMs: 4000 } });
  assert.ok(narrow.cues.length > wide.cues.length);
  assert.equal(narrow.report.long.options.maxDurationMs, 4000);
});

for (const f of index.fixtures) {
  test(`عينة حقيقية ${f.file}: الوضع الطويل يجتاز الثوابت الستة ويقلّل المقاطع`, () => {
    const text = readFileSync(path.join(DIR, f.file), 'utf8');
    const normal = convertTrack({ body: text, trackKind: f.trackKind, durationMs: f.durationMs });
    const long = convertTrack({ body: text, trackKind: f.trackKind, durationMs: f.durationMs, mode: 'long' });
    assert.equal(long.ok, true, JSON.stringify(long.invariants?.results.filter((x) => !x.ok)));
    assert.ok(long.invariants.results.length === 6 && long.invariants.results.every((x) => x.ok));
    assert.equal(long.report.sourceWords, normal.report.sourceWords, 'الكلمات نفسها');
    assert.deepEqual(words(long.cues), words(normal.cues), 'الكلمات نفسها بالترتيب نفسه');
    assert.ok(long.cues.length < normal.cues.length, `${long.cues.length} < ${normal.cues.length}`);
    assert.equal(long.cues[0].startMs, normal.cues[0].startMs);
    assert.equal(long.cues.at(-1).endMs, normal.cues.at(-1).endMs, 'لا يتغير ختام الملف');
    const normalByStart = new Map(normal.cues.map((c) => [c.startMs, c]));
    for (const c of long.cues) {
      assert.ok(normalByStart.has(c.startMs), 'كل بداية مقطع طويل بداية مقطع عادي');
      const lines = c.text.split('\n');
      const single = normal.cues.some((n) => n.startMs === c.startMs && n.endMs === c.endMs);
      if (!single) {
        assert.ok(lines.length <= 2, `سطور ${lines.length}`);
        assert.ok(c.endMs - c.startMs <= LONG_DEFAULTS.maxDurationMs, `امتداد ${c.endMs - c.startMs}`);
        for (const line of lines) assert.ok(line.length <= LONG_DEFAULTS.lineChars, line);
      }
    }
    assert.equal(parseSrtStrict(long.srt).length, long.cues.length);
    assert.equal(long.report.completeness, normal.report.completeness);
  });
}
