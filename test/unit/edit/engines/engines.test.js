// محرّكات التحرير النقية (P11-AC6، R51 وR54 وR55): البحث بتطبيع للمطابقة وحدها والاستبدال حرفي لا يمس التوقيت ولا المرجع؛
// والدمج والشطر بسياسة ترقيم تمنع الاستعادة الشاملة؛ وتصحيح الانجراف تحويل خطي بمرساتين يرفض الزمن السالب؛ ومقاييس الكثافة
// بعتبة معايرة على نصوص عربية حقيقية.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canRestore, compare } from '../../../../src/core/compare/index.js';
import { READING_DEFAULTS, densityIssues, readingMetrics } from '../../../../src/core/edit/density.js';
import { driftCorrect } from '../../../../src/core/edit/drift.js';
import { planReplace, searchCues } from '../../../../src/core/edit/search.js';
import { mergeCues, splitCue } from '../../../../src/core/edit/structure.js';
import { TjError, hasCode } from '../../../../src/core/errors/index.js';
import { parseSrtLenient } from '../../../../src/core/srt/lenient.js';
import { englishTrack, fingerprint } from '../../../helpers/fixtures.js';
import { deepFreeze } from '../../../fixtures/srt/index.js';
import { REAL_ARABIC, arabicTwin, longTrack, realArabic } from '../../../fixtures/v2/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const fromCodes = (...codes) => String.fromCodePoint(...codes);
const FATHA = fromCodes(0x064e);
const TATWEEL = fromCodes(0x0640);
const CUES = deepFreeze([
  { n: 1, startMs: 1000, endMs: 3000, text: `ك${FATHA}ت${FATHA}ب${FATHA} الطالب درسه` },
  { n: 2, startMs: 3500, endMs: 5000, text: 'أحمد وإبراهيم\nفي المكتبة' },
  { n: 3, startMs: 5500, endMs: 7000, text: `يكتبون الكت${TATWEEL}ب` },
  { n: 4, startMs: 7500, endMs: 9000, text: 'Deep Learning و deep learning' },
]);
const ENGLISH = ['He wrote his lesson', 'Ahmad and Ibrahim in the library', 'They write books', 'Deep learning'];

test('البحث بالتطبيع للمطابقة وحدها: التشكيل والتطويل والهمزات مع ignoreMarks، والحالة اللاتينية، والسطر مسافة', () => {
  // دون ignoreMarks: «كتب» لا تطابق المشكولة ولا «الكتـب» بالتطويل، وتطابق داخل «المكتبة» و«يكتبون».
  assert.deepEqual(searchCues(CUES, 'كتب').map((m) => m.index), [1, 2]);
  // مع ignoreMarks: المشكولة كاملة بتشكيلها الأخير، و«الكتـب» بالتطويل.
  const marked = searchCues(CUES, 'كتب', { ignoreMarks: true });
  assert.deepEqual(marked.map((m) => [m.index, CUES[m.index].text.slice(m.start, m.end)]), [[0, CUES[0].text.slice(0, 6)], [1, 'كتب'], [2, 'كتب'], [2, `كت${TATWEEL}ب`]]);
  // ا تطابق أ وإ بعد إسقاط الهمزة، والسطر الجديد مسافة.
  assert.deepEqual(searchCues(CUES, 'احمد وابراهيم في', { ignoreMarks: true }).map((m) => [m.index, m.start, m.end]), [[1, 0, 16]]);
  assert.equal(searchCues(CUES, 'احمد').length, 0, 'بلا ignoreMarks الهمزة فارقة');
  assert.deepEqual(searchCues(CUES, 'deep learning').map((m) => [m.index, m.start]), [[3, 0], [3, 16]]);
  assert.deepEqual(searchCues(CUES, '').length + searchCues(CUES, '   ').length, 0);
});

