// TJ-19 (DATA-005) وعلامة markCue بالرقم القديم، وTJ-20 (DATA-006) بثلاثة ترتيبات، وH-04 («إبقاء تعديلاتي» في رفع المشغّل)،
// بمتحكم حقيقي موصول بإشعارات التخزين (كما في content/main.js) وسياق آخر على المساحة نفسها.
import { load, out, settle, settleAll, clockFrom } from './common.mjs';
const { createStore } = await load('src/core/store/index.js');
const { createController } = await load('src/content/controller.js');
const { applyUpload } = await load('src/pages/library/actions.js');
const { saveSlot } = await load('src/pages/editor/persist.js');
const { withSlotUpload } = await load('src/core/model/bundle.js');
const { keepEditsPlan } = await load('src/player/controls/replace.js');
const { loadIntoFor } = await load('src/player/controls/flows.js');
const B = await load('src/core/backup/index.js');
const { createMemoryArea } = await load('test/helpers/chrome-storage.js');
const { makeCues } = await load('test/helpers/fixtures.js');
const { sampleBundle, seedBundle } = await load('test/helpers/fixtures-v2.js');
const ID = 'AAAAAAAAAAA';

async function pair(area = createMemoryArea({ unlimited: true }), playerArea = area) {
  const now = clockFrom();
  const lib = createStore({ area, now });
  const pl = createStore({ area: playerArea, now });
  await seedBundle(lib, sampleBundle({ videoId: ID, third: true }));
  await area.flush(); await settleAll();
  const c = createController({ store: pl, now, page: {}, extractor: null });
  pl.onChange((ch) => c.handleStoreChange(ch));
  await c.start(ID); await area.flush(); await settleAll();
  return { area, lib, pl, c, now };
}
const file = (label) => ({ ok: true, fileName: `${ID}.${label}.ar.srt`, cues: makeCues(5, { text: (i) => `${label} ${i}` }), comparison: null, fingerprintId: null, notes: [], warnings: [] });

// TJ-19: المحفوظات تستبدل النشطة (تُصفّر الإزاحة 500)، و+ في المشغّل قبل وصول الإشعار، والضابط بعده.
for (const order of ['before-event', 'after-event']) {
  const { area, lib, c } = await pair();
  const up = await applyUpload({ store: lib, bundle: await lib.getBundle(ID), settings: await lib.getSettings(), result: file('جديد'), n: 1, fingerprintId: null, now: Date.now });
  if (order === 'after-event') { await area.flush(); await settleAll(); }
  const viewAtClick = c.getState().view.displayOffsetMs;
  await c.nudgeOffset(1);
  await area.flush(); await settleAll();
  const end = await lib.getBundle(ID);
  out(`TJ-19 ${order}`, { upload: up, viewAtClick, step: c.getState().settings.offsetStepMs, activeFile: end.slots[0].track.fileName.replace(`${ID}.`, ''), storedOffset: end.slots[0].offsetMs, expected: 500 });
}

// علامة markCue بالرقم من مقاطع قديمة: تبويب آخر يستبدل النشطة بملف مقاطعه مختلفة، والمستخدم يعلّم المقطع 2 قبل الإشعار.
for (const order of ['before-event', 'after-event']) {
  const { area, lib, c } = await pair();
  const oldCue = c.getState().arabic.cues[2].text;
  await lib.updateBundle(ID, (b) => withSlotUpload(b, 1, { videoId: ID, fileName: `${ID}.مختلف.ar.srt`, cues: makeCues(5, { text: (i) => `مختلف ${i}` }), comparison: null, fingerprintId: null, notes: [], displayModeDefault: 'ar', current: null }, '2026-11-01T13:00:00.000Z', { replace: true }).bundle);
  if (order === 'after-event') { await area.flush(); await settleAll(); }
  const clickedText = c.getState().arabic.cues[2].text;
  const r = await settle(c.markCue({ index: 2 }, 'todo'));
  await area.flush(); await settleAll();
  const end = await lib.getBundle(ID);
  const newCues = end.slots[0].track.current ?? end.slots[0].track.original;
  const landed = r.ok && r.value.mark ? newCues.find((x) => x.startMs === r.value.mark.startMs)?.text ?? null : null;
  out(`markCue ${order}`, { oldCueAtIndex2: oldCue, userClickedText: clickedText, mark: r.ok ? 'ok' : r.code, newMarkLandsOn: landed, newFileIndex2: newCues[2].text });
}

