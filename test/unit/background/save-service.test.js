// العامل الخلفي للحفظ وحده (P10-AC9): يقبل رسالة الحفظ من سكربت ترجمان أو صفحة الإضافة وحدهما، ويقرأ الوضع من
// التفضيلات لا من الرسالة، ويتحقق قبل أي تنزيل، ويحفظ النص UTF-8 في رابط data:، ويسجّل المعرّف.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSaveService, dataUrl } from '../../../src/background/save-service.js';
import { createStore } from '../../../src/core/store/index.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { NOW } from '../../helpers/fixtures.js';

const ID = 'abcdefghijklmnopabcdefghijklmnop';
const runtime = { id: ID, getURL: (p) => `chrome-extension://${ID}/${p}`, onMessage: { listeners: new Set(), addListener(f) { this.listeners.add(f); }, removeListener(f) { this.listeners.delete(f); } } };
const fromYoutube = { id: ID, tab: { id: 3 }, url: 'https://www.youtube.com/watch?v=iG9CE55wbtY' };
const fromPage = { id: ID, url: `chrome-extension://${ID}/pages/library/index.html` };

function make({ mode = 'downloads', folder = 'Tarjuman' } = {}) {
  const store = createStore({ area: createMemoryArea({ unlimited: true }), now: () => Date.parse(NOW) });
  const calls = [];
  const downloads = {
    async download(o) { calls.push(o); return 12; },
    async search({ id }) { return [{ id, state: 'complete', exists: true, filename: '/x' }]; },
  };
  const svc = createSaveService({ runtime, downloads, store, settle: { pollMs: 1, timeoutMs: 10, wait: async () => {} } });
  return { svc, store, calls, ready: store.setPrefs({ saveLocation: { mode, folder } }) };
}
const req = (file = { name: 'a.ar.srt', text: 'سطر عربي' }) => ({ type: 'tj:save-file', v: 1, file });

test('المرسِل: سكربت ترجمان على يوتيوب وصفحات الإضافة وحدهما؛ غيرهما بلا رد ولا تنزيل', async () => {
  const { svc, calls, ready } = make();
  await ready;
  assert.equal(svc.handle(req(), { id: 'otherextensionidotherextensionid', tab: { id: 1 }, url: 'https://www.youtube.com/' }), null);
  assert.equal(svc.handle(req(), { id: ID, tab: { id: 1 }, url: 'https://evil.example/' }), null);
  assert.equal(svc.handle(req(), { id: ID, url: 'https://www.youtube.com/' }), null, 'بلا تبويب ليس سكربت محتوى');
  assert.equal(svc.handle({ ...req(), mode: 'ask' }, fromYoutube), null, 'رسالة بحقل زائد تُتجاهل');
  assert.equal(svc.handle({ type: 'tj:get-video-state', v: 1 }, fromYoutube), null);
  assert.equal(calls.length, 0);
  assert.deepEqual(await svc.handle(req(), fromYoutube), { v: 1, ok: true, mode: 'downloads', downloadId: 12 });
  assert.deepEqual(await svc.handle(req(), fromPage), { v: 1, ok: true, mode: 'downloads', downloadId: 12 });
});

test('الوضع من التفضيلات لا من الرسالة، والنص UTF-8 في رابط data:، والمعرّف يُسجَّل', async () => {
  const { svc, calls, store, ready } = make({ mode: 'subfolder', folder: 'ترجماتي' });
  await ready;
  const r = await svc.handle(req(), fromYoutube);
  assert.deepEqual(r, { v: 1, ok: true, mode: 'subfolder', downloadId: 12 });
  assert.equal(calls[0].filename, 'ترجماتي/a.ar.srt');
  assert.equal(calls[0].saveAs, false);
  assert.equal(calls[0].conflictAction, 'uniquify');
  const [head, b64] = calls[0].url.split(',');
  assert.equal(head, 'data:application/x-subrip;charset=utf-8;base64');
  assert.equal(Buffer.from(b64, 'base64').toString('utf8'), 'سطر عربي');
  assert.equal((await store.getLastSave()).downloadId, 12);
});

test('التحقق قبل أي تنزيل: اسم مسار أو امتداد آخر أو حجم فوق حد القناة', async () => {
  const { svc, calls, ready } = make();
  await ready;
  assert.deepEqual(await svc.handle(req({ name: '../../x.srt', text: '' }), fromYoutube), { v: 1, ok: false, code: 'SV_BAD_FILE' });
  assert.deepEqual(await svc.handle(req({ name: 'x.html', text: '' }), fromYoutube), { v: 1, ok: false, code: 'SV_BAD_FILE' });
  assert.deepEqual(await svc.handle(req({ name: 'x.srt', text: 'x'.repeat(16 * 1024 * 1024 + 1) }), fromYoutube), { v: 1, ok: false, code: 'SV_TOO_LARGE' });
  assert.equal(calls.length, 0);
});

test('المستمع يرد بوعد (return true) لرسالة الحفظ وحدها', async () => {
  const { svc, ready } = make();
  await ready;
  const off = svc.install();
  const [listener] = runtime.onMessage.listeners;
  let replied;
  const done = new Promise((r) => { replied = r; });
  assert.equal(listener(req(), fromYoutube, replied), true);
  assert.deepEqual(await done, { v: 1, ok: true, mode: 'downloads', downloadId: 12 });
  assert.equal(listener({ type: 'x' }, fromYoutube, () => assert.fail('لا رد')), undefined);
  off();
  assert.equal(runtime.onMessage.listeners.size, 0);
});

test('dataUrl: نص عربي كبير بدفعات دون فقد', () => {
  const text = 'ترجمان '.repeat(20000);
  const b64 = dataUrl(text, 'text/plain;charset=utf-8').split(',')[1];
  assert.equal(Buffer.from(b64, 'base64').toString('utf8'), text);
});
