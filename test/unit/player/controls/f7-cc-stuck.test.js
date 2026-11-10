// ف7 (2026-11-10): رسالة صادقة حين تكون CC مفعّلة ولم يُلتقط شيء. قبل تشغيل CC تبقى «فعّل ترجمة يوتيوب (CC)…»، وزر CC مضغوط
// ولا التقاط بعد ثانيتين ⇒ «مفعّلة لكن ترجمان لم يلتقطها. أوقف CC ثم شغّلها…». وفي غلافي الالتقاط عدّ الطلبات المرئية يُبلَّغ
// عند الطلب، والمستخرج يعدّها للفيديو المعروض في تشخيصه («طلبات مرئية: 0» حين لم يُرَ طلب). مقارنة العقد بـassert.ok.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { messageFor } from '../../../../src/core/errors/index.js';
import { videoIdFromLocation } from '../../../../src/core/model/video-location.js';
import { createExtractor } from '../../../../src/extract/index.js';
import { validateSeenMessage } from '../../../../src/extract/message.js';
import { readTimedtextParams } from '../../../../src/extract/timedtext-params.js';
import { mountControls } from '../../../../src/player/controls/index.js';
import { CC_GRACE_MS } from '../../../../src/player/controls/session.js';
import { addPlayer, createFakeEnv } from '../overlay/fake-dom.js';
import { addBar, click, fakeController, fakeFlows, inspect, makeState, trackInfo } from './harness.js';

/** صفحة بأدوات ترجمان وساعة تتقدّم مع المؤقتات. */
function page() {
  const env = createFakeEnv();
  let t = Date.parse('2026-11-10T12:00:00.000Z');
  const parts = addPlayer(env);
  const bar = addBar(env, parts);
  const controller = fakeController(makeState());
  const flows = fakeFlows();
  const handle = mountControls(controller, { doc: env.doc, win: env.win, exportFlow: flows.exportFlow, importFlow: flows.importFlow, now: () => t, uiFonts: null });
  const tick = (ms) => {
    for (let left = ms; left > 0; left -= 100) {
      t += Math.min(100, left);
      env.win.advance(Math.min(100, left));
    }
  };
  return { env, ...parts, ...bar, controller, handle, tick, ui: inspect(env, parts) };
}
const menuText = (p) => p.ui.menuText();

test('قبل تشغيل CC الرسالة القديمة، وCC مضغوط بلا التقاط بعد ثانيتين الرسالة الجديدة والقائمة مفتوحة', () => {
  const p = page();
  click(p.ui.btn('download'));
  assert.match(menuText(p), /فعّل ترجمة يوتيوب \(CC\)/);
  p.cc.setAttribute('aria-pressed', 'true');
  p.tick(CC_GRACE_MS - 600);
  assert.match(menuText(p), /فعّل ترجمة يوتيوب \(CC\)/, 'قبل المهلة');
  p.tick(1700);
  assert.ok(menuText(p).includes(messageFor('CT_CC_NOT_CAPTURED')), 'بعد المهلة، والقائمة مفتوحة يعيدها الفحص الدوري');
  assert.match(messageFor('CT_CC_NOT_CAPTURED'), /أوقف CC ثم شغّلها/);
  assert.match(messageFor('CT_CC_NOT_CAPTURED'), /تشخيص الصفحة/);
  // وصل الالتقاط: لا رسالة «لم يُلتقط» أصلًا.
  p.controller.set({ captured: [trackInfo()] });
  p.tick(1100);
  assert.ok(!menuText(p).includes(messageFor('CT_CC_NOT_CAPTURED')));
  p.handle.unmount();
});

test('إيقاف CC يعيد العدّ: تشغيلها من جديد ينتظر مهلته كاملة', () => {
  const p = page();
  p.cc.setAttribute('aria-pressed', 'true');
  p.tick(CC_GRACE_MS + 1100);
  p.cc.setAttribute('aria-pressed', 'false');
  p.tick(1100);
  p.cc.setAttribute('aria-pressed', 'true');
  p.tick(1100);
  click(p.ui.btn('download'));
  assert.ok(!menuText(p).includes(messageFor('CT_CC_NOT_CAPTURED')), 'لم تنقضِ المهلة بعد التشغيل الثاني');
  p.handle.unmount();
});

// ———— العدّ في غلافي الالتقاط والمستخرج ————

const SOURCE = readFileSync(new URL('../../../../src/main-world/capture.js', import.meta.url), 'utf8');
const IMPORT_LINES = /^import \{ (?:readTimedtextParams|videoIdFromLocation) \} from '[^']+';\s*$/gm;
const ORIGIN = 'https://www.youtube.com';
const TIMEDTEXT = `${ORIGIN}/api/timedtext?v=AAAAAAAAAAA&lang=en&fmt=json3`;

