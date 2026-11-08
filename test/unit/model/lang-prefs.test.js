// تفضيلات اللغات (AA1، model/lang-prefs.js): الافتراضي والقراءة المتسامحة والكتابة الصارمة، والتعديل الجزئي، وزوج البداية
// لفيديو: «من» التلقائي من لغة المسار الملتقط وحدها (قرار سلطان ق٥) ولا تخمين، و«إلى» الافتراضي. ومن التخزين بالكاتب الواحد.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTO_SOURCE, DEFAULT_LANG_PREFS, DEFAULT_TARGET_LANG, LANG_PREFS_LIMITS, applyLangPrefs, initialPair, normalizeLangPrefs, pairPatch,
  validateLangPrefs, withRecent,
} from '../../../src/core/model/lang-prefs.js';
import { createStore } from '../../../src/core/store/index.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { NOW, VIDEO_ID as A } from '../../helpers/fixtures.js';

test('الافتراضي صالح: «من» تلقائي و«إلى» العربية قيمةً افتراضية، وتذكّر آخر لغة ترجمة، وبلا لغات أخيرة', () => {
  assert.equal(validateLangPrefs(DEFAULT_LANG_PREFS).ok, true);
  assert.deepEqual(DEFAULT_LANG_PREFS.pair, { from: AUTO_SOURCE, to: DEFAULT_TARGET_LANG });
  assert.equal(DEFAULT_TARGET_LANG, 'ar');
});

test('القراءة متسامحة لكل حقل، والتالف يعود افتراضيه دون غيره', () => {
  const p = normalizeLangPrefs({ pair: { from: 'ja', to: 'bad lang' }, remember: 'yes', recent: ['en', 'en', 'x!', 'fr'], videos: { [A]: { from: 'ja', to: 'en' }, bad: { from: 'x' } } });
  assert.deepEqual(p.pair, { from: 'ja', to: DEFAULT_TARGET_LANG });
  assert.equal(p.remember, true);
  assert.deepEqual(p.recent, ['en', 'fr']);
  assert.deepEqual(p.videos, { [A]: { from: 'ja', to: 'en' } });
  assert.deepEqual(normalizeLangPrefs(null), structuredClone({ ...DEFAULT_LANG_PREFS, recent: [], videos: {} }));
});

test('الكتابة صارمة، والتعديل جزئي: اللغات الأخيرة بلا تكرار وفي الحد، وزوج الفيديو الأحدث آخرًا والأقدم يسقط عند الحد', () => {
  assert.equal(validateLangPrefs({ ...DEFAULT_LANG_PREFS, pair: { from: 'auto', to: 'x!' } }).ok, false);
  assert.equal(validateLangPrefs({ ...DEFAULT_LANG_PREFS, extra: 1 }).ok, false);
  let p = applyLangPrefs(normalizeLangPrefs(null), { pair: { to: 'en' }, use: ['ja', 'en'] });
  assert.deepEqual(p.pair, { from: AUTO_SOURCE, to: 'en' });
  assert.deepEqual(p.recent, ['ja', 'en']);
  p = applyLangPrefs(p, { use: ['en'] });
  assert.deepEqual(p.recent, ['en', 'ja']);
  assert.deepEqual(withRecent(['a1', 'b'], 'b'), ['b', 'a1']);
  assert.equal(Array.from({ length: 20 }, (_, i) => `l${i}`).reduce(withRecent, []).length, LANG_PREFS_LIMITS.recent);
  p = applyLangPrefs(p, { video: { videoId: A, pair: { from: 'ja', to: 'en' } } });
  assert.deepEqual(p.videos[A], { from: 'ja', to: 'en' });
  assert.equal(validateLangPrefs(p).ok, true);
  p = applyLangPrefs(p, { video: { videoId: A, pair: null } });
  assert.equal(A in p.videos, false);
});

test('زوج البداية: المحفوظ للفيديو، وإلا «من» من لغة المسار الملتقط إن عُرفت (وإلا null) و«إلى» الافتراضي', () => {
  const base = normalizeLangPrefs(null);
  assert.deepEqual(initialPair(base, { videoId: A, sourceLang: 'ja' }), { from: 'ja', to: 'ar', fromDetected: true });
  assert.deepEqual(initialPair(base, { videoId: A, sourceLang: null }), { from: null, to: 'ar', fromDetected: false }, 'لا تخمين');
  assert.deepEqual(initialPair(base, { sourceLang: 'bad!' }), { from: null, to: 'ar', fromDetected: false });
  const fixed = applyLangPrefs(base, { pair: { from: 'en', to: 'fr' } });
  assert.deepEqual(initialPair(fixed, { sourceLang: 'ja' }), { from: 'en', to: 'fr', fromDetected: false }, '«من» محددة في الإعدادات');
  const saved = applyLangPrefs(base, { video: { videoId: A, pair: { from: 'ko', to: 'en' } } });
  assert.deepEqual(initialPair(saved, { videoId: A, sourceLang: 'ja' }), { from: 'ko', to: 'en', fromDetected: false });
  // «إلى» وحدها محفوظة قبل أن يُلتقط شيء: «من» تُعبّأ حين يُلتقط المسار لاحقًا.
  const toOnly = applyLangPrefs(base, { video: { videoId: A, pair: { from: null, to: 'en' } } });
  assert.deepEqual(initialPair(toOnly, { videoId: A, sourceLang: 'ja' }), { from: 'ja', to: 'en', fromDetected: true });
  const same = applyLangPrefs(base, { video: { videoId: A, pair: { from: 'ja', to: 'en' } } });
  assert.equal(initialPair(same, { videoId: A, sourceLang: 'ja' }).fromDetected, true, 'المحفوظ هو المكتشف نفسه');
});

