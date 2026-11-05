// S2: أثر الالتقاط المعيب على المتحكم الحقيقي (الحالة لا تُحدَّث ونداءات المتحكم ترمي).
import { TJ_ROOT as T } from '../_root.mjs';
const { createExtractor } = await import(`${T}/src/extract/index.js`);
const { createController } = await import(`${T}/src/content/controller.js`);
const { createStore } = await import(`${T}/src/core/store/index.js`);
const { createMemoryArea } = await import(`${T}/test/helpers/chrome-storage.js`);
const VID = 'AAAAAAAAAAA';
let current = VID;
const extractor = createExtractor({ currentVideoId: () => current, durationMs: () => 60000 });
const store = createStore({ area: createMemoryArea({ unlimited: true }) });
const controller = createController({ store, extractor, page: { title: () => 't', durationMs: () => 60000 } });
await controller.start(VID);
const body = (segs) => JSON.stringify({ events: [{ tStartMs: 0, dDurationMs: 1000, segs }] });
const msg = (b) => ({ source: 'tarjuman', v: 1, kind: 'timedtext', videoId: VID, lang: 'en', trackKind: 'manual', format: 'json3', status: 200, bodyLength: b.length, body: b });
extractor.handleMessage(msg(body([{ utf8: 'hello' }])));
console.log('بعد التقاط سليم: english=', controller.getState().english?.cues.length, 'version=', controller.getState().version);
try { extractor.handleMessage(msg(body([1, { utf8: 'x' }]))); } catch (e) { console.log('handleMessage رمى', e.constructor.name); }
const v0 = controller.getState().version;
for (const [name, fn] of [['nudgeOffset(+1)', () => controller.nudgeOffset(1)], ['setVideo(other)', () => controller.setVideo('BBBBBBBBBBB')]]) {
  try { await fn(); console.log(name, 'نجح'); } catch (e) { console.log(name, 'رمى', e.constructor.name, e.message.slice(0, 60)); }
}
console.log('الحالة: version قبل/بعد', v0, controller.getState().version, 'english ما زال يعرض', controller.getState().english?.cues.length);
