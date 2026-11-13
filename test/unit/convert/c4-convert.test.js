// تدقيق 7a66f91، المرحلة C4: المحوّل والثوابت. U28 وU77 (كاشف التدحرج وتعقيده)، وU36 وU81 (دمج اليدوي)، وU37
// (عتبة الاكتمال)، وU39 (رسالة الفشل الحتمي)، وI10 (القص والتقريب الوقائي)، وU32 (قطع json3 المعيبة).
// كل اختبار سلوكي هنا فشل على الشيفرة السابقة للسبب المقصود؛ ونواتج العيّنات الحقيقية مثبتة بايتًا في real-fixtures.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertTrack } from '../../../src/core/convert/index.js';
import { parseJson3 } from '../../../src/core/convert/json3.js';
import { detectRollingOverlap } from '../../../src/core/convert/asr.js';
import { splitWords, wrapLines } from '../../../src/core/convert/text.js';
import { createExtractor } from '../../../src/extract/index.js';
import { messageFor } from '../../../src/core/errors/index.js';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures/json3');
const ASR_FIXTURE = JSON.parse(readFileSync(path.join(DIR, 'asr-nwc-Y9rkKtK1b44.json'), 'utf8'));
const ASR_DUR = 3000000;

const body = (events) => JSON.stringify({ wireMagic: 'pb3', events });
/** حدث ASR بكلمات وأزمنتها النسبية: [[الإزاحة، الكلمة]، …]؛ القطعة الأولى بلا tOffsetMs كما في يوتيوب. */
function asrEvent(start, dur, words) {
  return { tStartMs: start, dDurationMs: dur, wWinId: 1, segs: words.map(([t, w], i) => ({ utf8: i ? ` ${w}` : w, ...(i ? { tOffsetMs: t } : {}), acAsrConf: 0 })) };
}
/** حدث ASR بقطعة واحدة لكل نصه (بلا توقيت للكلمات)، كما في الترجمة المتدحرجة من البث. */
const untimedEvent = (start, dur, text) => ({ tStartMs: start, dDurationMs: dur, segs: [{ utf8: text, tOffsetMs: 0, acAsrConf: 1 }] });
const manualEvent = (start, dur, text) => ({ tStartMs: start, ...(dur === undefined ? {} : { dDurationMs: dur }), segs: [{ utf8: text }] });
const asr = (events, durationMs = null, extra = {}) => convertTrack({ body: body(events), trackKind: 'asr', durationMs, ...extra });
const manual = (events, durationMs = null, extra = {}) => convertTrack({ body: body(events), trackKind: 'manual', durationMs, ...extra });
const words = (r) => r.cues.flatMap((c) => splitWords(c.text)).join(' ');

// ---- U28: لا حكم بالتدحرج من النص وحده ----

test('U28: تكرار حقيقي أزمنته لاحقة بين حدثين متداخلين يُحوَّل ولا يُرفض المسار، وكلماته كلها في الناتج', () => {
  const r = asr([
    asrEvent(0, 4000, [[0, 'one'], [200, 'two'], [400, 'three'], [600, 'four']]),
    asrEvent(1000, 4000, [[0, 'two'], [200, 'three'], [400, 'four'], [600, 'five']]),
  ], 6000);
  assert.equal(r.ok, true, `${r.code} ${JSON.stringify(r.report.errorDetail)}`);
  assert.equal(words(r), 'one two three four two three four five');
});

test('U28: عيّنة أغنية — لازمة «na na na na» في ستة أحداث متداخلة متتالية بأزمنة كلمات لاحقة تُحوَّل كاملة', () => {
  const events = Array.from({ length: 6 }, (_, i) => asrEvent(i * 1200, 2500, [[0, 'na'], [250, 'na'], [500, 'na'], [750, 'na']]));
  events.push(asrEvent(7200, 2000, [[0, 'hey'], [300, 'hey'], [600, 'hey']]));
  events.push(asrEvent(8000, 2000, [[0, 'hey'], [300, 'hey'], [600, 'hey']]));
  const r = asr(events, 12000);
  assert.equal(r.ok, true, `${r.code} ${JSON.stringify(r.report.errorDetail)}`);
  assert.equal(r.report.sourceWords, 30);
  assert.equal(words(r), [...Array(24).fill('na'), ...Array(6).fill('hey')].join(' '));
});

