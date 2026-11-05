// TJ-05 (DATA-001) بحالاته، وD-02 وDS-S1 وT-02: كتابتان من سياقين تبدآن معًا على المساحة نفسها، بالوحدات الحقيقية.
//   (أ) حفظ المحرّر (saveSlot بـexpect) و± المشغّل معًا، بالترتيبين، مع أحداث onChanged التي يراها سياق المحرّر.
//   (ب) رفع من المحفوظات (applyUpload بـexpect) إلى النشطة و± معًا.
//   (هـ) تأخير IPC عشوائي (0.2–3 م.ث لكل اتجاه) وفارق بدء عشوائي: معدل الضياع (يصف المحاكاة لا Chrome).
//   (02b) setPrefs من سياقين دافئين لمجموعتين مختلفتين (glossary وui)، والضابط بسياق بارد؛ ومثله setSettings.
//   (06) ± «في الطريق» (بعد آخر إعادة فحص وقبل set) ثم «مسح كل البيانات» من سياق آخر.
import { load, out, settle, settleAll, clockFrom, hooked } from './common.mjs';
const { createStore } = await load('src/core/store/index.js');
const { createController } = await load('src/content/controller.js');
const { saveSlot } = await load('src/pages/editor/persist.js');
const { applyUpload } = await load('src/pages/library/actions.js');
const { createMemoryArea } = await load('test/helpers/chrome-storage.js');
const { makeCues, videoRecord } = await load('test/helpers/fixtures.js');
const { sampleBundle, seedBundle } = await load('test/helpers/fixtures-v2.js');
const ID = 'AAAAAAAAAAA';

async function setup(area = createMemoryArea({ unlimited: true })) {
  const now = clockFrom();
  const ed = createStore({ area, now });
  const pl = createStore({ area, now });
  await seedBundle(ed, sampleBundle({ videoId: ID, third: true }));
  await area.flush?.();
  const c = createController({ store: pl, now, page: {}, extractor: null });
  pl.onChange((ch) => c.handleStoreChange(ch));
  await c.start(ID);
  await area.flush?.(); await settleAll();
  return { area, ed, pl, c, now };
}

// (أ)
for (const order of ['editor-first', 'player-first']) {
  const { area, ed, c, now } = await setup();
  const events = [];
  ed.onChange((ch) => { const v = ch.videos[ID]; if (v) events.push(`${v.oldValue?.rev}@${v.oldValue?.updatedAt?.slice(14, 19)} → ${v.newValue?.rev}@${v.newValue?.updatedAt?.slice(14, 19)}`); });
  const opened = await ed.getBundle(ID);
  const cues = opened.slots[0].track.current.map((x) => ({ ...x, text: `${x.text} [تعديل المحرّر]` }));
  const save = () => settle(saveSlot(ed, ID, opened, 1, { cues, offsetChanged: false, offsetMs: opened.slots[0].offsetMs }, { now }));
  const nudge = () => settle(c.nudgeOffset(1));
  const [rs, rn] = order === 'editor-first' ? await Promise.all([save(), nudge()]) : (await Promise.all([nudge(), save()])).reverse();
  await area.flush(); await settleAll();
  const end = await ed.getBundle(ID);
  out(`TJ-05(أ) ${order}`, {
    editorSave: rs.ok ? 'ok' : rs.code, nudge: rn.ok ? 'ok' : rn.code,
    editsKept: end.slots[0].track.current[0].text.includes('[تعديل المحرّر]'), offsetBefore: opened.slots[0].offsetMs, offsetStored: end.slots[0].offsetMs,
    playerView: c.getState().view.displayOffsetMs, storedRev: end.record.rev, eventsSeenByEditorCtx: events,
    winnerEventSameRev: events.length >= 2 && events.at(-1).split(' → ').map((s) => s.split('@')[0]).every((r, _, a) => r === a[0]),
  });
}

// (ب)
{
  const { area, ed: lib, c } = await setup();
  const bundle = await lib.getBundle(ID);
  const settings = await lib.getSettings();
  const result = { ok: true, fileName: `${ID}.ملف-جديد.ar.srt`, cues: makeCues(5, { text: (i) => `ملف جديد ${i}` }), comparison: null, fingerprintId: null, notes: [], warnings: [] };
  const [u, n] = await Promise.all([
    settle(applyUpload({ store: lib, bundle, settings, result, n: 1, fingerprintId: null, now: Date.now })),
    settle(c.nudgeOffset(1)),
  ]);
  await area.flush(); await settleAll();
  const end = await lib.getBundle(ID);
  out('TJ-05(ب) applyUpload(expect) و± معًا', {
    upload: u.ok ? u.value : u.code, nudge: n.ok ? 'ok' : n.code, activeFile: end.slots[0].track.fileName.replace(`${ID}.`, ''),
    previous: end.previous ? `${end.previous.from}:${end.previous.track.fileName.replace(`${ID}.`, '')}` : null,
    uploadLost: u.ok && !end.slots[0].track.fileName.includes('ملف-جديد'),
  });
}

