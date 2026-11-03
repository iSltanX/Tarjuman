// نقطة تركيب الأدوات (P6-AC1 الجزء الآلي): الانتظار عند document_start حتى يظهر المشغّل وشريطه، والإدراج أول أدوات
// الشريط اليمنى دون تغيير ترتيب أدوات يوتيوب، والإعادة بعد إعادة رسم الشريط أو المشغّل، والطبقة داخل المشغّل،
// والمتانة عند الإخفاق، والتنظيف عند الإلغاء.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HEALTH_MS, mountControls } from '../../../../src/player/controls/index.js';
import { addPlayer, createFakeEnv } from '../overlay/fake-dom.js';
import { addBar, fakeController, fakeFlows, inspect, makeState, mountPage } from './harness.js';

const deps = (env, flows = fakeFlows()) => ({ doc: env.doc, win: env.win, exportFlow: flows.exportFlow, importFlow: flows.importFlow });

test('عند document_start بلا مشغّل: ينتظر ثم يركّب فور ظهور المشغّل وشريطه، مرة واحدة', () => {
  const env = createFakeEnv();
  const handle = mountControls(fakeController(), deps(env));
  assert.equal(handle.state, 'waiting');
  const parts = addPlayer(env);
  env.win.advance(60);
  assert.equal(handle.state, 'waiting', 'المشغّل بلا شريط أدوات بعد');
  const bar = addBar(env, parts);
  env.win.advance(60);
  assert.equal(handle.state, 'mounted');
  assert.equal(bar.right.firstChild.id, 'tarjuman-controls', 'أول أدوات الشريط اليمنى');
  env.win.advance(HEALTH_MS * 5);
  assert.equal(env.doc.querySelectorAll('#tarjuman-controls').length, 1, 'الفحص الدوري لا يكرر المجموعة');
  assert.equal(parts.player.children.filter((c) => c.id === 'tarjuman-controls-layer').length, 1, 'الطبقة داخل المشغّل نفسه');
  assert.equal(handle.diagnostics().attempts, 1);
});

test('الإدراج قبل أدوات يوتيوب ولا يغيّر ترتيبها', () => {
  const page = mountPage();
  const ids = page.right.children.map((c) => c.id || c.className);
  assert.deepEqual(ids, ['tarjuman-controls', 'ytp-button ytp-subtitles-button', 'ytp-button ytp-settings-button', 'ytp-button ytp-fullscreen-button']);
  assert.deepEqual(page.ui.kinds(), ['download', 'upload', 'panel', 'minus', 'badge', 'plus'], 'ترتيب ثابت LTR');
});

test('يوتيوب يعيد رسم الشريط الأيمن بعنصر جديد: تعود المجموعة إلى بدايته دون إعادة بناء الجلسة', () => {
  const page = mountPage();
  const host = page.ui.groupHost();
  const fresh = page.env.doc.createElement('div');
  fresh.className = 'ytp-right-controls';
  const cc = page.env.doc.createElement('button');
  cc.className = 'ytp-button ytp-subtitles-button';
  fresh.appendChild(cc);
  page.right.remove();
  page.controls.appendChild(fresh);
  page.env.win.advance(HEALTH_MS + 10);
  assert.ok(fresh.firstChild === host, 'المجموعة نفسها نُقلت');
  assert.equal(page.handle.diagnostics().attempts, 1, 'الجلسة نفسها');
  assert.ok(page.handle.diagnostics().session.reinserts >= 1);
});

test('زر أُدرج قبل المجموعة: تعود أول الشريط خلال دفعة واحدة (مراقب الشريط)', () => {
  const page = mountPage();
  const intruder = page.env.doc.createElement('button');
  intruder.className = 'ytp-button ytp-autonav';
  page.right.insertBefore(intruder, page.right.firstChild);
  page.env.win.advance(60);
  assert.equal(page.right.firstChild.id, 'tarjuman-controls');
  assert.ok(page.right.children[1] === intruder, 'ترتيب أدوات يوتيوب كما هو');
});

