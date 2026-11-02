// تكامل الاستكمال (P14-AC6، R52) على ملف من 900 مقطع ينقصه 12، بالتخزين الحقيقي (محاكاة chrome.storage): مجموعات الاستكمال
// ← ملف الاستكمال من المسار المحفوظ ← ردّ النموذج ملفَّي تصحيح يُستلمان تباعًا ← معاينة وتطبيق في المواضع ← حالة الأجزاء
// مشتقة ← حفظ صريح في خانة غير نشطة لا يغيّر ما يعرضه المشغّل. والسليم لا يُمس في أي خطوة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compare } from '../../../src/core/compare/index.js';
import { COMPLETION_DEFAULTS, completionGroups, completionNumbers, createEditSession, resolveSlotMarks } from '../../../src/core/edit/index.js';
import { buildExport, buildPatchPackage } from '../../../src/core/export/index.js';
import { partsStatus, readPatch } from '../../../src/core/import/index.js';
import { parseSrtLenient } from '../../../src/core/srt/lenient.js';
import { formatSrtTime } from '../../../src/core/srt/time.js';
import { createStore } from '../../../src/core/store/index.js';
import { openedSlot, saveSlot } from '../../../src/pages/editor/persist.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { NOW, VIDEO_ID, englishTrack, videoRecord } from '../../helpers/fixtures.js';
import { fileOf } from '../../fixtures/srt/index.js';
import { arabicTwin, longTrack } from '../../fixtures/v2/index.js';

const DROP = [7, 8, 9, 150, 299, 300, 301, 520, 521, 777, 899, 900];

/** ردّ النموذج على ملف الاستكمال: الأرقام والأزمنة كما هي، والنص عربي. */
function translatePatch(text, pick = () => true) {
  return parseSrtLenient(text).cues.filter((c) => pick(c.n))
    .map((c) => `${c.n}\n${formatSrtTime(c.startMs)} --> ${formatSrtTime(c.endMs)}\nمكمَّل ${c.n}\n`).join('\n');
}

async function setup() {
  const track = englishTrack({ cues: longTrack(900) });
  const exp = buildExport({ videoId: VIDEO_ID, track, mode: 'normal', split: { size: 300 }, now: NOW });
  const fp = exp.fingerprint;
  const full = arabicTwin(track.cues);
  const cues = full.filter((c) => !DROP.includes(c.n));
  const comparison = compare(cues, fp, { driftMs: 100 });
  const active = { fileName: `${VIDEO_ID}.ar.srt`, importedAt: NOW, original: full, current: null, editedAt: null, fingerprintId: fp.id, comparison: compare(full, fp, { driftMs: 100 }), notes: [] };
  const second = { ...active, fileName: `${VIDEO_ID}.second.ar.srt`, original: cues, comparison };
  const record = { ...videoRecord(), english: [track], fingerprints: [fp], arabic: active };
  const area = createMemoryArea();
  const store = createStore({ area, now: () => Date.parse(NOW) + 5000 });
  await store.updateBundle(VIDEO_ID, () => ({
    videoId: VIDEO_ID, record, active: 1, previous: null,
    slots: [
      { n: 1, name: null, track: active, offsetMs: 0, marks: [], position: null },
      { n: 2, name: 'الناقصة', track: second, offsetMs: 0, marks: [], position: null },
      { n: 3, name: null, track: null, offsetMs: 0, marks: [], position: null },
    ],
  }));
  return { store, track, fp, cues, comparison };
}

