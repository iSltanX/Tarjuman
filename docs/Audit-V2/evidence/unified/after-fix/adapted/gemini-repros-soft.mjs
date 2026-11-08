// نسخة معدّلة (after-fix، «تأكيد لا يوقف التشغيل») من برنامج Gemini الأصلي repros.mjs (حزمة Gemini على 5b9a584).
// لماذا: في الأصل تتوقف كل حالة عند أول assert يسقط فتُسجَّل reproduced:false، ولا تُقيَّم بقية تأكيداتها (وفي بعض الحالات
// تأكيدات لمسائل أخرى، كـF-15: البحث ثم markSaved). هذه النسخة تسجّل كل تأكيد في كل حالة: «بقي» (ما زال صحيحًا، فالعيب باقٍ)
// أو «سقط» (لم يعد صحيحًا، فانعكس)، وتكمل، ثم تطبع السجل عند الخروج. حقل reproduced فيها لا معنى له (التأكيد لا يرمي).
// ما تغيّر (آليًا، ولا شيء غيره):
//   ١. سطر «import assert from 'node:assert/strict'» صار مُسجِّلًا بالواجهة نفسها.
//   ٢. الاستيراد الثابت من مسار المستودع المطلق صار استيرادًا ديناميكيًا من جذر الشيفرة الممرَّر وسيطًا أول (R)، بالمسارات نفسها.
//   ٣. سطر واحد في أول check() يضع معرّف الحالة الجارية للسجل.
// الحالات والقيم والتأكيدات وترتيبها كما في الأصل حرفيًا. وقبل الإصلاح كانت كل التأكيدات «باقية» (14/14 reproduced:true).
// الاستعمال: command node gemini-repros-soft.mjs <جذر الشيفرة>
// سكربت إثبات الملاحظات المؤكدة في تدقيق ترجمان (الالتزام 5b9a584)
import __strict from 'node:assert/strict';
import { resolve as __resolve } from 'node:path';
const R = __resolve(process.argv[2] ?? '.');
const __log = [];
let __cur = null;
function __softCall(name, args) {
  const frames = new Error().stack.split('\n').filter((s) => s.includes(import.meta.url));
  const lines = frames.map((s) => /:(\d+):\d+\)?$/.exec(s)).filter(Boolean).map((m) => Number(m[1]));
  const line = lines.find((n) => n > __end()) ?? null;
  try { (name ? __strict[name] : __strict)(...args); __log.push({ case: __cur, line, ok: true }); }
  catch (e) { __log.push({ case: __cur, line, ok: false, msg: String(e.message).split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 6).join(' ') }); }
}
const assert = new Proxy(function () {}, { apply: (_, __, a) => __softCall(null, a), get: (_, k) => (...a) => __softCall(k, a) });
process.on('exit', () => {
  const src = (__log.length ? __SRC() : []);
  console.log('\n=== سجل التأكيدات (بقي = التأكيد ما زال صحيحًا فالعيب باقٍ؛ سقط = لم يعد صحيحًا) ===');
  for (const r of __log) console.log(`${r.case ? '[' + r.case + '] ' : ''}سطر ${r.line}: ${(src[r.line - 1] ?? '').trim().slice(0, 160)}\n    ⇐ ${r.ok ? 'بقي' : 'سقط: ' + r.msg.slice(0, 300)}`);
  console.log(`المجموع: ${__log.length} تأكيدًا، بقي ${__log.filter((r) => r.ok).length}، وسقط ${__log.filter((r) => !r.ok).length}`);
});
function __SRC() { return __readSelf(); }
import { readFileSync as __rf } from 'node:fs';
import { fileURLToPath as __fu } from 'node:url';
function __readSelf() { return __rf(__fu(import.meta.url), 'utf8').split('\n'); }
function __end() { return __readSelf().findIndex((l) => l.includes('__END_PRELUDE__')) + 1; }
// __END_PRELUDE__ (نهاية المُسجِّل؛ ما بعده الأصل)
const { createMemoryArea } = await import(`${R}/test/helpers/chrome-storage.js`);
const { NOW, VIDEO_ID, makeCues, englishTrack, fingerprint, comparison, videoRecord } = await import(`${R}/test/helpers/fixtures.js`);
const { createStore } = await import(`${R}/src/core/store/index.js`);
const {
  bundleFromBackup,
  bundleToBackup,
  bundleFromRecord,
  withSlotName,
} = await import(`${R}/src/core/model/bundle.js`);
const { storedTrack, validateLangValue } = await import(`${R}/src/core/model/lang-store.js`);
const { rowStatus, libraryEntries, filterEntries, comparisonSummary } = await import(`${R}/src/pages/library/model.js`);
const { librarySummary } = await import(`${R}/src/pages/settings/diagnostics.js`);
const { mergeReports, settingsFailureCode } = await import(`${R}/src/core/backup/restore.js`);
const { compare } = await import(`${R}/src/core/compare/compare.js`);
const { wrapLines } = await import(`${R}/src/core/convert/text.js`);
const { convertTrack } = await import(`${R}/src/core/convert/index.js`);
const { createEditSession } = await import(`${R}/src/core/edit/session.js`);
const { planRescue } = await import(`${R}/src/core/edit/rescue.js`);
const { searchCues, planReplace } = await import(`${R}/src/core/edit/search.js`);
const { buildExport } = await import(`${R}/src/core/export/index.js`);
const { buildPatchPackage } = await import(`${R}/src/core/export/patch.js`);
const { buildStudyText } = await import(`${R}/src/core/export/study.js`);
const { sameBaseLang, normalizeLang } = await import(`${R}/src/core/lang/index.js`);

