// مراقبة التنقل: الحدث وتغيّر المعرّف احتياطًا، والتنقل الجاري يبدأ وينتهي (بالحدث أو بمهلة الأمان)،
// ولا بلاغ مكرر، وفك كل مستمع ومؤقت عند الإيقاف.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { watchNavigation, SETTLE_MS } from '../../../../src/player/watch/navigation.js';
import { createFakeEnv } from '../overlay/fake-dom.js';

const A = 'AAAAAAAAAAA';
const B = 'BBBBBBBBBBB';
const watch = (opts = {}) => {
  const env = createFakeEnv({ href: `https://www.youtube.com/watch?v=${A}` });
  const got = [];
  const nav = watchNavigation({ win: env.win, onChange: (s) => got.push(s), ...opts });
  return { env, nav, got };
};
const ev = (type) => ({ type });

test('الحالة الأولى من العنوان، بلا تنقّل', () => {
  const { nav, got } = watch();
  assert.deepEqual(nav.state(), { videoId: A, navigating: false });
  assert.deepEqual(got, []);
});

test('بداية حدث يوتيوب تبدأ التنقل فورًا ونهايته تنهيه مع المعرّف الجديد', () => {
  const { env, nav, got } = watch();
  env.doc.dispatchEvent(ev('yt-navigate-start'));
  assert.deepEqual(got.at(-1), { videoId: A, navigating: true }, 'الطبقة تُخفى قبل أن يتغير العنوان');
  env.win.navigate(`https://www.youtube.com/watch?v=${B}`);
  env.doc.dispatchEvent(ev('yt-navigate-finish'));
  assert.deepEqual(got.at(-1), { videoId: B, navigating: false });
  assert.deepEqual(nav.state(), { videoId: B, navigating: false });
});

test('تغيّر المعرّف بلا أي حدث (رجوع أو مراقبة احتياطية) تنقّل أيضًا', () => {
  const { env, nav, got } = watch();
  env.win.navigate(`https://www.youtube.com/watch?v=${B}`);
  env.win.fire('popstate');
  assert.deepEqual(got.at(-1), { videoId: B, navigating: true });
  env.win.advance(SETTLE_MS - 1);
  assert.equal(got.at(-1).navigating, true);
  env.win.advance(2);
  assert.deepEqual(got.at(-1), { videoId: B, navigating: false }, 'مهلة الأمان تنهيه إن لم يصل حدث الانتهاء');
  assert.equal(nav.state().navigating, false);
});

test('المؤقت الاحتياطي 500ms يلتقط تغيّر المعرّف دون أي حدث', () => {
  const { env, got } = watch();
  env.win.navigate(`https://www.youtube.com/watch?v=${B}`);
  env.win.advance(500);
  assert.equal(got.at(-1).videoId, B);
  assert.equal(got.at(-1).navigating, true);
});

test('تنقّل ملغى (بداية بلا نهاية) لا يخفي الترجمة أكثر من مهلة الأمان', () => {
  const { env, got } = watch();
  env.doc.dispatchEvent(ev('yt-navigate-start'));
  assert.equal(got.at(-1).navigating, true);
  env.win.advance(SETTLE_MS + 10);
  assert.deepEqual(got.at(-1), { videoId: A, navigating: false });
});

test('بدايتان متتاليتان تعيدان المهلة، ولا بلاغ مكرر للحالة نفسها', () => {
  const { env, got } = watch();
  env.doc.dispatchEvent(ev('yt-navigate-start'));
  const n = got.length;
  env.win.advance(1000);
  env.doc.dispatchEvent(ev('yt-navigate-start'));
  assert.equal(got.length, n, 'لا بلاغ جديد: الحالة نفسها');
  env.win.advance(1000);
  assert.equal(got.at(-1).navigating, true, 'المهلة أُعيدت من البداية الثانية');
  env.win.advance(600);
  assert.equal(got.at(-1).navigating, false);
});

test('الخروج من صفحة المشاهدة: المعرّف null', () => {
  const { env, got } = watch();
  env.win.navigate('https://www.youtube.com/');
  env.doc.dispatchEvent(ev('yt-navigate-finish'));
  assert.deepEqual(got.at(-1), { videoId: null, navigating: false });
});

test('الإيقاف يفك كل المستمعين والمؤقتات ولا بلاغ بعده', () => {
  const { env, nav, got } = watch();
  env.doc.dispatchEvent(ev('yt-navigate-start'));
  nav.stop();
  assert.equal(env.win.pendingTimers(), 0);
  for (const t of ['yt-navigate-start', 'yt-navigate-finish', 'yt-page-data-updated']) assert.equal(env.doc.listenerCount(t), 0, t);
  assert.equal(env.win.listenerCount('popstate'), 0);
  const n = got.length;
  env.doc.dispatchEvent(ev('yt-navigate-start'));
  env.win.advance(5000);
  assert.equal(got.length, n);
});