test('يوتيوب يعيد رسم المشغّل كله: جلسة جديدة عليه، ولا يبقى شيء على القديم', () => {
  const page = mountPage();
  const oldLayer = page.ui.layerHost();
  const oldGroup = page.ui.groupHost();
  page.player.remove();
  const parts = addPlayer(page.env);
  const bar = addBar(page.env, parts);
  page.env.win.advance(HEALTH_MS + 10);
  assert.equal(page.handle.state, 'mounted');
  assert.equal(bar.right.firstChild.id, 'tarjuman-controls');
  assert.ok(bar.right.firstChild !== oldGroup);
  assert.equal(oldLayer.isConnected, false);
  assert.equal(page.handle.diagnostics().attempts, 2);
  assert.equal(page.controller.subscribers(), 1, 'اشتراك واحد');
});

test('إلغاء التركيب: يزيل المجموعة والطبقة والمراقبات والمستمعين، والحالة stub', () => {
  const page = mountPage();
  const docListeners = ['pointerdown', 'keydown', 'yt-navigate-finish', 'yt-page-data-updated'].map((t) => page.env.doc.listenerCount(t));
  assert.ok(docListeners.every((n) => n >= 1), JSON.stringify(docListeners));
  page.handle.unmount();
  assert.equal(page.handle.state, 'stub');
  assert.ok(page.ui.groupHost() === null);
  assert.ok(page.ui.layerHost() === null);
  assert.deepEqual(['pointerdown', 'keydown', 'yt-navigate-finish', 'yt-page-data-updated'].map((t) => page.env.doc.listenerCount(t)), [0, 0, 0, 0]);
  assert.equal(page.controller.subscribers(), 0);
  assert.equal(page.env.observers(), 0);
  assert.equal(page.env.win.pendingTimers(), 0, 'لا مؤقت باقٍ');
  page.handle.unmount();
});

test('إخفاق التركيب لا يرمي: الحالة error برمز CT_MOUNT_FAILED، ويتوقف بعد ثلاث محاولات حتى صفحة جديدة', () => {
  const env = createFakeEnv();
  const parts = addPlayer(env);
  addBar(env, parts);
  const broken = { ...fakeController(), subscribe() { throw new Error('boom'); } };
  const handle = mountControls(broken, deps(env));
  assert.equal(handle.state, 'error');
  assert.equal(handle.diagnostics().lastCode, 'CT_MOUNT_FAILED');
  env.win.advance(HEALTH_MS * 6);
  assert.equal(handle.diagnostics().attempts, 3);
  assert.equal(env.doc.querySelectorAll('#tarjuman-controls').length, 0, 'لا بقايا');
  env.doc.dispatchEvent({ type: 'yt-navigate-finish' });
  env.win.advance(60);
  assert.equal(handle.diagnostics().attempts, 4, 'صفحة جديدة تعيد المحاولة');
});

test('الحالة حية على المقبض نفسه، والتشخيص أعداد ورموز بلا نص', () => {
  const page = mountPage({ state: makeState({ arabic: { cues: [], edited: false, fileName: 'سري.srt', comparison: null } }) });
  assert.equal(page.handle.state, 'mounted');
  const d = JSON.stringify(page.handle.diagnostics());
  assert.equal(d.includes('سري'), false, 'لا اسم ملف في التشخيص');
  assert.equal(page.handle.diagnostics().session.styleMode.group, 'adopted');
  void inspect;
});

test('خطوط الواجهة تُطلب عند أول تركيب ناجح مرة واحدة، ونتيجتها رموز في التشخيص؛ وإعادة التركيب لا تعيد الطلب بعد نجاحه', async () => {
  const env = createFakeEnv();
  const calls = [];
  const uiFonts = async (e) => {
    calls.push(e.doc === env.doc);
    return { loaded: ['cairo', 'almarai'], failed: [] };
  };
  const handle = mountControls(fakeController(), { ...deps(env), uiFonts });
  assert.equal(calls.length, 0, 'لا طلب قبل وجود المشغّل');
  const parts = addPlayer(env);
  addBar(env, parts);
  env.win.advance(60);
  assert.equal(handle.state, 'mounted');
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(calls, [true]);
  assert.deepEqual(handle.diagnostics().uiFonts, { loaded: ['cairo', 'almarai'], failed: [] });
  parts.player.remove();
  env.win.advance(HEALTH_MS + 60);
  const again = addPlayer(env);
  addBar(env, again);
  env.win.advance(HEALTH_MS + 60);
  assert.equal(handle.state, 'mounted');
  assert.equal(calls.length, 1, 'لا إعادة بعد النجاح');
  const off = mountControls(fakeController(), { ...deps(createFakeEnv()), uiFonts: null });
  assert.equal(off.diagnostics().uiFonts, null, 'بلا محمّل: لا شيء');
});
