// إثبات G-F07 (planRescue مع إزاحة مثبّتة) عبر المحرّر المركّب كاملًا (mountEditor) فوق التخزين الحقيقي بمحاكاة chrome.storage:
// فتح ترجمة بإزاحة محفوظة +2000 ← «تثبيت الإزاحة في التوقيت» (onCommit) ← كتابة في حقل نص المقطع 1 (حدث input) ←
// تبويب آخر يحفظ تغييرًا ← لافتة التعارض ← زر «مقارنة وإعادة التطبيق…» (onRescue) ← حوار الإنقاذ ← «تطبيق» بالاختيارات الافتراضية.
// يُقرأ بعدها ما في جلسة المحرّر (ما سيُحفظ) والظاهر = startMs + offsetMs.
// الاستعمال: command node f07-rescue-committed.mjs <جذر الشيفرة>
const R = process.argv[2];
if (!R) throw new Error('مرّر جذر الشيفرة');
const { createStore } = await import(`${R}/src/core/store/index.js`);
const { mountEditor } = await import(`${R}/src/pages/editor/app.js`);
const { saveSlot } = await import(`${R}/src/pages/editor/persist.js`);
const { withSlotOffset } = await import(`${R}/src/core/model/bundle.js`);
const { planRescue } = await import(`${R}/src/core/edit/rescue.js`);
const { createMemoryArea } = await import(`${R}/test/helpers/chrome-storage.js`);
const { NOW, makeCues } = await import(`${R}/test/helpers/fixtures.js`);
const { sampleBundle, seedBundle } = await import(`${R}/test/helpers/fixtures-v2.js`);
const { editorDocument, settle } = await import(`${R}/test/helpers/editor-dom.js`);
const { buttonNamed, textOf } = await import(`${R}/test/unit/pages/library/fake-dom.js`);

const OFFSET = 2000;
const COUNT = 12;

function bundleWith() {
  const b = sampleBundle();
  const t = b.slots[0].track;
  const cues = makeCues(COUNT);
  t.original = cues;
  t.current = cues.map((c) => ({ ...c }));
  t.fingerprintId = null;
  t.comparison = null;
  b.slots[0].marks = [];
  b.slots[0].position = null;
  b.slots[0].offsetMs = OFFSET;
  b.record.view = { ...b.record.view, displayOffsetMs: OFFSET };
  b.record.arabic = structuredClone(t);
  return b;
}

async function run(name, otherTab, expected) {
  const area = createMemoryArea({ unlimited: true });
  let at = Date.parse(NOW);
  const now = () => (at += 1000);
  const store = createStore({ area, now });
  const bundle = bundleWith();
  await seedBundle(store, bundle);
  const base = bundle.slots[0].track.current;
  const env = editorDocument({ videoId: bundle.videoId });
  const editor = await mountEditor(env.root, { videoId: bundle.videoId, store, doc: env.doc, now });
  await env.flush();
  const S = editor.state;
  // 1) «تثبيت الإزاحة في التوقيت» بالزر نفسه.
  buttonNamed(env.root, 'تثبيت الإزاحة في التوقيت').dispatchEvent({ type: 'click' });
  await env.flush();
  const afterCommit = { offsetMs: S.session.offsetMs, committedMs: S.session.committedMs, baseOffsetMs: S.session.baseOffsetMs, cue1Start: S.session.cueAt(0).startMs };
  // 2) كتابة في حقل نص المقطع 1.
  const f = env.root.querySelector('.ed-row[data-index="0"] [data-field="text"]');
  f.focus();
  f.value = 'مقطع أول معدّل';
  f.dispatchEvent({ type: 'input' });
  await env.flush();
  // 3) تبويب آخر يحفظ (عبر التخزين نفسه، فيصل حدث التغيّر إلى المحرّر).
  const opened = await store.getBundle(bundle.videoId);
  await otherTab(store, opened, base);
  await env.flush();
  await settle();
  await env.flush();
  const banner = S.external;
  // المدخلات كما يبنيها onRescue (app.js:896-899) قبل فتح الحوار.
  const latest = await store.getBundle(bundle.videoId);
  const theirsSlot = latest.slots[0];
  const input = {
    base: S.session.baseSnapshot(), mine: S.session.snapshot(), theirs: (theirsSlot.track.current ?? theirsSlot.track.original),
    offsets: { base: S.session.baseOffsetMs, mine: S.session.offsetMs, theirs: theirsSlot.offsetMs, committed: S.session.committedMs },
  };
  const first = planRescue(input);
  // 4) زر اللافتة ثم الحوار.
  const btn = buttonNamed(env.root, 'مقارنة وإعادة التطبيق…');
  let dialogText = null;
  if (btn) {
    btn.dispatchEvent({ type: 'click' });
    await settle();
    await env.flush();
    const dlg = env.doc.querySelector('dialog[open]');
    dialogText = dlg ? textOf(dlg) : null;
    dlg?.close('apply');
    await settle();
    await env.flush();
  }
  const work = S.session.snapshot();
  const shown = (i) => work[i].startMs + S.session.offsetMs;
  const out = {
    scenario: name,
    afterCommit,
    bannerState: banner,
    rescueInput: { offsets: input.offsets, baseCue6Start: input.base[5].startMs, mineCue6Start: input.mine[5].startMs, theirsCue6Start: input.theirs[5].startMs },
    firstPlan: { ok: first.ok, counts: first.counts, conflicts: first.conflicts?.map((c) => ({ n: c.n, mine: c.mine.map((x) => [x.startMs, x.text]), theirs: c.theirs.map((x) => [x.startMs, x.text]) })), offsetMs: first.offsetMs, offsetConflict: first.offsetConflict, kept: first.kept?.length },
    dialogText,
    actual: {
      sessionOffsetMs: S.session.offsetMs,
      cue1: { startMs: work[0].startMs, text: work[0].text, shownStartMs: shown(0) },
      cue2ShownStartMs: shown(1),
      cue6: { startMs: work[5].startMs, shownStartMs: shown(5) },
      cue7ShownStartMs: shown(6),
      dirty: S.session.dirty,
    },
    expected,
  };
  return out;
}

