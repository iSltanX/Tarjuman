// المتحكم: الحفظ لكل فيديو، وعقد التوقيت (الإزاحة لا تمس المحفوظ، والاستيراد يصفّرها بإشعار، والتصدير
// الإنجليزي لا يتأثر بها)، وتبديل الفيديو، وأحداث التخزين من سياقات أخرى.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../../../src/content/controller.js';
import { createStore } from '../../../src/core/store/index.js';
import { withArabicEdit } from '../../../src/core/model/index.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { NOW, fakeExtractor, fingerprint, englishTrack, makeCues, videoRecord } from '../../helpers/fixtures.js';

const A = 'AAAAAAAAAAA';
const B = 'BBBBBBBBBBB';
const clock = (start = Date.parse(NOW)) => {
  let t = start;
  return () => (t += 1000);
};

async function setup({ records = [], settings, extractor = fakeExtractor(), storeWrap, areaOpts } = {}) {
  const area = createMemoryArea(areaOpts);
  const seed = createStore({ area, now: clock() });
  for (const r of records) await seed.updateVideo(r.videoId, () => r);
  if (settings) await seed.setSettings(settings);
  await area.flush();
  let store = createStore({ area, now: clock() });
  if (storeWrap) store = storeWrap(store);
  const c = createController({ store, extractor, page: { title: () => 'عنوان من الصفحة', durationMs: () => 90000 }, now: clock() });
  store.onChange((ch) => c.handleStoreChange(ch));
  // سياق آخر (المحرّر أو تبويب آخر) بساعته؛ الساعات المتطابقة تصنع تواريخ متطابقة لا تحدث فعلًا.
  const other = createStore({ area, now: clock(Date.parse(NOW) + 333) });
  return { area, store, other, c, extractor };
}
const settle = async (area) => {
  await area.flush();
  await new Promise((r) => setTimeout(r, 5));
  await area.flush();
};

test('فيديو بلا سجل: الحالة الافتراضية من الإعدادات، ولا إشعار، ولا سجل يُنشأ', async () => {
  const { c, area } = await setup({ settings: { displayModeDefault: 'dual' } });
  await c.start(A);
  const s = c.getState();
  assert.equal(s.videoId, A);
  assert.equal(s.loading, false);
  assert.equal(s.saved, null);
  assert.deepEqual(s.view, { displayOffsetMs: 0, displayMode: 'dual' });
  assert.equal(s.notice, null);
  assert.equal(s.title, 'عنوان من الصفحة');
  await c.nudgeOffset(1);
  assert.equal(c.getState().view.displayOffsetMs, 500, 'تتغير في الجلسة');
  assert.equal(area.dump()[`video:${A}`], undefined, 'ولا يُنشأ سجل');
});

test('العودة إلى فيديو محفوظ: الترجمة والإزاحة والوضع تُستعاد بإشعار', async () => {
  const { c } = await setup({ records: [videoRecord({ offset: 700, mode: 'dual' })] });
  await c.start(A);
  const s = c.getState();
  assert.equal(s.arabic.cues.length, 5);
  assert.equal(s.arabic.edited, false);
  assert.deepEqual(s.view, { displayOffsetMs: 700, displayMode: 'dual' });
  assert.equal(s.notice.code, 'ST_RESTORED');
  assert.equal(s.english.source, 'saved');
  c.dismissNotice();
  assert.equal(c.getState().notice, null);
});

