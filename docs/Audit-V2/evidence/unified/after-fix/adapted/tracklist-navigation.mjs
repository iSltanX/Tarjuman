// نسخة معدّلة (after-fix) من docs/Audit-V2/evidence/unified/repro/A6-extract-security/tracklist-navigation.mjs، بأدنى تغيير.
// لماذا: بعد إصلاح U-032 صار في src/main-world/capture.js سطرا استيراد (videoIdFromLocation من ../core/model/video-location.js
// وreadTimedtextParams)، والأصل يحذف سطرًا واحدًا فيتعطل node:vm بـ«Cannot use import statement outside a module».
// ما تغيّر (ثلاثة مواضع فقط، والسيناريوهات والأحكام كما هي):
//   ١. IMPORT_LINE يطابق السطرين (/gm) بدل سطر readTimedtextParams وحده.
//   ٢. سياق vm يحمل videoIdFromLocation أيضًا (الدالة نفسها التي يستوردها العالم المعزول من youtube-dom.js، وهي إعادة تصدير
//      للوحدة نفسها video-location.js).
//   ٣. مرحلة «الإصلاح المقترح في الذاكرة» تُتخطى حين لا يجد الرقع نصه القديم في capture.js (الإصلاح صار في المصدر نفسه)،
//      بدل أن ترمي «تعذّر تطبيق الإصلاح المقترح في الذاكرة».
// سطر «الخلاصة» يذكر المتوقع قبل الإصلاح (6 حالات تثبت العيب)؛ المتوقع بعده 0.
// الاستعمال: command node tracklist-navigation.mjs <جذر الشيفرة>
// A6 — G-F14.a وG-F14.b/CL-N2: قائمة المسارات (tracklist) من سكربت عالم الصفحة عبر تنقل SPA، بالوحدات الحقيقية للعالمين:
// src/main-world/capture.js في node:vm (نمط test/unit/extract/c8-capture.test.js)، والجسر والمستخرج والمتتبّع والمتحكم ورد النافذة
// بتركيب src/content/main.js نفسه. الوثيقة مشتركة بين العالمين (yt-navigate-finish يصل للاثنين)، ونافذة الصفحة واحدة.
// الاستعمال: command node tracklist-navigation.mjs <جذر الشيفرة>
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const R = process.argv[2];
if (!R) throw new Error('الوسيط الأول: جذر الشيفرة');
const { readTimedtextParams } = await import(`${R}/src/extract/timedtext-params.js`);
const { createExtractor } = await import(`${R}/src/extract/index.js`);
const { installBridge } = await import(`${R}/src/content/bridge.js`);
const { watchCurrentVideo, videoIdFromLocation } = await import(`${R}/src/player/youtube-dom.js`);
const { createController } = await import(`${R}/src/content/controller.js`);
const { createStore } = await import(`${R}/src/core/store/index.js`);
const { createMemoryArea } = await import(`${R}/test/helpers/chrome-storage.js`);
const { buildVideoStateReply } = await import(`${R}/src/core/model/messages.js`);
const { videoLangs } = await import(`${R}/src/pages/popup/status.js`);
const { sample } = await import(`${R}/test/unit/extract/helpers.js`);

const SRC = readFileSync(`${R}/src/main-world/capture.js`, 'utf8');
const IMPORT_LINE = /^import \{ (?:readTimedtextParams|videoIdFromLocation) \} from '[^']+';[ \t]*$/gm;
if (!IMPORT_LINE.test(SRC)) throw new Error('شكل استيراد capture.js تغيّر');
const ORIGIN = 'https://www.youtube.com';
const A = 'AAAAAAAAAAA';
const B = 'BBBBBBBBBBB';
const BODY = sample('manual').body;

