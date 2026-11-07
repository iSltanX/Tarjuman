// لغة ترجمة محفوظة (AA3): تُحدَّد أو تُغيَّر لخانة ممتلئة دون مساس بنصها وتوقيتها، وتُحفظ في المرافق lang: فيقرأ 1.1.0 السجل كما
// كان؛ ويُعلن تغيّر تفضيلات اللغات لكل السياقات. على تخزين حقيقي بمحاكاة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withSlotLang } from '../../../src/core/model/bundle.js';
import { createStore } from '../../../src/core/store/index.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { NOW, VIDEO_ID } from '../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../helpers/fixtures-v2.js';

function setup() {
  const area = createMemoryArea({ unlimited: true });
  let t = Date.parse(NOW);
  const now = () => (t += 1000);
  return { area, store: createStore({ area, now }), now };
}

test('لغة خانة: النشطة وغير النشطة، بلا مساس بالنص، وnull «غير محددة»، والفارغة والرمز التالف يُرفضان', async () => {
  const { area, store } = setup();
  await seedBundle(store, sampleBundle());
  const before = await store.getBundle(VIDEO_ID);
  const at = new Date(Date.parse(NOW) + 60000).toISOString();
  const a = withSlotLang(before, 1, 'ar', at);
  assert.equal(a.record.arabic.lang, 'ar');
  assert.deepEqual(a.record.arabic.original, before.record.arabic.original);
  assert.equal(a.record.updatedAt, before.record.updatedAt, 'لا يمس تاريخ التعديل (مراجعة AA3)');
  const b = withSlotLang(a, 2, 'fr', at);
  assert.equal(b.slots[1].track.lang, 'fr');
  const later = new Date(Date.parse(at) + 1000).toISOString();
  assert.deepEqual(withSlotLang(b, 1, 'ar', later), b, 'اللغة نفسها: لا تغيير');
  assert.throws(() => withSlotLang(b, 3, 'ar', at), (e) => e.code === 'ST_SLOT_EMPTY');
  assert.throws(() => withSlotLang(b, 1, 'x!', at), (e) => e.code === 'MD_INVALID');
  await store.updateBundle(VIDEO_ID, (x) => withSlotLang(withSlotLang(x, 1, 'ar', at), 2, 'fr', at), { touch: false });
  const read = await store.getBundle(VIDEO_ID);
  assert.equal(read.record.arabic.lang, 'ar');
  assert.equal(read.record.updatedAt, before.record.updatedAt, 'touch: false يبقي تاريخ التعديل وترتيب المحفوظات');
  assert.equal(read.record.rev, before.record.rev + 1, 'والمراجعة تتقدم فيرى كل سياق التغيير');
  assert.equal(read.slots[1].track.lang, 'fr');
  // السجل كما يقرؤه 1.1.0: ترجمة بلا حقل lang، واللغة في المرافق وحدها.
  const raw = area.dump()[`video:${VIDEO_ID}`];
  assert.equal('lang' in raw.arabic, false);
  assert.ok(area.dump()[`lang:${VIDEO_ID}`], 'المرافق');
  await store.updateBundle(VIDEO_ID, (x) => withSlotLang(x, 1, null, at));
  assert.equal((await store.getBundle(VIDEO_ID)).record.arabic.lang ?? null, null);
});

test('حدث تغيّر تفضيلات اللغات يصل إلى كل السياقات (AA3)', async () => {
  const { area, now } = setup();
  const one = createStore({ area, now });
  const two = createStore({ area, now });
  const seen = [];
  const off = two.onChange((c) => seen.push(c.langPrefs));
  await one.setLangPrefs({ pair: { to: 'en' } });
  await area.flush?.();
  off();
  const hit = seen.find(Boolean);
  assert.ok(hit, 'وصل الحدث');
  assert.equal(hit.newValue.pair.to, 'en');
});