test('± يحفظ الإزاحة لكل فيديو بخطوة الإعدادات ولا يمس التوقيت المحفوظ', async () => {
  const rec = videoRecord();
  const { c, store } = await setup({ records: [rec, videoRecord({ videoId: B, offset: -300 })], settings: { offsetStepMs: 1000 } });
  await c.start(A);
  await c.nudgeOffset(1);
  await c.nudgeOffset(1);
  await c.nudgeOffset(-1);
  assert.equal(c.getState().view.displayOffsetMs, 1000);
  const saved = await store.getVideo(A);
  assert.equal(saved.view.displayOffsetMs, 1000);
  assert.deepEqual(saved.arabic, rec.arabic, 'التوقيت المحفوظ كما هو');
  assert.deepEqual(saved.english, rec.english);
  await c.setOffset(449);
  assert.equal((await store.getVideo(A)).view.displayOffsetMs, 400, 'شبكة 100ms');
  await c.setOffset(10 ** 9);
  assert.equal(c.getState().view.displayOffsetMs, 600000);
  await c.resetOffset();
  assert.equal((await store.getVideo(A)).view.displayOffsetMs, 0);
  await c.setVideo(B);
  assert.equal(c.getState().view.displayOffsetMs, -300, 'لكل فيديو إزاحته');
  assert.throws(() => c.nudgeOffset(2), RangeError);
});

test('نقرات ± السريعة تتراكم دون تراجع في الحالة، والمحفوظ آخرها', async () => {
  const { c, store } = await setup({ records: [videoRecord()] });
  await c.start(A);
  const seen = [];
  c.subscribe((s) => seen.push(s.view.displayOffsetMs));
  await Promise.all([c.nudgeOffset(1), c.nudgeOffset(1), c.nudgeOffset(1), c.nudgeOffset(1)]);
  assert.equal(c.getState().view.displayOffsetMs, 2000);
  assert.equal((await store.getVideo(A)).view.displayOffsetMs, 2000);
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] >= seen[i - 1], `تراجع: ${seen.join(',')}`);
});

test('وضع العرض يُحفظ، والقيمة المجهولة مرفوضة', async () => {
  const { c, store } = await setup({ records: [videoRecord()] });
  await c.start(A);
  await c.setDisplayMode('off');
  assert.equal((await store.getVideo(A)).view.displayMode, 'off');
  assert.throws(() => c.setDisplayMode('en'), (e) => e.code === 'MD_INVALID');
});

test('الاستيراد يصفّر الإزاحة بإشعار، ويتطلب replace عند وجود ترجمة، ويحفظ المسار الملتقط مرجعًا', async () => {
  const ex = fakeExtractor({ tracks: [{ key: 'en|asr', kind: 'asr', cues: makeCues(3, { text: (i) => `w${i}` }) }] });
  const { c, store } = await setup({ extractor: ex });
  await c.start(A);
  await c.setOffset(1500);
  const rec = await c.loadArabic({ fileName: 'a.ar.srt', cues: makeCues(3), comparison: null, fingerprintId: null, notes: [] });
  assert.equal(rec.view.displayOffsetMs, 0);
  assert.equal(c.getState().notice.code, 'ST_OFFSET_RESET');
  assert.equal(c.getState().view.displayOffsetMs, 0);
  assert.equal(rec.title, 'عنوان من الصفحة');
  assert.equal(rec.durationMs, 90000);
  assert.deepEqual(rec.english.map((t) => t.key), ['en|asr']);
  await assert.rejects(c.loadArabic({ fileName: 'b.srt', cues: makeCues(2) }), (e) => e.code === 'ST_ARABIC_EXISTS');
  await c.setOffset(-800);
  await c.loadArabic({ fileName: 'b.srt', cues: makeCues(2) }, { replace: true });
  const after = await store.getVideo(A);
  assert.equal(after.arabic.fileName, 'b.srt');
  assert.equal(after.arabic.original.length, 2);
  assert.equal(after.view.displayOffsetMs, 0);
  assert.equal(c.getState().notice.code, 'ST_OFFSET_RESET');
  await c.loadArabic({ fileName: 'c.srt', cues: makeCues(2) }, { replace: true });
  assert.equal(c.getState().notice, null, 'لا إشعار حين كانت الإزاحة صفرًا');
});

