// التدقيق الموحد V2، WG-3 (U-021 وU-022 وU-023 وU-018 في النسخة): الاستعادة تحسب خلاصة الأقسام الثلاثة (الإعدادات والقاموس
// واللغات) فلا تعلن نجاحًا وفشل اللغات مستمر، وفشل اللغات وحدها برمزها، ومعاينة السجل التالف تحمل بصمته فلا تطمس إصلاحًا لاحقًا،
// وترتيب أزواج الفيديوهات يُحفظ في النسخة ويُستعاد.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createBackup, mergeReports, planRestore, readBackup, reportCode, restoreItems, retryItems, retrySettings, runRestore, settingsFailureCode, sha256Hex,
} from '../../../src/core/backup/index.js';
import { TjError, messageFor } from '../../../src/core/errors/index.js';
import { videoKey } from '../../../src/core/store/keys.js';
import { createStore } from '../../../src/core/store/index.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { NOW } from '../../helpers/fixtures.js';
import { samplePrefs, sampleBundle, seedBundle } from '../../helpers/fixtures-v2.js';

const noPause = () => Promise.resolve();
const ID = 'AAAAAAAAAAA';
const asFile = (text) => ({ size: text.length, text: async () => text });
function newStore(opts = {}) {
  let t = Date.parse(NOW);
  const area = createMemoryArea({ unlimited: true, ...opts });
  return { area, store: createStore({ area, now: () => (t += 1000) }) };
}

/** مخزن يفشل setLangPrefs فيه أول failLang مرة، ووعدّاد كتابات كل قسم. */
function faulty(failLang) {
  const { store } = newStore();
  const calls = { settings: 0, prefs: 0, lang: 0 };
  const f = Object.create(store);
  f.setSettings = (p) => { calls.settings++; return store.setSettings(p); };
  f.setPrefs = (p) => { calls.prefs++; return store.setPrefs(p); };
  f.setLangPrefs = (p) => { calls.lang++; return calls.lang <= failLang ? Promise.reject(new TjError('ST_WRITE_FAILED')) : store.setLangPrefs(p); };
  return { store, f, calls };
}
const LANG = { pair: { from: 'ja', to: 'en' }, remember: false, recent: ['ja'], videos: { [ID]: { from: 'ja', to: 'en' } }, order: [ID], schema: 1 };

test('AV2 U-021: فشل اللغات وحدها يبقي الخلاصة failed عبر إعادة المحاولة، ونجاحها بعدها يعطي restored ولا يعيد كتابة القسمين', async () => {
  const { store, f, calls } = faulty(2);
  const chosen = { settings: { offsetStepMs: 1000 }, prefs: { glossary: samplePrefs().glossary }, langPrefs: LANG };
  const first = await runRestore({ store: f, items: [], ...chosen, pause: noPause });
  assert.deepEqual(first.parts, { settings: 'restored', prefs: 'restored', langPrefs: 'failed', glossaries: null });
  assert.equal(first.settings, 'failed');
  const again = retrySettings(first, chosen);
  assert.deepEqual(again, { settings: null, prefs: null, langPrefs: LANG, glossaries: null });
  const retry = await runRestore({ store: f, items: [], ...again, pause: noPause });
  const merged = mergeReports(first, retry);
  assert.equal(merged.settings, 'failed', 'اللغات ما زالت متعذرة');
  assert.equal(merged.parts.langPrefs, 'failed');
  assert.equal(reportCode(merged), 'BK_RESTORE_PARTIAL');
  assert.equal(settingsFailureCode(merged), 'BK_RESTORE_LANGS_PART_FAILED');
  const third = await runRestore({ store: f, items: [], ...retrySettings(merged, chosen), pause: noPause });
  const done = mergeReports(merged, third);
  assert.equal(done.settings, 'restored');
  assert.equal(done.settingsCode, null);
  assert.equal(reportCode(done), 'BK_RESTORE_DONE');
  assert.deepEqual([calls.settings, calls.prefs, calls.lang], [1, 1, 3], 'الإعدادات والقاموس كُتبا مرة واحدة');
  assert.deepEqual((await store.getLangPrefs()).pair, { from: 'ja', to: 'en' });
});

test('AV2 U-022: رمز لفشل اللغات وحدها ورسالته، ومعالجة التركيبات مع القسمين الآخرين', () => {
  const r = (settings, prefs, langPrefs) => ({ settings: [settings, prefs, langPrefs].includes('failed') ? 'failed' : 'restored', parts: { settings, prefs, langPrefs } });
  assert.equal(settingsFailureCode(r('restored', 'restored', 'failed')), 'BK_RESTORE_LANGS_PART_FAILED');
  assert.equal(settingsFailureCode(r(null, null, 'failed')), 'BK_RESTORE_LANGS_PART_FAILED');
  assert.equal(settingsFailureCode(r('failed', 'restored', 'restored')), 'BK_RESTORE_SETTINGS_PART_FAILED');
  assert.equal(settingsFailureCode(r('restored', 'failed', null)), 'BK_RESTORE_PREFS_PART_FAILED');
  assert.equal(settingsFailureCode(r('failed', 'restored', 'failed')), 'BK_RESTORE_SETTINGS_LANGS_FAILED');
  assert.equal(settingsFailureCode(r('failed', 'failed', 'failed')), 'BK_RESTORE_SETTINGS_LANGS_FAILED');
  assert.equal(settingsFailureCode(r('failed', 'failed', null)), 'BK_RESTORE_SETTINGS_FAILED');
  assert.match(messageFor('BK_RESTORE_SETTINGS_LANGS_FAILED'), /اللغات/);
  assert.equal(settingsFailureCode(r('restored', 'restored', 'restored')), null);
  const text = messageFor('BK_RESTORE_LANGS_PART_FAILED');
  assert.match(text, /اللغات/);
  assert.doesNotMatch(text, /^تعذّرت استعادة الإعدادات والقاموس/);
});

