// مكان حفظ الملفات (P10-AC9، عقد interfaces §١٣): التحقق من الاسم والامتداد والحجم، وخيارات الأوضاع الثلاثة، والمسارات
// الثلاثة لـsaveFile (الصفحة مباشرة، وسكربت المحتوى عبر العامل، والرجوع إلى Blob)، والمكان الفعلي من سجل المتصفح وحده.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SAVE_LIMITS, downloadTarget, saveFile, savedPath, settleDownload, validateSaveFile } from '../../../src/core/save/index.js';
import { createStore } from '../../../src/core/store/index.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { NOW } from '../../helpers/fixtures.js';

const fast = { pollMs: 1, timeoutMs: 50, wait: async () => {} };

/** واجهة تنزيلات وهمية تسجّل كل استدعاء؛ search بالمعرّف وحده. */
function fakeDownloads({ states = ['complete'], fail = null, item = {} } = {}) {
  const calls = { download: [], search: [] };
  let n = 0;
  let next = 40;
  return {
    calls,
    async download(opts) {
      calls.download.push(opts);
      if (fail) throw new Error(fail);
      return next++;
    },
    async search(q) {
      calls.search.push(q);
      assert.deepEqual(Object.keys(q), ['id'], 'search بالمعرّف وحده');
      const state = states[Math.min(n++, states.length - 1)];
      if (state === 'missing') return [];
      return [{ id: q.id, state, error: state === 'interrupted' ? item.error ?? 'FILE_FAILED' : undefined, exists: true, filename: `/Users/t/Downloads/${item.name ?? 'x.srt'}`, ...item }];
    },
  };
}

const store = () => createStore({ area: createMemoryArea({ unlimited: true }), now: () => Date.parse(NOW) });
const file = { name: 'iG9CE55wbtY.en.manual.normal.srt', text: '1\n00:00:01,000 --> 00:00:02,000\nhello\n' };

test('الاسم والامتداد والحجم: أسماء ترجمان والعربية مقبولة، وفواصل المسار والامتدادات الأخرى مرفوضة', () => {
  for (const name of ['iG9CE55wbtY.en.manual.normal.srt', 'iG9CE55wbtY.ar.original.srt', 'tarjuman-backup-2026-11-02.json', 'ترجمة المحاضرة.ar.srt', 'study (1).md', 'report.txt']) {
    assert.equal(validateSaveFile({ name, text: 'x' }).ok, true, name);
  }
  for (const name of ['../x.srt', 'a/b.srt', 'a\\b.srt', 'x.exe', 'x.SRT', '.hidden.srt', 'x .srt', 'x..srt', `a${String.fromCharCode(10)}b.srt`, 'x'.repeat(147) + '.srt', '', 'noext']) {
    assert.deepEqual(validateSaveFile({ name, text: 'x' }), { ok: false, code: 'SV_BAD_FILE' }, JSON.stringify(name));
  }
  assert.deepEqual(validateSaveFile({ name: 'a.srt', text: 'xx' }, { maxChars: 1 }), { ok: false, code: 'SV_TOO_LARGE' });
  assert.deepEqual(validateSaveFile(null), { ok: false, code: 'SV_BAD_FILE' });
  assert.equal(validateSaveFile({ name: 'a.json', text: '{}' }).mime, 'application/json;charset=utf-8', 'النوع من الامتداد');
});

test('الفكرة ١١: ملف الترجمة WebVTT والثنائي يُقبلان، ونوع .vtt من الامتداد text/vtt في الصفحة والعامل', async () => {
  for (const name of ['iG9CE55wbtY.ar.vtt', 'iG9CE55wbtY.ar.dual-en.vtt', 'iG9CE55wbtY.translation.original.dual-en-GB.vtt', 'iG9CE55wbtY.ar.dual-en.srt']) {
    assert.equal(validateSaveFile({ name, text: 'WEBVTT\n' }).ok, true, name);
  }
  assert.deepEqual(validateSaveFile({ name: 'iG9CE55wbtY.ar.vtt', text: 'WEBVTT\n' }), { ok: true, ext: 'vtt', mime: 'text/vtt;charset=utf-8' });
  assert.equal(validateSaveFile({ name: 'iG9CE55wbtY.ar.ass', text: '' }).ok, false, 'ولا .ass');
  // الصفحة: Blob بنوع الامتداد لا بنوع يمرّره المستدعي.
  const types = [];
  const win = {
    URL: { createObjectURL: (b) => { types.push(b.type); return 'blob:tj'; }, revokeObjectURL() {} },
    Blob: class { constructor(parts, opts) { this.type = opts?.type; } },
    setTimeout() {},
  };
  const r = await saveFile({ name: 'iG9CE55wbtY.ar.dual-en.vtt', text: 'WEBVTT\n', mime: 'text/plain' }, { api: { downloads: fakeDownloads() }, store: store(), doc: { defaultView: win }, settle: fast });
  assert.equal(r.ok, true);
  assert.deepEqual(types, ['text/vtt;charset=utf-8']);
});

