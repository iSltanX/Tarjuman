// A4 — التحقق من Codex الملاحظة 3 (SUB-02) وتداخلها مع Gemini F-12: فحص «غير مترجم» (noArabic) لا يتبع لغة الترجمة
// المعيّنة حديثًا، ورفع ملف بلا رمز لغة مع اقتراح «إلى». يفصل بين ما يُعرض قبل الحفظ وما يُحفظ وما يُعرض بعده في كل سطح.
// الاستعمال: command node codex3-lang-report.mjs <جذر الشيفرة>
const R = process.argv[2];
if (!R) throw new Error('مرّر جذر الشيفرة');
const imp = (p) => import(`${R}/${p}`);
const { createStore } = await imp('src/core/store/index.js');
const { createMemoryArea } = await imp('test/helpers/chrome-storage.js');
const { createController } = await imp('src/content/controller.js');
const { videoRecord, makeCues, VIDEO_ID } = await imp('test/helpers/fixtures.js');
const { compare, currentComparison } = await imp('src/core/compare/index.js');
const { readFor, loadIntoFor } = await imp('src/player/controls/flows.js');
const importFlow = await imp('src/core/import/index.js');
const player = await imp('src/player/controls/text.js');
const library = await imp('src/pages/library/model.js');
const editor = await imp('src/pages/editor/text.js');
const { applyUpload } = await imp('src/pages/library/actions.js');

const out = [];
const show = (v) => JSON.stringify(v);
const log = (k, actual, expected) => out.push(`${k}\n  الفعلي:   ${show(actual)}\n  المتوقع:  ${show(expected)}\n  ${show(actual) === show(expected) ? 'مطابق' : 'مختلف'}`);
const info = (k, v) => out.push(`${k}\n  القيمة:   ${show(v)}`);
const note = (s) => out.push(`# ${s}`);

const AR3 = (i) => (i === 3 ? 'Still untranslated' : 'ترجمة عربية كاملة');
const cuesAr = makeCues(3, { text: AR3 });
const surfaces = (cmp) => ({
  player: player.comparisonSummary(cmp).text,
  library: library.comparisonSummary(cmp).lines.join(' | '),
  editor: editor.comparisonLines(cmp).filter((l) => l.tone !== 'info').map((l) => l.text).join(' | '),
});

/** سجل بترجمة في الخانة 1 لغتها lang، وتقرير استيرادها محسوب بلغة importTarget (كما يحفظه الاستيراد). */
async function seeded({ cues, lang, importTarget }) {
  const rec = videoRecord({ cues });
  rec.arabic.lang = lang;
  rec.arabic.comparison = compare(cues, rec.fingerprints[0], { target: importTarget });
  const store = createStore({ area: createMemoryArea({ unlimited: true }) });
  await store.updateVideo(rec.videoId, () => rec);
  const c = createController({ store });
  await c.start(rec.videoId);
  return { c, store, rec };
}

// ١) تعيين لغة ترجمة «غير محددة» إلى العربية من قائمة المشغّل (controller.setSlotLang ← withSlotLang).
{
  note('١) ترجمة غير محددة اللغة (تقرير استيرادها بلا فحص)، ثم «لغة الترجمة» = ar من قائمة المشغّل');
  const { c, store, rec } = await seeded({ cues: cuesAr, lang: null, importTarget: null });
  const before = c.getState().arabic;
  await c.setSlotLang(1, 'ar');
  const after = c.getState().arabic;
  const expected = currentComparison(cuesAr, rec.fingerprints[0], { target: 'ar' });
  info('١-أ اللغة قبل/بعد في حالة المتحكم', [before.lang, after.lang]);
  log('١-ب noArabic في تقرير العرض (state.arabic.comparison) بعد التعيين', after.comparison.noArabic, expected.noArabic);
  log('١-ج سطر الملخص في قائمة المشغّل (text.js comparisonSummary)', player.comparisonSummary(after.comparison).text, player.comparisonSummary(expected).text);
  const stored = (await store.getBundle(rec.videoId)).slots[0].track;
  info('١-د التقرير المحفوظ للخانة بعد التعيين (لم يُمس، بحسب عقد withSlotLang)', { lang: stored.lang, noArabic: stored.comparison.noArabic });
  log('١-هـ بطاقة الخانة في المحفوظات (expand.js resultLine ← t.comparison المحفوظ ← model.js comparisonSummary)', library.comparisonSummary(stored.comparison).lines, ['تحذير يذكر المقطع غير المترجم 3']);
  info('١-و المحرّر (compareNow ← currentComparison بلا target، أي ar افتراضيًا) يعيد الحساب', editor.comparisonLines(currentComparison(cuesAr, rec.fingerprints[0], {})).map((l) => l.text));
}

