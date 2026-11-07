// إثبات G-F09 (أ، ب، ج): جلسة المحرّر (markSaved وopenGroup، وreshaped) والبحث مع التشكيل.
// (أ) و(ب) عبر المحرّر المركّب (mountEditor) فوق التخزين الحقيقي، بحفظ بطيء الرد (updateBundle يُمسك حتى release) لأن
// markSaved لا يُستدعى في app.js إلا إن تغيّرت الجلسة أثناء انتظار الحفظ (app.js:1559-1565)؛ وإلا load() جلسة جديدة.
// الاستعمال: command node f09-session-search.mjs <جذر الشيفرة>
const R = process.argv[2];
if (!R) throw new Error('مرّر جذر الشيفرة');
const { createStore } = await import(`${R}/src/core/store/index.js`);
const { mountEditor } = await import(`${R}/src/pages/editor/app.js`);
const { createEditSession } = await import(`${R}/src/core/edit/session.js`);
const { searchCues, planReplace } = await import(`${R}/src/core/edit/search.js`);
const { createMemoryArea } = await import(`${R}/test/helpers/chrome-storage.js`);
const { NOW, makeCues } = await import(`${R}/test/helpers/fixtures.js`);
const { sampleBundle, seedBundle, markOn } = await import(`${R}/test/helpers/fixtures-v2.js`);
const { editorDocument, settle } = await import(`${R}/test/helpers/editor-dom.js`);

function bundleWith(count, { marks = [] } = {}) {
  const b = sampleBundle();
  const t = b.slots[0].track;
  const cues = makeCues(count);
  t.original = cues;
  t.current = cues.map((c) => ({ ...c }));
  t.fingerprintId = null;
  t.comparison = null;
  b.slots[0].marks = marks.map((i) => markOn(cues[i]));
  b.slots[0].position = null;
  b.record.arabic = structuredClone(t);
  return b;
}

async function mounted(bundle) {
  const area = createMemoryArea({ unlimited: true });
  let at = Date.parse(NOW);
  const now = () => (at += 1000);
  const store = createStore({ area, now });
  await seedBundle(store, bundle);
  const gate = { paused: false, release: null };
  const slow = {
    ...store,
    updateBundle: async (...args) => {
      if (gate.paused) await new Promise((r) => { gate.release = r; });
      return store.updateBundle(...args);
    },
  };
  const env = editorDocument({ videoId: bundle.videoId });
  const editor = await mountEditor(env.root, { videoId: bundle.videoId, store: slow, doc: env.doc, now });
  await env.flush();
  const field = (i) => env.root.querySelector(`.ed-row[data-index="${i}"] [data-field="text"]`);
  const type = async (i, value) => {
    const f = field(i);
    f.focus();
    f.value = value;
    f.dispatchEvent({ type: 'input' });
    await env.flush();
  };
  const ctrlS = (target) => env.fireDoc({ type: 'keydown', code: 'KeyS', key: 's', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, target });
  const undoBtn = () => env.root.querySelector('.ed-undo');
  return { store, env, editor, S: editor.state, gate, field, type, ctrlS, undoBtn, videoId: bundle.videoId };
}

const out = [];

// ---- (أ) حفظ بـ⌘S والمؤشر في الحقل، وكتابة أثناء انتظار الحفظ، ثم العودة بالكتابة إلى نص ما قبل المجموعة ----
{
  const m = await mounted(bundleWith(3));
  await m.type(0, 'مرحبا 1');
  m.gate.paused = true;
  m.ctrlS(m.field(0));
  await settle();
  const usedMarkSaved = m.S.saving;
  await m.type(0, 'مرحبا 1x'); // حرف أثناء الحفظ (الحقل نفسه، المجموعة text:0 مفتوحة)
  m.gate.paused = false;
  m.gate.release?.();
  await settle();
  await m.env.flush();
  const afterSave = { dirty: m.S.session.dirty, canUndo: m.S.session.canUndo, historySize: m.S.session.historySize };
  await m.type(0, 'سطر 1'); // يمحو حتى يعود إلى النص قبل أن يبدأ الكتابة
  const saved = (await m.store.getBundle(m.videoId)).slots[0].track.current[0].text;
  out.push({
    case: 'G-F09.a e2e: typing during a ⌘S save, then typing back to the pre-group text',
    savingWhenTyped: usedMarkSaved,
    afterSave,
    actual: {
      savedText: saved, workText: m.S.session.cueAt(0).text, dirty: m.S.session.dirty, changedCount: m.S.session.changedCount,
      canUndo: m.S.session.canUndo, undoButtonAriaDisabled: m.undoBtn()?.getAttribute('aria-disabled') ?? null, undoButtonTitle: m.undoBtn()?.getAttribute('title') ?? m.undoBtn()?.title ?? null,
    },
    expected: { dirty: true, canUndo: true, note: 'تغيير غير محفوظ (سطر 1 مقابل المحفوظ مرحبا 1) يجب أن يقبل التراجع إلى المحفوظ' },
  });
}

// ---- (أ) ضابط: ⌘S بلا كتابة أثناء الحفظ (المسار الشائع): load() جلسة جديدة، والتاريخ يبدأ من الصفر بالتصميم ----
{
  const m = await mounted(bundleWith(3));
  await m.type(0, 'مرحبا 1');
  m.ctrlS(m.field(0));
  await settle();
  await m.env.flush();
  const afterSave = { dirty: m.S.session.dirty, canUndo: m.S.session.canUndo };
  await m.type(0, 'سطر 1');
  out.push({
    case: 'G-F09.a control: ⌘S without typing during the save (common path)',
    afterSave,
    actual: { dirty: m.S.session.dirty, canUndo: m.S.session.canUndo },
    expected: { dirty: true, canUndo: true },
  });
}

