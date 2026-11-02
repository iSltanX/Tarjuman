// وحدة النسخة الاحتياطية (P13-AC4/AC5، عقد backup.md): ذهاب وإياب بين مكتبتين، والتالف بأنواعه قبل أي كتابة، والأحدث
// إصدارًا، والتخطي افتراضيًا والاستبدال باختيار صريح، والفشل الجزئي المصطنع وإعادة المحاولة دون تكرار، وامتلاء المساحة،
// والاستبعاد الجزئي للإعدادات والفيديو التالف، والمكتبة الكبيرة بتقدم ظاهر، وخلو التشخيص واسم الملف من المحتوى.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BACKUP_LIMITS, backupFileName, countData, createBackup, mergeReports, planRestore, readBackup, reportCode, restoreDiagnostics,
  restoreItems, retryItems, runRestore, sha256Hex,
} from '../../../src/core/backup/index.js';
import { TjError } from '../../../src/core/errors/index.js';
import { createStore } from '../../../src/core/store/index.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { NOW, makeCues, videoRecord } from '../../helpers/fixtures.js';
import { arabicTrack, markOn, samplePrefs, sampleBundle, seedBundle } from '../../helpers/fixtures-v2.js';

const IDS = ['AAAAAAAAAAA', 'BBBBBBBBBBB', 'CCCCCCCCCCC'];
const noPause = () => Promise.resolve();

function newStore(opts = { unlimited: true }) {
  let t = Date.parse(NOW);
  const area = createMemoryArea(opts);
  return { area, store: createStore({ area, now: () => (t += 1000) }) };
}

/** مكتبة مصدر: حزمة كاملة بثلاث ترجمات وسابقة وعلامات، وسجل من الإصدار الأول، وسجل بلا عربية؛ وإعدادات وتفضيلات معدّلة. */
async function sourceLibrary() {
  const { area, store } = newStore();
  await seedBundle(store, sampleBundle({ videoId: IDS[0], third: true }));
  await store.updateVideo(IDS[1], () => ({ ...videoRecord({ videoId: IDS[1], offset: 300 }), title: 'محاضرة عن النماذج' }));
  await store.updateVideo(IDS[2], () => videoRecord({ videoId: IDS[2], arabic: false }));
  await store.setSettings({ offsetStepMs: 1000, appearance: { scale: 120 } });
  await store.setPrefs(samplePrefs({ mode: 'ask' }));
  await area.flush();
  return { area, store };
}

const withoutRev = (b) => (b ? { ...b, record: { ...b.record, rev: 0 } } : b);

/** يعيد بناء ملف بعد تعديل data مع إعادة حساب البصمة والأعداد (ملف «سليم» الترويسة بمحتوى معطوب). */
async function reseal(text, mutate) {
  const file = JSON.parse(text);
  mutate(file);
  file.counts = countData(file.data);
  file.integrity.hash = await sha256Hex(JSON.stringify(file.data));
  return JSON.stringify(file);
}

test('الإنشاء: اسم بتاريخ UTC بلا عنوان، وترويسة بالمفاتيح بالضبط، وبصمة تطابق data، وأعداد صحيحة، والأقدم أولًا', async () => {
  const { store } = await sourceLibrary();
  const built = await createBackup({ store, appVersion: '0.3.0', now: () => Date.parse('2026-11-02T23:30:00.000Z'), pause: noPause });
  assert.equal(built.name, 'tarjuman-backup-2026-11-02.json');
  assert.equal(backupFileName('2027-01-05T00:00:00.000Z'), 'tarjuman-backup-2027-01-05.json');
  assert.doesNotMatch(built.name, /محاضرة|عنوان/);
  const file = JSON.parse(built.text);
  assert.deepEqual(Object.keys(file), ['format', 'version', 'createdAt', 'app', 'options', 'counts', 'integrity', 'data']);
  assert.equal(file.format, 'tarjuman-backup');
  assert.equal(file.version, 1);
  assert.deepEqual(file.app, { version: '0.3.0', storageSchema: 1 });
  assert.deepEqual(file.options, { previous: true });
  assert.equal(file.integrity.algorithm, 'SHA-256');
  assert.equal(file.integrity.hash, await sha256Hex(JSON.stringify(file.data)));
  // 3 فيديوهات: الأول بثلاث ترجمات وسابقة و3 علامات، والثاني بترجمة، والثالث بلا ترجمة.
  assert.deepEqual(file.counts, { videos: 3, translations: 4, previous: 1, marks: 3, settings: true, prefs: true });
  assert.deepEqual(built.counts, file.counts);
  assert.deepEqual(built.skipped, []);
  assert.deepEqual(Object.keys(file.data.videos[0]), ['record', 'active', 'names', 'alts', 'previous', 'marks']);
  const created = file.data.videos.map((v) => v.record.createdAt);
  assert.deepEqual(created, [...created].sort());
});

