// TJ-05 (06): ما تعرضه المحفوظات بعد عودة فيديو جزئيًا بكتابة ± «في الطريق» وصلت بعد «مسح كل البيانات» (ومثلها بعد حذف مؤكد).
import { load, out, settle, settleAll, clockFrom, hooked } from './common.mjs';
const { createStore } = await load('src/core/store/index.js');
const { createController } = await load('src/content/controller.js');
const { createLibrary } = await load('src/pages/library/view.js');
const { deleteVideoData } = await load('src/pages/library/actions.js');
const { createMemoryArea } = await load('test/helpers/chrome-storage.js');
const { NOW } = await load('test/helpers/fixtures.js');
const { sampleBundle, seedBundle } = await load('test/helpers/fixtures-v2.js');
const { buttonNamed, newDocument, settle: settleDom, textOf } = await load('test/unit/pages/library/fake-dom.js');
const ID = 'AAAAAAAAAAA';

for (const wipe of ['clearAll', 'deleteVideoData(all, expect)']) {
  const base = createMemoryArea({ unlimited: true });
  const h = hooked(base);
  const now = clockFrom();
  const other = createStore({ area: base, now });
  const pl = createStore({ area: h.area, now });
  await seedBundle(other, sampleBundle({ videoId: ID, third: true }));
  await base.flush();
  const c = createController({ store: pl, now, page: {}, extractor: null });
  pl.onChange((ch) => c.handleStoreChange(ch));
  await c.start(ID); await settleAll();
  const seen = await other.getBundle(ID);
  h.before(`video:${ID}`, () => (wipe === 'clearAll' ? other.clearAll() : deleteVideoData({ store: other, videoId: ID, scope: 'all', expect: seen, now })));
  await settle(c.nudgeOffset(1));
  await base.flush(); await settleAll();
  const store = createStore({ area: base, now });
  const doc = newDocument();
  const lib = createLibrary({
    store, doc, now: () => Date.parse(NOW) + 3600e3, openTab: async () => {}, openPage: async () => {},
    saveFile: async () => ({ ok: true }), clipboardWrite: async () => {}, pickFiles: async () => null, diagnosticsText: async () => '{}',
    setTimer: () => 0, clearTimer: () => {}, confirm: async () => false,
  });
  doc.body.append(lib.root);
  await lib.load();
  const row = lib.root.querySelectorAll('li.lib-row').find((r) => r.getAttribute('data-video') === ID);
  let rowText = null; let expText = null;
  if (row) {
    rowText = textOf(row).replace(/\s+/g, ' ').slice(0, 200);
    buttonNamed(row, 'إظهار الترجمات').click();
    await settleDom(20);
    expText = textOf(row.querySelector('.lib-exp')).replace(/\s+/g, ' ').slice(0, 260);
  }
  const head = base.dump()[`bundle:${ID}`];
  out(`عودة جزئية بعد ${wipe}`, { keys: Object.keys(base.dump()).sort(), headSummary: head?.summary ?? null, rowText, expText });
  // كتابة لاحقة (± من المشغّل) تصحح الرأس؟
  await settle(c.nudgeOffset(1)); await base.flush(); await settleAll();
  out(`بعد كتابة لاحقة (${wipe})`, { headSummaryFilled: base.dump()[`bundle:${ID}`]?.summary?.filled ?? null });
}