const results = [];
async function check(id, title, fn) {
  __cur = id;
  try {
    const detail = await fn();
    results.push({ id, title, reproduced: true, detail });
  } catch (err) {
    results.push({ id, title, reproduced: false, error: err?.stack || String(err) });
  }
}

// F-01: itemsFor computes index:<id> from stripped p.record, erasing comparison status for non-English/tlang source tracks
await check('F-01', 'فقدان حالة المقارنة وتحذيرات المحفوظات والتشخيص عند الاستيراد على مسار مصدر غير إنجليزي أو مترجم آليًا (via)', async () => {
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area });
  const jaTrack = englishTrack({ lang: 'ja', cues: makeCues(3, { text: (i) => `行 ${i}` }) });
  const fp = fingerprint({ videoId: VIDEO_ID, track: jaTrack, id: 'fp_ja00000001' });
  const arCues = makeCues(2); // المقطع الثالث ناقص
  const rec = videoRecord({ videoId: VIDEO_ID, cues: arCues });
  rec.english = [jaTrack];
  rec.fingerprints = [fp];
  rec.arabic.fingerprintId = fp.id;
  rec.arabic.comparison = compare(arCues, fp, { target: 'ar' });

  await store.updateBundle(VIDEO_ID, () => bundleFromRecord(rec));

  const rows = libraryEntries(await store.listLibrary());
  assert.equal(rows.length, 1);
  const row = rows[0];
  const status = rowStatus(row);
  const warningsFilter = filterEntries(rows, 'warnings');
  const diag = librarySummary(await store.listIndex());

  // على الرغم من أن الترجمة فيها مقطع ناقص (matched: false, missing: [3])، الفهرس يسجّل matched: null و missing: 0!
  assert.equal(row.arabic.matched, null);
  assert.equal(row.arabic.missing, 0);
  assert.equal(row.summary.warned, 0);
  assert.equal(status.id, 'translated');
  assert.equal(status.text, 'مترجمة');
  assert.equal(warningsFilter.length, 0);
  assert.equal(diag.mismatched, 0);
  assert.equal(diag.withEnglish, 0);

  return {
    indexArabic: row.arabic,
    summary: row.summary,
    rowStatus: status,
    warningsFilterCount: warningsFilter.length,
    diagnosticsLibrary: diag,
  };
});

