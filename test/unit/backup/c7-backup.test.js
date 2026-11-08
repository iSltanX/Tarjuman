// تدقيق 7a66f91، المرحلة C7 (النسخ الاحتياطي والتخزين وعميل البلاغ): حد واحد بالبايت للإنشاء والحفظ والقراءة (U55، Q28)،
// والنسخة مع تابع تالف جزئية بعينها والأصل باقٍ (U94، Q29)، والاستعادة بحال كل قسم وإعادة المتعذّر وحده (U54)، والمسح يُقال
// نجاحه وما تعذّر بعده نتيجةً (U56)، والقارئ لا يرمي لتداخل عميق ويجرّد محارف الاتجاه (U59)، وRetry-After بسقف والمهلة أثناء
// قراءة الجسم «timeout» (U85).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BACKUP_LIMITS, countData, createBackup, readBackup, retrySettings, runRestore, settingsFailureCode, sha256Hex } from '../../../src/core/backup/index.js';
import { TjError, messageFor } from '../../../src/core/errors/index.js';
import { utf8Length } from '../../../src/core/model/validate.js';
import { RETRY_AFTER_MAX_S, parseRetryAfter, sendReport } from '../../../src/core/report/client.js';
import { failureText } from '../../../src/core/report/messages.js';
import { SAVE_LIMITS, validateSaveFile } from '../../../src/core/save/index.js';
import { altsKey } from '../../../src/core/store/keys.js';
import { migrate } from '../../../src/core/store/migrate.js';
import { createStore } from '../../../src/core/store/index.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { NOW, makeCues, videoRecord } from '../../helpers/fixtures.js';
import { samplePrefs, sampleBundle, seedBundle } from '../../helpers/fixtures-v2.js';

const IDS = ['AAAAAAAAAAA', 'BBBBBBBBBBB'];
const noPause = () => Promise.resolve();

function newStore(area = createMemoryArea({ unlimited: true })) {
  let t = Date.parse(NOW);
  return { area, store: createStore({ area, now: () => (t += 1000) }) };
}

test('U55: utf8Length يعدّ بايتات UTF-8 كما يكتبها TextEncoder (العربية 2، وCJK 3، والزوج البديل 4، والبديل اليتيم 3)', () => {
  for (const s of ['abc', 'مرحبا', '中文字', '😀x', '\uD800', 'a\uDC00b', '']) assert.equal(utf8Length(s), new TextEncoder().encode(s).length, JSON.stringify(s));
});

test('U55 (Q28): حد واحد بالبايت — حد الحفظ من الصفحات هو حد القراءة، ونص CJK تحت حد الوحدات وفوق حد البايت يُرفض في الحفظ', () => {
  assert.equal(SAVE_LIMITS.maxPageBytes, BACKUP_LIMITS.maxBytes);
  const cjk = '中'.repeat(100); // 100 وحدة و300 بايت
  assert.deepEqual(validateSaveFile({ name: 'a.json', text: cjk }, { maxBytes: 299 }), { ok: false, code: 'SV_TOO_LARGE' });
  assert.equal(validateSaveFile({ name: 'a.json', text: cjk }, { maxBytes: 300 }).ok, true);
  assert.equal(validateSaveFile({ name: 'a.json', text: 'x'.repeat(300) }, { maxBytes: 300 }).ok, true);
});

