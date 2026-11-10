// ف5 (2026-11-10): لصق ناتج النموذج بدل حفظه ملفًا. النافذة ترسل النص الملصوق (من حدث اللصق وحده) إلى صفحة الفيديو برسالة
// tj:paste-import، فيمر بخط الرفع نفسه في المشغّل: لصق محتوى fenced.ar.srt يعطي الملخص نفسه عند رفعه ملفًا («مطابق للأصل»
// وملاحظة إزالة السياج). ولا قراءة للحافظة برمجيًا (قاعدة الفحص الثابت)، ولا إذن جديد في البيان.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../../../src/content/controller.js';
import { installMessageHandler } from '../../../src/content/messages.js';
import { readImport, reviewIncoming } from '../../../src/core/import/index.js';
import { MAX_PASTE_CHARS, isPasteImportRequest, pasteImportRequest } from '../../../src/core/model/messages.js';
import { createStore } from '../../../src/core/store/index.js';
import { sendPaste } from '../../../src/pages/popup/status.js';
import { mountControls } from '../../../src/player/controls/index.js';
import { codeViolations } from '../../../scripts/code-rules.mjs';
import { createFakeChrome, createMemoryArea } from '../../helpers/chrome-storage.js';
import { NOW, fakeExtractor } from '../../helpers/fixtures.js';
import { baseCues, baseFingerprint, readSrtFixture } from '../../fixtures/srt/index.js';
import { addPlayer, createFakeEnv } from '../../unit/player/overlay/fake-dom.js';
import { prepareVideo } from '../../unit/player/overlay/harness.js';
import { addBar, chooseFiles, click, inspect } from '../../unit/player/controls/harness.js';

const A = 'AAAAAAAAAAA';
const fenced = readSrtFixture('fenced.ar.srt');
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
  const extractor = fakeExtractor({ videoId: A, tracks: [{ key: 'en|manual', kind: 'manual', cues: baseCues() }] });
  const controller = createController({ store, extractor, page: { title: () => 'محاضرة', durationMs: () => 30000 }, now: clock() });
  store.onChange((ch) => controller.handleStoreChange(ch));
  const controls = mountControls(controller, { doc: env.doc, win: env.win, importFlow: { readImport, reviewIncoming, knownVideos: async () => [] }, now: () => Date.parse(NOW) });
  await controller.start(A);
  await controller.recordExport({ trackKey: 'en|manual', fingerprint: baseFingerprint({ videoId: A, id: 'fp_paste00001' }) });
  await settle(area);
  return { env, ...parts, store, controller, controls, ui: inspect(env, parts) };
}

/** ما تقوله قائمة الترجمة بعد الرفع: الملخص والملاحظة. */
const summary = (page) => page.ui.menu().textContent;

test('الرسالة: نص غير فارغ في الحد ومعرّف صالح، ولا مفتاح زائد', () => {
  assert.equal(isPasteImportRequest(pasteImportRequest(A, fenced)), true);
  assert.equal(isPasteImportRequest(pasteImportRequest(A, '')), false, 'فارغ');
  assert.equal(isPasteImportRequest(pasteImportRequest('bad', fenced)), false, 'معرّف غير صالح');
  assert.equal(isPasteImportRequest({ ...pasteImportRequest(A, fenced), extra: 1 }), false);
  assert.equal(isPasteImportRequest(pasteImportRequest(A, 'x'.repeat(MAX_PASTE_CHARS + 1))), false, 'فوق الحد');
});

test('اللصق في المشغّل يعطي الملخص نفسه عند رفع الملف: «مطابق للأصل» وملاحظة إزالة السياج', async () => {
  const fileArea = createMemoryArea();
  const viaFile = await openPage(fileArea);
  click(viaFile.ui.btn('upload'));
  chooseFiles(viaFile.ui, [new File([fenced], 'fenced.srt')]);
  await settle(fileArea);
  const fromFile = summary(viaFile);
  assert.match(fromFile, /مطابق للأصل/);
  assert.match(fromFile, /سياج|علامات كتلة النص/);

  const pasteArea = createMemoryArea();
  const viaPaste = await openPage(pasteArea);
  const r = viaPaste.controls.importText(fenced);
  assert.deepEqual(r, { ok: true });
  await settle(pasteArea);
  const fromPaste = summary(viaPaste).replace('نص ملصوق', 'fenced.srt');
  assert.equal(fromPaste, fromFile, 'الملخص نفسه (عدا اسم الملف)');
  assert.equal((await viaPaste.store.getBundle(A)).slots[0].track.original.length, 8);
});