// F-02: storedTrack wipes comparison when fingerprintId === null (evicted fingerprint) and breaks bundleFromBackup
await check('F-02', 'مسح storedTrack لحقل comparison عند إخلاء البصمة (fingerprintId === null) ورفض استعادة النسخة الاحتياطية بـ لا يطابق ثوابت الحزمة', async () => {
  const rec = videoRecord({ videoId: VIDEO_ID });
  rec.fingerprints = [];
  const bundle = bundleFromRecord(rec);
  const evictedRec = bundle.record;
  assert.equal(evictedRec.arabic.fingerprintId, null);
  assert.notEqual(evictedRec.arabic.comparison, null);
  assert.equal(evictedRec.arabic.comparison.fingerprintId, 'fp_test000001');

  // storedTrack يمسح comparison لأن fp_test000001 لم تعد في v1Prints ولأن fingerprintId === null
  const v1Prints = new Set(evictedRec.fingerprints.map((f) => f.id));
  const split = storedTrack(evictedRec.arabic, v1Prints);
  assert.equal(split.track.comparison, null);
  assert.equal(split.meta, null);

  // وعند استعادة نسخة احتياطية تحتوي على هذا السجل الصالح:
  const emptyMarks = [
    { marks: [], position: null },
    { marks: [], position: null },
    { marks: [], position: null },
  ];
  const backupEntry = {
    record: evictedRec,
    active: 1,
    names: [null, null, null],
    alts: [null, null, null],
    previous: null,
    marks: emptyMarks,
  };
  const parsed = bundleFromBackup(backupEntry);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.path, 'entry.record');

  // وحتى bundleToBackup نفسها تحذف comparison من النسخة الاحتياطية المصدّرة:
  const exported = bundleToBackup(bundle);
  assert.equal(exported.record.arabic.comparison, null);

  return {
    beforeSplitComparisonFp: evictedRec.arabic.comparison.fingerprintId,
    afterStoredTrackComparison: split.track.comparison,
    bundleFromBackupResult: parsed,
    exportedBackupComparison: exported.record.arabic.comparison,
  };
});

// F-03: mergeLang fails to trim r.english (> 8) when non-English tracks have fingerprints and total fingerprints <= 10
await check('F-03', 'فشل mergeLang في تقليم المسارات الأجنبية عند وجود بصمات لها (<= 10) مما يرمي MD_INVALID ويعطّل قراءة الفيديو', async () => {
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area });

  const langs = ['ja', 'fr', 'de', 'es'];
  const rec = videoRecord({ videoId: VIDEO_ID, arabic: true });
  rec.english = [];
  rec.fingerprints = [];
  for (let i = 0; i < langs.length; i++) {
    const l = langs[i];
    const t = englishTrack({ lang: l, capturedAt: `2026-11-01T10:0${i}:00.000Z` });
    const fp = fingerprint({ videoId: VIDEO_ID, track: t, id: `fp_nonen0000${i}`, createdAt: t.capturedAt });
    rec.english.push(t);
    rec.fingerprints.push(fp);
  }
  rec.arabic.fingerprintId = 'fp_nonen00000';
  rec.arabic.comparison = comparison({ fingerprintId: 'fp_nonen00000', count: 5 });
  await store.updateBundle(VIDEO_ID, () => bundleFromRecord(rec));

  // الآن نحاكي رجوع المستخدم إلى 1.1.0 أو تزامن يضيف 5 مسارات إنجليزية (أحدث) إلى video:<id>
  // يصبح في video:<id> 5 مسارات إنجليزية + 4 مسارات في lang:<id> = 9 مسارات (> 8)، بينما مجموع البصمات 9 (<= 10)
  const raw = await area.get(`video:${VIDEO_ID}`);
  const v1Rec = raw[`video:${VIDEO_ID}`];
  const enVariants = ['en', 'en-US', 'en-GB', 'en-CA', 'en-AU'];
  for (let i = 0; i < enVariants.length; i++) {
    const l = enVariants[i];
    const t = englishTrack({ lang: l, capturedAt: `2026-11-01T11:0${i}:00.000Z` });
    const fp = fingerprint({ videoId: VIDEO_ID, track: t, id: `fp_en0000000${i}`, createdAt: t.capturedAt });
    v1Rec.english.push(t);
    v1Rec.fingerprints.push(fp);
  }
  v1Rec.rev += 1;
  v1Rec.updatedAt = '2026-11-01T12:30:00.000Z';
  await area.set({ [`video:${VIDEO_ID}`]: v1Rec });

  const storeAfterReopen = createStore({ area });
  let thrown = null;
  try {
    await storeAfterReopen.getBundle(VIDEO_ID);
  } catch (err) {
    thrown = { code: err.code, message: err.message, detail: err.details?.detail };
  }
  assert.notEqual(thrown, null);
  assert.equal(thrown.code, 'MD_INVALID');

  return thrown;
});

