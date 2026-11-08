// نسخة معدّلة (after-fix) من تجربة Claude الأصلية experiments/d-live-tracklist.mjs (حزمة tarjuman-audit-Claude_5b9a584)، بأدنى تغيير.
// لماذا: بعد إصلاح U-032 صار في src/main-world/capture.js سطرا استيراد (videoIdFromLocation من ../core/model/video-location.js
// وreadTimedtextParams)، والأصل يحذف سطر readTimedtextParams وحده فيتعطل node:vm بـ«Cannot use import statement outside a module».
// ما تغيّر (موضعان فقط، والسيناريو والطباعة كما هما):
//   ١. التعبير يحذف السطرين (/gm) بدل سطر واحد.
//   ٢. سياق vm يحمل videoIdFromLocation أيضًا (الدالة نفسها التي يستوردها العالم المعزول من youtube-dom.js).
// الاستعمال: command node d-live-tracklist.mjs <جذر الشيفرة>
// تجربة D: هل يرسل سكربت عالم الصفحة قائمة المسارات في /live/<id> كما في /watch?v=<id>؟ (المستخرج المعزول يقبل الاثنين)
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const R = process.argv[2];
const { readTimedtextParams } = await import(`${R}/src/extract/timedtext-params.js`);
const { videoIdFromLocation } = await import(`${R}/src/player/youtube-dom.js`);
const SOURCE = readFileSync(`${R}/src/main-world/capture.js`, 'utf8').replace(/^import \{ (?:readTimedtextParams|videoIdFromLocation) \} from '[^']+';[ \t]*$/gm, '');
const ID = 'AAAAAAAAAAA';
function run(path, search) {
  const posted = [];
  const href = `https://www.youtube.com${path}${search}`;
  const player = { getPlayerResponse: () => ({ videoDetails: { videoId: ID }, captions: { playerCaptionsTracklistRenderer: { captionTracks: [{ languageCode: 'en', kind: 'asr', name: { simpleText: 'English (auto)' } }, { languageCode: 'es', name: { simpleText: 'Spanish' } }], translationLanguages: [{}] } } }) };
  const doc = { readyState: 'complete', getElementById: (id) => (id === 'movie_player' ? player : null), addEventListener() {} };
  const win = { location: { origin: 'https://www.youtube.com', href, pathname: path, search }, postMessage: (m) => posted.push(JSON.parse(JSON.stringify(m))), fetch: () => Promise.resolve(new Response('{}')), XMLHttpRequest: class { open() {} send() {} addEventListener() {} } };
  const timers = [];
  const ctx = vm.createContext({ window: win, document: doc, URL, Response, TextDecoder, WeakMap, JSON, String, Promise, setTimeout: (f) => { timers.push(f); return timers.length; }, clearTimeout() {}, readTimedtextParams, videoIdFromLocation });
  vm.runInContext(SOURCE, ctx);
  for (const f of timers.splice(0)) f();
  const lists = posted.filter((m) => m.kind === 'tracklist');
  console.log(`${path}${search}`.padEnd(28), '| isolated-world current video:', videoIdFromLocation({ pathname: path, search }), '| tracklist messages:', lists.length, lists[0] ? JSON.stringify(lists[0].tracks) : '');
}
run('/watch', `?v=${ID}`);
run(`/live/${ID}`, '');
