// الفكرة ٤-ب (الجولة الثالثة، ح-38): سبب الرفض رمز قصير من قائمة مغلقة (REASONS). كل موضع رفض في القبول والتحليل والتحويل يصدر
// سببه بعينه وهو عضو في القائمة، والمجهول يصير 'other' عند الإسقاط إلى التشخيص (reasonOf)، فلا يعبره نص حر.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REASONS, reasonOf } from '../../../src/core/convert/reasons.js';
import { ConvertError, parseJson3 } from '../../../src/core/convert/json3.js';
import { convertTrack } from '../../../src/core/convert/index.js';
import { checkAcceptance } from '../../../src/extract/capture-adapter.js';
import { validateCaptureMessage } from '../../../src/extract/message.js';

const src = (rel) => readFileSync(new URL(`../../../src/${rel}`, import.meta.url), 'utf8');
const VID = 'AAAAAAAAAAA';
const MSG = {
  source: 'tarjuman', v: 1, kind: 'timedtext', videoId: VID, lang: 'en', trackKind: 'manual', kindParam: null, capsAsr: true,
  hasTlang: false, format: 'json3', hasPot: true, transport: 'xhr', status: 200, bodyLength: 13, body: '{"events":[]}',
};

test('REASONS مجمّدة بلا تكرار، رموز قصيرة بحروف صغيرة وشرطات، وفيها other', () => {
  assert.ok(Object.isFrozen(REASONS));
  assert.equal(new Set(REASONS).size, REASONS.length);
  for (const r of REASONS) assert.match(r, /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, r);
  assert.ok(REASONS.includes('other'));
});

test('reasonOf: سبب من القائمة كما هو، وما سواه (غائب أو نص حر أو غير نص) other', () => {
  assert.equal(reasonOf({ reason: 'not-json' }), 'not-json');
  assert.equal(reasonOf(new ConvertError('EX_EMPTY_BODY', 'فارغ', {}, 'blank')), 'blank');
  for (const x of [null, undefined, 'not-json', {}, { reason: 'https://www.youtube.com/x' }, { reason: 'Not-Json' }, { reason: 7 }]) {
    assert.equal(reasonOf(x), 'other', JSON.stringify(x));
  }
});

// [تعديل الرسالة، تعديل السياق، الرمز، السبب]: كل موضع رفض في checkAcceptance.
const ACCEPTANCE = [
  [{}, { currentVideoId: null }, 'EX_NO_VIDEO', 'no-video'],
  [{ videoId: 'BBBBBBBBBBB' }, {}, 'EX_WRONG_VIDEO', 'wrong-video'],
  [{ videoId: 'bad' }, {}, 'EX_WRONG_VIDEO', 'bad-v'],
  [{ lang: 'e!' }, {}, 'EX_BAD_LANG', 'bad-lang'],
  [{ hasTlang: true }, {}, 'EX_BAD_LANG', 'bad-tlang'],
  [{ status: 403 }, {}, 'EX_EMPTY_BODY', 'status'],
  [{ body: '', bodyLength: 30_000_000, truncated: true }, {}, 'EX_EMPTY_BODY', 'truncated'],
  [{ body: '  ', bodyLength: 2 }, {}, 'EX_EMPTY_BODY', 'blank'],
  [{ format: 'srv3', body: '<timedtext/>' }, {}, 'EX_UNSUPPORTED_FORMAT', 'fmt-srv3'],
  [{ format: 'ttml', body: '<tt/>' }, {}, 'EX_UNSUPPORTED_FORMAT', 'fmt-other'],
  [{ format: 'default', body: '<transcript/>' }, {}, 'EX_UNSUPPORTED_FORMAT', 'default-not-json'],
  [{}, { isLive: true }, 'EX_LIVE', 'live'],
];

test('القبول: كل رفض برمزه وسببه من القائمة، والمقبول بلا سبب', () => {
  for (const [over, ctx, code, reason] of ACCEPTANCE) {
    const d = checkAcceptance(validateCaptureMessage({ ...MSG, ...over }), { currentVideoId: VID, ...ctx });
    assert.deepEqual([d.accepted, d.code, d.reason], [false, code, reason], JSON.stringify(over));
    assert.ok(REASONS.includes(d.reason), d.reason);
  }
  assert.equal(checkAcceptance(validateCaptureMessage(MSG), { currentVideoId: VID }).reason, undefined);
});

const json = (events) => JSON.stringify({ events });
// [الجسم، الرمز، السبب]: كل ConvertError يرميه parseJson3.
const PARSE = [
  ['', 'EX_EMPTY_BODY', 'blank'],
  ['<transcript/>', 'EX_UNSUPPORTED_FORMAT', 'not-json'],
  ['{}', 'EX_UNSUPPORTED_FORMAT', 'no-events'],
  [json([5]), 'EX_UNSUPPORTED_FORMAT', 'bad-event'],
  [json([{ tStartMs: -1, segs: [{ utf8: 'a' }] }]), 'EX_UNSUPPORTED_FORMAT', 'bad-start'],
  [json([{ tStartMs: 0, segs: [{ utf8: ' ' }] }, { tStartMs: 0 }]), 'EX_EMPTY_BODY', 'no-text-events'],
];

