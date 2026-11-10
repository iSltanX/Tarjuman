// ف6 (2026-11-10) فوق المتحكم والتخزين والاستيراد الحقيقيين: ملف آخره «مواضع غامضة: 3، 6» ⇒ في قائمة الترجمة بعد الرفع سطره
// وزر «علّمها للمراجعة»؛ والضغط يكتب علامتي «أعود إليه» على 3 و6 برسالة فيها «تراجع»، والتراجع يزيلهما. وفي المحفوظات: رسالة
// بعد الحفظ فيها الزر، فيصير «تحتاج مراجعة» 1. وسطر «ترجمتُ 8 مقاطع» لا يُعلَّم به شيء.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../../../src/content/controller.js';
import { readImport, reviewIncoming } from '../../../src/core/import/index.js';
import { createStore } from '../../../src/core/store/index.js';
import { mountControls } from '../../../src/player/controls/index.js';
import { createLibrary } from '../../../src/pages/library/view.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { NOW, fakeExtractor, makeCues, videoRecord } from '../../helpers/fixtures.js';
import { readSrtFixture } from '../../fixtures/srt/index.js';
import { addPlayer, createFakeEnv } from '../../unit/player/overlay/fake-dom.js';
import { prepareVideo } from '../../unit/player/overlay/harness.js';
import { addBar, chooseFiles, click, inspect } from '../../unit/player/controls/harness.js';
import { buttonNamed, findAll, newDocument, settle as settleDom, textOf } from '../../unit/pages/library/fake-dom.js';

const A = 'AAAAAAAAAAA';
const clean = readSrtFixture('clean.ar.srt');
const clock = (start = Date.parse(NOW)) => {
  let t = start;
  return () => (t += 1000);
};
const settle = async (area) => {
  for (let i = 0; i < 5; i++) {
    await area.flush();
    await new Promise((r) => setTimeout(r, 0));
  }
};

async function openPage(area) {
  const env = createFakeEnv({ href: `https://www.youtube.com/watch?v=${A}` });
  env.win.URL = URL;
  env.win.Blob = Blob;
  const parts = addPlayer(env, { width: 854, height: 480 });
  prepareVideo(parts.video);
  addBar(env, parts, { width: 854 });
  const store = createStore({ area, now: clock() });
  const extractor = fakeExtractor({ videoId: A, tracks: [{ key: 'en|manual', kind: 'manual', cues: makeCues(8, { startMs: 1000, durMs: 2000, gapMs: 500, text: (i) => `line ${i}` }) }] });
  const controller = createController({ store, extractor, page: { title: () => 'محاضرة', durationMs: () => 30000 }, now: clock() });
  store.onChange((ch) => controller.handleStoreChange(ch));
  mountControls(controller, { doc: env.doc, win: env.win, importFlow: { readImport, reviewIncoming, knownVideos: async () => [] }, now: () => Date.parse(NOW) });
  await controller.start(A);
  await settle(area);
  return { env, ...parts, store, controller, ui: inspect(env, parts) };
}

const todoMarks = async (store) => (await store.getBundle(A)).slots[0].marks.filter((m) => m.kind === 'todo').map((m) => m.n);

test('المشغّل: سطر المواضع الغامضة وزرها بعد الرفع، والتعليم ثم التراجع', async () => {
  const area = createMemoryArea();
  const page = await openPage(area);
  click(page.ui.btn('upload'));
  chooseFiles(page.ui, [new File([`${clean}\nمواضع غامضة: 3، 6\n`], 'talk.ar.srt')]);
  await settle(area);
  const row = page.ui.menu().querySelector('[data-fid="ambiguous"]');
  assert.ok(row, 'السطر في قائمة الترجمة');
  assert.match(row.textContent, /ذكر النموذج مواضع غامضة \(عددها 2\): 3، 6\./);
  assert.equal((page.ui.menu().textContent.match(/ذكر النموذج مواضع غامضة/g) ?? []).length, 1, 'لا تتكرر بين الملاحظات');
  assert.deepEqual(await todoMarks(page.store), [], 'لا تعليم بلا ضغطة');
  click(page.ui.menu().querySelector('[data-fid="markAmbiguous"]'));
  await settle(area);
  assert.deepEqual(await todoMarks(page.store), [3, 6]);
  assert.equal(page.ui.menu()?.querySelector('[data-fid="ambiguous"]') ?? null, null, 'يزول السطر بعد التعليم');
  const toast = page.ui.layerHost().shadowRoot.querySelector('.toasts');
  assert.match(toast.textContent, /عُلّم للمراجعة: مقطعان\./);
  click(toast.querySelector('button.act'));
  await settle(area);
  assert.deepEqual(await todoMarks(page.store), [], 'التراجع يزيلهما');
});

