// تدقيق 7a66f91، U103 (T-01): نقاط الدخول (background/worker.js وcontent/main.js وpages/{popup,library,settings,editor}/main.js) تنفّذ
// تركيبها لحظة الاستيراد، فلم يكن يحمّلها أي اختبار. هنا تُحمَّل كلٌّ بكائن chrome وDOM وهميين (test/helpers/c8-entry-env.js)،
// ويُثبت أنها تُحمَّل وتسجّل مستمعيها وتعرض صفحتها بلا تنبيه «تعذّر عرض الصفحة». كل ملف اختبار يشغَّل في عملية مستقلة، فكل نقطة
// دخول تُستورد مرة واحدة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEntryEnv } from '../helpers/c8-entry-env.js';
import { settle, textOf } from './pages/library/fake-dom.js';

// استيرادات حرفية (لا قالبية) كي يراها حارس c8-loaded.test.js فيعدّ هذه الملفات مبلوغة.
const IMPORTERS = {
  'background/worker.js': () => import('../../src/background/worker.js'),
  'content/main.js': () => import('../../src/content/main.js'),
  'pages/editor/main.js': () => import('../../src/pages/editor/main.js'),
  'pages/library/main.js': () => import('../../src/pages/library/main.js'),
  'pages/popup/main.js': () => import('../../src/pages/popup/main.js'),
  'pages/settings/main.js': () => import('../../src/pages/settings/main.js'),
};
const EXT_SENDER = { id: 'tj-test-id', url: 'chrome-extension://tj/pages/popup/index.html' };

/** يحمّل نقطة دخول تحت بيئة وهمية ثم يعيد المتغيرات العامة؛ ينتظر ما يجدوله التركيب. */
const loaded = new Map();
/** الاستيراد مخزَّن في الذاكرة: التركيب يجري مرة واحدة في العملية، فاستيراد ثانٍ لا ينفّذه. لذا تُعاد البيئة نفسها. */
function load(entry, opts) {
  if (!loaded.has(entry)) loaded.set(entry, loadOnce(entry, opts));
  return loaded.get(entry);
}
async function loadOnce(entry, opts) {
  const env = createEntryEnv(opts);
  const restore = env.install();
  try {
    await IMPORTERS[entry]();
    await settle(20);
    await new Promise((r) => setImmediate(r));
    await settle(20);
  } finally {
    restore();
  }
  return env;
}

/** يستدعي مستمعي onMessage بترتيبهم، ويعيد أول رد متزامن/غير متزامن (أو undefined إن لم يمسّها أحد). */
async function send(env, req, sender) {
  for (const fn of env.events.onMessage.listeners) {
    let replied;
    const handled = fn(req, sender, (r) => { replied = r; });
    if (handled === true) {
      for (let i = 0; i < 50 && replied === undefined; i++) await new Promise((r) => setImmediate(r));
      return replied;
    }
    if (replied !== undefined) return replied;
  }
  return undefined;
}

const noPageError = (env) => assert.ok(!textOf(env.doc.body).includes('تعذّر عرض الصفحة'), textOf(env.doc.body));

test('worker.js: يسجّل مستمعي الرسائل (الكاتب والحفظ) متزامنًا عند التحميل كما يشترط MV3', async () => {
  const env = await load('background/worker.js');
  assert.equal(env.events.onMessage.listeners.length, 2);
});

test('worker.js: يتجاهل مرسِلًا غريبًا وطلبًا لا يخصه، ويجيب طلب كتابة صالح من صفحة الإضافة', async () => {
  const env = await load('background/worker.js');
  const storeReq = { v: 1, type: 'tj:store', wid: 'abcdefgh12', op: 'ready', at: '2026-01-01T00:00:00.000Z' };
  assert.equal(await send(env, storeReq, { id: 'غريب', url: 'https://evil.example/' }), undefined, 'مرسِل غريب');
  assert.equal(await send(env, { type: 'other' }, EXT_SENDER), undefined, 'طلب غير مفهوم');
  const reply = await send(env, storeReq, EXT_SENDER);
  assert.equal(reply?.v, 1);
  assert.equal(reply?.ok, true, JSON.stringify(reply));
});

