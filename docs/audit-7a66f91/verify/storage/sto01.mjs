// STO-01: كتابة سياق A (المحرّر بـexpect) تقع بعد آخر إعادة فحص وقبل set، وسياق B يكمل عمليته في هذا الفاصل.
// (أ) B يحذف الفيديو كله بتأكيد (deleteVideoData scope=all وexpect). (ب) B يحفظ تحريرًا آخر للعبارة نفسها.
// (ج) قياس عرض الفاصل (من حلّ قراءة إعادة الفحص إلى استدعاء set) لحزمة كبيرة في سياق واحد.
import { load, out } from './common.mjs';
const { createStore } = await load('src/core/store/index.js');
const { saveSlot } = await load('src/pages/editor/persist.js');
const { deleteVideoData } = await load('src/pages/library/actions.js');
const { createMemoryArea } = await load('test/helpers/chrome-storage.js');
const { sampleBundle, seedBundle } = await load('test/helpers/fixtures-v2.js');
const { makeCues } = await load('test/helpers/fixtures.js');

const id = 'AAAAAAAAAAA';
let t = Date.parse('2026-11-01T12:00:00.000Z');
const now = () => (t += 1000);

for (const op of ['delete', 'edit']) {
  const area = createMemoryArea({ unlimited: true });
  let hook = null;
  // A: قبل set لسجل الفيديو يُنفَّذ فعل B كاملًا (أي بعد آخر قراءة لـvideo:<id> في writeBundle).
  const areaA = { ...area, async set(items) { if (hook && items[`video:${id}`]) { const h = hook; hook = null; await h(); } return area.set(items); } };
  const A = createStore({ area: areaA, now });
  const B = createStore({ area, now });
  const opened = await seedBundle(A, sampleBundle({ videoId: id }));
  const openedB = await B.getBundle(id);
  const cuesA = structuredClone(opened.slots[0].track.current); cuesA[0].text = 'نص-A';
  let bResult = null;
  hook = async () => {
    if (op === 'delete') {
      await deleteVideoData({ store: B, videoId: id, scope: 'all', expect: openedB, now });
      bResult = { afterDeleteKeys: Object.keys(area.dump()).filter((k) => k.endsWith(id)) };
    } else {
      const cuesB = structuredClone(openedB.slots[0].track.current); cuesB[0].text = 'نص-B';
      const r = await saveSlot(B, id, openedB, 1, { cues: cuesB, offsetChanged: false, offsetMs: 0 }, { now });
      bResult = { bRev: r.record.rev, bText: r.slots[0].track.current[0].text };
    }
  };
  const aRes = await saveSlot(A, id, opened, 1, { cues: cuesA, offsetChanged: false, offsetMs: 0 }, { now }).then((r) => ({ ok: true, rev: r.record.rev }), (e) => ({ ok: false, code: e.code }));
  const C = createStore({ area, now });
  const final = await C.getBundle(id).catch((e) => ({ err: e.code }));
  out(`STO-01-${op}`, {
    A: aRes, B: bResult,
    keysAfter: Object.keys(area.dump()).filter((k) => k.endsWith(id)),
    final: final && !final.err ? {
      rev: final.record.rev, text0: final.slots[0].track?.current?.[0]?.text,
      filledSlots: final.slots.filter((s) => s.track).map((s) => s.n), slot2Name: final.slots[1].name, previous: !!final.previous,
      marks: final.slots.map((s) => s.marks.length),
    } : final,
  });
}

// (ج) عرض الفاصل في سياق واحد لحزمة كبيرة: من حلّ آخر area.get (إعادة فحص video:<id>) إلى استدعاء area.set.
{
  const area = createMemoryArea({ unlimited: true });
  let lastGetResolved = 0; const gaps = [];
  const timed = {
    ...area,
    async get(keys) { const r = await area.get(keys); lastGetResolved = performance.now(); return r; },
    async set(items) { if (items[`video:${id}`]) gaps.push(performance.now() - lastGetResolved); return area.set(items); },
  };
  const S = createStore({ area: timed, now });
  const big = sampleBundle({ videoId: id, third: true });
  const many = (label) => makeCues(2000, { text: (i) => `${label} ${'ع'.repeat(60)} ${i}` });
  for (const s of big.slots) { if (s.track) { s.track.original = many(`خ${s.n}`); s.track.current = s.n === 1 ? many('معدّل') : null; s.marks = []; s.position = null; } }
  big.record.arabic = structuredClone(big.slots[0].track);
  big.previous.track.original = many('سابقة');
  await seedBundle(S, big);
  gaps.length = 0;
  const opened = await S.getBundle(id);
  for (let i = 0; i < 5; i++) {
    const cur = await S.getBundle(id);
    const cues = structuredClone(cur.slots[0].track.current); cues[0].text = `تعديل ${i}`;
    await saveSlot(S, id, cur, 1, { cues, offsetChanged: false, offsetMs: 0 }, { now });
  }
  out('STO-01-window', { cuesPerTrack: 2000, tracks: 4, bytes: JSON.stringify(area.dump()).length, gapMs: gaps.map((g) => Math.round(g * 10) / 10), openedRev: opened.record.rev });
}
