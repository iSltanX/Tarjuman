// تدفق الاستيراد readImport (عقد interfaces §٦): قراءة آمنة، وتحليل متسامح بملاحظات، ودمج الأجزاء، واختيار البصمة،
// ومقارنة تُرفق بالنتيجة، دون كتابة في التخزين ودون أي تعديل للتوقيت أو النص خارج ما يُذكر في notes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readImport } from '../../../src/core/import/index.js';
import { previewRestoreTiming } from '../../../src/core/compare/index.js';
import { messageFor } from '../../../src/core/errors/index.js';
import { DEFAULT_SETTINGS } from '../../../src/core/model/settings.js';
import { withArabicImport } from '../../../src/core/model/transitions.js';
import { validateComparisonReport } from '../../../src/core/model/tracks.js';
import { validateVideoRecord } from '../../../src/core/model/video.js';
import { baseCues, baseFingerprint, deepFreeze, fileOf, readSrtFixture } from '../../fixtures/srt/index.js';
import { NOW, VIDEO_ID, englishTrack, fingerprint, makeCues, videoRecord } from '../../helpers/fixtures.js';

const ARABIC = /[؀-ۿ]/;
const fp = baseFingerprint();
const fixture = (name, fileName = name) => fileOf(readSrtFixture(name), fileName);
const run = (input, opts = { fingerprints: [fp], settings: DEFAULT_SETTINGS }) => readImport(input, opts);
const failed = async (input, opts) => {
  const r = await run(input, opts);
  assert.equal(r.ok, false, JSON.stringify(r).slice(0, 300));
  assert.deepEqual(Object.keys(r), ['ok', 'error']);
  assert.ok(ARABIC.test(r.error.message), r.error.message);
  return r.error;
};

test('ملف نظيف مع بصمته: مطابقة تامة، وكل حقول النتيجة بصيغة العقد', async () => {
  const r = await run(fixture('clean.ar.srt', 'iG9CE55wbtY.ar.srt'));
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r).sort(), ['ambiguous', 'comparison', 'cues', 'fileName', 'fingerprintId', 'lang', 'notes', 'ok', 'warnings']);
  assert.equal(r.ambiguous, null, 'بلا سطر مواضع غامضة (ف6)');
  assert.equal(r.fileName, 'iG9CE55wbtY.ar.srt');
  assert.equal(r.lang, 'ar', 'لغة الملف من رمز صريح في اسمه (AA1)');
  assert.equal(r.cues.length, 8);
  assert.equal(r.fingerprintId, fp.id);
  assert.equal(r.comparison.fingerprintId, fp.id);
  assert.deepEqual([r.comparison.matched, r.comparison.countSource, r.comparison.countTarget], [true, 8, 8]);
  assert.deepEqual([r.notes, r.warnings], [[], []]);
});

test('المدخل: File واحد، أو مصفوفة، أو شبه مصفوفة كـFileList', async () => {
  const f = () => fixture('clean.ar.srt');
  const single = await run(f());
  const array = await run([f()]);
  const fileList = await run({ 0: f(), length: 1, item: (i) => [f()][i] });
  assert.deepEqual([array.cues, fileList.cues], [single.cues, single.cues]);
});

test('بلا بصمة (أو بلا خيارات): تقرير بـfingerprintId=null لا مقارنة بالأصل، وما عداه يُبلَّغ', async () => {
  for (const opts of [undefined, {}, { fingerprints: [] }, { fingerprints: null }, { fingerprints: [], settings: undefined }]) {
    const r = await readImport(fixture('untranslated.ar.srt'), opts);
    assert.equal(r.ok, true);
    assert.equal(r.fingerprintId, null);
    assert.deepEqual([r.comparison.fingerprintId, r.comparison.countSource, r.comparison.matched, r.comparison.restoreTimingAvailable], [null, null, false, false]);
    assert.deepEqual([r.comparison.empty, r.comparison.noArabic], [[7], [4]]);
  }
});

