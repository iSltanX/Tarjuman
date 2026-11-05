// تحقق مستقل (DS-I3 = SEC-08): jumpToVideo بواجهة tabs وهمية؛ كم تبويبًا يُسأل، وما الرسالة، وما يحمله الرد الحقيقي
// (buildVideoStateReply) من حقول لا يحتاجها القفز. بلا متصفح.
// تشغيل: command node v8-seek.mjs
const TJ = '$SCRATCH/tj';
const { jumpToVideo, MAX_TABS } = await import(`${TJ}/src/ui/seek.js`);
const { buildVideoStateReply } = await import(`${TJ}/src/core/model/messages.js`);

const ID = 'Y-rmzh0PI3c';
const state = { videoId: ID, title: 'عنوان الفيديو', loading: false, captured: [], saved: { arabic: { fileName: 'ملفي-الخاص.srt', original: [{ n: 1 }], current: null }, english: [], fingerprints: [] }, view: { displayOffsetMs: 0, displayMode: 'ar' }, slots: [{ n: 1, filled: true, active: true, name: 'ترجمة صديقي' }, { n: 2, filled: false, active: false, name: null }, { n: 3, filled: false, active: false, name: null }], captureIssue: null };
let reply;
try { reply = buildVideoStateReply(state, { overlay: 'mounted', controls: 'mounted' }); } catch (e) { reply = { v: 1, ok: true, watch: true, videoId: ID, title: state.title, error: String(e) }; }
console.log(JSON.stringify({ replyKeys: Object.keys(reply), title: reply.title, fileName: reply.arabic?.fileName ?? null, slotNames: reply.slots?.map((s) => s.name) ?? null }));

const asked = [];
const tabsApi = (n, matchIndex) => ({
  query: async () => Array.from({ length: n }, (_, i) => ({ id: i + 1, windowId: 1, active: false, lastAccessed: i })),
  sendMessage: async (id, m) => { asked.push({ id, type: m.type }); if (m.type === 'tj:seek') return { v: 1, ok: true, ms: 5000 }; return id === matchIndex ? reply : undefined; },
  update: async () => ({}),
  create: async () => ({ id: 999 }),
});
let r = await jumpToVideo({ videoId: ID, ms: 5000 }, { tabs: tabsApi(5, 3), windows: null, timeoutMs: 50 });
console.log(JSON.stringify({ tabs: 5, result: r, stateRequests: asked.filter((a) => a.type !== 'tj:seek').length, types: [...new Set(asked.map((a) => a.type))] }));
asked.length = 0;
r = await jumpToVideo({ videoId: ID, ms: 5000 }, { tabs: tabsApi(205, 203), windows: null, timeoutMs: 50 });
console.log(JSON.stringify({ tabs: 205, videoTabAt: 203, MAX_TABS, result: r, stateRequests: asked.filter((a) => a.type !== 'tj:seek').length }));
