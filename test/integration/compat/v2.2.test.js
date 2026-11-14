// الترقية من 2.2.0 والرجوع إليه (تحقق 2.3.0 ص-٢٢؛ عقد storage §٧–§١٦) بلقطتين مجمّدتين من الإصدار المنشور (c04a606): لقطة تخزين
// كتبها كاتب 2.2.0 نفسه (library-2.2.0.json بمولّدها library-2.2.0.mjs)، ولقطة شيفرته (test/fixtures/v2.2). الترقية: الرأس يقرأ مكتبة
// 2.2.0 كما قرأها 2.2.0 نفسه، بلا كتابة. والرجوع: ما يكتبه الرأس فوقها يقرؤه 2.2.0 كما يقرؤه الرأس، والمفتاحان الجديدان (glossaries
// وdraft:<id>) لا يدخلان قراءته ولا أحداثه؛ وما يكتبه 2.2.0 بعد الرجوع يقرؤه الرأس، وقوائمه ومسودته باقية.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore as createStoreV22 } from '../../fixtures/v2.2/src/core/store/index.js';
import { parseKey as parseKeyV22 } from '../../fixtures/v2.2/src/core/store/keys.js';
import { withMark as withMarkV22 } from '../../fixtures/v2.2/src/core/model/bundle.js';
import { createBackup as createBackupV22 } from '../../fixtures/v2.2/src/core/backup/create.js';
import { readBackup as readBackupV22 } from '../../fixtures/v2.2/src/core/backup/read.js';
import { createStore } from '../../../src/core/store/index.js';
import { parseKey } from '../../../src/core/store/keys.js';
import { withMark, withSlotEdit, withSlotUpload } from '../../../src/core/model/bundle.js';
import { classifyDraft, draftOf } from '../../../src/core/model/draft.js';
import { createBackup } from '../../../src/core/backup/create.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { COMMIT_2_2_0, IDS, writeLibrary22 } from './library-2.2.0.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SNAP = JSON.parse(await readFile(path.join(HERE, 'library-2.2.0.json'), 'utf8'));
const { full: A, single: B, source: C } = IDS;
const AT = '2026-11-14T09:00:00.000Z';
const clock = (start) => {
  let t = Date.parse(start);
  return () => (t += 1000);
};
const noPause = async () => {};
const kinds = (dump) => [...new Set(Object.keys(dump).map((k) => parseKey(k)?.kind ?? k))].sort();

/** مساحة بقيم 2.2.0 الخام كما كتبها، كملف التعريف بعد تحديث الإضافة. */
async function library() {
  const area = createMemoryArea({ unlimited: true });
  await area.set(structuredClone(SNAP.storage));
  await area.flush();
  return area;
}
const head = (area) => createStore({ area, now: clock(AT) });
const v22 = (area) => createStoreV22({ area, now: clock('2026-11-15T09:00:00.000Z') });

/** ما يقرؤه إصدارٌ من المكتبة، بشكل read في اللقطة. */
async function view(store) {
  return {
    settings: await store.getSettings(),
    prefs: await store.getPrefs(),
    langPrefs: await store.getLangPrefs(),
    uiLocale: await store.getUiLocale(),
    lastSave: await store.getLastSave(),
    unreadable: await store.unreadableVideos(),
    index: await store.listIndex(),
    library: await store.listLibrary(),
    bundles: Object.fromEntries(await Promise.all(Object.values(IDS).map(async (id) => [id, await store.getBundle(id)]))),
  };
}