/** استجابة مشغّل مصطنعة بمسارين (يدوي إسباني وتلقائي إنجليزي) وترجمة آلية متاحة. */
const response = (id, langs) => ({
  videoDetails: { videoId: id },
  captions: { playerCaptionsTracklistRenderer: {
    captionTracks: langs.map(([lang, kind]) => ({ languageCode: lang, ...(kind === 'asr' ? { kind: 'asr' } : {}), name: { simpleText: `${lang}-${kind}` } })),
    translationLanguages: [{ languageCode: 'ar' }],
  } },
});
const RESPONSES = { [A]: response(A, [['es', 'manual'], ['en', 'asr']]), [B]: response(B, [['fr', 'manual']]) };

/** صفحة يوتيوب مصطنعة يشترك فيها العالمان، ثم تركيب content/main.js عليها. */
async function page(startPath, source = SRC) {
  const docListeners = new Map();
  const winListeners = new Map();
  const loc = { origin: ORIGIN, href: '', pathname: '', search: '' };
  const setUrl = (p) => { const u = new URL(p, ORIGIN); loc.href = u.href; loc.pathname = u.pathname; loc.search = u.search; };
  setUrl(startPath);
  // المشغّل يبقى بآخر فيديو حُمّل (المشغّل المصغّر أو المخفي في الصفحة الرئيسية)، ويحمّل فيديو صفحة المشاهدة.
  const player = { loaded: null, getPlayerResponse() { return this.loaded ? RESPONSES[this.loaded] : null; } };
  const add = (m) => (t, f) => { if (!m.has(t)) m.set(t, []); m.get(t).push(f); };
  const doc = {
    readyState: 'complete',
    getElementById: (id) => (id === 'movie_player' ? player : null),
    addEventListener: add(docListeners),
    removeEventListener() {},
    fire(t) { for (const f of [...(docListeners.get(t) ?? [])]) f({ type: t }); },
  };
  const posted = [];
  const win = {
    location: loc, document: doc,
    addEventListener: add(winListeners), removeEventListener() {},
    setInterval: () => 1, clearInterval() {},
    postMessage(msg, targetOrigin) {
      const data = JSON.parse(JSON.stringify(msg));
      posted.push(data);
      if (targetOrigin !== ORIGIN) return;
      for (const f of [...(winListeners.get('message') ?? [])]) f({ source: win, origin: ORIGIN, data });
    },
    fetch: () => Promise.resolve(new Response(BODY, { status: 200 })),
    XMLHttpRequest: class { open() {} send() {} addEventListener() {} },
  };
  const timers = [];
  const ctx = vm.createContext({
    window: win, document: doc, URL, Response, Request, TextDecoder, TextEncoder, WeakMap, JSON, String, Promise, Blob, queueMicrotask,
    setTimeout: (f) => { timers.push(f); return timers.length; }, clearTimeout() {}, readTimedtextParams, videoIdFromLocation,
  });
  // ترتيب البيان: سكربت MAIN أولًا ثم المعزول، وكلاهما عند document_start.
  const vid0 = videoIdFromLocation(loc);
  if (vid0) player.loaded = vid0;
  vm.runInContext(source.replace(IMPORT_LINE, ''), ctx, { filename: 'capture.js' });

  // تركيب src/content/main.js (بلا الطبقة والأدوات والنافذة).
  let tracker = null;
  const extractor = createExtractor({ currentVideoId: () => (tracker ? tracker.current() : null), durationMs: () => null, isLive: () => false });
  installBridge((m) => extractor.handleMessage(m), win);
  const store = createStore({ area: createMemoryArea({ unlimited: true }) });
  const controller = createController({ store, extractor, page: { title: () => 'عنوان', durationMs: () => null } });
  tracker = watchCurrentVideo({ win, onChange: (id) => { controller.setVideo(id); extractor.setVideo(id); }, pollMs: 1e9 });
  await controller.start(tracker.current());

  const settle = async () => { for (let i = 0; i < 12; i++) await new Promise((r) => setImmediate(r)); };
  const runTimers = async () => { while (timers.length) { timers.shift()(); await settle(); } };
  await runTimers();

  return {
    posted, extractor, controller,
    async nav(p) {
      setUrl(p);
      const id = videoIdFromLocation(loc);
      if (id) player.loaded = id;
      for (const t of ['yt-navigate-finish', 'yt-page-data-updated', 'yt-player-updated']) doc.fire(t);
      await settle();
      await runTimers();
    },
    /** المستخدم يشغّل CC: طلب المشغّل نفسه لـ/api/timedtext يمر بغلاف fetch، فيُستدعى post() ثم scheduleTracks(). */
    async cc(id) {
      await win.fetch(`${ORIGIN}/api/timedtext?v=${id}&lang=en&fmt=json3&kind=asr&pot=x`);
      await settle();
      await runTimers();
    },
    snap() {
      const s = controller.getState();
      const reply = buildVideoStateReply(s, { overlay: 'mounted', controls: 'mounted' });
      const av = extractor.available();
      return {
        url: loc.pathname + loc.search,
        isolatedVideo: s.videoId,
        tracklistMsgs: posted.filter((m) => m.kind === 'tracklist').length,
        available: av ? `${av.videoId}:${av.tracks.map((t) => `${t.lang}/${t.kind}`).join(',')}${av.translatable ? '+tlang' : ''}` : null,
        capturedOk: s.captured.filter((t) => t.ok).length,
        popupVideoLangs: videoLangs({ ...reply, watch: !!s.videoId }),
      };
    },
  };
}

