// A6 — C-SUB04 وC-GAP5: سياسة اختيار المسار الافتراضي كما يطبّقها المنتج (المتحكم ورد النافذة وقائمة التحميل في المشغّل)
// مقارنةً بالسياسة المختبرة في src/extract/select.js (rankTracks/chooseTrack) وبنص العقد (extraction.md §AA1: «الأصلي قبل المترجم
// آليًا، واليدوي قبل التلقائي، ثم الأحدث»؛ وق٢: المترجم آليًا «لا يُختار افتراضيًا أبدًا»).
// بالوحدات الحقيقية: المستخرج والمتحكم والمخزن، وقائمة التحميل بحزام اختبارات المشروع (DOM وهمي، بلا متصفح).
// الاستعمال: command node track-selection.mjs <جذر الشيفرة>
const R = process.argv[2];
if (!R) throw new Error('الوسيط الأول: جذر الشيفرة');
const { makeExtractor, captureMsg, sample } = await import(`${R}/test/unit/extract/helpers.js`);
const { createMemoryArea } = await import(`${R}/test/helpers/chrome-storage.js`);
const { createStore } = await import(`${R}/src/core/store/index.js`);
const { createController } = await import(`${R}/src/content/controller.js`);
const { buildVideoStateReply } = await import(`${R}/src/core/model/messages.js`);
const { chooseTrack, rankTracks } = await import(`${R}/src/extract/select.js`);
const { click, makeState, mountPage } = await import(`${R}/test/unit/player/controls/harness.js`);
const { detectedSource, pairState } = await import(`${R}/src/pages/popup/status.js`);
const { DEFAULT_LANG_PREFS, initialPair } = await import(`${R}/src/core/model/lang-prefs.js`);

const VID = 'AAAAAAAAAAA';
const BODY = sample('manual').body;
let failures = 0;
const verdict = (name, actual, expected, ok) => {
  console.log(`- ${name}\n  الفعلي:   ${JSON.stringify(actual)}\n  المتوقع:  ${JSON.stringify(expected)}\n  ${ok ? 'مطابق' : 'غير مطابق (يثبت الادعاء)'}`);
  if (!ok) failures++;
};

async function setup() {
  const { extractor, state } = makeExtractor({ videoId: VID, durationMs: null });
  const c = createController({ store: createStore({ area: createMemoryArea({ unlimited: true }) }), extractor, page: { title: () => 'عنوان', durationMs: () => null } });
  await c.start(VID);
  const capture = (t, over) => { state.t = t; return extractor.handleMessage(captureMsg({ videoId: VID, body: BODY }, over)); };
  return { c, extractor, capture };
}

/** ما يختاره المنتج: «الأصل» في المتحكم، و«من» في رد النافذة، والمختار افتراضيًا في قائمة التحميل بالمشغّل. */
function productChoice(c) {
  const s = c.getState();
  const reply = buildVideoStateReply(s, { overlay: 'mounted', controls: 'mounted' });
  const page = mountPage({ state: makeState({ captured: s.captured }) });
  click(page.ui.btn('download'));
  const radios = page.ui.menu().querySelectorAll('button.item[role="radio"]');
  const menuDefault = radios.length
    ? radios.find((r) => r.getAttribute('aria-checked') === 'true')?.getAttribute('data-fid')?.replace('track:', '') ?? null
    : (page.ui.field('language') ? `(صف واحد) ${page.ui.field('language').textContent}` : null);
  const popupReply = { ...reply, watch: true };
  const pair = initialPair(DEFAULT_LANG_PREFS, { videoId: VID, sourceLang: detectedSource(popupReply) });
  const ps = pairState({ reply: popupReply, pair: { from: pair.from, to: pair.to } });
  return {
    controllerEnglish: s.english?.key ?? null,
    popupPair: `${pair.from} → ${pair.to}${ps.ready ? '' : ` (${ps.reason})`}${ps.sourceNote ? ` · ${ps.sourceNote}` : ''}`,
    popupSource: reply.source ? `${reply.source.key} (${reply.source.from})` : null,
    menuDefault,
    downloadButton: !!page.ui.item('تنزيل الملف'),
  };
}
const tested = (c) => ({ chooseTrack: chooseTrack(c.getState().captured)?.key ?? null, rankTracks: rankTracks(c.getState().captured).map((t) => t.key) });

