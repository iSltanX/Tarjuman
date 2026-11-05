// TJ-AUD-021: بطاقة الخانة 3 معروضة في التوسيع، وتبويب آخر يحذف الخانة 3 وحدها (الفيديو باقٍ). ثم «حذف…» على البطاقة القديمة.
// (أ) قبل وصول الإشعار. (ب) بعد وصوله والمستخدم يحرّر اسم خانة أخرى (refresh يُتخطى أثناء التحرير، expand.js:342).
import { load, out } from './common.mjs';
const { createStore } = await load('src/core/store/index.js');
const { createLibrary } = await load('src/pages/library/view.js');
const { deleteSlot } = await load('src/pages/library/actions.js');
const { createMemoryArea } = await load('test/helpers/chrome-storage.js');
const { NOW } = await load('test/helpers/fixtures.js');
const { sampleBundle, seedBundle } = await load('test/helpers/fixtures-v2.js');
const { buttonNamed, newDocument, settle, textOf } = await load('test/unit/pages/library/fake-dom.js');
const ID = 'AAAAAAAAAAA';

for (const mode of ['before-event', 'editing-other-name']) {
  let t = Date.parse(NOW);
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now: () => (t += 1000) });
  const other = createStore({ area, now: () => (t += 1000) });
  await seedBundle(store, sampleBundle({ videoId: ID, third: true }));
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
  const shown = [];
  const orig = lib.toaster.show.bind(lib.toaster);
  lib.toaster.show = (text, tone, o) => { shown.push(`${tone}: ${text}`); return orig(text, tone, o); };
  await lib.load();
  const row = () => lib.root.querySelectorAll('li.lib-row').find((r) => r.getAttribute('data-video') === ID);
  buttonNamed(row(), 'إظهار الترجمات').click();
  await settle(10);
  const exp = row().querySelector('.lib-exp');
  if (mode === 'editing-other-name') { buttonNamed(exp.querySelector('section[data-slot="2"]'), 'إعادة تسمية الترجمة 2').click(); await settle(2); }
  const staleCard = exp.querySelector('section[data-slot="3"]');
  await deleteSlot({ store: other, videoId: ID, n: 3, now: () => (t += 1000) });
  if (mode === 'editing-other-name') { await area.flush(); await settle(20); }
  const cardStillShown = !!row()?.querySelector('section[data-slot="3"]');
  const delBtn = buttonNamed(staleCard, 'حذف…');
  delBtn.click();
  await settle(20);
  const toasts = lib.root.querySelectorAll('.tj-toast').map((x) => textOf(x));
  const b = await store.getBundle(ID);
  out(`TJ-AUD-021-${mode}`, { cardStillShownAfterOtherDelete: cardStillShown, confirms, toasts, shown, delBtnLabel: delBtn?.getAttribute('aria-label'), videoStillSaved: !!b, filled: b.slots.map((s) => !!s.track) });
}
