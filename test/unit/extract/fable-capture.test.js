// تدقيق Fable: تقوية الالتقاط من نافذة الصفحة (مصدر غير موثوق بالتصميم، DS-I1).
// - FA-07: المعلّق محدود بالعدد وحده (ثماني رسائل بثمانية ملايين محرف لفيديوهات أخرى تبقى ~460 م.ب)، ولا تقليم إلا مع إضافة
//   أو سحب؛ وكل رسالة مقبولة تُحوَّل من جديد ولو طابق جسمها آخر التقاط للمفتاح نفسه (~120 م.ث بستين ألف حدث).
// - FA-09: lang بطول 1,802 محرف كان يُقبل، فيرفض الحفظ اسم الملف بـSV_BAD_FILE المضلّلة بدل EX_NOT_ENGLISH.
// - FA-18: bodyLength يُنقل كما أرسلته الصفحة (1e308)، وcreateDiagnosticReport العام يُبقي currentVideoId.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPendingBuffer, MAX_PENDING_CHARS } from '../../../src/extract/pending.js';
import { MAX_BODY_CHARS, MAX_LANG_CHARS, validateCaptureMessage } from '../../../src/extract/message.js';
import { checkAcceptance } from '../../../src/extract/capture-adapter.js';
import { createDiagnosticReport } from '../../../src/core/diagnostics/report.js';
import { captureMsg, makeExtractor } from './helpers.js';

const VID = 'iG9CE55wbtY';
const other = (i) => `AAAAAAAAAA${i}`;

test('FA-07: المعلّق محدود إجماليًا بالمحارف، والأحدث يبقى وإن بلغ الحد وحده', () => {
  const p = createPendingBuffer({ windowMs: 2000, maxChars: 100 });
  const m = (i, n) => ({ videoId: other(i), body: 'x'.repeat(n) });
  p.add(m(1, 40), 1000);
  p.add(m(2, 40), 1001);
  p.add(m(3, 40), 1002);
  assert.equal(p.size, 2, 'سقط الأقدم');
  assert.equal(p.chars, 80);
  p.add(m(4, 500), 1003);
  assert.equal(p.size, 1, 'الأحدث وحده');
  assert.equal(p.take(other(4), 1004).length, 1);
  assert.equal(MAX_PENDING_CHARS, MAX_BODY_CHARS);
});

test('FA-07: ثماني رسائل كبيرة لفيديوهات أخرى لا تتجاوز حد المحارف الإجمالي في المستخرج', () => {
  const { extractor, state } = makeExtractor({ videoId: VID });
  const body = `{"events":[${'{},'.repeat(2_000_000)}{}]}`; // ~6 ملايين محرف
  for (let i = 0; i < 8; i++) {
    state.t += 10;
    extractor.handleMessage(captureMsg({ videoId: other(i), body }));
  }
  const d = extractor.diagnostics();
  assert.ok(d.pendingChars <= MAX_PENDING_CHARS, `${d.pendingChars}`);
  assert.equal(d.pending, Math.floor(MAX_PENDING_CHARS / body.length));
});

test('FA-07: المعلّق يُقلَّم مع كل رسالة بعد نافذته، لا عند التنقل وحده', () => {
  const { extractor, state } = makeExtractor({ videoId: VID });
  extractor.handleMessage(captureMsg({ videoId: other(1), body: '{"events":[]}' }));
  assert.equal(extractor.diagnostics().pending, 1);
  state.t += 2500;
  extractor.handleMessage({ source: 'x' }); // أي رسالة، ولو مرفوضة البنية
  assert.equal(extractor.diagnostics().pending, 0);
});

/** جسم json3 تلقائي كبير بستين ألف حدث (كما في مجسّ التدقيق). */
function bigAsrBody(n = 60000) {
  const events = [];
  for (let i = 0; i < n; i++) events.push({ tStartMs: i * 1000, dDurationMs: 900, segs: [{ utf8: `word${i} `, tOffsetMs: 0, acAsrConf: 0 }, { utf8: `more${i}`, tOffsetMs: 400 }] });
  return JSON.stringify({ events });
}

