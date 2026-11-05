// TJ-17 (DATA-002) وTJ-18 (DATA-004) وملاحظة غير منقولة من DATA-002 («تراجع» التفعيل، view.js:301)، بواجهة المحفوظات الحقيقية
// فوق تخزين حقيقي، و«تبويب آخر» مخزن ثانٍ على المساحة نفسها.
import { load, out, settleAll, clockFrom } from './common.mjs';
const { createStore } = await load('src/core/store/index.js');
const { createLibrary } = await load('src/pages/library/view.js');
const { withSlotUpload, withActiveSlot, withoutSlot } = await load('src/core/model/bundle.js');
const { createMemoryArea } = await load('test/helpers/chrome-storage.js');
const { NOW, makeCues } = await load('test/helpers/fixtures.js');
const { sampleBundle, seedBundle } = await load('test/helpers/fixtures-v2.js');
const { buttonNamed, newDocument, settle: settleDom, textOf } = await load('test/unit/pages/library/fake-dom.js');
const { writeSrt } = await load('src/core/srt/writer.js');
const ID = 'AAAAAAAAAAA';
const short = (b) => ({
  active: b.active,
  slots: b.slots.map((s) => (s.track ? `${s.n}:${s.track.fileName.replace(`${ID}.`, '').replace('.ar.srt', '')}` : `${s.n}:—`)),
  previous: b.previous ? `من ${b.previous.from}: ${b.previous.track.fileName.replace(`${ID}.`, '').replace('.ar.srt', '')}` : null,
});
const upload = (label) => ({ videoId: ID, fileName: `${ID}.${label}.ar.srt`, cues: makeCues(4, { text: (i) => `${label} ${i}` }), comparison: null, fingerprintId: null, notes: [], displayModeDefault: 'ar', current: null });

async function mount({ pick = null, answer } = {}) {
  const now = clockFrom();
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now });
  const other = createStore({ area, now });
  await seedBundle(store, sampleBundle({ videoId: ID, third: true }));
  await area.flush();
  const doc = newDocument();
  const confirms = [];
  const lib = createLibrary({
    store, doc, now: () => Date.parse(NOW) + 3600e3, openTab: async () => {}, openPage: async () => {},
    saveFile: async () => ({ ok: true, mode: 'downloads', downloadId: 1 }), clipboardWrite: async () => {},
    pickFiles: async () => pick, diagnosticsText: async () => '{}', setTimer: () => 0, clearTimer: () => {},
    confirm: async (o) => { confirms.push({ title: o.title, text: o.content ? textOf(o.content) : o.body ?? '' }); return answer ? answer(o, { other, area }) : true; },
  });
  doc.body.append(lib.root);
  await lib.load();
  const row = () => lib.root.querySelectorAll('li.lib-row').find((r) => r.getAttribute('data-video') === ID);
  return { lib, doc, store, other, area, confirms, row, toasts: () => lib.root.querySelectorAll('.tj-toast').map((t) => textOf(t)) };
}
async function expand(m) { buttonNamed(m.row(), 'إظهار الترجمات').click(); await settleDom(10); return m.row().querySelector('.lib-exp'); }

// TJ-17: الحوار «…إلى الترجمة 2؟» (السابقة من 2)، وتبويب آخر يستبدل الترجمة 3 قبل الموافقة (فتصير السابقة منها).
{
  const m = await mount({
    answer: async (o, { other, area }) => {
      await other.updateBundle(ID, (b) => withSlotUpload(b, 3, upload('بديل3'), '2026-11-01T13:00:00.000Z', { replace: true }).bundle);
      await area.flush(); await settleAll();
      return true;
    },
  });
  const exp = await expand(m);
  const before = short(await m.store.getBundle(ID));
  buttonNamed(exp.querySelector('.lib-prevl'), 'استعادة').click();
  await settleDom(30);
  const after = short(await m.store.getBundle(ID));
  out('TJ-17 استعادة السابقة بتأكيد قديم (سيناريو DeepSeek = M-7)', { dialog: m.confirms[0].title, before, after, toasts: m.toasts() });
}

// TJ-18: «ملف بديل…» للترجمة 1 الممتلئة، والسابقة الحالية من الترجمة 2.
{
  const file = new File([writeSrt(makeCues(5, { text: (i) => `جديدة ${i}` }))], `${ID}.جديدة.ar.srt`);
  const m = await mount({ pick: [file] });
  const exp = await expand(m);
  const before = short(await m.store.getBundle(ID));
  const prevLineInCard = exp.querySelector('section[data-slot="2"]')?.querySelector('.lib-prevl') ? 'داخل بطاقة الترجمة 2' : 'خارجها';
  buttonNamed(exp.querySelector('section[data-slot="1"]'), 'ملف بديل…').click();
  await settleDom(40);
  const after = await m.store.getBundle(ID);
  const dialog = m.confirms[0]?.text ?? '';
  out('TJ-18 الرفع إلى خانة ممتلئة والسابقة من خانة أخرى', {
    before, previousShown: prevLineInCard,
    dialogPreviousSentences: dialog.match(/[^.،]*سابقة[^.]*\./g),
    dialogWarnsLoss: /السابقة الحالية|ستُحذف|تحل محل|لن تُستعاد|ستُفقد/.test(dialog),
    after: short(after),
    oldPreviousAnywhere: [after.previous?.track.fileName, ...after.slots.map((s) => s.track?.fileName)].includes(`${ID}.سابقة.ar.srt`),
    toasts: m.toasts(),
  });
}

// ملاحظة DATA-002 غير المنقولة: «تراجع» في رسالة التفعيل بعد تغيير من تبويب آخر.
for (const meanwhile of ['activate3', 'deleteSlot1', 'replaceSlot1']) {
  const m = await mount();
  m.row().querySelector('button[data-slot="2"]').click();
  await settleDom(20);
  const afterActivate = short(await m.store.getBundle(ID));
  if (meanwhile === 'activate3') await m.other.updateBundle(ID, (b) => withActiveSlot(b, 3, '2026-11-01T13:00:00.000Z'));
  if (meanwhile === 'deleteSlot1') await m.other.updateBundle(ID, (b) => withoutSlot(b, 1, '2026-11-01T13:00:00.000Z'));
  if (meanwhile === 'replaceSlot1') await m.other.updateBundle(ID, (b) => withSlotUpload(b, 1, upload('بديل1'), '2026-11-01T13:00:00.000Z', { replace: true }).bundle);
  await m.area.flush(); await settleDom(20);
  const otherDid = short(await m.store.getBundle(ID));
  const undo = m.lib.root.querySelectorAll('.tj-toast').flatMap((t) => t.querySelectorAll('button')).find((b) => textOf(b) === 'تراجع');
  if (undo) undo.click();
  await settleDom(30);
  out(`«تراجع» التفعيل بعد ${meanwhile} من تبويب آخر`, { afterActivate, otherDid, undoFound: !!undo, afterUndo: short(await m.store.getBundle(ID)), toasts: m.toasts() });
}
