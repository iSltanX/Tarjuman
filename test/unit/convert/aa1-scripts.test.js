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

// ---- التدقيق الموحد V2 (WG-1): U-001 وU-003 وU-008 ----

/** حدث ASR بقطع [إزاحة، نص] بلا مسافة بادئة (الكتابة المتصلة)؛ القطعة الأولى بلا tOffsetMs كما في يوتيوب. */
const connectedEvent = (start, dur, segs) => ({
  tStartMs: start, dDurationMs: dur, wWinId: 1,
  segs: segs.map(([t, w], i) => ({ utf8: w, ...(i ? { tOffsetMs: t } : {}), acAsrConf: 0 })),
});
const asrFrom = (events, durationMs) => convertTrack({ body: JSON.stringify({ wireMagic: 'pb3', events }), trackKind: 'asr', durationMs });
const URDU_FULL_STOP = String.fromCharCode(0x06d4);

test('AV2 U-001: قطع يابانية متصلة تحفظ زمن كل قطعة، فلا تُختزل النهاية إلى زمن أول قطعة والنص بلا مسافة', () => {
  const r = asrFrom([connectedEvent(1000, 6000, [[0, '今日'], [1800, 'は'], [3600, 'いい'], [5400, '天気']])], 7000);
  assert.equal(r.ok, true, r.code);
  assert.ok(r.cues.at(-1).endMs >= 6400, `النهاية ${r.cues.at(-1).endMs}`);
  assert.equal(r.cues.map((c) => c.text).join('').replace(/\s/g, ''), '今日はいい天気');
  assert.ok(r.cues.every((c) => !/\s/.test(c.text.replace(/\n/g, ''))), 'لا مسافة دخيلة');
});

test('AV2 U-001: 。 وسط الحدث المتصل يشطر مقطعين، وفجوة 3000 م.ث داخل الحدث تشطر مقطعين', () => {
  const words = ['きょう', 'は', 'とても', 'いい', 'てんき', 'です', 'ね', '。', 'あした', 'も', 'はれる'];
  const sentence = asrFrom([connectedEvent(0, 6000, words.map((w, k) => [k * 350, w]))], 10000);
  assert.equal(sentence.cues.length, 2);
  assert.ok(sentence.cues[0].text.endsWith('。'));
  const gap = asrFrom([connectedEvent(0, 6000, [[0, '今日は'], [200, 'いい'], [3200, '天気'], [3400, 'です']])], 7000);
  assert.equal(gap.cues.length, 2);
  assert.equal(gap.cues[1].startMs, 3200);
});

test('AV2 U-001: كلمة لاتينية مقسومة بين قطعتين تبقى واحدة، والحدّ بين لاتيني وياباني يبقى ملتصقًا', () => {
  const latin = asrFrom([connectedEvent(0, 3000, [[0, 'don'], [200, "'t"], [400, ' stop']])], 4000);
  assert.deepEqual(latin.cues.map((c) => c.text), ["don't stop"]);
  const mixed = asrFrom([connectedEvent(0, 3000, [[0, 'AI'], [300, '技術'], [600, 'です']])], 4000);
  assert.deepEqual(mixed.cues.map((c) => c.text), ['AI技術です']);
});

test('AV2 U-008: «۔» الأردية نهاية جملة، ويُشطر ASR عندها كما عند النقطة', () => {
  assert.equal(endsSentence(`یہ ٹھیک ہے${URDU_FULL_STOP}`), true);
  const r = asrFrom([{
    tStartMs: 0, dDurationMs: 4000, wWinId: 1,
    segs: [`ٹھیک${URDU_FULL_STOP}`, ' اب', ' چلو'].map((w, i) => ({ utf8: w, ...(i ? { tOffsetMs: i * 300 } : {}), acAsrConf: 0 })),
  }], 5000);
  assert.equal(r.cues.length, 2);
});

test('AV2 U-003: لفّ التايلاندية لا يبدأ سطرًا بحركة، وكسر «2026年» لا يقع بين الرقم والحرف', () => {
  const thai = 'วันนี้อากาศดีมากเราจะไปเดินเล่นที่สวนสาธารณะใกล้บ้านกันนะครับ';
  for (let n = 10; n <= 30; n++) {
    const out = wrapLines(thai, n);
    assert.ok(out.split('\n').every((l) => !/^\p{M}/u.test(l)), `lineChars ${n}`);
    assert.equal(out.replace(/\n/g, ''), thai);
  }
  const year = `${'あ'.repeat(20)}2026年${'あ'.repeat(20)}`;
  assert.ok(!wrapLines(year, 21).includes('2026\n'), 'لا كسر بين 2026 و年');
  assert.equal(wrapLines(year, 21).replace(/\n/g, ''), year);
});

test('AV2 U-003: نص NFD (داكوتين) يجتاز التحويل في ASR أيًّا كان موضع اللف، ولا يُكسر بين الحرف وعلامته', () => {
  for (let lead = 15; lead <= 30; lead++) {
    const nfd = `${'あ'.repeat(lead)}で${'あ'.repeat(21)}`.normalize('NFD');
    const r = asrFrom([connectedEvent(0, 4000, [[0, nfd]])], 5000);
    assert.equal(r.ok, true, `${lead} ${r.code} ${JSON.stringify(r.report?.errorDetail)}`);
    assert.ok(r.cues.every((c) => c.text.split('\n').every((l) => !/^\p{M}/u.test(l))), String(lead));
  }
});