/** يحقن تكرارًا كلاميًا عند حد حدثين متتاليين في عيّنة ASR الحقيقية (كما في verify-ds/pipeline/01). */
function injectRepeat(textA, textB, { bStep = 150 } = {}) {
  const d = structuredClone(ASR_FIXTURE);
  const idx = d.events.findIndex((e, i) => i > 50 && Array.isArray(e.segs) && e.segs.length >= 4 && !e.aAppend);
  const nxt = d.events.findIndex((e, i) => i > idx && Array.isArray(e.segs) && e.segs.map((s) => s.utf8 ?? '').join('').trim());
  const a = d.events[idx];
  const b = d.events[nxt];
  const lastOff = a.segs.at(-1).tOffsetMs ?? 0;
  a.segs.splice(-textA.length, textA.length, ...textA.map((w, k) => ({ utf8: ` ${w}`, tOffsetMs: lastOff + 100 * k })));
  b.segs.splice(0, textB.length, ...textB.map((w, k) => (k === 0 ? { utf8: w } : { utf8: ` ${w}`, tOffsetMs: bStep * k })));
  assert.ok(b.tStartMs < a.tStartMs + a.dDurationMs, 'الحدثان متداخلان زمنيًا');
  return convertTrack({ body: JSON.stringify(d), trackKind: 'asr', durationMs: ASR_DUR });
}

test('U28: العيّنة الحقيقية مع تكرار «no no no» و«I don\'t know» عند حد حدثين متداخلين تُحوَّل ولا تُرفض', () => {
  for (const [a, b] of [[['no', 'no', 'no'], ['no', 'no', 'no']], [['I', "don't", 'know'], ['I', "don't", 'know']], [['thank', 'you', 'very'], ['thank', 'you', 'very']]]) {
    const r = injectRepeat(a, b);
    assert.equal(r.ok, true, `${a.join(' ')}: ${r.code} ${JSON.stringify(r.report.errorDetail)}`);
    assert.ok(r.cues.length > 1000, String(r.cues.length));
    assert.ok(r.invariants.results.every((x) => x.ok));
  }
});

test('U28: الصيغة المتدحرجة ما زالت توقف التحويل — بأزمنة مساوية أو سابقة، أو بنمط متكرر في أزواج متتالية بلا توقيت كلمات', () => {
  // (أ) الحدث الثاني يعيد ذيل الأول بأزمنته نفسها.
  const byTime = asr([
    asrEvent(0, 5000, [[0, 'one'], [1000, 'two'], [2000, 'three'], [3000, 'four']]),
    asrEvent(1000, 5000, [[0, 'two'], [1000, 'three'], [2000, 'four'], [3000, 'five']]),
  ], 8000);
  assert.deepEqual([byTime.ok, byTime.code], [false, 'EX_UNSUPPORTED_FORMAT']);
  assert.equal(byTime.report.errorDetail.basis, 'time');
  assert.equal(byTime.report.reason, 'rolling-time', 'الفكرة ٤-ب: السبب يميّز التدحرج من غيره تحت الرمز نفسه');
  // (ب) كل حدث يعيد سطر سابقه كاملًا (بث بترجمة متدحرجة، #1318)، في أكثر من زوج متتالٍ.
  const lines = ['the quick brown fox', 'jumps over the lazy', 'dog and then it', 'runs far away now'];
  const rolling = lines.map((l, i) => untimedEvent(i * 2000, 4000, i ? `${lines[i - 1]}\n${l}` : l));
  const byPattern = asr(rolling, 20000);
  assert.deepEqual([byPattern.ok, byPattern.code], [false, 'EX_UNSUPPORTED_FORMAT']);
  assert.equal(byPattern.report.errorDetail.basis, 'pattern');
  assert.equal(byPattern.report.reason, 'rolling-pattern');
  assert.ok(detectRollingOverlap(parseJson3(body(rolling)).events, 3));
});

