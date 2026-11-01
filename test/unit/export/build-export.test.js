// buildExport وbuildArabicExport على العينتين الحقيقيتين بمسار المنتج: التقاط ← convert ← buildExport (P3-AC2،
// AC5، AC6). يقارن الوضع العادي بملفي SRT اللذين ولّدتهما P1 حيًا من الجسمين نفسيهما.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TjError } from '../../../src/core/errors/index.js';
import { buildArabicExport, buildExport } from '../../../src/core/export/index.js';
import { validateFingerprint } from '../../../src/core/model/tracks.js';
import { withExport } from '../../../src/core/model/transitions.js';
import { parseSrtStrict } from '../../../src/core/srt/parser.js';
import { writeSrt } from '../../../src/core/srt/writer.js';
import { captureMsg, makeExtractor, sample } from '../extract/helpers.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const p1Srt = (name) => readFileSync(path.join(ROOT, 'docs/evidence/P1/srt', name), 'utf8');
const NOW = '2026-11-01T12:00:00.000Z';
const rand = () => 0.5;

/** مسار ملتقط حقيقي كما تعطيه controller.convertCaptured للأدوات. */
function captured(kind, mode) {
  const s = sample(kind);
  const { extractor } = makeExtractor({ videoId: s.fixture.videoId, durationMs: s.fixture.durationMs });
  extractor.handleMessage(captureMsg({ videoId: s.fixture.videoId, body: s.body, trackKind: kind }));
  const conv = extractor.convert(`en|${kind}`, { mode });
  assert.equal(conv.ok, true);
  return { videoId: s.fixture.videoId, track: { key: conv.key, lang: conv.lang, kind: conv.kind, cues: conv.cues, warnings: conv.warnings } };
}

const cases = [['manual', 'iG9CE55wbtY.en.manual.srt'], ['asr', 'Y9rkKtK1b44.en.asr.srt']];

for (const [kind, p1File] of cases) {
  test(`${kind} عادي: الملف مطابق حرفيًا لما ولّدته P1 حيًا، باسم المعرّف واللغة والنوع والوضع`, () => {
    const { videoId, track } = captured(kind, 'normal');
    const out = buildExport({ videoId, track, mode: 'normal', now: NOW, rand });
    assert.equal(out.files.length, 1);
    assert.equal(out.files[0].name, `${videoId}.en.${kind}.normal.srt`);
    assert.equal(out.files[0].text, p1Srt(p1File), 'مطابقة P1');
    assert.equal(out.files[0].part, null);
    assert.equal(out.files[0].cueCount, track.cues.length);
    assert.deepEqual(out.warnings, []);
  });

  for (const mode of ['normal', 'long']) {
    test(`${kind} ${mode}: SRT صارم، وبصمة تحفظ الترقيم والتوقيت، وتجتاز مدقق النموذج`, () => {
      const { videoId, track } = captured(kind, mode);
      const out = buildExport({ videoId, track, mode, now: NOW, rand });
      const back = parseSrtStrict(out.files[0].text);
      assert.equal(back.length, track.cues.length);
      assert.deepEqual(back, track.cues);
      const fp = out.fingerprint;
      assert.deepEqual(validateFingerprint(fp), { ok: true });
      assert.deepEqual([fp.videoId, fp.trackKey, fp.mode, fp.count, fp.parts, fp.createdAt], [videoId, `en|${kind}`, mode, track.cues.length, null, NOW]);
      assert.equal(fp.fileName, out.files[0].name);
      assert.deepEqual(fp.cues, back.map(({ n, startMs, endMs }) => ({ n, startMs, endMs })), 'ترقيم وتوقيت كل مقطع كما صُدِّر');
      assert.equal(JSON.stringify(fp).includes(track.cues[3].text.split('\n')[0]), false, 'البصمة بلا نص');
      assert.match(fp.id, /^fp_[a-z0-9]{6,40}$/);
      assert.match(fp.textHash, /^fnv1a64:[0-9a-f]{16}$/);
      assert.match(out.instructions, new RegExp(`${track.cues.length}`));
    });
  }

  test(`${kind}: الطويل أقل مقاطع من العادي والبصمتان مختلفتان باسميهما ووضعيهما`, () => {
    const normal = buildExport({ ...captured(kind, 'normal'), mode: 'normal', now: NOW, rand });
    const long = buildExport({ ...captured(kind, 'long'), mode: 'long', now: NOW, rand });
    assert.ok(long.fingerprint.count < normal.fingerprint.count);
    assert.notEqual(long.fingerprint.textHash, normal.fingerprint.textHash, 'حدود المقاطع تختلف');
    assert.equal(long.files[0].name.includes('.long.'), true);
  });
}

