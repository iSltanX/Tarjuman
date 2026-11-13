// تحقق Gemini، الجولة الثانية، B5-ب: بعد تحديث الإضافة أو إعادة تحميلها تبقى صفحة يوتيوب المفتوحة بسكربتها القديم، وسياقه مبطَل
// (Chromium يرمي «Extension context invalidated.» ويزول chrome.runtime.id). كانت القراءة ترمي ST_READ_FAILED («تعذّرت قراءة
// المحفوظات») والكتابة تعيد الإرسال ثلاث مرات ثم ST_WRITE_FAILED («أعد المحاولة»)، ولا تنجح الإعادة. الآن TJ_RELOAD_PAGE
// («أعد تحميلها») فورًا، بلا إعادة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, localTransport, messageTransport, sharedWriter } from '../../../src/core/store/index.js';
import { createController } from '../../../src/content/controller.js';
import { messageFor } from '../../../src/core/errors/index.js';
import { storeRequest } from '../../../src/core/model/messages.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { NOW, VIDEO_ID as A, videoRecord } from '../../helpers/fixtures.js';

const INVALIDATED = 'Extension context invalidated.';
let t = Date.parse(NOW);
const now = () => (t += 1000);

/** مساحة سليمة فيها meta وفيديو، ومساحة فوقها تقرأ كما يقرأ سكربت مبطَل السياق. */
async function seeded() {
  const area = createMemoryArea({ unlimited: true });
  await createStore({ area, now }).updateVideo(A, () => videoRecord());
  await area.flush();
  return area;
}
const deadReads = (area, err = () => new Error(INVALIDATED)) => ({
  ...area,
  get: async () => { throw err(); },
  getKeys: async () => { throw err(); },
  getBytesInUse: async () => { throw err(); },
});
/** runtime قناته مبطَلة: sendMessage يرمي كما يرمي Chromium، ويُعدّ كل استدعاء. */
const deadRuntime = () => {
  const r = { sent: 0, sendMessage() { r.sent++; throw new Error(INVALIDATED); } };
  return r;
};
const codeOf = (p) => p.then(() => 'ok', (e) => e.code);

test('B5-ب: القراءة في سياق مبطَل ← TJ_RELOAD_PAGE لا ST_READ_FAILED (getVideo وgetSettings وlistIndex وcapacity وbundleBytes)', async () => {
  const area = await seeded();
  const store = createStore({ area: deadReads(area), now, transport: localTransport(sharedWriter(area)) });
  assert.equal(await codeOf(store.getVideo(A)), 'TJ_RELOAD_PAGE');
  assert.equal(await codeOf(store.getSettings()), 'TJ_RELOAD_PAGE');
  assert.equal(await codeOf(store.listIndex()), 'TJ_RELOAD_PAGE', 'getKeys');
  assert.equal(await codeOf(store.capacity()), 'TJ_RELOAD_PAGE', 'getBytesInUse');
  assert.equal(await codeOf(store.bundleBytes(A)), 'TJ_RELOAD_PAGE');
  const err = await store.getVideo(A).catch((e) => e);
  assert.equal(err.message, messageFor('TJ_RELOAD_PAGE'));
  assert.match(err.detail, /Extension context invalidated/);
});

test('B5-ب: فشل قراءة آخر يبقى ST_READ_FAILED كما كان', async () => {
  const area = await seeded();
  const store = createStore({ area: deadReads(area, () => new Error('IO error: disk')), now, transport: localTransport(sharedWriter(area)) });
  assert.equal(await codeOf(store.getVideo(A)), 'ST_READ_FAILED');
  assert.equal(await codeOf(store.listIndex()), 'ST_READ_FAILED');
});