const results = [];

// أ) التبويب الآخر (محرّر آخر) غيّر توقيت المقطع 6 بـ+100 وحفظ دون تغيير الإزاحة (2000).
results.push(await run('A: theirs nudged cue 6 by +100ms (offset unchanged 2000)', async (store, opened, base) => {
  const cues = base.map((c) => ({ ...c }));
  cues[5].startMs += 100;
  cues[5].endMs += 100;
  await saveSlot(store, opened.videoId, opened, 1, { cues, offsetChanged: false, offsetMs: 2000 }, { now: () => Date.parse(NOW) + 500000 });
}, {
  note: 'الظاهر المقصود: كل المقاطع بإزاحة +2000 كما كانت، والمقطع 6 +100 فوقها؛ تعديل واحد مني (نص المقطع 1)، ولا تعارض',
  counts_mine: 1, conflicts: 0,
  cue1ShownStartMs: base0(0) + 2000, cue2ShownStartMs: base0(1) + 2000, cue6ShownStartMs: base0(5) + 100 + 2000, cue7ShownStartMs: base0(6) + 2000,
}));

// ب) التبويب الآخر ثبّت الإزاحة نفسها (المقاطع +2000 والإزاحة 0) وحفظ.
results.push(await run('B: theirs committed the same offset (cues +2000, offset 0)', async (store, opened, base) => {
  const cues = base.map((c) => ({ ...c, startMs: c.startMs + 2000, endMs: c.endMs + 2000 }));
  await saveSlot(store, opened.videoId, opened, 1, { cues, offsetChanged: true, offsetMs: 0 }, { now: () => Date.parse(NOW) + 500000 });
}, {
  note: 'الطرفان ثبّتا +2000: الظاهر يبقى base+2000 لكل مقطع، والإزاحة 0',
  sessionOffsetMs: 0, cue1ShownStartMs: base0(0) + 2000, cue6ShownStartMs: base0(5) + 2000,
}));

// ج) ضابط: المشغّل غيّر الإزاحة وحدها 2000 ← 2500 (withSlotOffset) — حالة GM-014.1 المعالجة.
results.push(await run('C (control): player changed offset only 2000 -> 2500', async (store, opened) => {
  await store.updateBundle(opened.videoId, (b) => withSlotOffset(b, 1, 2500, NOW), { expect: opened });
}, {
  note: 'الظاهر المقصود base+2500 لكل مقطع؛ تعديل واحد مني',
  cue1ShownStartMs: base0(0) + 2500, cue6ShownStartMs: base0(5) + 2500, counts_mine: 1,
}));

function base0(i) {
  return makeCues(COUNT)[i].startMs;
}

console.log(JSON.stringify(results, null, 2));