test('اختيار البصمة: الأحدث بين المطابقة عددًا، وإلا الأحدث', async () => {
  const at = (id, createdAt, count = 8) => (count === 8
    ? baseFingerprint({ id, createdAt })
    : fingerprint({ id, createdAt, mode: 'long', track: englishTrack({ cues: makeCues(count) }) }));
  const older = at('fp_older00001', '2026-11-01T10:00:00.000Z');
  const newer = at('fp_newer00001', '2026-11-01T11:00:00.000Z');
  const long5 = at('fp_long500001', '2026-11-01T12:00:00.000Z', 5);
  const long3 = at('fp_long300001', '2026-11-01T09:00:00.000Z', 3);

  const pick = async (name, fingerprints) => (await run(fixture(name), { fingerprints, settings: DEFAULT_SETTINGS })).fingerprintId;
  assert.equal(await pick('clean.ar.srt', [older, newer, long5]), newer.id, 'الأحدث بين المطابقة عددًا ولو وُجدت بصمة أحدث بعدد آخر');
  assert.equal(await pick('clean.ar.srt', [newer, older, long5]), newer.id, 'مستقل عن ترتيب القائمة');
  assert.equal(await pick('missing.ar.srt', [older, long3, long5]), long5.id, 'لا مطابقة عددًا (6): الأحدث مطلقًا');
  const sameTime = [baseFingerprint({ id: 'fp_first000001' }), baseFingerprint({ id: 'fp_second00001' })];
  assert.equal(await pick('clean.ar.srt', sameTime), 'fp_second00001', 'تساوي الزمن: الأخيرة في القائمة (أُضيفت لاحقًا)');
  const r = await run(fixture('clean.ar.srt'), { fingerprints: [long5, older], settings: DEFAULT_SETTINGS });
  assert.deepEqual([r.fingerprintId, r.comparison.fingerprintId, r.comparison.countSource], [older.id, older.id, 8], 'يُسجَّل في الموضعين');
});

test('ملاحظات الاستيراد تُذكر في النتيجة وفي تقرير المقارنة، بنسختين مستقلتين', async () => {
  const r = await run(fixture('fenced.ar.srt'));
  assert.equal(r.notes.length, 3);
  assert.deepEqual(r.comparison.notes, r.notes);
  assert.notEqual(r.comparison.notes, r.notes);
  assert.equal(r.comparison.matched, true, 'الأسطر والسياج لا تغيّر المقاطع');
  assert.equal(r.notes[0], messageFor('IM_NOTE_FENCE'));
});

test('الحقن: النص يخرج خامًا، والتحذير يذكر عدد المقاطع ذات الوسوم الحرفية', async () => {
  const r = await run(fixture('injected.ar.srt'));
  assert.equal(r.ok, true);
  assert.equal(r.cues[1].text, '<script>alert(1)</script>أريد اليوم أن أشارككم قصة.');
  assert.deepEqual(r.warnings, [{ code: 'IM_HTML_LITERAL', params: { count: 2 } }]);
  assert.ok(ARABIC.test(messageFor(r.warnings[0].code, r.warnings[0].params)));
});

test('لا تعديل صامت: التوقيت والنص يصلان كما في الملف، والاستعادة معاينة متاحة لا مطبّقة', async () => {
  const drifted = await run(fixture('drifted.ar.srt'));
  assert.deepEqual(drifted.cues[2], { n: 3, startMs: 6300, endMs: 7800, text: 'تبدأ في قرية صغيرة.' });
  assert.deepEqual(drifted.cues[6], { n: 7, startMs: 16000, endMs: 18101, text: 'دعوني أريكم السبب.' });
  assert.equal(drifted.comparison.restoreTimingAvailable, true);
  assert.equal(previewRestoreTiming(drifted.cues, fp).changes.length, 3);
  const un = await run(fixture('untranslated.ar.srt'));
  assert.equal(un.cues[3].text, 'Nobody expected what came next.');
  assert.equal(un.cues[6].text, '');
});

