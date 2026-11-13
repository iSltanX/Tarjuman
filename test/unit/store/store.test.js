// وحدة التخزين: الحفظ والاسترجاع، والفهرس وإصلاحه، والتعارض، والسعة، والترحيل، والأحداث.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, computeCapacity, ADVISORY_BYTES } from '../../../src/core/store/index.js';
import { withArabicImport, withView } from '../../../src/core/model/index.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { NOW, makeCues, realTrack, englishTrack, fingerprint, comparison, videoRecord } from '../../helpers/fixtures.js';

const clock = (start = Date.parse(NOW)) => {
  let t = start;
  return () => (t += 1000);
};
const make = (opts = {}) => {
  const area = opts.area ?? createMemoryArea(opts.areaOpts);
  return { area, store: createStore({ area, now: clock(), ...opts.store }) };
};
const code = (c) => (e) => {
  assert.equal(e.code, c, `${e.code}: ${e.message} ${e.detail ?? ''}`);
  return true;
};

test('أول تشغيل: meta بالإصدار 1، والإعدادات الافتراضية كاملة', async () => {
  const { area, store } = make();
  const s = await store.getSettings();
  assert.equal(s.offsetStepMs, 500);
  assert.equal(area.dump().meta.schema, 1);
  assert.deepEqual(await store.listIndex(), []);
});

test('الإعدادات: دمج جزئي حتى مستوى المجموعة، ورفض القيمة غير الصالحة دون كتابة', async () => {
  const { area, store } = make();
  const s = await store.setSettings({ appearance: { scale: 120 }, offsetStepMs: 1000 });
  assert.equal(s.appearance.scale, 120);
  assert.equal(s.appearance.font, 'almarai');
  assert.equal(s.appearance.background, 'soft');
  await assert.rejects(store.setSettings({ appearance: { size: 'l' } }), code('MD_INVALID'));
  await assert.rejects(store.setSettings({ offsetStepMs: 30 }), code('MD_INVALID'));
  assert.equal(area.dump().settings.offsetStepMs, 1000);
  area.rawSet('settings', { offsetStepMs: 'x', displayModeDefault: 'dual' });
  const n = await store.getSettings();
  assert.equal(n.offsetStepMs, 500);
  assert.equal(n.displayModeDefault, 'dual');
  // إعدادات محفوظة قبل W4: المقاس القديم يُقرأ نسبة، وshowInstructions يسقط.
  area.rawSet('settings', { schema: 1, appearance: { size: 'xl', background: 'solid', position: 'top' }, export: { modeDefault: 'long', splitThreshold: 300, showInstructions: false } });
  const legacy = await store.getSettings();
  assert.deepEqual(legacy.appearance, { font: 'almarai', scale: 145, background: 'solid', position: 'top' });
  assert.deepEqual(legacy.export, { modeDefault: 'long', splitThreshold: 300 });
});

test('الحفظ والاسترجاع: المسار الإنجليزي والعربي الأصل والحالي والإزاحة والوضع والعنوان والتواريخ', async () => {
  const { area, store } = make();
  const base = videoRecord({ offset: 500, mode: 'dual' });
  base.arabic.current = makeCues(5, { startMs: 3000 });
  base.arabic.editedAt = NOW;
  const first = await store.updateVideo(base.videoId, () => base);
  assert.equal(first.rev, 1);
  assert.equal(first.createdAt, first.updatedAt);
  const got = await store.getVideo(base.videoId);
  assert.deepEqual(got, first);
  assert.equal(got.title, 'عنوان تجريبي');
  assert.deepEqual(got.english[0].cues, base.english[0].cues);
  assert.deepEqual(got.arabic.original, base.arabic.original);
  assert.deepEqual(got.arabic.current, base.arabic.current);
  assert.deepEqual(got.view, { displayOffsetMs: 500, displayMode: 'dual' });
  const d = area.dump();
  assert.deepEqual(Object.keys(d).sort(), ['index:AAAAAAAAAAA', 'meta', 'video:AAAAAAAAAAA']);
  assert.equal(d['index:AAAAAAAAAAA'].rev, 1);
  const second = await store.updateVideo(base.videoId, (r) => withView(r, { displayOffsetMs: -300 }, NOW));
  assert.equal(second.rev, 2);
  assert.equal(second.createdAt, first.createdAt, 'createdAt يبقى');
  assert.ok(second.updatedAt > first.updatedAt, 'updatedAt يتقدم');
  assert.equal(area.dump()['index:AAAAAAAAAAA'].view.displayOffsetMs, -300);
  assert.deepEqual(await store.updateVideo(base.videoId, () => undefined), second, 'undefined = لا تغيير');
  assert.equal((await store.getVideo(base.videoId)).rev, 2);
  assert.equal(await store.getVideo('BBBBBBBBBBB'), null);
  await assert.rejects(store.getVideo('../x'), code('TJ_BAD_VIDEO_ID'));
});

