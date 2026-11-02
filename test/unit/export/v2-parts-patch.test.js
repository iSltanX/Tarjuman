// التقسيم عند الجمل أو الصمت (P11-AC5، R60)، وملف الاستكمال من مصدر مثبت (P11-AC4، R52): ترقيم مستمر وضمّ مطابق للملف
// الكامل؛ والنص الإنجليزي من المسار المحفوظ، وفي «مقاطع أطول» لا تُقبل إعادة الاشتقاق إلا بمطابقة بصمة النص والأزمنة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertTrack } from '../../../src/core/convert/index.js';
import {
  CONTENT_SPLIT, buildExport, buildPatchPackage, instructions, patchInstructions, planParts, planPartsByContent,
} from '../../../src/core/export/index.js';
import { writeSrtFrom } from '../../../src/core/export/write.js';
import { endsSentence } from '../../../src/core/convert/text.js';
import { validateFingerprint } from '../../../src/core/model/tracks.js';
import { parseSrtStrict } from '../../../src/core/srt/parser.js';
import { parseSrtLenient } from '../../../src/core/srt/lenient.js';
import { realTrack } from '../../helpers/fixtures.js';
import { longTrack } from '../../fixtures/v2/index.js';

const NOW = '2026-11-02T10:00:00.000Z';
const EN = longTrack(2400);
const trackOf = (cues, kind = 'manual') => ({ key: `en|${kind}`, lang: 'en', kind, cues });

test('التقسيم بالمحتوى: لا يلزم دون الحجم، وإلا العدد نفسه من الأجزاء بترقيم مستمر وكل حد ضمن التفاوت المكتوب', () => {
  assert.equal(planPartsByContent(EN.slice(0, 500), 500), null);
  const parts = planPartsByContent(EN, 500);
  const balanced = planParts(2400, 500);
  assert.equal(parts.length, balanced.length);
  assert.equal(parts[0].from, 1);
  assert.equal(parts.at(-1).to, 2400);
  parts.forEach((p, i) => {
    assert.equal(p.index, i + 1);
    if (i) assert.equal(p.from, parts[i - 1].to + 1);
    if (i < parts.length - 1) {
      const tol = Math.max(1, Math.round((2400 / parts.length) * CONTENT_SPLIT.tolerance));
      assert.ok(Math.abs(p.to - balanced[i].to) <= tol, `الحد ${p.to} والمتوازن ${balanced[i].to}`);
      const gap = EN[p.to].startMs - EN[p.to - 1].endMs;
      assert.ok(endsSentence(EN[p.to - 1].text) || gap >= CONTENT_SPLIT.silenceMs, `الحد ${p.to} عند جملة أو صمت`);
    }
  });
});

test('عيّنة P1 اليدوية الحقيقية (427): كل حد عند نهاية جملة أو صمت (مثل «(Laughter)» يليه صمت)', () => {
  const { cues } = realTrack('manual');
  const parts = planPartsByContent(cues, 100);
  assert.equal(parts.length, 5);
  for (const p of parts.slice(0, -1)) {
    const gap = cues[p.to].startMs - cues[p.to - 1].endMs;
    assert.ok(endsSentence(cues[p.to - 1].text) || gap >= CONTENT_SPLIT.silenceMs, `${cues[p.to - 1].text} (${gap}ms)`);
  }
});

test('الأجزاء بالمحتوى تُكتب بترقيم مستمر وضمّها يطابق الملف الكامل، وتجتاز مدقق أجزاء البصمة؛ والتقسيم القديم باقٍ', () => {
  const plan = planPartsByContent(EN, 500);
  const full = buildExport({ videoId: 'iG9CE55wbtY', track: trackOf(EN), mode: 'normal', now: NOW });
  const texts = plan.map((p) => writeSrtFrom(EN.slice(p.from - 1, p.to), p.from));
  assert.equal(texts.join('\n'), full.files[0].text);
  assert.equal(parseSrtStrict(full.files[0].text).length, 2400);
  texts.forEach((t, i) => assert.equal(parseSrtLenient(t).cues[0].n, plan[i].from));
  assert.deepEqual(validateFingerprint({ ...full.fingerprint, fileName: null, parts: plan }), { ok: true });
  assert.ok(instructions({ videoId: 'iG9CE55wbtY', title: null, parts: plan }).includes(`الجزء 2 (المقاطع ${plan[1].from}–${plan[1].to})`));
  const byCount = buildExport({ videoId: 'iG9CE55wbtY', track: trackOf(EN), mode: 'normal', split: { size: 500 }, now: NOW });
  assert.deepEqual(byCount.fingerprint.parts, planParts(2400, 500), 'buildExport بتقسيمه القديم كما هو');
});

