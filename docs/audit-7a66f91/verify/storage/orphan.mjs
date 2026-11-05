// STO-10 / P-2: تنظيف التوابع اليتيمة (removeOrphan: قراءة video:<id> ثم remove منفصلة) يتسابق مع استعادة في سياق آخر.
// (أ) عبر listLibrary في المحفوظات. (ب) عبر getVideo (مسار قراءة المشغّل). (ج) فهرس يتيم يُحذف بلا إعادة فحص في scanIndex
// بينما يكتب سياق آخر السجل وفهرسه: هل يصلح نفسه؟ (د) هل تنشأ توابع يتيمة من الإصدار الثاني وحده؟
import { load, out } from './common.mjs';
const { createStore } = await load('src/core/store/index.js');
const { bundleToBackup } = await load('src/core/model/bundle.js');
const { createMemoryArea } = await load('test/helpers/chrome-storage.js');
const { sampleBundle, seedBundle } = await load('test/helpers/fixtures-v2.js');
const ID = 'AAAAAAAAAAA';
const keys = (area) => Object.keys(area.dump()).filter((k) => k.endsWith(ID));
const shape = (b) => b && { filled: b.slots.filter((s) => s.track).length, previous: !!b.previous, marks: b.slots.reduce((n, s) => n + s.marks.length, 0), names: b.slots.map((s) => s.name) };

for (const via of ['listLibrary', 'getVideo']) {
  const area = createMemoryArea({ unlimited: true });
  const writer = createStore({ area });
  const full = await seedBundle(writer, sampleBundle({ videoId: ID, third: true }));
  const entry = bundleToBackup(full);
  await area.remove([`video:${ID}`, `index:${ID}`]); // كما يحذف tj-v1: السجل وفهرسه وحدهما
  const orphansBefore = keys(area);
  let armed = true; let restored = null;
  const readerArea = { ...area, async remove(k) {
    if (armed && Array.isArray(k) && k.includes(`alts:${ID}`)) { armed = false; restored = await writer.restoreVideo(entry); }
    return area.remove(k);
  } };
  const reader = createStore({ area: readerArea });
  const r = via === 'listLibrary' ? await reader.listLibrary() : await reader.getVideo(ID);
  const after = await createStore({ area }).getBundle(ID);
  out(`orphan-race-${via}`, { orphansBefore, restored, readerResult: via === 'listLibrary' ? r.length : r, keysAfter: keys(area), backup: shape(full), after: shape(after) });
}

{ // (ج) فهرس يتيم يُحذف دون إعادة فحص
  const area = createMemoryArea({ unlimited: true });
  const writer = createStore({ area });
  const full = await seedBundle(writer, sampleBundle({ videoId: ID }));
  const entry = bundleToBackup(full);
  await area.remove([`video:${ID}`]); // فهرس بلا سجل
  let armed = true;
  const readerArea = { ...area, async remove(k) {
    if (armed && Array.isArray(k) && k.includes(`index:${ID}`) && !k.includes(`alts:${ID}`)) { armed = false; await writer.deleteVideo(ID); await writer.restoreVideo(entry); }
    return area.remove(k);
  } };
  const reader = createStore({ area: readerArea });
  await reader.listLibrary();
  const mid = keys(area);
  const healed = (await createStore({ area }).listIndex()).map((e) => e.videoId);
  out('orphan-index-race', { keysAfterRace: mid, indexRebuiltOnNextList: healed, keysAfterHeal: keys(area) });
}

{ // (د) مسارات الحذف في الإصدار الثاني: هل تترك توابع؟
  const area = createMemoryArea({ unlimited: true });
  const s = createStore({ area });
  await seedBundle(s, sampleBundle({ videoId: ID }));
  await s.deleteVideo(ID);
  const a = keys(area);
  await seedBundle(s, sampleBundle({ videoId: ID }));
  await s.updateBundle(ID, () => null);
  const b = keys(area);
  await seedBundle(s, sampleBundle({ videoId: ID }));
  await s.updateVideo(ID, () => null);
  out('v2-delete-paths-leave-orphans', { deleteVideo: a, updateBundleNull: b, updateVideoNull: keys(area) });
}
