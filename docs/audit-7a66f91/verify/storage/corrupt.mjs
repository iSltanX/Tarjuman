// STO-08 وTJ-HYP-002: سجل تالف يظهر صفًا في المحفوظات، ثم «المزيد ← حذف بيانات الفيديو…» من الواجهة الحقيقية.
// (أ) تابع العلامات تالف والسجل والفهرس سليمان (STO-08). (ب) السجل video:<id> تالف والفهرس index:<id> سليم (TJ-HYP-002).
// (ج) ضابط: السجل تالف والفهرس غائب (الحالة التي صُمّمت لها unreadableVideos).
import { load, out } from './common.mjs';
const { createStore } = await load('src/core/store/index.js');
const { createLibrary } = await load('src/pages/library/view.js');
const { createMemoryArea } = await load('test/helpers/chrome-storage.js');
const { NOW } = await load('test/helpers/fixtures.js');
const { sampleBundle, seedBundle } = await load('test/helpers/fixtures-v2.js');
const { buttonNamed, newDocument, settle, textOf } = await load('test/unit/pages/library/fake-dom.js');
const ID = 'AAAAAAAAAAA';

async function scenario(name, corrupt) {
  let t = Date.parse(NOW);
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now: () => (t += 1000) });
  await seedBundle(store, sampleBundle({ videoId: ID }));
  corrupt(area);
  await area.flush();
  const doc = newDocument();
  const confirms = [];
  const lib = createLibrary({
    store, doc, now: () => Date.parse(NOW) + 3600e3, openTab: async () => {}, openPage: async () => {},
    saveFile: async () => ({ ok: true }), clipboardWrite: async () => {}, pickFiles: async () => null, diagnosticsText: async () => '{}',
    setTimer: (fn) => setTimeout(fn, 0), clearTimer: (x) => clearTimeout(x),
    confirm: async (o) => { confirms.push(o.title); return true; },
  });
  doc.body.append(lib.root);
  await lib.load();
  const rows = lib.root.querySelectorAll('li.lib-row');
  const row = rows.find((r) => r.getAttribute('data-video') === ID);
  let toasts = []; let menuLabels = null; let clicked = null;
  if (row) {
    const more = buttonNamed(row, 'المزيد');
    more.click();
    const item = more.parentNode.querySelectorAll('[role=menuitem]').find((i) => textOf(i).startsWith('حذف بيانات الفيديو'));
    item.click();
    await settle(20);
    toasts = [...lib.root.querySelectorAll('.tj-toast').map((x) => textOf(x)), ...(lib.toaster?.live ? [textOf(lib.toaster.live)] : []), ...doc.body.querySelectorAll('.tj-toast').map((x) => 'body:' + textOf(x))];
    menuLabels = more.parentNode.querySelectorAll('[role=menuitem]').map((i) => textOf(i));
    clicked = !!item;
  }
  out(name, {
    rowsShown: rows.length, rowFound: !!row, unreadableVideos: await store.unreadableVideos(),
    getBundle: await store.getBundle(ID).then(() => 'ok', (e) => e.code),
    confirmsOpened: confirms, toasts, clicked, menuLabels, keysAfter: Object.keys(area.dump()).filter((k) => k.endsWith(ID)),
  });
}
await scenario('STO-08 marks تالف', (area) => area.rawSet(`marks:${ID}`, { broken: true }));
await scenario('TJ-HYP-002 video تالف وindex سليم', (area) => area.rawSet(`video:${ID}`, { broken: true }));
await scenario('ضابط: video تالف وindex غائب', (area) => { area.rawSet(`video:${ID}`, { broken: true }); area.remove([`index:${ID}`]); });