test('عتبة الانحراف من الإعدادات، والمعيب أو الغائب يعود إلى 100', async () => {
  const drift = async (settings) => (await run(fixture('drifted.ar.srt'), { fingerprints: [fp], settings })).comparison;
  assert.deepEqual((await drift({ thresholds: { driftMs: 50, completeness: 0.85 } })).drift.map((d) => d.n), [3, 6, 7]);
  assert.equal((await drift({ thresholds: { driftMs: 50 } })).driftThresholdMs, 50);
  for (const bad of [undefined, {}, { thresholds: null }, { thresholds: { driftMs: 'x' } }, { thresholds: { driftMs: -5 } }, { thresholds: { driftMs: 1.5 } }]) {
    assert.equal((await drift(bad)).driftThresholdMs, 100, JSON.stringify(bad));
  }
});

test('المدخلات لا تُعدَّل (بصمات وإعدادات مجمَّدة)', async () => {
  const r = await run(fixture('clean.ar.srt'), deepFreeze({ fingerprints: [baseFingerprint()], settings: structuredClone(DEFAULT_SETTINGS) }));
  assert.equal(r.ok, true);
});

test('أخطاء الملف الواحد: الشكل { ok:false, error:{ code, message, line? } } برسالة عربية', async () => {
  const bad = await failed(fixture('corrupt-time.ar.srt'));
  assert.deepEqual(bad, { code: 'IM_BAD_TIME', message: messageFor('IM_BAD_TIME', { line: 14 }), line: 14 });

  assert.deepEqual(Object.keys(await failed(fileOf(new Uint8Array([0xe3, 0xd1, 0xcd])))).sort(), ['code', 'message']);
  assert.equal((await failed(fileOf(new Uint8Array([0xe3, 0xd1, 0xcd])))).code, 'IM_NOT_UTF8');
  assert.equal((await failed(fileOf('1\n\u0000\n'))).code, 'IM_NOT_TEXT');
  assert.equal((await failed(fileOf(''))).code, 'IM_EMPTY_FILE');
  assert.equal((await failed(fileOf('   \n\n'))).code, 'IM_EMPTY_FILE');
  assert.equal((await failed(fileOf("Sorry, I can't help with that."))).code, 'IM_NO_CUES');
});

test('أخطاء المدخل: لا ملف، وأكثر من الحد، وحجم فوق الحد، وفشل القراءة، وما ليس ملفًا', async () => {
  for (const none of [undefined, null, [], {}]) assert.equal((await failed(none)).code, 'IM_NO_FILE', JSON.stringify(none));
  const many = Array.from({ length: 51 }, (_, i) => fileOf('x', `p${i}.srt`));
  const e = await failed(many);
  assert.equal(e.code, 'IM_TOO_MANY_FILES');
  assert.match(e.message, /51/);
  assert.equal((await failed({ name: 'h.srt', size: 6 * 1024 * 1024, arrayBuffer: async () => new ArrayBuffer(0) })).code, 'IM_FILE_TOO_LARGE');
  assert.equal((await failed({ name: 'b.srt', size: 1, arrayBuffer: async () => { throw new Error('x'); } })).code, 'IM_READ_FAILED');
  assert.equal((await failed('نص وليس ملفًا')).code, 'IM_READ_FAILED');
  assert.equal((await failed([fixture('clean.ar.srt'), 42])).code, 'IM_READ_FAILED');
});

