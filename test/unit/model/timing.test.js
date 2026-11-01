// عقد التوقيت (docs/contracts/timing.md): القواعد، والحالات الإلزامية الخمس لـ«لا تطبيق مزدوج».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  commitOffset, exportTiming, isValidOffset, lookupMs, normalizeOffset, shiftCues, shownTimes,
  withArabicEdit, withArabicImport, withExport, withView, withOriginalRestored, withoutArabic,
} from '../../../src/core/model/index.js';
import { validateVideoRecord } from '../../../src/core/model/video.js';
import { TjError } from '../../../src/core/errors/index.js';
import { NOW, englishTrack, fingerprint, makeCues, videoRecord } from '../../helpers/fixtures.js';

const LATER = '2026-11-01T13:00:00.000Z';
const shown = (cues, offset) => cues.map((c) => shownTimes(c, offset));
const valid = (r) => {
  const v = validateVideoRecord({ ...r, rev: Math.max(1, r.rev) });
  assert.equal(v.ok, true, `${v.path}: ${v.reason}`);
};

test('الإشارة والبحث: + تأخير، والبحث بـcurrentTime − الإزاحة', () => {
  assert.deepEqual(shownTimes({ startMs: 10000, endMs: 12000 }, 500), { startMs: 10500, endMs: 12500 });
  assert.equal(lookupMs(10.5, 500), 10000, 'عند 10.5ث مع +0.5 يظهر مقطع 10ث المحفوظ');
  assert.equal(lookupMs(10.5, -2000), 12500);
  assert.equal(lookupMs(0.2, 500), -300, 'زمن بحث سالب: لا مقطع ولا خطأ');
});

test('الإزاحة: شبكة 100ms وحد ±10 دقائق', () => {
  assert.equal(normalizeOffset(449), 400);
  assert.equal(normalizeOffset(-1250), -1200);
  assert.equal(normalizeOffset(10 ** 9), 600000);
  assert.equal(normalizeOffset(Number.NaN), 0);
  assert.equal(Object.is(normalizeOffset(-20), 0), true, 'لا -0');
  assert.ok(isValidOffset(-600000) && !isValidOffset(50) && !isValidOffset(600100));
});

test('النقل: نسخة جديدة، ولا نقل جزئي عند زمن سالب', () => {
  const cues = makeCues(3, { startMs: 1000 });
  const r = shiftCues(cues, 500);
  assert.equal(r.ok, true);
  assert.equal(r.cues[0].startMs, 1500);
  assert.equal(cues[0].startMs, 1000, 'المدخل لم يتغير');
  const only = shiftCues(cues, 500, { only: (c) => c.n === 2 });
  assert.deepEqual(only.cues.map((c) => c.startMs), [1000, 4000, 6000]);
  assert.deepEqual(shiftCues(cues, -2000), { ok: false, negative: [1] });
});

test('التصدير العربي بإزاحة صفر: المحفوظ دون سؤال', () => {
  const cues = makeCues(2);
  const r = exportTiming(cues, 0);
  assert.equal(r.ok && r.timing, 'saved');
  assert.equal(r.askUser, false);
  assert.deepEqual(r.cues, cues);
});

test('إلزامي ١: +0.5 ثم «تثبيت الإزاحة» ثم حفظ ← المحفوظ +500، والإزاحة 0، والظاهر كما كان', () => {
  const rec = videoRecord({ offset: 500 });
  const before = shown(rec.arabic.original, 500);
  const c = commitOffset(rec.arabic.original, rec.view.displayOffsetMs);
  assert.equal(c.ok, true);
  const saved = withArabicEdit(rec, { cues: c.cues, displayOffsetMs: c.displayOffsetMs }, LATER);
  valid(saved);
  assert.equal(saved.arabic.current[0].startMs, rec.arabic.original[0].startMs + 500);
  assert.equal(saved.view.displayOffsetMs, 0);
  assert.deepEqual(shown(saved.arabic.current, saved.view.displayOffsetMs), before);
  assert.deepEqual(saved.arabic.original, rec.arabic.original, 'الأصل المستورد لا يتغير');
});

