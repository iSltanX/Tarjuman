// STO-03: معاينة الاستعادة بُنيت على حالة محلية، ثم تغيّر الفيديو من سياق آخر (اسم خانة، أو حفظ تحرير)، ثم «استبدال».
// يُقاس: هل تُرفض الكتابة أو يُعاد التأكيد؟ وهل تبقى إشارة «الحالية أحدث» صحيحة لو تغيّر المحلي بعد المعاينة؟
import { load, out } from './common.mjs';
const { createStore } = await load('src/core/store/index.js');
const { withSlotName } = await load('src/core/model/bundle.js');
const { saveSlot } = await load('src/pages/editor/persist.js');
const { createMemoryArea } = await load('test/helpers/chrome-storage.js');
const { sampleBundle, seedBundle } = await load('test/helpers/fixtures-v2.js');
const { runRestore, planRestore, restoreItems, retryItems } = await load('src/core/backup/restore.js');
const { readBackup } = await load('src/core/backup/read.js');
const { createBackup } = await load('src/core/backup/create.js');

const id = 'AAAAAAAAAAA';
let t = Date.parse('2026-11-01T12:00:00.000Z');
const now = () => (t += 1000);
for (const change of ['rename', 'edit']) {
  const area = createMemoryArea({ unlimited: true });
  const pageSettings = createStore({ area, now });
  const otherTab = createStore({ area, now });
  await seedBundle(pageSettings, sampleBundle({ videoId: id }));
  const file = await createBackup({ store: pageSettings, appVersion: '1.1.0' });
  const parsed = await readBackup(file.text);
  // المعاينة كما في data.js: listLibrary ثم planRestore؛ «الحالية أحدث» من updatedAt وقت المعاينة.
  const lib = await pageSettings.listLibrary();
  const existingById = new Map(lib.map((x) => [x.entry.videoId, x.entry]));
  const plan = planRestore(parsed, [...existingById.keys()]);
  const v = parsed.videos[0];
  const newerAtPreview = existingById.get(id).updatedAt > v.updatedAt;
  // بعد المعاينة وقبل التأكيد: تغيير في تبويب آخر.
  if (change === 'rename') await otherTab.updateBundle(id, (b) => withSlotName(b, 1, 'اسم-جديد'));
  else {
    const b = await otherTab.getBundle(id);
    const cues = structuredClone(b.slots[0].track.current); cues[0].text = 'تحرير-بعد-المعاينة';
    await saveSlot(otherTab, id, b, 1, { cues, offsetChanged: false, offsetMs: 0 }, { now });
  }
  const localNow = await otherTab.getBundle(id);
  const newerNow = localNow.record.updatedAt > v.updatedAt;
  const { items, skipped } = restoreItems(plan, new Set([id]));
  const report = await runRestore({ store: pageSettings, items, skipped, pause: async () => {} });
  const after = await otherTab.getBundle(id);
  out(`STO-03-${change}`, {
    itemCarriesVersion: Object.keys(items[0]).sort(), newerPillAtPreview: newerAtPreview, wouldBeNewerNow: newerNow,
    report: { replaced: report.replaced.length, failed: report.failed.length },
    after: { name1: after.slots[0].name, text0: after.slots[0].track.current?.[0]?.text, previous: after.previous?.track?.fileName ?? null },
    retryReplacesToo: retryItems({ failed: [{ videoId: id }], remaining: [] }, items).map((x) => x.replace),
  });
}
