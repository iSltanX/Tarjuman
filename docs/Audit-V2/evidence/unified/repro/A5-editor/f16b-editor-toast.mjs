// إثبات G-F16.b (جزء المحرّر): رسالة «تراجع» بعد تبديل علامة مقطع (writeMarkPlan، app.js:1223-1227) تزول بعد 7 ث
// (app.js:983) ولو كان التركيز على زرها أو المؤشر فوقها؛ ثم تصير inert فيسقط التركيز منها. ضابط: الرسالة المشتركة في
// src/ui/toast.js تُمسك مؤقتها ما دام التركيز فيها.
// الاستعمال: command node f16b-editor-toast.mjs <جذر الشيفرة>
const R = process.argv[2];
if (!R) throw new Error('مرّر جذر الشيفرة');
const { createStore } = await import(`${R}/src/core/store/index.js`);
const { mountEditor } = await import(`${R}/src/pages/editor/app.js`);
const { createToaster } = await import(`${R}/src/ui/toast.js`);
const { createMemoryArea } = await import(`${R}/test/helpers/chrome-storage.js`);
const { NOW, makeCues } = await import(`${R}/test/helpers/fixtures.js`);
const { sampleBundle, seedBundle } = await import(`${R}/test/helpers/fixtures-v2.js`);
const { editorDocument, settle } = await import(`${R}/test/helpers/editor-dom.js`);
const { newDocument, textOf } = await import(`${R}/test/unit/pages/library/fake-dom.js`);

const b = sampleBundle();
const t = b.slots[0].track;
const cues = makeCues(3);
t.original = cues;
t.current = cues.map((c) => ({ ...c }));
t.fingerprintId = null;
t.comparison = null;
b.slots[0].marks = [];
b.slots[0].position = null;
b.record.arabic = structuredClone(t);

const area = createMemoryArea({ unlimited: true });
let at = Date.parse(NOW);
const now = () => (at += 1000);
const store = createStore({ area, now });
await seedBundle(store, b);
const env = editorDocument({ videoId: b.videoId });
const editor = await mountEditor(env.root, { videoId: b.videoId, store, doc: env.doc, now });
await env.flush();
const markBtn = env.root.querySelector('.ed-row[data-index="1"] [data-act="mark"]');
markBtn.dispatchEvent({ type: 'click', target: markBtn });
await settle(10);
await env.flushFrames();
const toastEl = env.root.querySelector('.ed-toast');
const undo = toastEl?.querySelector('button');
const shown = { text: toastEl ? textOf(toastEl) : null, isShown: toastEl?.className.includes('is-shown') ?? false, inert: toastEl?.hasAttribute('inert') ?? null, hasUndo: Boolean(undo) };
undo?.focus();
toastEl?.dispatchEvent({ type: 'mouseenter' });
toastEl?.dispatchEvent({ type: 'focusin', target: undo });
const focusedBefore = env.doc.activeElement === undo;
await env.advance(7000);
const after = { isShown: toastEl.className.includes('is-shown'), inert: toastEl.hasAttribute('inert'), note: 'الزر المركّز صار داخل عنصر inert: في المتصفح يسقط التركيز منه إلى body (الـDOM الوهمي لا يحاكي ذلك)' };

// ضابط: المكوّن المشترك
const doc2 = newDocument();
const timers = new Map();
let seq = 0;
const toaster = createToaster({ doc: doc2, setTimer: (fn, ms) => { timers.set(++seq, { fn, ms }); return seq; }, clearTimer: (id) => timers.delete(id) });
doc2.body.append(toaster.root);
const node = toaster.show('أُضيفت العلامة', 'success', { action: { label: 'تراجع', onClick: () => {} } });
const pendingBeforeFocus = [...timers.values()].filter((x) => x.ms >= 1000).length;
node.dispatchEvent({ type: 'focusin' });
const pendingAfterFocus = [...timers.values()].filter((x) => x.ms >= 1000).length;

console.log(JSON.stringify({
  editor: { shown, focusedBefore, actual_after7s_withFocusAndPointerOnToast: after, expected: { isShown: true, note: 'تُمسك ما دام التركيز أو المؤشر فيها (كما src/ui/toast.js:44-57)' } },
  control_sharedToaster: { dismissTimersBeforeFocus: pendingBeforeFocus, dismissTimersAfterFocusin: pendingAfterFocus },
}, null, 2));