/** استعمال 2.3.0 المعتاد فوق مكتبة 2.2.0: تحرير وعلامة ورفع بلغة ومسودتان وقائمة زوج وتفضيلات وإعدادات ولغة واجهة وحذف. */
async function use23(area) {
  const two = head(area);
  const at = (s) => new Date(Date.parse(AT) + s * 1000).toISOString();
  await two.updateBundle(A, (b) => withSlotEdit(b, 2, { cues: b.slots[1].track.original.map((c) => ({ ...c, text: `${c.text} (من 2.3.0)` })) }, at(1)));
  await two.updateBundle(A, (b) => withMark(b, 1, { index: 1, kind: 'todo' }, at(2)).bundle);
  await two.updateBundle(B, (b) => withSlotUpload(b, 2, {
    videoId: B, fileName: `${B}.de.srt`, cues: b.slots[0].track.original.map((c) => ({ ...c, text: `Zeile ${c.n}` })), comparison: null, fingerprintId: null, notes: [], lang: 'de',
  }, at(3)).bundle);
  for (const [id, n] of [[A, 1], [B, 1]]) {
    const slot = (await two.getBundle(id)).slots[n - 1];
    const cues = (slot.track.current ?? slot.track.original).map((c, i) => (i === 0 ? { ...c, text: 'مسودة لم تُحفظ' } : c));
    await two.setDraft(id, n, draftOf({ cues, offsetMs: slot.offsetMs, committedMs: 0 }, slot, at(4)));
  }
  await two.addGlossaryList({ from: 'ja', to: 'en' });
  await two.addListTerm({ from: 'ja', to: 'en' }, { source: '字幕', target: 'subtitles', note: null });
  await two.setPrefs({ ui: { panelOpen: false } });
  await two.addTerm({ source: 'cache', target: 'الذاكرة المؤقتة', note: null });
  await two.setSettings({ appearance: { scale: 130 } });
  await two.setLangPrefs({ video: { videoId: B, pair: { from: 'en', to: 'de' } } });
  await two.setUiLocale('ar');
  await two.setLastSave(43);
  await two.deleteVideo(C);
  await area.flush();
  return two;
}

test('اللقطة كتبتها شيفرة 2.2.0 نفسها: مولّدها على لقطة الشيفرة المجمّدة يعيد قيمها وقراءتها حرفيًا، وفيها كل مفتاح يكتبه 2.2.0', async () => {
  assert.equal(SNAP.version, '2.2.0');
  assert.equal(SNAP.commit, COMMIT_2_2_0);
  const again = await writeLibrary22(path.resolve(HERE, '../../fixtures/v2.2'));
  assert.deepEqual(again.storage, SNAP.storage, 'القيم الخام');
  assert.deepEqual(again.read, SNAP.read, 'قراءة 2.2.0');
  assert.deepEqual(kinds(SNAP.storage), ['alts', 'bundle', 'index', 'lang', 'langPrefs', 'marks', 'meta', 'prefs', 'prev', 'saves', 'settings', 'uiLocale', 'video']);
  assert.deepEqual(SNAP.read.unreadable, []);
  assert.deepEqual(Object.values(SNAP.read.bundles).map((b) => b.slots.filter((s) => s.track).length), [3, 1, 0]);
});

test('الترقية: الرأس يقرأ مكتبة 2.2.0 كما قرأها 2.2.0 نفسه، بلا كتابة ولا فقد؛ ولا قوائم ولا مسودات', async () => {
  const area = await library();
  const two = head(area);
  assert.deepEqual(await view(two), SNAP.read);
  assert.deepEqual(await two.getGlossaries(), { schema: 1, lists: [] });
  for (const id of Object.values(IDS)) assert.equal(await two.getDraft(id), null);
  await area.flush();
  assert.deepEqual(area.dump(), SNAP.storage, 'القراءة لا تكتب شيئًا ولا ترحيل');
  assert.equal(area.dump().meta.schema, 1);
});