test('البصمة تُحفظ في السجل بمنطق P2 كما هي (withExport)', () => {
  const { videoId, track } = captured('manual', 'normal');
  const out = buildExport({ videoId, track, mode: 'normal', now: NOW, rand });
  const englishTrack = { key: track.key, lang: track.lang, kind: track.kind, capturedAt: NOW, source: 'capture', cues: track.cues };
  const rec = withExport(null, { videoId, title: 'عنوان', durationMs: 1203421, englishTrack, fingerprint: out.fingerprint }, NOW);
  assert.deepEqual(rec.fingerprints, [out.fingerprint]);
  assert.equal(rec.english[0].cues.length, 427);
});

test('التقسيم الاحتياطي: ترقيم مستمر، وضمّ الأجزاء يعطي الملف الكامل، وبصمة بأجزائها', () => {
  const { videoId, track } = captured('asr', 'normal');
  const whole = buildExport({ videoId, track, mode: 'normal', now: NOW, rand });
  const out = buildExport({ videoId, track, mode: 'normal', split: { size: 200 }, now: NOW, rand });
  assert.equal(out.files.length, 6, '1056 مقطعًا بحد 200 ← 6 أجزاء');
  assert.deepEqual(out.fingerprint.parts.map((p) => p.index), [1, 2, 3, 4, 5, 6]);
  assert.equal(out.fingerprint.parts[0].from, 1);
  assert.equal(out.fingerprint.parts.at(-1).to, 1056);
  assert.deepEqual(validateFingerprint(out.fingerprint), { ok: true });
  assert.equal(out.fingerprint.fileName, null);
  assert.equal(out.files.map((f) => f.text).join('\n'), whole.files[0].text, 'ضمّ الأجزاء = الملف الكامل');
  let next = 1;
  out.files.forEach((f, i) => {
    const p = out.fingerprint.parts[i];
    assert.equal(f.name, `${videoId}.en.asr.normal.part0${i + 1}of06.srt`);
    assert.deepEqual(f.part, { ...p, total: 6 });
    assert.equal(f.cueCount, p.to - p.from + 1);
    assert.ok(f.cueCount <= 200);
    const numbers = f.text.split('\n\n').map((b) => Number(b.split('\n')[0]));
    assert.equal(numbers[0], next, 'الترقيم يستمر من حيث انتهى الجزء السابق');
    assert.deepEqual(numbers, Array.from({ length: f.cueCount }, (_, k) => next + k));
    next += f.cueCount;
  });
  assert.equal(next, 1057);
  assert.deepEqual(out.fingerprint.cues, whole.fingerprint.cues, 'بصمة الأزمنة كاملة لا تتغير بالتقسيم');
  assert.match(out.instructions, /6 أجزاء/);
  assert.match(out.instructions, /الجزء 2 \(المقاطع 177–352\)/);
});