// TJ-20 (د-2 لدى DeepSeek): القراءة التي أطلقها حدث الحذف تُنفَّذ قبل الاستعادة، ويتأخر ردها حتى بعد وصول حدث الاستعادة (rev 1).
async function deleteRestore(mode) {
  const base = createMemoryArea({ unlimited: true });
  let hold = null; let held = 0;
  const playerArea = {
    ...base,
    get: async (keys) => {
      const snap = await base.get(keys);
      if (hold && Array.isArray(keys) && keys.includes(`video:${ID}`)) { const h = hold; hold = null; held++; h.arrived(); await h.released; }
      return snap;
    },
  };
  const { lib, c } = await pair(base, playerArea);
  for (let i = 0; i < 4; i++) await lib.updateVideo(ID, (r) => ({ ...r, view: { ...r.view, displayMode: i % 2 ? 'ar' : 'dual' } }));
  await base.flush(); await settleAll();
  const backup = await B.createBackup({ store: lib, appVersion: 't', pause: async () => {} });
  const read = await B.readBackup(backup.text, { pause: async () => {} });
  const revBefore = c.getState().saved.rev;
  let release = () => {};
  if (mode === 'forced-reply-after-event') {
    const reached = new Promise((r) => { hold = { arrived: r, released: new Promise((x) => { release = x; }) }; });
    await lib.deleteVideo(ID);
    await base.flush();          // حدث الحذف → reloadIfNewer → قراءة ترى «لا سجل» ثم يُحجز ردها
    await reached;
    await lib.restoreVideo(read.videos[0].entry);
    await base.flush();          // حدث الاستعادة (rev 1) يصل والحالة ما زالت rev 5
    release();
  } else if (mode === 'natural-back-to-back') {
    await lib.deleteVideo(ID);
    await lib.restoreVideo(read.videos[0].entry); // بلا انتظار تسليم حدث الحذف
  } else {
    await lib.deleteVideo(ID);
    await base.flush(); await settleAll(); // يصل حدث الحذف وتكتمل قراءته
    await lib.restoreVideo(read.videos[0].entry);
  }
  await base.flush(); await settleAll(); await base.flush(); await settleAll();
  const st = c.getState();
  out(`TJ-20 ${mode}`, { revBefore, heldReplies: held, controllerSaved: st.saved ? `rev ${st.saved.rev}` : null, controllerArabic: st.arabic ? st.arabic.fileName.replace(`${ID}.`, '') : null, stored: `rev ${(await lib.getVideo(ID))?.rev}` });
}
for (const m of ['forced-reply-after-event', 'natural-back-to-back', 'delete-event-then-restore']) await deleteRestore(m);

// H-04: المحرّر يحفظ تعديلًا جديدًا على الخانة 1 وتأكيد الرفع مفتوح في المشغّل مع «إبقاء تعديلاتي»، ثم يؤكد المستخدم.
for (const order of ['before-event', 'after-event']) {
  const { area, lib, c, now } = await pair();
  const incoming = structuredClone((await lib.getBundle(ID)).slots[0].track.original).map((x, i) => (i === 0 ? { ...x, text: `${x.text} (ملف جديد)` } : x));
  const opened = await lib.getBundle(ID);
  const cues = structuredClone(opened.slots[0].track.current);
  cues[4].text = 'تعديل-المحرّر-بعد-فتح-الحوار';
  await saveSlot(lib, ID, opened, 1, { cues, offsetChanged: false, offsetMs: opened.slots[0].offsetMs }, { now });
  if (order === 'after-event') { await area.flush(); await settleAll(); }
  // ما يحسبه confirmUpload لحظة النقر (session.js:1005-1008 وplanFor:218-225): الدمج من مسار الخانة في حالة المتحكم الآن.
  const trackAtClick = c.getState().bundle.slots[0].track;
  const plan = keepEditsPlan(trackAtClick, incoming);
  const r = await loadIntoFor({ controller: c, n: 1, replace: true, current: plan.ok ? plan.current : null, read: { videoId: ID, input: { fileName: `${ID}.جديد.ar.srt`, cues: incoming, comparison: null, fingerprintId: null, notes: [] } } });
  await area.flush(); await settleAll();
  const end = await lib.getBundle(ID);
  const inCurrent = (end.slots[0].track.current ?? []).some((x) => x.text.includes('تعديل-المحرّر'));
  const inPrevious = (end.previous?.track.current ?? []).some((x) => x.text.includes('تعديل-المحرّر'));
  out(`H-04 ${order}`, { planOk: plan.ok, trackAtClickHasEditorEdit: (trackAtClick.current ?? []).some((x) => x.text.includes('تعديل-المحرّر')), upload: r.ok ? 'ok' : r.error.code, editorEditMergedIntoNew: inCurrent, editorEditInPrevious: inPrevious, previousFrom: end.previous?.from });
}