test('الأوضاع الثلاثة: الافتراضي بلا saveAs (يتبع المتصفح)، والمجلد الفرعي تلقائي، والسؤال بحوار؛ والتالف يعود إلى الافتراضي', () => {
  assert.deepEqual(downloadTarget({ mode: 'downloads', folder: 'Tarjuman' }, 'a.srt'), { filename: 'a.srt' });
  assert.deepEqual(downloadTarget({ mode: 'subfolder', folder: 'ترجماتي' }, 'a.srt'), { filename: 'ترجماتي/a.srt', saveAs: false });
  assert.deepEqual(downloadTarget({ mode: 'ask', folder: 'Tarjuman' }, 'a.srt'), { filename: 'a.srt', saveAs: true });
  assert.deepEqual(downloadTarget({ mode: 'subfolder', folder: '../etc' }, 'a.srt'), { filename: 'Tarjuman/a.srt', saveAs: false });
  assert.deepEqual(downloadTarget({ mode: 'evil' }, 'a.srt'), { filename: 'a.srt' });
  assert.deepEqual(downloadTarget(undefined, 'a.srt'), { filename: 'a.srt' });
});

test('الصفحة: تحفظ مباشرة بالوضع المخزَّن، ولا تكتب فوق ملف قائم، وتسجّل المعرّف لا المسار', async () => {
  const s = store();
  await s.setPrefs({ saveLocation: { mode: 'subfolder', folder: 'Tarjuman' } });
  const downloads = fakeDownloads();
  const r = await saveFile(file, { api: { downloads }, store: s, settle: fast });
  assert.deepEqual(r, { ok: true, mode: 'subfolder', downloadId: 40 });
  const [opts] = downloads.calls.download;
  assert.equal(opts.filename, `Tarjuman/${file.name}`);
  assert.equal(opts.saveAs, false);
  assert.equal(opts.conflictAction, 'uniquify', 'لا كتابة فوق ملف قائم');
  assert.match(opts.url, /^blob:/);
  assert.deepEqual(await s.getLastSave(), { downloadId: 40, at: NOW });
  assert.equal(JSON.stringify(await s.getLastSave()).includes('/'), false, 'لا مسار في التخزين');
});

test('الصفحة: إلغاء حوار الحفظ SV_CANCELLED بلا رجوع؛ وتعذّر الواجهة يرجع إلى Blob', async () => {
  const s = store();
  await s.setPrefs({ saveLocation: { mode: 'ask', folder: 'Tarjuman' } });
  let fellBack = 0;
  const fallback = () => { fellBack++; };
  const cancelled = await saveFile(file, { api: { downloads: fakeDownloads({ states: ['in_progress', 'interrupted'], item: { error: 'USER_CANCELED' } }) }, store: s, settle: fast, fallback });
  assert.deepEqual(cancelled, { ok: false, code: 'SV_CANCELLED' });
  assert.equal(fellBack, 0);
  const failed = await saveFile(file, { api: { downloads: fakeDownloads({ fail: 'Invalid filename' }) }, store: s, settle: fast, fallback });
  assert.deepEqual(failed, { ok: true, mode: 'blob', downloadId: null });
  assert.equal(fellBack, 1);
  assert.deepEqual(await saveFile({ name: '../x.srt', text: '' }, { api: { downloads: fakeDownloads() }, store: s, fallback }), { ok: false, code: 'SV_BAD_FILE' });
  assert.equal(fellBack, 1, 'الاسم المرفوض لا يُنزَّل بأي طريق');
});

