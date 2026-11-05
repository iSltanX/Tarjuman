// STO-04 / TJ-AUD-001 / M-7: حوار «استعادة النسخة السابقة» في المحفوظات مفتوح (عبر واجهة التوسيع الحقيقية)، وتبويب آخر
// يستبدل خانة فتتغير السابقة، وتصل إشعارات التخزين وتُعاد الرسوم أثناء الحوار، ثم يوافق المستخدم.
// ضابط: «حذف النسخة السابقة» بالسباق نفسه يُرفض بـPG_DELETE_STALE.
import { load, out } from './common.mjs';
const { createStore } = await load('src/core/store/index.js');
const { createLibrary } = await load('src/pages/library/view.js');
const { withSlotUpload } = await load('src/core/model/bundle.js');
const { createMemoryArea } = await load('test/helpers/chrome-storage.js');
const { NOW, makeCues } = await load('test/helpers/fixtures.js');
const { sampleBundle, seedBundle } = await load('test/helpers/fixtures-v2.js');
const { buttonNamed, newDocument, settle, textOf } = await load('test/unit/pages/library/fake-dom.js');

const ID = 'AAAAAAAAAAA';
function timers() {
  let n = 0; const q = new Map();
  return {
    setTimer: (fn, ms) => { q.set(++n, { fn, ms }); return n; }, clearTimer: (id) => q.delete(id),
    async runAll() { for (let i = 0; i < 20 && q.size; i++) { const b = [...q.entries()]; q.clear(); for (const [, t] of b) t.fn(); await settle(2); } },
  };
}

async function scenario(name, { prevFrom, replaceSlot, action = 'restore' }) {
  let t = Date.parse(NOW);
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now: () => (t += 1000) });
  const other = createStore({ area, now: () => (t += 1000) });
  const b0 = sampleBundle({ videoId: ID, third: true });
  b0.previous = { ...b0.previous, from: prevFrom };
  await seedBundle(store, b0);
  await area.flush();
  const doc = newDocument();
  const clock = timers();
  const confirms = [];
  let racedPrev = null;
  const lib = createLibrary({
    store, doc, now: () => Date.parse(NOW) + 3600e3, openTab: async () => {}, openPage: async () => {},
    saveFile: async () => ({ ok: true }), clipboardWrite: async () => {}, pickFiles: async () => null, diagnosticsText: async () => '{}',
    setTimer: clock.setTimer, clearTimer: clock.clearTimer,
    confirm: async (o) => {
      confirms.push(o.title);
      // والحوار مفتوح: التبويب الآخر يستبدل الخانة replaceSlot، وتصل الإشعارات وتُعاد الرسوم.
      await other.updateBundle(ID, (b) => withSlotUpload(b, replaceSlot, {
        videoId: ID, fileName: `${ID}.جديد-${replaceSlot}.ar.srt`, cues: makeCues(4, { text: (i) => `جديد ${i}` }),
        comparison: null, fingerprintId: null, notes: [], displayModeDefault: 'ar', current: null,
      }, new Date(t += 1000).toISOString(), { replace: true }).bundle);
      racedPrev = (await other.getBundle(ID)).previous;
      await area.flush(); await clock.runAll(); await settle(10);
      return true;
    },
  });
  doc.body.append(lib.root);
  await lib.load();
  const row = lib.root.querySelectorAll('li.lib-row').find((r) => r.getAttribute('data-video') === ID);
  buttonNamed(row, 'إظهار الترجمات').click();
  await settle(10);
  const exp = row.querySelector('.lib-exp');
  const before = await store.getBundle(ID);
  const prevLine = exp.querySelector('.lib-prevl');
  buttonNamed(prevLine, action === 'restore' ? 'استعادة' : 'حذف').click();
  await settle(20);
  const toasts = lib.root.querySelectorAll('.tj-toast').map((x) => textOf(x));
  await area.flush(); await clock.runAll(); await settle(10);
  const after = await store.getBundle(ID);
  const files = (b) => b.slots.map((s) => s.track?.fileName.replace(`${ID}.`, '') ?? null);
  out(name, {
    dialogTitle: confirms[0], shownPrevFrom: before.previous.from, shownPrevFile: before.previous.track.fileName.replace(`${ID}.`, ''),
    afterOtherTab: { prevFrom: racedPrev.from, prevFile: racedPrev.track.fileName.replace(`${ID}.`, '') },
    final: { slots: files(after), active: after.active, prevFrom: after.previous?.from ?? null, prevFile: after.previous?.track.fileName.replace(`${ID}.`, '') ?? null },
    toasts,
  });
}

await scenario('STO-04 (السابقة من 2، التبويب الآخر يستبدل 1)', { prevFrom: 2, replaceSlot: 1 });
await scenario('M-7 (السابقة من 2، التبويب الآخر يستبدل 3)', { prevFrom: 2, replaceSlot: 3 });
await scenario('TJ-AUD-001 (السابقة من 1، التبويب الآخر يستبدل 2)', { prevFrom: 1, replaceSlot: 2 });
await scenario('ضابط: حذف السابقة بالسباق نفسه', { prevFrom: 2, replaceSlot: 1, action: 'delete' });
