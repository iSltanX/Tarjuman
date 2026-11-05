// تدقيق 7a66f91، C8 (U65، CDX-S6 وDS-T-10): جسر الحزام في بناء التطوير لا يجيب إلا جلسة الحزام برمزها. كان يجيب أي سكربت في
// صفحة يوتيوب (المصدر النافذة نفسها) بنصوص المقاطع كلها واسم الملف والسطر المعروض. بنافذة وهمية وخطاف تطوير اصطناعي، لا متصفح.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const TOKEN = 'a'.repeat(32);
let round = 0;

/** يحمّل نسخة جديدة من الجسر برمز البناء المعطى (أو بلا رمز)، ويعيد دالة سؤال كما يسأل سكربت في الصفحة. */
async function loadBridge(token) {
  const listeners = [];
  const received = [];
  const win = {
    addEventListener: (k, fn) => { if (k === 'message') listeners.push(fn); },
    postMessage: (data, target) => { received.push({ data, target }); },
  };
  globalThis.window = win;
  if (token === undefined) delete globalThis.__TJ_HARNESS_TOKEN__;
  else globalThis.__TJ_HARNESS_TOKEN__ = token;
  const cues = [1, 2].map((n) => ({ n, text: `synthetic-private-cue-${n}` }));
  globalThis.__tarjuman = {
    controller: { getState: () => ({ videoId: 'SYNTHETIC01', title: 't', loading: false, captured: [], activeSlot: 1, view: 'ar', arabic: { cues, fileName: 'private.ar.srt', edited: true }, english: null }) },
    mounted: { overlay: { state: 'on', peek: () => ({ lines: [{ text: 'on-screen' }] }) }, controls: { state: 'on', peek: () => ({}) }, panel: null },
  };
  round += 1;
  await import(`../../../src/dev/harness-bridge.js?round=${round}`);
  const ask = async (op, args = [], extra = {}, source = win) => {
    received.length = 0;
    for (const fn of listeners) await fn({ source, origin: 'https://www.youtube.com', data: { source: 'tarjuman-harness', op, args, id: 'x', ...extra } });
    return received[0] ?? null;
  };
  return { ask, listeners };
}

test.afterEach(() => {
  delete globalThis.window;
  delete globalThis.__tarjuman;
  delete globalThis.__TJ_HARNESS_TOKEN__;
});

test('بلا رمز أو برمز خاطئ لا رد أصلًا: لا نصوص ولا اسم ملف ولا السطر المعروض', async () => {
  const { ask } = await loadBridge(TOKEN);
  for (const extra of [{}, { token: null }, { token: '' }, { token: 'b'.repeat(32) }, { token: TOKEN.slice(1) }]) {
    assert.equal(await ask('state', [], extra), null, JSON.stringify(extra));
    assert.equal(await ask('cueText', [1], extra), null);
    assert.equal(await ask('overlay', [], extra), null);
    assert.equal(await ask('stubClipboard', [], extra), null);
    assert.equal(await ask('ping', [], extra), null, 'ولا يكشف وجوده');
  }
});

test('برمز الجلسة يجيب كما كان، ومن مصدر آخر (إطار) لا يجيب ولو بالرمز', async () => {
  const { ask } = await loadBridge(TOKEN);
  const st = await ask('state', [], { token: TOKEN });
  assert.equal(st.data.ok, true);
  assert.equal(st.data.value.arabic.count, 2);
  assert.equal((await ask('cueText', [2], { token: TOKEN })).data.value, 'synthetic-private-cue-2');
  assert.equal(await ask('cueText', [1], { token: TOKEN }, {}), null);
  assert.equal(await ask('__proto__', [], { token: TOKEN }), null, 'عملية مجهولة');
});

test('بناء بلا رمز (أو برمز قصير) لا يجيب أحدًا', async () => {
  for (const t of [undefined, null, 'short', 12345]) {
    const { ask } = await loadBridge(t);
    assert.equal(await ask('state', [], { token: t }), null, String(t));
    assert.equal(await ask('state', [], { token: undefined }), null);
  }
});
