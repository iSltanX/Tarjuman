// تكامل المشغّل (P6): الأدوات والطبقة فوق المتحكم والتخزين الحقيقيين ووحدتي التصدير والاستيراد الحقيقيتين، على
// الـDOM الوهمي. الدورة كاملة: تحميل SRT بالبصمة ← «ترجمة» ← رفع ومقارنة ← عرض فوق الفيديو ← ± ووضع العرض محفوظان
// لكل فيديو ويُستعادان بعد إعادة التحميل والتنقل (P6-AC6) ← استبدال بتأكيد يصفّر الإزاحة. المتصفح الفعلي في test/live.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../../../src/content/controller.js';
import { buildExport, instructions } from '../../../src/core/export/index.js';
import { saveFile } from '../../../src/core/save/index.js';
import { createStore } from '../../../src/core/store/index.js';
import { mountControls } from '../../../src/player/controls/index.js';
import { mountOverlay } from '../../../src/player/overlay/index.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { NOW, fakeExtractor, makeCues } from '../../helpers/fixtures.js';
import { addPlayer, createFakeEnv } from '../../unit/player/overlay/fake-dom.js';
import { prepareVideo } from '../../unit/player/overlay/harness.js';
import { addBar, chooseFiles, click, inspect } from '../../unit/player/controls/harness.js';

const A = 'AAAAAAAAAAA';
const B = 'BBBBBBBBBBB';
const EN = makeCues(6, { text: (i) => `line ${i}` });

const clock = (start = Date.parse(NOW)) => {
  let t = start;
  return () => (t += 1000);
};
const settle = async (area) => {
  for (let i = 0; i < 4; i++) {
    await area.flush();
    await new Promise((r) => setTimeout(r, 0));
  }
};

/** صفحة مشاهدة كاملة على تخزين مشترك (إعادة التحميل = صفحة جديدة على التخزين نفسه). */
async function openPage(area, { videoId = A } = {}) {
  const env = createFakeEnv({ href: `https://www.youtube.com/watch?v=${videoId}` });
  env.win.URL = URL;
  env.win.Blob = Blob;
  const parts = addPlayer(env, { width: 854, height: 480 });
  prepareVideo(parts.video);
  const bar = addBar(env, parts, { width: 854 });
  const store = createStore({ area, now: clock() });
  const extractor = fakeExtractor({ videoId, tracks: [{ key: 'en|manual', kind: 'manual', cues: EN }] });
  const controller = createController({ store, extractor, page: { title: () => 'محاضرة تجريبية', durationMs: () => 30000 }, now: clock() });
  store.onChange((ch) => controller.handleStoreChange(ch));
  const files = [];
  // saveFile الحقيقي: بلا واجهة تنزيلات ولا عامل هنا فيرجع إلى Blob (مسار الاحتياط نفسه في المتصفح).
  const exportFlow = {
    buildExport,
    instructions,
    saveFile(file, e) {
      files.push(file);
      return saveFile(file, e);
    },
  };
  const controls = mountControls(controller, { doc: env.doc, win: env.win, exportFlow, now: () => Date.parse(NOW) });
  const overlay = mountOverlay(controller, { doc: env.doc, win: env.win, fonts: null });
  await controller.start(videoId);
  await settle(area);
  const ui = inspect(env, parts);
  const shown = () => (overlay.peek(false)?.lines ?? []).map((l) => l.text);
  /** تنقّل يوتيوب إلى فيديو آخر كما يراه main.js: العنوان والحدث ثم المتحكم والمستخرج. */
  const navigate = async (id) => {
    env.doc.dispatchEvent({ type: 'yt-navigate-start' });
    env.win.navigate(`https://www.youtube.com/watch?v=${id}`);
    env.doc.dispatchEvent({ type: 'yt-navigate-finish' });
    controller.setVideo(id);
    extractor.setVideo(id);
    await settle(area);
  };
  return { env, ...parts, ...bar, store, extractor, controller, controls, overlay, files, ui, shown, navigate };
}

