// G-F17: أربعة ادعاءات حول المرافق lang:<id>.
//  أ) PART_NAMES (DROP_LABELS) بلا 'lang' فيظهر المفتاح الخام في تحذير النسخة الجزئية.
//  ب) salvageRaw لا يُسقط lang حين يسقط الرأس، والادعاء: «يندمج lang.slots[1] و[2] على خانات أُفرغت».
//  ج) bundleBytes لا يقيس langKey.
//  د) validateLangValue لا يفحص تكرار prints[].id.
// الحالة تُبنى بدوال المنتج (withExport وwithSlotUpload وwithActiveSlot وcreateBackup وsalvageBundle)، والتلف يُحقن في
// التخزين مباشرة لأنه لا ينتج عن الكاتب (يُذكر ذلك في كل حالة).
// الاستعمال: command node f17-lang-companion-edges.mjs <جذر الشيفرة>
import { readFileSync } from 'node:fs';
const R = process.argv[2];
if (!R) throw new Error('جذر الشيفرة مطلوب');
const { createMemoryArea } = await import(`${R}/test/helpers/chrome-storage.js`);
const { NOW, VIDEO_ID: A, makeCues } = await import(`${R}/test/helpers/fixtures.js`);
const { createStore } = await import(`${R}/src/core/store/index.js`);
const { buildExport } = await import(`${R}/src/core/export/index.js`);
const { withExport } = await import(`${R}/src/core/model/transitions.js`);
const { withSlotUpload, referencedFingerprints } = await import(`${R}/src/core/model/bundle.js`);
const { validateLangValue } = await import(`${R}/src/core/model/lang-store.js`);
const { createBackup } = await import(`${R}/src/core/backup/create.js`);
const { readBackup } = await import(`${R}/src/core/backup/read.js`);

const noPause = async () => {};
let tick = Date.parse(NOW);
const clock = () => (tick += 1000);
const iso = () => new Date(clock()).toISOString();
const show = (label, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  console.log(`  ${label}\n    الفعلي:   ${a}\n    المتوقع:  ${e}\n    ${a === e ? 'مطابق' : 'مختلف'}`);
};
const ja = { key: 'ja|manual', lang: 'ja', kind: 'manual', capturedAt: NOW, source: 'capture', cues: makeCues(3, { text: (i) => `行 ${i}` }) };
const up = (label, lang) => ({ videoId: A, fileName: `${label}.ar.srt`, cues: ja.cues.map((c) => ({ ...c, text: `${label} ${c.n}` })), comparison: null, fingerprintId: null, notes: [], lang });

/** حزمة 2.0.0: مسار ياباني ببصمته، وترجمتان بلغتين (fr في 1، وar في 2)؛ active تحدد النشطة. */
async function seed(active) {
  const area = createMemoryArea({ unlimited: true, chromiumKeyOrder: true });
  const s = createStore({ area, now: clock });
  const fp = buildExport({ videoId: A, track: ja, mode: 'normal', now: clock(), target: 'ar' }).fingerprint;
  await s.updateVideo(A, (rec) => withExport(rec, { videoId: A, englishTrack: ja, fingerprint: fp }, iso(), { keep: [] }));
  await s.updateBundle(A, (b) => withSlotUpload(b, 1, up('one', 'fr'), iso()).bundle);
  await s.updateBundle(A, (b) => withSlotUpload(b, 2, up('two', 'ar'), iso(), { activate: active === 2 }).bundle);
  return { area, s, fp };
}

// PART_NAMES من مصدره كما هو (الوحدة تستورد مكوّنات DOM).
const src = readFileSync(`${R}/src/pages/settings/data.js`, 'utf8');
const PART_NAMES = Function(`return ${src.match(/export const PART_NAMES = (Object\.freeze\(\{[^\n]*\}\));/)[1]}`)();
const partialLine = (x) => `${x.videoId}: استُبعد ${x.dropped.map((k) => PART_NAMES[k] ?? k).join('، ')}`; // data.js:133

console.log('=== أ) تحذير النسخة الجزئية حين يُستبعد lang:<id> التالف ===');
{
  const { area } = await seed(2);
  const d = area.dump();
  const bad = structuredClone(d[`lang:${A}`]);
  bad.prints[0].videoId = 'BBBBBBBBBBB'; // تلف محقون: لا يكتبه الكاتب
  await area.set({ [`lang:${A}`]: bad });
  const s = createStore({ area, now: clock });
  let code = null;
  try { await s.getBundle(A); } catch (err) { code = err.code; }
  show('getBundle مع lang:<id> تالف', code, 'ST_CORRUPT_RECORD');
  const bk = await createBackup({ store: s, appVersion: '2.0.0', pause: noPause });
  show('createBackup: partial', bk.partial, [{ videoId: A, dropped: ['lang'] }]);
  show('سطر التحذير كما تبنيه data.js:133', bk.partial.map(partialLine), [`${A}: استُبعد بيانات اللغات`]);
}