test('إلزامي ٢: +0.5 ثم تصدير «الظاهر» ثم استيراد الملف نفسه ← الإزاحة 0 والظاهر مطابق', () => {
  const rec = videoRecord({ offset: 500 });
  const before = shown(rec.arabic.original, 500);
  const exp = exportTiming(rec.arabic.original, 500, 'shown');
  assert.equal(exp.ok && exp.timing, 'shown');
  assert.equal(rec.view.displayOffsetMs, 500, 'التصدير لا يغيّر المخزَّن');
  const { record, offsetWas, replaced } = withArabicImport(rec, { videoId: rec.videoId, fileName: 'same.ar.srt', cues: exp.cues }, LATER, { replace: true });
  valid(record);
  assert.equal(offsetWas, 500);
  assert.equal(replaced, true);
  assert.equal(record.view.displayOffsetMs, 0);
  assert.deepEqual(shown(record.arabic.original, 0), before);
});

test('إلزامي ٣: +0.5 ثم نقل الملف كله +0.5 في المحرّر ثم حفظ ← المحفوظ +500 والإزاحة +500 والظاهر +1000', () => {
  const rec = videoRecord({ offset: 500 });
  const s = shiftCues(rec.arabic.original, 500);
  assert.equal(s.ok, true);
  const saved = withArabicEdit(rec, { cues: s.cues }, LATER);
  valid(saved);
  assert.equal(saved.view.displayOffsetMs, 500, 'المحرّر لا يمس الإزاحة دون تثبيت');
  const first = rec.arabic.original[0].startMs;
  assert.equal(saved.arabic.current[0].startMs, first + 500);
  assert.equal(shownTimes(saved.arabic.current[0], saved.view.displayOffsetMs).startMs, first + 1000);
});

test('إلزامي ٤: −2 ومقطع أول عند 1ث ثم تصدير «الظاهر» ← رفض يذكر المقطع، لا قصّ صامت', () => {
  const cues = makeCues(3, { startMs: 1000 });
  const r = exportTiming(cues, -2000, 'shown');
  assert.equal(r.ok, false);
  assert.equal(r.code, 'MD_NEGATIVE_TIME');
  assert.deepEqual(r.negative, [1]);
  const msg = new TjError(r.code, { params: { list: r.negative.join('، ') } }).message;
  assert.match(msg, /: 1\./);
  const saved = exportTiming(cues, -2000, 'saved');
  assert.equal(saved.ok && saved.cues[0].startMs, 1000, '«المحفوظ فقط» متاح دائمًا');
});

test('إلزامي ٥: تصدير الإنجليزية مع إزاحة +3 ← الأزمنة مطابقة للمستخرج تمامًا', () => {
  const rec = videoRecord({ offset: 3000 });
  const extracted = makeCues(4, { startMs: 0, text: (i) => `line ${i}` });
  const track = englishTrack({ kind: 'asr', cues: extracted });
  const next = withExport(rec, { videoId: rec.videoId, englishTrack: track, fingerprint: fingerprint({ track, id: 'fp_test000002' }) }, LATER);
  valid(next);
  const stored = next.english.find((t) => t.key === 'en|asr');
  assert.deepEqual(stored.cues, extracted);
  assert.deepEqual(next.fingerprints.at(-1).cues.map((c) => [c.startMs, c.endMs]), extracted.map((c) => [c.startMs, c.endMs]));
  assert.equal(next.view.displayOffsetMs, 3000, 'التصدير لا يمس الإزاحة');
  assert.deepEqual(next.arabic, rec.arabic, 'ولا العربية');
});