// F-04B-ASR: eventWords collapses space-less ASR events into 1 word at the first segment timestamp, truncating endMs and disabling splitting
await check('F-04B-ASR', 'دمج eventWords لأحداث ASR غير الفضائية (اليابانية/الصينية/التايلاندية) في كلمة واحدة وإسقاط أزمنة tOffsetMs وبتر endMs', async () => {
  const words = ['きょう', 'は', 'とても', 'いい', 'てんき', 'です', 'ね', '。', 'あした', 'も', 'はれる', 'と', 'いい', 'です', 'ね'];
  const body = JSON.stringify({
    events: [{
      tStartMs: 0,
      dDurationMs: 6000,
      segs: words.map((w, k) => ({ utf8: w, ...(k ? { tOffsetMs: k * 350 } : {}), acAsrConf: 0 })),
    }],
  });
  const conv = convertTrack({ body, trackKind: 'asr', durationMs: 10000 });
  assert.equal(conv.cues.length, 1);
  assert.equal(conv.cues[0].startMs, 0);
  assert.equal(conv.cues[0].endMs, 1500);
  assert.equal(conv.report.converter.words, 1);
  return {
    eventDurationMs: 6000,
    lastSegOffsetMs: (words.length - 1) * 350,
    actualCueStartMs: conv.cues[0].startMs,
    actualCueEndMs: conv.cues[0].endMs,
    sourceWords: conv.report.sourceWords,
    converterWords: conv.report.converter.words,
  };
});

// F-05: listLibrary() fast path ignores lang.base version and attaches stale/orphan lang:<id>
await check('F-05', 'مسار listLibrary السريع يتجاهل lang.base ويقرن بيانات lang:<id> اليتيمة أو القديمة بصفوف المحفوظات', async () => {
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area });
  const rec = videoRecord({ videoId: VIDEO_ID });
  rec.english = [];
  rec.fingerprints = [];
  rec.arabic.fingerprintId = null;
  rec.arabic.comparison = comparison({ fingerprintId: null, count: 5 });
  await store.updateVideo(VIDEO_ID, () => rec);

  // نضع مفتاح lang:<id> قديمًا (base.rev = 99 لا يطابق rec.rev) فيه مصدر ياباني
  await area.set({
    [`lang:${VIDEO_ID}`]: {
      schema: 1,
      videoId: VIDEO_ID,
      base: { rev: 99, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      sources: [englishTrack({ lang: 'ja', cues: makeCues(2, { text: (i) => `古い ${i}` }) })],
      prints: [],
      slots: [null, null, null],
      previous: null,
    },
  });

  const rows = libraryEntries(await store.listLibrary());
  // listLibrary يدمج المصدر الياباني اليتيم رغم اختلاف base.rev و base.updatedAt!
  assert.equal(rows[0].english.length, 1);
  assert.equal(rows[0].english[0].key, 'ja|manual');

  return {
    videoRev: rows[0].rev,
    mergedEnglishTracksInListLibrary: rows[0].english,
  };
});

// F-06: Backup restore mergeReports and settingsFailureCode mishandle langPrefs
await check('F-06', 'تجاهل langPrefs في mergeSettings وإرجاع BK_RESTORE_SETTINGS_FAILED المضلّل عند فشل langPrefs وحده', async () => {
  const firstReport = {
    settings: 'failed',
    settingsCode: 'ST_QUOTA_EXCEEDED',
    parts: { settings: 'restored', prefs: 'restored' },
    langPrefs: 'failed',
    added: [VIDEO_ID],
    skipped: [],
    replaced: [],
    changed: [],
    failed: [],
    remaining: [],
    stopped: false,
  };
  const codeWhenOnlyLangPrefsFailed = settingsFailureCode(firstReport);
  assert.equal(codeWhenOnlyLangPrefsFailed, 'BK_RESTORE_SETTINGS_FAILED');

  // وعند إعادة المحاولة الجزئية، mergeReports يفحص parts.settings و parts.prefs فقط فيعتبر settings = 'restored' ويسقط langPrefs!
  const retryReport = {
    settings: null,
    settingsCode: null,
    parts: { settings: null, prefs: null },
    added: [],
    skipped: [],
    replaced: [],
    changed: [],
    failed: [],
    remaining: [],
    stopped: false,
  };
  const merged = mergeReports(firstReport, retryReport);
  assert.equal(merged.settings, 'restored');
  assert.equal(settingsFailureCode(merged), null);
  assert.equal('langPrefs' in merged, false);

  return {
    codeWhenOnlyLangPrefsFailed,
    mergedSettingsStatusAfterRetry: merged.settings,
    hasLangPrefsInMergedReport: 'langPrefs' in merged,
  };
});