test('U28: زوج واحد بلا توقيت كلمات لا يكفي حكمًا، ولا زوجان يفصلهما زوج سليم', () => {
  const single = asr([untimedEvent(0, 4000, 'we said thank you very'), untimedEvent(2000, 4000, 'thank you very much')], 8000);
  assert.equal(single.ok, true, single.code);
  assert.equal(words(single), 'we said thank you very thank you very much');
  const apart = asr([
    untimedEvent(0, 3000, 'alpha beta gamma delta'), untimedEvent(2000, 3000, 'beta gamma delta epsilon'),
    untimedEvent(6000, 3000, 'zeta eta theta iota'),
    untimedEvent(10000, 3000, 'kappa lambda mu nu'), untimedEvent(12000, 3000, 'lambda mu nu xi'),
  ], 20000);
  assert.equal(apart.ok, true, apart.code);
});

// ---- U77: تعقيد خطي ----

const VID = 'AAAAAAAAAAA';
const msg = (b, trackKind) => ({ source: 'tarjuman', v: 1, kind: 'timedtext', videoId: VID, lang: 'en', trackKind, format: 'json3', status: 200, bodyLength: b.length, body: b });
const timed = (fn) => {
  const t0 = performance.now();
  const r = fn();
  return { ms: performance.now() - t0, r };
};

test('U77: جسم 64KB بحدثين متداخلين من 16 ألف كلمة لا يحجز معالج رسالة الجسر (تحت 200 م.ث)', () => {
  const n = 16000;
  const b = JSON.stringify({ events: [
    { tStartMs: 0, dDurationMs: 10000, segs: [{ utf8: `${'x '.repeat(n)}y`, tOffsetMs: 0, acAsrConf: 1 }] },
    { tStartMs: 5000, dDurationMs: 10000, segs: [{ utf8: 'x '.repeat(n).trim(), tOffsetMs: 0, acAsrConf: 1 }] },
  ] });
  assert.ok(b.length >= 64000, String(b.length));
  const x = createExtractor({ currentVideoId: () => VID, durationMs: () => 600000 });
  const { ms, r } = timed(() => x.handleMessage(msg(b, 'asr')));
  assert.equal(r.accepted, true);
  assert.ok(ms < 200, `${Math.round(ms)} م.ث`);
});

test('U77: مجموعة ASR واحدة من 16 ألف كلمة بزمن واحد، ومقطع يدوي من 20 ألف كلمة في «مقاطع أطول»، تحت 200 م.ث', () => {
  const one = JSON.stringify({ events: [{ tStartMs: 0, dDurationMs: 10000, segs: [{ utf8: 'ab '.repeat(16000).trim(), tOffsetMs: 0, acAsrConf: 1 }] }] });
  const x1 = createExtractor({ currentVideoId: () => VID, durationMs: () => 600000 });
  const a = timed(() => x1.handleMessage(msg(one, 'asr')));
  assert.ok(a.ms < 200, `ASR ${Math.round(a.ms)} م.ث`);
  const big = JSON.stringify({ events: [{ tStartMs: 0, dDurationMs: 5000, segs: [{ utf8: 'ab '.repeat(20000).trim() }] }, { tStartMs: 5000, dDurationMs: 1000, segs: [{ utf8: 'next' }] }] });
  const x2 = createExtractor({ currentVideoId: () => VID, durationMs: () => 600000 });
  x2.handleMessage(msg(big, 'manual'));
  const l = timed(() => x2.convert('en|manual', { mode: 'long' }));
  assert.equal(l.r.ok, true);
  assert.ok(l.ms < 200, `long ${Math.round(l.ms)} م.ث`);
});

/** wrapLines كما كانت قبل C4 (تربيعية)، مرجعًا لمطابقة الناتج حرفيًا. */
function wrapLinesBefore(text, lineChars) {
  if (text.length <= lineChars) return text;
  const ws = text.split(' ');
  let best = null;
  for (let i = 1; i < ws.length; i++) {
    const a = ws.slice(0, i).join(' ');
    const b = ws.slice(i).join(' ');
    if (a.length <= lineChars && b.length <= lineChars) {
      const score = Math.abs(a.length - b.length);
      if (best === null || score < best.score) best = { score, text: `${a}\n${b}` };
    }
  }
  if (best) return best.text;
  const lines = [];
  let line = '';
  for (const w of ws) {
    if (line === '') line = w;
    else if (line.length + 1 + w.length <= lineChars) line += ` ${w}`;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line !== '') lines.push(line);
  return lines.join('\n');
}