test('تسجيل التصدير: المسار الإنجليزي بأزمنة المستخرج حرفيًا مهما كانت الإزاحة، والبصمة محفوظة', async () => {
  const extracted = makeCues(4, { startMs: 0, text: (i) => `line ${i}` });
  const ex = fakeExtractor({ tracks: [{ key: 'en|manual', kind: 'manual', cues: extracted }] });
  const { c, store } = await setup({ extractor: ex, records: [videoRecord({ offset: 3000 })] });
  await c.start(A);
  const track = englishTrack({ cues: extracted });
  const fp = fingerprint({ videoId: A, track, id: 'fp_export00001' });
  const conv = c.convertCaptured('en|manual');
  assert.deepEqual(conv.cues, extracted, 'المستخرج بلا إزاحة');
  await c.recordExport({ trackKey: 'en|manual', fingerprint: fp });
  const saved = await store.getVideo(A);
  assert.deepEqual(saved.english.find((t) => t.key === 'en|manual').cues, extracted);
  assert.ok(saved.fingerprints.some((f) => f.id === 'fp_export00001'));
  assert.equal(saved.view.displayOffsetMs, 3000);
  await assert.rejects(c.recordExport({ trackKey: 'en|asr', fingerprint: fp }), (e) => e.code === 'EX_NO_TRACK');
});

test('تبديل الفيديو يمسح الحالة فورًا، ونتيجة تحميل قديمة تُهمل', async () => {
  let release;
  const gate = new Promise((r) => {
    release = r;
  });
  const { c } = await setup({
    records: [videoRecord(), videoRecord({ videoId: B, offset: 900 })],
    storeWrap: (s) => ({ ...s, getVideo: async (id) => (id === A ? gate.then(() => s.getVideo(id)) : s.getVideo(id)) }),
  });
  const loadingA = c.start(A);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(c.getState().videoId, A);
  assert.equal(c.getState().loading, true);
  assert.equal(c.getState().arabic, null);
  await c.setVideo(B);
  assert.equal(c.getState().view.displayOffsetMs, 900);
  release();
  await loadingA;
  assert.equal(c.getState().videoId, B);
  assert.equal(c.getState().view.displayOffsetMs, 900, 'تحميل A المتأخر لم يغيّر حالة B');
  await c.setVideo(null);
  assert.equal(c.getState().videoId, null);
  assert.equal(c.getState().english, null);
});

test('حفظ المحرّر في سياق آخر ينعكس في المشغّل، وصدى كتابات المتحكم نفسه يُتجاهل', async () => {
  let reads = 0;
  const { c, other, area } = await setup({
    records: [videoRecord()],
    storeWrap: (s) => ({ ...s, getVideo: (id) => { reads++; return s.getVideo(id); } }),
  });
  await c.start(A);
  const readsAfterStart = reads;
  await c.nudgeOffset(1);
  await settle(area);
  assert.equal(reads, readsAfterStart, 'لا إعادة قراءة بسبب كتابته');
  await other.updateVideo(A, (r) => withArabicEdit(r, { cues: makeCues(5, { startMs: 9000 }) }, NOW));
  await settle(area);
  const s = c.getState();
  assert.equal(s.arabic.edited, true);
  assert.equal(s.arabic.cues[0].startMs, 9000);
  assert.equal(s.view.displayOffsetMs, 500);
  await other.deleteVideo(A);
  await settle(area);
  assert.equal(c.getState().saved, null);
  assert.equal(c.getState().arabic, null);
});

test('تغيّر الإعدادات من صفحة الإعدادات يصل إلى المتحكم', async () => {
  const { c, other, area } = await setup();
  await c.start(A);
  await other.setSettings({ offsetStepMs: 1000, appearance: { size: 'xl' } });
  await settle(area);
  assert.equal(c.getState().settings.offsetStepMs, 1000);
  assert.equal(c.getState().settings.appearance.size, 'xl');
  await c.nudgeOffset(-1);
  assert.equal(c.getState().view.displayOffsetMs, -1000);
  const s = await c.updateSettings({ displayModeDefault: 'dual' });
  assert.equal(s.displayModeDefault, 'dual');
});