test('المشغّل: الزر للخانة التي رُفع إليها الملف: يختفي حين تُعرض خانة أخرى، ولا يعلّم غيرها', async () => {
  const area = createMemoryArea();
  const page = await openPage(area);
  click(page.ui.btn('upload'));
  chooseFiles(page.ui, [new File([clean], 'first.ar.srt')]);
  await settle(area);
  // ملف ثانٍ بمواضع غامضة إلى خانة جديدة (2) تصير النشطة.
  click(page.ui.item('رفع ترجمة…'));
  chooseFiles(page.ui, [new File([`${clean}\nمواضع غامضة: 3، 6\n`], 'second.ar.srt')]);
  await settle(area);
  click(page.ui.item('حفظ'));
  await settle(area);
  assert.equal(page.controller.getState().activeSlot, 2);
  assert.ok(page.ui.menu().querySelector('[data-fid="ambiguous"]'), 'الزر للخانة 2');
  click(page.ui.menu().querySelector('[data-fid="slot:1"]'));
  await settle(area);
  assert.equal(page.ui.menu().querySelector('[data-fid="ambiguous"]'), null, 'لا يظهر والخانة 1 معروضة');
  click(page.ui.menu().querySelector('[data-fid="slot:2"]'));
  await settle(area);
  click(page.ui.menu().querySelector('[data-fid="markAmbiguous"]'));
  await settle(area);
  const b = await page.store.getBundle(A);
  assert.deepEqual(b.slots[1].marks.filter((m) => m.kind === 'todo').map((m) => m.n), [3, 6], 'على الخانة 2');
  assert.deepEqual(b.slots[0].marks, [], 'الخانة 1 كما هي');
});

test('المشغّل: «ترجمتُ 8 مقاطع» بعد الملف لا سطر ولا زر', async () => {
  const area = createMemoryArea();
  const page = await openPage(area);
  click(page.ui.btn('upload'));
  chooseFiles(page.ui, [new File([`${clean}\nترجمتُ 8 مقاطع\n`], 'talk.ar.srt')]);
  await settle(area);
  assert.equal(page.ui.menu().querySelector('[data-fid="ambiguous"]'), null);
});

test('المحفوظات: بعد الحفظ رسالة فيها «علّمها للمراجعة»، والضغط يجعل «تحتاج مراجعة» 1', async () => {
  let t = Date.parse(NOW);
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now: () => (t += 1000) });
  await store.updateVideo(A, () => ({ ...videoRecord({ videoId: A, arabic: false }), title: 'محاضرة' }));
  await store.getSettings();
  await area.flush();
  const doc = newDocument();
  const lib = createLibrary({
    store, doc, now: () => Date.parse(NOW) + 60000,
    openTab: async () => {}, openPage: async () => {}, saveFile: async () => ({ ok: true }), clipboardWrite: async () => {},
    pickFiles: async () => [new File([`${clean}\nمواضع غامضة: 3، 6\n`], 'talk.ar.srt')], diagnosticsText: async () => '{}', confirm: async () => true,
    setTimer: () => 0, clearTimer: () => {},
  });
  doc.body.append(lib.root);
  await lib.load();
  buttonNamed(lib.root, 'رفع ترجمة: محاضرة').click();
  await settleDom(30);
  const toast = findAll(lib.root, (e) => e.classList?.contains('tj-toast') && /ذكر النموذج مواضع غامضة/.test(textOf(e)))[0];
  assert.ok(toast, 'رسالة السطر بعد الحفظ');
  findAll(toast, (e) => e.tagName === 'button' && textOf(e) === 'علّمها للمراجعة')[0].click();
  await settleDom(30);
  const b = await store.getBundle(A);
  assert.deepEqual(b.slots[0].marks.filter((m) => m.kind === 'todo').map((m) => m.n), [3, 6]);
  const review = findAll(lib.root, (e) => e.tagName === 'button' && /^تحتاج مراجعة/.test(textOf(e)))[0];
  assert.match(textOf(review), /1$/, '«تحتاج مراجعة» 1');
});