const lines = [];
const out = (s = '') => { lines.push(s); console.log(s); };
let failures = 0;
const verdict = (name, actual, expected, ok) => {
  out(`- ${name}`);
  out(`  الفعلي:   ${JSON.stringify(actual)}`);
  out(`  المتوقع:  ${JSON.stringify(expected)}`);
  out(`  ${ok ? 'مطابق' : 'غير مطابق (يثبت الادعاء)'}`);
  if (!ok) failures++;
};

let SOURCE = SRC;
let QUIET = false;
async function scenario(title, start, steps) {
  if (QUIET) {
    const p = await page(start, SOURCE);
    for (const [kind, arg] of steps) { if (kind === 'nav') await p.nav(arg); else await p.cc(arg); }
    out(`\n## ${title}`);
    return p;
  }
  out(`\n## ${title}`);
  const p = await page(start, SOURCE);
  out(`  بدء ${start}: ${JSON.stringify(p.snap())}`);
  for (const [kind, arg] of steps) {
    const before = p.posted.filter((m) => m.kind === 'tracklist').length;
    if (kind === 'nav') await p.nav(arg); else await p.cc(arg);
    const s = p.snap();
    out(`  ${kind === 'nav' ? `تنقل إلى ${arg}` : `تشغيل CC للفيديو ${arg}`}: رسائل tracklist جديدة=${s.tracklistMsgs - before} ${JSON.stringify(s)}`);
  }
  return p;
}

out('# A6 — قائمة المسارات عبر تنقل SPA (capture.js الحقيقي + المستخرج والمتحكم الحقيقيان)');