test('زوج البداية خارج صفحة فيديو: الافتراضي، و«من» آخر زوج لفيديو حين يكون التذكّر مفعّلًا', () => {
  const base = normalizeLangPrefs(null);
  const used = applyLangPrefs(base, { video: { videoId: A, pair: { from: 'ja', to: 'en' } } });
  assert.deepEqual(initialPair(used), { from: 'ja', to: 'ar', fromDetected: false });
  assert.deepEqual(initialPair(applyLangPrefs(used, { remember: false })), { from: null, to: 'ar', fromDetected: false });
});

test('تغيير الزوج: اللغة إلى الأخيرة، وما غيّره وحده للفيديو، و«إلى» افتراضيًا مع التذكّر، و«من» لا تمس «تلقائي»', () => {
  const base = normalizeLangPrefs(null);
  // «إلى» وحدها: «من» المكتشفة لا تُثبَّت للفيديو، فتتبع مسارًا يُلتقط لاحقًا (مراجعة AA3).
  assert.deepEqual(pairPatch(base, { videoId: A, pair: { from: 'ja', to: 'en' }, why: 'to' }), {
    use: ['en'], video: { videoId: A, pair: { from: null, to: 'en' } }, pair: { to: 'en' },
  });
  // «من» وحدها: «إلى» الافتراضية لا تُثبَّت، فتتبع الإعدادات.
  assert.deepEqual(pairPatch(base, { videoId: A, pair: { from: 'ko', to: 'en' }, why: 'from' }), {
    use: ['ko'], video: { videoId: A, pair: { from: 'ko', to: null } },
  });
  // ما اختاره قبلُ للفيديو يبقى.
  const chosen = applyLangPrefs(base, { video: { videoId: A, pair: { from: 'ko', to: null } } });
  assert.deepEqual(pairPatch(chosen, { videoId: A, pair: { from: 'ko', to: 'fr' }, why: 'to' }).video, { videoId: A, pair: { from: 'ko', to: 'fr' } });
  assert.deepEqual(pairPatch(base, { videoId: A, pair: { from: 'ja', to: 'en' }, why: 'swap' }).video, { videoId: A, pair: { from: 'ja', to: 'en' } }, 'المبادلة تختار الاثنتين');
  assert.deepEqual(pairPatch(base, { pair: { from: 'en', to: 'ja' }, why: 'swap' }), { use: ['ja', 'en'], pair: { to: 'ja' } });
  const off = applyLangPrefs(base, { remember: false });
  assert.deepEqual(pairPatch(off, { videoId: A, pair: { from: 'ja', to: 'en' }, why: 'to' }), { use: ['en'], video: { videoId: A, pair: { from: null, to: 'en' } } });
  const next = applyLangPrefs(base, pairPatch(base, { videoId: A, pair: { from: 'ja', to: 'en' }, why: 'swap' }));
  assert.equal(next.pair.from, AUTO_SOURCE);
  assert.equal(validateLangPrefs(next).ok, true);
});

test('التخزين: افتراضي بلا مفتاح، وتعديلان من سياقين لا يُسقط أحدهما الآخر', async () => {
  const area = createMemoryArea({ unlimited: true });
  let t = Date.parse(NOW);
  const now = () => (t += 1000);
  const one = createStore({ area, now });
  const two = createStore({ area, now });
  assert.deepEqual((await one.getLangPrefs()).pair, DEFAULT_LANG_PREFS.pair);
  await Promise.all([one.setLangPrefs({ pair: { to: 'en' } }), two.setLangPrefs({ use: ['ja'] })]);
  const p = await one.getLangPrefs();
  assert.equal(p.pair.to, 'en');
  assert.deepEqual(p.recent, ['ja']);
  await assert.rejects(one.setLangPrefs({ pair: { to: 'x!' } }), (e) => e.code === 'MD_INVALID');
  assert.equal(area.dump().langPrefs.pair.to, 'en', 'المرفوض لا يُكتب');
});
