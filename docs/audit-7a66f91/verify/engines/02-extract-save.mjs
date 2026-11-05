// S2 وS3 (المستخرج)، وS4 (مسارا الحفظ)، وS8 (ترقيم Firefox بنموذج مطابق لـext-downloads.js 159.0.1). بلا شبكة ولا متصفح.
const T = '$SCRATCH/tj';
const { createExtractor } = await import(`${T}/src/extract/index.js`);
const { saveFile, savedPath } = await import(`${T}/src/core/save/index.js`);
const { createSaveService } = await import(`${T}/src/background/save-service.js`);
const { createStore } = await import(`${T}/src/core/store/index.js`);
const { createMemoryArea } = await import(`${T}/test/helpers/chrome-storage.js`);
const out = (k, v) => console.log(k.padEnd(28), typeof v === 'string' ? v : JSON.stringify(v));
const VID = 'AAAAAAAAAAA';
const body = (segs) => JSON.stringify({ events: [{ tStartMs: 0, dDurationMs: 1000, segs }] });
const msg = (b, lang = 'en', trackKind = 'manual') => ({ source: 'tarjuman', v: 1, kind: 'timedtext', videoId: VID, lang, trackKind, format: 'json3', status: 200, bodyLength: b.length, body: b });
const tryIt = (fn) => { try { const r = fn(); return { ok: true, r: Array.isArray(r) ? `array(${r.length})` : r?.ok ?? r }; } catch (e) { return { threw: `${e.constructor.name}: ${e.message}` }; } };

// ---- S2
{
  const e = createExtractor({ currentVideoId: () => VID, durationMs: () => 1000 });
  out('S2 good', tryIt(() => e.handleMessage(msg(body([{ utf8: 'hello' }])))));
  out('S2 tracks after good', e.tracks().map((t) => [t.key, t.ok]));
  for (const bad of [[1, { utf8: 'x' }], ['str', { utf8: 'x' }], [true, { utf8: 'x' }], [null, { utf8: 'x' }]]) {
    const e2 = createExtractor({ currentVideoId: () => VID, durationMs: () => 1000 });
    e2.handleMessage(msg(body([{ utf8: 'hello' }])));
    const h = tryIt(() => e2.handleMessage(msg(body(bad))));
    out(`S2 segs[0]=${JSON.stringify(bad[0])}`, { handle: h, tracks: tryIt(() => e2.tracks()), diag: tryIt(() => e2.diagnostics()), convert: tryIt(() => e2.convert('en|manual')) });
  }
  // asr kind: same?
  const e3 = createExtractor({ currentVideoId: () => VID, durationMs: () => 1000 });
  out('S2 other key unaffected?', (() => { e3.handleMessage(msg(body([{ utf8: 'hello' }]), 'en-US')); try { e3.handleMessage(msg(body([1]), 'en')); } catch {} return tryIt(() => e3.tracks()); })());
  // recovery by a valid capture with same key
  const e4 = createExtractor({ currentVideoId: () => VID, durationMs: () => 1000 });
  try { e4.handleMessage(msg(body([1, { utf8: 'x' }]))); } catch {}
  e4.handleMessage(msg(body([{ utf8: 'again' }])));
  out('S2 recovers same key', tryIt(() => e4.tracks()));
}

// ---- S3
{
  const e = createExtractor({ currentVideoId: () => VID, durationMs: () => 1000 });
  const N = 64;
  for (let i = 0; i < N; i++) e.handleMessage(msg(body([{ utf8: `sample ${i} ` + 'x'.repeat(1000) }]), `en-x${i}`));
  const d = e.diagnostics();
  out('S3 diagnostics', { submitted: N, accepted: d.accepted, visibleTracks: d.tracks.length });
  // نفس المفتاح مكرر 64 مرة: هل يتراكم؟
  const e2 = createExtractor({ currentVideoId: () => VID, durationMs: () => 1000 });
  for (let i = 0; i < N; i++) e2.handleMessage(msg(body([{ utf8: `again ${i}` }]), 'en'));
  out('S3 same key x64', { accepted: e2.diagnostics().accepted, tracks: e2.tracks().length });
  // بعد التنقل
  let cur = VID;
  const e3 = createExtractor({ currentVideoId: () => cur, durationMs: () => 1000 });
  for (let i = 0; i < 20; i++) e3.handleMessage(msg(body([{ utf8: `s${i}` }]), `en-y${i}`));
  cur = 'BBBBBBBBBBB'; e3.setVideo(cur);
  out('S3 after navigation', { accepted: e3.diagnostics().accepted, tracks: e3.tracks().length });
}

