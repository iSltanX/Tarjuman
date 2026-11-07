// A4 — التحقق من Gemini F-13 (جزء المشغّل): بعد تغيير لغة الترجمة من قائمة المشغّل، هل تُحدَّث سمتا lang وdir في صفوف
// اللوحة المتزامنة (transcript.sync) وفي السطر المعروض في الطبقة (view.render)؟ متحكم حقيقي وتخزين وهمي، ووحدتا اللوحة
// والطبقة الحقيقيتان فوق DOM المشروع الوهمي (test/unit/player/overlay/fake-dom.js).
// الاستعمال: command node gemini-f13-panel-overlay.mjs <جذر الشيفرة>
const R = process.argv[2];
if (!R) throw new Error('مرّر جذر الشيفرة');
const imp = (p) => import(`${R}/${p}`);
const { createStore } = await imp('src/core/store/index.js');
const { createMemoryArea } = await imp('test/helpers/chrome-storage.js');
const { createController } = await imp('src/content/controller.js');
const { videoRecord, makeCues } = await imp('test/helpers/fixtures.js');
const { createTranscript } = await imp('src/player/panel/transcript.js');
const { createOverlayView } = await imp('src/player/overlay/view.js');
const { decide } = await imp('src/player/overlay/decision.js');
const { createFakeEnv, addPlayer } = await imp('test/unit/player/overlay/fake-dom.js');

const out = [];
const log = (k, actual, expected) => out.push(`${k}\n  الفعلي:   ${JSON.stringify(actual)}\n  المتوقع:  ${JSON.stringify(expected)}\n  ${JSON.stringify(actual) === JSON.stringify(expected) ? 'مطابق' : 'مختلف'}`);
const info = (k, v) => out.push(`${k}\n  القيمة:   ${JSON.stringify(v)}`);
const note = (s) => out.push(`# ${s}`);

// ترجمة فرنسية رُفعت فوُسمت ar (اقتراح «إلى» أو اختيار خاطئ)، ثم يصححها المستخدم إلى fr من قائمة المشغّل.
const cues = makeCues(3, { text: (i) => ['Bonjour à tous', 'Merci beaucoup', 'Au revoir'][i - 1] });
const rec = videoRecord({ cues });
rec.arabic.lang = 'ar';
const store = createStore({ area: createMemoryArea({ unlimited: true }) });
await store.updateVideo(rec.videoId, () => rec);
const c = createController({ store });
await c.start(rec.videoId);
const s0 = c.getState();
await c.setSlotLang(1, 'fr');
const s1 = c.getState();

note('١) مرجع المقاطع في حالة المتحكم قبل التغيير وبعده (controller.js:145، مفتاح stable بلا لغة)');
info('١-أ اللغة قبل/بعد', [s0.arabic.lang, s1.arabic.lang]);
log('١-ب state.arabic.cues هو المرجع نفسه بعد setSlotLang', s1.arabic.cues === s0.arabic.cues, true);
log('١-ج decide().ar (مصدر الطبقة) هو المرجع نفسه', decide(s1, { videoId: rec.videoId, navigating: false, ad: false }).ar === decide(s0, { videoId: rec.videoId, navigating: false, ad: false }).ar, true);

note('٢) اللوحة المتزامنة: sync بالمرجع نفسه ولغة جديدة (كما يمرره panel/view.js:397)');
{
  const env = createFakeEnv();
  const t = createTranscript({ doc: env.doc, onSeek: () => {} });
  const r0 = t.sync({ cues: s0.arabic.cues, originalCues: null, offsetMs: 0, translationLang: s0.arabic.lang });
  const span = () => t.list.children[0].children[1].children[0];
  info('٢-أ أول بناء', { rebuilt: r0.rebuilt, lang: span().getAttribute('lang'), dir: span().getAttribute('dir') });
  const r1 = t.sync({ cues: s1.arabic.cues, originalCues: null, offsetMs: 0, translationLang: s1.arabic.lang });
  info('٢-ب نتيجة sync بعد تغيير اللغة', r1);
  log('٢-ج lang/dir للصف الأول بعد تغيير اللغة إلى fr', { lang: span().getAttribute('lang'), dir: span().getAttribute('dir') }, { lang: 'fr', dir: 'ltr' });
  t.clear();
  t.sync({ cues: s1.arabic.cues, originalCues: null, offsetMs: 0, translationLang: s1.arabic.lang });
  info('٢-د بعد إغلاق اللوحة وفتحها (clear ثم sync)', { lang: span().getAttribute('lang'), dir: span().getAttribute('dir') });
}

note('٣) الطبقة: السطر الظاهر لحظة التغيير (متوقف أو لم يتغير المقطع بعد)');
{
  const env = createFakeEnv();
  const parts = addPlayer(env);
  const view = createOverlayView(env);
  view.attachTo(parts.player);
  const stage = view.host.shadowRoot.children.find((x) => x.className.includes('stage'));
  const line = () => ({ lang: stage.children[0].getAttribute('lang'), dir: stage.children[0].getAttribute('dir') });
  view.setTranslationLang('ar');
  view.render({ ar: ['Bonjour à tous'], en: [] });
  info('٣-أ السطر قبل التغيير', line());
  // overlay/session.js:93 ثم المحرّك يعيد أسطر المقطع نفسه
  view.setTranslationLang('fr');
  view.render({ ar: ['Bonjour à tous'], en: [] });
  log('٣-ب السطر الظاهر بعد التغيير (المقطع نفسه)', line(), { lang: 'fr', dir: 'ltr' });
  view.render({ ar: ['Merci beaucoup'], en: [] });
  info('٣-ج المقطع التالي', line());
}
console.log(out.join('\n'));