function loadCapture() {
  const posted = [];
  class FakeXHR {
    addEventListener() {}
    open() {}
    send() {}
  }
  const win = {
    location: { origin: ORIGIN, href: `${ORIGIN}/watch?v=AAAAAAAAAAA` },
    postMessage(m) { posted.push(m); },
    fetch() { return new Promise(() => {}); },
    XMLHttpRequest: FakeXHR,
  };
  vm.runInContext(SOURCE.replace(IMPORT_LINES, ''), vm.createContext({ window: win, URL, Response, Request, TextDecoder, WeakMap, Promise, JSON, String, readTimedtextParams, videoIdFromLocation }));
  return { win, posted };
}

test('الغلافان: كل طلب ترجمة يُبلَّغ عند الطلب نفسه (قبل استجابته) بمعرّف الفيديو وعدد، وغيره لا', () => {
  const { win, posted } = loadCapture();
  win.fetch(`${ORIGIN}/youtubei/v1/player`);
  assert.equal(posted.length, 0, 'طلب غير الترجمة لا يُعدّ');
  win.fetch(TIMEDTEXT);
  const x = new win.XMLHttpRequest();
  x.open('GET', TIMEDTEXT);
  x.send();
  assert.deepEqual(posted.map((m) => ({ ...m })), [
    { source: 'tarjuman', v: 1, kind: 'seen', videoId: 'AAAAAAAAAAA', seen: 1 },
    { source: 'tarjuman', v: 1, kind: 'seen', videoId: 'AAAAAAAAAAA', seen: 2 },
  ], 'أعداد ومعرّف فقط، بلا رابط ولا رمز');
});

test('رسالة «رُئي طلب»: المعرّف والعدد الصحيحان وحدهما، وغير ذلك مرفوض', () => {
  assert.deepEqual(validateSeenMessage({ source: 'tarjuman', v: 1, kind: 'seen', videoId: 'AAAAAAAAAAA', seen: 3, url: 'x' }), { videoId: 'AAAAAAAAAAA', seen: 3 });
  for (const bad of [{ seen: 0 }, { seen: 1.5 }, { seen: -1 }, { seen: 2_000_000 }, { kind: 'timedtext', seen: 1 }]) {
    assert.equal(validateSeenMessage({ source: 'tarjuman', v: 1, kind: 'seen', videoId: 'AAAAAAAAAAA', ...bad }), null, JSON.stringify(bad));
  }
  assert.equal(validateSeenMessage({ source: 'tarjuman', v: 1, kind: 'seen', videoId: 'bad', seen: 1 }).videoId, null);
});

test('المستخرج: «طلبات مرئية» للفيديو المعروض وحده، وصفر حين لم يُرَ طلب، ويُصفَّر بتغيّر الفيديو', () => {
  let current = 'AAAAAAAAAAA';
  const ex = createExtractor({ currentVideoId: () => current, now: () => 0 });
  assert.equal(ex.diagnostics().requestsSeen, 0, '«طلبات مرئية: 0»');
  const seen = (videoId, n) => ex.handleMessage({ source: 'tarjuman', v: 1, kind: 'seen', videoId, seen: n });
  assert.deepEqual(seen('AAAAAAAAAAA', 1), { accepted: true, code: null });
  seen('AAAAAAAAAAA', 2);
  seen('BBBBBBBBBBB', 3);
  assert.equal(ex.diagnostics().requestsSeen, 2);
  assert.equal(ex.diagnostics().requestsSeenPage, 3);
  current = 'BBBBBBBBBBB';
  ex.setVideo('BBBBBBBBBBB');
  assert.equal(ex.diagnostics().requestsSeen, 0);
});

// ———— من مراجعة المرحلة 6 ————

test('م1: أثناء الإعلان لا رسالة «لم يلتقطها» (المشغّل لا يجلب ترجمة الفيديو قبل انتهائه)، وبعده تبدأ المهلة من أولها', () => {
  const p = page();
  p.player.classList.add('ad-showing');
  p.cc.setAttribute('aria-pressed', 'true');
  p.tick(CC_GRACE_MS + 1500);
  click(p.ui.btn('download'));
  assert.ok(!menuText(p).includes(messageFor('CT_CC_NOT_CAPTURED')), 'لا إنذار أثناء الإعلان');
  p.player.classList.remove('ad-showing');
  p.tick(1100);
  assert.ok(!menuText(p).includes(messageFor('CT_CC_NOT_CAPTURED')), 'المهلة من انتهاء الإعلان');
  p.tick(CC_GRACE_MS);
  assert.ok(menuText(p).includes(messageFor('CT_CC_NOT_CAPTURED')));
  p.handle.unmount();
});

test('م2: التقاط مرفوض (captureIssue) يقول سببه وحده، بلا «لم يلتقطها» معه', () => {
  const p = page();
  p.controller.set({ captureIssue: { code: 'EX_NOT_ENGLISH' } });
  p.cc.setAttribute('aria-pressed', 'true');
  p.tick(CC_GRACE_MS + 1500);
  click(p.ui.btn('download'));
  assert.ok(!menuText(p).includes(messageFor('CT_CC_NOT_CAPTURED')));
  p.handle.unmount();
});
