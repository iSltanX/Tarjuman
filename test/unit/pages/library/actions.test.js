// أوامر المحفوظات فوق التخزين الحقيقي بمحاكاة chrome.storage (P7-AC2): تصدير العربية بتوقيت التصدير، وتصدير الإنجليزية
// بوضع «عادي» مع حفظ البصمة مرة واحدة، والاستبدال (قراءة ثم تأكيد ثم كتابة مع expect)، والحذف بنطاقيه.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../../src/core/store/index.js';
import { parseSrtStrict } from '../../../../src/core/srt/parser.js';
import { formatSrtTime } from '../../../../src/core/srt/time.js';
import { writeSrt } from '../../../../src/core/srt/writer.js';
import { applyUpload, deleteVideoData, exportArabic, exportEnglish, prepareUpload } from '../../../../src/pages/library/actions.js';
import { withArabicEdit, withView } from '../../../../src/core/model/index.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW, makeCues, videoRecord } from '../../../helpers/fixtures.js';

const ID = 'AAAAAAAAAAA';
let t = Date.parse(NOW);
const now = () => (t += 1000);

async function seeded(over = {}, mutate = (r) => r) {
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now });
  await store.updateVideo(ID, () => mutate(videoRecord({ videoId: ID, ...over })));
  return { area, store };
}
const code = (c) => (e) => {
  assert.equal(e.code, c, `${e.code}: ${e.message}`);
  return true;
};
const sink = () => {
  const files = [];
  return { files, save: async (f) => { files.push(f); return { ok: true, mode: 'downloads', downloadId: files.length }; } };
};
/** حوار «تصدير…» (الفكرة ١١) بإجابة ثابتة؛ ويسجّل ما سُئل به. */
const askWith = (choice = {}, log = []) => async (o) => {
  log.push(o);
  return { format: 'srt', bilingual: false, timing: 'shown', ...choice };
};
const noAsk = askWith();

test('تصدير العربية: إزاحة صفر ← المحفوظ بلا سؤال توقيت في الحوار، باسم VIDEOID.ar.srt وبترقيم من 1', async () => {
  const { store } = await seeded();
  const { files, save } = sink();
  const asked = [];
  const r = await exportArabic({ store, videoId: ID, variant: 'current', ask: askWith({}, asked), save });
  assert.equal(asked.length, 1);
  assert.equal(asked[0].offsetMs, 0, 'الحوار يعرف أن لا إزاحة فلا يسأل عن التوقيت');
  assert.equal(asked[0].hasOriginal, true);
  assert.deepEqual(r, { name: `${ID}.ar.srt`, timing: 'saved', cueCount: 5, saved: { ok: true, mode: 'downloads', downloadId: 1 }, notes: [] });
  assert.equal(files.length, 1);
  const back = parseSrtStrict(files[0].text);
  assert.deepEqual(back.map(({ startMs, endMs, text }) => ({ startMs, endMs, text })), makeCues(5).map(({ startMs, endMs, text }) => ({ startMs, endMs, text })));
});

test('تصدير العربية بإزاحة: يسأل بقيمتها، و«كما يظهر» يضيفها و«المحفوظ» يتركها، والإلغاء لا ينزّل', async () => {
  const { store } = await seeded({ offset: 500 });
  const raw = makeCues(5);
  for (const [choice, delta] of [['shown', 500], ['saved', 0]]) {
    const { files, save } = sink();
    const asked = [];
    const r = await exportArabic({ store, videoId: ID, variant: 'current', ask: askWith({ timing: choice }, asked), save });
    assert.deepEqual(asked.map((o) => o.offsetMs), [500]);
    assert.equal(r.timing, choice);
    assert.equal(parseSrtStrict(files[0].text)[0].startMs, raw[0].startMs + delta);
  }
  const cancelled = sink();
  assert.equal(await exportArabic({ store, videoId: ID, variant: 'current', ask: async () => null, save: cancelled.save }), null);
  assert.equal(cancelled.files.length, 0);
});

