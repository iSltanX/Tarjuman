// الفكرة ٧-ب (ح-56): pressSubtitles تضغط زر CC بنقرة المستخدم الصريحة على زر في «تنزيل الأصل»، وتقرأ حاله (aria-pressed) قبل كل
// ضغطة: من «مطفأة» ضغطة واحدة، و«الإعادة» ضغطتان بينهما انتظار aria-pressed="false" بمهلة، ولا ضغطة ثانية عمياء. ولا ضغط بلا زر،
// أو والزر معطّل (aria-disabled أو disabled، لا aria-pressed)، أو أثناء إعلان أو بث جارٍ، أو في متصفح محجوب. والحجب فارغ لأن القياس
// ثبت في المتصفحات الأربعة. فوق الـDOM الوهمي، والعقد لا تُمرَّر إلى assert.equal (رأس fake-dom.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CC_OFF_WAIT_MS, CC_PRESS_BLOCKED, pressSubtitles, subtitlesPressable } from '../../../src/player/youtube-dom.js';
import { addBar, settle } from './controls/harness.js';
import { addPlayer, createFakeEnv } from './overlay/fake-dom.js';

/**
 * مشغّل بشريط وزر CC يتصرف كزر يوتيوب: الضغطة تبدّل aria-pressed بعد delay (null: لا يتبدّل أبدًا)، وتُسجَّل حاله لحظة كل ضغطة.
 * @param {{ pressed?: 'true' | 'false' | null, delay?: number | null, nav?: object }} [o]
 */
function page({ pressed = 'false', delay = 0, nav } = {}) {
  const env = createFakeEnv();
  const parts = addPlayer(env);
  const { cc } = addBar(env, parts);
  if (pressed !== null) cc.setAttribute('aria-pressed', pressed);
  if (nav) env.win.navigator = nav;
  const presses = [];
  cc.addEventListener('click', () => {
    const was = cc.getAttribute('aria-pressed');
    presses.push(was);
    if (delay === null) return;
    const flip = () => cc.setAttribute('aria-pressed', was === 'true' ? 'false' : 'true');
    if (delay) env.win.setTimeout(flip, delay);
    else flip();
  });
  return { env, ...parts, cc, presses };
}

/** يقدّم الساعة الوهمية خطوة خطوة حتى ينتهي الوعد (المهلات في pressSubtitles من مؤقتات النافذة). */
async function pump(env, promise, { step = 50, max = 10000 } = {}) {
  let done = false;
  promise.then(() => { done = true; }, () => { done = true; });
  for (let t = 0; t <= max; t += step) {
    await settle();
    if (done) break;
    env.win.advance(step);
  }
  return promise;
}

test('٧-ب: من «مطفأة» ضغطة واحدة تشغّلها، ومن «مشغّلة» لا ضغط (التشغيل لا يطفئ ما هو مشغّل)', async () => {
  for (const pressed of ['false', null]) {
    const p = page({ pressed });
    const r = await pump(p.env, pressSubtitles(p.env.doc));
    assert.deepEqual(r, { ok: true, presses: 1, reason: null }, String(pressed));
    assert.deepEqual(p.presses, [pressed], 'ضغطة واحدة');
    assert.equal(p.cc.getAttribute('aria-pressed'), 'true');
  }
  const on = page({ pressed: 'true' });
  assert.deepEqual(await pump(on.env, pressSubtitles(on.env.doc)), { ok: true, presses: 0, reason: null });
  assert.deepEqual(on.presses, []);
  assert.equal(on.cc.getAttribute('aria-pressed'), 'true');
});

test('٧-ب: «الإعادة» ضغطتان بينهما انتظار aria-pressed="false": الثانية لا تقع والحال «مشغّلة»، وتنتهي مشغّلة', async () => {
  // المشغّل يكتب الحال بعد 300 م.ث: ضغطتان عمياوان بفاصل 250 تقعان كلتاهما على «مشغّلة» فتنتهي مطفأة (مجسّ Fable).
  const p = page({ pressed: 'true', delay: 300 });
  const r = await pump(p.env, pressSubtitles(p.env.doc, { restart: true }));
  assert.deepEqual(r, { ok: true, presses: 2, reason: null });
  assert.deepEqual(p.presses, ['true', 'false'], 'الثانية بعد أن صارت مطفأة');
  p.env.win.advance(300);
  assert.equal(p.cc.getAttribute('aria-pressed'), 'true', 'تنتهي مشغّلة');
});

test('٧-ب: «الإعادة» وCC مطفأة أصلًا ضغطة تشغيل واحدة', async () => {
  const p = page({ pressed: 'false' });
  assert.deepEqual(await pump(p.env, pressSubtitles(p.env.doc, { restart: true })), { ok: true, presses: 1, reason: null });
  assert.deepEqual(p.presses, ['false']);
});