const record = (area, id = A) => area.dump()[`video:${id}`];
const translate = (text) => text.replace(/line (\d+)/g, 'سطر $1');

test('الدورة كاملة: تحميل بالبصمة ثم رفع الترجمة ومقارنتها ثم عرضها فوق الفيديو', async () => {
  const area = createMemoryArea();
  const page = await openPage(area);
  click(page.ui.btn('download'));
  click(page.ui.item('تنزيل الملف'));
  await settle(area);
  assert.equal(page.files.length, 1);
  assert.equal(page.files[0].name, `${A}.en.manual.normal.srt`);
  assert.match(page.files[0].text, /^1\n00:00:01,000 --> 00:00:03,000\nline 1\n/);
  const rec = record(area);
  assert.equal(rec.fingerprints.length, 1, 'البصمة محفوظة');
  assert.equal(rec.english[0].key, 'en|manual');
  assert.equal(page.env.doc.body.children.some((c) => c.tagName === 'a'), false, 'رابط التنزيل المؤقت أُزيل');

  click(page.ui.btn('upload'));
  assert.equal(page.ui.menuOpen(), false, 'بلا ترجمة: المنتقي مباشرة');
  chooseFiles(page.ui, [new File([translate(page.files[0].text)], 'talk.ar.srt', { type: 'application/x-subrip' })]);
  await settle(area);
  const s = page.controller.getState();
  assert.equal(s.arabic.cues.length, 6);
  assert.equal(s.arabic.comparison.matched, true);
  assert.equal(record(area).arabic.fileName, 'talk.ar.srt');
  assert.equal(page.ui.menuLabel(), 'الترجمة العربية');
  assert.match(page.ui.menuText(), /مطابق للأصل/);
  assert.equal(page.ui.btn('upload').querySelector('.dot').getAttribute('data-tone'), 'loaded');

  page.video.seekTo(1.5);
  assert.deepEqual(page.shown(), ['سطر 1']);
});

test('± ووضع العرض يُحفظان لكل فيديو ويُستعادان بعد إعادة التحميل والتنقل (AC6)، ولا يمسّان التوقيت المحفوظ', async () => {
  const area = createMemoryArea();
  const page = await openPage(area);
  click(page.ui.btn('download'));
  click(page.ui.item('تنزيل الملف'));
  await settle(area);
  click(page.ui.btn('upload'));
  chooseFiles(page.ui, [new File([translate(page.files[0].text)], 'talk.ar.srt')]);
  await settle(area);
  click(page.ui.btn('upload'));

  click(page.ui.btn('plus'));
  click(page.ui.btn('plus'));
  click(page.ui.btn('minus'));
  click(page.ui.btn('plus'));
  await settle(area);
  assert.equal(page.ui.btn('badge').textContent, '+1.0');
  assert.equal(record(area).view.displayOffsetMs, 1000);
  assert.equal(record(area).arabic.original[0].startMs, 1000, 'التوقيت المحفوظ كما هو');
  page.video.seekTo(1.5);
  assert.deepEqual(page.shown(), [], 'تأخير ثانية: لم يحن بعد');
  page.video.seekTo(3.5);
  assert.deepEqual(page.shown(), ['سطر 1']);

  click(page.ui.btn('upload'));
  click(page.ui.menu().querySelector('[data-fid="mode:dual"]'));
  await settle(area);
  assert.equal(record(area).view.displayMode, 'dual');
  assert.deepEqual(page.shown(), ['سطر 1', 'line 1'], 'الإنجليزي تحت العربي بالإزاحة نفسها');

  // إعادة تحميل: صفحة جديدة على التخزين نفسه
  const again = await openPage(area);
  assert.equal(again.ui.btn('badge').textContent, '+1.0');
  assert.equal(again.controller.getState().view.displayMode, 'dual');
  assert.match(again.ui.toasts().map((t) => t.text).join(), /استُعيدت ترجمتك المحفوظة لهذا الفيديو\./);

  // تنقل إلى فيديو بلا ترجمة ثم العودة
  await again.navigate(B);
  assert.equal(again.ui.btn('badge').textContent, '0.0');
  assert.equal(again.ui.btn('plus').getAttribute('aria-disabled'), 'true');
  assert.equal(again.ui.toasts().length, 0, 'لا رسالة من الفيديو السابق');
  assert.equal(record(area, B), undefined, 'لا سجل يُنشأ لفيديو بلا ترجمة');
  await again.navigate(A);
  assert.equal(again.ui.btn('badge').textContent, '+1.0');
  assert.equal(again.controller.getState().view.displayMode, 'dual');
});