test('التقسيم لا يعمل إلا بطلب صريح، ولا يلزم إن كفى حجم الجزء', () => {
  const { videoId, track } = captured('manual', 'normal');
  assert.equal(buildExport({ videoId, track, mode: 'normal', now: NOW }).files.length, 1, 'بلا split لا تقسيم أبدًا ولو كثرت المقاطع');
  assert.equal(buildExport({ videoId, track, mode: 'normal', split: null, now: NOW }).files.length, 1);
  const small = buildExport({ videoId, track, mode: 'normal', split: { size: 5000 }, now: NOW });
  assert.equal(small.files.length, 1);
  assert.deepEqual(small.warnings, ['EX_SPLIT_NOT_NEEDED']);
  assert.equal(small.fingerprint.parts, null);
  assert.equal(small.fingerprint.fileName, small.files[0].name);
  for (const size of [0, -1, 1.5, '200']) {
    assert.throws(() => buildExport({ videoId, track, mode: 'normal', split: { size }, now: NOW }), (e) => e.code === 'MD_INVALID', String(size));
  }
  assert.throws(() => buildExport({ videoId, track, mode: 'normal', split: {}, now: NOW }), (e) => e.code === 'MD_INVALID');
});

test('تحذيرات التحويل تمر إلى الناتج بلا تكرار', () => {
  const { videoId, track } = captured('manual', 'normal');
  const out = buildExport({ videoId, track: { ...track, warnings: ['EX_MAYBE_INCOMPLETE', 'EX_MAYBE_INCOMPLETE'] }, mode: 'normal', split: { size: 9999 }, now: NOW });
  assert.deepEqual(out.warnings, ['EX_MAYBE_INCOMPLETE', 'EX_SPLIT_NOT_NEEDED']);
});

test('العنوان لا يدخل ملفًا ولا بصمة ولا تعليمات', () => {
  const { videoId, track } = captured('manual', 'normal');
  const out = buildExport({ videoId, title: 'عنوان سري جدًا', track, mode: 'normal', now: NOW });
  assert.equal(JSON.stringify(out).includes('سري'), false);
});

test('رموز الفشل: كل حالة برمز ثابت لا برسالة حرة', () => {
  const { videoId, track } = captured('manual', 'normal');
  const code = (fn) => {
    try {
      fn();
    } catch (e) {
      assert.ok(e instanceof TjError, String(e));
      return e.code;
    }
    return null;
  };
  const build = (over) => () => buildExport({ videoId, track, mode: 'normal', now: NOW, ...over });
  assert.equal(code(build({ videoId: 'bad' })), 'TJ_BAD_VIDEO_ID');
  assert.equal(code(build({ mode: 'huge' })), 'MD_INVALID');
  assert.equal(code(build({ track: { ...track, key: 'en|asr' } })), 'MD_INVALID', 'المفتاح لا يطابق النوع');
  assert.equal(code(build({ track: { ...track, key: 'x' } })), 'MD_INVALID');
  assert.equal(code(build({ track: { ...track, cues: [] } })), 'EX_NO_TRACK');
  assert.equal(code(build({ track: { ...track, cues: undefined } })), 'EX_NO_TRACK');
  assert.equal(code(build({ track: undefined })), 'MD_INVALID');
  assert.equal(code(build({ now: 'ليس تاريخًا' })), 'MD_INVALID');
  assert.equal(code(build({ track: { ...track, cues: [{ n: 1, startMs: 0, endMs: 1 }] } })), 'MD_INVALID', 'مقطع ناقص المفاتيح');
  const cues = track.cues.slice(0, 5).map((c) => ({ ...c }));
  assert.equal(code(build({ track: { ...track, cues: cues.map((c, i) => (i === 2 ? { ...c, text: '' } : c)) } })), 'EX_EMPTY_TEXT');
  assert.equal(code(build({ track: { ...track, cues: cues.map((c, i) => (i === 2 ? { ...c, text: 'a\n\nb' } : c)) } })), 'EX_EMPTY_TEXT');
  assert.equal(code(build({ track: { ...track, cues: cues.map((c, i) => (i === 2 ? { ...c, endMs: c.startMs } : c)) } })), 'EX_TIMING_INVALID');
  assert.equal(code(build({ track: { ...track, cues: cues.map((c, i) => (i === 1 ? { ...c, endMs: cues[2].startMs + 1 } : c)) } })), 'EX_TIMING_INVALID');
  assert.throws(build({ track: { ...track, cues: cues.map((c, i) => (i === 2 || i === 3 ? { ...c, text: '  ' } : c)) } }), (e) => /3، 4/.test(e.message));
});

