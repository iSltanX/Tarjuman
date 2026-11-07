// إثبات G-F13 (جزء المحرّر): تغيّر لغة الخانة من تبويب آخر (withSlotLang) والمحرّر مفتوح ← slotChange = 'none' ← adopt().
// ماذا يتبع لغة الخانة في المحرّر فعلًا؟ وهل S.comparison يعتمد على اللغة أصلًا؟ (compareNow في app.js:569-578 لا يمرّر target)
// الاستعمال: command node f13-editor-lang.mjs <جذر الشيفرة>
const R = process.argv[2];
if (!R) throw new Error('مرّر جذر الشيفرة');
const { createStore } = await import(`${R}/src/core/store/index.js`);
const { mountEditor } = await import(`${R}/src/pages/editor/app.js`);
const { withSlotLang } = await import(`${R}/src/core/model/bundle.js`);
const { slotChange } = await import(`${R}/src/pages/editor/persist.js`);
const { trackComparison, currentComparison } = await import(`${R}/src/core/compare/current.js`);
const { createMemoryArea } = await import(`${R}/test/helpers/chrome-storage.js`);
const { NOW, makeCues } = await import(`${R}/test/helpers/fixtures.js`);
const { sampleBundle, seedBundle } = await import(`${R}/test/helpers/fixtures-v2.js`);
const { editorDocument, settle } = await import(`${R}/test/helpers/editor-dom.js`);
const { textOf } = await import(`${R}/test/unit/pages/library/fake-dom.js`);

function frenchBundle(lang) {
  const b = sampleBundle();
  const t = b.slots[0].track; // مرتبطة بالبصمة fp_test000001 (مسار en)
  const cues = makeCues(5, { text: (i) => `Bonjour ${i}` });
  t.original = cues;
  t.current = cues.map((c) => ({ ...c }));
  t.lang = lang;
  b.slots[0].marks = [];
  b.slots[0].position = null;
  b.record.arabic = structuredClone(t);
  return b;
}

const area = createMemoryArea({ unlimited: true });
let at = Date.parse(NOW);
const now = () => (at += 1000);
const store = createStore({ area, now });
const bundle = frenchBundle('fr');
await seedBundle(store, bundle);
const env = editorDocument({ videoId: bundle.videoId });
const editor = await mountEditor(env.root, { videoId: bundle.videoId, store, doc: env.doc, now });
await env.flush();
const S = editor.state;
const field = () => env.root.querySelector('.ed-row[data-index="0"] [data-field="text"]');
const snap = (label) => ({
  label,
  slotLang: S.opened.slots[0].track.lang ?? null,
  editorComparisonNoArabic: S.comparison?.noArabic ?? null,
  panelHasUntranslatedLine: textOf(env.root).includes('غير مترجم:'),
  libraryTrackComparisonNoArabic: trackComparison(S.opened.slots[0].track, S.opened.record.fingerprints)?.noArabic ?? null,
  textField: { lang: field()?.getAttribute('lang') ?? null, dir: field()?.dir ?? null },
  issuesCount: S.session.issues().list.length,
  comparisonRef: S.comparison,
});

const before = snap('opened: French translation (lang fr)');
const opened = await store.getBundle(bundle.videoId);
const next = withSlotLang(opened, 1, 'ar', NOW);
const kind = slotChange(opened, next, 1);
await store.updateBundle(bundle.videoId, () => next, { expect: opened });
await env.flush();
await settle();
await env.flush();
const after = snap('after another tab set slot lang to ar');

// ضابط: ما يعطيه currentComparison لو مُرّرت لغة الخانة target (كما يفعل trackComparison وimport/index.js)
const cues = S.session.snapshot();
const withTarget = (target) => currentComparison(cues, S.fp, { target }).noArabic;

const strip = ({ comparisonRef, ...o }) => o;
console.log(JSON.stringify({
  slotChangeKind: kind,
  externalAfter: S.external,
  sameComparisonObjectAfterAdopt: before.comparisonRef === after.comparisonRef,
  before: strip(before),
  after: strip(after),
  control_currentComparison: { target_fr: withTarget('fr'), target_null: withTarget(null), target_ar: withTarget('ar'), target_default: currentComparison(cues, S.fp, {}).noArabic },
  expected: {
    before: 'French translation (lang fr, source en, same Latin script): no «غير مترجم» check — noArabic [] as trackComparison does (AA1 decision, docs/aa-plan.md:215, 477-478)',
    after: 'lang ar: noArabic [1..5] (French text has no Arabic letters) — comparison should follow the slot language',
    density: 'density limits come from prefs.review.maxCps only (app.js:63): nothing to recompute on a language change',
  },
}, null, 2));