test('سكربت المحتوى: إلى العامل بالاسم والنص وحدهما، ولا رد أو قناة متعذرة يرجع إلى Blob، والإلغاء يُعاد كما هو', async () => {
  const sent = [];
  const runtime = (reply) => ({ sendMessage: async (m) => { sent.push(m); return typeof reply === 'function' ? reply() : reply; } });
  let fellBack = 0;
  const fallback = () => { fellBack++; };
  const ok = await saveFile({ ...file, mime: 'text/html' }, { api: { runtime: runtime({ v: 1, ok: true, mode: 'downloads', downloadId: 7 }) }, fallback });
  assert.deepEqual(ok, { ok: true, mode: 'downloads', downloadId: 7 });
  assert.deepEqual(sent[0], { type: 'tj:save-file', v: 1, file: { name: file.name, text: file.text } }, 'لا نوع ولا وضع في الرسالة');
  assert.deepEqual(await saveFile(file, { api: { runtime: runtime({ v: 1, ok: false, code: 'SV_CANCELLED' }) }, fallback }), { ok: false, code: 'SV_CANCELLED' });
  assert.equal(fellBack, 0);
  assert.deepEqual(await saveFile(file, { api: { runtime: runtime(undefined) }, fallback }), { ok: true, mode: 'blob', downloadId: null });
  assert.deepEqual(await saveFile(file, { api: { runtime: runtime(() => { throw new Error('Could not establish connection'); }) }, fallback }), { ok: true, mode: 'blob', downloadId: null });
  assert.deepEqual(await saveFile(file, { api: { runtime: runtime({ v: 1, ok: false, code: 'SV_FAILED' }) }, fallback }), { ok: true, mode: 'blob', downloadId: null });
  assert.equal(fellBack, 3);
  const big = { name: 'big.srt', text: 'x'.repeat(SAVE_LIMITS.maxMessageChars + 1) };
  const before = sent.length;
  assert.deepEqual(await saveFile(big, { api: { runtime: runtime({ v: 1, ok: true, mode: 'downloads', downloadId: 1 }) }, fallback }), { ok: true, mode: 'blob', downloadId: null });
  assert.equal(sent.length, before, 'ما يتجاوز حد القناة لا يُرسل');
});

const EXT = 'tarjuman@bysltan.com';
const mine = (o = {}) => ({ byExtensionId: EXT, ...o });

test('المكان الفعلي: من سجل المتصفح لذلك الملف وحده بعد اكتماله ووجوده، وإلا لا مسار', async () => {
  const deps = (o) => ({ downloads: fakeDownloads(o), extensionId: EXT });
  assert.equal(await savedPath(40, deps({ item: mine({ name: 'a.srt' }) })), '/Users/t/Downloads/a.srt');
  assert.equal(await savedPath(40, deps({ states: ['in_progress'], item: mine() })), null);
  assert.equal(await savedPath(40, deps({ item: mine({ exists: false }) })), null);
  assert.equal(await savedPath(40, deps({ states: ['missing'] })), null);
  assert.equal(await savedPath(-1, deps({ item: mine() })), null);
  assert.equal(await savedPath(40, { downloads: null, extensionId: EXT }), null);
});

test('تدقيق 7a66f91 (U04): رقم محفوظ صار لتنزيل لا يخص ترجمان (إعادة ترقيم Firefox، أو إعادة استعمال المعرّف) لا يُعرض مساره', async () => {
  // Firefox بعد إعادة التشغيل: السجل يُرقَّم من جديد، والعنصر بالرقم المحفوظ تنزيل عادي لغير الإضافة.
  assert.equal(await savedPath(40, { downloads: fakeDownloads({ item: { name: 'bank-statement.pdf' } }), extensionId: EXT }), null, 'بلا byExtensionId');
  assert.equal(await savedPath(40, { downloads: fakeDownloads({ item: { name: 'x.pdf', byExtensionId: 'other@ext' } }), extensionId: EXT }), null, 'لإضافة أخرى');
  // Firefox يفقد byExtensionId بعد الإعادة حتى لملفات ترجمان نفسها: السطر يغيب، ولا يُخمَّن.
  assert.equal(await savedPath(40, { downloads: fakeDownloads({ item: { byExtensionId: undefined } }), extensionId: EXT }), null);
  // بلا معرّف إضافة معروف لا مسار أبدًا.
  assert.equal(await savedPath(40, { downloads: fakeDownloads({ item: mine() }), extensionId: null }), null);
  assert.equal(await savedPath(40, { downloads: fakeDownloads({ item: mine() }), extensionId: '' }), null);
});

test('انتظار التنزيل: من «جارٍ» إلى الاكتمال أو الإلغاء أو الفشل، وبمهلة', async () => {
  assert.equal(await settleDownload(fakeDownloads({ states: ['in_progress', 'in_progress', 'complete'] }), 1, fast), 'complete');
  assert.equal(await settleDownload(fakeDownloads({ states: ['interrupted'], item: { error: 'USER_CANCELED' } }), 1, fast), 'cancelled');
  assert.equal(await settleDownload(fakeDownloads({ states: ['interrupted'] }), 1, fast), 'failed');
  assert.equal(await settleDownload(fakeDownloads({ states: ['in_progress'] }), 1, { pollMs: 10, timeoutMs: 20, wait: async () => {} }), 'pending');
});