// ٢) الاتجاه المعاكس: تقرير محفوظ بفحص العربية لملف فرنسي وُسم ar خطأً، ثم يصحح المستخدم لغته إلى fr.
{
  note('٢) ملف فرنسي حُفظ بلغة ar (تقريره noArabic=[1,2,3])، ثم «لغة الترجمة» = fr');
  const fr = makeCues(3, { text: (i) => ['Bonjour à tous', 'Merci beaucoup', 'Au revoir'][i - 1] });
  const { c, rec } = await seeded({ cues: fr, lang: 'ar', importTarget: 'ar' });
  const before = c.getState().arabic.comparison.noArabic;
  await c.setSlotLang(1, 'fr');
  const after = c.getState().arabic.comparison;
  const expected = currentComparison(fr, rec.fingerprints[0], { target: 'fr' });
  info('٢-أ noArabic قبل التصحيح', before);
  log('٢-ب noArabic المعروض بعد التصحيح إلى fr', after.noArabic, expected.noArabic);
  log('٢-ج سطر قائمة المشغّل بعد التصحيح', player.comparisonSummary(after).text, player.comparisonSummary(expected).text);
  log('٢-د المحرّر بعد التصحيح (compareNow بلا target ← ar دائمًا)', editor.comparisonLines(currentComparison(fr, rec.fingerprints[0], {})).filter((l) => /غير مترجم/.test(l.text)).map((l) => l.text), []);
}

// ٣) ضابط: الترجمة ذات الفروق البنيوية (نقص) تسلك طريق الحساب الحاضر بمفتاح يحوي اللغة فتتبعها.
{
  note('٣) ضابط: ترجمة بمقطع ناقص (لا يصل الرجوع المبكر)، ثم «لغة الترجمة» = ar');
  const cues2 = makeCues(2, { text: (i) => (i === 2 ? 'Still untranslated' : 'ترجمة عربية كاملة') });
  const rec = videoRecord({ cues: makeCues(3, { text: AR3 }) });
  rec.arabic.original = cues2;
  rec.arabic.lang = null;
  rec.arabic.comparison = compare(cues2.concat([]), rec.fingerprints[0], { target: null });
  const store = createStore({ area: createMemoryArea({ unlimited: true }) });
  await store.updateVideo(rec.videoId, () => rec);
  const c = createController({ store });
  await c.start(rec.videoId);
  info('٣-أ التقرير المحفوظ (missing وnoArabic)', { missing: rec.arabic.comparison.missing, noArabic: rec.arabic.comparison.noArabic });
  await c.setSlotLang(1, 'ar');
  log('٣-ب noArabic المعروض بعد التعيين (يُعاد حسابه لأن مفتاح الذاكرة يحوي اللغة)', c.getState().arabic.comparison.noArabic, [2]);
}

