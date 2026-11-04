// انحدارات المراجعة المستقلة (2026-11-04) فوق التخزين الحقيقي بمحاكاة chrome.storage، و«تبويب آخر» مخزن ثانٍ على المساحة نفسها:
// ١) الحذف لا يمس إلا ما سُرد في التأكيد، ولو تغيّرت البيانات أثناء فتحه؛ ٢) النص الدراسي يبقي إزاحة العرض لكل المقاطع ويقصّ ما
// وقع قبل الصفر وحده ويذكره؛ ٣) تصدير بنص مطابق وتوقيت مختلف يحفظ بصمته، فلا انحراف وهمي من التصدير حتى الاستيراد والمقارنة.
// تأكيدات العقد بـassert.ok لا assert.equal (فرق عقدة الـDOM الوهمي يستنزف الذاكرة).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildExport, studyTiming, studyTimingNote } from '../../../../src/core/export/index.js';
import { readImport, sameExport } from '../../../../src/core/import/index.js';
import { withActiveSlot, withPreviousRestored, withSlotName } from '../../../../src/core/model/bundle.js';
import { writeSrt } from '../../../../src/core/srt/writer.js';
import { createStore } from '../../../../src/core/store/index.js';
import {
  applyUpload, deletePrevious, deleteSlot, deleteVideoData, exportEnglish, exportStudy, prepareUpload, studyNote,
} from '../../../../src/pages/library/actions.js';
import { createLibrary } from '../../../../src/pages/library/view.js';
import { messageFor } from '../../../../src/core/errors/index.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW, englishTrack, makeCues, videoRecord } from '../../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../../helpers/fixtures-v2.js';
import { buttonNamed, newDocument, settle, textOf } from './fake-dom.js';

const ID = 'AAAAAAAAAAA';
const STALE = messageFor('PG_DELETE_STALE');

function clock() {
  let t = Date.parse(NOW);
  return () => (t += 1000);
}

/** مخزن هذه الصفحة ومخزن «تبويب آخر» على المساحة نفسها. */
async function twoTabs(seed) {
  const area = createMemoryArea({ unlimited: true });
  const now = clock();
  const store = createStore({ area, now });
  const other = createStore({ area, now });
  await seed(store);
  await area.flush();
  return { area, store, other, now };
}

async function mountLibrary(store) {
  const doc = newDocument();
  const answers = [];
  const confirms = [];
  const lib = createLibrary({
    store, doc, now: () => Date.parse(NOW) + 3600 * 1000,
    openTab: async () => {}, openPage: async () => {},
    saveFile: async () => ({ ok: true, mode: 'downloads', downloadId: 1 }),
    clipboardWrite: async () => {}, pickFiles: async () => null, diagnosticsText: async () => '{}',
    confirm: async (o) => { confirms.push(o); const a = answers.shift(); return typeof a === 'function' ? a(o) : a ?? false; },
    setTimer: () => 0, clearTimer: () => {},
  });
  doc.body.append(lib.root);
  await lib.load();
  return { lib, doc, answers, confirms, root: lib.root };
}

const rowOf = (m, id) => m.root.querySelectorAll('li.lib-row').find((r) => r.getAttribute('data-video') === id);
function openMore(m, id, label) {
  const more = buttonNamed(rowOf(m, id), 'المزيد');
  more.click();
  more.parentNode.querySelectorAll('[role=menuitem]').find((i) => textOf(i).startsWith(label)).click();
}
const toastText = (m) => m.root.querySelectorAll('.tj-toast').map((t) => textOf(t)).join(' | ');
const filled = (b) => b.slots.map((s) => Boolean(s.track));

// ---- ١) الحذف ----

