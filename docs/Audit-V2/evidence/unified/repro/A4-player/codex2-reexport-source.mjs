// A4 — التحقق من Codex الملاحظة 2 (SUB-03): إعادة تنزيل مسار محفوظ بصمته معروفة لا تحدّث «آخر تنزيل»، فتبقى «من» على تنزيل سابق.
// لا متصفح ولا شبكة ولا كتابة خارج الذاكرة. الاستعمال: command node codex2-reexport-source.mjs <جذر الشيفرة>
const R = process.argv[2];
if (!R) throw new Error('مرّر جذر الشيفرة');
const imp = (p) => import(`${R}/${p}`);
const { createStore } = await imp('src/core/store/index.js');
const { createMemoryArea } = await imp('test/helpers/chrome-storage.js');
const { createController } = await imp('src/content/controller.js');
const { buildVideoStateReply } = await imp('src/core/model/messages.js');
const { buildExport, instructions } = await imp('src/core/export/index.js');
const { englishTrack, videoRecord, makeCues, fakeExtractor } = await imp('test/helpers/fixtures.js');
const { prepareSavedExport, recordSavedFor, recordFor, prepareExport } = await imp('src/player/controls/flows.js');
const { exportEnglish } = await imp('src/pages/library/actions.js');
const { DEFAULT_LANG_PREFS, initialPair, pairPatch, applyLangPrefs } = await imp('src/core/model/lang-prefs.js');
const { detectedSource, pairState, copyArgs } = await imp('src/pages/popup/status.js');

const out = [];
const log = (k, actual, expected) => out.push(`${k}\n  الفعلي:   ${JSON.stringify(actual)}\n  المتوقع:  ${JSON.stringify(expected)}\n  ${JSON.stringify(actual) === JSON.stringify(expected) ? 'مطابق' : 'مختلف'}`);
const note = (s) => out.push(`# ${s}`);
const at = (h) => Date.parse(`2026-11-02T${h}:00:00Z`);
const exportFlow = { buildExport };
const reply = (c) => buildVideoStateReply(c.getState(), { overlay: 'mounted', controls: 'mounted' });

/** ما تبنيه نافذة الإضافة من الرد: الزوج المبدئي (initialPair + detectedSource) وسطر الشرح والتعليمات المنسوخة. */
function popup(r, prefs = DEFAULT_LANG_PREFS) {
  const p = initialPair(prefs, { videoId: r.videoId, sourceLang: detectedSource(r) });
  const pair = { from: p.from, to: p.to };
  const st = pairState({ reply: r, pair });
  const args = copyArgs({ reply: r, pair, glossary: null });
  const text = instructions(args);
  return { pair, fromDetected: p.fromDetected, sourceNote: st.sourceNote, caption: st.caption, firstLine: text.split('\n')[0], partsParagraph: /الملف مقسّم إلى أجزاء/.test(text), parts: args.parts };
}

const en = englishTrack({ lang: 'en', cues: makeCues(5, { text: (i) => `line ${i}` }), capturedAt: '2026-11-02T11:00:00Z' });
const es = englishTrack({ lang: 'es', cues: makeCues(5, { text: (i) => `línea ${i}` }), capturedAt: '2026-11-02T11:30:00Z' });

async function setup({ esSplit = false } = {}) {
  const rec = videoRecord({ arabic: false });
  const id = rec.videoId;
  const enX = buildExport({ videoId: id, track: en, mode: 'normal', now: at('12') });
  const esX = buildExport({ videoId: id, track: es, mode: 'normal', now: at('13'), split: esSplit ? { size: 2, by: 'count' } : null });
  rec.english = [en, es];
  rec.fingerprints = [enX.fingerprint, esX.fingerprint];
  const store = createStore({ area: createMemoryArea({ unlimited: true }) });
  await store.updateVideo(id, () => rec);
  return { id, store };
}

// ١) المشغّل بلا التقاط (FA-17): «تنزيل الملف» يبني المسار المحفوظ المختار (pickEnglish) ثم recordSavedFor.
{
  note('١) المشغّل: زيارة بلا التقاط حي، مسارا en (12:00) وes (13:00) محفوظان ببصمتيهما، ثم «تنزيل الملف»');
  const { id, store } = await setup();
  const c = createController({ store });
  await c.start(id);
  const before = reply(c);
  log('١-أ مسار التنزيل المحفوظ الذي يختاره المشغّل (s.english)', c.getState().english.key, 'en|manual');
  log('١-ب «من» قبل التنزيل (source.lang)', before.source.lang, 'es');
  const prep = prepareSavedExport({ controller: c, exportFlow, now: at('14') });
  log('١-ج اسم الملف المنزَّل', prep.built.files[0].name, `${id}.en.manual.normal.srt`);
  const rec = await recordSavedFor({ controller: c, key: prep.key, built: prep.built, videoId: id });
  const after = reply(c);
  log('١-د ما تقوله الواجهة بعد التنزيل (recordSavedFor.saved، بلا تحذير)', rec.saved, true);
  log('١-هـ عدد البصمات بعد التنزيل (لم تُحفظ بصمة جديدة)', after.lastExport && c.getState().saved.fingerprints.length, 2);
  log('١-و «من» (source.lang) بعد تنزيل الإنجليزية', after.source.lang, 'en');
  log('١-ز lastExport.lang بعد تنزيل الإنجليزية', after.lastExport.lang, 'en');
  const pp = popup(after);
  log('١-ح «من» المبدئية في نافذة الإضافة (افتراضي «تلقائي»)', pp.pair.from, 'en');
  log('١-ط سطر «مكتشفة من ترجمة الفيديو» تحت «من»', pp.sourceNote, '«من» مكتشفة من ترجمة الفيديو');
  log('١-ي أول سطر من التعليمات المنسوخة', pp.firstLine, 'ترجمة ملف ترجمة فيديو (SRT) من الإنجليزية (en) إلى العربية (ar)');
}

