// فحص الملف الوارد (P11-AC3، R48 وR50): ترتيب المراجع بالمطابقة الفعلية لا بالأحدث، و«غير مؤكد» عند التقارب، وقرينة اسم
// الملف تنبيه لا رفض بلا إنذار خاطئ على قائمة أسماء مخصصة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankReferences } from '../../../src/core/compare/index.js';
import { classTransitions, reviewIncoming, videoIdFromName } from '../../../src/core/import/index.js';
import { convertTrack } from '../../../src/core/convert/index.js';
import { parseSrtLenient } from '../../../src/core/srt/lenient.js';
import { englishTrack, fingerprint, realTrack } from '../../helpers/fixtures.js';
import { REAL_ARABIC, arabicTwin, dropAt, longTrack, realArabic } from '../../fixtures/v2/index.js';

const VIDEO = 'iG9CE55wbtY';
const EN = longTrack(2400);
const fpOf = (cues, over = {}) => fingerprint({ videoId: VIDEO, track: englishTrack({ cues, ...(over.kind ? { kind: over.kind } : {}) }), ...over });

test('الترتيب بالمطابقة لا بالأحدث: التصدير المطابق أولًا ولو كان أقدم، والأحدث يرجّح عند التساوي وحده', () => {
  const ar = arabicTwin(EN);
  const right = fpOf(EN, { id: 'fp_right0001', createdAt: '2026-11-01T10:00:00.000Z' });
  const other = fpOf(longTrack(2400, { seed: 77 }), { id: 'fp_other0001', createdAt: '2026-11-02T10:00:00.000Z' });
  const ranked = rankReferences(ar, [other, right]);
  assert.deepEqual(ranked.map((r) => r.fingerprintId), ['fp_right0001', 'fp_other0001']);
  assert.equal(ranked[0].matched, true);
  assert.equal(ranked[0].score, 1);
  assert.match(ranked[0].why, /مطابقة/);
  assert.ok(ranked[1].score < 0.5);
  assert.match(ranked[1].why, /العدد 2400 مقابل 2400/);

  const twinNew = fpOf(EN, { id: 'fp_twin00002', createdAt: '2026-11-02T00:00:00.000Z' });
  assert.deepEqual(rankReferences(ar, [right, twinNew]).map((r) => r.fingerprintId), ['fp_twin00002', 'fp_right0001']);
});

test('عيّنة P1 التلقائية: الملف العربي بوضع «مقاطع أطول» يطابق بصمة الطويل لا العادي الأحدث', () => {
  const asr = realTrack('asr');
  const long = convertTrack({ body: asr.body, trackKind: 'asr', durationMs: asr.fixture.durationMs, mode: 'long' });
  const fpLong = fingerprint({ videoId: 'Y9rkKtK1b44', id: 'fp_long00001', mode: 'long', track: englishTrack({ kind: 'asr', cues: long.cues }), createdAt: '2026-11-01T00:00:00.000Z' });
  const fpNormal = fingerprint({ videoId: 'Y9rkKtK1b44', id: 'fp_norm00001', track: englishTrack({ kind: 'asr', cues: asr.cues }), createdAt: '2026-11-02T00:00:00.000Z' });
  const ar = parseSrtLenient(realArabic(REAL_ARABIC.asrLong)).cues;
  const review = reviewIncoming({ fileName: 'Y9rkKtK1b44.en.asr.long.ar.srt', cues: ar, videoId: 'Y9rkKtK1b44', fingerprints: [fpNormal, fpLong] });
  assert.equal(review.suggested, 'fp_long00001');
  assert.equal(review.certain, true);
  assert.deepEqual(review.nameHint, { videoId: 'Y9rkKtK1b44', differs: false });
});