test('ذهاب وإياب: مكتبة فارغة تستعيد كل شيء كما كان (الحزم والتواريخ)، والإعدادات والقاموس عند اختيارهما وحده', async () => {
  const src = await sourceLibrary();
  const built = await createBackup({ store: src.store, appVersion: '0.3.0', pause: noPause });
  const { store } = newStore();
  const read = await readBackup(built.text, { pause: noPause });
  assert.equal(read.ok, true);
  assert.deepEqual(read.invalid, []);
  assert.deepEqual(read.warnings, []);
  const plan = planRestore(read, []);
  assert.equal(plan.fresh.length, 3);
  assert.equal(plan.existing.length, 0);
  assert.equal(plan.counts.translations, 4);
  assert.equal(plan.hasSettings, true);

  // دون اختيار الإعدادات: تبقى افتراضية.
  const { items, skipped } = restoreItems(plan, new Set());
  const report = await runRestore({ store, items, skipped, pause: noPause });
  assert.deepEqual(report.added.sort(), [...IDS].sort());
  assert.equal(reportCode(report), 'BK_RESTORE_DONE');
  assert.equal(report.settings, null);
  assert.equal((await store.getSettings()).offsetStepMs, 500);
  for (const id of IDS) {
    const a = await src.store.getBundle(id);
    const b = await store.getBundle(id);
    assert.deepEqual(withoutRev(b), withoutRev(a), id);
    assert.equal(b.record.createdAt, a.record.createdAt);
    assert.equal(b.record.updatedAt, a.record.updatedAt);
    assert.equal(b.record.rev, 1, 'rev = 1 لفيديو جديد');
  }

  // استعادة الإعدادات والقاموس باختيار صريح.
  const again = await runRestore({ store, items: [], settings: read.settings.patch, prefs: read.prefs.patch, pause: noPause });
  assert.equal(again.settings, 'restored');
  assert.equal((await store.getSettings()).offsetStepMs, 1000);
  assert.equal((await store.getSettings()).appearance.scale, 120);
  assert.deepEqual(await store.getPrefs(), samplePrefs({ mode: 'ask' }));
});

test('دون النسخ السابقة: options.previous=false، وكل previous null، والعدد صفر', async () => {
  const { store } = await sourceLibrary();
  const built = await createBackup({ store, appVersion: '0.3.0', includePrevious: false, pause: noPause });
  const file = JSON.parse(built.text);
  assert.deepEqual(file.options, { previous: false });
  assert.equal(file.counts.previous, 0);
  assert.ok(file.data.videos.every((v) => v.previous === null));
  const read = await readBackup(built.text, { pause: noPause });
  assert.equal(read.ok, true);
});