console.log('# A6 — اختيار المسار الافتراضي: المنتج مقابل select.js والعقد');

// C-SUB04: المسار المترجم آليًا من يوتيوب هو الوحيد الملتقط.
{
  console.log('\n## C-SUB04. الملتقط الوحيد ترجمة يوتيوب الآلية (lang=en، tlang=ar)');
  const { c, capture } = await setup();
  const r = capture(1000, { hasTlang: true, tlang: 'ar' });
  console.log(`  القبول: ${JSON.stringify(r)}، والمفتاح: ${c.getState().captured.map((t) => t.key)}`);
  const p = productChoice(c);
  console.log(`  select.js: ${JSON.stringify(tested(c))}`);
  verdict('قراءة ق٢ الحرفية «لا يُختار افتراضيًا أبدًا»', p,
    { controllerEnglish: null, popupSource: null, menuDefault: 'لا مختار حتى يختاره المستخدم صراحة', downloadButton: '—' }, p.controllerEnglish === null);
  console.log('  (والقراءة الأخرى «لا يتقدّم على أصلي» يطابقها المنتج: الحالة الضابطة أدناه.)');
}
{
  console.log('\n## ضابط C-SUB04: ترجمة آلية ومسار أصلي تلقائي معًا');
  const { c, capture } = await setup();
  capture(1000, { hasTlang: true, tlang: 'ar' });
  capture(2000, { trackKind: 'asr', kindParam: 'asr' });
  const p = productChoice(c);
  verdict('الأصلي مختار والآلي في آخر القائمة', p.controllerEnglish, 'en|asr', p.controllerEnglish === 'en|asr' && p.menuDefault === 'en|asr');
}

// C-GAP5: كسر التعادل «ثم الأحدث».
{
  console.log('\n## C-GAP5-a. مساران أصليان يدويان: الإنجليزية أولًا ثم بدّل المستخدم CC في يوتيوب إلى الإسبانية');
  const { c, capture } = await setup();
  capture(1000, {});
  capture(2000, { lang: 'es' });
  const t = tested(c);
  const p = productChoice(c);
  console.log(`  select.js (المختبرة، بلا مستدعٍ في المنتج): ${JSON.stringify(t)}`);
  verdict('المختار افتراضيًا في المتحكم والنافذة والقائمة', p, { controllerEnglish: 'es|manual', popupSource: 'es|manual (captured)', menuDefault: 'es|manual' },
    p.controllerEnglish === 'es|manual' && p.menuDefault === 'es|manual');
}
{
  console.log('\n## C-GAP5-b. ثم أعاد المستخدم CC إلى الإنجليزية (التقاط أحدث للمفتاح نفسه)');
  const { c, capture } = await setup();
  capture(1000, {});
  capture(2000, { lang: 'es' });
  capture(3000, {});
  const t = tested(c);
  const p = productChoice(c);
  console.log(`  ترتيب extractor.tracks(): ${c.getState().captured.map((x) => `${x.key}@${x.capturedAt.slice(17, 19)}s`).join(' ، ')}`);
  console.log(`  select.js: ${JSON.stringify(t)}`);
  verdict('المختار افتراضيًا بعد العودة إلى الإنجليزية', p, { controllerEnglish: 'en|manual', popupSource: 'en|manual (captured)', menuDefault: 'en|manual' },
    p.controllerEnglish === 'en|manual' && p.menuDefault === 'en|manual');
}

console.log(`\nالخلاصة: ${failures} حالة غير مطابقة (المتوقع: C-SUB04 بقراءتها الحرفية، وC-GAP5-a وC-GAP5-b؛ والضابط مطابق).`);