test('«غير مؤكد» عند التقارب: ملف ناقص بين تصديرين متقاربين؛ ومؤكد بمطابقة تامة، أو حين يكون الأفضلان تصديرًا واحدًا', () => {
  const ar = dropAt(arabicTwin(EN), Array.from({ length: 100 }, (_, i) => i * 24));
  const a = fpOf(EN, { id: 'fp_aaaaaa01' });
  const near = fpOf(EN.map((c, i) => (i % 20 === 0 ? { ...c, startMs: c.startMs + 400, endMs: c.endMs + 400 } : c)), { id: 'fp_bbbbbb01' });
  const r = reviewIncoming({ fileName: 'translation.ar.srt', cues: ar, videoId: VIDEO, fingerprints: [near, a] });
  assert.equal(r.references[0].fingerprintId, 'fp_aaaaaa01');
  assert.ok(r.references[0].score >= 0.8 && r.references[0].score - r.references[1].score < 0.1, JSON.stringify(r.references));
  assert.deepEqual([r.suggested, r.certain], ['fp_aaaaaa01', false]);

  const full = arabicTwin(EN);
  const exact = reviewIncoming({ fileName: 'x.srt', cues: full, videoId: VIDEO, fingerprints: [near, a] });
  assert.deepEqual([exact.suggested, exact.certain, exact.references[0].matched, exact.references[1].matched], ['fp_aaaaaa01', true, true, false]);

  const twin = fpOf(EN, { id: 'fp_cccccc01' });
  const same = reviewIncoming({ fileName: 'x.srt', cues: full, videoId: VIDEO, fingerprints: [a, twin] });
  assert.equal(same.references[0].score, same.references[1].score);
  assert.equal(same.certain, true, 'تصديران متطابقان: أيهما صحيح');
});

test('بلا بصمات: لا مراجع ولا مقترح ولا تأكيد', () => {
  assert.deepEqual(reviewIncoming({ fileName: 'a.srt', cues: arabicTwin(EN), videoId: VIDEO, fingerprints: [] }), {
    references: [], suggested: null, certain: false, nameHint: null,
  });
});

test('قرينة اسم الملف: الفيديو الحالي، وفيديو آخر في المحفوظات، ونمط أسماء ترجمان، والمعرّف العشوائي بوضوح', () => {
  assert.deepEqual(videoIdFromName(`${VIDEO}.en.manual.normal.ar.srt`, { videoId: VIDEO }), { videoId: VIDEO, differs: false });
  assert.deepEqual(videoIdFromName('Y9rkKtK1b44.ar.srt', { videoId: VIDEO }), { videoId: 'Y9rkKtK1b44', differs: true });
  assert.deepEqual(videoIdFromName('Talk [aB3kL9mPq2X].srt', { videoId: VIDEO }), { videoId: 'aB3kL9mPq2X', differs: true });
  assert.deepEqual(videoIdFromName('my-talk-aB3kL9mPq2X.srt', { videoId: VIDEO }), { videoId: 'aB3kL9mPq2X', differs: true });
  // معرّف حقيقي قليل التبدّل لا يُعرف إلا من المحفوظات أو من نمط أسماء ترجمان.
  assert.equal(videoIdFromName('dqw4w9wgxcq.ar.srt', { videoId: VIDEO }), null);
  assert.deepEqual(videoIdFromName('dqw4w9wgxcq.ar.srt', { videoId: VIDEO, knownVideoIds: ['dqw4w9wgxcq'] }), { videoId: 'dqw4w9wgxcq', differs: true });
  assert.deepEqual(videoIdFromName('dqw4w9wgxcq.en.asr.long.ar.srt', { videoId: VIDEO }), { videoId: 'dqw4w9wgxcq', differs: true });
  // المعرّف الحالي يُقدَّم على غيره في الاسم نفسه.
  assert.deepEqual(videoIdFromName(`Y9rkKtK1b44 then ${VIDEO}.srt`, { videoId: VIDEO }), { videoId: VIDEO, differs: false });
});

test('بلا إنذار خاطئ على قائمة أسماء مخصصة', () => {
  const names = [
    'translation.ar.srt', 'Translation.srt', 'KenRobinson.ar.srt', 'TEDtalk2006.srt', 'Season2Ep10.ar.srt', 'SirKenTED06.srt',
    'my_subtitles.srt', 'final_arabic.srt', 'subtitle-v2b.srt', 'الترجمة العربية.srt', 'ted talk (final).md', 'Copy of translation (2).txt',
    'Lecture_2026.ar.srt', 'part1of3.srt', 'MidwayBattle.srt', 'arabic-v2-final.srt', 'ChatGPT-output.srt', 'claude_answer.md',
    'Episode01-ar.srt', 'HelloWorld1.srt', 'translated.srt', 'iPhoneVideo.srt', 'MyTranslate.ar.txt',
  ];
  for (const name of names) assert.equal(videoIdFromName(name, { videoId: VIDEO, knownVideoIds: ['Y9rkKtK1b44'] }), null, name);
  assert.equal(classTransitions('TEDtalk2006'), 2);
  assert.ok(classTransitions('iG9CE55wbtY') >= 6);
});