test('الرجوع: ما يكتبه الرأس فوق مكتبة 2.2.0 يقرؤه 2.2.0 كما يقرؤه الرأس، بلا خطأ ولا كتابة؛ والجديد مفتاحان يتجاهلهما parseKey فيه', async () => {
  const area = await library();
  await use23(area);
  const dump = area.dump();
  const fresh = [...new Set(Object.keys(dump).filter((k) => parseKeyV22(k) === null))].sort();
  assert.deepEqual(fresh, ['draft:AAAAAAAAAAA', 'draft:BBBBBBBBBBB', 'glossaries'], 'لا مفتاح جديد غيرها');
  assert.equal(dump.meta.schema, 1);
  const old = v22(area);
  const seen = await view(old);
  assert.deepEqual(seen, await view(head(area)), '2.2.0 يرى ما يراه الرأس');
  assert.deepEqual(seen.unreadable, []);
  assert.equal(seen.bundles[C], null, 'المحذوف محذوف');
  assert.match(seen.bundles[A].slots[1].track.current[0].text, /من 2\.3\.0/);
  assert.equal(seen.bundles[A].slots[0].marks.length, 3);
  assert.equal(seen.bundles[B].slots[1].track.lang, 'de');
  assert.equal(seen.uiLocale.locale, 'ar');
  assert.deepEqual(seen.prefs.glossary.terms.map((t) => t.source), ['prompt', 'token', 'latency', 'cache']);
  await area.flush();
  assert.deepEqual(area.dump(), dump, 'قراءة 2.2.0 لا تكتب شيئًا');
  // ولا حدث عنده لكتابة مسودة أو قائمة وحدها.
  const events = [];
  const off = old.onChange((c) => events.push(c));
  const two = head(area);
  await two.setDraft(A, 3, draftOf({ cues: seen.bundles[A].slots[2].track.original, offsetMs: 300, committedMs: 0 }, seen.bundles[A].slots[2], AT));
  await two.addListTerm({ from: 'ja', to: 'en' }, { source: '動画', target: 'video', note: null });
  await area.flush();
  assert.equal(events.length, 0);
  off();
});

test('بعد الرجوع: ما يكتبه 2.2.0 يقرؤه الرأس كما هو، وقوائمه ومسودته باقية وتُستعاد، ومسودة فيديو حذفه 2.2.0 تُكنس', async () => {
  const area = await library();
  const two = await use23(area);
  const lists = await two.getGlossaries();
  const draftA = await two.getDraft(A);
  const old = v22(area);
  await old.updateBundle(A, (b) => withMarkV22(b, 2, { index: 0, kind: 'done' }, '2026-11-15T10:00:00.000Z').bundle);
  await old.setPrefs({ review: { maxCps: 20 } });
  await old.addTerm({ source: 'build', target: 'بناء', note: null });
  await old.setSettings({ offsetStepMs: 500 });
  await old.deleteVideo(B);
  await area.flush();
  assert.ok(area.dump()[`draft:${B}`], 'حذف 2.2.0 لا يعرف المفتاح فيبقى');
  const again = head(area);
  const seen = await view(again);
  assert.deepEqual(seen, await view(v22(area)), 'الرأس يرى ما كتبه 2.2.0');
  assert.deepEqual(seen.library.map((x) => x.entry.videoId), [A]);
  assert.equal(area.dump()[`draft:${B}`], undefined, 'كُنست مع فهرسة المحفوظات');
  assert.deepEqual(await again.getGlossaries(), lists, 'القوائم كما هي');
  assert.deepEqual(await again.getDraft(A), draftA, 'المسودة كما هي');
  assert.equal(classifyDraft(draftA.slots[0], seen.bundles[A].slots[0]).kind, 'same', 'وتُستعاد: كتابة 2.2.0 لم تمس خانتها');
  assert.equal(seen.prefs.review.maxCps, 20);
  assert.equal(seen.settings.offsetStepMs, 500);
  assert.equal(seen.settings.appearance.scale, 130);
});

test('مسح 2.2.0 الكامل يزيل القوائم والمسودات مع الباقي، والرأس يقرأ مكتبة فارغة', async () => {
  const area = await library();
  await use23(area);
  await v22(area).clearAll();
  const left = Object.keys(area.dump());
  assert.equal(left.some((k) => k === 'glossaries' || k.startsWith('draft:')), false);
  const two = head(area);
  assert.deepEqual(await two.listLibrary(), []);
  assert.deepEqual(await two.getGlossaries(), { schema: 1, lists: [] });
});

test('النسخة الاحتياطية: نسخة الرأس من مكتبة 2.2.0 كنسخة 2.2.0 نفسه بإصدارها وبياناتها، ويقرؤها قارئ 2.2.0', async () => {
  const area = await library();
  const now = () => Date.parse(AT);
  const ours = await createBackup({ store: head(area), appVersion: '2.3.0', now, pause: noPause });
  const theirs = await createBackupV22({ store: v22(area), appVersion: '2.3.0', now, pause: noPause });
  assert.equal(ours.text, theirs.text);
  const r = await readBackupV22(ours.text, { pause: noPause });
  assert.equal(r.ok, true);
});