test('حذف الترجمة النشطة: تأكيد حذف 1 ثم تفعيل 2 من تبويب آخر قبل الموافقة لا يحذف 2 ولا شيئًا، ويقول ذلك ويعيد القائمة', async () => {
  const tabs = await twoTabs((s) => seedBundle(s, sampleBundle({ videoId: ID, third: true })));
  const m = await mountLibrary(tabs.store);
  m.answers.push(async () => {
    // أثناء فتح الحوار: التبويب الآخر يفعّل الترجمة 2.
    await tabs.other.updateBundle(ID, (b) => withActiveSlot(b, 2, NOW));
    return true;
  });
  openMore(m, ID, 'حذف الترجمة النشطة');
  await settle(20);
  assert.equal(m.confirms[0].title, 'حذف الترجمة النشطة (1)؟', 'الحوار سرد الترجمة 1');
  const after = await tabs.store.getBundle(ID);
  assert.deepEqual(filled(after), [true, true, true], 'لم يُحذف شيء: لا 2 التي صارت نشطة، ولا 1 بعد تغيّر البيانات');
  assert.equal(after.active, 2);
  assert.ok(toastText(m).includes(STALE), toastText(m));
  // الموافقة على ما يُعرض الآن تحذف ما سُرد فيه وحده (2 النشطة الآن)، ويبقى 1 و3.
  m.answers.push(true);
  openMore(m, ID, 'حذف الترجمة النشطة');
  await settle(20);
  assert.equal(m.confirms[1].title, 'حذف الترجمة النشطة (2)؟');
  assert.deepEqual(filled(await tabs.store.getBundle(ID)), [true, false, true]);
});

test('الحذف بخانة بعينها: deleteVideoData «arabic» يحذف n المسرودة لا النشطة لحظة الكتابة، ويرفض بلا رقم', async () => {
  const tabs = await twoTabs((s) => seedBundle(s, sampleBundle({ videoId: ID, third: true })));
  await tabs.other.updateBundle(ID, (b) => withActiveSlot(b, 2, NOW));
  await deleteVideoData({ store: tabs.store, videoId: ID, scope: 'arabic', n: 1, now: tabs.now });
  const b = await tabs.store.getBundle(ID);
  assert.deepEqual(filled(b), [false, true, true], 'حُذفت 1 المسرودة، وبقيت 2 النشطة');
  assert.equal(b.active, 2);
  await assert.rejects(deleteVideoData({ store: tabs.store, videoId: ID, scope: 'arabic', now: tabs.now }), RangeError);
});

test('حذف كل بيانات الفيديو مقيّد بما سُرد: إضافة من تبويب آخر بعد فتح التأكيد ترفضه بـPG_DELETE_STALE ولا تحذف شيئًا', async () => {
  const tabs = await twoTabs((s) => seedBundle(s, sampleBundle({ videoId: ID })));
  const shown = await tabs.store.getBundle(ID);
  await tabs.other.updateBundle(ID, (b) => withSlotName(b, 2, 'جديد'));
  await assert.rejects(deleteVideoData({ store: tabs.store, videoId: ID, scope: 'all', expect: shown, now: tabs.now }), (e) => e.code === 'PG_DELETE_STALE');
  assert.ok((await tabs.store.getBundle(ID)) !== null, 'الفيديو باقٍ');
  await deleteVideoData({ store: tabs.store, videoId: ID, scope: 'all', expect: await tabs.store.getBundle(ID), now: tabs.now });
  assert.ok((await tabs.store.getBundle(ID)) === null, 'والموافقة على الأحدث تحذفه');
});

test('حذف ترجمة من بطاقتها وحذف النسخة السابقة: تغيّر ما عُرض قبل الموافقة يرفضهما بلا حذف', async () => {
  const tabs = await twoTabs((s) => seedBundle(s, sampleBundle({ videoId: ID, third: true })));
  const shown = await tabs.store.getBundle(ID);
  await tabs.other.updateBundle(ID, (b) => withSlotName(b, 2, 'غيّرها تبويب آخر'));
  await assert.rejects(deleteSlot({ store: tabs.store, videoId: ID, n: 2, now: tabs.now, expect: shown }), (e) => e.code === 'PG_DELETE_STALE');
  assert.deepEqual(filled(await tabs.store.getBundle(ID)), [true, true, true]);

  const before = await tabs.store.getBundle(ID);
  // الاستعادة من تبويب آخر تجعل السابقة نسخة أخرى (محتوى الخانة 2 الحالي).
  await tabs.other.updateBundle(ID, (b) => withPreviousRestored(b, NOW));
  await assert.rejects(deletePrevious({ store: tabs.store, videoId: ID, expect: before }), (e) => e.code === 'PG_DELETE_STALE');
  assert.ok((await tabs.store.getBundle(ID)).previous !== null, 'السابقة الجديدة باقية');
});

