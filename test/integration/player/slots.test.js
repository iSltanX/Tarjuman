// تكامل الإصدار الثاني في المشغّل (P12): الأدوات والطبقة فوق المتحكم والتخزين الحقيقيين ووحدات الاستيراد والمحاذاة
// الحقيقية. الرفع إلى خانة ثانية يجعلها النشطة، والتبديل من 1 2 3 ينعكس على الطبقة بإزاحة كل ترجمة دون إعادة تحميل
// (P12-AC1)، والإلغاء في أي خطوة لا يغيّر بصمة التخزين (P12-AC2)، و«إبقاء تعديلاتي» يحفظ النسخة الحالية فوق الأصل الجديد،
// و«علّم للمراجعة» يكتب علامة مرتبطة بالمقطع الظاهر ويمحوها التراجع (P12-AC5)، وقرينة الاسم من المحفوظات الحقيقية.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../../../src/content/controller.js';
import { readImport, reviewIncoming } from '../../../src/core/import/index.js';
import { withArabicEdit } from '../../../src/core/model/transitions.js';
import { createVideoRecord } from '../../../src/core/model/video.js';
import { createStore } from '../../../src/core/store/index.js';
import { mountControls } from '../../../src/player/controls/index.js';
import { mountOverlay } from '../../../src/player/overlay/index.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { NOW, fakeExtractor, makeCues } from '../../helpers/fixtures.js';
import { addPlayer, createFakeEnv } from '../../unit/player/overlay/fake-dom.js';
import { prepareVideo } from '../../unit/player/overlay/harness.js';
import { addBar, chooseFiles, click, inspect } from '../../unit/player/controls/harness.js';
import { writeSrt } from '../../../src/core/srt/writer.js';

const A = 'AAAAAAAAAAA';
const B = 'BBBBBBBBBBB';
const EN = makeCues(6, { text: (i) => `line ${i}` });
const AR1 = makeCues(6, { text: (i) => `أولى ${i}` });
const AR2 = makeCues(6, { text: (i) => `ثانية ${i}` });

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
const srtFile = (cues, name) => new File([writeSrt(cues)], name, { type: 'application/x-subrip' });
/** بصمة التخزين: كل المفاتيح وقيمها كما هي. */
const print = (area) => JSON.stringify(area.dump());

async function openPage(area) {
  const env = createFakeEnv({ href: `https://www.youtube.com/watch?v=${A}` });
  env.win.URL = URL;
  env.win.Blob = Blob;
  const parts = addPlayer(env, { width: 854, height: 480 });
  prepareVideo(parts.video);
  addBar(env, parts, { width: 854 });
  const store = createStore({ area, now: clock() });
  const extractor = fakeExtractor({ videoId: A, tracks: [{ key: 'en|manual', kind: 'manual', cues: EN }] });
  const controller = createController({ store, extractor, page: { title: () => 'محاضرة تجريبية', durationMs: () => 30000 }, now: clock() });
  store.onChange((ch) => controller.handleStoreChange(ch));
  const importFlow = {
    readImport, reviewIncoming,
    knownVideos: async () => (await store.listIndex()).map((e) => ({ videoId: e.videoId, title: e.title })),
  };
  const controls = mountControls(controller, { doc: env.doc, win: env.win, importFlow, now: () => Date.parse(NOW) });
  const overlay = mountOverlay(controller, { doc: env.doc, win: env.win, fonts: null });
  await controller.start(A);
  await settle(area);
  const ui = inspect(env, parts);
  const shown = () => (overlay.peek(false)?.lines ?? []).map((l) => l.text);
  return { env, ...parts, store, controller, controls, overlay, ui, shown };
}

async function upload(page, area, file, { target = null, save = true } = {}) {
  if (page.controller.getState().arabic) {
    if (!page.ui.menuOpen()) click(page.ui.btn('upload'));
    click(page.ui.item('رفع ترجمة…') ?? page.ui.item('استبدال…'));
  } else {
    click(page.ui.btn('upload'));
  }
  chooseFiles(page.ui, [file]);
  await settle(area);
  if (page.ui.menuLabel() === 'الترجمة العربية') return;
  if (target) click(page.ui.menu().querySelector(`[data-fid="target:${target}"]`));
  if (save) {
    click(page.ui.item('حفظ') ?? page.ui.item('استبدال'));
    await settle(area);
  }
}
const slotButton = (page, n) => page.ui.menu().querySelector(`[data-fid="slot:${n}"]`);

test('رفع ترجمة ثانية إلى الخانة 2 يجعلها النشطة، والتبديل من 1 2 3 ينعكس على الطبقة بإزاحة كل ترجمة دون إعادة تحميل', async () => {
  const area = createMemoryArea();
  const page = await openPage(area);
  await upload(page, area, srtFile(AR1, 'one.ar.srt'));
  assert.equal(page.controller.getState().activeSlot, 1, 'أول رفع: الخانة 1 مباشرة');
  click(page.ui.btn('plus'));
  click(page.ui.btn('plus'));
  await settle(area);
  assert.equal(page.controller.getState().view.displayOffsetMs, 1000);

  await upload(page, area, srtFile(AR2, 'two.ar.srt'));
  const s = page.controller.getState();
  assert.equal(s.activeSlot, 2, 'المضافة إلى خانة فارغة تصبح النشطة');
  assert.equal(s.view.displayOffsetMs, 0, 'الجديدة بإزاحتها صفرًا');
  page.video.seekTo(1.5);
  assert.deepEqual(page.shown(), ['ثانية 1']);

  click(slotButton(page, 1));
  await settle(area);
  assert.equal(page.controller.getState().activeSlot, 1);
  assert.equal(page.ui.btn('badge').textContent, '+1.0', 'الأولى بإزاحتها المحفوظة');
  page.video.seekTo(2.5);
  assert.deepEqual(page.shown(), ['أولى 1'], 'الطبقة تعرض الأولى بلا إعادة تحميل');
  assert.equal((await page.store.getBundle(A)).active, 1, 'الاختيار محفوظ للفيديو');

  click(page.ui.layerHost().shadowRoot.querySelector('.toasts button.act'));
  await settle(area);
  assert.equal(page.controller.getState().activeSlot, 2, 'التراجع يعيد الثانية');
  page.video.seekTo(1.5);
  assert.deepEqual(page.shown(), ['ثانية 1']);
});