test('أجزاء احتياطية: تُدمج بالأرقام مهما كان ترتيب الاختيار، باسم موحَّد وملاحظة دمج، ومطابقة تامة', async () => {
  const r = await run([fixture('part2.ar.srt', 'abc.ar.part2.srt'), fixture('part1.ar.srt', 'abc.ar.part1.srt')]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.cues.map((c) => c.n), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(r.fileName, 'abc.ar.srt');
  assert.deepEqual(r.notes, ['دُمج ملفان بحسب أرقام المقاطع: abc.ar.part1.srt، abc.ar.part2.srt.']);
  assert.equal(r.comparison.matched, true);
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.cues, (await run(fixture('clean.ar.srt'))).cues);
});

test('اسم الملف المدمج: يُنزع رقم الجزء إن بقي اسم صالح، وإلا اسم أول جزء بحسب الأرقام', async () => {
  const names = async (a, b) => (await run([fixture('part1.ar.srt', a), fixture('part2.ar.srt', b)])).fileName;
  assert.equal(await names('translation_part1.srt', 'translation_part2.srt'), 'translation.srt');
  assert.equal(await names('x-Part-1.srt', 'x-Part-2.srt'), 'x.srt');
  assert.equal(await names('part1.ar.srt', 'part2.ar.srt'), 'part1.ar.srt');
  assert.equal(await names('الجزء الأول.srt', 'الجزء الثاني.srt'), 'الجزء الأول.srt');
});

test('فجوة بين الأجزاء تحذير لا خطأ، والمقارنة تذكر النقص', async () => {
  const lastTwo = readSrtFixture('clean.ar.srt').split('\n\n').slice(6).join('\n\n');
  const r = await run([fixture('part1.ar.srt', 'a.srt'), fileOf(lastTwo, 'b.srt')]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.cues.map((c) => c.n), [1, 2, 3, 4, 7, 8]);
  assert.deepEqual(r.warnings, [{ code: 'IM_PARTS_GAP', params: { a: 'a.srt', b: 'b.srt', from: 5, to: 6 } }]);
  assert.ok(ARABIC.test(messageFor(r.warnings[0].code, r.warnings[0].params)));
  assert.deepEqual(r.comparison.missing, [5, 6]);
  assert.equal(r.comparison.numbering, 'different');
  assert.equal(r.comparison.matched, false);
});

test('تداخل الأجزاء أو تكرارها خطأ يسمّي الجزأين ونطاق الأرقام', async () => {
  const e = await failed([fixture('part1.ar.srt', 'a.srt'), fixture('clean.ar.srt', 'full.srt')]);
  assert.equal(e.code, 'IM_PARTS_OVERLAP');
  assert.match(e.message, /«a\.srt»/);
  assert.match(e.message, /«full\.srt»/);
  assert.match(e.message, /1–4/);
  const same = await failed([fixture('clean.ar.srt', 'one.srt'), fixture('clean.ar.srt', 'two.srt')]);
  assert.equal(same.code, 'IM_PARTS_OVERLAP');
});

test('خطأ في أحد عدة ملفات يذكر اسم الملف مع السطر', async () => {
  const e = await failed([fixture('part1.ar.srt', 'good.srt'), fixture('corrupt-time.ar.srt', 'broken.srt')]);
  assert.equal(e.code, 'IM_BAD_TIME');
  assert.equal(e.line, 14);
  assert.match(e.message, /«broken\.srt»/);
  assert.doesNotMatch(e.message, /good\.srt/);
  const single = await failed(fixture('corrupt-time.ar.srt', 'broken.srt'));
  assert.doesNotMatch(single.message, /broken/, 'ملف واحد: لا حاجة لاسمه');
});

test('ملاحظات الأجزاء تُنسب إلى ملفاتها، وملاحظة الدمج أولًا', async () => {
  const fenced = fileOf(`\`\`\`srt\n${readSrtFixture('part1.ar.srt')}\`\`\`\n`, 'first.srt');
  const r = await run([fenced, fixture('part2.ar.srt', 'second.srt')]);
  assert.equal(r.notes.length, 2);
  assert.match(r.notes[0], /دُمج ملفان/);
  assert.equal(r.notes[1], `«first.srt»: ${messageFor('IM_NOTE_FENCE')}`);
});