test('U77: wrapLines الخطية تطابق السابقة حرفيًا على آلاف المدخلات العشوائية', () => {
  let seed = 7;
  const rnd = (n) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  const alphabet = 'abcdefghij.,!؟عربي';
  for (let k = 0; k < 4000; k++) {
    const count = 1 + rnd(30);
    const ws = Array.from({ length: count }, () => Array.from({ length: 1 + rnd(14) }, () => alphabet[rnd(alphabet.length)]).join(''));
    if (rnd(10) === 0) ws.splice(rnd(ws.length), 0, '');
    const text = ws.join(' ');
    const lineChars = 8 + rnd(50);
    assert.equal(wrapLines(text, lineChars), wrapLinesBefore(text, lineChars), JSON.stringify([text, lineChars]));
  }
});

// ---- U36 وU81: دمج اليدوي ----

test('U36: مقطع يدوي قصير تليه فجوة لا يُدمج في التالي، بل تُمد نهايته إلى الحد الأدنى', () => {
  for (const dur of [80, 0]) {
    const r = manual([manualEvent(1000, dur, 'Yes.'), manualEvent(26000, 2000, 'Welcome back.')], 30000);
    assert.equal(r.ok, true, r.code);
    assert.deepEqual(r.cues.map(({ startMs, endMs, text }) => [startMs, endMs, text]), [[1000, 1100, 'Yes.'], [26000, 28000, 'Welcome back.']], `dDurationMs=${dur}`);
    assert.equal(r.report.converter.merged, 0);
  }
  // ما قُصّ فعلًا (تداخل) ما زال يُدمج، وما يقع التالي فيه خلال الحد الأدنى كذلك.
  const cut = manual([manualEvent(1000, 2000, 'top'), manualEvent(1050, 2000, 'bottom')], 10000);
  assert.deepEqual(cut.cues.map(({ startMs, endMs, text }) => [startMs, endMs, text]), [[1000, 3050, 'top\nbottom']]);
  const near = manual([manualEvent(1000, 30, 'a'), manualEvent(1060, 2000, 'b')], 10000);
  assert.deepEqual(near.cues.map(({ startMs, endMs, text }) => [startMs, endMs, text]), [[1000, 3060, 'a\nb']]);
});

test('U81: حدثان يدويان يبدآن معًا يُدمجان بأطول النهايتين، والناتج لا يتوقف على ترتيبهما', () => {
  const long = manualEvent(79119, 3958, 'long line');
  const short = manualEvent(79119, 500, 'short');
  const after = manualEvent(90000, 1000, 'next');
  const ab = manual([long, short, after], 100000);
  const ba = manual([short, long, after], 100000);
  assert.deepEqual(ab.cues.map((c) => [c.startMs, c.endMs]), [[79119, 83077], [90000, 91000]]);
  assert.deepEqual(ba.cues.map((c) => [c.startMs, c.endMs]), [[79119, 83077], [90000, 91000]]);
  // وأطول النهايتين مقصوصة إلى بداية التالي.
  const capped = manual([long, short, manualEvent(80000, 1000, 'next')], 100000);
  assert.deepEqual(capped.cues.map((c) => [c.startMs, c.endMs]), [[79119, 80000], [80000, 81000]]);
});

// ---- U37: عتبة الاكتمال من الإعدادات ----

test('U37: عتبة الاكتمال تُمرَّر إلى التحويل، والقيمة غير الصالحة تعود إلى 85%', () => {
  const events = [manualEvent(0, 43200, 'only a part')]; // آخر نهاية عند 72% من دقيقة
  assert.deepEqual(manual(events, 60000).warnings, ['EX_MAYBE_INCOMPLETE']);
  assert.deepEqual(manual(events, 60000, { completenessRatio: 0.5 }).warnings, []);
  assert.deepEqual(manual(events, 60000, { completenessRatio: 0.75 }).warnings, ['EX_MAYBE_INCOMPLETE']);
  for (const bad of [2, 0.2, Number.NaN, '0.5', null]) {
    assert.deepEqual(manual(events, 60000, { completenessRatio: bad }).warnings, ['EX_MAYBE_INCOMPLETE'], String(bad));
  }
});

