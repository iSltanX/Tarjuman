// TJ-35: كلفة بديل getKeys (Chrome 111–129 وFirefox 140–142) على الوحدات الحقيقية، بقياسي أنا.
// (1) بايتات القراءة واستدعاءات get(null) لكل listLibrary، مع getKeys ودونها.
// (2) التضخيم: صفحة المحفوظات مفتوحة على البديل، وسياق آخر (المشغّل) يكتب خمس نقرات ± بفاصل 300 م.ث:
//     كم مرة تُقرأ المساحة كلها؟
import { TJ_ROOT } from '../../../verify/_root.mjs';
const T = `${TJ_ROOT}/`;
const { chromeLocalArea } = await import(`${T}src/core/store/area.js`);
const { createStore } = await import(`${T}src/core/store/index.js`);
const { createLibrary } = await import(`${T}src/pages/library/view.js`);
const { createMemoryArea } = await import(`${T}test/helpers/chrome-storage.js`);
const { videoRecord, makeCues } = await import(`${T}test/helpers/fixtures.js`);
const { newDocument, settle } = await import(`${T}test/unit/pages/library/fake-dom.js`);

const N = 100;
const mem = createMemoryArea({ unlimited: true });
const writer = createStore({ area: mem });
const ids = Array.from({ length: N }, (_, i) => `V${String(i).padStart(10, '0')}`);
for (const id of ids) await writer.updateVideo(id, () => ({ ...videoRecord({ videoId: id, cues: makeCues(400, { text: (i) => `سطر عربي رقم ${i} بكلمات ترجمة معتادة` }) }), title: `فيديو ${id}` }));
await mem.flush();
const totalBytes = Buffer.byteLength(JSON.stringify(await mem.get(null)));

function countingApi(withGetKeys) {
  const stats = { getNull: 0, readBytes: 0 };
  const local = {
    get: async (k) => { if (k === null) stats.getNull++; const r = await mem.get(k); stats.readBytes += Buffer.byteLength(JSON.stringify(r)); return r; },
    set: (i) => mem.set(i), remove: (k) => mem.remove(k), clear: () => mem.clear(), getBytesInUse: (k) => mem.getBytesInUse(k),
    ...(withGetKeys ? { getKeys: () => mem.getKeys() } : {}),
  };
  const listeners = new Set();
  mem.onChanged((c) => { for (const fn of listeners) fn(c, 'local'); });
  return { stats, api: { storage: { local, onChanged: { addListener: (fn) => listeners.add(fn), removeListener: (fn) => listeners.delete(fn) } }, runtime: { getManifest: () => ({ permissions: ['storage', 'unlimitedStorage', 'downloads'] }) } } };
}

console.log(`المساحة: ${N} فيديو، ${(totalBytes / 1048576).toFixed(2)} م.ب (JSON UTF-8)`);
for (const withGetKeys of [true, false]) {
  const { api, stats } = countingApi(withGetKeys);
  const store = createStore({ area: chromeLocalArea(api) });
  await store.listLibrary();
  stats.getNull = 0; stats.readBytes = 0;
  const t0 = performance.now();
  await store.listLibrary();
  console.log(`(1) ${withGetKeys ? 'مع getKeys' : 'البديل get(null)'}: قراءة ${(stats.readBytes / 1048576).toFixed(2)} م.ب لكل listLibrary، get(null)=${stats.getNull}، ${(performance.now() - t0).toFixed(1)} م.ث`);
}
{
  const { api, stats } = countingApi(false);
  const store = createStore({ area: chromeLocalArea(api) });
  const doc = newDocument();
  const lib = createLibrary({ store, doc, now: () => Date.now(), openTab: async () => {}, openPage: async () => {}, saveFile: async () => ({ ok: true }), clipboardWrite: async () => {}, pickFiles: async () => null, diagnosticsText: async () => '{}', confirm: async () => false, setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: (h) => clearTimeout(h) });
  doc.body.append(lib.root);
  await lib.load();
  await settle(5);
  stats.getNull = 0; stats.readBytes = 0;
  for (let i = 1; i <= 5; i++) {
    await writer.updateVideo(ids[0], (r) => ({ ...r, view: { ...r.view, displayOffsetMs: i * 100 } }));
    await new Promise((r) => setTimeout(r, 300));
  }
  await new Promise((r) => setTimeout(r, 400));
  console.log(`(2) المحفوظات مفتوحة على البديل، 5 نقرات ± من سياق آخر بفاصل 300 م.ث: get(null)=${stats.getNull}، قراءة ${(stats.readBytes / 1048576).toFixed(2)} م.ب، الحالة ${lib.state.status}`);
  lib.dispose();
}
