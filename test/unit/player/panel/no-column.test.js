// الجولة الثانية من تحقق 2026-11-13، البند 23 (ع-ل، قرار سلطان ١٥: رمز خطأ جديد): كانت اللوحة تنتظر عمود يوتيوب الثانوي إلى
// الأبد بصمت (state «waiting» بلا رمز). فصار غيابه في صفحة مشاهدة فيها مشغّل يوتيوب بعد PLAYER_WAIT_MS (مهلة الطبقة والأدوات نفسها)
// حالة خطأ برمز PL_COLUMN_NOT_FOUND في التشخيص، يصل زر اللوحة في الشريط (صلة link) فيقول السبب في تلميحه ووصفه، ورسالة إن فُتحت
// اللوحة من زرها. ويزول ذلك كله وحده حين يظهر العمود.
// مقارنة العقد بـassert.ok(a === b) لا assert.equal (رأس fake-dom.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messageFor } from '../../../../src/core/errors/index.js';
import { DEFAULT_PREFS } from '../../../../src/core/model/prefs.js';
import { PLAYER_WAIT_MS } from '../../../../src/player/overlay/index.js';
import { createPanelLink } from '../../../../src/player/link.js';
import * as H from '../controls/harness.js';
import { watchPage } from './harness.js';

const CODE = 'PL_COLUMN_NOT_FOUND';

/** صفحة مشاهدة بمشغّل وبلا عمود ثانوي، وساعة واحدة للمؤقتات وnow. */
function noColumn(o = {}) {
  const link = createPanelLink();
  const page = watchPage({ withColumn: false, ...o });
  let t = 0;
  const now = () => t;
  // الساعة تتقدّم مع المؤقتات بخطوات صغيرة، فيرى now() الزمن الذي يقع فيه كل فحص (كما في f10-player-timeout.test.js).
  const tick = (ms) => {
    for (let left = ms; left > 0; left -= 100) {
      const step = Math.min(100, left);
      t += step;
      page.win.advance(step);
    }
  };
  const handle = page.mount({ link, now });
  return { page, link, handle, tick };
}

test('ع-ل: انتظار قصير بلا عمود يبقى «بانتظار» بلا رمز؛ وبعد المهلة حالة خطأ والرمز في التشخيص وعلى الصلة؛ وظهور العمود يعافيها', () => {
  const { page, link, handle, tick } = noColumn();
  tick(PLAYER_WAIT_MS - 2000);
  assert.equal(handle.state, 'waiting', 'قبل المهلة: انتظار عادي');
  assert.equal(handle.diagnostics().lastCode, null);
  tick(3000);
  assert.equal(handle.state, 'error', 'بعد المهلة: غير صامت');
  const d = handle.diagnostics();
  assert.equal(d.lastCode, CODE, 'الرمز في تشخيص اللوحة');
  assert.equal(d.lastDetail, 'missing=column');
  assert.equal(link.panelIssue(), CODE, 'والرمز على الصلة إلى زر اللوحة');
  assert.ok(messageFor(CODE) !== CODE, 'للرمز رسالة');
  page.flexy.appendChild(page.secondary);
  tick(1100);
  assert.equal(handle.state, 'mounted', 'يتعافى بلا إعادة تحميل');
  assert.equal(handle.diagnostics().lastCode, null, 'لا يبقى رمز ما تعافت منه');
  assert.equal(link.panelIssue(), null);
  assert.ok(page.hostEl(), 'والمضيف في العمود');
  handle.unmount();
});

test('ع-ل: لا مهلة قبل ظهور مشغّل يوتيوب (الصفحة تُحمَّل) ولا خارج صفحة المشاهدة، ومغادرة المشاهدة تمسح الرمز', () => {
  const loading = noColumn();
  loading.page.player.remove();
  loading.tick(PLAYER_WAIT_MS * 3);
  assert.equal(loading.handle.state, 'waiting', 'بلا مشغّل: انتظار مهما طال');
  assert.equal(loading.link.panelIssue(), null);
  loading.handle.unmount();

  const home = noColumn({ href: 'https://www.youtube.com/' });
  home.tick(PLAYER_WAIT_MS * 3);
  assert.equal(home.handle.state, 'waiting');
  assert.equal(home.link.panelIssue(), null);
  home.handle.unmount();

  const { page, link, handle, tick } = noColumn();
  tick(PLAYER_WAIT_MS + 1000);
  assert.equal(link.panelIssue(), CODE);
  page.win.navigate('https://www.youtube.com/');
  tick(1100);
  assert.equal(handle.state, 'waiting');
  assert.equal(handle.diagnostics().lastCode, null);
  assert.equal(link.panelIssue(), null, 'لا يبقى السبب على الزر خارج المشاهدة');
  handle.unmount();
});

test('ع-ل: زر اللوحة في الشريط يقول السبب في تلميحه ووصفه، وفتح اللوحة منه رسالة تحذير؛ وعودة العمود تمسحهما', async () => {
  const link = createPanelLink();
  const prefs = { ...DEFAULT_PREFS, ui: { ...DEFAULT_PREFS.ui, panelOpen: false } };
  const page = H.mountPage({ state: H.makeState({ arabic: H.arabic(), prefs }), link });
  const btn = page.ui.btn('panel');
  assert.equal(btn.getAttribute('aria-description'), null, 'بلا سبب: لا وصف');
  link.setPanelIssue(CODE);
  page.env.win.advance(1000);
  const msg = messageFor(CODE);
  assert.equal(btn.getAttribute('aria-description'), msg, 'السبب وصف الزر (قارئ الشاشة)');
  btn.dispatchEvent({ type: 'pointerenter' });
  assert.ok(page.ui.tip()?.includes(msg), 'والسبب في التلميح');
  H.click(btn);
  await H.settle();
  assert.ok(page.ui.toasts().some((t) => t.tone === 'warning' && t.text.includes(msg)), 'فتح اللوحة من زرها يقول لماذا لا تظهر');
  link.setPanelIssue(null);
  page.env.win.advance(1000);
  assert.equal(btn.getAttribute('aria-description'), null, 'ظهر العمود: لا سبب');
  assert.ok(!page.ui.toasts().some((t) => t.text.includes(msg)), 'والرسالة تزول');
  page.handle.unmount();
});
