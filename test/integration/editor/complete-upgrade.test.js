// مستخدم 2.2.0 يعيد تنزيل الأصل التلقائي بعد الترقية (تحقق الجولة الثانية، ن-٢): نزّل في 2.2.0 أصل ميدواي التلقائي وترجمه، ثم
// رقّى إلى إصدار يجمّع مقاطع التلقائي في سطرين (ع-٣: 1,056 ← 1,066 مقطعًا، و729 ← 735 في «مقاطع أطول»)، ثم نزّل الأصل من جديد
// فاستُبدل المسار المحفوظ بتحويل اليوم. «الاستكمال» لترجمته القديمة يُبنى من مرجعها نفسه بترقيمه وأزمنته ونصه كما نزّله في 2.2.0،
// ويعود ردّ النموذج فيكملها. التخزين الحقيقي (محاكاة chrome.storage) والمتحكم والمستخرج بعيّنة json3 الحقيقية، وترجمتا النموذج
// الحقيقيتان، والأصلان المجمّدان ناتج 2.2.0 نفسه (test/fixtures/export/*.before-e03.srt).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../../../src/content/controller.js';
import { compare } from '../../../src/core/compare/index.js';
import { COMPLETION_DEFAULTS, completionGroups, completionNumbers, createEditSession, resolveSlotMarks } from '../../../src/core/edit/index.js';
import { buildExport, buildPatchPackage } from '../../../src/core/export/index.js';
import { readPatch } from '../../../src/core/import/index.js';
import { parseSrtLenient } from '../../../src/core/srt/lenient.js';
import { parseSrtStrict } from '../../../src/core/srt/parser.js';
import { formatSrtTime } from '../../../src/core/srt/time.js';
import { createStore } from '../../../src/core/store/index.js';
import { openedSlot } from '../../../src/pages/editor/persist.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { videoRecord } from '../../helpers/fixtures.js';
import { fileOf } from '../../fixtures/srt/index.js';
import { SOURCE_BEFORE_E03, realArabic, sourceBeforeE03 } from '../../fixtures/v2/index.js';
import { captureMsg, makeExtractor, sample } from '../../unit/extract/helpers.js';

const VID = 'Y9rkKtK1b44';
const BEFORE = '2026-11-10T10:00:00.000Z';
const KEY = 'en|asr';
const DROP = [100, 101, 500, 900, 1000];
const DROP_LONG = [3, 300, 301, 728];

/** ردّ النموذج على ملف الاستكمال: الأرقام والأزمنة كما هي، والنص عربي. */
const translatePatch = (text) => parseSrtLenient(text).cues
  .map((c) => `${c.n}\n${formatSrtTime(c.startMs)} --> ${formatSrtTime(c.endMs)}\nمكمَّل ${c.n}\n`).join('\n');

/**
 * سجل 2.2.0 كما كتبه: المسار المحفوظ بالوضع العادي من محوّل 2.2.0، وبصمة التنزيل بالوضع المطلوب، وترجمة النموذج الحقيقية
 * ينقصها drop في الخانة 1 مرجعها تلك البصمة.
 */
async function v220({ mode, arabic, drop }) {
  const normal = parseSrtStrict(sourceBeforeE03(SOURCE_BEFORE_E03.asrNormal));
  const exported = mode === 'long' ? parseSrtStrict(sourceBeforeE03(SOURCE_BEFORE_E03.asrLong)) : normal;
  const track = { key: KEY, lang: 'en', kind: 'asr', capturedAt: BEFORE, source: 'capture', cues: normal };
  const fp = buildExport({ videoId: VID, mode, now: BEFORE, track: { key: KEY, lang: 'en', kind: 'asr', cues: exported } }).fingerprint;
  const full = parseSrtLenient(realArabic(arabic)).cues;
  assert.equal(full.length, exported.length, 'ترجمة النموذج بترقيم 2.2.0');
  const cues = full.filter((c) => !drop.includes(c.n));
  const translation = {
    fileName: arabic, importedAt: BEFORE, original: cues, current: null, editedAt: null, fingerprintId: fp.id,
    comparison: compare(cues, fp, { driftMs: 100 }), notes: [],
  };
  const record = { ...videoRecord({ videoId: VID }), title: 'Midway', english: [track], fingerprints: [fp], arabic: translation };
  const store = createStore({ area: createMemoryArea() });
  await store.updateBundle(VID, () => ({
    videoId: VID, record, active: 1, previous: null,
    slots: [
      { n: 1, name: null, track: translation, offsetMs: 0, marks: [], position: null },
      { n: 2, name: null, track: null, offsetMs: 0, marks: [], position: null },
      { n: 3, name: null, track: null, offsetMs: 0, marks: [], position: null },
    ],
  }));
  return { store, fp, exported, full };
}