async function runAll() {
// ١: الادعاء G-F14.a — A ← / ← A
{
  const p = await scenario('١. A ← الصفحة الرئيسية ← A (G-F14.a)', `/watch?v=${A}`, [['nav', '/'], ['nav', `/watch?v=${A}`]]);
  const s = p.snap();
  verdict('العودة إلى A تعيد قائمة مسارات A', { available: s.available, popupVideoLangs: s.popupVideoLangs },
    { available: `${A}:es/manual,en/asr+tlang`, popupVideoLangs: ['es', 'en'] }, s.available !== null);
}
// ٢: ولا يستعيدها التقاط CC بعد العودة (post() يستدعي scheduleTracks ثم postTracks بالمفتاح نفسه)
{
  const p = await scenario('٢. A ← / ← A ثم تشغيل CC (التقاط حقيقي يمر بـpost())', `/watch?v=${A}`, [['nav', '/'], ['nav', `/watch?v=${A}`], ['cc', A]]);
  const s = p.snap();
  verdict('بعد الالتقاط تعود القائمة', { available: s.available, capturedOk: s.capturedOk }, { available: `${A}:es/manual,en/asr+tlang`, capturedOk: 1 }, s.available !== null);
}
// ٣: صفحات أخرى غير المشاهدة
for (const mid of ['/results?search_query=x', `/shorts/${B}`, '/feed/subscriptions']) {
  const p = await scenario(`٣. A ← ${mid} ← A`, `/watch?v=${A}`, [['nav', mid], ['nav', `/watch?v=${A}`]]);
  const s = p.snap();
  verdict(`العودة من ${mid}`, s.available, `${A}:es/manual,en/asr+tlang`, s.available !== null);
}
// ٤: ضابط — A ← B ← A يعمل لأن المفتاح تغيّر
{
  const p = await scenario('٤. ضابط: A ← B ← A', `/watch?v=${A}`, [['nav', `/watch?v=${B}`], ['nav', `/watch?v=${A}`]]);
  const s = p.snap();
  verdict('العودة عبر فيديو آخر', s.available, `${A}:es/manual,en/asr+tlang`, s.available !== null);
}
// ٥: G-F14.b/CL-N2 — /live/<id> (البث المنتهي بعنوانه)
{
  const p = await scenario('٥. تحميل مباشر لـ/live/A ثم تشغيل CC', `/live/${A}`, [['cc', A]]);
  const s = p.snap();
  verdict('قائمة المسارات في /live/<id>', { isolatedVideo: s.isolatedVideo, available: s.available, capturedOk: s.capturedOk },
    { isolatedVideo: A, available: `${A}:es/manual,en/asr+tlang`, capturedOk: 1 }, s.available !== null);
}
// ٦: ضابط — /watch?v=A تحميل مباشر
{
  const p = await scenario('٦. ضابط: تحميل مباشر لـ/watch?v=A', `/watch?v=${A}`, []);
  const s = p.snap();
  verdict('قائمة المسارات في /watch', s.available, `${A}:es/manual,en/asr+tlang`, s.available !== null);
}

}

await runAll();
out(`\nالخلاصة: ${failures} حالة غير مطابقة للمتوقع (المتوقع ثبوتها: ١ و٢ و٣×3 و٥ = 6، والضابطان ٤ و٦ مطابقان).`);

// معيار القبول: الإصلاح المقترح نفسه مطبقًا في الذاكرة على نص capture.js (لا يُعدَّل ملف المنتج): تصفير lastList حين لا فيديو
// معروض، ومعرّف الفيديو بقاعدة videoIdFromLocation نفسها (/watch?v= و/live/<id>).
const PATCHED = SRC
  .replace("const v = new URL(window.location.href).searchParams.get('v');\n    return v && VIDEO_ID.test(v) ? v : null;",
    "const u = new URL(window.location.href);\n    if (u.pathname === '/watch') { const v = u.searchParams.get('v'); return v && VIDEO_ID.test(v) ? v : null; }\n    const m = /^\\/live\\/([A-Za-z0-9_-]{11})(?:\\/|$)/.exec(u.pathname);\n    return m ? m[1] : null;")
  .replace('  const id = currentVideoId();\n  const r = id ? playerResponse(id) : null;', "  const id = currentVideoId();\n  if (!id) lastList = '';\n  const r = id ? playerResponse(id) : null;");
if (PATCHED === SRC) out('\n# معيار القبول في الذاكرة: لم يُطبَّق، لأن capture.js لم يعد فيه النص الذي يستبدله الإصلاح المقترح (الإصلاح في المصدر نفسه، والحالات أعلاه شُغّلت عليه).');
else {
if (!PATCHED.includes("if (!id) lastList = '';") || !PATCHED.includes("u.pathname === '/watch'")) throw new Error('تعذّر تطبيق الإصلاح المقترح في الذاكرة');
out('\n# معيار القبول: الحالات نفسها على capture.js بعد الإصلاح المقترح (في الذاكرة)');
SOURCE = PATCHED;
QUIET = true;
failures = 0;
await runAll();
out(`\nبعد الإصلاح: ${failures} حالة غير مطابقة (المتوقع 0).`);
}
