// تدقيق 7a66f91، المرحلة C5: ملف التصحيح. U40 (إيقاف مبكر: لا تُقرأ الملفات كلها قبل إثبات بطلانها)، وU96 (إعادة الترقيم بعد
// إدراج يكسر تسلسل ترجمة متسلسلة، فلا يتكرر رقم ولا تبقى شارة «الترقيم يختلف»). فشلت على الشيفرة السابقة للسبب المقصود، إلا الحارس.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compare } from '../../../src/core/compare/index.js';
import { applyPatch, readPatch } from '../../../src/core/import/index.js';
import { createEditSession } from '../../../src/core/edit/index.js';
import { formatSrtTime } from '../../../src/core/srt/time.js';
import { englishTrack, fingerprint } from '../../helpers/fixtures.js';
import { deepFreeze, fileOf } from '../../fixtures/srt/index.js';
import { arabicTwin, dropAt, longTrack, renumber } from '../../fixtures/v2/index.js';

const VIDEO = 'iG9CE55wbtY';
const EN = longTrack(400);
const FP = deepFreeze(fingerprint({ videoId: VIDEO, track: englishTrack({ cues: EN }) }));
const AR = arabicTwin(EN);
const srtOf = (cues) => cues.map((c) => `${c.n}\n${formatSrtTime(c.startMs)} --> ${formatSrtTime(c.endMs)}\n${c.text}\n`).join('\n');
const patchFor = (numbers) => numbers.map((n) => ({ n, startMs: EN[n - 1].startMs, endMs: EN[n - 1].endMs, text: `مستكمل ${n}` }));

/** ملفات تعدّ قراءاتها. */
function counted(texts) {
  const reads = { n: 0 };
  const files = texts.map((t, i) => {
    const f = fileOf(t, `p${i}.srt`);
    return { name: f.name, size: f.size, arrayBuffer: () => { reads.n++; return f.arrayBuffer(); } };
  });
  return { files, reads };
}

test('U40: خمسون ملفًا مكررًا: يتوقف عند أول تكرار (قراءتان) لا بعد قراءة الخمسين', async () => {
  const { files, reads } = counted(Array.from({ length: 50 }, () => srtOf(patchFor([7]))));
  const r = await readPatch(files, { fingerprint: FP, cues: AR });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'IM_PATCH_DUPLICATE');
  assert.equal(reads.n, 2);
});

test('U40: عشرون ملفًا بأرقام تتجاوز المرجع: يتوقف عند أولها، وزمن لا يطابق كذلك', async () => {
  const fp2 = deepFreeze(fingerprint({ videoId: VIDEO, track: englishTrack({ cues: EN.slice(0, 2) }) }));
  const beyond = { n: 5, startMs: EN[4].startMs, endMs: EN[4].endMs, text: 'خارج المرجع' };
  const many = counted(Array.from({ length: 20 }, () => srtOf([beyond])));
  const r = await readPatch(many.files, { fingerprint: fp2, cues: AR.slice(0, 2) });
  assert.deepEqual([r.ok, r.error.code, many.reads.n], [false, 'IM_PATCH_OUT_OF_RANGE', 1]);
  const wrong = counted(Array.from({ length: 20 }, () => srtOf([{ ...patchFor([3])[0], startMs: EN[2].startMs + 7 }])));
  const w = await readPatch(wrong.files, { fingerprint: FP, cues: AR });
  assert.deepEqual([w.ok, w.error.code, wrong.reads.n], [false, 'IM_PATCH_TIME_MISMATCH', 1]);
});

test('U40 حارس: أجزاء سليمة متعددة تُقرأ كلها وتُجمع بالأرقام', async () => {
  const { files, reads } = counted([srtOf(patchFor([10, 11])), srtOf(patchFor([3])), srtOf(patchFor([200]))]);
  const r = await readPatch(files, { fingerprint: FP, cues: dropAt(AR, [2, 9, 10, 199]) });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.equal(reads.n, 3);
  assert.deepEqual(r.plan.items.map((x) => x.n), [3, 10, 11, 200]);
});

test('U96: الاستكمال في ترجمة أُعيد ترقيمها بعد نقص: لا رقم مكرر، والترقيم متسلسل ويطابق الأصل', async () => {
  const renumbered = renumber(dropAt(AR, [3, 120]));
  const r = await readPatch(fileOf(srtOf(patchFor([4, 121])), `${VIDEO}.ar.manual.normal.patch.srt`), { fingerprint: FP, cues: renumbered });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  const out = applyPatch(renumbered, r.plan);
  assert.equal(out.length, 400);
  assert.deepEqual(out.map((c) => c.n), Array.from({ length: 400 }, (_, i) => i + 1));
  assert.equal(out[3].text, 'مستكمل 4');
  assert.equal(compare(out, FP).numbering, 'same');
  assert.deepEqual(out.map((c) => [c.startMs, c.endMs]), AR.map((c) => [c.startMs, c.endMs]), 'الأزمنة والترتيب كما هي');
});

test('U96: جلسة المحرّر تطبّقه خطوةً واحدة وتقول إن الترقيم أُعيد', async () => {
  const renumbered = renumber(dropAt(AR, [3]));
  const r = await readPatch(fileOf(srtOf(patchFor([4])), 'x.srt'), { fingerprint: FP, cues: renumbered });
  const session = createEditSession({ cues: renumbered, offsetMs: 0 });
  const applied = session.applyPatchPlan(r.plan);
  assert.deepEqual([applied.ok, applied.inserted, applied.renumbered], [true, 1, true]);
  assert.equal(session.cueAt(4).n, 5);
  session.undo();
  assert.equal(session.count, 399);
});

test('U96 حارس: ترجمة بأرقام الأصل وفيها فجوة تُملأ بأرقامها بلا إعادة ترقيم، وغير المتسلسلة أصلًا تبقى أرقامها', async () => {
  const gapped = dropAt(AR, [3]);
  const r = await readPatch(fileOf(srtOf(patchFor([4])), 'x.srt'), { fingerprint: FP, cues: gapped });
  const out = applyPatch(gapped, r.plan);
  assert.deepEqual(out.map((c) => c.n), Array.from({ length: 400 }, (_, i) => i + 1));
  const irregular = AR.map((c, i) => (i === 50 ? { ...c, n: 50 } : c)).filter((_, i) => i !== 3);
  const ir = await readPatch(fileOf(srtOf(patchFor([4])), 'x.srt'), { fingerprint: FP, cues: irregular });
  const kept = applyPatch(irregular, ir.plan);
  assert.equal(kept[50].n, 50, 'الترقيم الشاذ في الأصل لا يُمس');
});