test('عينة P1 الحقيقية (تلقائي 1,066 مقطعًا) بأصل وحالية تُحفظ وتُسترجع حرفيًا', async () => {
  const { store, area } = make();
  const { fixture, cues } = realTrack('asr');
  const track = englishTrack({ kind: 'asr', cues });
  const fp = fingerprint({ videoId: fixture.videoId, track });
  const ar = cues.map((c) => ({ ...c, text: `ترجمة ${c.n}` }));
  const rec = await store.updateVideo(fixture.videoId, () => ({
    ...videoRecord({ videoId: fixture.videoId }), english: [track], fingerprints: [fp],
    arabic: { fileName: 'x.ar.srt', importedAt: NOW, original: ar, current: null, editedAt: null, fingerprintId: fp.id, comparison: comparison({ fingerprintId: fp.id, count: cues.length }), notes: [] },
  }));
  assert.deepEqual((await store.getVideo(fixture.videoId)).english[0].cues, cues);
  const bytes = await area.getBytesInUse(null);
  assert.ok(bytes > 100000 && bytes < 1000000, `${bytes}`);
  assert.equal(rec.rev, 1);
});

test('سجل غير صالح لا يُكتب (MD_INVALID)، ولا يتغير المخزَّن', async () => {
  const { area, store } = make();
  const rec = videoRecord();
  await store.updateVideo(rec.videoId, () => rec);
  const before = area.dump();
  await assert.rejects(store.updateVideo(rec.videoId, (r) => ({ ...r, view: { displayOffsetMs: 250, displayMode: 'ar' } })), code('MD_INVALID'));
  await assert.rejects(store.updateVideo(rec.videoId, (r) => ({ ...r, injected: '<b>' })), code('MD_INVALID'));
  assert.deepEqual(area.dump(), before);
});

test('التعارض بين السياقات: expect يرفض إن تغيّر السجل منذ قُرئ', async () => {
  const area = createMemoryArea();
  const editor = createStore({ area, now: clock() });
  const player = createStore({ area, now: clock() });
  const rec = await editor.updateVideo('AAAAAAAAAAA', () => videoRecord());
  await player.updateVideo('AAAAAAAAAAA', (r) => withView(r, { displayOffsetMs: 1000 }, NOW));
  await assert.rejects(editor.updateVideo('AAAAAAAAAAA', (r) => r, { expect: rec }), code('ST_CONFLICT'));
  await assert.rejects(editor.updateVideo('BBBBBBBBBBB', () => videoRecord({ videoId: 'BBBBBBBBBBB' }), { expect: rec }), code('ST_CONFLICT'));
  const ok = await editor.updateVideo('BBBBBBBBBBB', () => videoRecord({ videoId: 'BBBBBBBBBBB' }), { expect: null });
  assert.equal(ok.rev, 1);
});

test('حذف ثم إنشاء بالمراجعة نفسها لا يخدع expect (ABA)', async () => {
  const area = createMemoryArea();
  const editor = createStore({ area, now: clock() });
  const other = createStore({ area, now: clock(Date.parse(NOW) + 333) });
  await editor.updateVideo('AAAAAAAAAAA', () => videoRecord());
  const opened = await editor.updateVideo('AAAAAAAAAAA', (r) => withView(r, { displayOffsetMs: 100 }, NOW));
  assert.equal(opened.rev, 2);
  await other.deleteVideo('AAAAAAAAAAA');
  await other.updateVideo('AAAAAAAAAAA', () => videoRecord());
  const again = await other.updateVideo('AAAAAAAAAAA', (r) => withView(r, { displayOffsetMs: 900 }, NOW));
  assert.equal(again.rev, 2, 'المراجعة نفسها لسجل مختلف');
  await assert.rejects(editor.updateVideo('AAAAAAAAAAA', (r) => r, { expect: opened }), code('ST_CONFLICT'));
});