test('FA-07: جسم مطابق لآخر التقاط للمفتاح نفسه لا يُحوَّل من جديد، ويبقى الأحدث مقبولًا بالنتيجة نفسها', () => {
  const body = bigAsrBody();
  const { extractor } = makeExtractor({ videoId: VID, durationMs: 60000 * 1000 });
  const time = (fn) => { const t0 = performance.now(); const r = fn(); return { r, ms: performance.now() - t0 }; };
  const first = time(() => extractor.handleMessage(captureMsg({ videoId: VID, body, trackKind: 'asr' })));
  const again = time(() => extractor.handleMessage(captureMsg({ videoId: VID, body, trackKind: 'asr' })));
  assert.deepEqual(again.r, first.r);
  assert.equal(extractor.tracks().length, 1);
  assert.equal(extractor.tracks()[0].cueCount > 0, true);
  assert.ok(again.ms < first.ms / 4, `الأول ${first.ms.toFixed(0)} م.ث والتكرار ${again.ms.toFixed(0)} م.ث`);
  // وجسم مختلف للمفتاح نفسه يُحوَّل ويحل محله.
  const changed = bigAsrBody(10);
  extractor.handleMessage(captureMsg({ videoId: VID, body: changed, trackKind: 'asr' }));
  assert.equal(extractor.tracks()[0].cueCount < 60000, true);
});

test('FA-09: وسم لغة أطول من 35 محرفًا أو بأكثر من أربعة مقاطع يُسقط فيُرفض المسار بـEX_NOT_ENGLISH', () => {
  const ctx = { currentVideoId: VID };
  const base = { source: 'tarjuman', v: 1, kind: 'timedtext', videoId: VID, trackKind: 'manual', format: 'json3', status: 200, body: '{"events":[{}]}', bodyLength: 15 };
  for (const lang of ['en', 'en-GB', 'en-x-autogen', 'zh-Hans-CN', 'en-a-b-c-d']) assert.equal(validateCaptureMessage({ ...base, lang }).lang, lang, lang);
  const long = `en${'-aaaaaaaa'.repeat(200)}`;
  for (const lang of [long, 'en-a-b-c-d-e', `en-${'a'.repeat(8)}-${'b'.repeat(8)}-${'c'.repeat(8)}-${'d'.repeat(8)}`]) {
    const m = validateCaptureMessage({ ...base, lang });
    assert.equal(m.lang, null, `${lang.length} محرفًا`);
    assert.equal(checkAcceptance(m, ctx).code, 'EX_NOT_ENGLISH');
  }
  assert.equal(MAX_LANG_CHARS, 35);
});

test('FA-18: bodyLength من الجسم نفسه، والمقطوع بطوله المبلَّغ محدودًا', () => {
  const base = { source: 'tarjuman', v: 1, kind: 'timedtext', videoId: VID, lang: 'en', trackKind: 'manual', format: 'json3', status: 200 };
  assert.equal(validateCaptureMessage({ ...base, body: 'abc', bodyLength: 1e308 }).bodyLength, 3);
  assert.equal(validateCaptureMessage({ ...base, body: 'abc', bodyLength: 2 }).bodyLength, 3);
  assert.equal(validateCaptureMessage({ ...base, body: '', bodyLength: 25_000_000, truncated: true }).bodyLength, 25_000_000);
  assert.equal(validateCaptureMessage({ ...base, body: '', bodyLength: 1e308, truncated: true }).bodyLength, 2 ** 30);
});

test('FA-18: تقرير التشخيص العام يُسقط كل مفتاح معرّف فيديو (currentVideoId وlastVideoId وvideoIds)', () => {
  const r = createDiagnosticReport({
    version: '1.1.0',
    sections: { extractor: { currentVideoId: VID, navigations: 2, nested: { lastVideoId: VID, videoIds: [VID], video_id: VID, count: 3 } }, videoId: VID },
  });
  const text = JSON.stringify(r);
  assert.equal(text.includes(VID), false, text);
  assert.equal(r.sections.extractor.navigations, 2);
  assert.equal(r.sections.extractor.nested.count, 3);
});
