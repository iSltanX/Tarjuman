// ف9 (2026-11-10) فوق المتحكم والتخزين والمحرّر الحقيقيين: «علّم للمراجعة» على الصف السابق للحالي في لوحة النص يكتب «أعود إليه»
// على مقطعه في الخانة المعروضة، فيظهر رقمه في المحرّر؛ و«أسمع هذه الآن» يغيّر إزاحة العرض والتراجع يعيدها. لا يُمس الملف.
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
import { A, click, ui, watchPage } from '../../unit/player/panel/harness.js';

const settle = async (area) => {
  for (let i = 0; i < 6; i++) {
    await area.flush();
    await new Promise((r) => setTimeout(r, 0));
  }
};

/**
 * الخانة 2 النشطة («ثانية»، 5 مقاطع تبدأ 1.0 و3.5 و6.0 و8.5 و11.0 ث، وإزاحتها −1.2 ث، وعلى المقطع 2 «أعود إليه»)، واللوحة مفتوحة
 * والفيديو عند 8.0 ث: الحالي الصف 3 (المقطع 4، يظهر 7.3–9.3)، والسابق له الصف 2 (المقطع 3).
 */
async function open() {
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
  await settle(area);
  page.video.silentTo(8);
  const handle = mountPanel(controller, { doc: page.doc, win: page.win, uiFonts: null });
  await settle(area);
  return { area, store, page, controller, handle, v: ui(page), now };
}

const todoOf = async (store) => (await store.getBundle(A)).slots[1].marks.filter((m) => m.kind === 'todo').map((m) => m.n);

test('تعليم الصف السابق للحالي من اللوحة يظهر في «أعود إليه» بالمحرّر برقمه', async () => {
  const { area, store, handle, v, now } = await open();
  assert.equal(handle.peek().current, 3, 'الحالي الصف 3');
  const rows = v.rows();
  assert.equal(rows[1].getAttribute('data-mark'), 'todo', 'علامة المقطع 2 الموجودة على صفها');
  rows[2].dispatchEvent({ type: 'pointerover', bubbles: true });
  click(v.q('.acts').children.find((b) => b.getAttribute('data-act') === 'mark'));
  await settle(area);
  assert.deepEqual(await todoOf(store), [2, 3]);
  assert.equal(v.rows()[2].getAttribute('data-mark'), 'todo');
  assert.match(handle.peek().note.text, /عُلِّم المقطع 3 للمراجعة/);

  const env = editorDocument({ videoId: A });
  await mountEditor(env.root, { videoId: A, store, doc: env.doc, now, slot: 2 });
  await env.flush();
  const chips = env.root.querySelectorAll('.ed-chip--todo').map((c) => c.textContent);
  assert.deepEqual(chips, ['2', '3'], '«أعود إليه» في المحرّر');
});

test('«أسمع هذه الآن» من صف يغيّر إزاحة العرض المحفوظة، والتراجع يعيدها، والملف كما هو', async () => {
  const { area, store, controller, handle, v } = await open();
  const before = structuredClone((await store.getBundle(A)).slots[1].track);
  v.rows()[2].dispatchEvent({ type: 'pointerover', bubbles: true });
  click(v.q('.acts').children.find((b) => b.getAttribute('data-act') === 'sync'));
  await settle(area);
  // المقطع 3 يبدأ 6.0 ث في الملف والفيديو عند 8.0 ⇒ الإزاحة +2.0.
  assert.equal(controller.getState().view.displayOffsetMs, 2000);
  assert.equal(handle.peek().foot.value, '+2.0', 'تذييل اللوحة');
  assert.ok(handle.peek().note.undo, 'وفي الرسالة «تراجع»');
  click(v.q('.note__act'));
  await settle(area);
  assert.equal(controller.getState().view.displayOffsetMs, -1200, 'الإزاحة السابقة');
  assert.deepEqual((await store.getBundle(A)).slots[1].track, before, 'نص الخانة وتوقيت ملفها لم يتغيرا');
});
