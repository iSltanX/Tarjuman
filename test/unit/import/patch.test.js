// ملف التصحيح والأجزاء المستلمة تباعًا (P11-AC4، R52): يُتحقق أنه لهذا الفيديو وهذا المرجع بالأرقام والأزمنة، وخطته تضع كل
// مقطع في موضعه ولا تمس غيره، ومنه الأجزاء تباعًا بحالة استلام مشتقة لكل جزء.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compare } from '../../../src/core/compare/index.js';
import { TjError, messageFor } from '../../../src/core/errors/index.js';
import { applyPatch, partsStatus, planPatchCues, readPatch } from '../../../src/core/import/index.js';
import { formatSrtTime } from '../../../src/core/srt/time.js';
import { englishTrack, fingerprint } from '../../helpers/fixtures.js';
import { deepFreeze, fileOf } from '../../fixtures/srt/index.js';
import { arabicTwin, dropAt, longTrack, mergeAt, renumber, shiftAll } from '../../fixtures/v2/index.js';

const VIDEO = 'iG9CE55wbtY';
const EN = longTrack(2400);
const FP = deepFreeze(fingerprint({ videoId: VIDEO, track: englishTrack({ cues: EN }) }));
const AR = arabicTwin(EN);
const ZWSP = String.fromCodePoint(0x200b);
const srtOf = (cues) => cues.map((c) => `${c.n}\n${formatSrtTime(c.startMs)} --> ${formatSrtTime(c.endMs)}\n${c.text}\n`).join('\n');
const patchFor = (numbers, text = (n) => `مستكمل ${n}`) => numbers.map((n) => ({ n, startMs: EN[n - 1].startMs, endMs: EN[n - 1].endMs, text: text(n) }));
const read = (cues, current, name = `${VIDEO}.ar.manual.normal.patch.srt`) => readPatch(fileOf(srtOf(cues), name), { fingerprint: FP, cues: current });

test('ناقص وفارغ: الخطة تدرج الناقص بزمن البصمة بين جاريه وتستبدل نص الفارغ، ولا تمس غيرهما', async () => {
  const current = deepFreeze(dropAt(AR.map((c, i) => (i === 200 ? { ...c, text: '' } : c)), [56, 57]));
  const r = await read(patchFor([57, 58, 201]), current);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.deepEqual(r.plan.items.map((x) => [x.n, x.action, x.index]), [[57, 'insert', 56], [58, 'insert', 56], [201, 'replace', 198]]);
  assert.deepEqual(r.plan.items[2].before, current[198]);
  assert.deepEqual(r.plan.items[2].after, { ...current[198], text: 'مستكمل 201' });
  assert.deepEqual([r.plan.skipped, r.plan.warnings, r.plan.parts], [[], [], null]);

  const out = applyPatch(current, r.plan);
  assert.equal(out.length, 2400);
  const report = compare(out, FP);
  assert.equal(report.matched, true);
  out.forEach((c, i) => {
    if ([56, 57, 200].includes(i)) assert.equal(c.text, `مستكمل ${i + 1}`);
    else assert.deepEqual(c, AR[i], `المقطع ${i + 1} لم يُمس`);
  });
  const only = applyPatch(current, r.plan, { only: [58] });
  assert.equal(only.length, 2399);
  assert.equal(only[56].text, 'مستكمل 58');
  assert.equal(only[199].text, '', 'غير المختار لا يُطبَّق');
});

test('المواضع بالمحاذاة لا بالرقم: ترجمة أُعيد ترقيمها بعد نقص، ومقطع دمجته في ترجمتك لا يُمس', async () => {
  const renumbered = renumber(dropAt(AR, [56]));
  const r = await read(patchFor([57]), renumbered);
  assert.deepEqual(r.plan.items.map((x) => [x.n, x.action, x.index]), [[57, 'insert', 56]]);
  assert.equal(applyPatch(renumbered, r.plan)[56].text, 'مستكمل 57');

  const merged = mergeAt(AR, 300);
  const m = await read(patchFor([301, 900]), merged);
  assert.deepEqual(m.plan.items.map((x) => x.n), [900]);
  assert.deepEqual(m.plan.skipped, [{ n: 301, reason: 'structure' }]);
  assert.deepEqual(m.plan.warnings.map((w) => w.code), ['IM_PATCH_SKIPPED_STRUCTURE']);
});