test('الإلغاء في أي خطوة لا يغيّر بصمة التخزين: منتقٍ بلا اختيار، والتأكيد بـ«إلغاء» وبـEsc وبالنقر خارجه', async () => {
  const area = createMemoryArea();
  const page = await openPage(area);
  await upload(page, area, srtFile(AR1, 'one.ar.srt'));
  const before = print(area);

  click(page.ui.item('رفع ترجمة…'));
  await settle(area);
  assert.equal(print(area), before, 'المنتقي وحده');

  for (const how of ['cancel', 'escape', 'outside']) {
    await upload(page, area, srtFile(AR2, 'two.ar.srt'), { target: 1, save: false });
    assert.equal(page.ui.menuLabel(), 'استبدال الترجمة؟');
    if (how === 'cancel') click(page.ui.item('إلغاء'));
    else if (how === 'escape') page.ui.menu().querySelector('button').dispatchEvent({ type: 'keydown', key: 'Escape', bubbles: true });
    else page.env.doc.body.dispatchEvent({ type: 'pointerdown', bubbles: true });
    await settle(area);
    assert.equal(print(area), before, how);
    if (!page.ui.menuOpen()) click(page.ui.btn('upload'));
  }
  assert.equal(page.controller.getState().arabic.fileName, 'one.ar.srt');
});

test('«إبقاء تعديلاتي»: تُحفظ النسخة الحالية فوق الأصل الجديد، والسابقة تحفظ ما استُبدل', async () => {
  const area = createMemoryArea();
  const page = await openPage(area);
  await upload(page, area, srtFile(AR1, 'one.ar.srt'));
  // تعديل يدوي في المحرّر (سياق آخر) على المقطع 2.
  const edited = AR1.map((c, i) => (i === 1 ? { ...c, text: 'عدّلتها بيدي' } : c));
  await page.store.updateVideo(A, (rec) => withArabicEdit(rec, { cues: edited }, NOW));
  await settle(area);
  assert.equal(page.controller.getState().arabic.edited, true);

  const fresh = AR1.map((c, i) => (i === 4 ? { ...c, text: 'من الملف الجديد' } : c));
  await upload(page, area, srtFile(fresh, 'fixed.ar.srt'), { target: 1, save: false });
  assert.match(page.ui.menuText(), /سيُستبدل تعديل يدوي واحد/);
  const keep = page.ui.field('keep');
  keep.checked = true;
  keep.dispatchEvent({ type: 'change', target: keep });
  click(page.ui.item('استبدال'));
  await settle(area);
  const rec = (await page.store.getBundle(A)).record;
  assert.equal(rec.arabic.fileName, 'fixed.ar.srt');
  assert.equal(rec.arabic.original[4].text, 'من الملف الجديد');
  assert.deepEqual(rec.arabic.current.map((c) => c.text).slice(0, 5), ['أولى 1', 'عدّلتها بيدي', 'أولى 3', 'أولى 4', 'من الملف الجديد']);
  assert.equal((await page.store.getBundle(A)).previous.track.current[1].text, 'عدّلتها بيدي', 'السابقة بتعديلاتها');
});

test('«علّم للمراجعة» يكتب علامة مرتبطة بالمقطع الظاهر في النشطة، والتراجع يمحوها', async () => {
  const area = createMemoryArea();
  const page = await openPage(area);
  await upload(page, area, srtFile(AR1, 'one.ar.srt'));
  page.video.seekTo(6.5); // المقطع 3 من 6000 إلى 8000
  click(page.ui.item('علّم للمراجعة'));
  await settle(area);
  const b = await page.store.getBundle(A);
  assert.equal(b.slots[0].marks.length, 1);
  assert.equal(b.slots[0].marks[0].n, 3);
  assert.equal(b.slots[0].marks[0].kind, 'todo');
  assert.equal(page.video.writes, 0, 'لا قفز');
  click(page.ui.layerHost().shadowRoot.querySelector('.toasts button.act'));
  await settle(area);
  assert.equal((await page.store.getBundle(A)).slots[0].marks.length, 0);
});

test('قرينة الاسم من المحفوظات الحقيقية: ملف باسم فيديو آخر محفوظ يُنبَّه بعنوانه ولا يُحفظ قبل التأكيد', async () => {
  const area = createMemoryArea();
  const seeded = createStore({ area, now: clock() });
  await seeded.updateVideo(B, () => createVideoRecord({ videoId: B, title: 'محاضرة عن البحر', now: NOW }));
  const page = await openPage(area);
  const before = print(area);
  await upload(page, area, srtFile(AR1, `${B}.en.manual.normal.ar.srt`), { save: false });
  assert.equal(page.ui.menuLabel(), 'رفع ترجمة');
  assert.ok(page.ui.menuText().includes('الاسم يشير إلى فيديو آخر · محاضرة عن البحر'));
  assert.equal(print(area), before, 'لا كتابة قبل التأكيد');
  click(page.ui.item('حفظ'));
  await settle(area);
  assert.equal(page.controller.getState().arabic.fileName, `${B}.en.manual.normal.ar.srt`, 'تنبيه لا رفض');
});