test('الاستكمال على 900 مقطع ينقصه 12: ملف وتعليمات، وجزآن يُستلمان تباعًا، وتطبيق في المواضع، وحفظ صريح في خانة غير نشطة', async () => {
  const { store, track, fp } = await setup();
  const opened = await store.getBundle(VIDEO_ID);
  const slot = openedSlot(opened, 2);
  assert.equal(slot.cues.length, 888);
  const session = createEditSession({ cues: slot.cues, offsetMs: slot.offsetMs });
  const comparison = compare(session.snapshot(), slot.fingerprint, { driftMs: 100 });
  assert.deepEqual(comparison.missing, DROP);

  const groups = completionGroups({ cues: session.snapshot(), comparison, fingerprint: fp, marks: resolveSlotMarks([], []), selection: [] });
  const numbers = completionNumbers(groups, COMPLETION_DEFAULTS);
  assert.deepEqual(numbers, DROP, 'الناقص تلقائيًا');

  const pkg = buildPatchPackage({ videoId: VIDEO_ID, title: 'عنوان', fingerprint: fp, englishTracks: [track], numbers, glossary: [{ source: 'village', target: 'قرية', note: null }] });
  assert.equal(pkg.ok, true, pkg.code);
  assert.equal(pkg.count, 12);
  assert.match(pkg.file.name, /\.patch\.srt$/);
  assert.match(pkg.instructions, /قرية/, 'القاموس في التعليمات');

  const before = partsStatus(fp, session.snapshot());
  assert.deepEqual(before.map((p) => p.complete), [false, false, false]);

  // الجزء الأول من الرد (أرقام حتى 300) ثم الباقي: الأجزاء المستلمة تباعًا بحالة مشتقة.
  const first = await readPatch(fileOf(translatePatch(pkg.file.text, (n) => n <= 300), `${VIDEO_ID}.ar.manual.normal.patch.srt`), { fingerprint: fp, cues: session.snapshot() });
  assert.equal(first.ok, true, JSON.stringify(first.error));
  assert.deepEqual(first.plan.parts.map((p) => p.complete), [true, false, false]);
  assert.equal(session.applyPatchPlan(first.plan).ok, true);
  assert.deepEqual(partsStatus(fp, session.snapshot()).map((p) => p.complete), [true, false, false]);

  const rest = await readPatch(fileOf(translatePatch(pkg.file.text, (n) => n > 300), `${VIDEO_ID}.ar.manual.normal.patch.srt`), { fingerprint: fp, cues: session.snapshot() });
  assert.equal(rest.ok, true, JSON.stringify(rest.error));
  // معاينة واختيار: يُترك بند واحد ثم يُطبَّق الباقي.
  const only = rest.plan.items.map((it) => it.n).filter((n) => n !== 900);
  assert.equal(session.applyPatchPlan(rest.plan, { only }).ok, true);
  assert.equal(session.count, 899);
  assert.deepEqual(partsStatus(fp, session.snapshot()).map((p) => [p.complete, p.received]), [[true, 300], [true, 300], [false, 299]]);
  assert.equal(session.historySize, 2, 'كل ملف خطوة واحدة');

  // السليم لا يُمس: كل مقطع كان موجودًا بنصه وزمنه كما هو.
  const now = new Map(session.snapshot().map((c) => [`${c.n}|${c.startMs}`, c.text]));
  for (const c of slot.cues) assert.equal(now.get(`${c.n}|${c.startMs}`), c.text);
  assert.equal(compare(session.snapshot(), fp, { driftMs: 100 }).missing.length, 1);

  // التراجع خطوةً، ثم الحفظ صريحًا في الخانة 2 وحدها.
  session.undo();
  assert.equal(session.count, 888 + 6, "التراجع يعيد ما قبل الجزء الثاني");
  session.redo();
  const saved = await saveSlot(store, VIDEO_ID, opened, 2, { cues: session.snapshot(), offsetChanged: false, offsetMs: 0 });
  assert.equal(saved.active, 1);
  assert.deepEqual(saved.record.arabic, opened.record.arabic, 'ما يعرضه المشغّل لم يتغير');
  assert.equal(saved.slots[1].track.current.length, 899);
  assert.equal(saved.slots[1].track.original.length, 888, 'الأصل المستورد باقٍ');
});

test('ملف تصحيح لترجمة تغيّرت بعد قراءته لا يُطبَّق ولا يُسجَّل', async () => {
  const { store, fp, track } = await setup();
  const opened = await store.getBundle(VIDEO_ID);
  const session = createEditSession({ cues: openedSlot(opened, 2).cues });
  const pkg = buildPatchPackage({ videoId: VIDEO_ID, fingerprint: fp, englishTracks: [track], numbers: [7, 8] });
  const read = await readPatch(fileOf(translatePatch(pkg.file.text), `${VIDEO_ID}.ar.manual.normal.patch.srt`), { fingerprint: fp, cues: session.snapshot() });
  assert.equal(read.ok, true, JSON.stringify(read.error));
  assert.equal(read.plan.items.length, 2);
  session.setText(0, 'تغيّر بعد القراءة');
  assert.deepEqual(session.applyPatchPlan(read.plan), { ok: false, code: 'IM_PATCH_STALE' });
  assert.equal(session.historySize, 1);
});
