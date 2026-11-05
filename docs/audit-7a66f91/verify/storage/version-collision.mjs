// ملحق STO-01: كاتبان في فاصل السباق يحسبان rev نفسه (المخزَّن + 1)، فإن وقع updatedAt في الملي ثانية نفسها (ساعتا سياقين
// مختلفين، وهو أرجح ما يكون في السباق نفسه) صارت النسختان متطابقتين في versionOf، فيعدّ المحرّر الخاسر كتابة الفائز «صدى» لكتابته.
import { load, out } from './common.mjs';
const { createStore } = await load('src/core/store/index.js');
const { saveSlot, classifyChange } = await load('src/pages/editor/persist.js');
const { createMemoryArea } = await load('test/helpers/chrome-storage.js');
const { sampleBundle, seedBundle } = await load('test/helpers/fixtures-v2.js');
const id = 'AAAAAAAAAAA';
const fixed = () => Date.parse('2026-11-05T10:00:00.123Z'); // الملي ثانية نفسها في السياقين
const area = createMemoryArea({ unlimited: true });
let hook = null;
const areaA = { ...area, async set(items) { if (hook && items[`video:${id}`]) { const h = hook; hook = null; await h(); } return area.set(items); } };
const A = createStore({ area: areaA, now: fixed }); const B = createStore({ area, now: fixed });
const opened = await seedBundle(createStore({ area, now: () => Date.parse('2026-11-01T00:00:00Z') }), sampleBundle({ videoId: id }));
const oa = await A.getBundle(id); const ob = await B.getBundle(id);
let bSaved = null; const events = [];
B.onChange((c) => { if (c.videos[id]) events.push(c.videos[id]); });
hook = async () => { const cues = structuredClone(ob.slots[0].track.current); cues[0].text = 'نص-B'; bSaved = await saveSlot(B, id, ob, 1, { cues, offsetChanged: false, offsetMs: 0 }, { now: fixed }); };
const cuesA = structuredClone(oa.slots[0].track.current); cuesA[0].text = 'نص-A';
await saveSlot(A, id, oa, 1, { cues: cuesA, offsetChanged: false, offsetMs: 0 }, { now: fixed });
await area.flush();
const finalRec = (await B.getBundle(id)).record;
const lastEvent = events.at(-1);
out('STO-01-version-collision', {
  seededRev: opened.record.rev, bSavedVersion: `${bSaved.record.rev}|${bSaved.record.updatedAt}`, storedVersion: `${finalRec.rev}|${finalRec.updatedAt}`,
  storedText: finalRec.arabic.current[0].text,
  editorBClassifiesWinnerAs: classifyChange(bSaved, lastEvent),
});