test('U55: الإنشاء يرفض بالبايت برمز BK_ صريح ما تجاوز حد القراءة، ولا يُنشئ ملفًا يرفضه readBackup', async () => {
  const { store } = newStore();
  const cues = makeCues(40, { text: () => '中文字幕'.repeat(20) });
  await seedBundle(store, { ...sampleBundle({ videoId: IDS[0] }) });
  await store.updateVideo(IDS[1], () => ({ ...videoRecord({ videoId: IDS[1] }), title: '中'.repeat(50), arabic: { ...videoRecord({ videoId: IDS[1] }).arabic, original: cues } }));
  const full = await createBackup({ store, appVersion: '1.1.0', pause: noPause });
  assert.equal(full.bytes, utf8Length(full.text));
  assert.ok(full.bytes > full.text.length, 'CJK: البايتات أكثر من الوحدات');
  const max = full.text.length + 10; // فوق حد الوحدات القديم، وتحت البايتات
  await assert.rejects(createBackup({ store, appVersion: '1.1.0', pause: noPause, maxBytes: max }), (err) => {
    assert.ok(err instanceof TjError);
    assert.equal(err.code, 'BK_CREATE_TOO_LARGE');
    assert.match(err.message, /أكبر من أن تُنسخ في ملف واحد/);
    assert.match(err.message, /تضمين النسخ السابقة/);
    return true;
  });
  const ok = await createBackup({ store, appVersion: '1.1.0', pause: noPause, maxBytes: full.bytes });
  const blob = new Blob([ok.text]);
  assert.equal(blob.size, ok.bytes);
  assert.equal((await readBackup(blob, { maxBytes: full.bytes, pause: noPause })).ok, true, 'ما يُنشأ بالحد يُقرأ بالحد نفسه');
  assert.doesNotMatch(messageFor('BK_TOO_LARGE', { max: '512 م.ب' }), /أصغر من ذلك بكثير/, 'لا وعد كاذب بأن النسخة أصغر بكثير');
});

test('U94 (Q29): تابع تالف لا يُسقط الفيديو — يُضمَّن سجله وتوابعه السليمة، ويُذكر ما استُبعد، والأصل التالف باقٍ، والنسخة تُستعاد', async () => {
  const { area, store } = newStore();
  await seedBundle(store, sampleBundle({ videoId: IDS[0], third: true }));
  await store.updateVideo(IDS[1], () => ({ ...videoRecord({ videoId: IDS[1] }), title: 'سليم' }));
  await area.flush();
  const broken = { schema: 1, videoId: IDS[0], slots: 'تالف' };
  area.rawSet(altsKey(IDS[0]), broken);
  await assert.rejects(store.getBundle(IDS[0]), (e) => e.code === 'ST_CORRUPT_RECORD');
  const built = await createBackup({ store, appVersion: '1.1.0', pause: noPause });
  assert.deepEqual(built.skipped, []);
  assert.deepEqual(built.partial, [{ videoId: IDS[0], dropped: ['alts'] }]);
  const file = JSON.parse(built.text);
  const entry = file.data.videos.find((v) => v.record.videoId === IDS[0]);
  assert.ok(entry, 'الفيديو في النسخة');
  assert.ok(entry.record.arabic, 'وترجمته النشطة');
  assert.ok(entry.previous, 'وسابقته السليمة');
  assert.deepEqual(area.dump()[altsKey(IDS[0])], broken, 'الأصل التالف لم يُحذف ولم يُصلَح');
  const { store: fresh } = newStore();
  const read = await readBackup(built.text, { pause: noPause });
  assert.equal(read.ok, true);
  assert.equal(read.invalid.length, 0);
  for (const v of read.videos) await fresh.restoreVideo(v.entry);
  const back = await fresh.getBundle(IDS[0]);
  assert.ok(back.record.arabic);
  assert.equal(back.slots.filter((x) => x.track).length, 1, 'الخانتان الأخريان كانتا في التابع التالف');
  const recordBroken = newStore();
  await seedBundle(recordBroken.store, sampleBundle({ videoId: IDS[0] }));
  recordBroken.area.rawSet(`video:${IDS[0]}`, { videoId: IDS[0], rev: 'x' });
  const b2 = await createBackup({ store: recordBroken.store, appVersion: '1.1.0', pause: noPause });
  assert.deepEqual(b2.skipped.map((x) => x.code), ['ST_CORRUPT_RECORD'], 'السجل نفسه تالف: لا إنقاذ');
});