test('الزمن السالب بعد الإزاحة يرفض التصدير ويذكر المقاطع (MD_NEGATIVE_TIME) ولا يغيّر المخزَّن', async () => {
  const { store } = await seeded({ offset: -5000 });
  const before = await store.getVideo(ID);
  const { files, save } = sink();
  await assert.rejects(
    exportArabic({ store, videoId: ID, variant: 'current', ask: askWith({ timing: 'shown' }), save }),
    (e) => e.code === 'MD_NEGATIVE_TIME' && /1، 2/.test(e.message),
  );
  assert.equal(files.length, 0);
  assert.deepEqual(await store.getVideo(ID), before);
  // «المحفوظ كما هو» يبقى متاحًا لمن يريد الملف رغم الإزاحة.
  assert.equal((await exportArabic({ store, videoId: ID, variant: 'current', ask: askWith({ timing: 'saved' }), save })).timing, 'saved');
});

test('الأصل المستورد بعد التحرير: النسخة الحالية غير الأصل، وأسماء الملفين مختلفة', async () => {
  const edited = makeCues(5, { text: (i) => `معدّل ${i}` });
  const { store } = await seeded({}, (r) => withArabicEdit(r, { cues: edited }, NOW));
  const { files, save } = sink();
  const cur = await exportArabic({ store, videoId: ID, variant: 'current', ask: noAsk, save });
  const orig = await exportArabic({ store, videoId: ID, variant: 'original', ask: noAsk, save });
  assert.equal(cur.name, `${ID}.ar.srt`);
  assert.equal(orig.name, `${ID}.ar.original.srt`);
  assert.match(files[0].text, /معدّل 1/);
  assert.match(files[1].text, /سطر 1/);
  assert.doesNotMatch(files[1].text, /معدّل/);
});

test('الفكرة ١١: «تصدير…» بالصيغة والمحتوى: WebVTT ومع الأصل من مسار مرجع الترجمة، والاسم المعاين هو اسم الملف، والإزاحة على الملف كله', async () => {
  const { store } = await seeded({ offset: 500 });
  const { files, save } = sink();
  const asked = [];
  const r = await exportArabic({ store, videoId: ID, variant: 'current', ask: askWith({ format: 'vtt', bilingual: true, timing: 'shown' }, asked), save });
  assert.equal(asked[0].hasOriginal, true);
  assert.equal(asked[0].name({ format: 'vtt', bilingual: true }), `${ID}.ar.dual-en.vtt`, 'المعاينة');
  assert.equal(asked[0].name({ format: 'srt', bilingual: false }), `${ID}.ar.srt`);
  assert.equal(r.name, `${ID}.ar.dual-en.vtt`);
  assert.equal(files[0].name, r.name);
  // المقطع الأول 1.0–3.0 وأصله «line 1» في الزمن المحفوظ، والملف بإزاحة +0.5.
  assert.ok(files[0].text.startsWith('WEBVTT\n\n1\n00:00:01.500 --> 00:00:03.500\nسطر 1\nline 1\n'), files[0].text.slice(0, 120));
  assert.equal(r.timing, 'shown');
});

test('الفكرة ١١: بلا مسار أصل محفوظ «مع الأصل» غير متاح (hasOriginal: false)، ولو طُلب صُدِّرت الترجمة وحدها باسمها', async () => {
  const { store } = await seeded({}, (rec) => ({ ...rec, english: [], fingerprints: [] }));
  const { files, save } = sink();
  const asked = [];
  const r = await exportArabic({ store, videoId: ID, variant: 'current', ask: askWith({ format: 'srt', bilingual: true }, asked), save });
  assert.equal(asked[0].hasOriginal, false);
  assert.equal(asked[0].name({ format: 'srt', bilingual: true }), `${ID}.ar.srt`);
  assert.equal(r.name, `${ID}.ar.srt`);
  assert.doesNotMatch(files[0].text, /line/);
});