// F-07: Library comparisonSummary ignores empty and noArabic cues when r.matched === true
await check('F-07', 'دالة comparisonSummary في المحفوظات تتجاهل المقاطع الفارغة (empty) وغير المترجمة (noArabic) متى تطابق التوقيت والعدد', async () => {
  const en = englishTrack({ cues: makeCues(2, { text: (i) => `line ${i}` }) });
  const fp = fingerprint({ videoId: VIDEO_ID, track: en });
  const cues = [
    { n: 1, startMs: en.cues[0].startMs, endMs: en.cues[0].endMs, text: 'Untranslated English line' },
    { n: 2, startMs: en.cues[1].startMs, endMs: en.cues[1].endMs, text: '   ' },
  ];
  const cmp = compare(cues, fp, { target: 'ar' });
  const summary = comparisonSummary(cmp);

  assert.equal(cmp.matched, true);
  assert.deepEqual(cmp.noArabic, [1]);
  assert.deepEqual(cmp.empty, [2]);
  assert.deepEqual(summary, { tone: 'success', lines: ['مطابق للأصل'] });

  return {
    compareResult: { matched: cmp.matched, noArabic: cmp.noArabic, empty: cmp.empty },
    librarySummary: summary,
  };
});

// F-09: wrapLines splits NFD combining marks (e.g. Japanese dakuten) and Thai tone/vowel marks across lines, causing EX_INVARIANT_FAILED
await check('F-09', 'انكسار wrapLines بين الحرف وحركته المركّبة (NFD في اليابانية أو التايلاندية القياسية) ورمي EX_INVARIANT_FAILED في convertTrack', async () => {
  const nfdText = `${'あ'.repeat(21)}て\u3099${'あ'.repeat(21)}`;
  const wrapped = wrapLines(nfdText, 42);
  const lines = wrapped.split('\n');
  const startsWithCombiningMark = /^\p{M}/u.test(lines[1] || '');

  // وفي التايلاندية القياسية (NFC): 21 حرفًا تايلانديًا ثم حرف ساكن 'น' يتبعه علامة نغمة '\u0E48' (MAI EK) ثم 21 حرفًا
  const thaiText = `${'ก'.repeat(21)}น\u0E48${'ก'.repeat(21)}`;
  const thaiWrapped = wrapLines(thaiText, 42).split('\n');
  const thaiSecondLineStartsWithMark = /^\p{M}/u.test(thaiWrapped[1] || '');

  const body = JSON.stringify({
    events: [{ tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: nfdText }] }],
  });
  const conv = convertTrack({ body, trackKind: 'asr', durationMs: 5000 });
  assert.equal(startsWithCombiningMark, true);
  assert.equal(thaiSecondLineStartsWithMark, true);
  assert.equal(conv.ok, false);
  assert.equal(conv.code, 'EX_INVARIANT_FAILED');

  return {
    japaneseLines: lines,
    secondLineStartsWithCombiningMark: startsWithCombiningMark,
    thaiLines: thaiWrapped,
    thaiSecondLineStartsWithMark,
    convertResult: { ok: conv.ok, code: conv.code, failedInvariants: conv.invariants?.results.filter((r) => !r.ok) },
  };
});

