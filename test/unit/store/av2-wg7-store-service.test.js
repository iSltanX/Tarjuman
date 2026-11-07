// AV2 U-043: قائمة عمليات الكاتب بحسب المرسِل. سكربت المحتوى على يوتيوب يُسمح له بما يحتاجه جانب يوتيوب فعلًا
// (ready وput وorphan وindex وsettings وprefs)، ويُرفض منه clear وlangPrefs وsaves وdelete؛ وصفحات الإضافة بلا تغيير.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, createWriter, messageTransport } from '../../../src/core/store/index.js';
import { createController } from '../../../src/content/controller.js';
import { createStoreService } from '../../../src/background/store-service.js';
import { storeRequest } from '../../../src/core/model/messages.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { sampleBundle, seedBundle } from '../../helpers/fixtures-v2.js';
import { storeEnv } from '../../helpers/store-env.js';

const ID = 'AAAAAAAAAAA';
const runtime = { id: 'ext', getURL: (p) => `chrome-extension://ext/${p}`, onMessage: { addListener() {}, removeListener() {} } };
const content = { id: 'ext', tab: { id: 7 }, url: `https://www.youtube.com/watch?v=${ID}` };
const page = { id: 'ext', url: 'chrome-extension://ext/pages/settings/index.html' };
let n = 0;
const req = (op, args = {}) => storeRequest(op, args, `wid-wg7-${String(++n).padStart(6, '0')}`);
const AT = '2026-11-08T00:00:00.000Z';

function service() {
  const area = createMemoryArea({ unlimited: true });
  return { area, svc: createStoreService({ runtime, writer: createWriter({ area }) }) };
}

test('AV2 U-043: سكربت المحتوى يُرفض في clear وlangPrefs وsaves وdelete بالشكل المعتاد للأخطاء ولا تُكتب بيانات', async () => {
  const env = storeEnv({ area: createMemoryArea({ unlimited: true }) });
  await seedBundle(env.context(), sampleBundle({ videoId: ID }));
  await env.area.flush?.();
  const svc = createStoreService({ runtime, writer: createWriter({ area: env.area }) });
  const before = JSON.stringify(env.area.dump());
  for (const [op, args] of [['clear', { at: AT }], ['langPrefs', { patch: { remember: false } }], ['saves', { downloadId: 9, at: AT }], ['delete', { videoId: ID }]]) {
    const r = await svc.handle(req(op, args), content);
    assert.equal(r.ok, false, `${op} مرفوض`);
    assert.equal(r.code, 'TJ_BAD_MESSAGE', op);
    assert.equal(r.v, 1);
  }
  assert.equal(JSON.stringify(env.area.dump()), before, 'لم يُمسّ التخزين');
});

test('AV2 U-043: صفحات الإضافة تبقى مقبولة في العمليات المدمّرة، والمرسِل الغريب يُتجاهل', async () => {
  const { svc } = service();
  for (const [op, args] of [['langPrefs', { patch: { remember: false } }], ['saves', { downloadId: 9, at: AT }], ['clear', { at: AT }]]) {
    const r = await svc.handle(req(op, args), page);
    assert.equal(r.ok, true, `${op} من صفحة الإضافة`);
  }
  assert.equal(svc.handle(req('clear', { at: AT }), { id: 'ext', tab: { id: 8 }, url: 'https://evil.example/' }), null);
});

test('AV2 U-043: العمليات الست تُقبل من سكربت المحتوى', async () => {
  const { svc } = service();
  assert.equal((await svc.handle(req('ready', { at: AT }), content)).ok, true);
  assert.equal((await svc.handle(req('settings', { patch: {} }), content)).ok, true);
  assert.equal((await svc.handle(req('prefs', { patch: { ui: { panelOpen: true } } }), content)).ok, true);
  assert.equal((await svc.handle(req('orphan', { videoIds: [ID] }), content)).ok, true);
  assert.equal((await svc.handle(req('index', { videoIds: [ID] }), content)).ok, true);
});

test('AV2 U-043: تدفقات المتحكم (put وsettings وprefs) وlistIndex (orphan وindex) تنجح عبر خدمة تفرض مرسِل سكربت المحتوى', async () => {
  const env = storeEnv({ area: createMemoryArea({ unlimited: true }) });
  await seedBundle(env.context(), sampleBundle({ videoId: ID, third: true }));
  await env.area.flush?.();
  const svc = createStoreService({ runtime, writer: createWriter({ area: env.area }) });
  const ops = [];
  const runtimeViaService = { sendMessage: async (m) => { ops.push(m.op); return JSON.parse(JSON.stringify(await svc.handle(m, content))); } };
  const transport = messageTransport(runtimeViaService, { delays: [0, 0, 0], sleep: () => Promise.resolve() });
  const store = createStore({ area: env.area, transport });
  const c = createController({ store, page: {}, extractor: null });
  await c.start(ID);
  const step = c.getState().settings.offsetStepMs;
  await c.nudgeOffset(1);
  assert.equal(c.getState().error, null);
  assert.equal((await store.getBundle(ID)).slots[0].offsetMs, 500 + step);
  await store.setSettings({ offsetStepMs: 1000 });
  await store.setPrefs({ ui: { panelOpen: true } });
  await store.listIndex();
  assert.ok(ops.includes('put') && ops.includes('settings') && ops.includes('prefs'), ops.join());
  assert.ok(ops.every((o) => ['ready', 'put', 'orphan', 'index', 'settings', 'prefs'].includes(o)), ops.join());
});
