// أوامر المحفوظات فوق التخزين الحقيقي بمحاكاة chrome.storage (P7-AC2): تصدير العربية بتوقيت التصدير، وتصدير الإنجليزية
// بوضع «عادي» مع حفظ البصمة مرة واحدة، والاستبدال (قراءة ثم تأكيد ثم كتابة مع expect)، والحذف بنطاقيه.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../../src/core/store/index.js';
import { parseSrtStrict } from '../../../../src/core/srt/parser.js';
import { formatSrtTime } from '../../../../src/core/srt/time.js';
import { writeSrt } from '../../../../src/core/srt/writer.js';
import { applyReplacement, deleteVideoData, exportArabic, exportEnglish, readReplacement } from '../../../../src/pages/library/actions.js';
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
  return { files, download: (f) => files.push(f) };
};
const noAsk = () => assert.fail('لا سؤال عن التوقيت عند إزاحة صفر');

test('تصدير العربية: إزاحة صفر ← المحفوظ دون سؤال، باسم VIDEOID.ar.srt وبترقيم من 1', async () => {
  const { store } = await seeded();
  const { files, download } = sink();
  const r = await exportArabic({ store, videoId: ID, variant: 'current', askTiming: noAsk, download });
  assert.deepEqual(r, { name: `${ID}.ar.srt`, timing: 'saved', cueCount: 5 });
  assert.equal(files.length, 1);
  const back = parseSrtStrict(files[0].text);
  assert.deepEqual(back.map(({ startMs, endMs, text }) => ({ startMs, endMs, text })), makeCues(5).map(({ startMs, endMs, text }) => ({ startMs, endMs, text })));
});

test('تصدير العربية بإزاحة: يسأل بقيمتها، و«كما يظهر» يضيفها و«المحفوظ» يتركها، والإلغاء لا ينزّل', async () => {
  const { store } = await seeded({ offset: 500 });
  const raw = makeCues(5);
  for (const [choice, delta] of [['shown', 500], ['saved', 0]]) {
    const { files, download } = sink();
    const asked = [];
    const r = await exportArabic({ store, videoId: ID, variant: 'current', askTiming: async (ms) => { asked.push(ms); return choice; }, download });
    assert.deepEqual(asked, [500]);
    assert.equal(r.timing, choice);
    assert.equal(parseSrtStrict(files[0].text)[0].startMs, raw[0].startMs + delta);
  }
  const cancelled = sink();
  assert.equal(await exportArabic({ store, videoId: ID, variant: 'current', askTiming: async () => null, download: cancelled.download }), null);
  assert.equal(cancelled.files.length, 0);
});

test('الزمن السالب بعد الإزاحة يرفض التصدير ويذكر المقاطع (MD_NEGATIVE_TIME) ولا يغيّر المخزَّن', async () => {
  const { store } = await seeded({ offset: -5000 });
  const before = await store.getVideo(ID);
  const { files, download } = sink();
  await assert.rejects(
    exportArabic({ store, videoId: ID, variant: 'current', askTiming: async () => 'shown', download }),
    (e) => e.code === 'MD_NEGATIVE_TIME' && /1، 2/.test(e.message),
  );
  assert.equal(files.length, 0);
  assert.deepEqual(await store.getVideo(ID), before);
  // «المحفوظ كما هو» يبقى متاحًا لمن يريد الملف رغم الإزاحة.
  assert.equal((await exportArabic({ store, videoId: ID, variant: 'current', askTiming: async () => 'saved', download })).timing, 'saved');
});

test('الأصل المستورد بعد التحرير: النسخة الحالية غير الأصل، وأسماء الملفين مختلفة', async () => {
  const edited = makeCues(5, { text: (i) => `معدّل ${i}` });
  const { store } = await seeded({}, (r) => withArabicEdit(r, { cues: edited }, NOW));
  const { files, download } = sink();
  const cur = await exportArabic({ store, videoId: ID, variant: 'current', askTiming: noAsk, download });
  const orig = await exportArabic({ store, videoId: ID, variant: 'original', askTiming: noAsk, download });
  assert.equal(cur.name, `${ID}.ar.srt`);
  assert.equal(orig.name, `${ID}.ar.original.srt`);
  assert.match(files[0].text, /معدّل 1/);
  assert.match(files[1].text, /سطر 1/);
  assert.doesNotMatch(files[1].text, /معدّل/);
});

test('تصدير العربية: لا ترجمة أو لا سجل برمزين ثابتين', async () => {
  const { store } = await seeded({ arabic: false });
  await assert.rejects(exportArabic({ store, videoId: ID, variant: 'current', askTiming: noAsk, download: () => {} }), code('PG_NO_ARABIC'));
  await assert.rejects(exportArabic({ store, videoId: 'BBBBBBBBBBB', variant: 'current', askTiming: noAsk, download: () => {} }), code('PG_VIDEO_GONE'));
});

test('تصدير الإنجليزية: المسار المحفوظ بالوضع «عادي»، وتُحفظ بصمته مرة واحدة ولا تتراكم نسخ متطابقة', async () => {
  const { store } = await seeded();
  const { files, download } = sink();
  const before = await store.getVideo(ID);
  const first = await exportEnglish({ store, videoId: ID, trackKey: 'en|manual', download, now });
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

  const second = await exportEnglish({ store, videoId: ID, trackKey: 'en|manual', download, now });
  assert.equal(second.fingerprintSaved, false);
  assert.equal((await store.getVideo(ID)).rev, mid.rev, 'لا كتابة ثانية');
  assert.equal(files.length, 2);
  assert.equal(files[0].text, files[1].text);
});