test('المسار الإنجليزي للوضع المزدوج: الملتقط أولًا واليدوي قبل التلقائي، ومرجع المقاطع ثابت', async () => {
  const ex = fakeExtractor({
    tracks: [
      { key: 'en|asr', kind: 'asr', cues: makeCues(2, { text: () => 'asr' }) },
      { key: 'en|manual', kind: 'manual', cues: makeCues(2, { text: () => 'manual' }) },
    ],
  });
  const { c } = await setup({ extractor: ex, records: [videoRecord()] });
  await c.start(A);
  const first = c.getState().english;
  assert.deepEqual([first.source, first.kind, first.cues[0].text], ['captured', 'manual', 'manual']);
  await c.nudgeOffset(1);
  assert.equal(c.getState().english.cues, first.cues, 'لا مصفوفة جديدة عند كل تغيّر');
  ex.setTracks([]);
  assert.equal(c.getState().english.source, 'saved');
  assert.equal(c.getState().captured.length, 0);
  ex.reject('EX_NOT_ENGLISH');
  assert.equal(c.getState().captureIssue.code, 'EX_NOT_ENGLISH');
});

test('استثناء في مشترك لا يوقف المتحكم ولا يحرم المشتركين الآخرين', async () => {
  const { c } = await setup({ records: [videoRecord()] });
  const seen = [];
  c.subscribe((s) => {
    if (s.videoId) throw new Error('عطل في مشترك الطبقة');
  });
  c.subscribe((s) => seen.push(s.loading));
  await c.start(A);
  assert.equal(c.getState().loading, false, 'اكتمل التحميل');
  assert.equal(c.getState().arabic.cues.length, 5);
  assert.ok(seen.includes(false), 'المشترك السليم تلقى الحالة');
  const d = c.diagnostics();
  assert.ok(d.listenerFailures > 0);
  assert.equal(d.lastListenerError.code, 'TJ_UNEXPECTED');
});

test('تبديل الفيديو: أول إشعار بعده بلا مسارات الفيديو السابق', async () => {
  const ex = fakeExtractor({ tracks: [{ key: 'en|manual', kind: 'manual', cues: makeCues(4) }] });
  const { c } = await setup({ extractor: ex });
  await c.start(A);
  assert.equal(c.getState().captured.length, 1);
  const first = [];
  const off = c.subscribe((s) => first.push({ videoId: s.videoId, captured: s.captured.length, english: s.english?.source ?? null }));
  await c.setVideo(B);
  off();
  assert.deepEqual(first[0], { videoId: B, captured: 0, english: null });
  assert.ok(first.every((x) => x.captured === 0 && x.english === null));
});

test('تنقل أثناء تحميل الإعدادات: الفيديو الأحدث يبقى ولا يعود المتحكم إلى القديم', async () => {
  let release;
  const gate = new Promise((r) => {
    release = r;
  });
  const { c } = await setup({
    records: [videoRecord(), videoRecord({ videoId: B, offset: 900 })],
    storeWrap: (s) => ({ ...s, getSettings: () => gate.then(() => s.getSettings()) }),
  });
  const starting = c.start(A);
  await c.setVideo(B);
  release();
  await starting;
  assert.equal(c.getState().videoId, B);
  assert.equal(c.getState().view.displayOffsetMs, 900);
});

test('± أثناء قراءة سجل الفيديو بلا أثر، ثم يعمل بعد اكتمالها', async () => {
  let release;
  const gate = new Promise((r) => {
    release = r;
  });
  const { c, store } = await setup({
    records: [videoRecord({ offset: 700 })],
    storeWrap: (s) => ({ ...s, getVideo: (id) => gate.then(() => s.getVideo(id)) }),
  });
  const starting = c.start(A);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(c.getState().loading, true);
  await c.nudgeOffset(1);
  assert.equal(c.getState().view.displayOffsetMs, 0, 'لا أثر أثناء التحميل');
  release();
  await starting;
  assert.equal(c.getState().view.displayOffsetMs, 700);
  await c.nudgeOffset(1);
  assert.equal((await store.getVideo(A)).view.displayOffsetMs, 1200);
});

