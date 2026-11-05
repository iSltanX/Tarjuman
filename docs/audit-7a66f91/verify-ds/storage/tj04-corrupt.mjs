// TJ-04 (DATA-003): سجل تالف لا يُحذف ولا يُصلح من أي واجهة، ورسالته تقول «يمكنك حذفه من المحفوظات».
// ثلاثة أشكال تلف: (أ) video:<id> بحقل english نصّي كما في الاختبار الحي 17 لدى DeepSeek، (ب) تابع alts تالف والسجل سليم،
// (ج) السجل تالف ومُلخّصه غائب. ولكل منها: كل بنود «المزيد» التي تكتب، والمحرّر، والمشغّل، والنسخة الاحتياطية، وما يصلحه فعلًا.
import { load, out, settle, clockFrom, settleAll } from './common.mjs';
const { createStore } = await load('src/core/store/index.js');
const { createLibrary } = await load('src/pages/library/view.js');
const { createController } = await load('src/content/controller.js');
const { mountEditor } = await load('src/pages/editor/app.js');
const { createBackup, readBackup } = await load('src/core/backup/index.js');
const { createMemoryArea } = await load('test/helpers/chrome-storage.js');
const { NOW, makeCues } = await load('test/helpers/fixtures.js');
const { sampleBundle, seedBundle } = await load('test/helpers/fixtures-v2.js');
const { buttonNamed, newDocument, settle: settleDom, textOf } = await load('test/unit/pages/library/fake-dom.js');
const { editorDocument } = await load('test/helpers/editor-dom.js');
const { writeSrt } = await load('src/core/srt/writer.js');
const { messageFor } = await load('src/core/errors/index.js');
const ID = 'AAAAAAAAAAA';

async function world(corrupt) {
  const now = clockFrom();
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now });
  await seedBundle(store, sampleBundle({ videoId: ID }));
  // نسخة احتياطية قبل التلف (لإثبات أن «استبدال» من نسخة قديمة هو المخرج الوحيد غير المسح الكامل).
  const older = await createBackup({ store, appVersion: 't', now, pause: async () => {} });
  corrupt(area);
  await area.flush();
  return { area, store, now, older };
}

async function mountLib(store, { pick = null } = {}) {
  const doc = newDocument();
  const confirms = [];
  const lib = createLibrary({
    store, doc, now: () => Date.parse(NOW) + 3600e3, openTab: async () => {}, openPage: async () => {},
    saveFile: async () => ({ ok: true, mode: 'downloads', downloadId: 1 }), clipboardWrite: async () => {},
    pickFiles: async () => pick, diagnosticsText: async () => '{}',
    setTimer: () => 0, clearTimer: () => {},
    confirm: async (o) => { confirms.push(o.title); return true; },
  });
  doc.body.append(lib.root);
  await lib.load();
  return { lib, doc, confirms };
}

const toastsOf = (m) => m.lib.root.querySelectorAll('.tj-toast').map((x) => textOf(x));

async function menuAction(store, label, opts) {
  const m = await mountLib(store, opts);
  const row = m.lib.root.querySelectorAll('li.lib-row').find((r) => r.getAttribute('data-video') === ID);
  if (!row) return { rowShown: false };
  const more = buttonNamed(row, 'المزيد');
  more.click();
  const item = more.parentNode.querySelectorAll('[role=menuitem]').find((i) => textOf(i).startsWith(label));
  if (!item) return { rowShown: true, item: 'غير موجود' };
  item.click();
  await settleDom(30);
  return { rowShown: true, confirms: m.confirms, toasts: toastsOf(m) };
}

async function expandRow(store) {
  const m = await mountLib(store);
  const row = m.lib.root.querySelectorAll('li.lib-row').find((r) => r.getAttribute('data-video') === ID);
  if (!row) return { rowShown: false };
  buttonNamed(row, 'إظهار الترجمات').click();
  await settleDom(20);
  const exp = row.querySelector('.lib-exp');
  return { rowShown: true, expandText: exp ? textOf(exp).slice(0, 160) : null, toasts: toastsOf(m) };
}

const cases = {
  'أ: video english نصّي (كالحي 17)': (area) => { const d = area.dump(); area.rawSet(`video:${ID}`, { ...d[`video:${ID}`], english: 'garbage' }); },
  'ب: alts تالف والسجل سليم': (area) => { const d = area.dump(); area.rawSet(`alts:${ID}`, { ...d[`alts:${ID}`], slots: [null, { track: 'تالف', offsetMs: 0 }, null] }); },
  'ج: video تالف والمُلخّص غائب': (area) => { const d = area.dump(); area.rawSet(`video:${ID}`, { ...d[`video:${ID}`], english: 'garbage' }); area.remove([`index:${ID}`]); },
};

for (const [name, corrupt] of Object.entries(cases)) {
  const w = await world(corrupt);
  const keys = () => Object.keys(w.area.dump()).filter((k) => k.endsWith(ID)).sort();
  const res = {};
  res.getBundle = (await settle(w.store.getBundle(ID))).code ?? 'ok';
  res.unreadableVideos = await w.store.unreadableVideos();
  res.deleteAll = await menuAction(w.store, 'حذف بيانات الفيديو');
  res.deleteActive = await menuAction(w.store, 'حذف الترجمة النشطة');
  const file = new File([writeSrt(makeCues(5, { text: (i) => `جديد ${i}` }))], `${ID}.جديد.ar.srt`);
  res.uploadFromMenu = await menuAction(w.store, 'رفع ترجمة', { pick: [file] });
  res.expand = await expandRow(w.store);
  // المحرّر
  const env = editorDocument({ videoId: ID });
  const ed = await settle(mountEditor(env.root, { videoId: ID, store: w.store, doc: env.doc, now: w.now }));
  await env.flush();
  res.editor = ed.ok ? textOf(env.root).replace(/\s+/g, ' ').slice(0, 170) : `رمى ${ed.code}`;
  // المشغّل: القراءة، والاستيراد بالاستبدال إلى الخانة 1، وتبديل النشطة.
  const pStore = createStore({ area: w.area, now: w.now });
  const c = createController({ store: pStore, now: w.now, page: {}, extractor: null });
  await c.start(ID);
  await settleAll();
  res.playerStateError = c.getState().error?.code ?? null;
  res.playerImportReplace = (await settle(c.loadArabicInto(1, { fileName: 'x.ar.srt', cues: makeCues(3), comparison: null, fingerprintId: null, notes: [] }, { replace: true }))).code ?? 'ok';
  // النسخة الاحتياطية الآن
  const nowBackup = await createBackup({ store: w.store, appVersion: 't', now: w.now, pause: async () => {} });
  res.backupSkipped = nowBackup.skipped;
  res.keysStill = keys();
  // المخرجان: استبدال من نسخة قديمة (من الإعدادات)، وdeleteVideo في التخزين (لا تصله أي واجهة إلا المسح الكامل).
  const read = await readBackup(w.older.text, { pause: async () => {} });
  const rv = await settle(w.store.restoreVideo(read.videos[0].entry, { replace: true }));
  res.restoreReplaceFromOlder = rv.ok ? rv.value.status : rv.code;
  res.readableAfterRestore = (await settle(w.store.getBundle(ID))).ok;
  out(name, res);
}
out('نص ST_CORRUPT_RECORD', { message: messageFor('ST_CORRUPT_RECORD') });