test('ملف الاستكمال (عادي، عيّنة P1): الأرقام المختارة بأزمنة البصمة ونص المسار، وتعليمات الملحق ب، واسم بعلامة en', () => {
  const { cues } = realTrack('manual');
  const track = { ...trackOf(cues), capturedAt: NOW, source: 'capture' };
  const { fingerprint } = buildExport({ videoId: 'iG9CE55wbtY', title: 'Do schools kill creativity?', track, mode: 'normal', now: NOW });
  const r = buildPatchPackage({ videoId: 'iG9CE55wbtY', title: 'Do schools kill creativity?', fingerprint, englishTracks: [track], numbers: [201, 57, 58] });
  assert.equal(r.ok, true);
  assert.equal(r.count, 3);
  assert.equal(r.file.name, 'iG9CE55wbtY.en.manual.normal.patch.srt');
  const back = parseSrtLenient(r.file.text).cues;
  assert.deepEqual(back.map((c) => c.n), [57, 58, 201]);
  back.forEach((c) => {
    assert.deepEqual([c.startMs, c.endMs], [fingerprint.cues[c.n - 1].startMs, fingerprint.cues[c.n - 1].endMs]);
    assert.equal(c.text, cues[c.n - 1].text);
  });
  assert.equal(r.instructions, patchInstructions({ videoId: 'iG9CE55wbtY', title: 'Do schools kill creativity?' }));
});

test('ملف الاستكمال في «مقاطع أطول» (عيّنة P1 التلقائية): يُعاد الاشتقاق ويُقبل بمطابقة البصمة، ويُرفض عند أي اختلاف', () => {
  const asr = realTrack('asr');
  const stored = { ...trackOf(asr.cues, 'asr'), capturedAt: NOW, source: 'capture' };
  const long = convertTrack({ body: asr.body, trackKind: 'asr', durationMs: asr.fixture.durationMs, mode: 'long' });
  const { fingerprint } = buildExport({ videoId: 'Y9rkKtK1b44', track: trackOf(long.cues, 'asr'), mode: 'long', now: NOW });
  const ok = buildPatchPackage({ videoId: 'Y9rkKtK1b44', fingerprint, englishTracks: [stored], numbers: [1, 400, 729] });
  assert.equal(ok.ok, true);
  assert.equal(ok.file.name, 'Y9rkKtK1b44.en.asr.long.patch.srt');
  assert.deepEqual(parseSrtLenient(ok.file.text).cues.map((c) => c.text), [1, 400, 729].map((n) => long.cues[n - 1].text));

  // وضع طويل بخيارات غير الافتراضية: العدد أو الأزمنة تختلف، فلا يُقبل الاشتقاق.
  const custom = convertTrack({ body: asr.body, trackKind: 'asr', durationMs: asr.fixture.durationMs, mode: 'long', longOptions: { maxDurationMs: 6000 } });
  const fpCustom = buildExport({ videoId: 'Y9rkKtK1b44', track: trackOf(custom.cues, 'asr'), mode: 'long', now: NOW }).fingerprint;
  assert.deepEqual(buildPatchPackage({ videoId: 'Y9rkKtK1b44', fingerprint: fpCustom, englishTracks: [stored], numbers: [1] }), { ok: false, code: 'EX_PATCH_SOURCE_MISMATCH' });
  // بصمة نص لا تطابق (المسار المحفوظ أُعيد التقاطه بنص مختلف): رفض.
  const tampered = { ...stored, cues: stored.cues.map((c, i) => (i === 3 ? { ...c, text: `${c.text} x` } : c)) };
  assert.deepEqual(buildPatchPackage({ videoId: 'Y9rkKtK1b44', fingerprint, englishTracks: [tampered], numbers: [1] }), { ok: false, code: 'EX_PATCH_SOURCE_MISMATCH' });
});

test('ملف الاستكمال يرفض برمز: لا مسار، وفيديو آخر، وأرقام غير صالحة، ومعرّف غير صالح', () => {
  const track = { ...trackOf(EN), capturedAt: NOW, source: 'capture' };
  const { fingerprint } = buildExport({ videoId: 'iG9CE55wbtY', track, mode: 'normal', now: NOW });
  const run = (over) => buildPatchPackage({ videoId: 'iG9CE55wbtY', fingerprint, englishTracks: [track], numbers: [1], ...over });
  assert.deepEqual(run({ englishTracks: [] }), { ok: false, code: 'EX_PATCH_NO_SOURCE' });
  assert.deepEqual(run({ fingerprint: null }), { ok: false, code: 'EX_PATCH_NO_SOURCE' });
  assert.deepEqual(run({ videoId: 'Y9rkKtK1b44' }), { ok: false, code: 'EX_PATCH_SOURCE_MISMATCH' });
  for (const numbers of [[], [0], [2401], [3, 3], [1.5], null]) assert.deepEqual(run({ numbers }), { ok: false, code: 'EX_PATCH_BAD_NUMBERS' });
  assert.deepEqual(run({ videoId: 'bad' }), { ok: false, code: 'TJ_BAD_VIDEO_ID' });
});