test('الاستبدال بتأكيد: الملخص الجديد وتنبيه التصفير، ثم الإزاحة صفر بإشعار، ونقص المقارنة على زر الرفع', async () => {
  const area = createMemoryArea();
  const page = await openPage(area);
  click(page.ui.btn('download'));
  click(page.ui.item('تنزيل الملف'));
  await settle(area);
  const ar = translate(page.files[0].text);
  click(page.ui.btn('upload'));
  chooseFiles(page.ui, [new File([ar], 'v1.ar.srt')]);
  await settle(area);
  click(page.ui.btn('plus'));
  await settle(area);
  assert.equal(record(area).view.displayOffsetMs, 500);

  // النسخة الثانية ينقصها المقطع 6، وتُحفظ فوق الخانة 1 (الافتراضي أول خانة فارغة، فتُختار 1 صراحة).
  const missing = ar.split('\n\n').slice(0, 5).join('\n\n');
  click(page.ui.item('رفع ترجمة…'));
  chooseFiles(page.ui, [new File([missing], 'v2.ar.srt')]);
  await settle(area);
  assert.equal(page.ui.menuLabel(), 'رفع ترجمة');
  click(page.ui.menu().querySelector('[data-fid="target:1"]'));
  assert.equal(page.ui.menuLabel(), 'استبدال الترجمة؟');
  assert.match(page.ui.menuText(), /مقطع واحد ناقص: 6/);
  assert.match(page.ui.menuText(), /ستُصفَّر إزاحة العرض/);
  assert.equal(record(area).arabic.fileName, 'v1.ar.srt', 'لا شيء قبل التأكيد');
  click(page.ui.item('استبدال'));
  await settle(area);
  assert.equal(record(area).arabic.fileName, 'v2.ar.srt');
  assert.equal(record(area).view.displayOffsetMs, 0);
  assert.equal(page.ui.btn('badge').textContent, '0.0');
  assert.match(page.ui.toasts().map((t) => t.text).join(), /صُفّرت إزاحة العرض لأن الملف الجديد يحمل توقيته\./);
  assert.equal(page.ui.btn('upload').querySelector('.dot').getAttribute('data-tone'), 'warning');
  assert.equal((await page.store.getBundle(A)).previous.track.fileName, 'v1.ar.srt', 'النسخة السابقة حُفظت قبل الاستبدال');
});

test('الخطوة من قائمة الشارة تُحفظ في الإعدادات وتصل إلى ± وإلى صفحة أخرى مفتوحة', async () => {
  const area = createMemoryArea();
  const page = await openPage(area);
  const other = await openPage(area);
  click(page.ui.btn('download'));
  click(page.ui.item('تنزيل الملف'));
  await settle(area);
  click(page.ui.btn('upload'));
  chooseFiles(page.ui, [new File([translate(page.files[0].text)], 'a.srt')]);
  await settle(area);
  click(page.ui.btn('badge'));
  click(page.ui.menu().querySelectorAll('[role="radio"]')[1]);
  await settle(area);
  assert.equal(area.dump().settings.offsetStepMs, 1000);
  assert.equal(other.ui.btn('plus').getAttribute('aria-label').startsWith('تأخير الترجمة 1 ث'), true, 'تبويب آخر عبر أحداث التخزين');
  click(page.ui.btn('plus'));
  await settle(area);
  assert.equal(record(area).view.displayOffsetMs, 1000);
});