// ٤) الرفع من المشغّل بملف اسمه بلا رمز لغة، و«إلى» في النافذة = ar.
const srtOf = (cues) => cues.map((c) => {
  const t = (ms) => `00:00:${String(Math.floor(ms / 1000)).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
  return `${c.n}\n${t(c.startMs)} --> ${t(c.endMs)}\n${c.text}\n`;
}).join('\n');
async function emptyVideo() {
  const rec = videoRecord({ cues: cuesAr, arabic: false });
  const store = createStore({ area: createMemoryArea({ unlimited: true }) });
  await store.updateVideo(rec.videoId, () => rec);
  const c = createController({ store });
  await c.start(rec.videoId);
  return { c, store, rec };
}
{
  note('٤) المشغّل: أول رفع لملف subtitle.srt (بلا رمز لغة) وfallbackLang = ar (pairTargets(s)[0])');
  const { c } = await emptyVideo();
  const file = new File([srtOf(cuesAr)], 'subtitle.srt');
  const read = await readFor({ controller: c, importFlow, files: file, fallbackLang: 'ar' });
  info('٤-أ لغة الملف المقترحة (input.lang) ورمزه في الاسم (fileLang)', [read.input.lang, read.fileLang]);
  info('٤-ب noArabic في المعاينة (preview، تُعرض في تأكيد الرفع حين يُفتح) وفي تقرير الحفظ (input.comparison)', { preview: read.preview.noArabic, persisted: read.input.comparison.noArabic });
  // أول رفع بلا خانات ولا قرينة اسم: session.js:1115 يحمّل مباشرة بلا تأكيد ثم يفتح قائمة العرض.
  const r = await loadIntoFor({ controller: c, read, n: 1, replace: false });
  const a = c.getState().arabic;
  info('٤-ج نجاح الحفظ واللغة المحفوظة', [r.ok, a.lang]);
  log('٤-د noArabic في قائمة العرض بعد الحفظ', a.comparison.noArabic, read.preview.noArabic);
  log('٤-هـ سطر قائمة المشغّل بعد الحفظ مقابل سطر المعاينة', player.comparisonSummary(a.comparison).text, player.comparisonSummary(read.preview).text);
}

// ٥) ضابط: المحفوظات تعيد حساب تقرير الحفظ إن اختلفت اللغة المختارة عن لغة القراءة (actions.js:351).
{
  note('٥) ضابط: رفع الملف نفسه من المحفوظات (applyUpload) بلغة ar مختارة في الحوار');
  const { store, rec } = await emptyVideo();
  const result = await importFlow.readImport(new File([srtOf(cuesAr)], 'subtitle.srt'), { fingerprints: rec.fingerprints, settings: (await store.getSettings?.()) ?? { thresholds: { driftMs: 100 } } });
  const bundle = await store.getBundle(rec.videoId);
  const settings = { thresholds: { driftMs: 100 }, displayModeDefault: 'ar' };
  await applyUpload({ store, bundle, settings, result, n: 1, fingerprintId: result.fingerprintId, now: () => Date.parse('2026-11-02T12:00:00Z'), lang: 'ar' });
  const t = (await store.getBundle(rec.videoId)).slots[0].track;
  log('٥-أ noArabic في تقرير الحفظ من المحفوظات', t.comparison.noArabic, [3]);
  log('٥-ب بطاقة المحفوظات تعرضه؟ (model.js comparisonSummary: matched أولًا ولا noArabic أصلًا)', library.comparisonSummary(t.comparison).lines, ['1 مقطع غير مترجم: 3 (أو ما يكافئه)']);
  info('٥-ج المشغّل يعرض التقرير نفسه', player.comparisonSummary(t.comparison).text);
}

// ٦) جدول الأسطح لتقرير matched=true مع empty وnoArabic (F-12)، من ملف حقيقي عبر readImport ثم previewComparison كما في
// حوار رفع المحفوظات (upload.js:104–108) وتأكيد المشغّل (flows.js:160).
{
  note('٦) ملف talk.ar.srt مطابق بنيويًا فيه مقطع فارغ (2) ومقطع غير مترجم (1): ما يعرضه كل سطح');
  const fpRec = videoRecord({ cues: makeCues(3) });
  const fp = fpRec.fingerprints[0];
  const srt = srtOf(makeCues(3, { text: (i) => (i === 1 ? 'Hello there' : i === 2 ? '' : 'مرحبًا') })).replace(/\n\n\n/, '\n\n');
  const res = await importFlow.readImport(new File([srt], 'talk.ar.srt'), { fingerprints: [fp], settings: { thresholds: { driftMs: 100 } } });
  const rep = importFlow.previewComparison(res.cues, fp, { settings: { thresholds: { driftMs: 100 } }, notes: res.notes, target: res.lang });
  info('٦-أ التقرير (لغة الملف من اسمه)', { lang: res.lang, cues: res.cues.map((c) => c.text), matched: rep.matched, empty: rep.empty, noArabic: rep.noArabic });
  const s6 = surfaces(rep);
  info('٦-ب الأسطح', s6);
  log('٦-ج المحفوظات (حوار الرفع وبطاقة الخانة) تذكر الفارغ وغير المترجم', s6.library, 'تحذير يذكر المقطع الفارغ 2 وغير المترجم 1');
}

console.log(out.join('\n'));
