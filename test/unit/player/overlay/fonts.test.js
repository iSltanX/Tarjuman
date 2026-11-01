// خط الترجمة وحجمها على الطبقة (P6-AC8 وP6-AC9 الجزء الآلي): الخطوط من ملفات الإضافة عبر FontFace ببياناتها
// (لا رابط ولا نطاق خارجي)، ومرة لكل مستند، والبديل المراعي ثم خط النظام برمز في التشخيص؛ والطبقة تطبّق العائلة
// والحجم المحفوظين وتتحدث عند تغييرهما دون إعادة تركيب.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFontLoader, readPackagedFont } from '../../../../src/player/overlay/fonts.js';
import { mountOverlay } from '../../../../src/player/overlay/index.js';
import { DEFAULT_SETTINGS } from '../../../../src/core/model/settings.js';
import { SUBTITLE_FONT_LIST, subtitleFontStack } from '../../../../src/ui/subtitle-fonts.js';
import { createFakeEnv } from './fake-dom.js';
import { makeState, watchPage } from './harness.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

/** FontFace وFontFaceSet وهميان: يسجّلان ما بُني وما أُضيف، والإخفاق بحسب العائلة. */
function fontEnv({ failFamilies = [] } = {}) {
  const env = createFakeEnv();
  const built = [];
  const added = [];
  env.win.FontFace = class {
    constructor(family, source, desc) {
      this.family = family;
      this.source = source;
      this.weight = desc.weight;
      built.push(this);
    }

    load() {
      return failFamilies.includes(this.family) ? Promise.reject(new Error('decode')) : Promise.resolve(this);
    }
  };
  env.doc.fonts = { add: (f) => added.push(f) };
  const reads = [];
  const read = async (path) => {
    reads.push(path);
    return new ArrayBuffer(8);
  };
  return { env, built, added, reads, read };
}

const family = (id) => SUBTITLE_FONT_LIST.find((f) => f.id === id).family;

test('الخط المختار والمراعي بوزنيهما من ملفات الإضافة، عبر FontFace ببياناتهما لا برابط', async () => {
  const f = fontEnv();
  const fonts = createFontLoader({ doc: f.env.doc, win: f.env.win, read: f.read });
  const st = await fonts.ensure('tajawal');
  assert.deepEqual(f.reads.sort(), [
    'ui/fonts/subtitle/almarai-400.woff2', 'ui/fonts/subtitle/almarai-700.woff2',
    'ui/fonts/subtitle/tajawal-400.woff2', 'ui/fonts/subtitle/tajawal-700.woff2',
  ]);
  assert.ok(f.built.every((x) => x.source instanceof ArrayBuffer), 'بيانات الملف، لا سلسلة url()');
  assert.deepEqual(f.added.map((x) => `${x.family}/${x.weight}`).sort(), [
    `${family('almarai')}/400`, `${family('almarai')}/700`, `${family('tajawal')}/400`, `${family('tajawal')}/700`,
  ].sort());
  assert.equal(st.active, 'tajawal');
  assert.equal(st.code, null);
});

test('يُحمَّل كل خط مرة للمستند: تكرار الطلب أو العودة إلى خط سابق لا يقرأ الملفات ثانية', async () => {
  const f = fontEnv();
  const fonts = createFontLoader({ doc: f.env.doc, win: f.env.win, read: f.read });
  await fonts.ensure('markazi');
  await fonts.ensure('markazi');
  await fonts.ensure('almarai');
  await fonts.ensure('markazi');
  assert.equal(f.reads.length, 4);
  assert.equal(f.added.length, 4);
  assert.equal(fonts.diagnostics().active, 'markazi');
});

test('تعذّر المختار: المراعي المضمّن بالرمز CT_FONT_FALLBACK، ولا يُضاف وزن واحد دون الآخر', async () => {
  const f = fontEnv({ failFamilies: [family('noto-sans-arabic')] });
  const fonts = createFontLoader({ doc: f.env.doc, win: f.env.win, read: f.read });
  const st = await fonts.ensure('noto-sans-arabic');
  assert.equal(st.active, 'almarai');
  assert.equal(st.code, 'CT_FONT_FALLBACK');
  assert.deepEqual(st.failed, ['noto-sans-arabic']);
  assert.ok(!f.added.some((x) => x.family === family('noto-sans-arabic')), 'لا وزن ناقص في المستند');
  assert.match(st.lastDetail, /decode/);
});

test('تعذّر المراعي أيضًا (أو لا FontFace): خط النظام العربي بالرمز CT_FONT_SYSTEM، ولا رمي', async () => {
  const f = fontEnv({ failFamilies: [family('markazi'), family('almarai')] });
  const st = await createFontLoader({ doc: f.env.doc, win: f.env.win, read: f.read }).ensure('markazi');
  assert.equal(st.active, 'system');
  assert.equal(st.code, 'CT_FONT_SYSTEM');
  const bare = createFakeEnv();
  const st2 = await createFontLoader({ doc: bare.doc, win: bare.win, read: f.read }).ensure('almarai');
  assert.equal(st2.code, 'CT_FONT_SYSTEM');
  const failingRead = createFontLoader({ doc: f.env.doc, win: f.env.win, read: async () => { throw new Error('missing'); } });
  assert.equal((await failingRead.ensure('tajawal')).code, 'CT_FONT_SYSTEM');
});

