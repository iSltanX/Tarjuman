// ف10 (2026-11-10): بدل «بانتظار المشغّل» إلى الأبد: في صفحة مشاهدة فيها عنصر فيديو ولا مشغّل يوتيوب أو شريطه، بعد مهلة
// سخيّة حالة خطأ باسم (CT_PLAYER_NOT_FOUND في الأدوات، PL_PLAYER_NOT_FOUND في الطبقة) تتعافى حين يظهر ما غاب. وفي تشخيص الصفحة
// خريطة وجود العناصر (نعم أو لا) وتشخيص اللوحة. صفحة غير المشاهدة، أو بلا فيديو بعد، تبقى «بانتظار».
// مقارنة العقد بـassert.ok(a === b) لا assert.equal (رأس fake-dom.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { domPresence, installMessageHandler } from '../../../src/content/messages.js';
import { MSG } from '../../../src/core/model/messages.js';
import { messageFor } from '../../../src/core/errors/index.js';
import { toolsStatus } from '../../../src/pages/popup/status.js';
import { mountControls } from '../../../src/player/controls/index.js';
import { PLAYER_WAIT_MS, mountOverlay } from '../../../src/player/overlay/index.js';
import { SELECTORS } from '../../../src/player/youtube-dom.js';
import { createFakeChrome } from '../../helpers/chrome-storage.js';
import { addPlayer, createFakeEnv } from './overlay/fake-dom.js';
import { addBar, fakeController, fakeFlows } from './controls/harness.js';

/** بيئة بساعة واحدة للمؤقتات و now. */
function clockEnv(href) {
  const env = createFakeEnv(href ? { href } : {});
  let t = 0;
  env.now = () => t;
  // الساعة تتقدّم مع المؤقتات بخطوات صغيرة، فيرى now() الزمن الذي يقع فيه كل فحص.
  env.tick = (ms) => {
    for (let left = ms; left > 0; left -= 100) {
      const step = Math.min(100, left);
      t += step;
      env.win.advance(step);
    }
  };
  return env;
}
const controlsOn = (env) => mountControls(fakeController(), { doc: env.doc, win: env.win, now: env.now, uiFonts: null, ...fakeFlows() });

test('الأدوات: مشغّل بفيديو بلا شريط ⇒ «بانتظار» قبل المهلة، ثم CT_PLAYER_NOT_FOUND بالعنصر الغائب، ثم «تعمل» حين يظهر الشريط', () => {
  const env = clockEnv();
  const handle = controlsOn(env);
  const parts = addPlayer(env);
  env.tick(PLAYER_WAIT_MS - 2000);
  assert.equal(handle.state, 'waiting', 'قبل المهلة');
  env.tick(3000);
  assert.equal(handle.state, 'error');
  const d = handle.diagnostics();
  assert.equal(d.lastCode, 'CT_PLAYER_NOT_FOUND');
  assert.equal(d.lastDetail, 'missing=rightControls');
  addBar(env, parts);
  env.tick(1100);
  assert.equal(handle.state, 'mounted', 'يتعافى بلا إعادة تحميل');
  assert.equal(handle.diagnostics().lastCode, null, 'لا يبقى رمز ما تعافى منه');
  handle.unmount();
});

test('الأدوات: صفحة غير المشاهدة بلا مشغّل، ومشاهدة بلا عنصر فيديو بعد: «بانتظار» مهما طال', () => {
  const home = clockEnv('https://www.youtube.com/');
  const h1 = controlsOn(home);
  home.tick(PLAYER_WAIT_MS * 3);
  assert.equal(h1.state, 'waiting');
  h1.unmount();
  const empty = clockEnv();
  const h2 = controlsOn(empty);
  empty.tick(PLAYER_WAIT_MS * 3);
  assert.equal(h2.state, 'waiting', 'الصفحة ما زالت تُحمَّل');
  h2.unmount();
});

test('الطبقة: فيديو في الصفحة بلا #movie_player ⇒ PL_PLAYER_NOT_FOUND بعد المهلة، والمشغّل حين يظهر يعيدها', () => {
  const env = clockEnv();
  const handle = mountOverlay(fakeController(), { doc: env.doc, win: env.win, now: env.now, fonts: null });
  env.doc.body.appendChild(env.doc.createElement('video'));
  env.tick(PLAYER_WAIT_MS + 1000);
  assert.equal(handle.state, 'error');
  assert.equal(handle.diagnostics().lastCode, 'PL_PLAYER_NOT_FOUND');
  assert.equal(handle.diagnostics().lastDetail, 'missing=player');
  addPlayer(env);
  env.tick(1100);
  assert.equal(handle.state, 'mounted');
  handle.unmount();
});

test('الطبقة خارج صفحة المشاهدة لا تخطئ (الصفحة الرئيسية فيها فيديو معاينة ولا مشغّل)', () => {
  const env = clockEnv('https://www.youtube.com/');
  const handle = mountOverlay(fakeController(), { doc: env.doc, win: env.win, now: env.now, fonts: null });
  env.doc.body.appendChild(env.doc.createElement('video'));
  env.tick(PLAYER_WAIT_MS * 2);
  assert.equal(handle.state, 'waiting');
  handle.unmount();
});

test('خريطة وجود العناصر: نعم أو لا لكل محدد في youtube-dom، بلا نص', () => {
  const env = createFakeEnv();
  addPlayer(env);
  const map = domPresence(env.doc);
  assert.deepEqual(Object.keys(map).sort(), [...Object.keys(SELECTORS), 'anyVideo'].sort());
  assert.ok(Object.values(map).every((v) => v === true || v === false));
  assert.equal(map.player, true);
  assert.equal(map.video, true);
  assert.equal(map.rightControls, false, 'العنصر الغائب مسمّى');
});

test('تشخيص الصفحة: قسما dom (الخريطة) وpanel (تشخيص اللوحة) مع الأدوات والطبقة', async () => {
  const fake = createFakeChrome();
  installMessageHandler({
    controller: { getState: () => ({ videoId: 'AAAAAAAAAAA' }), diagnostics: () => ({ ok: 1 }) },
    mounted: { overlay: { state: 'mounted', diagnostics: () => ({ state: 'mounted' }) }, controls: { state: 'error', diagnostics: () => ({ state: 'error', lastCode: 'CT_PLAYER_NOT_FOUND' }) }, panel: { diagnostics: () => ({ mode: 'none', rows: 0 }) } },
    runtime: fake.chrome.runtime,
    dom: () => ({ player: true, rightControls: false }),
  });
  const r = await fake.dispatchMessage({ type: MSG.getPageDiagnostics, v: 1 });
  assert.deepEqual(r.sections.dom, { player: true, rightControls: false });
  assert.deepEqual(r.sections.panel, { mode: 'none', rows: 0 });
  assert.equal(r.sections.mounted.controls.lastCode, 'CT_PLAYER_NOT_FOUND');
});

test('النافذة: الأدوات في الخطأ بهذا الرمز ⇒ العنوان والسبب «لم يجد ترجمان شريط مشغّل يوتيوب…»', () => {
  const s = toolsStatus({ watch: true, mounted: { controls: 'error', overlay: 'mounted' }, tools: { controls: 'error', overlay: 'mounted', code: 'CT_PLAYER_NOT_FOUND' } });
  assert.equal(s.tone, 'danger');
  assert.equal(s.reason, messageFor('CT_PLAYER_NOT_FOUND'));
  assert.match(s.reason, /لم يجد ترجمان شريط مشغّل يوتيوب/);
  assert.match(s.reason, /يوتيوب غيّر صفحته/);
  assert.match(s.reason, /تشخيص الصفحة/);
});