test('مراجعة: مقطع أضافه المستخدم فوق موضع ساقط (تقابل زمني ضعيف) لا يُستبدل، بل يُتخطى بتحذير؛ والإزاحة العامة لا تُسقط الاستبدال', async () => {
  const f = EN[4];
  const note = { n: 5, startMs: f.startMs + 500, endMs: f.startMs + Math.max(600, Math.round((f.endMs - f.startMs) * 0.35)), text: 'ملاحظتي' };
  const current = AR.map((c, i) => (i === 4 ? note : c));
  const r = await read(patchFor([5, 9]), current);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.deepEqual(r.plan.items.map((x) => [x.n, x.action]), [[9, 'replace']]);
  assert.deepEqual(r.plan.skipped, [{ n: 5, reason: 'weak' }]);
  assert.deepEqual(r.plan.warnings.map((w) => w.code), ['IM_PATCH_SKIPPED_WEAK']);
  assert.deepEqual(applyPatch(current, r.plan)[4], note);
  const alone = await read(patchFor([5]), current);
  assert.deepEqual([alone.ok, alone.plan.items, alone.plan.warnings.map((w) => w.code)], [true, [], ['IM_PATCH_SKIPPED_WEAK']], 'خطة بلا بنود يشرحها التحذير');

  const shifted = AR.map((c) => ({ ...c, startMs: c.startMs + 1500, endMs: c.endMs + 1500 }));
  const s = await read(patchFor([9]), shifted);
  assert.deepEqual(s.plan.items.map((x) => [x.n, x.action, x.index]), [[9, 'replace', 8]]);
});

const ordered = (cues) => cues.every((c, i) => i === 0 || c.startMs >= cues[i - 1].startMs);
// أول فجوة واسعة (2.5 ث فأكثر) بعد مقطع: يتسع فيها مقطع زائد لا يقابل شيئًا في البصمة.
const WIDE = EN.findIndex((c, i) => i > 10 && EN[i + 1].startMs - c.endMs >= 2500);

test('تحقق Gemini (ع-٢): ناقص في ترجمة أُزيح توقيتها كله يُدرج بإزاحة جيرانه لا بزمن البصمة وحده، فيبقى الترتيب الزمني', async () => {
  for (const delta of [300, 14000, -700]) {
    const current = deepFreeze(dropAt(shiftAll(AR, delta), [6]));
    const r = await read(patchFor([7]), current);
    assert.equal(r.ok, true, JSON.stringify(r.error));
    assert.deepEqual(r.plan.items.map((x) => [x.n, x.action, x.index]), [[7, 'insert', 6]], `الإزاحة ${delta}`);
    assert.deepEqual(r.plan.items[0].after, { n: 7, startMs: EN[6].startMs + delta, endMs: EN[6].endMs + delta, text: 'مستكمل 7' }, `الإزاحة ${delta}`);
    assert.deepEqual([r.plan.skipped, r.plan.warnings], [[], []]);
    const out = applyPatch(current, r.plan);
    assert.ok(ordered(out), `الترتيب الزمني بعد الإدراج، الإزاحة ${delta}`);
    assert.deepEqual(out, shiftAll(AR, delta).map((c, i) => (i === 6 ? { ...c, text: 'مستكمل 7' } : c)), `الإزاحة ${delta}`);
    // المسار نفسه في «إكمال الترجمة» عند الرفع (planPatchCues).
    const mem = planPatchCues(patchFor([7]), { fingerprint: FP, cues: current });
    assert.deepEqual(mem.plan.items, r.plan.items, `planPatchCues، الإزاحة ${delta}`);
  }
});