test('B5-ب: زوال chrome.runtime.id بعد أن كان ← TJ_RELOAD_PAGE ولو جاء الخطأ بنص آخر', async () => {
  const area = await seeded();
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'chrome');
  const runtime = { id: 'tarjuman-test-id' };
  Object.defineProperty(globalThis, 'chrome', { value: { runtime }, configurable: true, writable: true });
  try {
    const store = createStore({ area: deadReads(area, () => new TypeError("Cannot read properties of undefined (reading 'local')")), now, transport: localTransport(sharedWriter(area)) });
    assert.equal(await codeOf(store.getVideo(A)), 'ST_READ_FAILED', 'والمعرّف باقٍ: فشل قراءة عادي');
    delete runtime.id;
    assert.equal(await codeOf(store.getVideo(A)), 'TJ_RELOAD_PAGE');
  } finally {
    if (saved) Object.defineProperty(globalThis, 'chrome', saved); else delete globalThis.chrome;
  }
});

test('B5-ب: الناقل في سياق مبطَل يرد TJ_RELOAD_PAGE فورًا بلا إعادة إرسال ولا انتظار', async () => {
  const runtime = deadRuntime();
  const slept = [];
  const transport = messageTransport(runtime, { sleep: async (ms) => { slept.push(ms); } });
  const reply = await transport.send(storeRequest('settings', { patch: {} }, 'wid-b5-0001'));
  assert.equal(reply.ok, false);
  assert.equal(reply.code, 'TJ_RELOAD_PAGE');
  assert.equal(runtime.sent, 1, 'رسالة واحدة');
  assert.deepEqual(slept, [], 'لا 0.15 ثم 0.5 ثم 1.5 ث');
});

test('B5-ب: الناقل حين يزول runtime.id بعد أن كان ← TJ_RELOAD_PAGE بلا إعادة، وخطأ القناة العادي يُعاد كما كان', async () => {
  const runtime = { id: 'tarjuman-test-id', sent: 0, sendMessage() { runtime.sent++; throw new Error('Could not establish connection. Receiving end does not exist.'); } };
  const slept = [];
  const transport = messageTransport(runtime, { sleep: async (ms) => { slept.push(ms); } });
  const busy = await transport.send(storeRequest('settings', { patch: {} }, 'wid-b5-0002'));
  assert.equal(busy.code, 'ST_WRITE_FAILED', 'العامل لا يستجيب: الإعادات الثلاث كما كانت');
  assert.equal(runtime.sent, 4);
  assert.equal(slept.length, 3);
  delete runtime.id;
  runtime.sent = 0;
  slept.length = 0;
  const gone = await transport.send(storeRequest('settings', { patch: {} }, 'wid-b5-0003'));
  assert.equal(gone.code, 'TJ_RELOAD_PAGE');
  assert.equal(runtime.sent, 1);
  assert.deepEqual(slept, []);
});

test('B5-ب: الكتابة من سكربت مبطَل ترمي TJ_RELOAD_PAGE فورًا (لا ST_WRITE_FAILED بعد 2.2 ث)', async () => {
  const area = await seeded();
  const runtime = deadRuntime();
  const slept = [];
  const store = createStore({ area, now, transport: messageTransport(runtime, { sleep: async (ms) => { slept.push(ms); } }) });
  assert.equal(await codeOf(store.setSettings({ appearance: { font: 'almarai' } })), 'TJ_RELOAD_PAGE');
  assert.equal(await codeOf(store.updateVideo(A, (r) => ({ ...r, title: 'جديد' }))), 'TJ_RELOAD_PAGE');
  assert.equal(runtime.sent, 2);
  assert.deepEqual(slept, []);
});

test('B5-ب: المتحكم في صفحة الفيديو يعرض «أعد تحميلها» (TJ_RELOAD_PAGE) لا «تعذّرت قراءة المحفوظات»', async () => {
  const area = await seeded();
  const store = createStore({ area: deadReads(area), now, transport: messageTransport(deadRuntime(), { sleep: async () => {} }) });
  const c = createController({ store, page: {}, extractor: null });
  await c.start(A);
  const { error } = c.getState();
  assert.ok(error, 'خطأ ظاهر');
  assert.equal(error.code, 'TJ_RELOAD_PAGE');
  assert.equal(error.message, messageFor('TJ_RELOAD_PAGE'));
  assert.match(error.message, /أعد تحميلها/);
});
