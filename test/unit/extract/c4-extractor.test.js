// تدقيق 7a66f91، المرحلة C4: المستخرج. U32 (التقاط معيب لا يسمّم الخانات ولا يحل محل السليم)، وU33 (مالك واحد
// للأجسام وحد إجمالي)، وU37 (عتبة الاكتمال من الإعدادات ومفتاح الذاكرة المؤقتة). كلها فشلت على الشيفرة السابقة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../../../src/content/controller.js';
import { createStore } from '../../../src/core/store/index.js';
import { MAX_CAPTURED_CHARS, createExtractor } from '../../../src/extract/index.js';
import { MAX_BODY_CHARS } from '../../../src/extract/message.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { captureMsg, makeExtractor, sample } from './helpers.js';

const manual = sample('manual');
const VID = manual.fixture.videoId;
const base = { videoId: VID, body: manual.body };
/** جسم json3 فيه قطعة ليست كائنًا بجانب نص (لا يصدر إلا من سكربت في الصفحة). */
const poisoned = (bad) => JSON.stringify({ events: [{ tStartMs: 0, dDurationMs: 1000, segs: [bad, { utf8: 'hello', acAsrConf: 1 }] }] });

test('U32: التقاط بقطعة ليست كائنًا لا يرمي، ولا يحل محل التقاط سليم للمفتاح نفسه، ولا يُخفي خانة أخرى', () => {
  for (const bad of [1, 'x', true]) {
    const { extractor } = makeExtractor({ videoId: VID, durationMs: manual.fixture.durationMs });
    extractor.handleMessage(captureMsg(base));
    extractor.handleMessage(captureMsg(base, { lang: 'en-US' }));
    // جسم بلا أي حدث نصي سليم للمفتاح نفسه.
    const r = extractor.handleMessage(captureMsg({ videoId: VID, body: JSON.stringify({ events: [{ tStartMs: 0, dDurationMs: 1000, segs: [bad] }] }) }));
    assert.deepEqual(r, { accepted: false, code: 'EX_EMPTY_BODY' }, String(bad));
    assert.doesNotThrow(() => extractor.tracks());
    assert.doesNotThrow(() => extractor.diagnostics());
    const tracks = extractor.tracks();
    assert.deepEqual(tracks.map((t) => [t.key, t.ok, t.cueCount]), [['en|manual', true, 427], ['en-US|manual', true, 427]], String(bad));
    assert.equal(extractor.convert('en|manual').ok, true);
    assert.equal(extractor.diagnostics().recentRejections.at(-1).code, 'EX_EMPTY_BODY');
    assert.equal(extractor.lastRejection(), null, 'المستخدم ما زال يملك مسارًا سليمًا');
  }
});

test('U32: قطعة ليست كائنًا بجانب نص لا ترمي من handleMessage ولا tracks()، والخانة تُحوَّل بلا القطعة المعيبة', () => {
  for (const bad of [1, 'x', true]) {
    const { extractor } = makeExtractor({ videoId: VID, durationMs: manual.fixture.durationMs });
    extractor.handleMessage(captureMsg(base, { lang: 'en-US' }));
    // json3 صالح البنية لكن قطعته الأولى ليست كائنًا: كان يرمي TypeError من json3.js فيتجمد المتحكم.
    const r = extractor.handleMessage(captureMsg({ videoId: VID, body: poisoned(bad) }));
    assert.equal(r.accepted, true, String(bad));
    const tracks = extractor.tracks();
    assert.deepEqual(tracks.map((t) => [t.key, t.ok]), [['en-US|manual', true], ['en|manual', true]]);
    assert.deepEqual(extractor.convert('en|manual').cues.map((c) => c.text), ['hello']);
    assert.doesNotThrow(() => extractor.diagnostics());
  }
});

test('TJ-29 (U32): التقاط بلا أحداث نصية لا يحل محل التقاط سليم للمفتاح نفسه، وبلا سابق يظهر فشله', () => {
  const { extractor } = makeExtractor({ videoId: VID, durationMs: manual.fixture.durationMs });
  const empty = JSON.stringify({ events: [{ tStartMs: 0, dDurationMs: 99999, id: 1, wpWinPosId: 1 }] });
  extractor.handleMessage(captureMsg(base));
  const capturedAt = extractor.tracks()[0].capturedAt;
  assert.deepEqual(extractor.handleMessage(captureMsg({ videoId: VID, body: empty })), { accepted: false, code: 'EX_EMPTY_BODY' });
  assert.deepEqual(extractor.tracks().map((t) => [t.key, t.ok, t.capturedAt]), [['en|manual', true, capturedAt]]);
  // لا سابق سليم: الفاشل يبقى خانةً ليرى المستخدم رمزه (كما كان).
  assert.deepEqual(extractor.handleMessage(captureMsg({ videoId: VID, body: empty }, { lang: 'en-GB' })), { accepted: true, code: 'EX_EMPTY_BODY' });
  assert.deepEqual(extractor.tracks().find((t) => t.key === 'en-GB|manual').code, 'EX_EMPTY_BODY');
  // والسليم الأحدث يحل محل السليم الأقدم كما كان.
  extractor.handleMessage(captureMsg(base));
  assert.equal(extractor.tracks().filter((t) => t.key === 'en|manual').length, 1);
});

