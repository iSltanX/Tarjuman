// تحقق Gemini، الجولة الثانية: ع-١٤ (ب) مدخل فيديو بتداخل عميق يجتاز تسلسل البصمة (JSON.stringify) ثم يتجاوز عودية التجريد
// (stripBidi): كان يرمي RangeError خارج حماية المدخل فيخرج «خطأ غير متوقع» (عقد backup.md §٥: الفيديو التالف يُعرض «تعذّر»
// والباقي يمضي، و§٥ U59: لا «خطأ غير متوقع» لتداخل عميق). العمق يُختار عند التشغيل أقصى ما يقبله تسلسل المحرّك نفسه، فلا
// يتعلق الاختبار بحجم مكدس بعينه.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countData, createBackup, readBackup, sha256Hex } from '../../../src/core/backup/index.js';
import { createStore } from '../../../src/core/store/index.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { NOW } from '../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../helpers/fixtures-v2.js';

const ID = 'AAAAAAAAAAA';
const noPause = () => Promise.resolve();
const nested = (depth) => `${'['.repeat(depth)}1${']'.repeat(depth)}`;

/** أعمق تداخل يقبله JSON.parse وJSON.stringify معًا هنا (بحث ثنائي)، بهامش دونه لمكدس القارئ. */
function deepestSerializable() {
  const ok = (d) => {
    try {
      JSON.stringify(JSON.parse(nested(d)));
      return true;
    } catch {
      return false;
    }
  };
  let lo = 100;
  let hi = 200000;
  while (hi - lo > 50) {
    const mid = Math.floor((lo + hi) / 2);
    if (ok(mid)) lo = mid;
    else hi = mid;
  }
  return Math.floor(lo * 0.8);
}

test('ع-١٤ (ب): مدخل متداخل جدًا يجتاز البصمة: الفيديو وحده «تعذّر» بلا RangeError، والباقي يمضي', async () => {
  let t = Date.parse(NOW);
  const store = createStore({ area: createMemoryArea({ unlimited: true }), now: () => (t += 1000) });
  await seedBundle(store, sampleBundle({ videoId: ID }));
  const file = JSON.parse((await createBackup({ store, appVersion: '2.2.0', pause: noPause })).text);
  const depth = deepestSerializable();
  const dataJson = JSON.stringify({ ...file.data, videos: [...file.data.videos, '@@DEEP@@'] }).replace('"@@DEEP@@"', nested(depth));
  const data = JSON.parse(dataJson);
  const header = { ...file, counts: countData(data), integrity: { ...file.integrity, hash: await sha256Hex(JSON.stringify(data)) } };
  delete header.data;
  const text = `${JSON.stringify(header).slice(0, -1)},"data":${dataJson}}`;
  let r;
  try {
    r = await readBackup(text, { pause: noPause });
  } catch (err) {
    assert.fail(`رمى ${err?.name} بعمق ${depth}`);
  }
  assert.equal(r.ok, true, `عمق ${depth}: ${r.code ?? ''}`);
  assert.deepEqual(r.videos.map((v) => v.videoId), [ID], 'الفيديو السليم يمضي');
  assert.equal(r.invalid.length, 1);
  assert.deepEqual([r.invalid[0].index, r.invalid[0].videoId, r.invalid[0].code], [1, null, 'BK_VIDEO_INVALID']);
});
