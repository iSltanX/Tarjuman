// إذن يوتيوب نفسه (الفكرة ٣-أ، ح-39): الإذن الذي مُنح عند التثبيت بنمط content_scripts.matches في البيان، يُقرأ بـpermissions.contains
// ويُعاد طلبه بـpermissions.request من الإعدادات وحدها إن سحبه المستخدم، متزامنًا داخل الضغطة. لا إذن جديد ولا أصل غير يوتيوب،
// وأي فشل «لا يُعرف» في القراءة و«لا» في الطلب. ويُراقَب بحدثي onAdded وonRemoved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { requestYoutubeAccess, watchYoutubeAccess, youtubeAccess } from '../../../src/core/consent/youtube-access.js';

const YT = 'https://www.youtube.com/*';

const api = ({ has = true, answer = true, throwOn = null } = {}) => {
  const calls = [];
  return {
    calls,
    permissions: {
      contains: async (p) => { calls.push(['contains', p]); if (throwOn === 'contains') throw new Error('x'); return has; },
      request: (p) => { calls.push(['request', p]); if (throwOn === 'request') throw new Error('x'); return Promise.resolve(answer); },
    },
  };
};

test('القراءة: contains لأصل يوتيوب المعلن وحده، وtrue ممنوح وfalse مسحوب', async () => {
  const a = api({ has: true });
  assert.equal(await youtubeAccess(a), true);
  assert.deepEqual(a.calls, [['contains', { origins: [YT] }]], 'بلا permissions ولا أصل آخر');
  assert.equal(await youtubeAccess(api({ has: false })), false);
});

test('القراءة: غياب الواجهة أو رميها أو قيمة غير منطقية «لا يُعرف» (null)، لا ادعاء بلا دليل', async () => {
  assert.equal(await youtubeAccess(api({ throwOn: 'contains' })), null);
  assert.equal(await youtubeAccess({}), null);
  assert.equal(await youtubeAccess(undefined), null);
  assert.equal(await youtubeAccess(api({ has: 'yes' })), null);
});

test('الطلب متزامن قبل أي انتظار، بأصل يوتيوب وحده، والرفض والخطأ «لا»', async () => {
  const a = api({ answer: true });
  const pending = requestYoutubeAccess(a);
  assert.deepEqual(a.calls, [['request', { origins: [YT] }]], 'الطلب في الضغطة نفسها، بلا إذن آخر ولا فئة بيانات');
  assert.equal(await pending, true);
  assert.equal(await requestYoutubeAccess(api({ answer: false })), false);
  assert.equal(await requestYoutubeAccess(api({ answer: 'yes' })), false, 'true وحدها منح');
  assert.equal(await requestYoutubeAccess(api({ throwOn: 'request' })), false);
  assert.equal(await requestYoutubeAccess({}), false);
  const rejected = { permissions: { request: () => Promise.reject(new Error('Only permissions specified in the manifest may be requested')) } };
  assert.equal(await requestYoutubeAccess(rejected), false, 'رفض المتصفح للطلب «لا»');
});

test('الأصل المطلوب هو نمط سكربتات المحتوى في البيان نفسه، ولا إذن مضيف في البيان', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../../src/manifest.json', import.meta.url), 'utf8'));
  for (const cs of manifest.content_scripts) assert.deepEqual(cs.matches, [YT]);
  for (const k of ['host_permissions', 'optional_permissions', 'optional_host_permissions']) assert.equal(k in manifest, false, k);
});

test('المراقبة: onAdded وonRemoved كلاهما إشارة لإعادة القراءة، والإلغاء يزيل المستمعين', () => {
  const sets = { added: new Set(), removed: new Set() };
  const ev = (set) => ({ addListener: (fn) => set.add(fn), removeListener: (fn) => set.delete(fn) });
  const a = { permissions: { onAdded: ev(sets.added), onRemoved: ev(sets.removed) } };
  let seen = 0;
  const off = watchYoutubeAccess(a, () => { seen++; });
  for (const fn of sets.removed) fn({ origins: [YT] });
  for (const fn of sets.added) fn({ origins: [YT] });
  for (const fn of sets.added) fn({ data_collection: ['browsingActivity'] });
  assert.equal(seen, 3);
  off();
  assert.equal(sets.added.size + sets.removed.size, 0);
  off();
});

test('المراقبة: غياب الحدثين أو رميهما: لا رمي ولا اشتراك', () => {
  assert.doesNotThrow(() => watchYoutubeAccess({ permissions: { onAdded: { addListener: () => { throw new Error('x'); } } } }, () => {})());
  assert.doesNotThrow(() => watchYoutubeAccess({}, () => {})());
  assert.doesNotThrow(() => watchYoutubeAccess(undefined, () => {})());
});