test('كثرة الملاحظات لا تتجاوز حد النموذج (50)، وكل ملاحظة ≤ 500 محرف حتى بأسماء طويلة', async () => {
  const parts = Array.from({ length: 30 }, (_, i) => {
    const n = i + 1;
    const body = `Intro ${n}\n\n\`\`\`\n${n}\n00:00:0${i % 10},000 --> 00:00:0${i % 10},500\nنص ${n}\n\`\`\`\n\nOutro ${n}\n`;
    return fileOf(body, `${'ن'.repeat(200)}${n}.srt`);
  });
  const r = await run(parts);
  assert.equal(r.ok, true);
  assert.equal(r.notes.length, 50);
  assert.equal(r.notes.at(-1), messageFor('IM_NOTE_MORE', { count: 1 + 30 * 3 - 49 }));
  assert.ok(r.notes.every((n) => n.length <= 500), String(Math.max(...r.notes.map((n) => n.length))));
  assert.equal(r.comparison.notes.length, 50);
});

test('اسم الملف: يُقصّ إلى 255، وتُنزع محارف التحكم، ويُستبدل الفارغ باسم افتراضي', async () => {
  assert.equal((await run(fixture('clean.ar.srt', `${'a'.repeat(300)}.srt`))).fileName.length, 255);
  assert.equal((await run(fixture('clean.ar.srt', 'مر\u0007حبا\u0000.srt'))).fileName, 'مرحبا.srt');
  assert.equal((await run(fixture('clean.ar.srt', ''))).fileName, 'translation.ar.srt');
});

test('نتيجة الاستيراد تدخل withArabicImport كما هي وينتج سجل صالح', async () => {
  const r = await run(fixture('drifted.ar.srt', 'AAAAAAAAAAA.ar.srt'));
  const record = videoRecord({ arabic: false, cues: baseCues() });
  assert.equal(record.fingerprints[0].id, r.fingerprintId);
  const { record: next } = withArabicImport(record, { videoId: VIDEO_ID, ...r }, NOW);
  assert.deepEqual(validateVideoRecord(next, { stored: false }), { ok: true });
  assert.equal(next.arabic.lang, 'ar', 'الترجمة بلغتها في الذاكرة، والإسقاط المخزَّن بلاها (AA1)');
  assert.deepEqual(next.arabic.original, r.cues);
  assert.deepEqual(next.arabic.comparison, r.comparison);
  assert.equal(next.view.displayOffsetMs, 0);
});

test('ملف كبير: 20,000 مقطع عبر التدفق كله في أقل من ثلاث ثوانٍ', async () => {
  const cues = makeCues(20000, { startMs: 0, durMs: 100, gapMs: 0, text: (i) => `سطر ${i}` });
  const srt = cues.map((c) => `${c.n}\n00:00:00,000 --> 00:00:00,100\n${c.text}\n`).join('\n');
  const big = { ...baseFingerprint(), count: 20000, cues: cues.map((c) => ({ n: c.n, startMs: 0, endMs: 100 })) };
  const t0 = performance.now();
  const r = await run(fileOf(srt, 'big.srt'), { fingerprints: [big], settings: DEFAULT_SETTINGS });
  assert.equal(r.ok, true);
  assert.equal(r.comparison.matched, true);
  assert.ok(performance.now() - t0 < 3000, `${performance.now() - t0}ms`);
});