test('المدخل لا يتغير بعد التصدير ولو قُسّم', () => {
  const { videoId, track } = captured('manual', 'normal');
  const snapshot = structuredClone(track);
  buildExport({ videoId, track, mode: 'normal', split: { size: 100 }, now: NOW });
  assert.deepEqual(track, snapshot);
});

test('now يقبل مللي ثانية وDate ونصًا', () => {
  const { videoId, track } = captured('manual', 'normal');
  const ms = Date.parse(NOW);
  for (const now of [ms, new Date(ms), NOW]) assert.equal(buildExport({ videoId, track, mode: 'normal', now }).fingerprint.createdAt, NOW);
  assert.match(buildExport({ videoId, track, mode: 'normal' }).fingerprint.id, /^fp_/);
});

test('buildArabicExport: اسم VIDEOID.ar.srt وترقيم من 1 وأزمنة المقاطع كما هي', () => {
  const cues = [
    { n: 5, startMs: 1000, endMs: 2500, text: 'مرحبًا بكم' },
    { n: 6, startMs: 2500, endMs: 4000, text: 'سطر أول\nسطر ثانٍ' },
  ];
  const out = buildArabicExport({ videoId: 'iG9CE55wbtY', cues });
  assert.equal(out.name, 'iG9CE55wbtY.ar.srt');
  assert.equal(out.text, writeSrt(cues));
  assert.deepEqual(parseSrtStrict(out.text).map((c) => [c.n, c.startMs, c.endMs, c.text]), [[1, 1000, 2500, 'مرحبًا بكم'], [2, 2500, 4000, 'سطر أول\nسطر ثانٍ']]);
  assert.equal(out.text.charCodeAt(0) === 0xfeff, false, 'بلا BOM');
  assert.equal(out.text.includes('\r'), false, 'LF');
  assert.equal(buildArabicExport({ videoId: 'iG9CE55wbtY', cues, variant: 'original' }).name, 'iG9CE55wbtY.ar.original.srt');
});

test('buildArabicExport: يرفض الفراغ والتوقيت الخاطئ والمدخل التالف برموز ثابتة', () => {
  const ok = [{ n: 1, startMs: 0, endMs: 1000, text: 'نص' }, { n: 2, startMs: 1000, endMs: 2000, text: 'آخر' }];
  const code = (over, extra = {}) => {
    try {
      buildArabicExport({ videoId: 'iG9CE55wbtY', cues: over, ...extra });
    } catch (e) {
      return e.code;
    }
    return null;
  };
  assert.equal(code(ok), null);
  assert.equal(code([]), 'ST_NO_RECORD');
  assert.equal(code(undefined), 'ST_NO_RECORD');
  assert.equal(code([{ ...ok[0], text: '' }, ok[1]]), 'EX_EMPTY_TEXT');
  assert.equal(code([ok[0], { ...ok[1], startMs: 500 }]), 'EX_TIMING_INVALID');
  assert.equal(code([{ ...ok[0], endMs: 0 }, ok[1]]), 'EX_TIMING_INVALID');
  assert.equal(code([{ ...ok[0], startMs: -1 }, ok[1]]), 'MD_INVALID');
  assert.equal(code([{ ...ok[0], extra: 1 }, ok[1]]), 'MD_INVALID');
  assert.equal(code(ok, { videoId: 'x' }), 'TJ_BAD_VIDEO_ID');
  assert.equal(code(ok, { variant: 'x' }), 'MD_INVALID');
  assert.equal(code([{ ...ok[0], text: 'a\r\nb' }, ok[1]]), 'EX_INVARIANT_FAILED', 'CR داخل النص لا يُعاد تحليله مطابقًا');
});
