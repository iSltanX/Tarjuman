// A3 — Codex الملاحظة 4: ترتيب مفاتيح chrome.storage في Chromium و«آخر زوج» وحد 200 في langPrefs.videos.
// التشغيل: command node lang-order.mjs <جذر الشيفرة>
// المحاكاة: createMemoryArea({ chromiumKeyOrder: true }) (get يعيد مفاتيح الكائنات مرتبة كما قاسه probe.mjs في Chrome وBrave،
// docs/evidence/Audit-5fedcb9/probe/*/probe.json: gm010-chromium-sorts-keys)، وبلا الخيار = ترتيب الإدراج (سلوك IndexedDB/النسخ الهيكلي في Firefox، غير مقيس هنا).
const R = process.argv[2];
if (!R) throw new Error('usage: node lang-order.mjs <code-root>');
const { createStore } = await import(`${R}/src/core/store/index.js`);
const { initialPair, pairPatch, LANG_PREFS_LIMITS } = await import(`${R}/src/core/model/lang-prefs.js`);
const { pairState } = await import(`${R}/src/pages/popup/status.js`);
const { createMemoryArea } = await import(`${R}/test/helpers/chrome-storage.js`);

const out = (label, actual, expected) => console.log(`${label}\n  الفعلي:   ${JSON.stringify(actual)}\n  المتوقع:  ${JSON.stringify(expected)}\n  ${JSON.stringify(actual) === JSON.stringify(expected) ? 'مطابق' : 'مخالف'}`);
const mk = (chromium) => createStore({ area: createMemoryArea({ unlimited: true, chromiumKeyOrder: chromium }) });

// معرّفات يوتيوب حتمية (11 محرفًا من أبجدية base64url) بمولّد ثابت البذرة.
const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
let seed = 0x9e3779b9;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const newId = (used) => { for (;;) { const id = Array.from({ length: 11 }, () => ABC[Math.floor(rnd() * 64)]).join(''); if (!used.has(id)) { used.add(id); return id; } } };

console.log('== 4.أ «آخر زوج» خارج صفحة فيديو (initialPair بلا videoId) عبر مسار النافذة نفسه: pairPatch ثم setLangPrefs ==');
for (const chromium of [true, false]) {
  const store = mk(chromium);
  // المستخدم يغيّر «من» في النافذة على فيديو ZZZZZZZZZZZ إلى اليابانية، ثم على فيديو AAAAAAAAAAA إلى الفرنسية (main.js:171-176).
  let lp = await store.getLangPrefs();
  lp = await store.setLangPrefs(pairPatch(lp, { videoId: 'ZZZZZZZZZZZ', pair: { from: 'ja', to: 'ar' }, why: 'from' }));
  lp = await store.setLangPrefs(pairPatch(lp, { videoId: 'AAAAAAAAAAA', pair: { from: 'fr', to: 'ar' }, why: 'from' }));
  const inMemory = initialPair(lp); // القيمة التي أعادها الكاتب في النافذة نفسها (ترتيب الإدراج)
  const reopened = initialPair(await store.getLangPrefs()); // فتح النافذة لاحقًا: قراءة من التخزين (main.js:110)
  out(`[${chromium ? 'Chromium' : 'ترتيب الإدراج'}] النافذة نفسها بعد الكتابة: from`, inMemory.from, 'fr');
  out(`[${chromium ? 'Chromium' : 'ترتيب الإدراج'}] فتح النافذة لاحقًا خارج فيديو: from`, reopened.from, 'fr');
}
// ما يعنيه ذلك في الواجهة: خارج صفحة الفيديو زر النسخ معطّل بسبب noVideo، فالأثر عرض «من» خاطئة لا نسخ تعليمات خاطئة.
const st = pairState({ reply: { watch: false, videoId: null }, pair: { from: 'ja', to: 'ar' } });
out('pairState خارج صفحة فيديو: ready/reason', { ready: st.ready, reason: st.reason }, { ready: false, reason: 'افتح فيديو على يوتيوب لتُنسخ تعليماته بعنوانه ورابطه.' });

console.log('\n== 4.ب حد 200: حالة Codex الحرفية (200 معرّف B…، ثم AAAAAAAAAAA ثم CCCCCCCCCCC) ==');
for (const chromium of [true, false]) {
  const store = mk(chromium);
  const entries = Object.fromEntries(Array.from({ length: LANG_PREFS_LIMITS.videos }, (_, i) => [`B${String(i).padStart(10, '0')}`, { from: 'en', to: 'ar' }]));
  await store.setLangPrefs({ videos: entries });
  await store.setLangPrefs({ video: { videoId: 'AAAAAAAAAAA', pair: { from: 'fr', to: 'ar' } } });
  await store.setLangPrefs({ video: { videoId: 'CCCCCCCCCCC', pair: { from: 'de', to: 'ar' } } });
  const v = (await store.getLangPrefs()).videos;
  out(`[${chromium ? 'Chromium' : 'ترتيب الإدراج'}] بعد إضافة CCCCCCCCCCC: هل بقي AAAAAAAAAAA (الأحدث قبلها)؟ وهل سقط الأقدم B0000000000؟`,
    { AAAAAAAAAAA: 'AAAAAAAAAAA' in v, B0000000000: 'B0000000000' in v, B0000000001: 'B0000000001' in v, count: Object.keys(v).length },
    { AAAAAAAAAAA: true, B0000000000: false, B0000000001: false, count: 200 });
}

console.log('\n== 4.ب الحالة المستقرة بمعرّفات عشوائية واقعية: 200 اختيار قديم، ثم 300 فيديو جديد بالتتابع عبر pairPatch ==');
for (const chromium of [true, false]) {
  const store = mk(chromium);
  const used = new Set();
  const order = []; // ترتيب الاختيار الحقيقي (الأحدث آخرًا)
  let lp = await store.getLangPrefs();
  for (let i = 0; i < 200 + 300; i++) {
    const id = newId(used);
    order.push(id);
    lp = await store.getLangPrefs(); // كل فتح للنافذة يقرأ من التخزين
    await store.setLangPrefs(pairPatch(lp, { videoId: id, pair: { from: 'ja', to: 'en' }, why: 'swap' }));
  }
  const kept = new Set(Object.keys((await store.getLangPrefs()).videos));
  const last = (n) => order.slice(-n).filter((id) => kept.has(id)).length;
  const lruExpected = { kept: 200, last1: 1, last10: 10, last50: 50, last200: 200 };
  out(`[${chromium ? 'Chromium' : 'ترتيب الإدراج'}] كم بقي من آخر 1/10/50/200 اختيارًا (الأحدث)؟`,
    { kept: kept.size, last1: last(1), last10: last(10), last50: last(50), last200: last(200) }, lruExpected);
  if (chromium) {
    const sortedKept = [...kept].sort();
    console.log(`  أصغر معرّف باقٍ أبجديًا: ${sortedKept[0]} — أي أن الباقي هو «الأكبر أبجديًا» تقريبًا لا الأحدث.`);
  }
}
