// تحقق مستقل (DS-I1 = SEC-03): الجسر الحقيقي بنافذة وهمية، والمستخرج الحقيقي، ورسالة التقاط مزيفة من «شيفرة الصفحة».
// ثم ذاكرة الانتظار: كم تحتفظ وإلى متى. بيانات اصطناعية، بلا متصفح.
// تشغيل: command node v6-bridge.mjs
import { TJ_ROOT as TJ } from '../../verify/_root.mjs';
const { installBridge } = await import(`${TJ}/src/content/bridge.js`);
const { createExtractor } = await import(`${TJ}/src/extract/index.js`);
const { createPendingBuffer } = await import(`${TJ}/src/extract/pending.js`);

const ID = 'Y-rmzh0PI3c';
const listeners = [];
const win = { location: { origin: 'https://www.youtube.com' }, addEventListener: (t, f) => listeners.push(f), removeEventListener() {} };
const otherFrame = {};
let t = 1_000_000;
const ex = createExtractor({ currentVideoId: () => ID, durationMs: () => 60_000, now: () => t });
installBridge((d) => ex.handleMessage(d), win);
const body = (text) => JSON.stringify({ events: [{ tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: text }] }, { tStartMs: 2000, dDurationMs: 2000, segs: [{ utf8: 'second line' }] }] });
const msg = (text, extra = {}) => { const b = body(text); return { source: 'tarjuman', v: 1, kind: 'timedtext', videoId: ID, lang: 'en', trackKind: 'manual', kindParam: null, capsAsr: false, hasTlang: false, format: 'json3', hasPot: true, transport: 'fetch', status: 200, bodyLength: b.length, body: b, truncated: false, ...extra }; };
const fire = (data, source = win, origin = 'https://www.youtube.com') => listeners.forEach((f) => f({ source, origin, data }));

fire(msg('Genuine caption from the player'));
const first = ex.convert('en|manual').cues[0]?.text;
fire(msg('Injected by page script'));
const afterForge = ex.convert('en|manual').cues[0]?.text;
fire(msg('From another frame'), otherFrame);
fire(msg('From another origin'), win, 'https://evil.example');
const afterOthers = ex.convert('en|manual').cues[0]?.text;
console.log(JSON.stringify({ first, afterForge, afterOthers, tracks: ex.tracks().map((x) => ({ key: x.key, ok: x.ok, cueCount: x.cueCount })), accepted: ex.diagnostics().accepted }));

console.log('\n--- ذاكرة الانتظار: التقاطات لفيديوهات أخرى (المشغّل يسبق تغيّر العنوان) ---');
const p = createPendingBuffer({ windowMs: 2000 });
const big = 'x'.repeat(1_000_000);
for (let i = 0; i < 12; i++) p.add({ videoId: `vid${String(i).padStart(8, '0')}`, body: big }, 0);
console.log(JSON.stringify({ sizeAfter12Adds: p.size, note: 'الحد 8' }));
console.log(JSON.stringify({ sizeLongAfterWindowWithoutAddOrTake: p.size, note: 'لا مؤقت: التقليم عند add أو take فقط' }));
p.take('nothing', 10_000);
console.log(JSON.stringify({ sizeAfterTake: p.size }));