test('طلب أحدث يغلب الأقدم: نتيجة خط سابق تأخرت لا تكتب الحالة', async () => {
  const f = fontEnv();
  let release;
  const gate = new Promise((r) => (release = r));
  const read = async (path) => {
    if (path.includes('markazi')) await gate;
    return new ArrayBuffer(8);
  };
  const fonts = createFontLoader({ doc: f.env.doc, win: f.env.win, read });
  const slow = fonts.ensure('markazi');
  await fonts.ensure('tajawal');
  release();
  await slow;
  assert.equal(fonts.diagnostics().requested, 'tajawal');
  assert.equal(fonts.diagnostics().active, 'tajawal');
});

test('readPackagedFont: يقرأ بعنوان الإضافة من runtime.getURL وحده، ويرمي إن غاب أو فشل', async () => {
  const seen = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    seen.push(url);
    return url.endsWith('missing.woff2') ? { ok: false, status: 404 } : { ok: true, arrayBuffer: async () => new ArrayBuffer(4) };
  };
  try {
    const runtime = { getURL: (p) => `chrome-extension://abcdefghijklmnop/${p}` };
    const buf = await readPackagedFont('ui/fonts/subtitle/almarai-700.woff2', runtime);
    assert.equal(buf.byteLength, 4);
    assert.deepEqual(seen, ['chrome-extension://abcdefghijklmnop/ui/fonts/subtitle/almarai-700.woff2']);
    await assert.rejects(readPackagedFont('ui/fonts/subtitle/missing.woff2', runtime), /404/);
    await assert.rejects(readPackagedFont('x.woff2', null), /getURL/);
  } finally {
    globalThis.fetch = original;
  }
});

/** محمّل وهمي يسجّل الطلبات. */
function spyFonts() {
  const asked = [];
  return { asked, ensure: async (id) => asked.push(id), diagnostics: () => ({ asked: asked.length }) };
}

test('الطبقة: عائلة الخط المختار للعربي والمراعي للإنجليزي، والحجم بالنسبة، وتتحدث دون إعادة تركيب', () => {
  const page = watchPage({ state: makeState({ settings: { ...DEFAULT_SETTINGS, appearance: { ...DEFAULT_SETTINGS.appearance, font: 'markazi', scale: 100 } } }), height: 480 });
  const fonts = spyFonts();
  const handle = mountOverlay(page.controller, { doc: page.env.doc, win: page.env.win, fonts });
  const host = page.player.children.find((c) => c.id === 'tarjuman-overlay');
  assert.equal(host.style.getPropertyValue('--tj-sub-font'), subtitleFontStack('markazi'));
  assert.equal(host.style.getPropertyValue('--tj-sub-font-en'), subtitleFontStack('almarai'));
  assert.ok(subtitleFontStack('markazi').startsWith(`"${family('markazi')}", "${family('almarai')}"`), 'المختار ثم المراعي المضمّن');
  assert.equal(host.style.getPropertyValue('--tj-fs'), '22px', '4.6% من 480 عند 100%');
  assert.deepEqual(fonts.asked, ['markazi']);

  page.controller.set({ settings: { ...DEFAULT_SETTINGS, appearance: { ...DEFAULT_SETTINGS.appearance, font: 'tajawal', scale: 160 } } });
  assert.equal(host.style.getPropertyValue('--tj-sub-font'), subtitleFontStack('tajawal'));
  assert.equal(host.style.getPropertyValue('--tj-fs'), '35px', '160% من 22');
  assert.deepEqual(fonts.asked, ['markazi', 'tajawal']);
  assert.equal(handle.diagnostics().attempts, 1, 'لا إعادة تركيب');
  assert.equal(page.player.children.filter((c) => c.id === 'tarjuman-overlay').length, 1);
});

test('لا تحميل خطوط قبل الحاجة: صفحة بلا ترجمة عربية أو بوضع الإخفاء لا تقرأ ملفًا', () => {
  const none = watchPage({ state: makeState({ arabic: null }) });
  const f1 = spyFonts();
  mountOverlay(none.controller, { doc: none.env.doc, win: none.env.win, fonts: f1 });
  assert.deepEqual(f1.asked, []);
  const off = watchPage({ state: makeState({ view: { displayOffsetMs: 0, displayMode: 'off' } }) });
  const f2 = spyFonts();
  mountOverlay(off.controller, { doc: off.env.doc, win: off.env.win, fonts: f2 });
  assert.deepEqual(f2.asked, []);
  off.controller.set({ view: { displayOffsetMs: 0, displayMode: 'ar' } });
  assert.deepEqual(f2.asked, ['almarai'], 'أول ما تنخرط الطبقة');
});

test('محمّل الخطوط واحد للمستند عبر إعادة تركيب الجلسة (يوتيوب يعيد رسم المشغّل)', async () => {
  const f = fontEnv();
  const page = watchPage();
  page.env.win.FontFace = f.env.win.FontFace;
  page.env.doc.fonts = f.env.doc.fonts;
  await flush();
  const handle = mountOverlay(page.controller, { doc: page.env.doc, win: page.env.win });
  await flush();
  const before = handle.diagnostics().fonts;
  assert.equal(before.requested, 'almarai');
  page.player.remove();
  const { addPlayer } = await import('./fake-dom.js');
  const { prepareVideo } = await import('./harness.js');
  const next = addPlayer(page.env);
  prepareVideo(next.video);
  page.env.win.advance(1100);
  await flush();
  assert.equal(handle.diagnostics().attempts, 2);
  // بلا chrome.runtime في الاختبار تتعذّر القراءة: الجلسة الثانية تعيد المحاولة بالمحمّل نفسه، والإخفاق مسجّل مرة.
  assert.deepEqual(handle.diagnostics().fonts.failed, ['almarai']);
  assert.equal(handle.diagnostics().fonts.code, 'CT_FONT_SYSTEM');
});