test('U54: الإعدادات والقاموس بحال كل قسم — تعذّر القاموس بعد نجاح الإعدادات يُقال بعينه، وإعادة المحاولة تكتب المتعذّر وحده', async () => {
  const { store } = newStore();
  const calls = { settings: 0, prefs: 0 };
  let failPrefs = true;
  const faulty = Object.create(store);
  faulty.setSettings = (p) => { calls.settings++; return store.setSettings(p); };
  faulty.setPrefs = (p) => {
    calls.prefs++;
    if (failPrefs) { failPrefs = false; return Promise.reject(new TjError('ST_WRITE_FAILED')); }
    return store.setPrefs(p);
  };
  const chosen = { settings: { offsetStepMs: 1000 }, prefs: { glossary: samplePrefs().glossary } };
  const first = await runRestore({ store: faulty, items: [], ...chosen, pause: noPause });
  assert.deepEqual(first.parts, { settings: 'restored', prefs: 'failed', langPrefs: null });
  assert.equal(first.settings, 'failed');
  assert.equal(settingsFailureCode(first), 'BK_RESTORE_PREFS_PART_FAILED');
  assert.doesNotMatch(messageFor(settingsFailureCode(first)), /وبقيت الحالية كما هي\.$/, 'لا «بقيت الحالية» عن القسم الذي تغيّر');
  assert.equal((await store.getSettings()).offsetStepMs, 1000);
  await store.setSettings({ offsetStepMs: 900 }); // تغيير المستخدم بعد التقرير
  const again = retrySettings(first, chosen);
  assert.deepEqual(again, { settings: null, prefs: chosen.prefs, langPrefs: null });
  const second = await runRestore({ store: faulty, items: [], ...again, pause: noPause });
  assert.equal(calls.settings, 1, 'الإعدادات لم تُكتب ثانية');
  assert.equal((await store.getSettings()).offsetStepMs, 900, 'تغيير المستخدم باقٍ');
  assert.deepEqual(second.parts, { settings: null, prefs: 'restored', langPrefs: null });
  const both = { parts: { settings: 'failed', prefs: 'failed' }, settings: 'failed' };
  assert.equal(settingsFailureCode(both), 'BK_RESTORE_SETTINGS_FAILED');
  assert.equal(settingsFailureCode({ parts: { settings: 'failed', prefs: 'restored' }, settings: 'failed' }), 'BK_RESTORE_SETTINGS_PART_FAILED');
});

test('U56: فشل كتابة meta بعد نجاح المسح نتيجةٌ لا خطأ، وmigrate يلفّ الكتابة الخام في ST_WRITE_FAILED', async () => {
  const base = createMemoryArea({ unlimited: true });
  let breakMeta = false;
  const area = { ...base, async set(items) { if (breakMeta && Object.hasOwn(items, 'meta')) { breakMeta = false; throw new Error('synthetic'); } return base.set(items); } };
  const { store } = newStore(area);
  await seedBundle(store, sampleBundle({ videoId: IDS[0] }));
  breakMeta = true;
  const r = await store.clearAll();
  assert.deepEqual(r, { reinit: 'failed', thumbs: null });
  assert.deepEqual(await store.listIndex(), [], 'البيانات مُسحت');
  assert.equal((await store.getSettings()).offsetStepMs, 500, 'والتهيئة تُعاد عند أول قراءة');
  const raw = createMemoryArea({ unlimited: true });
  raw.failNext('set', new Error('IO'));
  await assert.rejects(migrate(raw, { now: NOW }), (e) => e instanceof TjError && e.code === 'ST_WRITE_FAILED');
});

/** يعيد ختم ملف بعد تعديل data (البصمة والأعداد). */
async function reseal(text, mutate) {
  const file = JSON.parse(text);
  mutate(file);
  file.counts = countData(file.data);
  file.integrity.hash = await sha256Hex(JSON.stringify(file.data));
  return JSON.stringify(file);
}

