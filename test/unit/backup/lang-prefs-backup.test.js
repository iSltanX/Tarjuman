// تفضيلات اللغات في النسخة الاحتياطية (AA3): تُضمَّن حين تختلف عن الافتراضي فتصير النسخة بالإصدار 2 (يرفضه 1.1.0 برسالة)، وتُستعاد مع
// «استعادة الإعدادات والقاموس» وحدها، وأزواج الفيديوهات تُضاف إلى الموجود ولا تمحوه؛ والافتراضية لا تغيّر صيغة الإصدار 1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBackup, planRestore, readBackup, runRestore } from '../../../src/core/backup/index.js';
import { createStore } from '../../../src/core/store/index.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { NOW, VIDEO_ID, videoRecord } from '../../helpers/fixtures.js';

const noPause = () => Promise.resolve();
function newStore() {
  let t = Date.parse(NOW);
  return createStore({ area: createMemoryArea({ unlimited: true }), now: () => (t += 1000) });
}

test('الافتراضية لا تُضمَّن: النسخة بالإصدار 1 وبياناتها بمفاتيحها الثلاثة كما يقرؤها 1.1.0', async () => {
  const store = newStore();
  await store.updateVideo(VIDEO_ID, () => videoRecord());
  const built = await createBackup({ store, appVersion: '2.0.0', pause: noPause });
  const file = JSON.parse(built.text);
  assert.equal(file.version, 1);
  assert.deepEqual(Object.keys(file.data).sort(), ['prefs', 'settings', 'videos']);
});

test('غير الافتراضية: الإصدار 2 بتفضيلات اللغات، و1.1.0 (يقرأ حتى 1) يرفضها برسالة، والاستعادة تضيف أزواج الفيديوهات', async () => {
  const store = newStore();
  await store.updateVideo(VIDEO_ID, () => videoRecord());
  await store.setLangPrefs({ pair: { from: 'ja', to: 'en' }, remember: false, use: ['ja', 'en'], video: { videoId: VIDEO_ID, pair: { from: 'ja', to: 'en' } } });
  const built = await createBackup({ store, appVersion: '2.0.0', pause: noPause });
  const file = JSON.parse(built.text);
  assert.equal(file.version, 2);
  assert.deepEqual(file.data.langPrefs.pair, { from: 'ja', to: 'en' });
  const old = await readBackup(built.text, { supportedVersion: 1 });
  assert.equal(old.ok, false);
  assert.equal(old.code, 'BK_VERSION_NEWER', 'رسالة لا فساد صامت');

  const read = await readBackup(built.text, { pause: noPause });
  assert.equal(read.ok, true);
  assert.deepEqual(read.langPrefs.recent, ['ja', 'en']);
  const target = newStore();
  await target.setLangPrefs({ video: { videoId: 'BBBBBBBBBBB', pair: { from: 'es', to: 'ar' } } });
  const plan = planRestore(read, []);
  assert.equal(plan.hasSettings, true, 'خيار «استعادة الإعدادات والقاموس» يظهر');
  const report = await runRestore({ store: target, items: [], langPrefs: read.langPrefs, pause: noPause });
  assert.equal(report.langPrefs, 'restored');
  assert.equal(report.settings, 'restored');
  const p = await target.getLangPrefs();
  assert.deepEqual([p.pair, p.remember, p.recent], [{ from: 'ja', to: 'en' }, false, ['ja', 'en']]);
  assert.deepEqual(Object.keys(p.videos).sort(), ['BBBBBBBBBBB', VIDEO_ID].sort(), 'أُضيف زوج الفيديو ولم يُمح الموجود');
});

test('نسخة بالإصدار 1 فيها langPrefs تُرفض «ليست نسخة»، وتالف اللغات يُقرأ بافتراضيه', async () => {
  const store = newStore();
  await store.updateVideo(VIDEO_ID, () => videoRecord());
  await store.setLangPrefs({ pair: { to: 'fr' } });
  const built = await createBackup({ store, appVersion: '2.0.0', pause: noPause });
  const file = JSON.parse(built.text);
  file.data.langPrefs = { pair: { from: 'x!', to: 'fr' }, recent: 'bad' };
  const { sha256Hex } = await import('../../../src/core/backup/format.js');
  file.integrity.hash = await sha256Hex(JSON.stringify(file.data));
  const read = await readBackup(JSON.stringify(file), { pause: noPause });
  assert.equal(read.ok, true);
  assert.deepEqual(read.langPrefs.pair, { from: 'auto', to: 'fr' }, 'الحقل التالف يعود افتراضيه وحده');
  assert.deepEqual(read.langPrefs.recent, []);
  file.version = 1;
  const v1 = await readBackup(JSON.stringify(file), { pause: noPause });
  assert.equal(v1.ok, false);
  assert.equal(v1.code, 'BK_NOT_BACKUP');
});
