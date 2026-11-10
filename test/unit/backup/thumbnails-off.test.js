// تدقيق 7a66f91، U05 (قرار سلطان Q10، «الإطفاء وحده»): إطفاء «صور الفيديو في المحفوظات» يدخل النسخة ويُطبَّق عند استعادتها ولو
// لم تُختر الإعدادات، ولا تُشغَّل الصور بالاستعادة أبدًا، والنسخة الأقدم بلا الحقل (tj-v2: تفضيلات بلا ui) تُبقي قيمة الجهاز؛
// و«مسح كل البيانات» يُبقي الإطفاء.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countData, createBackup, planRestore, readBackup, restoreItems, runRestore, sha256Hex } from '../../../src/core/backup/index.js';
import { DEFAULT_PREFS } from '../../../src/core/model/prefs.js';
import { createStore } from '../../../src/core/store/index.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { videoRecord } from '../../helpers/fixtures.js';

const ID = 'V0000000001';
const pause = async () => {};

async function storeWith({ thumbnails, video = true } = {}) {
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now: () => Date.parse('2026-11-05T09:00:00.000Z') });
  if (video) await store.updateVideo(ID, () => videoRecord({ videoId: ID }));
  if (thumbnails !== undefined) await store.setPrefs({ ui: { thumbnails } });
  await area.flush();
  return { area, store };
}

async function backupOf(store) {
  return (await createBackup({ store, appVersion: '1.1.0', pause })).text;
}

/** نسخة بشكل tj-v2: تفضيلات بلا ui، ببصمتها وأعدادها من جديد. */
async function withoutUi(text) {
  const file = JSON.parse(text);
  delete file.data.prefs.ui;
  file.counts = countData(file.data);
  file.integrity.hash = await sha256Hex(JSON.stringify(file.data));
  return JSON.stringify(file);
}

async function restoreInto(store, text, { settings = false } = {}) {
  const read = await readBackup(text, { pause });
  assert.equal(read.ok, true);
  const plan = planRestore(read, (await store.listLibrary()).map((x) => x.entry.videoId));
  const { items, skipped } = restoreItems(plan, 'all');
  const report = await runRestore({
    store, items, skipped, pause,
    settings: settings ? read.settings?.patch ?? null : null, prefs: settings ? read.prefs?.patch ?? null : null,
    thumbnailsOff: read.thumbnailsOff,
  });
  return { read, report };
}

test('U05: النسخة تحمل الإطفاء، والاستعادة في ملف تعريف جديد تُبقيه مطفأً ولو لم تُختر الإعدادات', async () => {
  const src = await storeWith({ thumbnails: false });
  const text = await backupOf(src.store);
  const fresh = await storeWith({ video: false });
  // و2: الافتراضي صار «مطفأة»، فالجهاز الجديد هنا فعّلها بنفسه ليُرى أن الاستعادة تطفئها.
  await fresh.store.setPrefs({ ui: { thumbnails: true } });
  assert.equal((await fresh.store.getPrefs()).ui.thumbnails, true, 'مفعّلة على الجهاز الجديد');
  const { read, report } = await restoreInto(fresh.store, text);
  assert.equal(read.thumbnailsOff, true);
  assert.equal(report.thumbnails, 'off');
  assert.equal(report.settings, null, 'لم تُستعد الإعدادات، والإطفاء وحده طُبّق');
  const p = await fresh.store.getPrefs();
  assert.equal(p.ui.thumbnails, false);
  assert.equal(p.ui.panelEntry, true, 'بقية ui قيم الجهاز');
});

test('U05: نسخة بالصور مفعّلة لا تشغّلها على جهاز أطفأها (لا يُتجاوز رفض محلي)', async () => {
  const src = await storeWith({ thumbnails: true });
  const text = await backupOf(src.store);
  const local = await storeWith({ thumbnails: false, video: false });
  for (const settings of [false, true]) {
    const { read, report } = await restoreInto(local.store, text, { settings });
    assert.equal(read.thumbnailsOff, false);
    assert.equal(report.thumbnails, null);
    assert.equal((await local.store.getPrefs()).ui.thumbnails, false, `settings=${settings}`);
  }
});

test('U05: نسخة tj-v2 (تفضيلات بلا ui) تُبقي قيمة الجهاز في الحالين، ونسخة 1.1.0 بالإطفاء تُطبّقه', async () => {
  const src = await storeWith({ thumbnails: false });
  const v2 = await withoutUi(await backupOf(src.store));
  for (const local of [true, false]) {
    const target = await storeWith({ thumbnails: local, video: false });
    const { read } = await restoreInto(target.store, v2, { settings: true });
    assert.equal(read.thumbnailsOff, false, 'الحقل غائب');
    assert.equal((await target.store.getPrefs()).ui.thumbnails, local, `قيمة الجهاز ${local} باقية`);
  }
  const v11 = await backupOf(src.store);
  assert.equal(JSON.parse(v11).data.prefs.ui.thumbnails, false, 'نسخة 1.1.0 تحمل الحقل أصلًا');
});

test('U05: «مسح كل البيانات» يُبقي الإطفاء، ومع الصور المفعّلة يعود الافتراضي كما كان', async () => {
  const off = await storeWith({ thumbnails: false });
  await off.store.clearAll();
  assert.equal((await off.store.listLibrary()).length, 0, 'المحفوظات مُسحت');
  const p = await off.store.getPrefs();
  assert.equal(p.ui.thumbnails, false, 'الإطفاء باقٍ');
  assert.deepEqual(p.glossary.terms ?? [], [], 'وبقية التفضيلات افتراضية');

  const on = await storeWith({ thumbnails: true });
  await on.store.clearAll();
  assert.equal((await on.store.getPrefs()).ui.thumbnails, DEFAULT_PREFS.ui.thumbnails, 'يعود الافتراضي (مطفأة منذ و2)');
});
