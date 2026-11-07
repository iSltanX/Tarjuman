// A3 — Codex الملاحظة 7: معاينة استعادة لسجل تالف بلا مُلخّص (unreadableVideos) ثم إصلاحه من سياق آخر قبل التأكيد.
// عبر صفحة الإعدادات الحقيقية (createSettings بـDOM وهمي): «التبويب أ» يفتح المعاينة ويختار «استبدال» للسجل التالف، وفي أثناء
// الحوار يستعيد «التبويب ب» (مخزن آخر على المساحة نفسها، بخطوات data.js:359-405 نفسها) نسخة أحدث تُصلحه، ثم يؤكد أ.
// التشغيل: command node restore-conflict.mjs <جذر الشيفرة>
const R = process.argv[2];
if (!R) throw new Error('usage: node restore-conflict.mjs <code-root>');
const { createBackup, readBackup } = await import(`${R}/src/core/backup/index.js`);
const { planRestore, restoreItems, runRestore } = await import(`${R}/src/core/backup/restore.js`);
const { messageFor } = await import(`${R}/src/core/errors/index.js`);
const { createStore } = await import(`${R}/src/core/store/index.js`);
const { videoKey, indexKey } = await import(`${R}/src/core/store/keys.js`);
const { createSettings } = await import(`${R}/src/pages/settings/view.js`);
const { createMemoryArea } = await import(`${R}/test/helpers/chrome-storage.js`);
const { NOW } = await import(`${R}/test/helpers/fixtures.js`);
const { sampleBundle, seedBundle } = await import(`${R}/test/helpers/fixtures-v2.js`);
const { findAll, newDocument, settle, textOf } = await import(`${R}/test/unit/pages/library/fake-dom.js`);

const out = (label, actual, expected) => console.log(`${label}\n  الفعلي:   ${JSON.stringify(actual)}\n  المتوقع:  ${JSON.stringify(expected)}\n  ${JSON.stringify(actual) === JSON.stringify(expected) ? 'مطابق' : 'مخالف'}`);
const noPause = () => Promise.resolve();
const ID = 'AAAAAAAAAAA';
const asFile = (text) => ({ size: text.length, text: async () => text });

async function backupWithTitle(title) {
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now: () => Date.parse(NOW) });
  const b = sampleBundle({ videoId: ID });
  b.record.title = title;
  await seedBundle(store, b);
  return (await createBackup({ store, appVersion: '2.0.0', pause: noPause })).text;
}
const OLD = await backupWithTitle('نسخة قديمة');
const NEW = await backupWithTitle('إصلاح أحدث من تبويب آخر');

/** استعادة «التبويب ب» بخطوات restoreFromFile نفسها (data.js:359-405) مع اختيار استبدال الكل. */
async function otherTabRestore(store, text) {
  const read = await readBackup(asFile(text), { pause: noPause });
  const library = await store.listLibrary();
  const unreadable = await store.unreadableVideos();
  const existingById = new Map(library.map((x) => [x.entry.videoId, x.entry]));
  const plan = planRestore(read, [...existingById.keys(), ...unreadable], existingById);
  const { items, skipped } = restoreItems(plan, 'all');
  return runRestore({ store, items, skipped, pause: noPause });
}

async function scenario({ corrupt }) {
  let t = Date.parse(NOW);
  const area = createMemoryArea({ unlimited: true });
  const storeA = createStore({ area, now: () => (t += 1000) });
  const storeB = createStore({ area, now: () => (t += 1000) });
  if (corrupt) {
    await storeA.listIndex(); // تهيئة meta
    area.rawSet(videoKey(ID), { damaged: true }); // سجل تالف بلا مُلخّص: لا يظهر في المحفوظات
  } else {
    const b = sampleBundle({ videoId: ID });
    b.record.title = 'المحلي قبل المعاينة';
    await seedBundle(storeA, b);
  }
  await area.flush();
  const unreadable = await storeA.unreadableVideos();
  const printBefore = await storeA.rawPrint(ID);
  const doc = newDocument();
  const answers = [];
  const settings = createSettings({
    store: storeA, doc, version: '2.0.0', now: () => Date.parse('2026-11-05T10:00:00.000Z'), pause: noPause,
    clipboardWrite: async () => {}, diagnosticsText: async () => '{}',
    saveFile: async () => ({ ok: true, mode: 'downloads', downloadId: 1 }), savedPath: async () => null,
    pickFile: async () => asFile(OLD),
    confirm: async (o) => { const a = answers.shift(); if (typeof a === 'function') await a(o); return a !== undefined && a !== false; },
    setTimer: () => 0, clearTimer: () => {},
  });
  doc.body.append(settings.root);
  await settings.load();
  let bReport = null;
  let printAfterFix = null;
  answers.push(async (o) => {
    // المستخدم يختار «استبدال» لهذا الفيديو في المعاينة…
    const box = findAll(o.content, (e) => e.tagName === 'input' && e.getAttribute('data-video') === ID)[0];
    box.checked = true;
    box.dispatchEvent({ type: 'change' });
    // …وقبل أن يؤكد، يُصلح «التبويب ب» الفيديو نفسه بنسخة أحدث.
    bReport = await otherTabRestore(storeB, NEW);
    await area.flush();
    printAfterFix = await storeB.rawPrint(ID);
  });
  await settings.data.restoreFromFile();
  await settle(20);
  const text = textOf(settings.root.querySelector('#data'));
  return {
    unreadableAtPreview: unreadable,
    otherTab: bReport ? { replaced: bReport.replaced.length, changed: bReport.changed.length } : null,
    finalTitle: (await storeA.getVideo(ID))?.title ?? null,
    reportSaysChanged: text.includes(messageFor('BK_RESTORE_CHANGED', { n: 1 })),
    printChangedAfterFix: printBefore !== printAfterFix,
  };
}

console.log('== 7. سجل تالف بلا مُلخّص: المعاينة (أ) ← إصلاح من تبويب آخر (ب) ← تأكيد (أ) ==');
const c = await scenario({ corrupt: true });
out('النتيجة', c, { unreadableAtPreview: [ID], otherTab: { replaced: 1, changed: 0 }, finalTitle: 'إصلاح أحدث من تبويب آخر', reportSaysChanged: true, printChangedAfterFix: true });

console.log('\n== 7. ضابط: الفيديو نفسه سليمًا بمُلخّص (expect من المعاينة) والتسلسل نفسه ==');
const k = await scenario({ corrupt: false });
out('النتيجة', k, { unreadableAtPreview: [], otherTab: { replaced: 1, changed: 0 }, finalTitle: 'إصلاح أحدث من تبويب آخر', reportSaysChanged: true, printChangedAfterFix: true });

console.log('\n== 7. قابلية الوصول: هل يصلح غيرُ الاستعادة سجلًا تالفًا بلا مُلخّص؟ ==');
{
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now: () => Date.parse(NOW) });
  await store.listIndex();
  area.rawSet(videoKey(ID), { damaged: true });
  await area.flush();
  let code = null;
  try {
    await seedBundle(store, sampleBundle({ videoId: ID })); // كتابة المشغّل/المحرّر عبر updateBundle
  } catch (err) { code = err.code ?? String(err); }
  out('updateBundle فوق السجل التالف (مسار الحفظ من المشغّل)', { code, inLibrary: (await store.listIndex()).some((e) => e.videoId === ID), hasIndex: (await area.get(indexKey(ID)))[indexKey(ID)] !== undefined },
    { code: 'ST_CORRUPT_RECORD', inLibrary: false, hasIndex: false });
}