test('٧-ب: لم تنطفئ في المهلة: لا ضغطة ثانية عمياء، والسبب timeout', async () => {
  const p = page({ pressed: 'true', delay: null });
  const r = await pump(p.env, pressSubtitles(p.env.doc, { restart: true }));
  assert.deepEqual(r, { ok: false, presses: 1, reason: 'timeout' });
  assert.deepEqual(p.presses, ['true'], 'ضغطة الإطفاء وحدها');
  // والمهلة CC_OFF_WAIT_MS لا أقل: تنطفئ قبيل انقضائها فتقع الثانية.
  const late = page({ pressed: 'true', delay: CC_OFF_WAIT_MS - 100 });
  assert.deepEqual(await pump(late.env, pressSubtitles(late.env.doc, { restart: true })), { ok: true, presses: 2, reason: null });
});

test('٧-ب: لا ضغط بلا زر، ولا والزر معطّل (aria-disabled أو disabled)، ولا أثناء إعلان أو بث جارٍ', async () => {
  const cases = [
    ['missing', (p) => p.cc.remove()],
    ['disabled', (p) => p.cc.setAttribute('aria-disabled', 'true')],
    ['disabled', (p) => p.cc.setAttribute('disabled', '')],
    ['ad', (p) => p.player.classList.add('ad-showing')],
    ['ad', (p) => p.player.classList.add('ad-interrupting')],
    ['live', (p) => {
      const badge = p.env.doc.createElement('button');
      badge.className = 'ytp-live-badge ytp-button';
      badge.style.setProperty('display', 'inline-block');
      p.player.appendChild(badge);
      p.env.win.getComputedStyle = (el) => ({ display: el.style.getPropertyValue('display') || 'inline' });
    }],
  ];
  for (const [reason, set] of cases) {
    for (const restart of [false, true]) {
      const p = page({ pressed: restart ? 'true' : 'false' });
      set(p);
      const r = await pump(p.env, pressSubtitles(p.env.doc, { restart }));
      assert.deepEqual(r, { ok: false, presses: 0, reason }, `${reason} restart=${restart}`);
      assert.deepEqual(p.presses, []);
    }
  }
  // aria-pressed وحده (مضغوط أو لا) ليس تعطيلًا، ولا aria-disabled="false".
  const p = page({ pressed: 'false' });
  p.cc.setAttribute('aria-disabled', 'false');
  assert.deepEqual(await pump(p.env, pressSubtitles(p.env.doc)), { ok: true, presses: 1, reason: null });
});

test('٧-ب: الحال تُفحص قبل كل ضغطة: إعلان بدأ أثناء انتظار الانطفاء يمنع ضغطة التشغيل', async () => {
  const p = page({ pressed: 'true', delay: 300 });
  const run = pressSubtitles(p.env.doc, { restart: true });
  p.env.win.advance(100);
  p.player.classList.add('ad-showing');
  const r = await pump(p.env, run);
  assert.deepEqual(r, { ok: false, presses: 1, reason: 'ad' });
  assert.deepEqual(p.presses, ['true']);
});

test('٧-ب (ح-56): الزر مفعّل في المتصفحات الأربعة، وآلية الحجب لكل متصفح تمنع الضغط وتُخفي الزر فيه', async () => {
  assert.deepEqual(CC_PRESS_BLOCKED, [], 'ثبت القياس في Chrome وBrave وEdge وFirefox');
  assert.ok(Object.isFrozen(CC_PRESS_BLOCKED));
  const navs = {
    chrome: { userAgent: 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/157.0.0.0 Safari/537.36' },
    brave: { userAgent: 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/157.0.0.0 Safari/537.36', brave: { isBrave: async () => true } },
    edge: { userAgent: 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/157.0.0.0 Safari/537.36 Edg/157.0.0.0' },
    firefox: { userAgent: 'Mozilla/5.0 (Macintosh; rv:160.0) Gecko/20100101 Firefox/160.0' },
  };
  for (const [name, nav] of Object.entries(navs)) {
    const free = page({ nav });
    assert.equal(subtitlesPressable(free.env.doc), true, name);
    assert.equal((await pump(free.env, pressSubtitles(free.env.doc))).presses, 1, name);
    for (const other of Object.keys(navs)) {
      const p = page({ nav });
      const blocked = [other];
      assert.equal(subtitlesPressable(p.env.doc, { blocked }), other !== name, `${name} وحُجب ${other}`);
      const r = await pump(p.env, pressSubtitles(p.env.doc, { blocked }));
      assert.equal(r.reason, other === name ? 'blocked' : null, `${name} وحُجب ${other}`);
      assert.equal(p.presses.length, other === name ? 0 : 1);
    }
  }
  // بلا زر لا يُعرض؛ والمعطّل والإعلان تقولها القائمة بحالها، فيبقى «قابلًا للعرض».
  const gone = page();
  gone.cc.remove();
  assert.equal(subtitlesPressable(gone.env.doc), false);
  const ad = page();
  ad.player.classList.add('ad-showing');
  assert.equal(subtitlesPressable(ad.env.doc), true);
});