test('بطاقة الترجمة في التوسيع: تأكيد حذف 2 ثم استبدال محتواها من تبويب آخر لا يحذف المحتوى الجديد', async () => {
  const tabs = await twoTabs((s) => seedBundle(s, sampleBundle({ videoId: ID, third: true })));
  const m = await mountLibrary(tabs.store);
  buttonNamed(rowOf(m, ID), 'إظهار الترجمات').click();
  await settle(10);
  const card = rowOf(m, ID).querySelector('section[data-slot="2"]');
  m.answers.push(async () => {
    await tabs.other.updateBundle(ID, (b) => withSlotName(b, 2, 'محتوى آخر'));
    return true;
  });
  buttonNamed(card, 'حذف…').click();
  await settle(20);
  const b = await tabs.store.getBundle(ID);
  assert.ok(b.slots[1].track !== null && b.slots[1].name === 'محتوى آخر', 'الخانة 2 بمحتواها الجديد باقية');
  assert.ok(toastText(m).includes(STALE), toastText(m));
});

// ---- ٢) إزاحة النص الدراسي ----

/** مقاطع متباعدة (فقرة لكل مقطع) لتظهر روابط كل مقطع. */
const spaced = () => makeCues(3, { startMs: 1000, durMs: 2000, gapMs: 3000 }); // 1000، 6000، 11000

test('studyTiming: الإزاحة السالبة باقية لكل المقاطع، وما وقع قبل الصفر وحده يبدأ من 0 ويُذكر برقمه', () => {
  const r = studyTiming(spaced(), -2000);
  assert.deepEqual(r.cues.map((c) => [c.startMs, c.endMs]), [[0, 1000], [4000, 6000], [9000, 11000]]);
  assert.deepEqual(r.clamped, [1]);
  assert.match(studyTimingNote(r.clamped), /ما رقمه 1، فيبدأ رابطه في النص الدراسي من 0:00/);
  assert.equal(studyTimingNote([]), '');
  assert.ok(studyTimingNote(Array.from({ length: 12 }, (_, i) => i + 1)).includes('1، 2، 3، 4، 5، 6، 7، 8…'));
  assert.deepEqual(studyTiming(spaced(), 0).clamped, []);
});

test('النص الدراسي من المحفوظات بإزاحة سالبة تجعل المقطع 1 قبل الصفر: بقية الروابط بالإزاحة، والأول من 0:00، والحوار يذكره', async () => {
  const tabs = await twoTabs((s) => s.updateVideo(ID, () => videoRecord({ videoId: ID, offset: -2000, cues: spaced() })));
  const files = [];
  const r = await exportStudy({ store: tabs.store, videoId: ID, format: 'md', bilingual: false, save: async (f) => { files.push(f); return { ok: true, mode: 'downloads', downloadId: 1 }; } });
  assert.deepEqual(r.clamped, [1]);
  const links = [...files[0].text.matchAll(/&t=(\d+)s/g)].map((x) => Number(x[1]));
  assert.deepEqual(links, [0, 4, 9], 'كانت 1 و6 و11: تُسقط الإزاحة عن كل المقاطع');
  assert.match(await studyNote({ store: tabs.store, videoId: ID }), /ما رقمه 1،/);

  const m = await mountLibrary(tabs.store);
  m.answers.push(false);
  openMore(m, ID, 'نص دراسي');
  await settle(20);
  const note = m.confirms[0].content.querySelector('.lib-study__note');
  assert.ok(note !== null, 'إشعار في الحوار قبل التنزيل');
  assert.ok(textOf(note).includes('ما رقمه 1،'), textOf(note));
});

test('بلا مقطع قبل الصفر: لا إشعار في حوار النص الدراسي، والروابط بالإزاحة', async () => {
  const tabs = await twoTabs((s) => s.updateVideo(ID, () => videoRecord({ videoId: ID, offset: 500, cues: spaced() })));
  assert.equal(await studyNote({ store: tabs.store, videoId: ID }), '');
  const m = await mountLibrary(tabs.store);
  m.answers.push(false);
  openMore(m, ID, 'نص دراسي');
  await settle(20);
  assert.ok(m.confirms[0].content.querySelector('.lib-study__note') === null);
});

// ---- ٣) بصمة التصدير والتوقيت ----

/** مسار إنجليزي بنص ثابت وتوقيت يُزاح بـshift. */
const englishAt = (shift) => englishTrack({ cues: makeCues(5, { text: (i) => `line ${i}`, startMs: 1000 + shift }) });