test('تصدير العربية: لا ترجمة أو لا سجل برمزين ثابتين', async () => {
  const { store } = await seeded({ arabic: false });
  await assert.rejects(exportArabic({ store, videoId: ID, variant: 'current', ask: noAsk, save: async () => ({ ok: true, mode: 'downloads', downloadId: 1 }) }), code('PG_NO_ARABIC'));
  await assert.rejects(exportArabic({ store, videoId: 'BBBBBBBBBBB', variant: 'current', ask: noAsk, save: async () => ({ ok: true, mode: 'downloads', downloadId: 1 }) }), code('PG_VIDEO_GONE'));
});

test('تصدير الإنجليزية: المسار المحفوظ بالوضع «عادي»، وتُحفظ بصمته مرة واحدة ولا تتراكم نسخ متطابقة', async () => {
  const { store } = await seeded();
  const { files, save } = sink();
  const before = await store.getVideo(ID);
  const first = await exportEnglish({ store, videoId: ID, trackKey: 'en|manual', save, now });
  assert.equal(first.name, `${ID}.en.manual.normal.srt`);
  assert.equal(first.fingerprintSaved, true);
  assert.equal(first.cueCount, 5);
  const back = parseSrtStrict(files[0].text);
  assert.deepEqual(back.map((c) => c.text), before.english[0].cues.map((c) => c.text));

  const mid = await store.getVideo(ID);
  assert.equal(mid.fingerprints.length, before.fingerprints.length + 1);
  const saved = mid.fingerprints.at(-1);
  assert.deepEqual([saved.trackKey, saved.mode, saved.count, saved.parts], ['en|manual', 'normal', 5, null]);
  assert.equal(mid.title, before.title, 'العنوان باقٍ كما هو');

  const second = await exportEnglish({ store, videoId: ID, trackKey: 'en|manual', save, now });
  assert.equal(second.fingerprintSaved, false);
  assert.equal((await store.getVideo(ID)).rev, mid.rev, 'لا كتابة ثانية');
  assert.equal(files.length, 2);
  assert.equal(files[0].text, files[1].text);
});

test('تصدير الإنجليزية: مسار غير محفوظ برمز ثابت، ولا ينزّل شيئًا', async () => {
  const { store } = await seeded();
  const { files, save } = sink();
  await assert.rejects(exportEnglish({ store, videoId: ID, trackKey: 'en|asr', save, now }), code('PG_NO_ENGLISH'));
  assert.equal(files.length, 0);
});

const srtFor = (cues) => writeSrt(cues.map((c) => ({ ...c, text: `ترجمة ${c.n}` })));
/** يحفظ أرقام المقاطع كما هي (الكاتب العادي يرقّم من 1)، ليظهر النقص بأرقامه. */
const srtKeepingNumbers = (cues) => cues.map((c) => `${c.n}\n${formatSrtTime(c.startMs)} --> ${formatSrtTime(c.endMs)}\nترجمة ${c.n}\n`).join('\n');
const file = (text, name = 'new.ar.srt') => new File([text], name, { type: 'text/plain' });