test('كتابة سياق آخر بين القراءة والكتابة: تُعاد fn على الأحدث بلا expect، وتُرفض معه', async () => {
  const area = createMemoryArea();
  const player = createStore({ area, now: clock() });
  const editor = createStore({ area, now: clock() });
  const base = await player.updateVideo('AAAAAAAAAAA', () => videoRecord());
  let calls = 0;
  const slow = player.updateVideo('AAAAAAAAAAA', async (r) => {
    calls++;
    if (calls === 1) await editor.updateVideo('AAAAAAAAAAA', (x) => withView(x, { displayMode: 'dual' }, NOW));
    return withView(r, { displayOffsetMs: 500 }, NOW);
  });
  const done = await slow;
  assert.equal(calls, 2, 'أُعيدت على الأحدث');
  assert.deepEqual(done.view, { displayOffsetMs: 500, displayMode: 'dual' }, 'لم يضع تعديل أيٍّ منهما');
  const conflicting = editor.updateVideo('AAAAAAAAAAA', async (r) => {
    await player.updateVideo('AAAAAAAAAAA', (x) => withView(x, { displayOffsetMs: 700 }, NOW));
    return withView(r, { displayMode: 'off' }, NOW);
  }, { expect: done });
  await assert.rejects(conflicting, code('ST_CONFLICT'));
  const final = await player.getVideo('AAAAAAAAAAA');
  assert.deepEqual(final.view, { displayOffsetMs: 700, displayMode: 'dual' });
  assert.ok(final.rev > base.rev);
});

test('كتابات السياق الواحد متسلسلة: 20 تعديلًا متزامنًا لا يضيع منها شيء', async () => {
  const { store } = make();
  await store.updateVideo('AAAAAAAAAAA', () => videoRecord());
  await Promise.all(Array.from({ length: 20 }, () => store.updateVideo('AAAAAAAAAAA', (r) => withView(r, { displayOffsetMs: r.view.displayOffsetMs + 100 }, NOW))));
  const r = await store.getVideo('AAAAAAAAAAA');
  assert.equal(r.view.displayOffsetMs, 2000);
  assert.equal(r.rev, 21);
});

test('الحذف بإرجاع null وبـdeleteVideo يزيل السجل ومُلخّصه', async () => {
  const { area, store } = make();
  await store.updateVideo('AAAAAAAAAAA', () => videoRecord());
  await store.updateVideo('BBBBBBBBBBB', () => videoRecord({ videoId: 'BBBBBBBBBBB' }));
  assert.equal(await store.updateVideo('AAAAAAAAAAA', () => null), null);
  await store.deleteVideo('BBBBBBBBBBB');
  assert.deepEqual(Object.keys(area.dump()), ['meta']);
});

test('الفهرس: الأحدث أولًا، ويصلح نفسه (مُلخّص مفقود يُبنى، ويتيم يُحذف)', async () => {
  const { area, store } = make();
  await store.updateVideo('AAAAAAAAAAA', () => videoRecord());
  await store.updateVideo('BBBBBBBBBBB', () => videoRecord({ videoId: 'BBBBBBBBBBB' }));
  let list = await store.listIndex();
  assert.deepEqual(list.map((e) => e.videoId), ['BBBBBBBBBBB', 'AAAAAAAAAAA']);
  await area.remove('index:AAAAAAAAAAA');
  area.rawSet('index:CCCCCCCCCCC', { ...list[0], videoId: 'CCCCCCCCCCC' });
  list = await store.listIndex();
  assert.deepEqual(list.map((e) => e.videoId).sort(), ['AAAAAAAAAAA', 'BBBBBBBBBBB']);
  assert.ok(area.dump()['index:AAAAAAAAAAA']);
  assert.equal(area.dump()['index:CCCCCCCCCCC'], undefined);
  area.rawSet('index:BBBBBBBBBBB', { schema: 1, videoId: 'BBBBBBBBBBB' });
  list = await store.listIndex();
  assert.deepEqual(list.map((e) => e.videoId).sort(), ['AAAAAAAAAAA', 'BBBBBBBBBBB'], 'مُلخّص غير صالح يُعاد بناؤه');
  assert.equal(area.dump()['index:BBBBBBBBBBB'].rev, 1);
});

