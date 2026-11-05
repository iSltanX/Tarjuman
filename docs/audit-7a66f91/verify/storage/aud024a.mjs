// TJ-AUD-024a: controller.js:517 يُهمل حدثًا نسخته rev أقل من المحفوظ دون مقارنة createdAt. سياق آخر يحذف الفيديو ثم ينشئه
// من جديد (rev 1). هل ينتهي المتحكم بحالة قديمة؟ ثلاث حالات:
// (1) تسليم عادي للأحداث بالترتيب. (2) المتحكم لديه كتابة معلّقة أثناء الحدثين. (3) ترتيب عدائي: رد القراءة التي أطلقها حدث
// الحذف (وقد نُفّذت قبل الإنشاء فعادت null) يصل بعد حدث الإنشاء (ممكن نظريًا إن لم تُرتَّب قناتا الرد والأحداث).
import { load, out } from './common.mjs';
const { createStore } = await load('src/core/store/index.js');
const { createController } = await load('src/content/controller.js');
const { bundleToBackup } = await load('src/core/model/bundle.js');
const { createMemoryArea } = await load('test/helpers/chrome-storage.js');
const { sampleBundle, seedBundle } = await load('test/helpers/fixtures-v2.js');
const id = 'AAAAAAAAAAA';
const settle = async (n = 10) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };

async function run(mode) {
  const area = createMemoryArea({ unlimited: true });
  let holdGet = null; // (3): يحجز رد قراءة واحدة حتى يُفرج عنه
  const areaA = { ...area, async get(keys) { const r = await area.get(keys); if (holdGet) { const h = holdGet; holdGet = null; await h; } return r; } };
  const sA = createStore({ area: areaA }); const sB = createStore({ area });
  const full = await seedBundle(sB, sampleBundle({ videoId: id }));
  for (let i = 0; i < 3; i++) await sB.updateBundle(id, (b) => ({ ...b, record: { ...b.record, title: `t${i}` } }));
  const A = createController({ store: sA, page: {}, extractor: null });
  sA.onChange((c) => A.handleStoreChange(c));
  await A.start(id); await area.flush(); await settle();
  const before = A.getState().saved?.rev;
  let writing = null;
  if (mode === 'pending-write') writing = A.nudgeOffset(1); // كتابة لـأ جارية
  let release;
  if (mode === 'adversarial') holdGet = new Promise((r) => { release = r; });
  await sB.deleteVideo(id);
  if (mode === 'adversarial') await settle(3); // يصل حدث الحذف، ويطلق reloadIfNewer قراءة تُحجز بعد أن قرأت null
  await sB.restoreVideo(bundleToBackup(full)); // إنشاء جديد rev 1
  await area.flush(); await settle(3);
  if (mode === 'adversarial') { release(); }
  if (writing) await writing.catch(() => {});
  await area.flush(); await settle();
  const st = A.getState();
  const stored = await sB.getVideo(id);
  return { revBefore: before, storedRev: stored?.rev ?? null, controllerHasArabic: !!st.arabic, controllerRev: st.bundle?.record?.rev ?? null, stale: !!stored && !st.arabic };
}
for (const mode of ['normal', 'pending-write', 'adversarial']) out(`TJ-AUD-024a-${mode}`, await run(mode));
