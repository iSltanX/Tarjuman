// نسخة معدّلة (after-fix) من برنامج Codex الأصلي evidence/data-restore-conflict.mjs (حزمة Codex على 5b9a584).
// لماذا: البرنامج يبني تدفق المعاينة بيده: planRestore(incoming, ids, seen) بثلاثة وسائط كما كانت. وإصلاح U-023 أضاف إلى المعاينة
// خطوة تلتقط بصمة القيم الخام (store.rawPrint) لكل سجل غير مقروء، وتمررها وسيطًا رابعًا (src/pages/settings/data.js بعد الإصلاح:
// prints.set(id, await store.rawPrint(id)) ثم planRestore(read, ids, existingById, prints))، فيحملها العنصر expect:{print} ويقارنها
// الكاتب داخل طابوره. والأصل لا يمر بهذه الخطوة فيبقى expect غائبًا، وهو ما لا تفعله الصفحة الحقيقية بعد الإصلاح.
// ما تغيّر:
//   ١. سطر المعاينة يلتقط rawPrint للسجلات غير المقروءة ويمررها إلى planRestore، كما تفعل الصفحة.
//   ٢. «تأكيد لا يوقف التشغيل» كما في codex-*-soft.mjs (مُسجِّل assert، واستيراد ديناميكي من جذر الشيفرة الممرَّر وسيطًا أول).
// التأكيدات كما هي. وعلى 5b9a584 تبقى كلها (planRestore يتجاهل الوسيط الرابع، فالعيب ثابت هناك).
// الاستعمال: command node codex-data-restore-conflict-rawprint-soft.mjs <جذر الشيفرة>

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

// ٣: سجل تالف بلا فهرس عند المعاينة، يُصلح في سياق آخر ثم تستبدله معاينة قديمة دون expect.
const brokenArea = createMemoryArea({ unlimited: true, initial: { [`video:${VIDEO_ID}`]: { damaged: true } } });
const target = createStore({ area: brokenArea });
const backupRecord = videoRecord(); backupRecord.title = 'نسخة قديمة';
const entry = bundleToBackup(bundleFromRecord(backupRecord));
const incoming = { videos: [{ videoId: VIDEO_ID, entry, title: backupRecord.title, updatedAt: NOW, counts: { translations: 1, marks: 0, previous: false } }], invalid: [], settings: null, prefs: null };
const library = await target.listLibrary();
const unreadable = await target.unreadableVideos();
const seen = new Map(library.map(x => [x.entry.videoId, x.entry]));
const prints = new Map(); for (const id of unreadable) prints.set(id, await target.rawPrint(id)); // خطوة المعاينة في src/pages/settings/data.js بعد U-023
const plan = planRestore(incoming, [...seen.keys(), ...unreadable], seen, prints);
const chosen = restoreItems(plan, 'all');
assert.equal(chosen.items[0].expect, undefined);
const fixed = videoRecord(); fixed.title = 'إصلاح جديد من تبويب آخر';
await target.restoreVideo(bundleToBackup(bundleFromRecord(fixed)), { replace: true });
assert.equal((await target.getVideo(VIDEO_ID)).title, fixed.title);
const result = await runRestore({ store: target, ...chosen });
assert.deepEqual(result.replaced, [VIDEO_ID]);
assert.equal((await target.getVideo(VIDEO_ID)).title, 'نسخة قديمة');
console.log('٣: سجل أُصلح بعد المعاينة استُبدل بلا تعارض:', JSON.stringify({ replaced: result.replaced.length, changed: result.changed.length, title: (await target.getVideo(VIDEO_ID)).title }));