// ٢) التفاقم: التنزيل الإسباني السابق كان مقسّمًا، فتُلحق فقرة أجزائه بتعليمات ملف إنجليزي غير مقسّم.
{
  note('٢) كالسابق، لكن تنزيل es عند 13:00 كان مقسّمًا (3 أجزاء)');
  const { id, store } = await setup({ esSplit: true });
  const c = createController({ store });
  await c.start(id);
  const prep = prepareSavedExport({ controller: c, exportFlow, now: at('14') });
  await recordSavedFor({ controller: c, key: prep.key, built: prep.built, videoId: id });
  const pp = popup(reply(c));
  log('٢-أ «من» المبدئية بعد تنزيل en غير المقسّم', pp.pair.from, 'en');
  log('٢-ب فقرة الأجزاء في التعليمات المنسوخة', { included: pp.partsParagraph, parts: pp.parts }, { included: false, parts: null });
}

// ٣) المحفوظات: «تصدير» en ثم es ثم en من القائمة (exportEnglish)؛ كل ذلك من المحفوظات وحدها.
{
  note('٣) المحفوظات: تصدير en (12:00) ثم es (13:00) ثم en مجددًا (14:00) عبر exportEnglish');
  const rec = videoRecord({ arabic: false });
  const id = rec.videoId;
  rec.english = [en, es];
  rec.fingerprints = [];
  const store = createStore({ area: createMemoryArea({ unlimited: true }) });
  await store.updateVideo(id, () => rec);
  const save = async () => ({ ok: true, mode: 'download' });
  const r1 = await exportEnglish({ store, videoId: id, trackKey: 'en|manual', save, now: () => at('12') });
  const r2 = await exportEnglish({ store, videoId: id, trackKey: 'es|manual', save, now: () => at('13') });
  const r3 = await exportEnglish({ store, videoId: id, trackKey: 'en|manual', save, now: () => at('14') });
  log('٣-أ fingerprintSaved للتصديرات الثلاثة (منع التكرار مقصود؛ للمعلومة)', [r1.fingerprintSaved, r2.fingerprintSaved, r3.fingerprintSaved], [true, true, false]);
  const c = createController({ store });
  await c.start(id);
  const r = reply(c);
  log('٣-ب «من» في رد الفيديو عند فتحه بعد التصدير الثالث', r.source.lang, 'en');
  log('٣-ج «من» المبدئية في النافذة', popup(r).pair.from, 'en');
}

// ٤) ضابط: مسار الالتقاط الحي (recordExport) يضيف بصمة جديدة دائمًا، فيتحدّث «آخر تنزيل».
{
  note('٤) ضابط: الالتقاط الحي للمسار en ثم تنزيله (recordFor/recordExport) بعد es');
  const { id, store } = await setup();
  const ex = fakeExtractor({ videoId: id, tracks: [{ key: 'en|manual', kind: 'manual', lang: 'en', cues: en.cues }] });
  const c = createController({ store, extractor: ex });
  await c.start(id);
  const prep = prepareExport({ controller: c, exportFlow, key: 'en|manual', mode: 'normal', split: null, now: at('14') });
  const rec = await recordFor({ controller: c, key: 'en|manual', built: prep.built, videoId: id });
  log('٤-أ حفظ البصمة', rec.saved, true);
  log('٤-ب «من» بعد تنزيل الملتقط', reply(c).source.lang, 'en');
}

// ٥) هل يلاحظ المستخدم ويصحّح؟ اختيار «من» يدويًا يُحفظ للفيديو ويتقدم على المكتشفة.
{
  note('٥) التصحيح اليدوي في النافذة: اختيار «من» = en لهذا الفيديو (pairPatch why=from)');
  const { id, store } = await setup();
  const c = createController({ store });
  await c.start(id);
  const prep = prepareSavedExport({ controller: c, exportFlow, now: at('14') });
  await recordSavedFor({ controller: c, key: prep.key, built: prep.built, videoId: id });
  const r = reply(c);
  const prefs = applyLangPrefs(DEFAULT_LANG_PREFS, pairPatch(DEFAULT_LANG_PREFS, { videoId: id, pair: { from: 'en', to: 'ar' }, why: 'from' }));
  const pp = popup(r, prefs);
  log('٥-أ «من» بعد اختيار المستخدم', pp.pair.from, 'en');
  log('٥-ب السطر «مكتشفة» يختفي (from ≠ المكتشفة)', pp.sourceNote, null);
  log('٥-ج أول سطر من التعليمات', pp.firstLine, 'ترجمة ملف ترجمة فيديو (SRT) من الإنجليزية (en) إلى العربية (ar)');
}

console.log(out.join('\n'));