test('AV2 U-023: معاينة سجل تالف تحمل بصمته، فإصلاحه من سياق آخر قبل التأكيد يُبقى ويُعدّ changed', async () => {
  const { area, store } = newStore();
  const other = createStore({ area, now: () => Date.parse(NOW) + 5e6 });
  const mkBackup = async (title) => {
    const s = newStore().store;
    const b = sampleBundle({ videoId: ID });
    b.record.title = title;
    await seedBundle(s, b);
    return readBackup(asFile((await createBackup({ store: s, appVersion: '2.0.0', pause: noPause })).text), { pause: noPause });
  };
  const OLD = await mkBackup('نسخة قديمة');
  const NEW = await mkBackup('إصلاح أحدث');
  await store.listIndex();
  area.rawSet(videoKey(ID), { damaged: true });
  await area.flush();
  const prints = new Map([[ID, await store.rawPrint(ID)]]);
  const plan = planRestore(OLD, (await store.unreadableVideos()), new Map(), prints);
  assert.equal(plan.existing.length, 1);
  assert.deepEqual(plan.existing[0].expect, { print: prints.get(ID) });
  const { items } = restoreItems(plan, 'all');
  // سياق آخر يُصلح السجل قبل التأكيد.
  const fix = restoreItems(planRestore(NEW, await other.unreadableVideos(), new Map()), 'all');
  assert.equal((await runRestore({ store: other, ...fix, pause: noPause })).replaced.length, 1);
  await area.flush();
  const report = await runRestore({ store, items, pause: noPause });
  assert.deepEqual([report.replaced.length, report.changed.length], [0, 1]);
  assert.equal((await store.getVideo(ID)).title, 'إصلاح أحدث');
  assert.equal(reportCode(report), 'BK_RESTORE_PARTIAL');
  void retryItems;
});

test('AV2 U-023: الكاتب نفسه يقارن البصمة داخل طابوره، وبقاء السجل تالفًا حتى التأكيد يُستبدل كما الآن', async () => {
  const { area, store } = newStore();
  const s = newStore().store;
  await seedBundle(s, sampleBundle({ videoId: ID }));
  const backup = await readBackup(asFile((await createBackup({ store: s, appVersion: '2.0.0', pause: noPause })).text), { pause: noPause });
  await store.listIndex();
  area.rawSet(videoKey(ID), { damaged: true });
  await area.flush();
  const print = await store.rawPrint(ID);
  // بصمة قديمة تُرفض في الكاتب ولو مرّت قراءة السياق: التغيير بين القراءة والكتابة.
  const entry = backup.videos[0].entry;
  assert.deepEqual(await store.restoreVideo(entry, { replace: true, expect: { print: `${print}x` } }), { status: 'changed' });
  assert.deepEqual(await store.restoreVideo(entry, { replace: true, expect: { print } }), { status: 'replaced' });
});

test('AV2 U-018: النسخة تحمل ترتيب أزواج الفيديوهات وتستعيده بالأحدث آخرًا على مخزن بترتيب Chromium', async () => {
  const src = newStore({ chromiumKeyOrder: true });
  await src.store.setLangPrefs({ video: { videoId: 'ZZZZZZZZZZZ', pair: { from: 'ja', to: 'ar' } } });
  await src.store.setLangPrefs({ video: { videoId: 'AAAAAAAAAAA', pair: { from: 'fr', to: 'ar' } } });
  const built = await createBackup({ store: src.store, appVersion: '2.0.0', pause: noPause });
  const read = await readBackup(asFile(built.text), { pause: noPause });
  assert.deepEqual(read.langPrefs.order, ['ZZZZZZZZZZZ', 'AAAAAAAAAAA']);
  const dst = newStore({ chromiumKeyOrder: true });
  await runRestore({ store: dst.store, items: [], langPrefs: read.langPrefs, pause: noPause });
  assert.deepEqual((await dst.store.getLangPrefs()).order, ['ZZZZZZZZZZZ', 'AAAAAAAAAAA']);
  // نسخة قديمة بلا order لا تُرفض: تُطبَّع.
  const old = JSON.parse(built.text);
  delete old.data.langPrefs.order;
  old.integrity.hash = await sha256Hex(JSON.stringify(old.data));
  const readOld = await readBackup(asFile(JSON.stringify(old)), { pause: noPause });
  assert.equal(readOld.ok, true);
  assert.deepEqual(readOld.langPrefs.order, Object.keys(old.data.langPrefs.videos));
});