// ---- I10 وU39: قص وتقريب وقائي، ورسالة الفشل الحتمي ----

test('I10: tOffsetMs سالب لأول كلمة في أول حدث يُقص إلى بداية حدثه، فينجح التحويل من الصفر', () => {
  const r = asr([{ tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: 'hello', tOffsetMs: -15, acAsrConf: 0 }, { utf8: ' world', tOffsetMs: 300, acAsrConf: 0 }] }], 5000);
  assert.equal(r.ok, true, `${r.code} ${JSON.stringify(r.invariants?.results.filter((x) => !x.ok))}`);
  assert.equal(r.cues[0].startMs, 0);
  assert.equal(r.report.converter.clampedToEvent, 1);
});

test('I10: أزمنة json3 الكسرية تُقرَّب إلى أعداد صحيحة، فتنجح الثوابت', () => {
  const m = manual([manualEvent(1000.5, 1999.5, 'half a second'), manualEvent(4000.4, 1000.2, 'more')], 10000);
  assert.equal(m.ok, true, `${m.code} ${JSON.stringify(m.invariants?.results.filter((x) => !x.ok))}`);
  assert.ok(m.cues.every((c) => Number.isInteger(c.startMs) && Number.isInteger(c.endMs)));
  const a = asr([{ tStartMs: 0.5, dDurationMs: 3000.5, segs: [{ utf8: 'one', acAsrConf: 0 }, { utf8: ' two', tOffsetMs: 400.7, acAsrConf: 0 }] }], 5000);
  assert.equal(a.ok, true, a.code);
  assert.ok(a.cues.every((c) => Number.isInteger(c.startMs) && Number.isInteger(c.endMs)));
});

test('I10: زمن كلمة شاذ بعد نهاية حدثها يُقص إلى نافذة حدثه، فلا يجر بقية المسار إلى مقطع واحد', () => {
  const d = structuredClone(ASR_FIXTURE);
  const withOffsets = d.events.map((e, i) => (Array.isArray(e.segs) && e.segs.some((s) => s.tOffsetMs) ? i : -1)).filter((i) => i >= 0);
  const e = d.events[withOffsets[100]];
  e.segs[e.segs.length - 1].tOffsetMs = 2_000_000;
  const r = convertTrack({ body: JSON.stringify(d), trackKind: 'asr', durationMs: ASR_DUR });
  assert.equal(r.ok, true, r.code);
  assert.ok(r.cues.length >= 1040, String(r.cues.length));
  assert.ok(Math.max(...r.cues.map((c) => c.text.length)) <= 200);
  assert.equal(r.report.converter.clampedToEvent, 1);
});

test('I10: آخر نهاية بعد مدة الفيديو بأكثر من ثانيتين ومقطعها يبدأ داخلها تُقص إلى المدة بدل منع التصدير', () => {
  const r = manual([manualEvent(1000, 2000, 'first'), manualEvent(98000, 6000, 'last words')], 100000);
  assert.equal(r.ok, true, `${r.code} ${JSON.stringify(r.invariants?.results.filter((x) => !x.ok))}`);
  assert.deepEqual(r.cues.at(-1).endMs, 100000);
  assert.equal(r.report.endClampedToDuration, true);
  // وما يبقى ضمن هامش الثانيتين لا يُمس.
  const within = manual([manualEvent(98000, 3500, 'last')], 100000);
  assert.equal(within.cues[0].endMs, 101500);
  assert.equal(within.report.endClampedToDuration, false);
});