test('البحث الدقيق لا يطابق الحرف الأساسي داخل حرف مركّب (و في ؤ، وا في أ، وe في é)؛ ومع ignoreMarks يطابق', () => {
  const cues = [{ n: 1, startMs: 0, endMs: 1000, text: 'مؤمن وأحمد في café' }];
  assert.deepEqual(searchCues(cues, 'و').map((m) => m.start), [5], 'واو العطف وحدها');
  assert.deepEqual(searchCues(cues, 'ا'), []);
  assert.deepEqual(searchCues(cues, 'e'), []);
  assert.deepEqual(planReplace(cues, searchCues(cues, 'و'), 'X').changes[0].after, 'مؤمن Xأحمد في café');
  assert.deepEqual(searchCues(cues, 'و', { ignoreMarks: true }).map((m) => m.start), [1, 5]);
  assert.deepEqual(searchCues(cues, 'cafe', { ignoreMarks: true }).map((m) => [m.start, m.end]), [[14, 18]]);
});

test('الكلمة كاملة: لا تطابق داخل كلمة، والتشكيل جزء من الكلمة', () => {
  assert.deepEqual(searchCues(CUES, 'كتب', { wholeWord: true, ignoreMarks: true }).map((m) => m.index), [0]);
  assert.deepEqual(searchCues(CUES, 'الطالب', { wholeWord: true }).map((m) => m.index), [0]);
  assert.deepEqual(searchCues(CUES, 'الطال', { wholeWord: true }), []);
});

test('البحث في المرجع الإنجليزي قراءة فقط: المواضع في نص المرجع لكل مقطع', () => {
  const r = searchCues(CUES, 'library', { field: 'en', english: ENGLISH });
  assert.deepEqual(r, [{ index: 1, start: 25, end: 32 }]);
  assert.deepEqual(searchCues(CUES, 'library', { field: 'en' }), [], 'بلا مرجع لا نتائج');
});

test('الاستبدال حرفي في المواضع المختارة وحدها: لا يمس التوقيت ولا الأرقام ولا المدخلات', () => {
  const matches = searchCues(CUES, 'deep learning');
  const all = planReplace(CUES, matches, 'التعلم العميق');
  assert.deepEqual(all.changes, [{ index: 3, n: 4, before: CUES[3].text, after: 'التعلم العميق و التعلم العميق' }]);
  const second = planReplace(CUES, matches, '$1 & $&', { only: [1] });
  assert.deepEqual(second.changes[0].after, 'Deep Learning و $1 & $&', 'لا أنماط في الاستبدال');
  const marked = planReplace(CUES, searchCues(CUES, 'كتب', { ignoreMarks: true }), 'خطّ');
  assert.deepEqual(marked.changes.map((c) => [c.index, c.after]), [[0, 'خطّ الطالب درسه'], [1, 'أحمد وإبراهيم\nفي المخطّة'], [2, 'يخطّون الخطّ']]);
  // اختيار المواضع: الأولى والأخيرة وحدهما.
  const picked = planReplace(CUES, searchCues(CUES, 'كتب', { ignoreMarks: true }), 'خطّ', { only: [0, 3] });
  assert.deepEqual(picked.changes.map((c) => [c.index, c.after]), [[0, 'خطّ الطالب درسه'], [2, 'يكتبون الخطّ']]);
  assert.throws(() => planReplace(CUES, [{ index: 0, start: 5, end: 99 }], 'x'), RangeError);
  assert.throws(() => planReplace(CUES, [{ index: 3, start: 0, end: 5 }, { index: 3, start: 2, end: 6 }], 'x'), RangeError);
  assert.deepEqual(planReplace(CUES, matches, 'Deep Learning', { only: [0] }).changes, [], 'لا تغيير لا يُعدّ');
});

