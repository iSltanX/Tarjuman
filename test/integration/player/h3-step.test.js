// ح3 (2026-11-10): خطوة أزرار ± تُضبط حيث تُستعمل (قائمة التوقيت في المشغّل وتذييل لوحة النص)، وحُذف قسم «التوقيت» من
// الإعدادات. تغيير الخطوة من المشغّل (controller.updateSettings كما تفعل قائمة التوقيت) يظهر في تذييل اللوحة، والمحرّر يبدأ به.
// مقارنة العقد بـassert.ok(a === b) لا assert.equal (رأس fake-dom.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../../../src/content/controller.js';
import { createStore } from '../../../src/core/store/index.js';
import { mountEditor } from '../../../src/pages/editor/app.js';
import { mountPanel } from '../../../src/player/panel/index.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { editorDocument } from '../../helpers/editor-dom.js';
import { NOW, fakeExtractor, makeCues } from '../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../helpers/fixtures-v2.js';
import { A, watchPage } from '../../unit/player/panel/harness.js';

const settle = async (area) => {
  for (let i = 0; i < 6; i++) {
    await area.flush();
    await new Promise((r) => setTimeout(r, 0));
  }
};

test('تغيير الخطوة من المشغّل يظهر في تذييل اللوحة وفي بداية المحرّر', async () => {
  const area = createMemoryArea({ unlimited: true });
  let t = Date.parse(NOW);
  const now = () => (t += 1000);
  const store = createStore({ area, now });
  await seedBundle(store, sampleBundle({ videoId: A, active: 2 }));
  const page = watchPage();
  const controller = createController({
    store, now,
    extractor: fakeExtractor({ videoId: A, tracks: [{ key: 'en|manual', kind: 'manual', cues: makeCues(5, { text: (i) => `line ${i}` }) }] }),
    page: { title: () => 'محاضرة', durationMs: () => 30000 },
  });
  store.onChange((ch) => controller.handleStoreChange(ch));
  await controller.start(A);
  await controller.updatePrefs({ ui: { panelOpen: true } });
  const handle = mountPanel(controller, { doc: page.doc, win: page.win, uiFonts: null });
  await settle(area);
  const checked = () => handle.peek().foot.step.find((x) => x.checked)?.value;
  assert.equal(checked(), '500', 'الافتراضي 0.5 ث');

  await controller.updateSettings({ offsetStepMs: 1000 });
  await settle(area);
  assert.equal(checked(), '1000', 'تذييل اللوحة يتبع');
  assert.equal((await store.getSettings()).offsetStepMs, 1000, 'محفوظة');

  const env = editorDocument({ videoId: A });
  await mountEditor(env.root, { videoId: A, store, doc: env.doc, now, slot: 2 });
  await env.flush();
  const stepSel = env.root.querySelectorAll('select').find((s) => s.getAttribute('aria-label') === 'خطوة الأزرار');
  assert.ok(stepSel, 'قائمة خطوة المحرّر');
  assert.equal(stepSel.value, '1000', 'المحرّر يبدأ بالخطوة المحفوظة');
});
