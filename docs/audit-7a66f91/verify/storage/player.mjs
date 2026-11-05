// PLY-01 وPLY-02 بمتحكّمين فوق مخزنين على المساحة نفسها، وموصولين بإشعارات التخزين كما في main.js:39.
// لكل منهما: (أ) الفعل في أ قبل تسليم إشعار ب (ترتيب Codex)، (ب) الفعل بعد تسليم الإشعار وإعادة القراءة، (ج) لـPLY-02:
// أثناء رشقة نقرات ± في أ (كتابات معلّقة تؤجّل الإشعار).
import { load, out, settleAll } from './common2.mjs';
const { createStore } = await load('src/core/store/index.js');
const { createController } = await load('src/content/controller.js');
const { loadIntoFor } = await load('src/player/controls/flows.js');
const { withActiveSlot } = await load('src/core/model/bundle.js');
const { createMemoryArea } = await load('test/helpers/chrome-storage.js');
const { NOW, makeCues } = await load('test/helpers/fixtures.js');
const { sampleBundle, seedBundle } = await load('test/helpers/fixtures-v2.js');
const id = 'AAAAAAAAAAA';

async function pair() {
  const area = createMemoryArea({ unlimited: true });
  const sA = createStore({ area }); const sB = createStore({ area });
  await seedBundle(sA, sampleBundle({ videoId: id }));
  const A = createController({ store: sA, page: {}, extractor: null });
  const B = createController({ store: sB, page: {}, extractor: null });
  sA.onChange((c) => A.handleStoreChange(c)); sB.onChange((c) => B.handleStoreChange(c));
  await A.start(id); await B.start(id);
  await area.flush(); await settleAll();
  return { area, sA, sB, A, B };
}
const offs = async (s) => { try { const b = await s.getBundle(id); return { active: b.active, s1: b.slots[0].offsetMs, s2: b.slots[1].offsetMs }; } catch (e) { return { error: e.code, detail: e.detail }; } };

for (const order of ['before-event', 'after-event']) {
  const { area, sA, sB, A } = await pair();
  await sB.updateBundle(id, (b) => withActiveSlot(b, 2, NOW)); // ب يفعّل الخانة 2 (إزاحتها −1200)
  if (order === 'after-event') { await area.flush(); await settleAll(); }
  const viewBefore = A.getState().view.displayOffsetMs;
  await A.nudgeOffset(1);
  await area.flush(); await settleAll();
  out(`PLY-02-${order}`, { aViewAtClick: viewBefore, step: A.getState().settings.offsetStepMs, stored: await offs(sA), expectedSlot2: order === 'after-event' ? -700 : 'غير مقصودة' });
}
{ // (ج) رشقة نقرات: تفعيل ب يقع بعد أول نقرة، والنقرات التالية تُرسل قبل اكتمال الكتابات
  const { area, sA, sB, A } = await pair();
  const p1 = A.nudgeOffset(1);
  await sB.updateBundle(id, (b) => withActiveSlot(b, 2, NOW));
  await area.flush(); // يصل الإشعار وأ لديه كتابة معلّقة؟
  const pending = A.diagnostics().pendingWrites;
  const p2 = A.nudgeOffset(1);
  await Promise.all([p1, p2]); await area.flush(); await settleAll();
  const raw = area.dump();
  out('PLY-02-burst', { pendingWhenEventArrived: pending, stored: await offs(sA), aViewNow: A.getState().view.displayOffsetMs, aError: A.getState().error?.code ?? null,
    rawHeadActive: raw[`bundle:${id}`].active, rawAltsFilled: raw[`alts:${id}`].slots.map((x) => !!x), rawRecordArabic: raw[`video:${id}`].arabic?.fileName.replace(`${id}.`, ''), rev: raw[`video:${id}`].rev, headBaseRev: raw[`bundle:${id}`].base.rev });
}

for (const order of ['before-event', 'after-event']) {
  const { area, sB, A, B } = await pair();
  const upload = (name) => ({ videoId: id, input: { fileName: name, cues: makeCues(2, { text: (i) => `عينة ${i}` }) } });
  const original = A.getState().bundle.slots[0].track.fileName;
  await B.loadArabicInto(1, upload('B.srt').input, { replace: true });
  if (order === 'after-event') { await area.flush(); await settleAll(); }
  const aSeesInSlot1 = A.getState().bundle.slots[0].track.fileName;
  const r = await loadIntoFor({ controller: A, n: 1, replace: true, read: upload('C.srt') });
  await area.flush(); await settleAll();
  const fin = await sB.getBundle(id);
  out(`PLY-01-${order}`, { original: original.replace(`${id}.`, ''), aSeesInSlot1AtConfirm: aSeesInSlot1.replace(`${id}.`, ''), ok: r.ok, current: fin.slots[0].track.fileName, previous: fin.previous.track.fileName.replace(`${id}.`, ''), originalRecoverable: fin.previous.track.fileName === original || fin.slots.some((s) => s.track?.fileName === original) });
}
