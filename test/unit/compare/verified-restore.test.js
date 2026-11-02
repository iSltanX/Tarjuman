// الاستعادة الشاملة بمحاذاة متحققة (P11-AC1 وR50): تطابق العدد والترقيم وحده لا يكفي. دمج وشطر يعيدان العدد إلى أصله مع
// إزاحة بمقطع يمنعان الاستعادة، والسبب في notes دون تغيير شكل تقرير المقارنة؛ والانحراف اليسير والمقطع الشاذ تُصلحهما.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRestoreTiming, canRestore, compare, previewRestoreTiming } from '../../../src/core/compare/index.js';
import { hasCode } from '../../../src/core/errors/index.js';
import { validateComparisonReport } from '../../../src/core/model/tracks.js';
import { parseSrtLenient } from '../../../src/core/srt/lenient.js';
import { englishTrack, fingerprint, realTrack } from '../../helpers/fixtures.js';
import { REAL_ARABIC, arabicTwin, driftSome, longTrack, mergeSplitShift, realArabic } from '../../fixtures/v2/index.js';

const EN = longTrack(2400);
const FP = fingerprint({ track: englishTrack({ cues: EN }) });
const AR = arabicTwin(EN);
const valid = (report) => assert.deepEqual(validateComparisonReport(report), { ok: true });

test('دمج وشطر بإزاحة بمقطع: العدد والترقيم مطابقان، والاستعادة ممنوعة والسبب في notes', () => {
  const { cues } = mergeSplitShift(AR);
  const r = compare(cues, FP);
  assert.deepEqual([r.countSource, r.countTarget, r.numbering], [2400, 2400, 'same']);
  assert.equal(r.restoreTimingAvailable, false);
  assert.equal(r.notes.length, 1);
  assert.match(r.notes[0], /لا تُتاح استعادة التوقيت الشاملة/);
  assert.match(r.notes[0], /دمج/);
  assert.ok(r.notes[0].length <= 500);
  valid(r);
  assert.equal(canRestore(cues, FP), false);
  assert.deepEqual(previewRestoreTiming(cues, FP), { available: false, changes: [] });
  assert.throws(() => applyRestoreTiming(cues, FP), (e) => e.code === 'CMP_RESTORE_UNAVAILABLE' && hasCode(e.code));
});

test('انحراف يسير يُتاح إصلاحه بالاستعادة، وبلا ملاحظة', () => {
  const { cues, touched } = driftSome(AR);
  const r = compare(cues, FP);
  assert.equal(r.restoreTimingAvailable, true);
  assert.deepEqual(r.notes, []);
  assert.equal(previewRestoreTiming(cues, FP).changes.length, touched.length);
  assert.deepEqual(applyRestoreTiming(cues, FP).map((c) => [c.startMs, c.endMs]), EN.map((c) => [c.startMs, c.endMs]));
  valid(r);
});

test('مقطع واحد بسطر توقيت خاطئ (ساعة زائدة) تُتاح استعادته، فالمرساة رقمه بين جيران متطابقين', () => {
  const cues = AR.map((c, i) => (i === 700 ? { ...c, startMs: c.startMs + 3_600_000, endMs: c.endMs + 3_600_000 } : c));
  assert.equal(compare(cues, FP).restoreTimingAvailable, true);
  assert.equal(applyRestoreTiming(cues, FP)[700].startMs, EN[700].startMs);
});

test('عيّنة P1 اليدوية ومقابلها العربي الحقيقي: مطابقة تامة، والاستعادة متاحة', () => {
  const { cues: english } = realTrack('manual');
  const fp = fingerprint({ videoId: 'iG9CE55wbtY', track: englishTrack({ cues: english }) });
  const r = compare(parseSrtLenient(realArabic(REAL_ARABIC.manual)).cues, fp);
  assert.deepEqual([r.matched, r.restoreTimingAvailable, r.notes], [true, true, []]);
  valid(r);
});
