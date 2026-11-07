// تدقيق Fable (FA-08): كان القارئ يجرّد محارف تجاوز الاتجاه من العنوان واسم الملف وحدهما، فمقطع في نسخة مصنوعة يحمل U+202E
// (أو محرف تحكم) يُخزَّن ويُعرض مقلوبًا، بينما الاستيراد العادي والتصدير يجرّدانه. صار نص المقاطع والملاحظات كالاستيراد،
// وNUL ما زال يرفضه مدقق المقطع، وLRM وRLM وZWNJ تبقى. المحارف تُبنى وقت التشغيل فلا يحمل الملف محرفًا غير مرئي.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countData, createBackup, readBackup, sha256Hex } from '../../../src/core/backup/index.js';
import { createStore } from '../../../src/core/store/index.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { NOW } from '../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../helpers/fixtures-v2.js';

const ID = 'AAAAAAAAAAA';
const noPause = () => Promise.resolve();
const ch = (cp) => String.fromCodePoint(cp);
const RLO = ch(0x202e);
const LRI = ch(0x2066);
const BEL = ch(0x07);
const RLM = ch(0x200f);
const ZWNJ = ch(0x200c);

function newStore() {
  let t = Date.parse(NOW);
  return createStore({ area: createMemoryArea({ unlimited: true }), now: () => (t += 1000) });
}

async function reseal(text, mutate) {
  const file = JSON.parse(text);
  mutate(file);
  file.counts = countData(file.data);
  file.integrity.hash = await sha256Hex(JSON.stringify(file.data));
  return JSON.stringify(file);
}

async function backupWith(mutate) {
  const store = newStore();
  await seedBundle(store, sampleBundle({ videoId: ID }));
  const built = await createBackup({ store, appVersion: '1.1.0', pause: noPause });
  return reseal(built.text, mutate);
}

test('FA-08: محارف التحكم وتجاوز الاتجاه تُجرَّد من نصوص المقاطع والملاحظات عند الاستعادة، والمشروعة تبقى', async () => {
  const text = await backupWith((f) => {
    const a = f.data.videos[0].record.arabic;
    a.original[0].text = `نص ${RLO}مقلوب${BEL}`;
    a.original[1].text = `سطر${RLM} مع${ZWNJ}وصل ${LRI}x`;
    a.notes = [`ملاحظة ${RLO}مقلوبة`];
  });
  const read = await readBackup(text, { pause: noPause });
  assert.equal(read.ok, true);
  assert.deepEqual(read.invalid, []);
  const store = newStore();
  await store.restoreVideo(read.videos[0].entry);
  const rec = await store.getVideo(ID);
  assert.equal(rec.arabic.original[0].text, 'نص مقلوب');
  assert.equal(rec.arabic.original[1].text, `سطر${RLM} مع${ZWNJ}وصل x`);
  assert.deepEqual(rec.arabic.notes, ['ملاحظة مقلوبة']);
});

test('FA-08: NUL في نص مقطع ما زال يرفض الفيديو وحده (لا يُجرَّد بصمت)', async () => {
  const text = await backupWith((f) => {
    f.data.videos[0].record.arabic.original[0].text = `نص${ch(0)}`;
  });
  const read = await readBackup(text, { pause: noPause });
  assert.equal(read.ok, true);
  assert.equal(read.videos.length, 0);
  assert.equal(read.invalid.length, 1);
  assert.equal(read.invalid[0].code, 'BK_VIDEO_INVALID');
});