test('مراجع المقاطع ثابتة عبر ± (العربي والإنجليزي المحفوظ)، وتتغير حين يتغير المصدر', async () => {
  const { c, other, area } = await setup({ records: [videoRecord()] });
  await c.start(A);
  const a0 = c.getState().arabic.cues;
  const e0 = c.getState().english.cues;
  assert.equal(c.getState().english.source, 'saved');
  await c.nudgeOffset(1);
  await c.setDisplayMode('dual');
  assert.equal(c.getState().arabic.cues, a0);
  assert.equal(c.getState().english.cues, e0);
  await other.updateVideo(A, (r) => withArabicEdit(r, { cues: makeCues(5, { startMs: 4000 }) }, NOW));
  await settle(area);
  assert.notEqual(c.getState().arabic.cues, a0);
  assert.equal(c.getState().arabic.cues[0].startMs, 4000);
});

test('كاتبان بالمراجعة نفسها: حالة المشغّل تطابق المخزَّن في النهاية', async () => {
  const { c, other, area, store } = await setup({ records: [videoRecord()] });
  await c.start(A);
  const editorSave = other.updateVideo(A, async (r) => {
    await new Promise((res) => setTimeout(res, 20));
    return withArabicEdit(r, { cues: makeCues(5, { startMs: 7000 }) }, NOW);
  });
  await c.nudgeOffset(1);
  await editorSave;
  await settle(area);
  await new Promise((r) => setTimeout(r, 20));
  await settle(area);
  const stored = await store.getVideo(A);
  const s = c.getState();
  assert.equal(stored.arabic.current[0].startMs, 7000, 'حفظ المحرّر لم يضع');
  assert.equal(stored.view.displayOffsetMs, 500, 'ولا نقرة المشغّل');
  assert.equal(s.saved.rev, stored.rev);
  assert.equal(s.arabic.edited, true);
  assert.equal(s.view.displayOffsetMs, 500);
});

test('أحداث التخزين قبل انتهاء الكتابة (ترتيب غير مضمون في Chrome): لا تراجع ولا انفصال', async () => {
  const { c, store, area } = await setup({ records: [videoRecord()], areaOpts: { eventsBeforeResolve: true } });
  await c.start(A);
  const seen = [];
  c.subscribe((s) => seen.push(s.view.displayOffsetMs));
  await Promise.all([c.nudgeOffset(1), c.nudgeOffset(1), c.nudgeOffset(1)]);
  await settle(area);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(c.getState().view.displayOffsetMs, 1500);
  assert.equal((await store.getVideo(A)).view.displayOffsetMs, 1500);
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] >= seen[i - 1], `تراجع: ${seen.join(',')}`);
  assert.equal(c.getState().saved.rev, (await store.getVideo(A)).rev);
});

test('استيراد أثناء قراءة السجل: الحالة النهائية تحمل الاستيراد', async () => {
  let release;
  const gate = new Promise((r) => {
    release = r;
  });
  let first = true;
  const { c } = await setup({
    records: [videoRecord({ arabic: false })],
    storeWrap: (s) => ({ ...s, getVideo: (id) => (first ? (first = false, gate.then(() => s.getVideo(id))) : s.getVideo(id)) }),
  });
  const starting = c.start(A);
  await new Promise((r) => setTimeout(r, 5));
  const rec = await c.loadArabic({ fileName: 'x.srt', cues: makeCues(2) });
  release();
  await starting;
  assert.equal(c.getState().saved.rev, rec.rev);
  assert.equal(c.getState().arabic.cues.length, 2);
});

test('خطأ تخزين يظهر في الحالة برمز ورسالة، ولا يوقف المتحكم', async () => {
  const { c, area } = await setup({ records: [videoRecord()] });
  await c.start(A);
  area.failNext('set', new Error('IO'));
  await c.nudgeOffset(1);
  assert.equal(c.getState().error.code, 'ST_WRITE_FAILED');
  await c.nudgeOffset(1);
  assert.equal(c.getState().error, null);
});
