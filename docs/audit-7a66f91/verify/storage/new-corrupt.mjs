// ملاحظة جديدة (من جذر STO-01): كتابتان متداخلتان من سياقين تكتب كلٌّ منهما «التوابع المتغيرة وحدها» مع رأس الحزمة دائمًا،
// فقد يبقى في التخزين رأس أحدهما وتوابع الآخر: خليط يرفضه checkRaw («خانة النشطة خارج السجل») فيصير الفيديو كله
// ST_CORRUPT_RECORD. نختبر أزواجًا واقعية بترتيب مفروض (فعل ب كاملًا داخل set لـأ)، ثم بتزامن طبيعي بلا خطاف.
import { load, out } from './common.mjs';
const { createStore } = await load('src/core/store/index.js');
const { createController } = await load('src/content/controller.js');
const { writePosition, saveSlot } = await load('src/pages/editor/persist.js');
const { activateSlot, deleteSlot, renameSlot } = await load('src/pages/library/actions.js');
const { withActiveSlot } = await load('src/core/model/bundle.js');
const { createMemoryArea } = await load('test/helpers/chrome-storage.js');
const { NOW } = await load('test/helpers/fixtures.js');
const { sampleBundle, seedBundle } = await load('test/helpers/fixtures-v2.js');
const id = 'AAAAAAAAAAA';
let t = Date.parse(NOW);
const now = () => (t += 1000);

async function setup(hookOn) {
  const area = createMemoryArea({ unlimited: true });
  let hook = null;
  const areaA = { ...area, async set(items) { if (hookOn && hook && items[`video:${id}`]) { const h = hook; hook = null; await h(); } return area.set(items); } };
  const sA = createStore({ area: areaA, now }); const sB = createStore({ area, now });
  await seedBundle(sA, sampleBundle({ videoId: id, third: true }));
  return { area, sA, sB, setHook: (h) => { hook = h; } };
}
async function verdict(area) {
  const r = await createStore({ area }).getBundle(id).then((b) => ({ ok: true, active: b.active, filled: b.slots.map((s) => !!s.track) }), (e) => ({ ok: false, code: e.code, detail: e.detail }));
  const lib = await createStore({ area }).listLibrary();
  return { ...r, listedInLibrary: lib.some((x) => x.entry.videoId === id) };
}

const pairs = {
  'مشغّل ± (أ) × تفعيل الخانة 2 في المحفوظات (ب)': {
    A: async ({ sA }) => { const c = createController({ store: sA, page: {}, extractor: null }); await c.start(id); return () => c.nudgeOffset(1); },
    B: ({ sB }) => activateSlot({ store: sB, videoId: id, n: 2, now }),
  },
  'المحرّر: حفظ آخر موضع بـexpect (أ) × تفعيل الخانة 2 في المحفوظات (ب)': {
    A: async ({ sA }) => { const opened = await sA.getBundle(id); return () => writePosition(sA, id, opened, 1, 2, { now }); },
    B: ({ sB }) => activateSlot({ store: sB, videoId: id, n: 2, now }),
  },
  'المحرّر: حفظ الخانة 1 (أ) × تفعيل الخانة 3 من المشغّل (ب)': {
    A: async ({ sA }) => { const opened = await sA.getBundle(id); const cues = structuredClone(opened.slots[0].track.current); cues[0].text = 'x'; return () => saveSlot(sA, id, opened, 1, { cues, offsetChanged: false, offsetMs: 0 }, { now }); },
    B: async ({ sB }) => { const c = createController({ store: sB, page: {}, extractor: null }); await c.start(id); return c.activateSlot(3); },
  },
  'تسمية الخانة 2 في المحفوظات (أ) × حذف الخانة 1 النشطة في تبويب آخر (ب)': {
    A: async ({ sA }) => () => renameSlot({ store: sA, videoId: id, n: 2, name: 'اسم' }),
    B: async ({ sB }) => deleteSlot({ store: sB, videoId: id, n: 1, now, expect: await sB.getBundle(id) }),
  },
};

for (const [name, p] of Object.entries(pairs)) {
  // (1) ترتيب مفروض: فعل ب يكتمل بين آخر إعادة فحص لـأ وset الخاصة به
  {
    const env = await setup(true);
    const runA = await p.A(env);
    let bErr = null;
    env.setHook(async () => { try { await p.B(env); } catch (e) { bErr = e.code; } });
    const aRes = await runA().then(() => 'ok', (e) => e.code);
    await env.area.flush();
    out(`forced | ${name}`, { A: aRes, B: bErr ?? 'ok', result: await verdict(env.area) });
  }
  // (2) تزامن طبيعي بلا خطاف: يبدأ الفعلان في الدورة نفسها، بالترتيبين
  for (const first of ['A', 'B']) {
    const env = await setup(false);
    const runA = await p.A(env);
    const ops = first === 'A' ? [() => runA(), () => p.B(env)] : [() => p.B(env), () => runA()];
    const res = await Promise.allSettled(ops.map((f) => f()));
    await env.area.flush();
    out(`natural(${first} first) | ${name}`, { settled: res.map((r) => (r.status === 'fulfilled' ? 'ok' : r.reason.code)), result: await verdict(env.area) });
  }
}