test('اللصق والمشغّل مشغول (كتابة في حقل القائمة): «busy» ولا رفع ولا إغلاق لما هو مفتوح', async () => {
  const area = createMemoryArea();
  const page = await openPage(area);
  const layer = page.ui.layerHost().shadowRoot.querySelector('.layer');
  layer.setAttribute('data-typing', '');
  assert.deepEqual(page.controls.importText(fenced), { ok: false, code: 'busy' });
  await settle(area);
  assert.equal((await page.store.getBundle(A))?.slots?.[0]?.track ?? null, null, 'لا شيء محفوظ');
  layer.removeAttribute('data-typing');
  assert.deepEqual(page.controls.importText(fenced), { ok: true });
});

test('معالج الصفحة: النص إلى خط الرفع للفيديو المعروض وحده، والرسالة الباطلة والفيديو الآخر مرفوضان', async () => {
  const fake = createFakeChrome();
  const got = [];
  const state = { videoId: A };
  installMessageHandler({ controller: { getState: () => state }, mounted: { overlay: { state: 'mounted' }, controls: { state: 'mounted', importText: (t) => { got.push(t); return { ok: true }; } } }, runtime: fake.chrome.runtime });
  assert.deepEqual(await fake.dispatchMessage(pasteImportRequest(A, fenced)), { v: 1, ok: true });
  assert.deepEqual(got, [fenced]);
  assert.equal((await fake.dispatchMessage(pasteImportRequest('BBBBBBBBBBB', fenced))).code, 'TJ_WRONG_VIDEO');
  assert.equal((await fake.dispatchMessage({ ...pasteImportRequest(A, fenced), text: 5 })).code, 'TJ_BAD_MESSAGE');
  assert.equal(got.length, 1);
});

test('النافذة: sendPaste يرسل إلى التبويب النشط، والفارغ والكبير يُقالان قبل الإرسال، والرد الفاشل برمزه', async () => {
  const sent = [];
  const tabs = (answer) => ({ query: async () => [{ id: 7 }], sendMessage: async (id, msg) => { sent.push([id, msg.type, msg.text.length]); return answer; } });
  assert.deepEqual(await sendPaste({ videoId: A, text: fenced }, { tabs: tabs({ v: 1, ok: true }) }), { ok: true });
  assert.deepEqual(sent, [[7, 'tj:paste-import', fenced.length]]);
  assert.deepEqual(await sendPaste({ videoId: A, text: '  ' }, { tabs: tabs({ v: 1, ok: true }) }), { ok: false, code: 'empty' });
  assert.deepEqual(await sendPaste({ videoId: A, text: 'x'.repeat(MAX_PASTE_CHARS + 1) }, { tabs: tabs({ v: 1, ok: true }) }), { ok: false, code: 'tooLarge' });
  assert.deepEqual(await sendPaste({ videoId: A, text: fenced }, { tabs: tabs({ v: 1, ok: false, code: 'busy' }) }), { ok: false, code: 'busy' });
  assert.deepEqual(await sendPaste({ videoId: A, text: fenced }, { tabs: tabs(undefined) }), { ok: false, code: 'failed' });
  assert.equal(sent.length, 3, 'الفارغ والكبير لم يُرسلا');
});

test('لا قراءة للحافظة برمجيًا: القاعدة تمسك readText وread وclipboardRead وصيغها الملتوية، ولا تمس الكتابة ولا حدث اللصق', () => {
  assert.ok(codeViolations('const t = await navigator.clipboard.readText();').some((v) => v.id === 'clipboard-read'));
  assert.ok(codeViolations('navigator.clipboard.read()').some((v) => v.id === 'clipboard-read'));
  // من مراجعة المرحلة 4: الاسم المستعار والأقواس والتفكيك وexecCommand واستعلام الإذن.
  for (const src of ['const c = navigator.clipboard; c.readText();', 'navigator.clipboard["readText"]()', 'const { readText } = navigator.clipboard;', 'document.execCommand("paste")', "navigator.permissions.query({ name: 'clipboard-read' })"]) {
    assert.ok(codeViolations(src).some((v) => v.id === 'clipboard-read'), src);
  }
  assert.ok(!codeViolations('navigator.clipboard.writeText(text); ev.clipboardData.getData("text/plain")').some((v) => v.id === 'clipboard-read'));
});
