// تفصيل الزوج الرابع من new-corrupt.mjs: أسماء الملفات في كل خانة بعد التداخل المفروض.
import { load, out } from './common.mjs';
const { createStore } = await load('src/core/store/index.js');
const { deleteSlot, renameSlot } = await load('src/pages/library/actions.js');
const { createMemoryArea } = await load('test/helpers/chrome-storage.js');
const { sampleBundle, seedBundle } = await load('test/helpers/fixtures-v2.js');
const id = 'AAAAAAAAAAA';
let t = Date.parse('2026-11-01T12:00:00Z'); const now = () => (t += 1000);
const area = createMemoryArea({ unlimited: true });
let hook = null;
const areaA = { ...area, async set(items) { if (hook && items[`video:${id}`]) { const h = hook; hook = null; await h(); } return area.set(items); } };
const sA = createStore({ area: areaA, now }); const sB = createStore({ area, now });
const seeded = await seedBundle(sA, sampleBundle({ videoId: id, third: true }));
const names = (b) => b.slots.map((s) => s.track?.fileName.replace(`${id}.`, '') ?? null);
let afterB = null;
hook = async () => { await deleteSlot({ store: sB, videoId: id, n: 1, now, expect: await sB.getBundle(id) }); afterB = names(await createStore({ area }).getBundle(id)); };
await renameSlot({ store: sA, videoId: id, n: 2, name: 'اسم' });
const fin = await createStore({ area }).getBundle(id);
out('pair4-detail', { before: names(seeded), afterBDeleteSlot1: afterB, final: names(fin), finalActive: fin.active, finalNames: fin.slots.map((s) => s.name) });