test('التالف يُرفض كله قبل أي كتابة: JSON، والصيغة، والمفاتيح، والبصمة، والأعداد، والسابقة المخالفة للخيار', async () => {
  const { store } = await sourceLibrary();
  const { text } = await createBackup({ store, appVersion: '0.3.0', pause: noPause });
  const code = async (t) => (await readBackup(t, { pause: noPause })).code;
  assert.equal(await code('{ليس json'), 'BK_NOT_BACKUP');
  assert.equal(await code('[]'), 'BK_NOT_BACKUP');
  assert.equal(await code(JSON.stringify({ ...JSON.parse(text), format: 'other' })), 'BK_NOT_BACKUP');
  assert.equal(await code(JSON.stringify({ ...JSON.parse(text), version: '1' })), 'BK_NOT_BACKUP');
  assert.equal(await code(JSON.stringify({ ...JSON.parse(text), extra: 1 })), 'BK_NOT_BACKUP');
  const noCounts = JSON.parse(text);
  delete noCounts.counts.marks;
  assert.equal(await code(JSON.stringify(noCounts)), 'BK_NOT_BACKUP');
  // تغيير محرف واحد داخل data يكشفه الفحص.
  const tampered = text.replace('"offsetStepMs":1000', '"offsetStepMs":2000');
  assert.notEqual(tampered, text);
  assert.equal(await code(tampered), 'BK_INTEGRITY');
  // الأعداد لا تطابق data.
  const counts = JSON.parse(text);
  counts.counts.marks += 1;
  assert.equal(await code(JSON.stringify(counts)), 'BK_INTEGRITY');
  // options.previous=false مع سابقة.
  const opt = JSON.parse(text);
  opt.options.previous = false;
  assert.equal(await code(JSON.stringify(opt)), 'BK_INTEGRITY');
  // المسافات خارج data لا تهم.
  assert.equal((await readBackup(JSON.stringify(JSON.parse(text), null, 2), { pause: noPause })).ok, true);
});

test('الأحدث إصدارًا يُرفض كله ولو تغيّرت مفاتيحه، والحجم فوق الحد يُرفض دون قراءة، وتعذّر القراءة برمزه', async () => {
  const { store } = await sourceLibrary();
  const { text } = await createBackup({ store, appVersion: '0.3.0', pause: noPause });
  const newer = { ...JSON.parse(text), version: 2, newSection: {} };
  const r = await readBackup(JSON.stringify(newer), { pause: noPause });
  assert.equal(r.code, 'BK_VERSION_NEWER');
  assert.match(r.code && new TjError(r.code).message, /حدّث ترجمان/);

  let read = false;
  const huge = { size: BACKUP_LIMITS.maxBytes + 1, text: async () => { read = true; return text; } };
  const big = await readBackup(huge);
  assert.equal(big.code, 'BK_TOO_LARGE');
  assert.equal(big.params.max, '512 م.ب');
  assert.equal(read, false, 'لا يُقرأ الملف الكبير');
  const broken = await readBackup({ size: 10, text: async () => { throw new DOMException('x', 'NotReadableError'); } });
  assert.equal(broken.code, 'BK_READ_FAILED');
  const ok = await readBackup({ size: text.length, text: async () => text }, { pause: noPause });
  assert.equal(ok.ok, true);
});

test('فشل جزئي صادق: فيديو تالف أو مكرر يُستبعد وحده بسببه، والباقي يمضي؛ ومجموعة إعدادات تالفة تُستبعد وحدها', async () => {
  const { store } = await sourceLibrary();
  const { text } = await createBackup({ store, appVersion: '0.3.0', pause: noPause });
  const sealed = await reseal(text, (f) => {
    f.data.videos[1].record.view.displayOffsetMs = 150; // ليست من مضاعفات 100
    f.data.videos.push(structuredClone(f.data.videos[2]));
    f.data.settings.appearance.scale = 999;
    f.data.prefs.saveLocation.folder = 'a/b';
  });
  const r = await readBackup(sealed, { pause: noPause });
  assert.equal(r.ok, true);
  assert.deepEqual(r.videos.map((v) => v.videoId), [JSON.parse(text).data.videos[0].record.videoId]);
  assert.deepEqual(r.invalid.map((x) => [x.index, x.code]), [[1, 'BK_VIDEO_INVALID'], [2, 'BK_VIDEO_DUPLICATE'], [3, 'BK_VIDEO_DUPLICATE']]);
  assert.ok(r.invalid[0].videoId, 'المعرّف الصالح يظهر مع التالف');
  assert.doesNotMatch(r.invalid[0].detail, /أولى|ثانية|سطر/, 'السبب مسار لا نص');
  assert.deepEqual(r.warnings, [{ code: 'BK_SETTINGS_INVALID', params: { groups: 'settings.appearance، prefs.saveLocation' } }]);
  assert.deepEqual(Object.keys(r.settings.patch), ['offsetStepMs', 'displayModeDefault', 'export', 'thresholds']);
  assert.deepEqual(Object.keys(r.prefs.patch), ['glossary', 'review']);
  // الاستعادة بالمجموعات الصالحة: المستبعدة تبقى قيمتها الحالية.
  const target = newStore().store;
  await target.setSettings({ appearance: { scale: 90 } });
  await runRestore({ store: target, items: [], settings: r.settings.patch, prefs: r.prefs.patch, pause: noPause });
  assert.equal((await target.getSettings()).appearance.scale, 90);
  assert.equal((await target.getSettings()).offsetStepMs, 1000);
  assert.equal((await target.getPrefs()).saveLocation.mode, 'downloads');
  assert.equal((await target.getPrefs()).glossary.terms.length, 3);
});

