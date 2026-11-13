// N-04: ربط موافقة صور المحفوظات في Firefox بنقطتي دخول الصفحتين، وتسجيل مستمعي العامل الخلفي في أول تنفيذ متزامن. تُبنى نقطة الدخول
// الحقيقية بـesbuild وتعمل في node:vm بواجهة chrome وهمية، ولا يُستبدل منها إلا ما حولها (الواجهة والتخزين والتركيب)، فوحدة
// الموافقة حقيقية، وما يكسر الربط في main.js يُسقط هذه الاختبارات.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import * as esbuild from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

// الوحدات التي تحيط بنقطة الدخول: تُستبدل ببدائل تسجّل ما يصلها. والباقي، ومنه core/consent/thumbnails.js، حقيقي.
const STUBS = [
  [/src\/ui\/page\.js$/, "export const extensionVersion = () => '0.0.0'; export const openPage = () => {}; export const startPage = (o) => { globalThis.__page = o; };"],
  [/src\/pages\/(?:library|settings)\/view\.js$/, 'const make = (deps) => { globalThis.__deps = deps; return { root: {}, load: async () => {} }; }; export const createLibrary = make; export const createSettings = make;'],
  [/src\/ui\/picker\.js$/, 'export const pickFiles = async () => null;'],
  [/src\/pages\/settings\/diagnostics\.js$/, "export const collectDiagnostics = async () => '{}';"],
  [/src\/core\/save\/index\.js$/, 'export const saveFile = async () => {}; export const savedPath = async () => null;'],
  [/src\/core\/store\/index\.js$/, 'export const createStore = () => ({});'],
  [/src\/i18n\/index\.js$/, 'export const t = (k) => k;'],
];

const stubPlugin = {
  name: 'stubs',
  setup(build) {
    build.onLoad({ filter: /\.js$/ }, (args) => {
      const hit = STUBS.find(([re]) => re.test(args.path));
      return hit ? { contents: hit[1], loader: 'js' } : undefined;
    });
  },
};

async function bundle(entry, plugins = []) {
  const out = await esbuild.build({
    entryPoints: [path.join(ROOT, entry)], bundle: true, format: 'iife', write: false, platform: 'browser', logLevel: 'silent', plugins,
    define: { __TJ_DEV__: 'false', __TJ_HARNESS_TOKEN__: '""' },
  });
  return out.outputFiles[0].text;
}

/** @param {'firefox' | 'chromium'} target */
function fakeChrome({ granted = false, answer = false, youtube = true } = {}) {
  const log = [];
  return {
    log,
    tabs: { create() {} },
    permissions: {
      getAll: async () => { log.push('getAll'); return { data_collection: granted ? ['browsingActivity'] : [] }; },
      contains: async (p) => { log.push(['contains', p]); return youtube; },
      request: async (p) => { log.push(['request', p]); return answer; },
      onAdded: { addListener: () => log.push('onAdded'), removeListener() {} },
      onRemoved: { addListener: () => log.push('onRemoved'), removeListener() {} },
    },
  };
}

async function renderEntry(entry, target, chromeOpts) {
  const code = await bundle(entry, [stubPlugin]);
  const chrome = fakeChrome(chromeOpts);
  const ctx = vm.createContext({ chrome, location: { protocol: target === 'firefox' ? 'moz-extension:' : 'chrome-extension:' }, navigator: { clipboard: {} } });
  vm.runInContext(code, ctx);
  await vm.runInContext('__page.render({ append() {} })', ctx);
  return { deps: vm.runInContext('__deps', ctx), chrome };
}

const LIB = 'src/pages/library/main.js';
const SET = 'src/pages/settings/main.js';

test('المحفوظات في Firefox: الموافقة تُقرأ من permissions.getAll ولا تُفترض', async () => {
  const denied = await renderEntry(LIB, 'firefox', { granted: false });
  assert.equal(typeof denied.deps.thumbsConsent, 'function', 'الربط موجود في Firefox');
  assert.equal(await denied.deps.thumbsConsent(), false, 'بلا موافقة لا صور');
  assert.ok(denied.chrome.log.includes('getAll'));
  const allowed = await renderEntry(LIB, 'firefox', { granted: true });
  assert.equal(await allowed.deps.thumbsConsent(), true);
});

test('المحفوظات في Firefox: مراقبة سحب الموافقة مربوطة بأحداث الأذونات', async () => {
  const { deps, chrome } = await renderEntry(LIB, 'firefox');
  assert.equal(typeof deps.thumbsConsentWatch, 'function');
  deps.thumbsConsentWatch(() => {});
  assert.deepEqual(chrome.log.filter((x) => x === 'onAdded' || x === 'onRemoved').sort(), ['onAdded', 'onRemoved']);
});

