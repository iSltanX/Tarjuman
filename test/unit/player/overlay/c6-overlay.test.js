// تدقيق 7a66f91، المرحلة C6 (أسطح المشغّل): طبقة الترجمة. سكربت الإعادة overlay-misc (CL-X1) في docs/audit-7a66f91/verify/player
// صار اختبار انحدار يفشل على الشيفرة السابقة للسبب المقصود، ومعه lang الأسطر (U48).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSyncEngine } from '../../../../src/player/sync/engine.js';
import { createOverlayView } from '../../../../src/player/overlay/view.js';
import { FADE_MS } from '../../../../src/player/overlay/styles.js';
import { createFakeEnv } from './fake-dom.js';

function overlay() {
  const env = createFakeEnv();
  const view = createOverlayView({ doc: env.doc, win: env.win });
  env.doc.body.appendChild(view.host);
  return { env, view, stage: view.host.shadowRoot.querySelector('.stage') };
}

test('U49 (CL-X1): فجوة أقصر من مدة التلاشي بين مقطعين لا تعطي إطارات فارغة', () => {
  const { env, view, stage } = overlay();
  const raf = [];
  env.win.requestAnimationFrame = (cb) => { raf.push(cb); return raf.length; };
  const video = { currentTime: 2.99, paused: false, ended: false, addEventListener() {}, removeEventListener() {} };
  const engine = createSyncEngine({ win: env.win, bridgeMs: FADE_MS, onFrame: (f) => view.render({ ar: f.ar ? [f.ar.text] : [], en: [] }) });
  engine.setVideo(video);
  engine.setSource({ ar: [{ n: 1, startMs: 1000, endMs: 3000, text: 'أ' }, { n: 2, startMs: 3050, endMs: 5000, text: 'ب' }], en: null, offsetMs: 0 });
  const trace = [];
  for (let t = 2990; t <= 3100; t += 16) {
    video.currentTime = t / 1000;
    env.win.advance(16);
    raf.shift()?.();
    trace.push(stage.hasAttribute('data-empty') ? 'فارغ' : stage.textContent);
  }
  assert.ok(!trace.includes('فارغ'), trace.join(' | '));
  assert.equal(trace.at(-1), 'ب');
});

test('U49 (CL-X1): الوصل للفجوة القصيرة وحدها: فجوة أطول من التلاشي، والقفز إلى فجوة قصيرة من بعيد، تُظهران الفراغ', () => {
  const frames = [];
  const raf = [];
  const win = { requestAnimationFrame: (cb) => { raf.push(cb); return raf.length; }, cancelAnimationFrame() {} };
  const video = { currentTime: 0, paused: true, ended: false, addEventListener() {}, removeEventListener() {} };
  const engine = createSyncEngine({ win, bridgeMs: FADE_MS, onFrame: (f) => frames.push(f.ar?.n ?? null) });
  engine.setVideo(video);
  const at = (sec) => { video.currentTime = sec; engine.setVideo(null); engine.setVideo(video); };
  engine.setSource({ ar: [{ n: 1, startMs: 1000, endMs: 2000, text: 'أ' }, { n: 2, startMs: 2050, endMs: 3000, text: 'ب' }, { n: 3, startMs: 3200, endMs: 4000, text: 'ج' }], en: null, offsetMs: 0 });
  frames.length = 0;
  at(1.5);
  at(2.02);
  assert.equal(frames.at(-1), null, 'قفز إلى الفجوة من مقطع لم يُعرض قبلها مباشرة: لا شيء (إعادة الربط تمسح الظاهر)');
  // التشغيل المتتابع (الحلقة) عبر فجوة 50 ثم فجوة 200.
  video.paused = false;
  video.currentTime = 1.9;
  engine.setSource({ ar: null, en: null, offsetMs: 0 });
  frames.length = 0;
  engine.setSource({ ar: [{ n: 1, startMs: 1000, endMs: 2000, text: 'أ' }, { n: 2, startMs: 2050, endMs: 3000, text: 'ب' }, { n: 3, startMs: 3200, endMs: 4000, text: 'ج' }], en: null, offsetMs: 0 });
  for (let t = 1900; t <= 3300; t += 16) {
    video.currentTime = t / 1000;
    raf.shift()?.();
  }
  assert.deepEqual(frames.filter((x, i) => x !== frames[i - 1]), [1, 2, null, 3], 'وصل 50 م.ث، وفراغ قبل الثالث (200 م.ث)');
  engine.destroy();
});

test('U48: سطر الترجمة العربي بـlang="ar"، والأصل بلغة مساره', () => {
  const { view, stage } = overlay();
  view.setLang?.('en-GB');
  view.render({ ar: ['سطر'], en: ['line'] });
  const [ar, en] = stage.children;
  assert.equal(ar.getAttribute('lang'), 'ar');
  assert.equal(en.getAttribute('lang'), 'en-GB');
});