test('الدمج: من بداية الأول إلى أبعد النهايتين، والنصان سطرًا بسطر، ورقم الأول؛ والأخير لا يُدمج', () => {
  const out = mergeCues(CUES, 1);
  assert.equal(out.length, 3);
  assert.deepEqual(out[1], { n: 2, startMs: 3500, endMs: 7000, text: 'أحمد وإبراهيم\nفي المكتبة\nيكتبون الكتـب'.replace('ـ', TATWEEL) });
  assert.deepEqual(out.map((c) => c.n), [1, 2, 4]);
  assert.throws(() => mergeCues(CUES, 3), (e) => e instanceof TjError && e.code === 'ED_MERGE_INVALID' && hasCode(e.code));
});

test('الشطر: عند المؤشر بنسبة المحارف، والقطعتان برقم المقطع، وبلا قطعة فارغة', () => {
  const at = CUES[1].text.indexOf('\n');
  const out = splitCue(CUES, 1, at);
  assert.equal(out.length, 5);
  assert.deepEqual(out.slice(1, 3).map((c) => [c.n, c.text]), [[2, 'أحمد وإبراهيم'], [2, 'في المكتبة']]);
  assert.equal(out[1].startMs, 3500);
  assert.equal(out[2].endMs, 5000);
  assert.equal(out[1].endMs, out[2].startMs);
  assert.equal(out[1].endMs, 3500 + Math.round(1500 * (12 / 21)));
  for (const bad of [0, CUES[1].text.length, 2.5]) assert.throws(() => splitCue(CUES, 1, bad), (e) => e.code === 'ED_SPLIT_INVALID');
  assert.throws(() => splitCue([{ n: 1, startMs: 10, endMs: 11, text: 'أ ب' }], 0, 1), (e) => e.code === 'ED_SPLIT_INVALID');
  // لا داخل زوج بديل ولا بين الحرف وتشكيله.
  const emoji = [{ n: 1, startMs: 0, endMs: 4000, text: `${fromCodes(0x1f600)} مرحبًا بكم` }];
  assert.throws(() => splitCue(emoji, 0, 1), (e) => e.code === 'ED_SPLIT_INVALID');
  assert.throws(() => splitCue(CUES, 0, 1), (e) => e.code === 'ED_SPLIT_INVALID', 'بين الكاف وفتحتها');
  assert.equal(splitCue(emoji, 0, 2)[1].text, 'مرحبًا بكم');
});

test('سياسة الترقيم تمنع الاستعادة الشاملة: دمج ثم شطر يعيدان العدد ولا يعيدان الترقيم المتسلسل', () => {
  const en = longTrack(400);
  const fp = fingerprint({ track: englishTrack({ cues: en }) });
  const ar = arabicTwin(en);
  assert.equal(canRestore(ar, fp), true);
  const merged = mergeCues(ar, 50);
  const both = splitCue(merged, 200, merged[200].text.indexOf(' '));
  assert.equal(both.length, 400);
  assert.equal(compare(both, fp).numbering, 'different');
  assert.equal(compare(both, fp).restoreTimingAvailable, false);
  assert.equal(canRestore(both, fp), false);
});

