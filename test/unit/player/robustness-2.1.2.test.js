// F-05: أزرار الشريط في صفحات المشاهدة وحدها. وF-04: الطبقة مركَّبة والمشغّل بلا عنصر فيديو يُبلَّغ برمز تشخيص لا صمتًا.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HEALTH_MS, mountControls } from '../../../src/player/controls/index.js';
import { mountOverlay } from '../../../src/player/overlay/index.js';
import { installMessageHandler } from '../../../src/content/messages.js';
import { toolsStatus } from '../../../src/pages/popup/status.js';
import { messageFor } from '../../../src/core/errors/index.js';
import { videoStateRequest } from '../../../src/core/model/messages.js';
import { createFakeChrome } from '../../helpers/chrome-storage.js';
import { videoRecord } from '../../helpers/fixtures.js';
import { addPlayer, createFakeEnv } from './overlay/fake-dom.js';
import { addBar, fakeController, fakeFlows } from './controls/harness.js';

const VIDEO = 'AAAAAAAAAAA';
const WATCH = `https://www.youtube.com/watch?v=${VIDEO}`;
const deps = (env) => {
  const flows = fakeFlows();
  return { doc: env.doc, win: env.win, exportFlow: flows.exportFlow, importFlow: flows.importFlow, uiFonts: null };
};
const controlsCount = (env) => env.doc.querySelectorAll('#tarjuman-controls').length;
const setUrl = (env, href) => {
  const u = new URL(href);
  env.win.location.href = href;
  env.win.location.pathname = u.pathname;
  env.win.location.search = u.search;
};

for (const [label, href] of [['الرئيسية', 'https://www.youtube.com/'], ['البحث', 'https://www.youtube.com/results?search_query=x'], ['Shorts', 'https://www.youtube.com/shorts/AAAAAAAAAAA'], ['الاشتراكات', 'https://www.youtube.com/feed/subscriptions']]) {
  test(`F-05: لا أزرار في ${label} ولو وُجد مشغّل وشريطه`, () => {
    const env = createFakeEnv({ href });
    const parts = addPlayer(env);
    addBar(env, parts);
    const handle = mountControls(fakeController(), deps(env));
    env.win.advance(HEALTH_MS * 2);
    assert.equal(handle.state, 'waiting');
    assert.equal(controlsCount(env), 0);
    assert.equal(handle.diagnostics().attempts, 0);
    handle.unmount();
  });
}

test('F-05: الأزرار تُركَّب في صفحة المشاهدة وفي /live/', () => {
  for (const href of [WATCH, 'https://www.youtube.com/live/AAAAAAAAAAA']) {
    const env = createFakeEnv({ href });
    const parts = addPlayer(env);
    addBar(env, parts);
    const handle = mountControls(fakeController(), deps(env));
    assert.equal(handle.state, 'mounted', href);
    assert.equal(controlsCount(env), 1);
    handle.unmount();
  }
});

test('F-05: الخروج من المشاهدة بالتنقل الداخلي يزيل الأزرار، والعودة تعيدها', () => {
  const env = createFakeEnv({ href: WATCH });
  const parts = addPlayer(env);
  addBar(env, parts);
  const handle = mountControls(fakeController(), deps(env));
  assert.equal(controlsCount(env), 1);
  setUrl(env, 'https://www.youtube.com/');
  env.win.advance(HEALTH_MS + 10);
  assert.equal(handle.state, 'waiting');
  assert.equal(controlsCount(env), 0);
  setUrl(env, WATCH);
  env.win.advance(HEALTH_MS + 10);
  assert.equal(handle.state, 'mounted');
  assert.equal(controlsCount(env), 1);
  handle.unmount();
});

const overlayDeps = (env) => ({ doc: env.doc, win: env.win, fonts: null });

test('F-04: عنصر الفيديو موجود: لا رمز', () => {
  const env = createFakeEnv({ href: WATCH });
  addPlayer(env);
  const handle = mountOverlay(fakeController(), overlayDeps(env));
  assert.equal(handle.state, 'mounted');
  assert.equal(handle.diagnostics().videoCode, null);
  handle.unmount();
});

function withoutVideo() {
  const env = createFakeEnv({ href: WATCH });
  const parts = addPlayer(env);
  parts.video.remove();
  const handle = mountOverlay(fakeController(), overlayDeps(env));
  return { env, handle };
}

test('F-04: الطبقة مركَّبة بلا عنصر فيديو: رمز في التشخيص', () => {
  const { handle } = withoutVideo();
  assert.equal(handle.state, 'mounted');
  assert.equal(handle.diagnostics().videoCode, 'PL_NO_VIDEO_ELEMENT');
  handle.unmount();
});

async function replyFor(mounted) {
  const fake = createFakeChrome();
  installMessageHandler({ controller: { getState: () => ({ videoId: VIDEO, title: 't', loading: false, saved: videoRecord(), captured: [], captureIssue: null, view: { displayOffsetMs: 0, displayMode: 'ar' } }) }, mounted, runtime: fake.chrome.runtime });
  return fake.dispatchMessage(videoStateRequest());
}

test('F-04: الرمز يصل رد نافذة الإضافة، ونصها لا يقول إن الأدوات جاهزة', async () => {
  const { handle } = withoutVideo();
  const reply = await replyFor({ overlay: handle, controls: { state: 'mounted' } });
  assert.equal(reply.tools.code, 'PL_NO_VIDEO_ELEMENT');
  const status = toolsStatus({ watch: true, mounted: { overlay: 'mounted', controls: 'mounted' }, tools: reply.tools });
  assert.equal(status.tone, 'danger');
  assert.equal(status.reason, messageFor('PL_NO_VIDEO_ELEMENT'));
  handle.unmount();
});

test('F-04: المركَّب السليم بلا رمز يبقى «جاهزة»', () => {
  const status = toolsStatus({ watch: true, mounted: { overlay: 'mounted', controls: 'mounted' }, tools: { code: null } });
  assert.equal(status.tone, 'success');
});