test('U59 (L-12): إعدادات متداخلة جدًا «ليست نسخة» لا RangeError', async () => {
  const { store } = newStore();
  const built = await createBackup({ store, appVersion: '1.1.0', pause: noPause });
  const file = JSON.parse(built.text);
  // JSON.parse في V8 يقبل التداخل العميق، والتسلسل العودي للبصمة يرمي RangeError (كان يخرج «خطأ غير متوقع»).
  const text = `${JSON.stringify({ ...file, data: undefined }).slice(0, -1)},"data":{"settings":${'{"x":'.repeat(50000)}{}${'}'.repeat(50000)},"prefs":null,"videos":[]}}`;
  const r = await readBackup(text, { pause: noPause });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'BK_NOT_BACKUP');
});

test('U59 (L-13): محارف تجاوز الاتجاه تُجرَّد من العنوان واسم الملف عند الاستعادة، وعلامات الاتجاه المشروعة تبقى', async () => {
  const { store } = newStore();
  await seedBundle(store, sampleBundle({ videoId: IDS[0] }));
  const built = await createBackup({ store, appVersion: '1.1.0', pause: noPause });
  const text = await reseal(built.text, (f) => {
    const e = f.data.videos[0];
    e.record.title = 'عنوان ‮gnp.exe‏';
    e.record.arabic.fileName = 'invoice‮trs.srt';
  });
  const read = await readBackup(text, { pause: noPause });
  assert.equal(read.ok, true);
  assert.equal(read.invalid.length, 0);
  const { store: fresh } = newStore();
  await fresh.restoreVideo(read.videos[0].entry);
  const rec = await fresh.getVideo(IDS[0]);
  assert.equal(rec.title, 'عنوان gnp.exe‏');
  assert.equal(rec.arabic.fileName, 'invoicetrs.srt');
});

test('U85: Retry-After بالثواني الصحيحة أو بتاريخ HTTP وحدهما وبسقف يوم، والنص بالساعات فوق الساعة', () => {
  const now = Date.parse('2026-11-05T00:00:00Z');
  assert.equal(parseRetryAfter('120', now), 120);
  assert.equal(parseRetryAfter('1e308', now), undefined, 'ليس عددًا صحيحًا بالثواني');
  assert.equal(parseRetryAfter('-1', now), undefined);
  assert.equal(parseRetryAfter('99999999', now), RETRY_AFTER_MAX_S);
  assert.equal(parseRetryAfter('Thu, 01 Jan 2099 00:00:00 GMT', now), RETRY_AFTER_MAX_S, 'كان «38 مليون دقيقة»');
  assert.equal(parseRetryAfter('Thu, 05 Nov 2026 00:02:00 GMT', now), 120);
  assert.match(failureText('rate-limited', 120), /بعد دقيقتين\.$/);
  assert.match(failureText('rate-limited', 7200), /بعد ساعتين\.$/);
  assert.match(failureText('rate-limited', RETRY_AFTER_MAX_S), /بعد 24 ساعة\.$/);
  assert.match(failureText('rate-limited', 3 * 3600), /بعد 3 ساعات\.$/);
});

test('U85: انقضاء المهلة أثناء قراءة جسم الرد «timeout» لا «unexpected»', async () => {
  const key = '123e4567-e89b-42d3-a456-426614174000';
  const request = async (_url, init) => ({
    status: 201,
    headers: { get: () => null },
    json: () => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
  });
  const r = await sendReport({}, key, { granted: async () => true, request, timeoutMs: 20 });
  assert.deepEqual(r, { ok: false, failure: 'timeout', status: null });
});

test('U85 (المراجعة المستقلة): رد نهائي غير قابل للإعادة يبقى كما هو ولو انقضت المهلة بعده', async () => {
  const key = '123e4567-e89b-42d3-a456-426614174000';
  const request = async (_url, init) => {
    await new Promise((r) => init.signal.addEventListener('abort', r));
    return { status: 413, headers: { get: () => null }, json: async () => ({}) };
  };
  const r = await sendReport({}, key, { granted: async () => true, request, timeoutMs: 10 });
  assert.equal(r.failure, 'too-large');
});
