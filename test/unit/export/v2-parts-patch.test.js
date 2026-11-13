// التقسيم عند الجمل أو الصمت (P11-AC5، R60)، وملف الاستكمال من مصدر مثبت (P11-AC4، R52): ترقيم مستمر وضمّ مطابق للملف
// الكامل؛ والنص الإنجليزي من المسار المحفوظ، وفي «مقاطع أطول» لا تُقبل إعادة الاشتقاق إلا بمطابقة بصمة النص والأزمنة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertTrack } from '../../../src/core/convert/index.js';
import { CONTENT_SPLIT, buildExport, buildPatchPackage, patchInstructions, planParts, planPartsByContent } from '../../../src/core/export/index.js';
import { endsSentence } from '../../../src/core/convert/text.js';
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

test('buildExport بالتقسيم بالمحتوى: ضمّ الأجزاء يطابق الملف الكامل، وأجزاء البصمة هي الخطة، والأسماء partNNofMM', () => {
  const r = buildExport({ videoId: 'iG9CE55wbtY', track: trackOf(EN), mode: 'normal', split: { size: 500, by: 'content' }, now: NOW });
  const plan = planPartsByContent(EN, 500);
  assert.deepEqual(r.fingerprint.parts, plan);
  assert.equal(r.files.length, plan.length);
  assert.equal(r.files[0].name, 'iG9CE55wbtY.en.manual.normal.part1of5.srt'.replace('part1of5', 'part01of05'));
  const full = buildExport({ videoId: 'iG9CE55wbtY', track: trackOf(EN), mode: 'normal', now: NOW }).files[0].text;
  assert.equal(r.files.map((f) => f.text).join('\n'), full);
  assert.equal(parseSrtStrict(full).length, 2400);
  r.files.forEach((f, i) => assert.equal(parseSrtLenient(f.text).cues[0].n, plan[i].from));
  assert.ok(r.instructions.includes(`الجزء 2 (المقاطع ${plan[1].from}–${plan[1].to})`));
  assert.throws(() => buildExport({ videoId: 'iG9CE55wbtY', track: trackOf(EN), mode: 'normal', split: { size: 500, by: 'words' }, now: NOW }), (e) => e.code === 'MD_INVALID');
  const byCount = buildExport({ videoId: 'iG9CE55wbtY', track: trackOf(EN), mode: 'normal', split: { size: 500 }, now: NOW });
  assert.deepEqual(byCount.fingerprint.parts, planParts(2400, 500), 'التقسيم القديم باقٍ افتراضيًا');
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
  assert.equal(r.instructions, patchInstructions({ videoId: 'iG9CE55wbtY', title: 'Do schools kill creativity?', source: 'en', target: 'ar' }));
  const glossary = [{ source: 'creativity', target: 'الإبداع', note: null }];
  const withGlossary = buildPatchPackage({ videoId: 'iG9CE55wbtY', title: 'Do schools kill creativity?', fingerprint, englishTracks: [track], numbers: [201, 57, 58], glossary });
  assert.equal(withGlossary.instructions, patchInstructions({ videoId: 'iG9CE55wbtY', title: 'Do schools kill creativity?', glossary, source: 'en', target: 'ar' }));
  assert.ok(withGlossary.instructions.includes('- creativity = الإبداع'));
  assert.equal(withGlossary.file.text, r.file.text, 'القاموس في التعليمات وحدها لا في الملف');
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

  // وضع طويل بخيارات غير الافتراضية: الاشتقاق بالافتراضية لا يعيده، لكن حدوده كلها بدايات مقاطع محفوظة فيُعاد تجميع الكلمات
  // بحدود البصمة (ن-٢)، ويُقبل لأنه يعيد بصمة النص نفسها: النص المثبت هو نص ذلك التنزيل.
  const custom = convertTrack({ body: asr.body, trackKind: 'asr', durationMs: asr.fixture.durationMs, mode: 'long', longOptions: { maxDurationMs: 6000 } });
  const fpCustom = buildExport({ videoId: 'Y9rkKtK1b44', track: trackOf(custom.cues, 'asr'), mode: 'long', now: NOW }).fingerprint;
  const regrouped = buildPatchPackage({ videoId: 'Y9rkKtK1b44', fingerprint: fpCustom, englishTracks: [stored], numbers: [1, 500] });
  assert.equal(regrouped.ok, true, regrouped.code);
  assert.deepEqual(parseSrtLenient(regrouped.file.text).cues.map((c) => [c.startMs, c.endMs, c.text]), [1, 500].map((n) => [custom.cues[n - 1].startMs, custom.cues[n - 1].endMs, custom.cues[n - 1].text]));
  // ولا يُقبل تجميع لا يعيد بصمة النص: بصمة بأزمنتها وبنص غير نصها.
  assert.deepEqual(buildPatchPackage({ videoId: 'Y9rkKtK1b44', fingerprint: { ...fpCustom, textHash: 'fnv1a64:0123456789abcdef' }, englishTracks: [stored], numbers: [1] }), { ok: false, code: 'EX_PATCH_SOURCE_MISMATCH' });
  // ولا مسار يدوي: إعادة التجميع للتلقائي وحده.
  assert.deepEqual(buildPatchPackage({ videoId: 'Y9rkKtK1b44', fingerprint: { ...fpCustom, trackKey: 'en|manual' }, englishTracks: [{ ...stored, key: 'en|manual', kind: 'manual' }], numbers: [1] }), { ok: false, code: 'EX_PATCH_SOURCE_MISMATCH' });
  // بصمة نص لا تطابق (المسار المحفوظ أُعيد التقاطه بنص مختلف): رفض.
  const tampered = { ...stored, cues: stored.cues.map((c, i) => (i === 3 ? { ...c, text: `${c.text} x` } : c)) };
  assert.deepEqual(buildPatchPackage({ videoId: 'Y9rkKtK1b44', fingerprint, englishTracks: [tampered], numbers: [1] }), { ok: false, code: 'EX_PATCH_SOURCE_MISMATCH' });
});