test('سجل ناقص الشكل في ملف مختوم (بلا view، أو fingerprints تالفة، أو arabic ليس كائنًا) يُستبعد وحده ولا يرمي', async () => {
  const { store } = await sourceLibrary();
  const { text } = await createBackup({ store, appVersion: '0.3.0', pause: noPause });
  const mutations = [
    (r) => { delete r.view; },
    (r) => { r.view = null; },
    (r) => { r.fingerprints = [null]; },
    (r) => { r.fingerprints = 'x'; },
    (r) => { r.arabic = 7; },
    (r) => { r.english = [{}]; },
  ];
  for (const [i, mutate] of mutations.entries()) {
    const sealed = await reseal(text, (f) => mutate(f.data.videos[0].record));
    const r = await readBackup(sealed, { pause: noPause });
    assert.equal(r.ok, true, `#${i}`);
    assert.deepEqual(r.invalid.map((x) => [x.index, x.code]), [[0, 'BK_VIDEO_INVALID']], `#${i}`);
    assert.match(r.invalid[0].detail, /^entry\.record/, `#${i}`);
    assert.equal(r.videos.length, 2, `#${i}: الباقي يمضي`);
  }
  // عشوائي: حذف حقل أو إفساده في سجل واحد لا يرمي أبدًا.
  const keys = ['view', 'fingerprints', 'arabic', 'english', 'title', 'rev', 'createdAt'];
  for (let i = 0; i < 40; i++) {
    const sealed = await reseal(text, (f) => {
      const rec = f.data.videos[i % 3].record;
      rec[keys[i % keys.length]] = [null, 'x', 0, [], {}][i % 5];
    });
    const r = await readBackup(sealed, { pause: noPause });
    assert.equal(r.ok, true, `عشوائي #${i}`);
    assert.equal(r.videos.length + r.invalid.length, 3);
  }
});