test('content/main.js: يُحمَّل ويسجّل مستمع الجسر على النافذة ومستمع رسائل الإضافة', async () => {
  const env = await load('content/main.js');
  assert.equal(env.winListeners.get('message')?.length, 1, 'جسر MAIN -> ISOLATED');
  assert.ok(env.events.onMessage.listeners.length >= 1);
  assert.ok(env.winListeners.has('popstate'), 'مراقب تغيّر الفيديو');
});

test('content/main.js: رد حالة الفيديو لصفحة الإضافة وحدها، ويتجاهل مرسِلًا غريبًا', async () => {
  const env = await load('content/main.js');
  const req = { v: 1, type: 'tj:get-video-state' };
  const reply = await send(env, req, EXT_SENDER);
  assert.equal(reply?.ok, true, JSON.stringify(reply));
  assert.equal(reply.watch, false, 'الصفحة الوهمية ليست صفحة فيديو');
  assert.equal(await send(env, req, { id: 'غريب', url: 'https://www.youtube.com/watch?v=AAAAAAAAAAA' }), undefined);
});

test('content/main.js: الجسر لا يمرّر رسالة لا تخص ترجمان ولا من أصل آخر (لا خطأ)', async () => {
  const env = await load('content/main.js');
  const [handler] = env.winListeners.get('message');
  assert.doesNotThrow(() => {
    handler({ source: env.win, origin: 'https://evil.example', data: { source: 'tarjuman' } });
    handler({ source: env.win, origin: env.win.location.origin, data: { source: 'غيره' } });
    handler({ source: env.win, origin: env.win.location.origin, data: null });
  });
});

for (const [entry, title] of [
  ['pages/editor/main.js', 'المحرّر'],
  ['pages/library/main.js', 'المحفوظات'],
  ['pages/settings/main.js', 'الإعدادات'],
  ['pages/popup/main.js', 'نافذة الإضافة'],
]) {
  test(`${entry}: يُحمَّل ويضبط عنوان الصفحة ويركّب واجهته بلا تنبيه خطأ`, async () => {
    const env = await load(entry, { search: '?v=AAAAAAAAAAA' });
    assert.equal(env.doc.title, `ترجمان — ${title}`);
    assert.ok(env.app.classList.contains('tj-container'));
    assert.ok(env.app.children.length > 0, 'الحاوية غير فارغة');
    noPageError(env);
  });
}

test('pages/popup/main.js: تعرض مدخلي المحفوظات والإعدادات وتفتح كلًا في تبويب وتغلق النافذة', async () => {
  const env = await load('pages/popup/main.js');
  const nav = env.doc.querySelectorAll('button[data-action]');
  const names = nav.map((b) => b.getAttribute('data-action'));
  assert.ok(names.includes('library') && names.includes('settings'), names.join());
  // الأزرار تقرأ chrome عند الضغط، فنعيد تثبيت البيئة حول الضغطة.
  const restore = env.install();
  try {
    nav.find((b) => b.getAttribute('data-action') === 'settings').dispatchEvent({ type: 'click' });
    await settle(10);
  } finally {
    restore();
  }
  assert.equal(env.created.length, 1);
  assert.match(env.created[0].url, /settings/);
  assert.equal(env.win.closed, true);
});

test('pages/library/main.js: الشريط العلوي يميّز الصفحة الحالية', async () => {
  const lib = await load('pages/library/main.js', { search: '?v=AAAAAAAAAAA' });
  const current = lib.doc.querySelectorAll('a').filter((a) => a.getAttribute('aria-current') === 'page');
  assert.equal(current.length, 1);
  assert.ok(textOf(current[0]).includes('المحفوظات'));
});