test('سجل تالف: ST_CORRUPT_RECORD عند قراءته، والفهرس يبقى يعمل', async () => {
  const { area, store } = make();
  await store.updateVideo('AAAAAAAAAAA', () => videoRecord());
  area.rawSet('video:BBBBBBBBBBB', { schema: 1, videoId: 'BBBBBBBBBBB', junk: true });
  await assert.rejects(store.getVideo('BBBBBBBBBBB'), code('ST_CORRUPT_RECORD'));
  const list = await store.listIndex();
  assert.deepEqual(list.map((e) => e.videoId), ['AAAAAAAAAAA']);
  assert.equal(await store.updateVideo('BBBBBBBBBBB', () => null).catch((e) => e.code), 'ST_CORRUPT_RECORD');
  await store.deleteVideo('BBBBBBBBBBB');
  assert.equal(await store.getVideo('BBBBBBBBBBB'), null, 'الحذف متاح للتالف');
});

test('امتلاء السعة: ST_QUOTA_EXCEEDED ولا كتابة جزئية', async () => {
  const { area, store } = make({ areaOpts: { quotaBytes: 4000 } });
  await store.updateVideo('AAAAAAAAAAA', () => videoRecord());
  const before = area.dump();
  const big = makeCues(40, { text: () => 'نص طويل '.repeat(20) });
  await assert.rejects(store.updateVideo('AAAAAAAAAAA', (r) => withArabicImport(r, { videoId: r.videoId, fileName: 'big.srt', cues: big }, NOW, { replace: true }).record), code('ST_QUOTA_EXCEEDED'));
  assert.deepEqual(area.dump(), before);
});

test('فشل الكتابة أو القراءة يصل برمز ورسالة عربية', async () => {
  const { area, store } = make();
  await store.ready();
  area.failNext('set', new Error('IO error'));
  await assert.rejects(store.updateVideo('AAAAAAAAAAA', () => videoRecord()), (e) => e.code === 'ST_WRITE_FAILED' && /تعذّر الحفظ/.test(e.message));
  area.failNext('get', new Error('IO error'));
  await assert.rejects(store.getVideo('AAAAAAAAAAA'), code('ST_READ_FAILED'));
});

test('قياس السعة: تحذير عند 80% وامتلاء عند 98%، ومع unlimitedStorage تحذير استرشادي فقط', async () => {
  assert.equal(computeCapacity(7 * 1024 * 1024, { quotaBytes: 10485760, unlimited: false }).level, 'normal');
  const w = computeCapacity(8.5 * 1024 * 1024, { quotaBytes: 10485760, unlimited: false });
  assert.equal(w.level, 'warning');
  assert.equal(w.code, 'ST_CAPACITY_WARNING');
  assert.equal(computeCapacity(10.3 * 1024 * 1024, { quotaBytes: 10485760, unlimited: false }).level, 'full');
  const u = computeCapacity(50 * 1024 * 1024, { quotaBytes: 10485760, unlimited: true });
  assert.deepEqual([u.level, u.quotaBytes, u.ratio], ['normal', null, null]);
  assert.equal(computeCapacity(ADVISORY_BYTES, { quotaBytes: 10485760, unlimited: true }).code, 'ST_LARGE_LIBRARY');
  const { store } = make({ areaOpts: { quotaBytes: 100000 } });
  await store.updateVideo('AAAAAAAAAAA', () => videoRecord());
  const c = await store.capacity();
  assert.ok(c.bytesInUse > 0 && c.ratio > 0 && c.ratio < 1 && c.level === 'normal', JSON.stringify(c));
});