test('ن-٢: بصمة 2.2.0 التلقائية والمسار المحفوظ بتحويل اليوم (ع-٣): يُعاد تجميع كلماته بحدود البصمة بنص 2.2.0، وإلا رفض', () => {
  const asr = realTrack('asr');
  const stored = { ...trackOf(asr.cues, 'asr'), capturedAt: NOW, source: 'capture' };
  for (const mode of ['normal', 'long']) {
    // محوّل ما قبل ع-٣ نفسه: بلا حد الأسطر (المجمّدان before-e03 ناتجه؛ test/e2e/static/arabic-fixtures.test.js).
    const old = convertTrack({ body: asr.body, trackKind: 'asr', durationMs: asr.fixture.durationMs, mode, asrOptions: { maxLines: Infinity } }).cues;
    const fp = buildExport({ videoId: 'Y9rkKtK1b44', track: trackOf(old, 'asr'), mode, now: NOW }).fingerprint;
    assert.notEqual(fp.count, mode === 'long' ? 735 : 1066, 'تجميع غير تجميع اليوم');
    const all = Array.from({ length: fp.count }, (_, i) => i + 1);
    const pkg = buildPatchPackage({ videoId: 'Y9rkKtK1b44', fingerprint: fp, englishTracks: [stored], numbers: all });
    assert.equal(pkg.ok, true, `${mode}: ${pkg.code}`);
    assert.deepEqual(parseSrtLenient(pkg.file.text).cues.map((c) => [c.n, c.startMs, c.endMs, c.text]), old.map((c, i) => [i + 1, c.startMs, c.endMs, c.text]), `${mode}: الملف كله بنص 2.2.0`);
  }
  // نص يوتيوب تغيّر بين التنزيلين (كلمة في المسار المحفوظ): لا يعيد بصمة النص، فرفض.
  const old = convertTrack({ body: asr.body, trackKind: 'asr', durationMs: asr.fixture.durationMs, asrOptions: { maxLines: Infinity } }).cues;
  const fp = buildExport({ videoId: 'Y9rkKtK1b44', track: trackOf(old, 'asr'), mode: 'normal', now: NOW }).fingerprint;
  const changed = { ...stored, cues: stored.cues.map((c, i) => (i === 700 ? { ...c, text: c.text.replace(/\S+/u, 'changed') } : c)) };
  assert.deepEqual(buildPatchPackage({ videoId: 'Y9rkKtK1b44', fingerprint: fp, englishTracks: [changed], numbers: [1] }), { ok: false, code: 'EX_PATCH_SOURCE_MISMATCH' });
  // ونص لا يفصل كلماته بالمسافات لا يُعاد تجميعه.
  const cjk = { ...stored, cues: stored.cues.map((c, i) => (i === 0 ? { ...c, text: `${c.text} 日本` } : c)) };
  assert.deepEqual(buildPatchPackage({ videoId: 'Y9rkKtK1b44', fingerprint: fp, englishTracks: [cjk], numbers: [1] }), { ok: false, code: 'EX_PATCH_SOURCE_MISMATCH' });
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