test('المحفوظات في Chromium: لا مدخل موافقة', async () => {
  const { deps } = await renderEntry(LIB, 'chromium');
  assert.equal('thumbsConsent' in deps, false);
  assert.equal('thumbsConsentWatch' in deps, false);
});

test('الإعدادات: الموافقة لازمة في Firefox وحده', async () => {
  assert.equal((await renderEntry(SET, 'firefox')).deps.thumbsConsent.needed, true);
  assert.equal((await renderEntry(SET, 'chromium')).deps.thumbsConsent.needed, false);
});

test('الإعدادات في Firefox: قراءة الموافقة حقيقية', async () => {
  const denied = await renderEntry(SET, 'firefox', { granted: false });
  assert.equal(await denied.deps.thumbsConsent.check(), false);
  const allowed = await renderEntry(SET, 'firefox', { granted: true });
  assert.equal(await allowed.deps.thumbsConsent.check(), true);
});

test('الإعدادات في Firefox: طلب الموافقة يصل المتصفح، والرفض رفض', async () => {
  const { deps, chrome } = await renderEntry(SET, 'firefox', { answer: false });
  assert.equal(await deps.thumbsConsent.request(), false, 'رفض المستخدم لا يُقرأ موافقة');
  const req = chrome.log.find((x) => Array.isArray(x) && x[0] === 'request');
  assert.ok(req, 'permissions.request استُدعي');
  assert.deepEqual(JSON.parse(JSON.stringify(req[1])), { data_collection: ['browsingActivity'] });
  const yes = await renderEntry(SET, 'firefox', { answer: true });
  assert.equal(await yes.deps.thumbsConsent.request(), true);
});

// الفكرة ٣-أ (ح-39): إذن يوتيوب نفسه في الإعدادات بالهدفين، بالوحدة الحقيقية core/consent/youtube-access.js: contains وrequest بأصل
// يوتيوب وحده، والمراقبة بحدثي الأذونات. والنافذة لا تربطه (الطلب في حزمة الإعدادات وحدها).
for (const target of ['chromium', 'firefox']) {
  test(`الإعدادات (${target}): إذن يوتيوب يُقرأ ويُطلب بأصله وحده ويُراقَب`, async () => {
    const off = await renderEntry(SET, target, { youtube: false, answer: true });
    assert.equal(typeof off.deps.youtubeAccess?.check, 'function', 'الربط موجود');
    assert.equal(await off.deps.youtubeAccess.check(), false);
    const contains = off.chrome.log.find((x) => Array.isArray(x) && x[0] === 'contains');
    assert.deepEqual(JSON.parse(JSON.stringify(contains[1])), { origins: ['https://www.youtube.com/*'] });
    assert.equal(await off.deps.youtubeAccess.request(), true);
    const req = off.chrome.log.find((x) => Array.isArray(x) && x[0] === 'request');
    assert.deepEqual(JSON.parse(JSON.stringify(req[1])), { origins: ['https://www.youtube.com/*'] });
    off.deps.youtubeAccess.watch(() => {});
    assert.deepEqual(off.chrome.log.filter((x) => x === 'onAdded' || x === 'onRemoved').sort(), ['onAdded', 'onRemoved']);
    const on = await renderEntry(SET, target, { youtube: true });
    assert.equal(await on.deps.youtubeAccess.check(), true);
  });
}

// ---- العامل الخلفي: MV3 يوقظ العامل بحدث، فمستمع يُسجَّل بعد أول تنفيذ متزامن يضيع حدثه ----

/** واجهة chrome وهمية عامة: كل خاصية كائن قابل للاستدعاء، وaddListener يُحصى باسم الحدث. */
function anyChrome(counts) {
  const make = (name) => new Proxy(function stub() {}, {
    get(_, key) {
      if (key === 'addListener') return () => { counts[name] = (counts[name] ?? 0) + 1; };
      if (typeof key === 'symbol' || key === 'then') return undefined;
      return make(key);
    },
    apply: () => Promise.resolve({}),
  });
  return make('chrome');
}

test('العامل الخلفي: مستمعا الرسائل مسجَّلان قبل انتهاء أول تنفيذ متزامن', async () => {
  const code = await bundle('src/background/worker.js');
  const counts = {};
  const ctx = vm.createContext({ chrome: anyChrome(counts), TextEncoder, TextDecoder });
  vm.runInContext(code, ctx);
  // الفحص متزامن عمدًا: ما يؤجَّل بوعد لم يُنفَّذ بعد هنا.
  assert.equal(counts.onMessage, 2, 'خدمة التخزين وخدمة الحفظ');
});