/** بعد الترقية: «تنزيل الأصل (SRT)» من المشغّل بتحويل اليوم، كما يربطه المشغّل (التقاط ← تحويل ← تصدير ← recordExport). */
async function redownload(store, mode) {
  const asr = sample('asr');
  const { extractor } = makeExtractor({ videoId: VID, durationMs: asr.fixture.durationMs });
  const c = createController({ store, extractor, page: { title: () => 'Midway', durationMs: () => asr.fixture.durationMs } });
  await c.start(VID);
  extractor.handleMessage(captureMsg({ videoId: VID, body: asr.body, trackKind: 'asr' }));
  const conv = c.convertCaptured(KEY, { mode });
  assert.equal(conv.ok, true);
  const out = buildExport({ videoId: VID, mode, now: Date.parse('2026-11-14T10:00:00.000Z'), track: { key: conv.key, lang: conv.lang, kind: conv.kind, cues: conv.cues } });
  await c.recordExport({ trackKey: KEY, fingerprint: out.fingerprint });
  return out.fingerprint;
}

/** «الاستكمال» في المحرّر للخانة 1 كما يبنيه (مجموعات ← أرقام ← ملف من مسارات السجل)، ثم ردّ النموذج يُقرأ ويُطبَّق. */
async function complete(store) {
  const opened = await store.getBundle(VID);
  const slot = openedSlot(opened, 1);
  const session = createEditSession({ cues: slot.cues, offsetMs: slot.offsetMs });
  const comparison = compare(session.snapshot(), slot.fingerprint, { driftMs: 100 });
  const groups = completionGroups({ cues: session.snapshot(), comparison, fingerprint: slot.fingerprint, marks: resolveSlotMarks([], []), selection: [] });
  const numbers = completionNumbers(groups, COMPLETION_DEFAULTS);
  const pkg = buildPatchPackage({ videoId: VID, title: opened.record.title, fingerprint: slot.fingerprint, englishTracks: opened.record.english, numbers, target: 'ar' });
  return { opened, slot, session, numbers, pkg };
}

test('2.2.0 ← إعادة تنزيل الأصل التلقائي بعد الترقية: «الاستكمال» لترجمته القديمة يُبنى من مرجعها ويكملها بترقيمه', async () => {
  const { store, fp, exported, full } = await v220({ mode: 'normal', arabic: 'Y9rkKtK1b44.en.asr.normal.ar.srt', drop: DROP });
  const fresh = await redownload(store, 'normal');
  assert.equal(fresh.count, 1066, 'تحويل اليوم');

  const { opened, slot, session, numbers, pkg } = await complete(store);
  assert.equal(opened.record.english.find((t) => t.key === KEY).cues.length, 1066, 'المسار المحفوظ استُبدل بتحويل اليوم');
  assert.deepEqual(opened.record.fingerprints.map((f) => f.id).sort(), [fp.id, fresh.id].sort(), 'وبصمة الترجمة القديمة باقية');
  assert.equal(slot.fingerprint.id, fp.id);
  assert.deepEqual(numbers, DROP);

  assert.equal(pkg.ok, true, pkg.code);
  assert.equal(pkg.file.name, `${VID}.en.asr.normal.patch.srt`);
  const asked = parseSrtLenient(pkg.file.text).cues;
  assert.deepEqual(asked.map((c) => [c.n, c.startMs, c.endMs, c.text]), DROP.map((n) => {
    const c = exported[n - 1];
    return [n, c.startMs, c.endMs, c.text];
  }), 'المقاطع بأرقام 2.2.0 وأزمنتها ونصها كما نزّلها');

  const read = await readPatch(fileOf(translatePatch(pkg.file.text), `${VID}.ar.asr.normal.patch.srt`), { fingerprint: slot.fingerprint, cues: session.snapshot(), target: 'ar' });
  assert.equal(read.ok, true, JSON.stringify(read.error));
  assert.equal(session.applyPatchPlan(read.plan).ok, true);
  assert.equal(session.count, full.length);
  const after = compare(session.snapshot(), slot.fingerprint, { driftMs: 100 });
  assert.equal(after.matched, true, 'الترجمة تطابق مرجعها عددًا وترقيمًا وتوقيتًا بعد الاستكمال');
  assert.deepEqual(after.missing, []);
});

test('2.2.0 بـ«مقاطع أطول» ← إعادة تنزيل الأصل بعد الترقية: «الاستكمال» يُبنى من مرجعها الأطول بترقيمه', async () => {
  const { store, fp, exported } = await v220({ mode: 'long', arabic: 'Y9rkKtK1b44.en.asr.long.ar.srt', drop: DROP_LONG });
  await redownload(store, 'normal');
  const { slot, numbers, pkg } = await complete(store);
  assert.equal(slot.fingerprint.id, fp.id);
  assert.deepEqual(numbers, DROP_LONG);
  assert.equal(pkg.ok, true, pkg.code);
  assert.equal(pkg.file.name, `${VID}.en.asr.long.patch.srt`);
  assert.deepEqual(parseSrtLenient(pkg.file.text).cues.map((c) => [c.n, c.startMs, c.endMs, c.text]), DROP_LONG.map((n) => {
    const c = exported[n - 1];
    return [n, c.startMs, c.endMs, c.text];
  }));
});