test('الموجود يُتخطى افتراضيًا دون كتابة، ويُستبدل باختيار صريح لصف أو للكل؛ والجديد يُضاف', async () => {
  const src = await sourceLibrary();
  const read = await readBackup((await createBackup({ store: src.store, appVersion: '0.3.0', pause: noPause })).text, { pause: noPause });
  const { area, store } = newStore();
  // عمل أحدث في المكتبة الهدف للفيديو الثاني.
  await store.updateVideo(IDS[1], () => ({ ...videoRecord({ videoId: IDS[1], cues: makeCues(7) }), title: 'عمل أحدث' }));
  await area.flush();
  const before = JSON.stringify(area.dump());
  const plan = planRestore(read, (await store.listLibrary()).map((x) => x.entry.videoId));
  assert.deepEqual(plan.existing.map((v) => v.videoId), [IDS[1]]);
  assert.equal(plan.fresh.length, 2);

  // تخطٍّ افتراضي: الموجود لا يُمس، ويُحسب «تُخطّي».
  const def = restoreItems(plan, new Set());
  assert.deepEqual(def.skipped, [IDS[1]]);
  const r1 = await runRestore({ store, ...def, pause: noPause });
  assert.deepEqual(r1.skipped, [IDS[1]]);
  assert.equal((await store.getVideo(IDS[1])).title, 'عمل أحدث');
  assert.notEqual(JSON.stringify(area.dump()), before, 'أضيف الجديد');

  // حتى لو مُرِّر الموجود بلا استبدال، يتخطاه التخزين نفسه.
  const forced = await runRestore({ store, items: [{ videoId: IDS[1], entry: plan.existing[0].entry, replace: false }], pause: noPause });
  assert.deepEqual(forced.skipped, [IDS[1]]);
  assert.equal((await store.getVideo(IDS[1])).title, 'عمل أحدث');

  // استبدال صريح لذلك الصف.
  const one = restoreItems(plan, new Set([IDS[1]]));
  const r2 = await runRestore({ store, items: one.items.filter((x) => x.replace), pause: noPause });
  assert.deepEqual(r2.replaced, [IDS[1]]);
  assert.equal((await store.getVideo(IDS[1])).title, 'محاضرة عن النماذج');
  assert.deepEqual(restoreItems(plan, 'all').items.filter((x) => x.replace).map((x) => x.videoId), [IDS[1]]);
});

/** تخزين يرمي خطأً مصطنعًا عند فيديو بعينه حتى يُشفى. */
function faulty(store, { failOn, code }) {
  const state = { broken: true, calls: 0 };
  return {
    state,
    store: {
      ...store,
      restoreVideo(entry, opts) {
        state.calls += 1;
        if (state.broken && failOn.includes(entry.record.videoId)) return Promise.reject(new TjError(code));
        return store.restoreVideo(entry, opts);
      },
    },
  };
}

test('فشل جزئي مصطنع في المنتصف: يُبلَّغ بما كُتب وما لم يُكتب، وإعادة المحاولة تكمل ما تعذّر وحده دون تكرار', async () => {
  const src = await sourceLibrary();
  const read = await readBackup((await createBackup({ store: src.store, appVersion: '0.3.0', pause: noPause })).text, { pause: noPause });
  const { store } = newStore();
  const middle = read.videos[1].videoId;
  const f = faulty(store, { failOn: [middle], code: 'ST_WRITE_FAILED' });
  const { items } = restoreItems(planRestore(read, []), new Set());
  const progress = [];
  const r = await runRestore({ store: f.store, items, pause: noPause, batch: 1, onProgress: (p) => progress.push(p.done) });
  assert.deepEqual(r.added, [read.videos[0].videoId, read.videos[2].videoId]);
  assert.deepEqual(r.failed.map((x) => [x.videoId, x.code]), [[middle, 'ST_WRITE_FAILED']]);
  assert.equal(r.stopped, false);
  assert.equal(reportCode(r), 'BK_RESTORE_PARTIAL');
  assert.deepEqual(progress, [0, 1, 2, 3]);
  assert.equal(await store.getVideo(middle), null, 'لا كتابة نصفية للفيديو المتعذّر');

  f.state.broken = false;
  const again = retryItems(r, items);
  assert.deepEqual(again.map((x) => x.videoId), [middle]);
  const calls = f.state.calls;
  const r2 = await runRestore({ store: f.store, items: again, pause: noPause });
  assert.equal(f.state.calls - calls, 1, 'لا تكرار لما كُتب');
  const merged = mergeReports(r, r2);
  assert.deepEqual(merged.added.sort(), [...IDS].sort());
  assert.deepEqual(merged.failed, []);
  assert.equal(reportCode(merged), 'BK_RESTORE_DONE');

  // تشغيل الاستعادة كلها مرة أخرى لا يكرر: كل شيء موجود فيُتخطى.
  const rerun = await runRestore({ store, items: restoreItems(planRestore(read, IDS), new Set()).items, skipped: IDS, pause: noPause });
  assert.deepEqual(rerun.added, []);
});