// F-10: planRescue produces false timing conflicts and inflated change counts when committed !== 0
await check('F-10', 'دالة planRescue تمرّر mine المزاحة بـ committed إلى mergeThreeWay فتنتج تعارضات توقيت وهمية وتضخّم عدد التعديلات وتفسد التوقيت', async () => {
  const base = makeCues(12);
  const session = createEditSession({ cues: base, offsetMs: 2000 });
  // المستخدم يثبّت الإزاحة (+2000ms) في التوقيت، ويعدّل نص المقطع الأول فقط
  session.commitOffset();
  session.setText(0, 'مقطع أول معدّل');

  // التبويب الآخر عدّل توقيت المقطع السادس بـ +100ms فقط ولم يلمس المقطع الأول
  const theirs = structuredClone(base);
  theirs[5].startMs += 100;
  theirs[5].endMs += 100;

  const rescue = planRescue({
    base,
    mine: session.snapshot(),
    theirs,
    offsets: { base: 2000, mine: session.offsetMs, theirs: 2000, committed: session.committedMs },
  });

  // بسبب عدم طرح committed (2000ms) من mine قبل الدمج:
  // 1) counts.mine يحسب جميع مقاطع الملف معدَّلة (12 بدل 1)
  // 2) المقطع السادس يُصنَّف تعارضًا (timing conflict) مع أن المستخدم لم يلمسه يدويًا!
  assert.ok(rescue.counts.mine >= 12);
  assert.equal(rescue.conflicts.length, 1);
  assert.equal(rescue.conflicts[0].n, 6);

  return {
    counts: rescue.counts,
    conflicts: rescue.conflicts,
    mergedCue6StartMs: rescue.cues[5].startMs,
    expectedCue6StartMs: theirs[5].startMs + 2000,
    mergedOffsetMs: rescue.offsetMs,
  };
});

// F-11: buildPatchPackage rejects valid source cues starting with '# ' or containing <...> that buildExport accepts
await check('F-11', 'رفض buildPatchPackage لمقاطع مصدر صالحة تبدأ بـ "# " أو تحوي وسومًا يقبلها buildExport', async () => {
  const track = englishTrack({
    cues: [
      { n: 1, startMs: 0, endMs: 1000, text: '# of people in the room' },
      { n: 2, startMs: 1000, endMs: 2000, text: '<i>Hello world</i>' },
      { n: 3, startMs: 2000, endMs: 3000, text: 'Normal line' },
    ],
  });

  // buildExport يصدّر المسار بنجاح وينشئ البصمة
  const exported = buildExport({ videoId: VIDEO_ID, title: 'Test', track, mode: 'normal', target: 'ar' });
  assert.equal(exported.files.length, 1);

  // أما buildPatchPackage فيفشل بـ EX_PATCH_SOURCE_UNWRITABLE على المقطع 1 وبـ EX_INVARIANT_FAILED على المقطع 2!
  const patch1 = buildPatchPackage({
    videoId: VIDEO_ID,
    title: 'Test',
    fingerprint: exported.fingerprint,
    englishTracks: [track],
    numbers: [1],
    target: 'ar',
  });
  const patch2 = buildPatchPackage({
    videoId: VIDEO_ID,
    title: 'Test',
    fingerprint: exported.fingerprint,
    englishTracks: [track],
    numbers: [2],
    target: 'ar',
  });
  assert.equal(patch1.ok, false);
  assert.equal(patch1.code, 'EX_PATCH_SOURCE_UNWRITABLE');
  assert.equal(patch2.ok, false);
  assert.equal(patch2.code, 'EX_INVARIANT_FAILED');

  return {
    exportedFilesCount: exported.files.length,
    patchHashResult: patch1,
    patchTagResult: patch2,
  };
});

// F-14: validateLangValue omits duplicate print id check
await check('F-14', 'قبول validateLangValue لبصمات مكررة المعرّف (id) في prints مما يسبّب فشل الحزمة لاحقًا عند الدمج', async () => {
  const ja = englishTrack({ lang: 'ja' });
  const dupFp = fingerprint({ videoId: VIDEO_ID, track: ja, id: 'fp_dup0000001' });
  const langVal = {
    schema: 1,
    videoId: VIDEO_ID,
    base: { rev: 1, createdAt: NOW, updatedAt: NOW },
    sources: [ja],
    prints: [dupFp, { ...dupFp }],
    slots: [null, null, null],
    previous: null,
  };
  const v = validateLangValue(langVal);
  assert.equal(v.ok, true);
  return { validateLangValueWithDuplicatePrintIds: v };
});

