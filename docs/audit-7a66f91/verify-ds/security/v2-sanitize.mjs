// تحقق مستقل (TJ-39): منقّي التشخيص وتقريرا التشخيص بمدخلات اصطناعية. لا متصفح ولا شبكة.
// تشغيل: command node v2-sanitize.mjs
import { TJ_ROOT as TJ } from '../../verify/_root.mjs';
const { sanitizeText } = await import(`${TJ}/src/core/diagnostics/sanitize.js`);
const { createDiagnosticReport } = await import(`${TJ}/src/core/diagnostics/report.js`);
const { pageReport } = await import(`${TJ}/src/pages/popup/status.js`);
const { TjError, toErrorInfo, messageFor } = await import(`${TJ}/src/core/errors/index.js`);

const ID = 'Y-rmzh0PI3c';
console.log('=== 1) sanitizeText: ما يُحذف وما يبقى ===');
for (const s of [
  `https://www.youtube.com/watch?v=${ID}`, `youtu.be/${ID}`, `m.youtube.com/watch?v=${ID}`,
  `i.ytimg.com/vi/${ID}/mqdefault.jpg`, `https://i.ytimg.com/vi/${ID}/mqdefault.jpg`, `youtube-nocookie.com/embed/${ID}`,
  `v=${ID}`, ID, 'moz-extension://0a1b2c3d-1111-2222-3333-444455556666/pages/library/index.html',
  `chrome-extension://abcdefghijklmnopabcdefghijklmnop/pages/editor/index.html?v=${ID}`,
  `file:///Users/someone/Downloads/${ID}.ar.srt`, '/Users/someone/Downloads/x.srt', 'C:\\Users\\Someone\\x.srt', 'me@example.com',
]) console.log(JSON.stringify({ in: s, out: sanitizeText(s), unchanged: sanitizeText(s) === s }));

console.log('\n=== 2) createDiagnosticReport وحده: هل يُسقط مفاتيح المعرّف واسم الخانة؟ ===');
const raw = { a: { title: 'T', fileName: 'f.srt', videoId: ID, currentVideoId: ID, lastVideoId: ID, name: 'اسم خانتي', detail: `خطأ عند ${ID}` } };
console.log(JSON.stringify(createDiagnosticReport({ version: '1.1.0', browser: 'X', at: '2026-01-01T00:00:00Z', sections: raw }).sections));

console.log('\n=== 3) pageReport (النافذة): الاستبعاد بالمفتاح، والقيم الحرة ===');
const sections = {
  controller: { videoId: ID, extractor: { currentVideoId: ID, tracks: [{ key: 'en|manual' }] }, lastListenerError: toErrorInfo(new Error(`boom ${ID}`)) },
  mounted: { controls: { state: 'mounted', session: { lastCode: 'CT_RENDER_FAILED', lastDetail: `TypeError: x ${ID}` } } },
};
const reply = { v: 1, ok: true, watch: true, videoId: ID, title: 'عنوان سري', loading: false, english: { captured: [], saved: [] }, arabic: { fileName: `${ID}.ar.srt`, cueCount: 3, edited: false, matched: true }, view: { displayOffsetMs: 0, displayMode: 'ar' }, mounted: { overlay: 'mounted', controls: 'mounted' }, slots: [{ n: 1, filled: true, active: true, name: 'اسم خانتي' }, { n: 2, filled: false, active: false, name: null }, { n: 3, filled: false, active: false, name: null }], capture: { state: 'none', count: 0, code: null }, tools: { overlay: 'mounted', controls: 'mounted', code: null } };
const out = pageReport({ reply, sections, version: '1.1.0', browser: 'X', at: '2026-01-01T00:00:00Z' });
const occurrences = out.split(ID).length - 1;
console.log(JSON.stringify({ idOccurrences: occurrences, title: out.includes('عنوان سري'), slotName: out.includes('اسم خانتي'), fileName: out.includes('.ar.srt') }));
for (const line of out.split('\n').filter((l) => l.includes(ID))) console.log('  ', line.trim());

console.log('\n=== 4) هل تحمل رسائل الأخطاء الحقيقية (القوالب) معرّفًا أو اسم ملف؟ عيّنة: TjError برمز تخزين ===');
const e = new TjError('ST_CORRUPT_RECORD', { detail: `bundle:${ID} rev` });
console.log(JSON.stringify({ name: e.name, message: e.message, detail: e.detail, asLastDetail: `${e.name}: ${e.message}`.includes(ID) }));
void messageFor;