test('امتلاء المساحة يوقف الاستعادة ويبلّغ بما كُتب وما بقي، وإعادة المحاولة بعد تحرير المساحة تكمل', async () => {
  const src = await sourceLibrary();
  const read = await readBackup((await createBackup({ store: src.store, appVersion: '0.3.0', pause: noPause })).text, { pause: noPause });
  const { store } = newStore();
  const f = faulty(store, { failOn: [read.videos[1].videoId], code: 'ST_QUOTA_EXCEEDED' });
  const { items } = restoreItems(planRestore(read, []), new Set());
  const r = await runRestore({ store: f.store, items, pause: noPause });
  assert.equal(r.stopped, true);
  assert.deepEqual(r.added, [read.videos[0].videoId]);
  assert.deepEqual(r.remaining, [read.videos[1].videoId, read.videos[2].videoId]);
  assert.equal(reportCode(r), 'BK_RESTORE_STOPPED');
  f.state.broken = false;
  const merged = mergeReports(r, await runRestore({ store: f.store, items: retryItems(r, items), pause: noPause }));
  assert.equal(merged.added.length, 3);
  assert.equal(merged.stopped, false);
});

test('فشل الإعدادات لا يوقف الفيديوهات ويُبلَّغ وحده', async () => {
  const src = await sourceLibrary();
  const read = await readBackup((await createBackup({ store: src.store, appVersion: '0.3.0', pause: noPause })).text, { pause: noPause });
  const { area, store } = newStore();
  await store.getSettings();
  area.failNext('set', new Error('disk'));
  const r = await runRestore({ store, items: restoreItems(planRestore(read, []), new Set()).items, settings: read.settings.patch, prefs: read.prefs.patch, pause: noPause });
  assert.equal(r.settings, 'failed');
  assert.equal(r.settingsCode, 'ST_WRITE_FAILED');
  assert.equal(r.added.length, 3);
  assert.equal(reportCode(r), 'BK_RESTORE_PARTIAL');
});

test('التشخيص أعداد ورموز وحدها: لا معرّف ولا عنوان ولا نص ولا اسم ملف', async () => {
  const src = await sourceLibrary();
  const read = await readBackup((await createBackup({ store: src.store, appVersion: '0.3.0', pause: noPause })).text, { pause: noPause });
  const { store } = newStore();
  const f = faulty(store, { failOn: [IDS[1]], code: 'ST_WRITE_FAILED' });
  const r = await runRestore({ store: f.store, items: restoreItems(planRestore(read, []), new Set()).items, pause: noPause });
  const diag = JSON.stringify(restoreDiagnostics(r));
  for (const probe of [...IDS, 'محاضرة', 'أولى', 'سطر', '.srt']) assert.ok(!diag.includes(probe), probe);
  assert.deepEqual(JSON.parse(diag).codes, { ST_WRITE_FAILED: 1 });
});

test('مكتبة كبيرة: 300 فيديو بثلاث ترجمات تُنشأ وتُقرأ وتُستعاد بتقدم ظاهر ودفعات واستراحات', async () => {
  const { store } = newStore();
  const N = 300;
  const id = (i) => `V${String(i).padStart(10, '0')}`;
  for (let i = 0; i < N; i++) {
    const b = sampleBundle({ videoId: id(i), third: true });
    const long = arabicTrack({ label: `ف${i}`, count: 200 });
    b.slots[2] = { n: 3, name: null, track: long, offsetMs: 0, marks: [markOn(long.original[5])], position: null };
    await seedBundle(store, b);
  }
  const started = Date.now();
  const steps = [];
  let pauses = 0;
  const pause = () => { pauses += 1; return Promise.resolve(); };
  const built = await createBackup({ store, appVersion: '0.3.0', pause, onProgress: (p) => steps.push(['create', p.done, p.total]) });
  assert.equal(built.counts.videos, N);
  assert.equal(built.counts.translations, 3 * N);
  const read = await readBackup(built.text, { pause, onProgress: (p) => steps.push(['read', p.done, p.total]) });
  assert.equal(read.ok, true);
  const target = newStore().store;
  const r = await runRestore({ store: target, items: restoreItems(planRestore(read, []), new Set()).items, pause, onProgress: (p) => steps.push(['run', p.done, p.total]) });
  assert.equal(r.added.length, N);
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 60000, `استغرق ${elapsed}ms`);
  for (const phase of ['create', 'read', 'run']) {
    const done = steps.filter((s) => s[0] === phase).map((s) => s[1]);
    assert.ok(done.length >= N / BACKUP_LIMITS.batch, `${phase}: تقدم على دفعات`);
    assert.deepEqual(done, [...done].sort((a, b) => a - b), `${phase}: تقدم متزايد`);
    assert.equal(done.at(-1), N);
  }
  assert.ok(pauses >= 3 * (N / BACKUP_LIMITS.batch), 'استراحات للصفحة بين الدفعات');
  assert.deepEqual(withoutRev(await target.getBundle(id(N - 1))), withoutRev(await store.getBundle(id(N - 1))));
});