test('sameExport: الأزمنة جزء من «التصدير نفسه»', () => {
  const a = buildExport({ videoId: ID, track: englishAt(0), mode: 'normal', now: Date.parse(NOW) }).fingerprint;
  const b = buildExport({ videoId: ID, track: englishAt(1500), mode: 'normal', now: Date.parse(NOW) }).fingerprint;
  assert.equal(a.textHash, b.textHash, 'النص نفسه');
  assert.equal(sameExport(a, { ...a }), true);
  assert.equal(sameExport(a, b), false, 'توقيت مختلف: تصدير آخر');
});

test('من التصدير حتى الاستيراد والمقارنة: بصمة قديمة بالنص نفسه وتوقيت آخر لا تحجب بصمة التصدير الجديد، فلا انحراف وهمي', async () => {
  // البصمة القديمة لتصدير سابق (توقيت T1)، والمسار المحفوظ الآن بالنص نفسه وتوقيت T2 (مثلًا بعد تصدير «طويل» من المشغّل).
  const old = buildExport({ videoId: ID, track: englishAt(0), mode: 'normal', now: Date.parse('2026-10-01T00:00:00.000Z') }).fingerprint;
  const tabs = await twoTabs((s) => s.updateVideo(ID, () => ({ ...videoRecord({ videoId: ID, arabic: false }), english: [englishAt(1500)], fingerprints: [old] })));
  const r = await exportEnglish({ store: tabs.store, videoId: ID, trackKey: 'en|manual', save: async (f) => ({ ok: true, mode: 'downloads', downloadId: 1, f }), now: tabs.now });
  assert.equal(r.fingerprintSaved, true, 'كانت تُرفض مكررةً للبصمة القديمة');
  const rec = await tabs.store.getVideo(ID);
  assert.equal(rec.fingerprints.length, 2);
  const fresh = rec.fingerprints.find((f) => f.id !== old.id);
  assert.deepEqual(fresh.cues.map((c) => c.startMs), englishAt(1500).cues.map((c) => c.startMs), 'البصمة بتوقيت الملف الذي نزل');

  // المستخدم يترجم الملف الذي نزل (توقيت T2) ويرفعه.
  const arabic = writeSrt(englishAt(1500).cues.map((c) => ({ ...c, text: `ترجمة ${c.n}` })));
  const prep = await prepareUpload({ store: tabs.store, videoId: ID, files: [new File([arabic], `${ID}.ar.srt`, { type: 'text/plain' })] });
  assert.equal(prep.result.ok, true);
  assert.equal(prep.result.fingerprintId, fresh.id, 'المقارنة بالبصمة الجديدة');
  assert.deepEqual(prep.result.comparison.drift, [], 'لا انحراف وهمي');
  assert.equal(prep.result.comparison.matched, true);
  assert.equal(prep.review.suggested, fresh.id);
  assert.equal(prep.review.certain, true);
  await applyUpload({ store: tabs.store, bundle: prep.bundle, settings: prep.settings, result: prep.result, n: 1, fingerprintId: prep.review.suggested, now: tabs.now });
  const saved = (await tabs.store.getVideo(ID)).arabic;
  assert.equal(saved.fingerprintId, fresh.id);
  assert.deepEqual([saved.comparison.matched, saved.comparison.drift.length], [true, 0]);

  // وتصدير ثانٍ بالتوقيت نفسه تكرار حقًا: لا بصمة ثالثة.
  const again = await exportEnglish({ store: tabs.store, videoId: ID, trackKey: 'en|manual', save: async () => ({ ok: true, mode: 'downloads', downloadId: 2 }), now: tabs.now });
  assert.equal(again.fingerprintSaved, false);
  assert.equal((await tabs.store.getVideo(ID)).fingerprints.length, 2);
});

test('المقارنة بالبصمة القديمة وحدها (السلوك قبل الإصلاح) تُظهر انحرافًا لكل المقاطع: هذا ما يمنعه حفظ البصمة الجديدة', async () => {
  const old = buildExport({ videoId: ID, track: englishAt(0), mode: 'normal', now: Date.parse(NOW) }).fingerprint;
  const arabic = writeSrt(englishAt(1500).cues.map((c) => ({ ...c, text: `ترجمة ${c.n}` })));
  const r = await readImport([new File([arabic], `${ID}.ar.srt`)], { fingerprints: [old] });
  assert.equal(r.comparison.drift.length, 5);
});
