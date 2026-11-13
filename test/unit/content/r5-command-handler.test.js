// الفكرة ١٠، المسار (ب) (ح-55؛ عقد messages §٩): معالج الرسائل في سكربت المحتوى يقبل tj:command من العامل الخلفي للإضافة نفسها وحده،
// ويمرّر اسم الأمر إلى مقبض أدوات الشريط (mounted.controls.command). ورسالة الأمر من صفحة إضافة (النافذة) أو إضافة أخرى أو موقع
// تُتجاهل بلا رد ولا فعل، كما تُتجاهل رسائل المرسِل الغريب في الأقسام الأخرى. والأمر بلا أدوات مركّبة (صفحة ليست مشاهدة) لا يفعل شيئًا.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installMessageHandler } from '../../../src/content/messages.js';
import { commandRequest, seekRequest } from '../../../src/core/model/messages.js';
import { createFakeChrome } from '../../helpers/chrome-storage.js';

const ID = 'abcdefghijklmnopabcdefghijklmnop';
const BASE = `chrome-extension://${ID}/`;
const WORKER = { id: ID, url: `${BASE}background/worker.js`, origin: `chrome-extension://${ID}` };
const POPUP = { id: ID, url: `${BASE}pages/popup/index.html` };

function setup({ controls = 'session', videoId = 'AAAAAAAAAAA' } = {}) {
  const fake = createFakeChrome({ id: ID });
  const commands = [];
  const seeks = [];
  const handle = controls === 'session'
    ? { state: 'mounted', command: (name) => { commands.push(name); return { ok: true }; } }
    : controls === 'none' ? { state: 'waiting', command: () => ({ ok: false, code: 'TJ_NO_VIDEO' }) } : undefined;
  installMessageHandler({
    controller: { getState: () => ({ videoId, captured: [], view: { displayOffsetMs: 0, displayMode: 'ar' } }) },
    mounted: { overlay: { state: 'mounted' }, controls: handle },
    runtime: fake.chrome.runtime,
    seek: (ms) => { seeks.push(ms); return true; },
  });
  return { fake, commands, seeks };
}

test('من العامل الخلفي: الأمر يصل مقبض الأدوات باسمه، والرد { v: 1, ok: true }', async () => {
  const { fake, commands } = setup();
  for (const name of ['display-mode', 'offset-earlier', 'offset-later', 'mark-review', 'replay-line']) {
    assert.deepEqual(await fake.dispatchMessage(commandRequest(name), WORKER), { v: 1, ok: true }, name);
  }
  assert.deepEqual(commands, ['display-mode', 'offset-earlier', 'offset-later', 'mark-review', 'replay-line']);
});

test('من غير العامل: النافذة وصفحات الإضافة وإضافة أخرى وموقع ومرسِل في تبويب يُتجاهلون بلا رد ولا فعل', async () => {
  const { fake, commands } = setup();
  for (const sender of [
    POPUP,
    { id: ID, url: `${BASE}pages/settings/index.html` },
    { id: ID, url: `${BASE}background/worker.js`, tab: { id: 4 } },
    { id: ID, url: `${BASE}background/worker.js.evil` },
    { id: 'otherextensionidotherextensionid', url: `chrome-extension://otherextensionidotherextensionid/background/worker.js` },
    { id: ID, tab: { id: 4 }, url: 'https://www.youtube.com/watch?v=AAAAAAAAAAA' },
    { url: 'https://evil.example/' },
  ]) assert.equal(await fake.dispatchMessage(commandRequest('mark-review'), sender), undefined, JSON.stringify(sender));
  assert.deepEqual(commands, [], 'لم يُنفَّذ أمر');
});

test('من العامل: طلب معيب يُرفض برمز ولا يُنفَّذ، والعامل لا يغيّر قبول الرسائل الأخرى', async () => {
  const { fake, commands, seeks } = setup();
  for (const bad of [{ type: 'tj:command', v: 1, name: 'seek' }, { type: 'tj:command', v: 1 }, { type: 'tj:command', v: 1, name: 'mark-review', extra: 1 }]) {
    assert.deepEqual(await fake.dispatchMessage(bad, WORKER), { v: 1, ok: false, code: 'TJ_BAD_MESSAGE' }, JSON.stringify(bad));
  }
  assert.deepEqual(commands, []);
  // القفز من صفحة الإضافة باقٍ كما كان.
  assert.deepEqual(await fake.dispatchMessage(seekRequest('AAAAAAAAAAA', 1000), POPUP), { v: 1, ok: true, ms: 1000 });
  assert.deepEqual(seeks, [1000]);
});

test('بلا أدوات مركّبة (صفحة ليست مشاهدة، أو قبل التركيب): لا فعل، والرد برمزه', async () => {
  const none = setup({ controls: 'none', videoId: null });
  assert.deepEqual(await none.fake.dispatchMessage(commandRequest('replay-line'), WORKER), { v: 1, ok: false, code: 'TJ_NO_VIDEO' });
  const absent = setup({ controls: 'absent' });
  assert.deepEqual(await absent.fake.dispatchMessage(commandRequest('replay-line'), WORKER), { v: 1, ok: false, code: 'TJ_NO_VIDEO' });
});