test('الاستيراد: يتطلب replace عند وجود ترجمة، ويعيد وضع «إخفاء» إلى الافتراضي، ولا يكرر المسار', () => {
  const rec = videoRecord({ mode: 'off', offset: -1500 });
  assert.throws(() => withArabicImport(rec, { videoId: rec.videoId, fileName: 'b.srt', cues: makeCues(2) }, LATER), (e) => e.code === 'ST_ARABIC_EXISTS');
  const { record } = withArabicImport(rec, { videoId: rec.videoId, fileName: 'b.srt', cues: makeCues(2), englishTrack: rec.english[0], displayModeDefault: 'dual' }, LATER, { replace: true });
  valid(record);
  assert.equal(record.view.displayMode, 'dual');
  assert.equal(record.english.length, 1);
  assert.equal(record.arabic.importedAt, LATER);
  assert.equal(record.arabic.fingerprintId, null);
  const fresh = withArabicImport(null, { videoId: 'BBBBBBBBBBB', fileName: 'c.srt', cues: makeCues(1), title: 'ع' }, NOW);
  valid(fresh.record);
  assert.equal(fresh.replaced, false);
  assert.throws(() => withArabicImport(rec, { videoId: 'BBBBBBBBBBB', fileName: 'x', cues: makeCues(1) }, NOW, { replace: true }), (e) => e.code === 'MD_INVALID');
});

test('البصمات: حد عشر، ولا تسقط البصمة التي تشير إليها العربية', () => {
  let rec = videoRecord();
  const keep = rec.arabic.fingerprintId;
  for (let i = 0; i < 12; i++) {
    rec = withExport(rec, { videoId: rec.videoId, englishTrack: rec.english[0], fingerprint: fingerprint({ track: rec.english[0], id: `fp_extra${String(i).padStart(4, '0')}` }) }, LATER);
  }
  assert.equal(rec.fingerprints.length, 10);
  assert.ok(rec.fingerprints.some((f) => f.id === keep));
  assert.equal(rec.fingerprints.at(-1).id, 'fp_extra0011');
  valid(rec);
});

test('حد المسارات الإنجليزية: التصدير يُسقط أقدم مسار لا تشير إليه بصمة، والمرجع لا يُضاف عند الامتلاء', () => {
  let rec = videoRecord();
  const langs = ['en-GB', 'en-US', 'en-AU', 'en-CA', 'en-IE', 'en-NZ', 'en-IN'];
  rec = { ...rec, english: [...rec.english, ...langs.map((lang) => englishTrack({ lang }))] };
  assert.equal(rec.english.length, 8);
  valid(rec);
  const t = englishTrack({ lang: 'en-ZA', kind: 'asr' });
  const next = withExport(rec, { videoId: rec.videoId, englishTrack: t, fingerprint: fingerprint({ track: t, id: 'fp_limit000001' }) }, LATER);
  valid(next);
  assert.equal(next.english.length, 8);
  assert.ok(next.english.some((x) => x.key === 'en|manual'), 'المسار المشار إليه بالبصمة باقٍ');
  assert.ok(!next.english.some((x) => x.key === 'en-GB|manual'), 'أُسقط أقدم مسار غير مشار إليه');
  const imp = withArabicImport(next, { videoId: rec.videoId, fileName: 'n.srt', cues: makeCues(2), englishTrack: englishTrack({ lang: 'en-SG' }) }, LATER, { replace: true });
  valid(imp.record);
  assert.equal(imp.record.english.length, 8);
  assert.ok(!imp.record.english.some((x) => x.key === 'en-SG|manual'));
});

test('العرض والاستعادة والحذف لا تمس التوقيت المحفوظ', () => {
  const rec = videoRecord();
  const v = withView(rec, { displayOffsetMs: 700, displayMode: 'dual' }, LATER);
  assert.deepEqual(v.arabic, rec.arabic);
  assert.deepEqual(v.view, { displayOffsetMs: 700, displayMode: 'dual' });
  const edited = withArabicEdit(rec, { cues: makeCues(5, { startMs: 9000 }) }, LATER);
  const restored = withOriginalRestored(edited, LATER);
  assert.equal(restored.arabic.current, null);
  assert.equal(restored.arabic.editedAt, null);
  valid(restored);
  const gone = withoutArabic(v, LATER);
  assert.equal(gone.arabic, null);
  assert.equal(gone.view.displayOffsetMs, 0);
  assert.equal(gone.english.length, 1, 'يبقى المسار الإنجليزي والبصمة');
  valid(gone);
  assert.throws(() => withArabicEdit(gone, { cues: makeCues(1) }, LATER), (e) => e.code === 'ST_NO_RECORD');
});