console.log('\n=== ب) salvageRaw برأس تالف: هل «يندمج lang.slots على خانات أُفرغت»؟ وما أثر إبقاء lang؟ ===');
for (const active of [1, 2]) {
  const { area } = await seed(active);
  const d = area.dump();
  const truth = await createStore({ area, now: clock }).getBundle(A);
  const head = structuredClone(d[`bundle:${A}`]);
  head.schema = 99; // تلف محقون في الرأس
  await area.set({ [`bundle:${A}`]: head });
  const s = createStore({ area, now: clock });
  const sal = await s.salvageBundle(A);
  console.log(`  -- النشطة الأصلية ${active} (fileName=${truth.record.arabic.fileName}، lang=${truth.record.arabic.lang}) --`);
  show('salvage: dropped (لا مفتاح marks: لا علامات)', sal.dropped, ['head', 'alts']);
  show('salvage: الخانات الممتلئة {n, fileName, lang}', sal.bundle.slots.filter((x) => x.track).map((x) => ({ n: x.n, fileName: x.track.fileName, lang: x.track.lang ?? null })), [{ n: 1, fileName: truth.record.arabic.fileName, lang: truth.record.arabic.lang }]);
  show('salvage: المسار الياباني والبصمة (من lang)', [sal.bundle.record.english.map((t) => t.key), sal.bundle.record.fingerprints.length], [['ja|manual'], 1]);
}

console.log('\n=== ج) bundleBytes ومستهلكوه ===');
{
  const { area, s } = await seed(2);
  const bytes = await s.bundleBytes(A);
  const langBytes = await area.getBytesInUse(`lang:${A}`);
  console.log(`  bundleBytes = ${JSON.stringify(bytes)}، وlang:<id> = ${langBytes} بايت (منه المسار الياباني بمقاطعه)`);
  const view = readFileSync(`${R}/src/pages/settings/view.js`, 'utf8').split('\n');
  const uses = view.map((l, i) => [i + 1, l]).filter(([, l]) => /sizes\.reduce|bundleBytes\(/.test(l)).map(([n, l]) => `settings/view.js:${n}: ${l.trim()}`);
  const exp = readFileSync(`${R}/src/pages/library/expand.js`, 'utf8').split('\n');
  const uses2 = exp.map((l, i) => [i + 1, l]).filter(([, l]) => /bundleBytes\(/.test(l)).map(([n, l]) => `library/expand.js:${n}: ${l.trim()}`);
  console.log(`  المستهلكون:\n    ${[...uses, ...uses2].join('\n    ')}`);
  show('حقول bundleBytes المعروضة للمستخدم', ['alts', 'previous'], ['alts', 'previous']);
}

console.log('\n=== د) بصمات مكررة المعرّف في lang.prints ===');
{
  const { area, s } = await seed(1);
  const d = area.dump();
  show('الكاتب: lang.prints فريدة (يمر بمدقق السجل الذي يرفض «معرّف بصمة مكرر»)', new Set(d[`lang:${A}`].prints.map((f) => f.id)).size === d[`lang:${A}`].prints.length, true);
  const dup = structuredClone(d[`lang:${A}`]);
  dup.prints.push(structuredClone(dup.prints[0])); // تلف محقون: لا يكتبه الكاتب
  show('validateLangValue يقبل التكرار', validateLangValue(dup).ok, false);
  await area.set({ [`lang:${A}`]: dup });
  const s2 = createStore({ area, now: clock });
  let code = null;
  let n = null;
  try { n = (await s2.getBundle(A)).record.fingerprints.length; } catch (err) { code = err.code; }
  show('getBundle بعدها {code, fingerprints}', { code, n }, { code: 'ST_CORRUPT_RECORD', n: null });
  let wcode = null;
  try { await s2.updateBundle(A, (b) => b); } catch (err) { wcode = err.code; }
  show('أول كتابة بعدها', wcode, 'ST_CORRUPT_RECORD');
  const bk = await createBackup({ store: createStore({ area, now: clock }), appVersion: '2.0.0', pause: noPause });
  show('createBackup {partial, skipped}', { partial: bk.partial.length, skipped: bk.skipped.map((x) => x.code) }, { partial: 1, skipped: [] });
  const rb = await readBackup(bk.text, { pause: noPause });
  show('النسخة نفسها تُقرأ في 2.0.0 {videos, invalid}', { videos: rb.videos.length, invalid: rb.invalid.map((x) => x.detail) }, { videos: 1, invalid: [] });
  void s;
}
