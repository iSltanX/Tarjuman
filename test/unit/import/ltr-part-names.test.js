// تحقق 2.3.0 (ص-١٨، بقرار سلطان): اسم الجزء ومعرّف الفيديو داخل رسائل الاستيراد العربية معزولان LTR (LRI…PDI)، كلٌّ وحده. كانت
// أربعة مواضع بلا عزل: «‹الجزء›: …» أول ملاحظة الجزء وخطئه في الرفع متعدد الأجزاء (readImport وreadPatch)، وأسماء الأجزاء في ملاحظة
// الدمج (IM_NOTE_MERGED)، واسما الجزأين في التداخل والفجوة والرقم الشاذ (IM_PARTS_*)، والمعرّف في «اسم الملف يدل على فيديو آخر»
// (IM_PATCH_NAME_OTHER_VIDEO). واسم ترجمان أوله المعرّف، وقد يبدأ بشرطة تنتقل إلى آخره بين «» أو القوسين.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messageFor } from '../../../src/core/errors/index.js';
import { readImport, readPatch } from '../../../src/core/import/index.js';
import { formatSrtTime } from '../../../src/core/srt/time.js';
import { englishTrack, fingerprint } from '../../helpers/fixtures.js';
import { baseFingerprint, fileOf, readSrtFixture } from '../../fixtures/srt/index.js';
import { arabicTwin, longTrack } from '../../fixtures/v2/index.js';

const LRI = String.fromCodePoint(0x2066);
const FSI = String.fromCodePoint(0x2068);
const PDI = String.fromCodePoint(0x2069);
const iso = (s) => `${LRI}${s}${PDI}`;
const SPAN = new RegExp(`[${LRI}${FSI}][^${LRI}${FSI}${PDI}]*${PDI}`, 'g');
/** أسماء أجزاء بنمط ترجمان: أولها شرطة، وطويلة تنكسر سطورها. */
const P1 = '-KA3zmDkEUQs.ar.from-en.manual.normal.part01of02.srt';
const P2 = '-KA3zmDkEUQs.ar.from-en.manual.normal.part02of02.srt';

/** كل قيمة معزولة وحدها في عزل كامل، ولا شيء منها خارجه، ولا عزل مفتوح بلا خاتمته. */
function isolatedAlone(text, values) {
  const outside = text.replace(SPAN, '');
  assert.equal(/[⁦-⁩]/.test(outside), false, `عزل بلا خاتمته: ${text}`);
  const spans = text.match(SPAN) ?? [];
  for (const v of values) {
    assert.ok(spans.some((s) => s.slice(1, -1) === v), `«${v}» ليس معزولًا وحده: ${text}`);
    assert.equal(outside.includes(v), false, `«${v}» خارج العزل: ${text}`);
  }
}

test('IM_PARTS_*: اسما الجزأين في التداخل والرقم الشاذ والفجوة معزولان كلٌّ وحده، والأرقام خارج العزل', () => {
  isolatedAlone(messageFor('IM_PARTS_OVERLAP', { a: P1, b: P2, from: 1, to: 4 }), [P1, P2]);
  isolatedAlone(messageFor('IM_PARTS_STRAY_NUMBER', { a: P1, list: '2500', b: P2 }), [P1, P2]);
  const gap = messageFor('IM_PARTS_GAP', { a: P1, b: P2, from: 5, to: 6 });
  isolatedAlone(gap, [P1, P2]);
  assert.equal(gap, `بين «${iso(P1)}» و«${iso(P2)}» فجوة في الترقيم (5–6). قد يكون جزء ناقصًا.`);
});

test('IM_PATCH_NAME_OTHER_VIDEO: المعرّف معزول بين القوسين (شرطة أوله لا تنتقل إلى آخره)', () => {
  const text = messageFor('IM_PATCH_NAME_OTHER_VIDEO', { videoId: '-KA3zmDkEUQ' });
  assert.equal(text, `اسم الملف يدل على فيديو آخر (${iso('-KA3zmDkEUQ')})، لكن أرقامه وأزمنته تطابق هذا الفيديو.`);
});