test('تحقق Gemini (ع-١٢ ج): ناقص بجوار مقطع زائد في الفجوة نفسها يُدرج قبله أو بعده بمقارنة الزمن لا بترتيب المحاذاة', async () => {
  const k = WIDE;
  const extra = { n: 9999, startMs: EN[k].endMs + 300, endMs: EN[k].endMs + 1300, text: 'زائد' };
  // الزائد بعد موضع الناقص: يُدرج الناقص قبله.
  const lostBefore = dropAt(AR, [k]);
  const a = deepFreeze([...lostBefore.slice(0, k), extra, ...lostBefore.slice(k)]);
  const ra = await read(patchFor([k + 1]), a);
  assert.equal(ra.ok, true, JSON.stringify(ra.error));
  assert.deepEqual(ra.plan.items.map((x) => [x.n, x.action, x.index]), [[k + 1, 'insert', k]]);
  const outA = applyPatch(a, ra.plan);
  assert.ok(ordered(outA), 'الترتيب الزمني والزائد بعد موضع الناقص');
  assert.deepEqual(outA.slice(k, k + 2).map((c) => c.text), [`مستكمل ${k + 1}`, 'زائد']);
  // الزائد قبل موضع الناقص: يُدرج الناقص بعده.
  const lostAfter = dropAt(AR, [k + 1]);
  const b = deepFreeze([...lostAfter.slice(0, k + 1), extra, ...lostAfter.slice(k + 1)]);
  const rb = await read(patchFor([k + 2]), b);
  assert.deepEqual(rb.plan.items.map((x) => [x.n, x.action, x.index]), [[k + 2, 'insert', k + 2]]);
  const outB = applyPatch(b, rb.plan);
  assert.ok(ordered(outB), 'الترتيب الزمني والزائد قبل موضع الناقص');
  assert.deepEqual(outB.slice(k + 1, k + 3).map((c) => c.text), ['زائد', `مستكمل ${k + 2}`]);
});

test('تحقق Gemini (ع-٢): إدراج يكسر الترتيب الزمني مع جاره أو يقع قبل الصفر لا يُطبَّق، بل يُتخطى بتحذير «لا يطابق موضعه»', async () => {
  const k = WIDE;
  // جار نقله المستخدم إلى ما بعد موضع الناقص: لا موضع للناقص بين جاريه بالزمن.
  const moved = deepFreeze(dropAt(AR, [k]).map((c, i) => (i === k - 1 ? { ...c, startMs: EN[k].endMs + 300, endMs: EN[k].endMs + 1300 } : c)));
  const r = await read(patchFor([k + 1]), moved);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.deepEqual([r.plan.items, r.plan.skipped], [[], [{ n: k + 1, reason: 'weak' }]]);
  assert.deepEqual(r.plan.warnings.map((w) => w.code), ['IM_PATCH_SKIPPED_WEAK']);
  // ترجمة أُزيحت 1.5 ث إلى الوراء ينقصها الأول: زمنه المزاح سالب، ولا قصّ صامت.
  const early = deepFreeze(dropAt(shiftAll(AR, -1500), [0]));
  const e = await read(patchFor([1, 7]), early);
  assert.deepEqual(e.plan.items.map((x) => [x.n, x.action]), [[7, 'replace']]);
  assert.deepEqual(e.plan.skipped, [{ n: 1, reason: 'weak' }]);
});

test('ليس لهذا المرجع: زمن لا يطابق، وترقيم أُعيد من 1، ورقم خارج الملف، ومكرر، وبلا بصمة', async () => {
  const wrongTime = patchFor([57]).map((c) => ({ ...c, startMs: c.startMs + 40 }));
  assert.equal((await read(wrongTime, AR)).error.code, 'IM_PATCH_TIME_MISMATCH');
  const restarted = patchFor([57, 58]).map((c, i) => ({ ...c, n: i + 1 }));
  const re = await read(restarted, AR);
  assert.deepEqual(re.error, { code: 'IM_PATCH_RENUMBERED', message: messageFor('IM_PATCH_RENUMBERED', { n: 1, expected: 57 }) });
  assert.equal((await read([{ n: 2401, startMs: 1, endMs: 2, text: 'س' }], AR)).error.code, 'IM_PATCH_OUT_OF_RANGE');
  assert.equal((await read([...patchFor([57]), ...patchFor([57])], AR)).error.code, 'IM_PATCH_DUPLICATE');
  const none = await readPatch(fileOf(srtOf(patchFor([57]))), { fingerprint: null, cues: AR });
  assert.equal(none.error.code, 'IM_PATCH_NO_REFERENCE');
});