// F-15: searchCues wholeWord:true, ignoreMarks:false leaves trailing harakat attached on replacement, and session.markSaved / reshaped bugs
await check('F-15', 'بحث الكلمة الكاملة مع مطابقة التشكيل يترك التشكيل القديم ملتصقًا بالبديل، وأعطال markSaved و reshaped في جلسة المحرّر', async () => {
  const cues = [{ n: 1, startMs: 0, endMs: 1000, text: 'جاء محمدٌ اليوم' }];
  const matches = searchCues(cues, 'محمد', { wholeWord: true, ignoreMarks: false });
  const replaced = planReplace(cues, matches, 'أحمد');
  // تنوين الضمّ (ٌ) من "محمدٌ" بقي ملتصقًا بـ"أحمد"!
  assert.equal(replaced.changes[0].after, 'جاء أحمدٌ اليوم');

  // عطل session.markSaved مع openGroup:
  const s1 = createEditSession({ cues: makeCues(2) });
  s1.setText(0, 'مرحبا 1');
  const cp = s1.checkpoint();
  s1.markSaved({ cues: s1.snapshot(), offsetMs: s1.offsetMs }, cp);
  // المستخدم يمسح " 1" ويعود إلى النص الأصلي دون مغادرة الحقل (openGroup = 'text:0')
  s1.setText(0, 'سطر 1');
  assert.equal(s1.dirty, true);
  assert.equal(s1.canUndo, false); // ضاعت إمكانية التراجع رغم أن الجلسة dirty!

  return {
    searchReplaceResult: replaced.changes[0].after,
    sessionAfterSaveAndRevert: { dirty: s1.dirty, changedCount: s1.changedCount, canUndo: s1.canUndo },
  };
});

// F-16: sameBaseLang vs strict equality in buildExport / buildPatchPackage, and normalizeLang subtag drop
await check('F-16', 'تضارب فحص تساوي اللغة بين الواجهة (sameBaseLang) والتصدير/الترقيع (source === target) مع اللهجات والرموز المترادفة', async () => {
  const track = englishTrack({ lang: 'ar-EG', cues: [{ n: 1, startMs: 0, endMs: 1000, text: 'أهلاً بيكم' }] });

  // الواجهة تمنع نسخ التعليمات لأن sameBaseLang('ar-EG', 'ar') === true
  const blockedInPopup = sameBaseLang('ar-EG', 'ar');
  // بينما buildExport مع target='ar' يولّد تعليمات "من العربية (مصر) (ar-EG) إلى العربية (ar)"!
  const exported = buildExport({ videoId: VIDEO_ID, title: 'Test', track, mode: 'normal', target: 'ar' });
  const firstLine = exported.instructions.split('\n')[0];

  assert.equal(blockedInPopup, true);
  assert.ok(firstLine.includes('(ar-EG)') && firstLine.includes('(ar)'));

  return {
    sameBaseLangArEgToAr: blockedInPopup,
    exportedInstructionFirstLine: firstLine,
    normalizeLangZhHakka: normalizeLang('zh-hakka'),
  };
});

// F-17: buildStudyText joins CJK cues with ASCII spaces and splits only on [.!?؟…]
await check('F-17', 'تصدير نص المذاكرة (buildStudyText) يفصل مقاطع اللغات غير الفضائية (CJK) بمسافات لاتينية ولا يتعرّف على نقطة الجملة (。)', async () => {
  const cues = Array.from({ length: 8 }, (_, i) => ({
    n: i + 1,
    startMs: i * 1000,
    endMs: (i + 1) * 1000,
    text: `文${i + 1}。`,
  }));
  const study = buildStudyText({
    videoId: VIDEO_ID,
    title: 'درس',
    cues,
    format: 'txt',
    bilingual: false,
    lang: 'ja',
  });
  assert.ok(study.text.includes('文1。 文2。 文3。 文4。 文5。 文6。 文7。 文8。'));
  return { output: study.text };
});

console.log(JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.reproduced);
if (failed.length) process.exitCode = 1;