// (هـ)
function latency(base, lo = 0.2, hi = 3) {
  const r = () => lo + Math.random() * (hi - lo);
  const wait = (ms) => new Promise((x) => setTimeout(x, ms));
  const op = (m) => async (arg) => { await wait(r()); const res = await base[m](arg); await wait(r()); return res; };
  return { ...base, get: op('get'), set: op('set'), remove: op('remove'), getKeys: op('getKeys') };
}
{
  const rows = [];
  for (const gap of [0, 2, 5, 10, 20]) {
    let lost = 0; const N = 150;
    for (let i = 0; i < N; i++) {
      const base = createMemoryArea({ unlimited: true });
      const A = createStore({ area: latency(base) });
      const B = createStore({ area: latency(base) });
      await A.updateVideo(ID, () => videoRecord());
      await B.getVideo(ID);
      const pA = A.updateVideo(ID, (r) => ({ ...r, title: 'A' }));
      await new Promise((x) => setTimeout(x, Math.random() * gap));
      const pB = B.updateVideo(ID, (r) => ({ ...r, durationMs: 4242 }));
      const rs = await Promise.allSettled([pA, pB]);
      const e = await A.getVideo(ID);
      if (rs.every((x) => x.status === 'fulfilled') && (e.title !== 'A' || e.durationMs !== 4242)) lost++;
    }
    rows.push({ gapUpToMs: gap, rounds: N, silentLoss: lost });
  }
  out('TJ-05(هـ) ضياع صامت (نجح الطرفان وضاع أحدهما) بتأخير IPC عشوائي', { rows });
}

// (02b) التفضيلات والإعدادات: سياقان دافئان، ثم الضابط بسياق بارد.
for (const warm of [true, false]) {
  let lost = 0; const N = 50;
  for (let i = 0; i < N; i++) {
    const area = createMemoryArea({ unlimited: true });
    const s1 = createStore({ area }); const s2 = createStore({ area });
    await s1.getPrefs(); if (warm) await s2.getPrefs();
    await Promise.all([
      s1.setPrefs({ glossary: { attach: true, terms: [{ source: 'prompt', target: 'موجِّه', note: null }] } }),
      s2.setPrefs({ ui: { panelOpen: true } }),
    ]);
    const p = await s1.getPrefs();
    if (p.glossary.terms.length !== 1 || p.ui.panelOpen !== true) lost++;
  }
  out(`TJ-05(02b) setPrefs لمجموعتين من سياقين ${warm ? 'دافئين' : '(الثاني بارد)'}`, { rounds: N, lost });
}
{
  const area = createMemoryArea({ unlimited: true });
  const s1 = createStore({ area }); const s2 = createStore({ area });
  await s1.getSettings(); await s2.getSettings();
  const [a, b] = await Promise.all([settle(s1.setSettings({ offsetStepMs: 1000 })), settle(s2.setSettings({ displayModeDefault: 'dual' }))]);
  const st = await s1.getSettings();
  out('TJ-05(02b) setSettings لمجموعتين من سياقين دافئين', { okA: a.ok, okB: b.ok, offsetStepMs: st.offsetStepMs, displayModeDefault: st.displayModeDefault, lost: st.offsetStepMs !== 1000 || st.displayModeDefault !== 'dual' });
}

// (06) ± في الطريق ثم «مسح كل البيانات».
{
  const base = createMemoryArea({ unlimited: true });
  const h = hooked(base);
  const now = clockFrom();
  const settingsStore = createStore({ area: base, now });
  const pl = createStore({ area: h.area, now });
  await seedBundle(settingsStore, sampleBundle({ videoId: ID, third: true }));
  await base.flush();
  const c = createController({ store: pl, now, page: {}, extractor: null });
  pl.onChange((ch) => c.handleStoreChange(ch));
  await c.start(ID); await settleAll();
  h.before(`video:${ID}`, () => settingsStore.clearAll());
  const n = await settle(c.nudgeOffset(1));
  await base.flush(); await settleAll();
  const keysAfter = Object.keys(base.dump()).sort();
  const fresh = createStore({ area: base, now });
  const lib1 = await fresh.listLibrary();
  const bundle = await settle(fresh.getBundle(ID));
  const lib2 = await createStore({ area: base, now }).listLibrary();
  out('TJ-05(06) ± في الطريق ثم clearAll', {
    nudge: n.ok ? 'ok' : n.code, keysAfter,
    librarySummaryBeforeRead: lib1.map((x) => ({ id: x.entry.videoId, filled: x.summary?.filled })),
    bundleRead: bundle.ok ? { filled: bundle.value.slots.filter((s) => s.track).map((s) => s.n), previous: !!bundle.value.previous, marks: bundle.value.slots.map((s) => s.marks.length) } : bundle.code,
    librarySummaryAfterRead: lib2.map((x) => ({ id: x.entry.videoId, filled: x.summary?.filled })),
    playerSaved: c.getState().saved ? `rev ${c.getState().saved.rev}` : null,
  });
}