test('تصحيح الانجراف: تحويل خطي يضع المرساتين في زمنيهما ويمد الباقي، ويرفض الزمن السالب بأرقامه', () => {
  const cues = [
    { n: 1, startMs: 10_000, endMs: 12_000, text: 'أ' },
    { n: 2, startMs: 20_000, endMs: 22_000, text: 'ب' },
    { n: 3, startMs: 30_000, endMs: 33_000, text: 'ج' },
  ];
  const r = driftCorrect(deepFreeze(cues.map((c) => ({ ...c }))), { a: { n: 1, toMs: 11_000 }, b: { n: 3, toMs: 32_000 } });
  assert.equal(r.ok, true);
  assert.deepEqual(r.cues.map((c) => [c.startMs, c.endMs]), [[11_000, 13_100], [21_500, 23_600], [32_000, 35_150]]);
  assert.deepEqual(r.cues.map((c) => [c.n, c.text]), cues.map((c) => [c.n, c.text]));
  const neg = driftCorrect(cues, { a: { n: 2, toMs: 1_000 }, b: { n: 3, toMs: 30_000 } });
  assert.deepEqual(neg, { ok: false, negative: [1] });
  for (const anchors of [
    { a: { n: 1, toMs: 0 }, b: { n: 1, toMs: 5 } }, { a: { n: 9, toMs: 0 }, b: { n: 1, toMs: 5 } },
    { a: { n: 1, toMs: 20_000 }, b: { n: 3, toMs: 10_000 } }, { a: { n: 1, toMs: -5 }, b: { n: 3, toMs: 10_000 } },
  ]) assert.throws(() => driftCorrect(cues, anchors), (e) => e.code === 'ED_DRIFT_ANCHORS');
  // تمدد يتجاوز حد النموذج (100 ساعة) يُرفض برمز، لا مخرج غير صالح.
  const close = [{ n: 1, startMs: 1000, endMs: 2000, text: 'أ' }, { n: 2, startMs: 1001, endMs: 3000, text: 'ب' }];
  assert.throws(() => driftCorrect(close, { a: { n: 1, toMs: 1000 }, b: { n: 2, toMs: 300_000_000 } }), (e) => e.code === 'ED_DRIFT_RANGE' && hasCode(e.code));
});

test('مقاييس الكثافة: المحارف المرئية ومسافاتها دون التشكيل وفواصل الأسطر، وأطول سطر، والمدة غير الموجبة', () => {
  const marked = `ك${FATHA}ت${FATHA}ب${FATHA}`;
  assert.deepEqual(readingMetrics({ startMs: 0, endMs: 1000, text: `${marked} الدرس\nسطر` }), { cps: 12, longestLine: 9 });
  assert.deepEqual(readingMetrics({ startMs: 0, endMs: 3000, text: 'ab' }), { cps: 0.7, longestLine: 2 });
  assert.deepEqual(readingMetrics({ startMs: 5, endMs: 5, text: 'أ' }), { cps: Infinity, longestLine: 1 });
  assert.deepEqual(readingMetrics({ startMs: 5, endMs: 5, text: '' }), { cps: 0, longestLine: 0 });
  assert.deepEqual(densityIssues({ startMs: 0, endMs: 1000, text: 'س'.repeat(21) }), ['ED_READING_FAST']);
  assert.deepEqual(densityIssues({ startMs: 0, endMs: 10_000, text: 'س'.repeat(43) }), ['ED_LINE_LONG']);
  assert.deepEqual(densityIssues({ startMs: 0, endMs: 1000, text: 'س'.repeat(21) }, { maxCps: 25 }), [], 'العتبة قابلة للضبط');
  for (const code of ['ED_READING_FAST', 'ED_LINE_LONG']) assert.ok(hasCode(code));
});

test('العتبة الافتراضية مكتوبة بمبررها ومعايرة على العيّنتين العربيتين الحقيقيتين: تنبيه على الشاذ لا على عُشر الكلام', () => {
  assert.deepEqual(READING_DEFAULTS, { maxCps: 20, maxLineChars: 42 });
  const doc = readFileSync(path.join(ROOT, 'docs/evidence/P11/reading-calibration.md'), 'utf8');
  assert.match(doc, /\*\*20 محرفًا في الثانية\*\*/);
  assert.match(doc, /\*\*42 محرفًا\*\*/);
  const cues = [REAL_ARABIC.manual, REAL_ARABIC.asrLong].flatMap((name) => parseSrtLenient(realArabic(name)).cues);
  const fast = cues.filter((c) => densityIssues(c).includes('ED_READING_FAST')).length / cues.length;
  const long = cues.filter((c) => densityIssues(c).includes('ED_LINE_LONG')).length / cues.length;
  assert.ok(fast > 0.01 && fast < 0.05, `سرعة ${fast}`);
  assert.ok(long > 0.02 && long < 0.1, `سطر ${long}`);
});