// ---- (ب) reshaped بعد التراجع عن خطوات بنية دخلت المحفوظ (baked) ثم تعديل يفرغ redoStack — جلسة نقية ----
{
  const s = createEditSession({ cues: makeCues(6) });
  s.merge(0);
  const last = s.count - 1;
  s.split(last, 3);
  const cp = s.checkpoint();
  const savedShape = s.snapshot();
  s.setText(4, 'كتابة أثناء الحفظ');
  s.markSaved({ cues: savedShape, offsetMs: 0 }, cp);
  const r0 = s.reshaped;
  s.undo(); s.undo(); s.undo();
  const r1 = s.reshaped;
  s.setText(0, 'سطر 1 تعديل');
  const base = Array.from({ length: s.count }, (_, i) => s.baseAt(i).text);
  const work = s.snapshot().map((c) => c.text);
  const samePositions = base.every((t, i) => t === work[i] || i === 0);
  out.push({
    case: 'G-F09.b core: reshaped after undoing baked merge+split then a new edit',
    actual: { afterMarkSaved: r0, afterUndoAll: r1, afterNewEdit: s.reshaped, countBase: s.count, base, work },
    expected: { afterNewEdit: true, reason: 'المواضع لم تعد تقابل الأساس المحفوظ (samePositions=false)', samePositions },
  });
}

// ---- (ب) e2e: أثر reshaped الخاطئ على علامات المراجعة المحفوظة (reanchorMarks عند الحفظ) ----
{
  const m = await mounted(bundleWith(6, { marks: [3] })); // علامة «أعود إليه» على «سطر 4»
  const S = m.S;
  S.session.merge(0);
  S.session.split(S.session.count - 1, 3);
  await m.env.flush();
  m.gate.paused = true;
  const saving = m.editor.save();
  await settle();
  await m.type(4, 'سطر 5 أثناء الحفظ'); // كتابة أثناء الحفظ ← markSaved (baked = الدمج والشطر)
  m.gate.paused = false;
  m.gate.release?.();
  await saving;
  await m.env.flush();
  const marksAfterFirstSave = (await m.store.getBundle(m.videoId)).slots[0].marks.map((x) => ({ n: x.n, startMs: x.startMs, kind: x.kind }));
  S.session.undo(); S.session.undo(); S.session.undo();
  await m.env.flush();
  const reshapedAfterUndo = S.session.reshaped;
  await m.type(0, 'سطر 1 تعديل');
  const reshapedAfterEdit = S.session.reshaped;
  await m.editor.save();
  await m.env.flush();
  const b = await m.store.getBundle(m.videoId);
  const cur = b.slots[0].track.current;
  const marks = b.slots[0].marks.map((x) => {
    const at = cur.find((c) => c.n === x.n && c.startMs === x.startMs);
    return { n: x.n, startMs: x.startMs, kind: x.kind, cueText: at?.text ?? null };
  });
  out.push({
    case: 'G-F09.b e2e: persisted review mark after undoing baked merge+split, editing and saving',
    marksAfterFirstSave,
    reshapedAfterUndo,
    reshapedAfterEdit,
    savedTexts: cur.map((c) => c.text),
    actual: { marks },
    expected: { marks: [{ n: 4, cueText: 'سطر 4', kind: 'todo' }] },
  });
}

// ---- (ج) البحث والاستبدال مع تشكيل لاحق ----
{
  const cues = [{ n: 1, startMs: 0, endMs: 1000, text: 'جاء محمدٌ اليوم' }];
  const rows = [];
  for (const wholeWord of [false, true]) {
    for (const ignoreMarks of [false, true]) {
      const ms = searchCues(cues, 'محمد', { wholeWord, ignoreMarks });
      const plain = ms.length ? planReplace(cues, ms, 'أحمد').changes[0]?.after : null;
      const marked = ms.length ? planReplace(cues, ms, 'أحمدُ').changes[0]?.after : null;
      rows.push({ wholeWord, ignoreMarks, matched: ms.map((x) => cues[0].text.slice(x.start, x.end)), replaceWith_أحمد: plain, replaceWith_أحمدُ: marked, codepointsMarked: marked ? [...marked].map((c) => c.codePointAt(0).toString(16)).join(' ') : null });
    }
  }
  out.push({
    case: 'G-F09.c: search "محمد" in "جاء محمدٌ اليوم" and replace (UI defaults are wholeWord:false, ignoreMarks:false — src/pages/editor/search.js:50)',
    actual: rows,
    expected: 'المطابقة تشمل ما يليها من تشكيل (رأس search.js:3) في الوضعين، فيصير الناتج «جاء أحمد اليوم» و«جاء أحمدُ اليوم» بلا تنوين قديم ولا علامتين على حرف واحد',
  });
  // حالة شائعة: تنوين الفتح بعد الألف
  const c2 = [{ n: 1, startMs: 0, endMs: 1000, text: 'شكراً لك' }];
  const m2 = searchCues(c2, 'شكرا', {});
  out.push({
    case: 'G-F09.c common tanween: "شكرا" -> "شكرًا" in "شكراً لك" with UI defaults',
    actual: { matched: m2.map((x) => c2[0].text.slice(x.start, x.end)), after: planReplace(c2, m2, 'شكرًا').changes[0]?.after, codepoints: [...(planReplace(c2, m2, 'شكرًا').changes[0]?.after ?? '')].map((c) => c.codePointAt(0).toString(16)).join(' ') },
    expected: { after: 'شكرًا لك (بلا تنوين ثانٍ بعد الألف)' },
  });
}

console.log(JSON.stringify(out, null, 2));