test('الاستبدال: قراءة ومقارنة ببصمة السجل، ثم الكتابة تصفّر الإزاحة وتجعل الملف الأصل المستورد وتحفظ السابقة', async () => {
  const { store } = await seeded({ offset: 1000 });
  const prep = await prepareUpload({ store, videoId: ID, files: [file(srtFor(makeCues(5)))] });
  assert.equal(prep.result.ok, true);
  assert.equal(prep.result.comparison.matched, true);
  assert.equal(prep.review.suggested, prep.result.fingerprintId);
  assert.equal(prep.bundle.record.view.displayOffsetMs, 1000, 'القراءة لا تكتب شيئًا');
  assert.equal((await store.getVideo(ID)).arabic.original[0].text, 'سطر 1');

  const info = await applyUpload({ store, bundle: prep.bundle, settings: prep.settings, result: prep.result, n: 1, fingerprintId: prep.result.fingerprintId, now });
  assert.deepEqual(info, { replaced: true, offsetWas: 1000, activated: true });
  const after = await store.getBundle(ID);
  assert.equal(after.record.arabic.fileName, 'new.ar.srt');
  assert.equal(after.record.arabic.original[0].text, 'ترجمة 1');
  assert.equal(after.record.arabic.current, null);
  assert.equal(after.record.view.displayOffsetMs, 0);
  assert.equal(after.record.english.length, 1, 'المسار الإنجليزي باقٍ');
  assert.equal(after.previous.from, 1, 'حُفظت المستبدلة نسخةً سابقة');
  assert.equal(after.previous.track.original[0].text, 'سطر 1');
});

test('الاستبدال: ملف ناقص يظهر في المقارنة، وملف تالف يعيد خطأ بلا كتابة', async () => {
  const { store } = await seeded();
  const missing = await prepareUpload({ store, videoId: ID, files: [file(srtKeepingNumbers(makeCues(5).filter((c) => c.n !== 3)))] });
  assert.equal(missing.result.ok, true);
  assert.equal(missing.result.comparison.matched, false);
  assert.deepEqual(missing.result.comparison.missing, [3]);
  const bad = await prepareUpload({ store, videoId: ID, files: [file('هذا ليس ملف SRT أبدًا')] });
  assert.equal(bad.result.ok, false);
  assert.equal(bad.review, null);
  assert.match(bad.result.error.code, /^IM_/);
  assert.equal((await store.getVideo(ID)).rev, 1);
});

test('الاستبدال: تغيّر الحزمة بين القراءة والتأكيد يرفض الكتابة بـST_CONFLICT', async () => {
  const { store } = await seeded();
  const prep = await prepareUpload({ store, videoId: ID, files: [file(srtFor(makeCues(5)))] });
  await store.updateVideo(ID, (r) => withView(r, { displayOffsetMs: 300 }, NOW));
  await assert.rejects(applyUpload({ store, bundle: prep.bundle, settings: prep.settings, result: prep.result, n: 1, fingerprintId: null, now }), code('ST_CONFLICT'));
  const after = await store.getVideo(ID);
  assert.equal(after.arabic.fileName, `${ID}.ar.srt`, 'لم يُستبدل شيء');
  assert.equal(after.view.displayOffsetMs, 300);
});

test('رفع ترجمة لفيديو بلا عربية (استيراد لا استبدال) يعمل بالمسار نفسه، وإلى خانة فارغة يفعّلها', async () => {
  const { store } = await seeded({ arabic: false });
  const prep = await prepareUpload({ store, videoId: ID, files: [file(srtFor(makeCues(5)))] });
  assert.equal(prep.bundle.record.arabic, null);
  const info = await applyUpload({ store, bundle: prep.bundle, settings: prep.settings, result: prep.result, n: 2, fingerprintId: prep.result.fingerprintId, now });
  assert.deepEqual(info, { replaced: false, offsetWas: 0, activated: true });
  const b = await store.getBundle(ID);
  assert.equal(b.active, 2);
  assert.equal(b.record.arabic.original.length, 5);
  assert.equal(b.previous, null);
});