test('readImport بأجزاء: «‹الجزء›: …» في الملاحظة والخطأ، وأسماء ملاحظة الدمج كلٌّ وحده، والقص بأسماء كاملة', async () => {
  const fenced = fileOf(`\`\`\`srt\n${readSrtFixture('part1.ar.srt')}\`\`\`\n`, P1);
  const r = await readImport([fenced, fileOf(readSrtFixture('part2.ar.srt'), P2)], { fingerprints: [baseFingerprint()] });
  assert.equal(r.ok, true);
  assert.equal(r.notes[0], `دُمج ملفان بحسب أرقام المقاطع: ${iso(P1)}، ${iso(P2)}.`);
  assert.equal(r.notes[1], `«${iso(P1)}»: ${messageFor('IM_NOTE_FENCE')}`);
  for (const n of r.notes) isolatedAlone(n, []);

  const e = await readImport([fileOf(readSrtFixture('part1.ar.srt'), P1), fileOf(readSrtFixture('corrupt-time.ar.srt'), P2)]);
  assert.equal(e.ok, false);
  assert.equal(e.error.message, `«${iso(P2)}»: ${messageFor('IM_BAD_TIME', { line: 14 })}`);

  // عشرة أجزاء بأسماء طويلة: الأسماء الظاهرة كاملة كلٌّ في عزله، ثم «…»، ولا عزل مفتوح (كان القص عند المحرف 299 يشطر الاسم).
  const cue = (n) => `${n}\n${formatSrtTime(n * 1000)} --> ${formatSrtTime(n * 1000 + 500)}\nنص ${n}\n`;
  const names = Array.from({ length: 10 }, (_, i) => `-KA3zmDkEUQs.ar.from-en.manual.normal.with-a-long-tail.part${String(i + 1).padStart(2, '0')}of10.srt`);
  const many = await readImport(names.map((name, i) => fileOf(cue(i + 1), name)));
  assert.equal(many.ok, true);
  const merged = many.notes[0];
  const shown = (merged.match(SPAN) ?? []).map((s) => s.slice(1, -1));
  assert.ok(shown.length >= 1 && shown.length < names.length, `${shown.length} اسمًا ظاهرًا`);
  assert.deepEqual(shown, names.slice(0, shown.length), 'الأسماء كاملة بترتيب الأرقام');
  assert.ok(merged.endsWith('….'), merged.slice(-20));
  isolatedAlone(merged, shown);
  const list = merged.slice(merged.indexOf(': ') + 2, -1);
  assert.ok(list.length <= 300, `${list.length}`);
});

test('readPatch بأجزاء: «‹الجزء›: …» في ملاحظة الجزء وخطئه معزول، وتحذير الفيديو الآخر بمعرّف معزول', async () => {
  const EN = longTrack(40);
  const FP = fingerprint({ videoId: 'iG9CE55wbtY', track: englishTrack({ cues: EN }) });
  const AR = arabicTwin(EN);
  const srt = (ns) => ns.map((n) => `${n}\n${formatSrtTime(EN[n - 1].startMs)} --> ${formatSrtTime(EN[n - 1].endMs)}\nمستكمل ${n}\n`).join('\n');
  const current = AR.filter((c) => ![3, 30].includes(c.n));
  const other = '-KA3zmDkEUQ.ar.part1of2.srt';
  const r = await readPatch([fileOf(`\`\`\`srt\n${srt([3])}\`\`\`\n`, other), fileOf(srt([30]), 'iG9CE55wbtY.ar.part2of2.srt')], { fingerprint: FP, cues: current });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.equal(r.plan.notes[0], `«${iso(other)}»: ${messageFor('IM_NOTE_FENCE')}`);
  const warn = r.plan.warnings.find((w) => w.code === 'IM_PATCH_NAME_OTHER_VIDEO');
  assert.deepEqual(warn.params, { videoId: '-KA3zmDkEUQ' }, 'المعامل خام: العزل في القالب العربي');
  isolatedAlone(messageFor(warn.code, warn.params), ['-KA3zmDkEUQ']);

  const bad = await readPatch([fileOf(srt([3]), 'iG9CE55wbtY.ar.part1of2.srt'), fileOf(readSrtFixture('corrupt-time.ar.srt'), P2)], { fingerprint: FP, cues: current });
  assert.equal(bad.ok, false);
  assert.ok(bad.error.message.startsWith(`«${iso(P2)}»: `), bad.error.message);
});
