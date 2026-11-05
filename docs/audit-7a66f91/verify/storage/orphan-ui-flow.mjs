// STO-10 / P-2 — هل يبلغ السباق مسار الواجهة؟ المستدعي الوحيد لـrestoreVideo هو صفحة الإعدادات (data.js)، وهي تستدعي
// store.listLibrary() للمعاينة قبل التأكيد (data.js:324)، فينظّف مسحها التوابع اليتيمة قبل أي كتابة استعادة.
// نعيد التسلسل: توابع يتيمة ← معاينة (readBackup + listLibrary + planRestore في سياق الإعدادات) ← المحفوظات في سياق آخر
// تمسح بقائمة مُعلَّقة عند remove ← تنفيذ الاستعادة. ونرصد هل تبقى يتيمة لتنظّفها المحفوظات أثناء الكتابة.
import { load, out } from './common.mjs';
const { createStore } = await load('src/core/store/index.js');
const { createMemoryArea } = await load('test/helpers/chrome-storage.js');
const { sampleBundle, seedBundle } = await load('test/helpers/fixtures-v2.js');
const { createBackup } = await load('src/core/backup/create.js');
const { readBackup } = await load('src/core/backup/read.js');
const { planRestore, restoreItems, runRestore } = await load('src/core/backup/restore.js');
const ID = 'AAAAAAAAAAA';
const keys = (area) => Object.keys(area.dump()).filter((k) => k.endsWith(ID));

const area = createMemoryArea({ unlimited: true });
const settings = createStore({ area });
await seedBundle(settings, sampleBundle({ videoId: ID, third: true }));
const file = await createBackup({ store: settings, appVersion: '1.1.0' });
await area.remove([`video:${ID}`, `index:${ID}`]); // حذف tj-v1
const orphans = keys(area);
// معاينة صفحة الإعدادات (data.js:323–338)
const read = await readBackup(file.text);
const lib = await settings.listLibrary();
const unreadable = await settings.unreadableVideos();
const plan = planRestore(read, [...lib.map((x) => x.entry.videoId), ...unreadable]);
const afterPreview = keys(area);
// المحفوظات في سياق آخر: أي remove لتوابع ID أثناء الاستعادة يُسجَّل
let cleanupHits = 0;
const libArea = { ...area, async remove(k) { if (Array.isArray(k) && k.includes(`alts:${ID}`)) cleanupHits++; return area.remove(k); } };
const library = createStore({ area: libArea });
const { items } = restoreItems(plan, new Set());
const [report] = await Promise.all([runRestore({ store: settings, items, pause: async () => {} }), library.listLibrary(), library.listLibrary()]);
const b = await createStore({ area }).getBundle(ID);
out('orphan-ui-flow', { orphansBefore: orphans, keysAfterPreview: afterPreview, planFresh: plan.fresh.length, report: { added: report.added.length }, libraryCleanupHits: cleanupHits, restored: { filled: b.slots.filter((s) => s.track).length, previous: !!b.previous } });