test('الترحيل: خطوة لكل إصدار في عملية واحدة، ومتكرر بأمان، ولا يكتب عند الفشل', async () => {
  const area = createMemoryArea();
  const v1 = createStore({ area, now: clock() });
  await v1.updateVideo('AAAAAAAAAAA', () => videoRecord());
  await v1.setSettings({ offsetStepMs: 1000 });
  const before = area.dump();
  const seen = [];
  const migrations = {
    2: ({ items }) => {
      seen.push(Object.keys(items).length);
      const set = {};
      for (const [k, v] of Object.entries(items)) if (k.startsWith('video:')) set[k] = { ...v, migratedMark: true };
      return { set, remove: [] };
    },
  };
  // الإصدار 2 افتراضي للاختبار: نتحقق أن الخطوة طُبّقت وأن meta رُفع، لا أن السجل صالح للنموذج 1.
  const v2 = createStore({ area, now: clock(), schema: 2, migrations });
  await v2.ready();
  assert.equal(area.dump().meta.schema, 2);
  assert.equal(area.dump()['video:AAAAAAAAAAA'].migratedMark, true);
  await createStore({ area, now: clock(), schema: 2, migrations }).ready();
  assert.equal(seen.length, 1, 'لا ترحيل ثانٍ');

  const area2 = createMemoryArea({ initial: before });
  const failing = createStore({ area: area2, now: clock(), schema: 2, migrations: { 2: () => { throw new Error('خطوة معطوبة'); } } });
  await assert.rejects(failing.ready(), code('ST_MIGRATION_FAILED'));
  assert.deepEqual(area2.dump(), before, 'لا شيء تغيّر');
  await assert.rejects(createStore({ area: area2, now: clock(), schema: 3, migrations: { 2: migrations[2] } }).ready(), code('ST_MIGRATION_FAILED'));
});

test('مخزَّن من إصدار أحدث: ST_SCHEMA_NEWER ولا كتابة', async () => {
  const area = createMemoryArea({ initial: { meta: { schema: 9, createdAt: NOW, migratedAt: null } } });
  const store = createStore({ area, now: clock() });
  await assert.rejects(store.getSettings(), code('ST_SCHEMA_NEWER'));
  await assert.rejects(store.updateVideo('AAAAAAAAAAA', () => videoRecord()), code('ST_SCHEMA_NEWER'));
  assert.deepEqual(area.dump(), { meta: { schema: 9, createdAt: NOW, migratedAt: null } });
});

test('بيانات بلا meta تُرحَّل من 0 وتُختم', async () => {
  const rec = videoRecord();
  const area = createMemoryArea({ initial: { 'video:AAAAAAAAAAA': rec } });
  const store = createStore({ area, now: clock() });
  assert.deepEqual(await store.getVideo('AAAAAAAAAAA'), rec);
  assert.equal(area.dump().meta.schema, 1);
  assert.ok(area.dump().meta.migratedAt);
});

test('الأحداث: تغيّر سجل أو إعدادات من أي سياق يصل بالمعرّف، والمسح الكامل يُعلَن', async () => {
  const area = createMemoryArea();
  const a = createStore({ area, now: clock() });
  const b = createStore({ area, now: clock() });
  const events = [];
  const off = b.onChange((c) => events.push(c));
  await a.updateVideo('AAAAAAAAAAA', () => videoRecord());
  await a.setSettings({ displayModeDefault: 'dual' });
  await area.flush();
  const vid = events.find((e) => e.videos.AAAAAAAAAAA);
  assert.equal(vid.videos.AAAAAAAAAAA.oldValue, null);
  assert.equal(vid.videos.AAAAAAAAAAA.newValue.rev, 1);
  assert.equal(vid.index, true);
  assert.equal(events.find((e) => e.settings).settings.newValue.displayModeDefault, 'dual');
  events.length = 0;
  await a.clearAll();
  await area.flush();
  assert.ok(events.some((e) => e.cleared && e.videos.AAAAAAAAAAA?.newValue === null));
  assert.deepEqual(Object.keys(area.dump()), ['meta'], 'meta جديد بعد المسح');
  off();
  await a.updateVideo('AAAAAAAAAAA', () => videoRecord());
  await area.flush();
  assert.ok(!events.some((e) => e.videos.AAAAAAAAAAA?.newValue), 'لا أحداث بعد الإلغاء');
});