test('المحفوظات (AA3): الزوج اللغوي لكل خانة من المُلخّص والمرافق دون قراءة السجلات، ومسارات الأصل بغير الإنجليزية في الصف', async () => {
  const { store } = setup();
  const b = sampleBundle();
  b.record.english.push({ ...b.record.english[0], key: 'ja|asr', lang: 'ja', kind: 'asr' });
  await seedBundle(store, b);
  const at = new Date(Date.parse(NOW) + 60000).toISOString();
  await store.updateBundle(VIDEO_ID, (x) => withSlotLang(withSlotLang(x, 1, 'ar', at), 2, 'fr', at));
  const [item] = await store.listLibrary();
  assert.deepEqual(item.pairs.slice(0, 2).map((p) => [p.from, p.to]), [['en', 'ar'], ['en', 'fr']]);
  assert.equal(item.pairs[2], null, 'الخانة الفارغة');
  assert.deepEqual(item.entry.english.map((t) => t.key).sort(), ['en|manual', 'ja|asr'], 'مسار الأصل الياباني من المرافق');
});

test('المحفوظات بمسارين للأصل (مراجعة AA3): «من» مسار بصمة الترجمة بالقراءة الكاملة، لا أول مسار', async () => {
  const { store } = setup();
  const b = sampleBundle();
  const es = { ...b.record.english[0], key: 'es|asr', lang: 'es', kind: 'asr' };
  b.record.english.push(es);
  // بصمة على المسار الإسباني والترجمة النشطة مرجعها هذه البصمة.
  const fp = { ...b.record.fingerprints[0], id: 'fp_es00000001', trackKey: 'es|asr' };
  b.record.fingerprints.push(fp);
  b.record.arabic.fingerprintId = fp.id;
  if (b.record.arabic.comparison) b.record.arabic.comparison.fingerprintId = fp.id;
  await seedBundle(store, b);
  const [item] = await store.listLibrary();
  assert.equal(item.pairs[0].from, 'es', 'مسار البصمة لا «الإنجليزية» أول القائمة');
});

/** حزمة بترجمة واحدة في الخانة 1 بلا اسم ولا علامات ولا سابقة: يمثّلها الإصدار الأول كاملة، فلا رأس لها (isTrivialBundle). */
function singleBundle({ lang = null, extraSource = null } = {}) {
  const b = sampleBundle({ previous: false });
  b.slots[1] = { ...b.slots[1], name: null, track: null, offsetMs: 0, marks: [], position: null };
  b.slots[0] = { ...b.slots[0], marks: [], position: null, track: { ...b.slots[0].track, lang } };
  b.record.arabic = structuredClone(b.slots[0].track);
  if (extraSource) b.record.english.push({ ...b.record.english[0], ...extraSource });
  return b;
}

test('المحفوظات بلا رأس (AA4): ترجمة واحدة رفعها 2.0.0 بلغتها تظهر بلغتها لا «غير محددة»، دون قراءة السجل', async () => {
  const { area, store } = setup();
  await seedBundle(store, singleBundle({ lang: 'ar' }));
  const keys = Object.keys(area.dump());
  assert.equal(keys.includes(`bundle:${VIDEO_ID}`), false, 'الحزمة البسيطة بلا رأس');
  assert.equal(keys.includes(`lang:${VIDEO_ID}`), true, 'واللغة في المرافق');
  const [item] = await store.listLibrary();
  assert.deepEqual([item.pairs[0].from, item.pairs[0].to], ['en', 'ar']);
  assert.equal(item.pairs[1], null);
});

test('المحفوظات بلا رأس: سجل 1.1.0 بلا مرافق «غير محددة» كما كان، ومسار أصل بغير الإنجليزية من المرافق يظهر في الصف', async () => {
  const a = setup();
  await seedBundle(a.store, singleBundle());
  const [old] = await a.store.listLibrary();
  assert.deepEqual([old.pairs[0].from, old.pairs[0].to], ['en', null], 'لا مرافق لغة: الترجمة «غير محددة»');
  const b = setup();
  await seedBundle(b.store, singleBundle({ lang: 'ar', extraSource: { key: 'ja|asr', lang: 'ja', kind: 'asr' } }));
  assert.equal(Object.keys(b.area.dump()).includes(`bundle:${VIDEO_ID}`), false);
  const [item] = await b.store.listLibrary();
  assert.deepEqual(item.entry.english.map((t) => t.key).sort(), ['en|manual', 'ja|asr'], 'مسار الأصل الياباني من المرافق');
  assert.equal(item.pairs[0].from, 'en', 'مساران للأصل: القراءة الكاملة تأخذ مسار البصمة');
  assert.equal(item.pairs[0].to, 'ar');
});