test('التحليل: كل ConvertError برمزه وسببه، وتقرير التحويل يحمل السبب', () => {
  for (const [body, code, reason] of PARSE) {
    assert.throws(() => parseJson3(body), (e) => e instanceof ConvertError && e.code === code && e.reason === reason, reason);
    const r = convertTrack({ body, trackKind: 'manual' });
    assert.deepEqual([r.ok, r.code, r.report.reason], [false, code, reason]);
    assert.ok(REASONS.includes(r.report.reason));
  }
});

const asrEvent = (start, dur, words) => ({
  tStartMs: start, dDurationMs: dur, segs: words.map(([t, w], i) => ({ utf8: i ? ` ${w}` : w, ...(i ? { tOffsetMs: t } : {}), acAsrConf: 0 })),
});
const CONVERT = ['rolling-time', 'rolling-pattern', 'invariant', 'beyond-duration'];
const LINES = ['the quick brown fox', 'jumps over the lazy', 'dog and then it', 'runs far away now'];

test('التحويل: التدحرج بالزمن وبالنمط، وفشل الثوابت، وفشل الحدود وحده، كلٌّ بسببه؛ والسليم بلا سبب', () => {
  const byTime = convertTrack({ trackKind: 'asr', durationMs: 8000, body: json([
    asrEvent(0, 5000, [[0, 'one'], [1000, 'two'], [2000, 'three'], [3000, 'four']]),
    asrEvent(1000, 5000, [[0, 'two'], [1000, 'three'], [2000, 'four'], [3000, 'five']]),
  ]) });
  const byPattern = convertTrack({ trackKind: 'asr', durationMs: 20000, body: json(LINES.map((l, i) => ({
    tStartMs: i * 2000, dDurationMs: 4000, segs: [{ utf8: i ? `${LINES[i - 1]}\n${l}` : l, tOffsetMs: 0, acAsrConf: 1 }],
  }))) });
  // زمن بداية خارج ما يكتبه SRT: يفشل غير ثابت الحدود (التداخل وإعادة التحليل).
  const invariant = convertTrack({ trackKind: 'manual', body: json([{ tStartMs: 1e20, dDurationMs: 2000, segs: [{ utf8: 'hello' }] }]) });
  const beyond = convertTrack({ trackKind: 'manual', durationMs: 1000, body: json([{ tStartMs: 5000, dDurationMs: 4000, segs: [{ utf8: 'a' }] }]) });
  const cases = [[byTime, 'EX_UNSUPPORTED_FORMAT', 'rolling-time'], [byPattern, 'EX_UNSUPPORTED_FORMAT', 'rolling-pattern'],
    [invariant, 'EX_INVARIANT_FAILED', 'invariant'], [beyond, 'EX_BEYOND_DURATION', 'beyond-duration']];
  assert.deepEqual(cases.map((c) => c[2]), CONVERT);
  for (const [r, code, reason] of cases) {
    assert.deepEqual([r.ok, r.code, r.report.reason], [false, code, reason], reason);
    assert.ok(REASONS.includes(r.report.reason));
  }
  const ok = convertTrack({ trackKind: 'manual', durationMs: 4000, body: json([{ tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: 'hi' }] }]) });
  assert.deepEqual([ok.ok, ok.report.reason], [true, undefined]);
});

test('كل رد رفض في القبول وكل ConvertError يحمل سببًا، وكل سبب في القائمة تُصدره حالة مختبرة هنا', () => {
  // الشيفرة بلا أسطر التعليق (فيها نوع الرد بحقوله).
  const adapter = src('extract/capture-adapter.js').split('\n').filter((l) => !/^\s*(?:\*|\/\/|\/\*\*)/.test(l)).join('\n');
  assert.equal((adapter.match(/, reason: /g) ?? []).length, (adapter.match(/accepted: false/g) ?? []).length, 'رد رفض في القبول بلا reason');
  for (const rel of ['core/convert/json3.js', 'core/convert/asr.js', 'core/convert/index.js']) {
    for (const line of src(rel).split('\n').filter((l) => l.includes('new ConvertError('))) {
      // الرمز، ثم الوصف، ثم التفصيل، ثم السبب رابعًا.
      assert.match(line, /new ConvertError\('EX_[A-Z_]+', (?:'[^']*'|`[^`]*`), [^,]+, [^)]+\)/, `${rel}: ConvertError بلا سبب: ${line.trim()}`);
    }
  }
  const produced = new Set([...ACCEPTANCE.map((c) => c[3]), ...PARSE.map((c) => c[2]), ...CONVERT]);
  assert.deepEqual(REASONS.filter((r) => r !== 'other' && !produced.has(r)), [], 'سبب في القائمة لا تُصدره حالة مختبرة');
});