test('مجموع مقاطع الأجزاء فوق 50,000 خطأ IM_TOO_MANY_CUES ولو اجتاز كل جزء حده، و50,000 تمامًا مقبول وتقريره صالح', async () => {
  const blk = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => `${a + i}\n00:00:00,000 --> 00:00:01,000\nx\n`).join('\n');
  const e = await failed([fileOf(blk(1, 50000), 'a.srt'), fileOf(blk(50001, 50010), 'b.srt')]);
  assert.equal(e.code, 'IM_TOO_MANY_CUES');
  assert.match(e.message, /50000/);
  assert.doesNotMatch(e.message, /«/, 'خطأ المجموع لا يُنسب إلى ملف واحد');
  const ok = await run([fileOf(blk(1, 25000), 'a.srt'), fileOf(blk(25001, 50000), 'b.srt')], { fingerprints: [], settings: DEFAULT_SETTINGS });
  assert.equal(ok.ok, true);
  assert.equal(ok.cues.length, 50000);
  assert.deepEqual(validateComparisonReport(ok.comparison), { ok: true });
});

test('خطأ غير متوقع: TJ_UNEXPECTED برسالة عربية وتفاصيل منقّاة، ولا استثناء يتسرب', async () => {
  const broken = { id: 'fp_broken00001', count: 8, createdAt: NOW, cues: null };
  const r = await run(fixture('clean.ar.srt'), { fingerprints: [broken], settings: DEFAULT_SETTINGS });
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.error).sort(), ['code', 'detail', 'message']);
  assert.equal(r.error.code, 'TJ_UNEXPECTED');
  assert.ok(ARABIC.test(r.error.message));
  assert.equal(typeof r.error.detail, 'string');
});

test('تحذيرات الأجزاء تُنسب إلى ملفاتها (params.file) كما تُنسب ملاحظاتها', async () => {
  const blocks = readSrtFixture('clean.ar.srt').split('\n\n');
  const gappy = fileOf(`${[0, 1, 3].map((i) => blocks[i]).join('\n\n')}\n`, 'a.srt');
  const r = await run([gappy, fixture('part2.ar.srt', 'b.srt')]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.warnings, [{ code: 'IM_NUMBERING_IRREGULAR', params: { prev: 2, n: 4, file: 'a.srt' } }]);
  assert.deepEqual(r.comparison.missing, [3]);
});

test('اسم الملف: محارف تجاوز الاتجاه تُنزع، والقصّ لا يشطر زوجًا بديلًا', async () => {
  assert.equal((await run(fixture('clean.ar.srt', '\u202Efdp.srt'))).fileName, 'fdp.srt');
  const name = (await run(fixture('clean.ar.srt', `${'a'.repeat(254)}\u{1F600}.srt`))).fileName;
  assert.equal(name, 'a'.repeat(254));
});

test('تدقيق 5fedcb9 (GM-026.2): رقم شاذ واحد في جزء (2500 بدل 15) يُسمّى هو لا تداخل الجزأين كله', async () => {
  const { formatSrtTime } = await import('../../../src/core/srt/time.js');
  const { makeCues } = await import('../../helpers/fixtures.js');
  const all = makeCues(40, { text: (i) => `ترجمة ${i}` });
  // بأرقامها كما هي (writeSrt يرقّم تسلسليًا).
  const srt = (cues) => cues.map((c) => `${c.n}\n${formatSrtTime(c.startMs)} --> ${formatSrtTime(c.endMs)}\n${c.text}\n`).join('\n');
  const first = all.slice(0, 20).map((c) => (c.n === 15 ? { ...c, n: 2500 } : c));
  const second = all.slice(20);
  const e = await failed([new File([srt(first)], 'part1.ar.srt'), new File([srt(second)], 'part2.ar.srt')]);
  assert.equal(e.code, 'IM_PARTS_STRAY_NUMBER');
  assert.match(e.message, /2500/);
  assert.match(e.message, /«part1\.ar\.srt»/);
  // تداخل حقيقي بين جزأين يبقى IM_PARTS_OVERLAP.
  const both = await failed([new File([srt(all.slice(0, 25))], 'a.srt'), new File([srt(all.slice(20))], 'b.srt')]);
  assert.equal(both.code, 'IM_PARTS_OVERLAP');
});