test('سجل تالف في المكتبة لا يوقف الإنشاء ويُبلَّغ برمزه', async () => {
  const { area, store } = await sourceLibrary();
  area.rawSet(`video:${IDS[1]}`, { schema: 1, videoId: IDS[1], broken: true });
  const built = await createBackup({ store, appVersion: '0.3.0', pause: noPause });
  assert.deepEqual(built.skipped, [{ videoId: IDS[1], code: 'ST_CORRUPT_RECORD' }]);
  assert.equal(built.counts.videos, 2);
  assert.equal((await readBackup(built.text, { pause: noPause })).ok, true);
});

test('تدقيق 5fedcb9 (GM-015.5): مجموعة صالحة بترتيب مفاتيح آخر تُقبل، ومصطلح مكرر واحد يسقط وحده لا القاموس كله', async () => {
  const { store } = await sourceLibrary();
  const { text } = await createBackup({ store, appVersion: '0.3.0', pause: noPause });
  const sealed = await reseal(text, (f) => {
    const loc = f.data.prefs.saveLocation;
    f.data.prefs.saveLocation = { folder: loc.folder, mode: loc.mode }; // ترتيب آخر لمفاتيح صالحة
    f.data.prefs.glossary.terms.push({ ...f.data.prefs.glossary.terms[0], target: 'نسخة مكررة' });
  });
  const r = await readBackup(sealed, { pause: noPause });
  assert.equal(r.ok, true);
  const original = JSON.parse(text).data.prefs;
  assert.deepEqual(r.prefs.patch.saveLocation, { folder: original.saveLocation.folder, mode: original.saveLocation.mode }, 'لا يُستبعد لترتيب مفاتيحه');
  assert.deepEqual(r.prefs.patch.glossary.terms, original.glossary.terms, 'يبقى القاموس بلا المكرر');
  assert.deepEqual(r.warnings, [{ code: 'BK_SETTINGS_INVALID', params: { groups: 'prefs.glossary (جزئيًا)' } }]);
});

test('تدقيق 5fedcb9 (GM-015.4): مدخل لا يطابق ثوابت الحزمة (اسم لخانة فارغة، أو مرجع بصمة غائبة) «تعذّر» بسببه لا يُطبَّع بصمت', async () => {
  const { store } = await sourceLibrary();
  const { text } = await createBackup({ store, appVersion: '0.3.0', pause: noPause });
  const empty = (f) => f.data.videos.findIndex((v) => v.alts.some((x, i) => x === null && v.active !== i + 1));
  const sealed = await reseal(text, (f) => {
    const v = f.data.videos[empty(f)];
    const slot = v.alts.findIndex((x, i) => x === null && v.active !== i + 1);
    v.names[slot] = 'اسم لخانة فارغة';
  });
  const r = await readBackup(sealed, { pause: noPause });
  assert.equal(r.ok, true);
  assert.ok(r.invalid.some((x) => x.code === 'BK_VIDEO_INVALID' && /entry\.names/.test(x.detail ?? '')), JSON.stringify(r.invalid));
  // ونسخة سليمة تمر كما هي (ذهاب وإياب).
  const fine = await readBackup(text, { pause: noPause });
  assert.deepEqual(fine.invalid, []);
});