test('تصدير الإنجليزية: مسار غير محفوظ برمز ثابت، ولا ينزّل شيئًا', async () => {
  const { store } = await seeded();
  const { files, download } = sink();
  await assert.rejects(exportEnglish({ store, videoId: ID, trackKey: 'en|asr', download, now }), code('PG_NO_ENGLISH'));
  assert.equal(files.length, 0);
});

const srtFor = (cues) => writeSrt(cues.map((c) => ({ ...c, text: `ترجمة ${c.n}` })));
/** يحفظ أرقام المقاطع كما هي (الكاتب العادي يرقّم من 1)، ليظهر النقص بأرقامه. */
const srtKeepingNumbers = (cues) => cues.map((c) => `${c.n}\n${formatSrtTime(c.startMs)} --> ${formatSrtTime(c.endMs)}\nترجمة ${c.n}\n`).join('\n');
const file = (text, name = 'new.ar.srt') => new File([text], name, { type: 'text/plain' });

test('الاستبدال: قراءة ومقارنة ببصمة السجل، ثم الكتابة تصفّر الإزاحة وتجعل الملف الأصل المستورد', async () => {
  const { store } = await seeded({ offset: 1000 });
  const read = await readReplacement({ store, videoId: ID, files: [file(srtFor(makeCues(5)))] });
  assert.equal(read.result.ok, true);
  assert.equal(read.result.comparison.matched, true);
  assert.equal(read.record.view.displayOffsetMs, 1000, 'القراءة لا تكتب شيئًا');
  assert.equal((await store.getVideo(ID)).arabic.original[0].text, 'سطر 1');

  const info = await applyReplacement({ store, record: read.record, settings: read.settings, result: read.result, now });
  assert.deepEqual(info, { replaced: true, offsetWas: 1000 });
  const after = await store.getVideo(ID);
  assert.equal(after.arabic.fileName, 'new.ar.srt');
  assert.equal(after.arabic.original[0].text, 'ترجمة 1');
  assert.equal(after.arabic.current, null);
  assert.equal(after.view.displayOffsetMs, 0);
  assert.equal(after.english.length, 1, 'المسار الإنجليزي باقٍ');
});

test('الاستبدال: ملف ناقص يظهر في المقارنة، وملف تالف يعيد خطأ بلا كتابة', async () => {
  const { store } = await seeded();
  const missing = await readReplacement({ store, videoId: ID, files: [file(srtKeepingNumbers(makeCues(5).filter((c) => c.n !== 3)))] });
  assert.equal(missing.result.ok, true);
  assert.equal(missing.result.comparison.matched, false);
  assert.deepEqual(missing.result.comparison.missing, [3]);
  const bad = await readReplacement({ store, videoId: ID, files: [file('هذا ليس ملف SRT أبدًا')] });
  assert.equal(bad.result.ok, false);
  assert.match(bad.result.error.code, /^IM_/);
  assert.equal((await store.getVideo(ID)).rev, 1);
});

test('الاستبدال: تغيّر السجل بين القراءة والتأكيد يرفض الكتابة بـST_CONFLICT', async () => {
  const { store } = await seeded();
  const read = await readReplacement({ store, videoId: ID, files: [file(srtFor(makeCues(5)))] });
  await store.updateVideo(ID, (r) => withView(r, { displayOffsetMs: 300 }, NOW));
  await assert.rejects(applyReplacement({ store, record: read.record, settings: read.settings, result: read.result, now }), code('ST_CONFLICT'));
  const after = await store.getVideo(ID);
  assert.equal(after.arabic.fileName, `${ID}.ar.srt`, 'لم يُستبدل شيء');
  assert.equal(after.view.displayOffsetMs, 300);
});

test('رفع ترجمة لفيديو بلا عربية (استيراد لا استبدال) يعمل بالمسار نفسه', async () => {
  const { store } = await seeded({ arabic: false });
  const read = await readReplacement({ store, videoId: ID, files: [file(srtFor(makeCues(5)))] });
  assert.equal(read.record.arabic, null);
  const info = await applyReplacement({ store, record: read.record, settings: read.settings, result: read.result, now });
  assert.equal(info.replaced, false);
  assert.equal((await store.getVideo(ID)).arabic.cues?.length ?? (await store.getVideo(ID)).arabic.original.length, 5);
});

test('الحذف: «العربية فقط» يبقي الإنجليزي والبصمة ويصفّر الإزاحة، و«الكل» يزيل السجل ومُلخّصه', async () => {
  const { store } = await seeded({ offset: 500 });
  await deleteVideoData({ store, videoId: ID, scope: 'arabic', now });
  const r = await store.getVideo(ID);
  assert.equal(r.arabic, null);
  assert.equal(r.english.length, 1);
  assert.equal(r.fingerprints.length, 1);
  assert.equal(r.view.displayOffsetMs, 0);
  assert.equal((await store.listIndex()).length, 1);
  await deleteVideoData({ store, videoId: ID, scope: 'arabic', now });
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
