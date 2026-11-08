// التدقيق الموحد V2، WG-3 (U-019): حذف بيانات الفيديو بكل مساراته يزيل زوج لغاته من langPrefs فلا يبقى معرّفه محليًا ولا في
// النسخة الاحتياطية، وحذف ترجمة واحدة يُبقي الزوج. الحالات بدوال المنتج كما في docs/Audit-V2/evidence/unified/repro/A3-backup.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../src/core/store/index.js';
import { createBackup } from '../../../src/core/backup/create.js';
import { pairPatch } from '../../../src/core/model/lang-prefs.js';
import { videoKey } from '../../../src/core/store/keys.js';
import { deleteVideoData } from '../../../src/pages/library/actions.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { NOW } from '../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../helpers/fixtures-v2.js';

const now = () => Date.parse(NOW);
const ID = 'AAAAAAAAAAA';
const OTHER = 'BBBBBBBBBBB';
const fresh = () => {
  const area = createMemoryArea({ unlimited: true, chromiumKeyOrder: true });
  return { area, store: createStore({ area, now }) };
};
const choosePair = async (store, videoId, pair, why = 'swap') => store.setLangPrefs(pairPatch(await store.getLangPrefs(), { videoId, pair, why }));
const backupData = async (store) => JSON.parse((await createBackup({ store, appVersion: '2.0.0', now, pause: async () => {} })).text).data;

test('AV2 U-019: حذف بيانات الفيديو بنطاق all وبـexpect يزيل زوجه من langPrefs ومن النسخة الاحتياطية', async () => {
  const { store } = fresh();
  await choosePair(store, ID, { from: 'ja', to: 'en' });
  await choosePair(store, OTHER, { from: 'ko', to: 'en' });
  await seedBundle(store, sampleBundle({ videoId: ID }));
  await deleteVideoData({ store, videoId: ID, scope: 'all', expect: await store.getBundle(ID), now });
  const lp = await store.getLangPrefs();
  assert.equal(lp.videos[ID], undefined);
  assert.deepEqual(lp.order, [OTHER], 'الترتيب يتبع، وزوج غيره باقٍ');
  const data = await backupData(store);
  assert.equal(data.langPrefs.videos[ID], undefined);
  assert.equal(JSON.stringify(data).includes(ID), false, 'المعرّف لا يظهر في النسخة');
});

test('AV2 U-019: حذف بلا expect (deleteVideo) وحذف السجل التالف بالبصمة يزيلان الزوج أيضًا', async () => {
  const { store, area } = fresh();
  await choosePair(store, ID, { from: 'ja', to: 'en' });
  await seedBundle(store, sampleBundle({ videoId: ID }));
  await store.deleteVideo(ID);
  assert.equal((await store.getLangPrefs()).videos[ID], undefined);

  await choosePair(store, ID, { from: 'ko', to: 'ar' });
  await seedBundle(store, sampleBundle({ videoId: ID }));
  area.rawSet(videoKey(ID), { damaged: true });
  await area.flush();
  const print = await store.rawPrint(ID);
  await store.deleteVideo(ID, { print });
  assert.equal((await store.getLangPrefs()).videos[ID], undefined);
});

test('AV2 U-019: updateBundle(()=>null) هو المسار المشترك، وزوج فيديو لم يُحفظ له سجل لا يُحذف تلقائيًا', async () => {
  const { store } = fresh();
  await choosePair(store, ID, { from: 'ja', to: 'en' });
  await choosePair(store, OTHER, { from: 'ko', to: 'en' }); // اختيار قبل أي حفظ
  await seedBundle(store, sampleBundle({ videoId: ID }));
  await store.updateBundle(ID, () => null);
  const lp = await store.getLangPrefs();
  assert.equal(lp.videos[ID], undefined);
  assert.deepEqual(lp.videos[OTHER], { from: 'ko', to: 'en' });
});

test('AV2 U-019: حذف ترجمة واحدة يُبقي زوج الفيديو، وحذف فيديو غير ذي زوج لا يكتب langPrefs', async () => {
  const { store, area } = fresh();
  await choosePair(store, ID, { from: 'ja', to: 'en' });
  await seedBundle(store, sampleBundle({ videoId: ID }));
  await deleteVideoData({ store, videoId: ID, scope: 'arabic', n: 1, expect: await store.getBundle(ID), now });
  assert.deepEqual((await store.getLangPrefs()).videos[ID], { from: 'ja', to: 'en' });

  const b = fresh();
  await seedBundle(b.store, sampleBundle({ videoId: OTHER }));
  await b.store.deleteVideo(OTHER);
  assert.equal((await b.area.get('langPrefs')).langPrefs, undefined, 'لا مفتاح langPrefs ينشأ بلا حاجة');
  void area;
});
