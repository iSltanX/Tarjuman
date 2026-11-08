// التدقيق الموحد V2، WG-3 (U-018): أحدثية تفضيلات اللغات بحقل order صريح لا بترتيب مفاتيح الكائن (Chromium يرتّب المفاتيح
// المتداخلة عند القراءة)، فيصح «آخر زوج» والطرد عند حد 200 على المخزن ذي ترتيب Chromium.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LANG_PREFS, LANG_PREFS_LIMITS, applyLangPrefs, initialPair, normalizeLangPrefs, pairPatch, validateLangPrefs,
} from '../../../src/core/model/lang-prefs.js';
import { createStore } from '../../../src/core/store/index.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';

const mk = (chromiumKeyOrder) => createStore({ area: createMemoryArea({ unlimited: true, chromiumKeyOrder }) });

// معرّفات حتمية (11 محرفًا) بمولّد ثابت البذرة.
const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function ids(n) {
  let seed = 0x9e3779b9;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const used = new Set();
  while (used.size < n) used.add(Array.from({ length: 11 }, () => ABC[Math.floor(rnd() * 64)]).join(''));
  return [...used];
}

test('AV2 U-018: «آخر زوج» خارج صفحة فيديو هو الأحدث اختيارًا لا الأكبر أبجديًا على ترتيب Chromium', async () => {
  const store = mk(true);
  let lp = await store.getLangPrefs();
  lp = await store.setLangPrefs(pairPatch(lp, { videoId: 'ZZZZZZZZZZZ', pair: { from: 'ja', to: 'ar' }, why: 'from' }));
  lp = await store.setLangPrefs(pairPatch(lp, { videoId: 'AAAAAAAAAAA', pair: { from: 'fr', to: 'ar' }, why: 'from' }));
  assert.equal(initialPair(lp).from, 'fr');
  assert.equal(initialPair(await store.getLangPrefs()).from, 'fr', 'بعد القراءة من التخزين مرتبة المفاتيح');
  assert.deepEqual((await store.getLangPrefs()).order, ['ZZZZZZZZZZZ', 'AAAAAAAAAAA']);
});

test('AV2 U-018: 200 ثم 300 معرّف عشوائي على ترتيب Chromium يُبقي آخر 200 بالضبط', async () => {
  const store = mk(true);
  const all = ids(500);
  for (const id of all) {
    const lp = await store.getLangPrefs();
    await store.setLangPrefs(pairPatch(lp, { videoId: id, pair: { from: 'ja', to: 'en' }, why: 'swap' }));
  }
  const lp = await store.getLangPrefs();
  assert.deepEqual([...Object.keys(lp.videos)].sort(), all.slice(-LANG_PREFS_LIMITS.videos).sort());
  assert.deepEqual(lp.order, all.slice(-LANG_PREFS_LIMITS.videos));
});

test('AV2 U-018: حالة Codex الحرفية: 200 معرّف B… ثم A… ثم C… يُبقي A ويسقط الأقدمين', async () => {
  const store = mk(true);
  const entries = Object.fromEntries(Array.from({ length: LANG_PREFS_LIMITS.videos }, (_, i) => [`B${String(i).padStart(10, '0')}`, { from: 'en', to: 'ar' }]));
  await store.setLangPrefs({ videos: entries });
  await store.setLangPrefs({ video: { videoId: 'AAAAAAAAAAA', pair: { from: 'fr', to: 'ar' } } });
  await store.setLangPrefs({ video: { videoId: 'CCCCCCCCCCC', pair: { from: 'de', to: 'ar' } } });
  const v = (await store.getLangPrefs()).videos;
  assert.ok('AAAAAAAAAAA' in v && 'CCCCCCCCCCC' in v);
  assert.ok(!('B0000000000' in v) && !('B0000000001' in v));
  assert.equal(Object.keys(v).length, LANG_PREFS_LIMITS.videos);
});

test('AV2 U-018: قيمة قديمة بلا order تُطبَّع بشكل حتمي من ترتيب المفاتيح، والمعتمد صالح', () => {
  const old = { schema: 1, pair: { from: 'auto', to: 'ar' }, remember: true, recent: [], videos: { BBBBBBBBBBB: { from: 'ja', to: 'ar' }, AAAAAAAAAAA: { from: 'fr', to: 'ar' } } };
  const a = normalizeLangPrefs(old);
  assert.deepEqual(a.order, ['BBBBBBBBBBB', 'AAAAAAAAAAA']);
  assert.deepEqual(normalizeLangPrefs(structuredClone(old)), a);
  assert.equal(validateLangPrefs(a).ok, true);
  assert.equal(validateLangPrefs(old).ok, false, 'الكتابة صارمة: order مطلوب');
  assert.equal(validateLangPrefs({ ...a, order: ['AAAAAAAAAAA'] }).ok, false, 'المجموعة يجب أن تطابق مفاتيح videos');
  assert.equal(validateLangPrefs({ ...a, order: ['AAAAAAAAAAA', 'AAAAAAAAAAA'] }).ok, false);
  // order فيه معرّف غائب أو ينقصه معرّف: يُصلح بالقراءة المتسامحة.
  const messy = normalizeLangPrefs({ ...old, order: ['AAAAAAAAAAA', 'ZZZZZZZZZZZ'] });
  assert.deepEqual(messy.order, ['AAAAAAAAAAA', 'BBBBBBBBBBB']);
  assert.deepEqual(DEFAULT_LANG_PREFS.order, []);
});

test('AV2 U-018: إعادة اختيار فيديو سابق تنقله إلى آخر الترتيب، وإزالته تحذفه منه', () => {
  let p = normalizeLangPrefs(null);
  for (const id of ['AAAAAAAAAAA', 'BBBBBBBBBBB', 'CCCCCCCCCCC']) p = applyLangPrefs(p, { video: { videoId: id, pair: { from: 'ja', to: 'en' } } });
  p = applyLangPrefs(p, { video: { videoId: 'AAAAAAAAAAA', pair: { from: 'fr', to: 'en' } } });
  assert.deepEqual(p.order, ['BBBBBBBBBBB', 'CCCCCCCCCCC', 'AAAAAAAAAAA']);
  p = applyLangPrefs(p, { video: { videoId: 'CCCCCCCCCCC', pair: null } });
  assert.deepEqual(p.order, ['BBBBBBBBBBB', 'AAAAAAAAAAA']);
  assert.equal(validateLangPrefs(p).ok, true);
  assert.equal(initialPair(p).from, 'fr');
});