// ---- S4: page path
{
  let fallback = 0;
  const api = { downloads: { download: async () => 17, search: async () => { throw new Error('synthetic search failure'); } } };
  const store = { getPrefs: async () => ({ saveLocation: { mode: 'downloads' } }), setLastSave: async () => {} };
  const fakeWin = { URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => { fakeWin.revoked = (fakeWin.revoked ?? 0) + 1; } }, Blob: class { constructor() {} }, setTimeout };
  const doc = { defaultView: fakeWin };
  const r = await saveFile({ name: 'a.srt', text: 'x' }, { api, store, doc, fallback: () => { fallback++; } }).then((v) => ({ resolved: v }), (e) => ({ rejected: e.message }));
  out('S4 page search rejects', { ...r, fallback, blobUrlRevokedImmediately: fakeWin.revoked === 1 });
  // search يعيد [] (عنصر غير موجود) بعد بدء التنزيل
  let fb2 = 0;
  const api2 = { downloads: { download: async () => 18, search: async () => [] } };
  const r2 = await saveFile({ name: 'a.srt', text: 'x' }, { api: api2, store, doc, fallback: () => { fb2++; } });
  out('S4 page search returns []', { result: r2, fallbackCalls: fb2 });
}
// ---- S4: worker path
{
  const runtime = { id: 'ext', getURL: (p = '') => `chrome-extension://ext/${p}` };
  let downloads = 0, fallback = 0;
  const worker = createSaveService({ runtime, downloads: { download: async () => { downloads++; return 17; }, search: async () => { throw new Error('synthetic'); } },
    store: { getPrefs: async () => ({ saveLocation: { mode: 'downloads' } }), setLastSave: async () => {} }, env: {} });
  const sender = { id: 'ext', tab: { id: 1 }, url: 'https://www.youtube.com/watch?v=AAAAAAAAAAA' };
  const r = await saveFile({ name: 'a.srt', text: 'x' }, { api: { runtime: { sendMessage: (q) => worker.handle(q, sender) } }, fallback: () => { fallback++; } });
  out('S4 worker search rejects', { browserDownloads: downloads, blobFallbacks: fallback, result: r });
  // قناة تُغلق بخطأ بعد أن بدأ العامل التنزيل (مثل إعادة تشغيل العامل)
  let d2 = 0, fb2 = 0;
  const r2 = await saveFile({ name: 'a.srt', text: 'x' }, { api: { runtime: { sendMessage: async () => { d2++; throw new Error('The message port closed before a response was received.'); } } }, fallback: () => { fb2++; } });
  out('S4 port closed after send', { sendMessageCalls: d2, blobFallbacks: fb2, result: r2 });
}

// ---- S8: نموذج DownloadMap كما في ext-downloads.js:333–419 (عدّاد يبدأ من 0 لكل جلسة، ويُرقَّم السجل بترتيب getAll)
{
  const session = (list) => { let cur = 0; const byId = new Map(); for (const d of list) byId.set(++cur, d); return { add(d) { const id = ++cur; byId.set(id, d); return id; },
    downloads: { search: async ({ id }) => (byId.has(id) ? [byId.get(id)] : []) } }; };
  const dl = (path) => ({ state: 'complete', exists: true, filename: path });
  const histA = dl('/Users/u/Downloads/old-thing.zip'), own = dl('/Users/u/Downloads/AAAAAAAAAAA.en.manual.normal.srt'), other = dl('/Users/u/Downloads/bank-statement.pdf');
  const s1 = session([histA]);
  const store = createStore({ area: createMemoryArea({ unlimited: true }) });
  const id = s1.add(own); await store.setLastSave(id); s1.add(other);
  out('S8 session1 savedPath', await savedPath((await store.getLastSave()).downloadId, { downloads: s1.downloads }));
  // إعادة تشغيل بعد إزالة histA من السجل (يدويًا أو بانتهاء مدة السجل)
  const s2 = session([own, other]);
  out('S8 session2 savedPath', await savedPath((await store.getLastSave()).downloadId, { downloads: s2.downloads }));
  // إعادة تشغيل بلا إزالة: الترتيب نفسه
  const s3 = session([histA, own, other]);
  out('S8 restart no removal', await savedPath((await store.getLastSave()).downloadId, { downloads: s3.downloads }));
  // حذف ملف ترجمان من السجل قبل الإعادة
  const s4 = session([histA, other]);
  out('S8 own erased then restart', await savedPath((await store.getLastSave()).downloadId, { downloads: s4.downloads }));
}
