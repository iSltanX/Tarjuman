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
  assert.equal(a.record.updatedAt, at);
  const b = withSlotLang(a, 2, 'fr', at);
  assert.equal(b.slots[1].track.lang, 'fr');
  const later = new Date(Date.parse(at) + 1000).toISOString();
  assert.equal(withSlotLang(b, 1, 'ar', later).record.updatedAt, at, 'اللغة نفسها: لا تغيير ولا تاريخ حفظ جديد');
  assert.throws(() => withSlotLang(b, 3, 'ar', at), (e) => e.code === 'ST_SLOT_EMPTY');
  assert.throws(() => withSlotLang(b, 1, 'x!', at), (e) => e.code === 'MD_INVALID');
  await store.updateBundle(VIDEO_ID, (x) => withSlotLang(withSlotLang(x, 1, 'ar', at), 2, 'fr', at));
  const read = await store.getBundle(VIDEO_ID);
  assert.equal(read.record.arabic.lang, 'ar');
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
