// N-04: غلافا fetch وXHR في عالم الصفحة يمرّران استدعاء الصفحة كما هو: كل المعاملات بعددها وهويتها، ونتيجته. سقوط خيارات الطلب أو
// async والمستخدم وكلمة المرور أو جسم الطلب يكسر طلبات يوتيوب نفسها، في أي صفحة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { videoIdFromLocation } from '../../../src/core/model/video-location.js';
import { readTimedtextParams } from '../../../src/extract/timedtext-params.js';

const SOURCE = readFileSync(new URL('../../../src/main-world/capture.js', import.meta.url), 'utf8');
const IMPORT_LINES = /^import \{ (?:readTimedtextParams|videoIdFromLocation) \} from '[^']+';\s*$/gm;
const ORIGIN = 'https://www.youtube.com';
const TIMEDTEXT = `${ORIGIN}/api/timedtext?v=AAAAAAAAAAA&lang=en&fmt=json3`;
const OTHER = `${ORIGIN}/youtubei/stats`;

function load() {
  const calls = { fetch: [], open: [], send: [] };
  class FakeXHR {
    addEventListener() {}
    open(...args) { calls.open.push({ self: this, args }); return 'open-result'; }
    send(...args) { calls.send.push({ self: this, args }); return 'send-result'; }
  }
  const result = Promise.resolve(new Response('{}', { status: 200 }));
  const win = {
    location: { origin: ORIGIN, href: `${ORIGIN}/watch?v=AAAAAAAAAAA` },
    postMessage() {},
    fetch(...args) { calls.fetch.push({ self: this, args }); return result; },
    XMLHttpRequest: FakeXHR,
  };
  const ctx = vm.createContext({ window: win, URL, Response, Request, TextDecoder, WeakMap, Promise, JSON, String, readTimedtextParams, videoIdFromLocation });
  vm.runInContext(SOURCE.replace(IMPORT_LINES, ''), ctx);
  return { win, calls, result };
}

for (const [label, url] of [['طلب timedtext', TIMEDTEXT], ['طلب آخر', OTHER]]) {
  test(`fetch يمرّر ${label} بخياراته نفسها وهويتها ويعيد نتيجته`, () => {
    const { win, calls, result } = load();
    const init = { method: 'POST', body: 'b', credentials: 'include' };
    const got = win.fetch(url, init);
    assert.equal(calls.fetch.length, 1, 'طلب واحد');
    assert.equal(calls.fetch[0].args.length, 2);
    assert.ok(calls.fetch[0].args[0] === url);
    assert.ok(calls.fetch[0].args[1] === init, 'الخيارات هي نفسها');
    assert.ok(calls.fetch[0].self === win);
    assert.ok(got === result, 'النتيجة نفسها');
  });
}

test('fetch بمعامل واحد لا يختلق معاملًا ثانيًا', () => {
  const { win, calls } = load();
  win.fetch(OTHER);
  assert.equal(calls.fetch[0].args.length, 1);
});

for (const [label, url] of [['timedtext', TIMEDTEXT], ['غيره', OTHER]]) {
  test(`XHR.open يمرّر async والمستخدم وكلمة المرور (${label})`, () => {
    const { win, calls } = load();
    const x = new win.XMLHttpRequest();
    const out = x.open('POST', url, false, 'user', 'pass');
    assert.deepEqual(calls.open[0].args, ['POST', url, false, 'user', 'pass']);
    assert.ok(calls.open[0].self === x);
    assert.equal(out, 'open-result');
  });

  test(`XHR.send يمرّر جسم الطلب نفسه (${label})`, () => {
    const { win, calls } = load();
    const x = new win.XMLHttpRequest();
    x.open('POST', url);
    const body = { marker: 1 };
    const out = x.send(body);
    assert.equal(calls.send[0].args.length, 1);
    assert.ok(calls.send[0].args[0] === body, 'الجسم هو نفسه');
    assert.ok(calls.send[0].self === x);
    assert.equal(out, 'send-result');
  });
}

test('XHR.open بمعاملين وXHR.send بلا جسم لا يختلقان معاملات', () => {
  const { win, calls } = load();
  const x = new win.XMLHttpRequest();
  x.open('GET', OTHER);
  x.send();
  assert.equal(calls.open[0].args.length, 2);
  assert.equal(calls.send[0].args.length, 0);
});
