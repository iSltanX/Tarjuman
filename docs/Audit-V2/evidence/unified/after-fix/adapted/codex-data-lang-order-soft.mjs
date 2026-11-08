// نسخة معدّلة (after-fix، «تأكيد لا يوقف التشغيل») من برنامج Codex الأصلي evidence/data-lang-order.mjs (حزمة Codex على 5b9a584).
// لماذا: الأصل يتوقف عند أول assert يسقط، فلا تُقيَّم بقية تأكيداته (وبعضها لمسائل أخرى). هذه النسخة تسجّل كل تأكيد: «بقي»
// (ما زال صحيحًا، فالعيب الذي يثبته باقٍ) أو «سقط» (لم يعد صحيحًا، فانعكس)، وتكمل، ثم تطبع السجل عند الخروج.
// ما تغيّر (آليًا، ولا شيء غيره):
//   ١. سطر «import assert from 'node:assert/strict'» صار مُسجِّلًا بالواجهة نفسها (assert.equal وassert.ok…).
//   ٢. الاستيراد الثابت من ../source/ صار استيرادًا ديناميكيًا من جذر الشيفرة الممرَّر وسيطًا أول (R)، بالمسارات نفسها.
// الحالات والقيم والتأكيدات وترتيبها كما في الأصل حرفيًا. وقبل الإصلاح كانت كل التأكيدات «باقية» (خروج 0 في original-reruns).
// الاستعمال: command node codex-data-lang-order-soft.mjs <جذر الشيفرة>
import __strict from 'node:assert/strict';
import { resolve as __resolve } from 'node:path';
const R = __resolve(process.argv[2] ?? '.');
const __log = [];
let __cur = null;
function __softCall(name, args) {
  const frames = new Error().stack.split('\n').filter((s) => s.includes(import.meta.url));
  const lines = frames.map((s) => /:(\d+):\d+\)?$/.exec(s)).filter(Boolean).map((m) => Number(m[1]));
  const line = lines.find((n) => n > __end()) ?? null;
  try { (name ? __strict[name] : __strict)(...args); __log.push({ case: __cur, line, ok: true }); }
  catch (e) { __log.push({ case: __cur, line, ok: false, msg: String(e.message).split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 6).join(' ') }); }
}
const assert = new Proxy(function () {}, { apply: (_, __, a) => __softCall(null, a), get: (_, k) => (...a) => __softCall(k, a) });
process.on('exit', () => {
  const src = (__log.length ? __SRC() : []);
  console.log('\n=== سجل التأكيدات (بقي = التأكيد ما زال صحيحًا فالعيب باقٍ؛ سقط = لم يعد صحيحًا) ===');
  for (const r of __log) console.log(`${r.case ? '[' + r.case + '] ' : ''}سطر ${r.line}: ${(src[r.line - 1] ?? '').trim().slice(0, 160)}\n    ⇐ ${r.ok ? 'بقي' : 'سقط: ' + r.msg.slice(0, 300)}`);
  console.log(`المجموع: ${__log.length} تأكيدًا، بقي ${__log.filter((r) => r.ok).length}، وسقط ${__log.filter((r) => !r.ok).length}`);
});
function __SRC() { return __readSelf(); }
import { readFileSync as __rf } from 'node:fs';
import { fileURLToPath as __fu } from 'node:url';
function __readSelf() { return __rf(__fu(import.meta.url), 'utf8').split('\n'); }
function __end() { return __readSelf().findIndex((l) => l.includes('__END_PRELUDE__')) + 1; }
// __END_PRELUDE__ (نهاية المُسجِّل؛ ما بعده الأصل)
const { createStore } = await import(`${R}/src/core/store/index.js`);
const { initialPair } = await import(`${R}/src/core/model/lang-prefs.js`);
const { bundleFromRecord, bundleToBackup } = await import(`${R}/src/core/model/bundle.js`);
const { runRestore, mergeReports, reportCode, planRestore, restoreItems } = await import(`${R}/src/core/backup/restore.js`);
const { createMemoryArea } = await import(`${R}/test/helpers/chrome-storage.js`);
const { videoRecord, VIDEO_ID, NOW } = await import(`${R}/test/helpers/fixtures.js`);

// ١: إعادة ترتيب مفاتيح التخزين في Chromium تغير «آخر زوج» وتطرد أحدث فيديو عند الحد.
const area = createMemoryArea({ unlimited: true, chromiumKeyOrder: true });
const store = createStore({ area });
await store.setLangPrefs({ video: { videoId: 'ZZZZZZZZZZZ', pair: { from: 'ja', to: 'en' } } });
await store.setLangPrefs({ video: { videoId: 'AAAAAAAAAAA', pair: { from: 'fr', to: 'ar' } } });
const p = await store.getLangPrefs();
const selected = initialPair(p);
assert.equal(selected.from, 'ja');
assert.notEqual(selected.from, 'fr');
console.log('١: آخر فيديو اختير فرنسي، لكن initialPair خارج الفيديو أعاد:', selected.from);
const full = createStore({ area: createMemoryArea({ unlimited: true, chromiumKeyOrder: true }) });
const entries = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`B${String(i).padStart(10, '0')}`, { from: 'en', to: 'ar' }]));
await full.setLangPrefs({ videos: entries });
await full.setLangPrefs({ video: { videoId: 'AAAAAAAAAAA', pair: { from: 'fr', to: 'ar' } } });
assert.ok((await full.getLangPrefs()).videos.AAAAAAAAAAA);
await full.setLangPrefs({ video: { videoId: 'CCCCCCCCCCC', pair: { from: 'de', to: 'ar' } } });
assert.equal((await full.getLangPrefs()).videos.AAAAAAAAAAA, undefined);
console.log('١: حذف اختيار AAAAAAAAAAA الأحدث عند إضافة فيديو آخر رغم وجود 199 اختيارًا أقدم.');