test('U39: نص يبدأ بعد نهاية الفيديو يُرفض برمز الحدود EX_BEYOND_DURATION، ولا رسالة تَعِد بأن إعادة المحاولة تنفع', () => {
  const r = manual([manualEvent(1000, 2000, 'first'), manualEvent(105000, 2000, 'after the end')], 100000);
  assert.deepEqual([r.ok, r.code], [false, 'EX_BEYOND_DURATION']);
  assert.deepEqual(r.invariants.results.filter((x) => !x.ok).map((x) => x.key), ['bounds']);
  for (const code of ['EX_BEYOND_DURATION', 'EX_INVARIANT_FAILED']) {
    const text = messageFor(code);
    assert.notEqual(text, code, `${code} بلا رسالة`);
    assert.equal(/أعد المحاولة|وشغّلها/.test(text), false, `${code}: ${text}`);
  }
  // مقطع وحيد يبدأ عند نهاية مدة أقصر منه بكثير: الحدود وحدها، فالرمز نفسه.
  assert.equal(manual([manualEvent(5000, 4000, 'a')], 1000).code, 'EX_BEYOND_DURATION');
});

// ---- U32: قطع json3 المعيبة ----

test('U32: قطعة json3 ليست كائنًا لا ترمي TypeError: تُتجاهل وتُعدّ، والجسم الذي لا يبقى فيه نص فارغ', () => {
  for (const bad of [1, 'x', true]) {
    const mixed = body([{ tStartMs: 0, dDurationMs: 1000, segs: [bad, { utf8: 'hello' }] }]);
    assert.doesNotThrow(() => convertTrack({ body: mixed, trackKind: 'manual' }), String(bad));
    const ok = convertTrack({ body: mixed, trackKind: 'manual', durationMs: 2000 });
    assert.deepEqual([ok.ok, ok.cues.map((c) => c.text)], [true, ['hello']], String(bad));
    const r = convertTrack({ body: body([{ tStartMs: 0, dDurationMs: 1000, segs: [bad] }]), trackKind: 'manual' });
    assert.deepEqual([r.ok, r.code], [false, 'EX_EMPTY_BODY'], String(bad));
  }
  const p = parseJson3(body([{ tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: 'hi' }, 5, { utf8: ' there', tOffsetMs: 100, acAsrConf: 1 }, null] }]));
  assert.equal(p.events[0].text, 'hi there');
  assert.equal(p.stats.invalidSegs, 2);
});

// ---- التدقيق الموحد V2 (WG-1): U-002 كشف التدحرج في الكتابة المتصلة ----

test('AV2 U-002: تدحرج ياباني بالزمن وبالنمط يُرفض بـEX_UNSUPPORTED_FORMAT، والتكرار الحقيقي يُقبل', () => {
  const seg = (t, w) => ({ utf8: w, ...(t ? { tOffsetMs: t } : {}), acAsrConf: 0 });
  const timed = asr([
    { tStartMs: 0, dDurationMs: 5000, wWinId: 1, segs: [seg(0, '一'), seg(1000, '二'), seg(2000, '三'), seg(3000, '四')] },
    { tStartMs: 1000, dDurationMs: 5000, wWinId: 1, segs: [seg(0, '二'), seg(1000, '三'), seg(2000, '四'), seg(3000, '五')] },
  ], 8000);
  assert.deepEqual([timed.ok, timed.code], [false, 'EX_UNSUPPORTED_FORMAT']);
  assert.equal(timed.report.reason, 'rolling-time');
  const lines = ['今日はとてもいい天気', '散歩に行きましょう', '公園で休みます', 'それから帰ります'];
  const rolling = lines.map((l, i) => untimedEvent(i * 2000, 4000, i ? `${lines[i - 1]}\n${l}` : l));
  const byPattern = asr(rolling, 20000);
  assert.deepEqual([byPattern.ok, byPattern.code], [false, 'EX_UNSUPPORTED_FORMAT']);
  assert.equal(byPattern.report.errorDetail.basis, 'pattern');
  assert.equal(byPattern.report.reason, 'rolling-pattern');
  // تكرار حقيقي: «はいはいはい» ثم تكراره بأزمنة لاحقة.
  const real = asr([
    { tStartMs: 0, dDurationMs: 4000, wWinId: 1, segs: [seg(0, 'はい'), seg(300, 'はい'), seg(600, 'はい'), seg(900, 'です')] },
    { tStartMs: 2000, dDurationMs: 4000, wWinId: 1, segs: [seg(0, 'はい'), seg(300, 'はい'), seg(600, 'はい'), seg(900, 'ね')] },
  ], 8000);
  assert.equal(real.ok, true, real.code);
});
