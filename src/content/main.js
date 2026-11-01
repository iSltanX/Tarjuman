// نقطة دخول سكربت المحتوى (ISOLATED، document_start) — مجمَّدة بعد P2 (عقد interfaces §٤). تركّب
// الوحدات وحسب: الجسر ← المستخرج ← المتحكم ← نقطتا التركيب، والتخزين وأحداثه، ورد نافذة الأيقونة.
// لا منطق منتج هنا؛ كل مرحلة لاحقة تعمل خلف واجهتها دون لمس هذا الملف.
import { installBridge } from './bridge.js';
import { createController } from './controller.js';
import { installMessageHandler } from './messages.js';
import { createExtractor } from '../extract/index.js';
import { createStore } from '../core/store/index.js';
import { mountOverlay } from '../player/overlay/index.js';
import { mountControls } from '../player/controls/index.js';
import { isLiveNow, mainVideoDurationMs, videoTitle, watchCurrentVideo } from '../player/youtube-dom.js';

/* global __TJ_DEV__ */

let tracker = null;
const extractor = createExtractor({
  currentVideoId: () => (tracker ? tracker.current() : null),
  durationMs: () => mainVideoDurationMs(),
  isLive: () => isLiveNow(),
});
// الجسر أولًا: سكربت MAIN قد يرسل الالتقاط قبل أن يكتمل غيره.
installBridge((msg) => extractor.handleMessage(msg));

const store = createStore();
const controller = createController({
  store,
  extractor,
  page: { title: () => videoTitle(), durationMs: () => mainVideoDurationMs() },
});

tracker = watchCurrentVideo({
  onChange: (id) => {
    controller.setVideo(id);
    extractor.setVideo(id);
  },
});
store.onChange((change) => controller.handleStoreChange(change));

const mounted = { overlay: mountOverlay(controller), controls: mountControls(controller) };
installMessageHandler({ controller, mounted });
controller.start(tracker.current());

// بناء التطوير وحده (npm run build:dev): خطاف للحزام الحي في العالم المعزول، لا تراه الصفحة.
if (typeof __TJ_DEV__ !== 'undefined' && __TJ_DEV__) {
  globalThis.__tarjuman = { controller, extractor, store, mounted };
}
