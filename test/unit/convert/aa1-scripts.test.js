// التحويل بلا افتراض لاتيني (AA1، حرية اللغات): اليابانية والصينية والتايلاندية لا تفصل كلماتها بالمسافات، فلا تُدرج مسافة
// دخيلة عند وصل المقاطع في «مقاطع أطول» ولا بين كلمات التلقائي، والثوابت تجتاز، ونهاية الجملة بعلاماتها. الأجسام هنا مصطنعة
// بصيغة json3 كما قيست في P1 (يدوي: حدث لكل سطر؛ تلقائي: segs بـtOffsetMs وacAsrConf) وموسومة بذلك؛ الجسم الحقيقي لغير
// الإنجليزية لا يُجلب تحت الأتمتة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertTrack } from '../../../src/core/convert/index.js';
import { endsSentence, joinWords, splitWords, wrapLines } from '../../../src/core/convert/text.js';

const manualBody = (lines) => JSON.stringify({
  wireMagic: 'pb3',
  events: lines.map((text, i) => ({ tStartMs: 1000 + i * 1500, dDurationMs: 1400, segs: [{ utf8: text }] })),
});

const asrBody = (groups) => JSON.stringify({
  wireMagic: 'pb3',
  events: [
    { tStartMs: 0, dDurationMs: 60000, id: 1, wpWinPosId: 1, wsWinStyleId: 1 },
    ...groups.map((words, i) => ({
      tStartMs: 1000 + i * 3000, dDurationMs: 2900, wWinId: 1,
      segs: words.map((w, k) => ({ utf8: w, ...(k ? { tOffsetMs: k * 300 } : {}), acAsrConf: 0 })),
    })),
  ],
});

test('الوحدات والوصل: كل حرف ياباني وحدة، ولا مسافة بين حرفين متصلين، والنص اللاتيني كما كان', () => {
  assert.deepEqual(splitWords('今日は いい'), ['今', '日', 'は', 'い', 'い']);
  assert.deepEqual(splitWords('OK今日'), ['OK', '今', '日']);
  assert.deepEqual(splitWords('Good  morning.'), ['Good', 'morning.']);
  assert.equal(joinWords(['今日は', 'いい天気']), '今日はいい天気');
  assert.equal(joinWords(['Hello', 'world']), 'Hello world');
  assert.equal(joinWords(['日本', 'Tokyo', 'です']), '日本 Tokyo です');
  assert.equal(joinWords(['สวัสดี', 'ครับ']), 'สวัสดีครับ', 'التايلاندية');
});

test('نهاية الجملة بعلامات اللغات: 。！？ والاستفهام العربي والدنده، واللاتينية كما كانت', () => {
  for (const s of ['今日は晴れです。', '本当？', 'すごい！」', 'هل فهمت؟', 'यह ठीक है।', 'Done.', 'Really?"']) assert.equal(endsSentence(s), true, s);
  for (const s of ['今日は', 'and then', 'قال']) assert.equal(endsSentence(s), false, s);
});

test('لفّ الأسطر لنص متصل: سطران متوازنان في الحد بلا مسافة دخيلة، ولا يُشطر زوج بديل', () => {
  const text = '今日はとてもいい天気ですね散歩に行きましょう';
  const out = wrapLines(text, 14);
  const lines = out.split('\n');
  assert.equal(lines.length, 2);
  assert.ok(lines.every((l) => l.length <= 14));
  assert.equal(lines.join(''), text, 'لا حرف ضاع ولا مسافة أُدرجت');
  const astral = wrapLines('𠀋𠀋𠀋𠀋𠀋𠀋𠀋𠀋', 6).split('\n');
  assert.equal(astral.join(''), '𠀋𠀋𠀋𠀋𠀋𠀋𠀋𠀋');
  assert.ok(astral.every((l) => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(l)), 'لا زوج بديل مشطور');
});

test('يدوي ياباني في «مقاطع أطول»: الوصل بلا مسافة، والثوابت تجتاز، والجملة تُحترم', () => {
  const body = manualBody(['今日は', 'いい天気ですね。', '散歩に', '行きましょう。']);
  const normal = convertTrack({ body, trackKind: 'manual', durationMs: 10000 });
  assert.equal(normal.ok, true, normal.code);
  assert.equal(normal.cues.length, 4);
  const long = convertTrack({ body, trackKind: 'manual', durationMs: 10000, mode: 'long' });
  assert.equal(long.ok, true, long.code);
  assert.ok(long.cues.length < 4);
  assert.ok(long.cues.every((c) => !/[\p{Script=Han}\p{Script=Hiragana}] [\p{Script=Han}\p{Script=Hiragana}]/u.test(c.text)), long.cues.map((c) => c.text).join(' | '));
  assert.ok(long.cues[0].text.replace('\n', '').startsWith('今日はいい天気ですね。'));
});

test('تلقائي ياباني: كلمات المقطع موصولة بلا مسافة، والثوابت تجتاز', () => {
  const body = asrBody([['今日', 'は', 'いい', '天気'], ['散歩', 'に', '行こう']]);
  const r = convertTrack({ body, trackKind: 'asr', durationMs: 10000 });
  assert.equal(r.ok, true, `${r.code} ${JSON.stringify(r.invariants?.results?.filter((x) => !x.ok))}`);
  const text = r.cues.map((c) => c.text.replace('\n', '')).join('');
  assert.equal(text.includes(' '), false, text);
  assert.ok(text.startsWith('今日はいい天気'));
});