test('تدقيق 5fedcb9 (CX-005، GM-001): أسماء ترجمان لمعرّف يبدأ بـ_ أو - تُحفظ من الصفحة والعامل، والمسارات الخبيثة مرفوضة كما كانت', async () => {
  const { fileName } = await import('../../../src/core/export/names.js');
  const { patchFileName } = await import('../../../src/core/export/patch.js');
  const { buildArabicExport } = await import('../../../src/core/export/index.js');
  const { buildStudyText } = await import('../../../src/core/export/study.js');
  const { buildReviewReport } = await import('../../../src/core/export/report.js');
  const { createSaveService } = await import('../../../src/background/save-service.js');
  const cues = [{ n: 1, startMs: 1000, endMs: 2000, text: 'مرحبا' }];
  for (const videoId of ['_AAAAAAAAAA', '-AAAAAAAAAA', '-_-_-_-_-_-']) {
    const names = [
      fileName({ videoId, lang: 'en', kind: 'manual', mode: 'normal' }),
      fileName({ videoId, lang: 'en', kind: 'asr', mode: 'long', part: { index: 2, total: 5 } }),
      fileName({ videoId, lang: 'ar' }),
      fileName({ videoId, lang: 'ar', variant: 'original' }),
      patchFileName({ videoId, lang: 'en', kind: 'manual', mode: 'normal' }),
      buildArabicExport({ videoId, cues }).name,
      buildStudyText({ videoId, cues, format: 'txt' }).name,
      buildStudyText({ videoId, cues, format: 'md' }).name,
      buildReviewReport({ videoId, items: [], format: 'txt' }).name,
    ];
    for (const name of names) assert.equal(validateSaveFile({ name, text: 'x' }).ok, true, name);
    // من الصفحة: يصل التنزيل فعلًا.
    const downloads = fakeDownloads();
    assert.deepEqual(await saveFile({ name: names[0], text: 'x' }, { api: { downloads }, store: store(), settle: fast }), { ok: true, mode: 'downloads', downloadId: 40 });
    assert.equal(downloads.calls.download.length, 1);
    // من سكربت المحتوى عبر العامل: يقبله العامل كذلك.
    const runtime = { id: 'tj', getURL: (p) => `chrome-extension://tj/${p}`, onMessage: { addListener() {} } };
    const svc = createSaveService({ runtime, downloads: fakeDownloads(), store: store(), settle: fast });
    const reply = await svc.handle({ type: 'tj:save-file', v: 1, file: { name: names[2], text: 'x' } }, { id: 'tj', url: 'chrome-extension://tj/pages/library/index.html', origin: 'chrome-extension://tj' });
    assert.equal(reply?.ok, true, `العامل: ${names[2]}`);
  }
  for (const name of ['-/x.srt', '_\\x.srt', '-..srt', ' x.srt', '.x.srt', '_x .srt', `-${String.fromCharCode(0)}.srt`]) {
    assert.deepEqual(validateSaveFile({ name, text: 'x' }), { ok: false, code: 'SV_BAD_FILE' }, JSON.stringify(name));
  }
});

test('تدقيق 5fedcb9 (CX-H6، GM-017.4): مهلة رد العامل لا تنزّل بديل Blob، والتنزيل الباقي «جاريًا» بعد مهلة الانتظار pending لا «حُفظ»', async () => {
  let fellBack = 0;
  const fallback = () => { fellBack++; };
  const never = { sendMessage: () => new Promise(() => {}) };
  assert.deepEqual(await saveFile(file, { api: { runtime: never }, fallback, replyTimeoutMs: 5 }), { ok: false, code: 'SV_NO_REPLY' });
  assert.equal(fellBack, 0, 'لا ملف ثانٍ');
  // صفحة: الحالة تبقى in_progress حتى المهلة.
  const s = store();
  const revokes = [];
  const doc = { defaultView: { URL, Blob, setTimeout: (fn, ms) => { revokes.push(ms); return 0; } } };
  const pending = await saveFile(file, { api: { downloads: fakeDownloads({ states: ['in_progress'] }) }, store: s, settle: fast, doc });
  assert.equal(revokes.length, 1, 'الرابط يبقى ما دام الحوار مفتوحًا ثم يُلغى بمؤقت');
  assert.deepEqual(pending, { ok: true, mode: 'downloads', downloadId: 40, pending: true });
  // العامل يمرر pending في رده، والمحتوى يعيده.
  const viaWorker = await saveFile(file, { api: { runtime: { sendMessage: async () => ({ v: 1, ok: true, mode: 'ask', downloadId: 9, pending: true }) } }, fallback });
  assert.deepEqual(viaWorker, { ok: true, mode: 'ask', downloadId: 9, pending: true });
});