test('ترجمة لا تُحاذى بالبصمة بثقة (فيديو آخر) ترفض بسبب مكتوب؛ وملف كل مقاطعه فارغة لا يُدمج', async () => {
  const other = arabicTwin(longTrack(2400, { seed: 4040 }));
  const r = await read(patchFor([57]), other);
  assert.equal(r.error.code, 'IM_PATCH_UNALIGNED');
  assert.match(r.error.message, /تعذّر تحديد مواضع المقاطع/);
  assert.equal((await read(patchFor([57], () => ' '), AR)).error.code, 'IM_PATCH_NOTHING');
  const empties = `57\n${formatSrtTime(EN[56].startMs)} --> ${formatSrtTime(EN[56].endMs)}\n${ZWSP}\n`;
  assert.equal((await readPatch(fileOf(empties), { fingerprint: FP, cues: AR })).error.code, 'IM_PATCH_NOTHING');
});

test('تحذيرات لا توقف: مقطع فارغ يُتخطى، ونص بلا حرف عربي، واسم ملف يدل على فيديو آخر', async () => {
  const cues = [...patchFor([57]), { n: 58, startMs: EN[57].startMs, endMs: EN[57].endMs, text: 'still english' }];
  const empty = `${srtOf(cues)}\n59\n${formatSrtTime(EN[58].startMs)} --> ${formatSrtTime(EN[58].endMs)}\n${ZWSP}\n`;
  const r = await readPatch(fileOf(empty, 'Y9rkKtK1b44.ar.srt'), { fingerprint: FP, cues: dropAt(AR, [56, 57, 58]) });
  assert.equal(r.ok, true);
  assert.deepEqual(r.plan.warnings.map((w) => w.code), ['IM_PATCH_NAME_OTHER_VIDEO', 'IM_PATCH_SKIPPED_EMPTY', 'IM_PATCH_NO_ARABIC']);
  assert.deepEqual(r.plan.skipped, [{ n: 59, reason: 'empty' }]);
});

test('تغيّر الترجمة بعد القراءة يمنع التطبيق برمز واضح', async () => {
  const r = await read(patchFor([57]), dropAt(AR, [56]));
  const changed = dropAt(AR, [56]).map((c, i) => (i === 10 ? { ...c, text: 'عُدّل' } : c));
  assert.throws(() => applyPatch(changed, r.plan), (e) => e instanceof TjError && e.code === 'IM_PATCH_STALE');
});

test('الأجزاء المستلمة تباعًا: الجزء الثاني يُدرج بعد الأول، وحالة الاستلام مشتقة لكل جزء', async () => {
  const fp = deepFreeze({ ...FP, parts: [{ index: 1, from: 1, to: 800 }, { index: 2, from: 801, to: 1600 }, { index: 3, from: 1601, to: 2400 }] });
  const first = AR.slice(0, 800);
  assert.deepEqual(partsStatus(fp, first).map((p) => [p.received, p.complete]), [[800, true], [0, false], [0, false]]);
  const part2 = AR.slice(800, 1600);
  const r = await readPatch(fileOf(srtOf(part2), `${VIDEO}.en.manual.normal.part2of3.ar.srt`), { fingerprint: fp, cues: first });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.ok(r.plan.items.every((x) => x.action === 'insert' && x.index === 800));
  assert.deepEqual(r.plan.parts.map((p) => [p.index, p.received, p.total, p.complete]), [[1, 800, 800, true], [2, 800, 800, true], [3, 0, 800, false]]);
  const out = applyPatch(first, r.plan);
  assert.deepEqual(out, AR.slice(0, 1600));
  assert.deepEqual(partsStatus(fp, out).map((p) => p.complete), [true, true, false]);
  assert.equal(partsStatus(FP, out), null, 'بلا أجزاء');
  // جزءان معًا بملفين.
  const both = await readPatch([fileOf(srtOf(AR.slice(1600, 2000)), 'p3a.srt'), fileOf(srtOf(AR.slice(2000)), 'p3b.srt')], { fingerprint: fp, cues: out });
  assert.equal(applyPatch(out, both.plan).length, 2400);
});