test('U32: فشل الحدود وحده يتبع المدة اللحظية، فالالتقاط الأحدث يحل محل السابق ويُحوَّل حين تصح المدة', () => {
  const { extractor, state } = makeExtractor({ videoId: VID, durationMs: 100000 });
  const short = JSON.stringify({ events: [{ tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: 'intro' }] }] });
  extractor.handleMessage(captureMsg({ videoId: VID, body: short }));
  assert.equal(extractor.tracks()[0].ok, true);
  // مدة لحظية خاطئة (أقصر من المسار): الأحدث يُقبل ويحل محل السابق برمز الحدود، لا يُرفض.
  assert.deepEqual(extractor.handleMessage(captureMsg(base)), { accepted: true, code: 'EX_BEYOND_DURATION' });
  state.durationMs = manual.fixture.durationMs;
  assert.deepEqual(extractor.tracks().map((t) => [t.key, t.ok, t.cueCount]), [['en|manual', true, 427]]);
});

test('U33: مخزن الالتقاط لا يحتفظ بجسم خانة طُردت؛ ثمانية على الأكثر، ولا تراكم للمفتاح نفسه', () => {
  const { extractor } = makeExtractor({ videoId: VID, durationMs: manual.fixture.durationMs });
  for (let i = 0; i < 64; i++) extractor.handleMessage(captureMsg(base, { lang: `en-x${i}` }));
  assert.equal(extractor.tracks().length, 8);
  assert.equal(extractor.diagnostics().accepted, 8, 'المحتفظ به = الخانات الظاهرة');
  for (let i = 0; i < 10; i++) extractor.handleMessage(captureMsg(base, { lang: 'en-x63' }));
  assert.equal(extractor.diagnostics().accepted, 8);
});

test('U33: حد إجمالي لأحرف الأجسام المحتفظ بها (الافتراضي ضعف حد الرسالة)؛ الأقدم يُطرد والأحدث يبقى دائمًا', () => {
  assert.equal(MAX_CAPTURED_CHARS, 2 * MAX_BODY_CHARS);
  const cap = manual.body.length * 3 + 10;
  const state = { t: 1000 };
  const extractor = createExtractor({ currentVideoId: () => VID, durationMs: () => manual.fixture.durationMs, now: () => state.t, maxCapturedChars: cap });
  for (let i = 0; i < 6; i++) extractor.handleMessage(captureMsg(base, { lang: `en-x${i}` }));
  const d = extractor.diagnostics();
  assert.ok(d.tracks.reduce((s, t) => s + t.bodyLength, 0) <= cap);
  assert.deepEqual(d.tracks.map((t) => t.key), ['en-x3|manual', 'en-x4|manual', 'en-x5|manual']);
  assert.equal(d.accepted, 3);
  // جسم وحده فوق الحد يبقى (الأحدث)، ويُطرد ما سواه.
  const tiny = createExtractor({ currentVideoId: () => VID, durationMs: () => null, maxCapturedChars: 10 });
  tiny.handleMessage(captureMsg(base));
  tiny.handleMessage(captureMsg(base, { lang: 'en-GB' }));
  assert.deepEqual(tiny.tracks().map((t) => t.key), ['en-GB|manual']);
});

test('U37: عتبة الاكتمال من الإعدادات تغيّر التحذير، وتدخل مفتاح الذاكرة المؤقتة', () => {
  const { extractor, state } = makeExtractor({ videoId: VID, durationMs: Math.round(1165213 / 0.72) });
  extractor.handleMessage(captureMsg(base));
  assert.deepEqual(extractor.tracks()[0].warnings, ['EX_MAYBE_INCOMPLETE'], 'الافتراضي 85%');
  extractor.setCompleteness(0.5);
  assert.deepEqual(extractor.tracks()[0].warnings, []);
  assert.deepEqual(extractor.convert('en|manual').warnings, []);
  extractor.setCompleteness(0.9);
  assert.deepEqual(extractor.tracks()[0].warnings, ['EX_MAYBE_INCOMPLETE']);
  extractor.setCompleteness('bad');
  assert.deepEqual(extractor.tracks()[0].warnings, ['EX_MAYBE_INCOMPLETE'], 'غير الصالح يعود إلى الافتراضي');
  state.durationMs = manual.fixture.durationMs;
  assert.deepEqual(extractor.tracks()[0].warnings, []);
});

test('U37: المتحكم يمرّر عتبة الاكتمال من الإعدادات إلى المستخرج عند البدء وعند تغيّرها من أي سياق', async () => {
  const area = createMemoryArea();
  const seed = createStore({ area });
  await seed.setSettings({ thresholds: { completeness: 0.6 } });
  await area.flush();
  const { extractor } = makeExtractor({ videoId: VID, durationMs: Math.round(1165213 / 0.72) });
  extractor.handleMessage(captureMsg(base));
  const store = createStore({ area });
  const c = createController({ store, extractor, page: { title: () => null, durationMs: () => null } });
  store.onChange((ch) => c.handleStoreChange(ch));
  await c.start(VID);
  assert.deepEqual(c.getState().captured[0].warnings, [], 'عتبة 60% من الإعدادات');
  await c.updateSettings({ thresholds: { completeness: 0.95 } });
  assert.deepEqual(c.getState().captured[0].warnings, ['EX_MAYBE_INCOMPLETE']);
  const other = createStore({ area });
  await other.setSettings({ thresholds: { completeness: 0.5 } });
  await area.flush();
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(c.getState().captured[0].warnings, [], 'تغيّر من سياق آخر');
});