test('الحذف: «العربية فقط» (الخانة المسرودة) يبقي الإنجليزي والبصمة ويصفّر الإزاحة، و«الكل» يزيل السجل ومُلخّصه', async () => {
  const { store } = await seeded({ offset: 500 });
  await deleteVideoData({ store, videoId: ID, scope: 'arabic', n: 1, now });
  const r = await store.getVideo(ID);
  assert.equal(r.arabic, null);
  assert.equal(r.english.length, 1);
  assert.equal(r.fingerprints.length, 1);
  assert.equal(r.view.displayOffsetMs, 0);
  assert.equal((await store.listIndex()).length, 1);
  await deleteVideoData({ store, videoId: ID, scope: 'arabic', n: 1, now });
  assert.equal((await store.getVideo(ID)).rev, r.rev, 'حذف العربية مرتين لا يكتب ثانية');

  await deleteVideoData({ store, videoId: ID, scope: 'all', now });
  assert.equal(await store.getVideo(ID), null);
  assert.deepEqual(await store.listIndex(), []);
  await assert.rejects(deleteVideoData({ store, videoId: ID, scope: 'everything', now }), RangeError);
});

test('حذف الكل يصلح السجل التالف أيضًا', async () => {
  const { store, area } = await seeded();
  area.rawSet(`video:${ID}`, { broken: true });
  await assert.rejects(store.getVideo(ID), code('ST_CORRUPT_RECORD'));
  await deleteVideoData({ store, videoId: ID, scope: 'all', now });
  assert.equal(await store.getVideo(ID), null);
});

test('رسالة الزمن السالب تقتطع قائمة المقاطع عند 8 مع «…»', async () => {
  const cues = makeCues(12);
  // أقصى إزاحة سالبة (−10 دقائق) تجعل كل المقاطع الاثني عشر سالبة.
  const { store } = await seeded({ offset: -600000, cues });
  await assert.rejects(
    exportArabic({ store, videoId: ID, variant: 'current', ask: askWith({ timing: 'shown' }), save: async () => ({ ok: true, mode: 'downloads', downloadId: 1 }) }),
    (e) => e.code === 'MD_NEGATIVE_TIME' && e.message.includes('1، 2، 3، 4، 5، 6، 7، 8…') && !e.message.includes('9،'),
  );
});

test('تصديران إنجليزيان متزامنان يخزّنان بصمة واحدة (الكشف داخل updateVideo على أحدث نسخة)', async () => {
  const { store } = await seeded();
  const before = (await store.getVideo(ID)).fingerprints.length;
  const { save } = sink();
  const [a, b] = await Promise.all([
    exportEnglish({ store, videoId: ID, trackKey: 'en|manual', save, now }),
    exportEnglish({ store, videoId: ID, trackKey: 'en|manual', save, now }),
  ]);
  assert.deepEqual([a.fingerprintSaved, b.fingerprintSaved].sort(), [false, true]);
  assert.equal((await store.getVideo(ID)).fingerprints.length, before + 1);
});

test('إخفاق حفظ البصمة بعد التنزيل تنبيه (saveError) لا خطأ يُسقط التصدير', async () => {
  const { store, area } = await seeded();
  const { files, save } = sink();
  area.failNext('set', new Error('boom'));
  const r = await exportEnglish({ store, videoId: ID, trackKey: 'en|manual', save, now });
  assert.equal(files.length, 1, 'الملف نزل');
  assert.equal(r.fingerprintSaved, false);
  assert.equal(r.saveError.code, 'ST_WRITE_FAILED');
  assert.equal((await store.getVideo(ID)).fingerprints.length, 1, 'لم تُحفظ');
  const again = await exportEnglish({ store, videoId: ID, trackKey: 'en|manual', save, now });
  assert.equal(again.fingerprintSaved, true, 'إعادة التصدير تحفظها');
});

test('تدقيق 5fedcb9 (GM-015.1): «إبقاء تعديلاتي» في المحفوظات بمحرك المشغّل نفسه (R49): التعارض للملف الجديد، والمطابق للجديد غير معدّل', async () => {
  const { uploadImpact } = await import('../../../../src/pages/library/actions.js');
  const { keepEditsPlan } = await import('../../../../src/player/controls/replace.js');
  const original = makeCues(8);
  const mine = original.map((c, i) => (i === 1 ? { ...c, text: 'تعديلي' } : i === 5 ? { ...c, text: 'تعديلي الآخر' } : c));
  const theirs = original.map((c, i) => (i === 5 ? { ...c, text: 'من الملف' } : i === 7 ? { ...c, text: 'جديد' } : c));
  const bundle = { slots: [{ track: { original, current: mine } }, { track: null }, { track: null }] };
  const lib = uploadImpact(bundle, 1, theirs).keep;
  const player = keepEditsPlan({ original, current: mine }, theirs);
  assert.equal(lib.ok, true);
  assert.equal(lib.cues[5].text, 'من الملف', 'موضع التعارض يأخذه الملف الجديد كالمشغّل');
  assert.deepEqual(lib.cues, player.current, 'النتيجة نفسها في السطحين');
  assert.equal(lib.conflicts, player.conflicts);
  // تعديلات يبطلها الجديد كلها: لا نسخة معدّلة تُكتب (كانت المحفوظات تسمها «معدّلة» رغم مطابقتها الجديد).
  const undone = original.map((c, i) => (i === 5 ? { ...c, text: 'من الملف' } : c));
  const same = uploadImpact({ slots: [{ track: { original, current: undone } }, { track: null }, { track: null }] }, 1, undone).keep;
  assert.deepEqual([same.ok, same.cues], [true, null]);
});

test('تدقيق 5fedcb9 (GM-015.2): تصدير الإنجليزية من المحفوظات عند حد البصمات لا يسقط بصمة خانة غير نشطة (كالمشغّل)', async () => {
  const { sampleBundle, seedBundle } = await import('../../../helpers/fixtures-v2.js');
  const { fingerprint } = await import('../../../helpers/fixtures.js');
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now });
  const b = sampleBundle(); // الخانة 2 مرجعها fp_test000002، والنشطة fp_test000001
  // ثماني بصمات أقدم تملأ الحد (10) مع بصمتي العيّنة.
  const old = Array.from({ length: 8 }, (_, i) => fingerprint({ track: b.record.english[0], id: `fp_old${String(i).padStart(7, '0')}`, createdAt: '2026-10-01T00:00:00.000Z' }));
  // البصمة المرجعية للخانة 2 أول القائمة (الأقدم إضافةً)، فيسقطها الحد أولًا لو لم تُحفظ.
  const [fp1, fp2] = b.record.fingerprints;
  b.record.fingerprints = [fp2, ...old, fp1];
  await seedBundle(store, b);
  const saveFile = async (f) => ({ ok: true, mode: 'downloads', downloadId: 1, name: f.name });
  const r = await exportEnglish({ store, videoId: b.videoId, trackKey: b.record.english[0].key, now, save: saveFile });
  assert.equal(r.fingerprintSaved, true);
  const after = await store.getBundle(b.videoId);
  assert.equal(after.record.fingerprints.length, 10, 'الحد محترم');
  assert.equal(after.slots[1].track.fingerprintId, 'fp_test000002', 'مرجع الخانة 2 باقٍ');
  assert.ok(after.record.fingerprints.some((f) => f.id === 'fp_test000002'));
});

test('تدقيق 5fedcb9 (GM-016.1): النص الدراسي من المحفوظات بروابط حيث يظهر المقطع (المحفوظ + إزاحة العرض) كالمحرّر', async () => {
  const { exportStudy } = await import('../../../../src/pages/library/actions.js');
  const { store } = await seeded({ offset: 2000 });
  const files = [];
  await exportStudy({ store, videoId: ID, format: 'md', bilingual: false, save: async (f) => { files.push(f); return { ok: true, mode: 'downloads', downloadId: 1 }; } });
  const first = videoRecord({ videoId: ID }).arabic.original[0];
  assert.match(files[0].text, new RegExp(`t=${Math.floor((first.startMs + 2000) / 1000)}s`), 'الرابط الأول بإزاحة العرض');
});
