// ExtractorAdapter الإنتاجي على أجسام العينتين الحقيقيتين (P3-AC1، AC2، AC6): تعدد المسارات، والرفض،
// ووضعا التحويل، والتقييم بالمدة الحالية، وسقف الذاكرة، والتشخيص المنقّى.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDiagnosticReport, formatDiagnosticReport } from '../../../src/core/diagnostics/report.js';
import { findSecrets } from '../../../src/core/diagnostics/sanitize.js';
import { rankUsable } from '../../../src/core/model/track-order.js';
import { captureMsg, makeExtractor, sample } from './helpers.js';

const manual = sample('manual');
const asr = sample('asr');
const VID = manual.fixture.videoId;
const base = { videoId: VID, body: manual.body };

test('مسارات متعددة: يدوي وتلقائي ولهجة، كل بمفتاحه، والاختيار الافتراضي اليدوي', () => {
  const { extractor, state } = makeExtractor({ videoId: VID, durationMs: manual.fixture.durationMs });
  state.durationMs = asr.fixture.durationMs; // تغطي المدة الأطول العينتين
  assert.equal(extractor.handleMessage(captureMsg({ videoId: VID, body: asr.body, trackKind: 'asr' })).accepted, true);
  assert.equal(extractor.handleMessage(captureMsg(base, { lang: 'en-GB' })).accepted, true);
  assert.equal(extractor.handleMessage(captureMsg(base)).accepted, true);
  const tracks = extractor.tracks();
  assert.deepEqual(tracks.map((x) => x.key), ['en|asr', 'en-GB|manual', 'en|manual'], 'ترتيب الالتقاط');
  assert.ok(tracks.every((x) => x.ok && x.cueCount > 0));
  assert.equal(tracks.find((x) => x.key === 'en|asr').cueCount, 1066);
  assert.equal(tracks.find((x) => x.key === 'en|manual').cueCount, 427);
  // اليدويان بزمن واحد: أولهما التقاطًا (لا تفضيل لـen على en-GB منذ 2.0.0، AA1).
  assert.equal(rankUsable(tracks)[0].key, 'en-GB|manual');
  assert.equal(extractor.convert('en-GB|manual').lang, 'en-GB');
  assert.equal(extractor.convert('en|asr').kind, 'asr');
});

test('إعادة الالتقاط للمفتاح نفسه تحل محل السابق وتُبلِّغ المشتركين', () => {
  const { extractor, state } = makeExtractor({ videoId: VID, durationMs: manual.fixture.durationMs });
  let events = 0;
  extractor.subscribe(() => events++);
  extractor.handleMessage(captureMsg(base));
  const first = extractor.tracks()[0].capturedAt;
  state.t += 5000;
  extractor.handleMessage(captureMsg(base));
  assert.equal(extractor.tracks().length, 1);
  assert.equal(events, 2);
  assert.equal(first, '1970-01-01T00:00:01.000Z', 'now المحقون هو زمن الالتقاط');
  assert.equal(extractor.tracks()[0].capturedAt, '1970-01-01T00:00:06.000Z', 'الأحدث يحل محل الأقدم');
});

test('الرفض: فيديو آخر، ولغة غير صالحة، وترجمة آلية بلا لغة، وفارغ، وصيغة غير مدعومة، وبث، وحالة غير 200', () => {
  const { extractor, state } = makeExtractor({ videoId: VID, durationMs: manual.fixture.durationMs });
  const cases = [
    [{ videoId: 'ZZZZZZZZZZZ' }, 'EX_WRONG_VIDEO'],
    [{ lang: 'a!' }, 'EX_BAD_LANG'],
    [{ hasTlang: true }, 'EX_BAD_LANG'],
    [{ body: '', bodyLength: 0 }, 'EX_EMPTY_BODY'],
    [{ status: 403 }, 'EX_EMPTY_BODY'],
    [{ truncated: true }, 'EX_EMPTY_BODY'],
    [{ format: 'srv3', body: '<timedtext/>' }, 'EX_UNSUPPORTED_FORMAT'],
  ];
  for (const [over, code] of cases) {
    const r = extractor.handleMessage(captureMsg(base, over));
    assert.deepEqual(r, { accepted: false, code }, JSON.stringify(over));
  }
  assert.equal(extractor.tracks().length, 0, 'لا شيء مما رُفض صار مسارًا');
  state.live = true;
  assert.equal(extractor.handleMessage(captureMsg(base)).code, 'EX_LIVE');
  state.live = false;
  state.videoId = null;
  assert.equal(extractor.handleMessage(captureMsg(base)).code, 'EX_NO_VIDEO');
  assert.equal(extractor.tracks().length, 0);
});

test('الرفض لا يمحو مسارًا مقبولًا، ولا يظهر للمستخدم إلا ما يخص فيديوه', () => {
  const { extractor } = makeExtractor({ videoId: VID, durationMs: manual.fixture.durationMs });
  extractor.handleMessage(captureMsg(base));
  assert.equal(extractor.handleMessage(captureMsg(base, { body: '', bodyLength: 0 })).code, 'EX_EMPTY_BODY');
  assert.equal(extractor.tracks().length, 1, 'الفارغ بعد ناجح لا يبدّله');
  assert.equal(extractor.lastRejection().code, 'EX_EMPTY_BODY');
  extractor.handleMessage(captureMsg(base, { videoId: 'ZZZZZZZZZZZ' }));
  assert.equal(extractor.lastRejection().code, 'EX_EMPTY_BODY', 'فيديو آخر لا يغيّره');
  extractor.handleMessage(captureMsg(base));
  assert.equal(extractor.lastRejection(), null, 'الالتقاط الناجح يمسح آخر رفض');
});

test('الوضع الطويل: مقاطع أقل بالكلمات نفسها والثوابت الستة، ونسخة مستقلة', () => {
  const { extractor } = makeExtractor({ videoId: VID, durationMs: manual.fixture.durationMs });
  extractor.handleMessage(captureMsg(base));
  const normal = extractor.convert('en|manual');
  const long = extractor.convert('en|manual', { mode: 'long' });
  assert.equal(normal.ok && long.ok, true);
  assert.equal(long.mode, 'long');
  assert.equal(normal.cues.length, 427);
  assert.ok(long.cues.length < normal.cues.length);
  assert.equal(long.report.mode, 'long');
  assert.equal(long.report.sourceWords, normal.report.sourceWords);
  const words = (cues) => cues.flatMap((c) => c.text.split(/\s+/u));
  assert.deepEqual(words(long.cues), words(normal.cues));
  long.cues[0].text = 'عبث';
  long.report.mode = 'عبث';
  const again = extractor.convert('en|manual', { mode: 'long' });
  assert.notEqual(again.cues[0].text, 'عبث');
  assert.equal(again.report.mode, 'long');
  assert.deepEqual(extractor.convert('en|manual').cues, normal.cues, 'العادي لا يتأثر بالطويل');
});

test('الوضع الطويل: الأرقام قابلة للضبط، ووضع مجهول أو مسار مجهول يعيدان رمزًا بلا استثناء', () => {
  const { extractor } = makeExtractor({ videoId: VID, durationMs: manual.fixture.durationMs });
  extractor.handleMessage(captureMsg(base));
  const wide = extractor.convert('en|manual', { mode: 'long' });
  const narrow = extractor.convert('en|manual', { mode: 'long', long: { maxDurationMs: 4000 } });
  assert.ok(narrow.cues.length > wide.cues.length);
  assert.equal(narrow.report.long.options.maxDurationMs, 4000);
  assert.equal(extractor.convert('en|manual', { mode: 'huge' }).code, 'MD_INVALID');
  assert.equal(extractor.convert('en|asr').code, 'EX_NO_TRACK');
  const unknown = extractor.convert('en-GB|asr', { mode: 'long' });
  assert.deepEqual([unknown.ok, unknown.code, unknown.lang, unknown.kind, unknown.mode, unknown.cues.length], [false, 'EX_NO_TRACK', 'en-GB', 'asr', 'long', 0]);
  assert.equal(extractor.convert('').kind, 'manual');
});

test('التقاط تلقائي حقيقي: 1066 مقطعًا عاديًا (ع-٣) وأقل منها طويلًا، والفشل يعيد رمزه لا استثناء', () => {
  const { extractor } = makeExtractor({ videoId: asr.fixture.videoId, durationMs: asr.fixture.durationMs });
  const r = extractor.handleMessage(captureMsg({ videoId: asr.fixture.videoId, body: asr.body, trackKind: 'asr' }));
  assert.deepEqual(r, { accepted: true, code: null });
  assert.equal(extractor.convert('en|asr').cues.length, 1066);
  assert.ok(extractor.convert('en|asr', { mode: 'long' }).cues.length < 1066);
  // جسم JSON صالح البنية لكنه متدحرج (الثاني يعيد ذيل الأول بأزمنته نفسها؛ تدقيق 7a66f91، U28): يُقبل التقاطه ويُعلَن
  // فشل تحويله برمزه.
  const rolling = JSON.stringify({ events: [
    { tStartMs: 0, dDurationMs: 5000, segs: [{ utf8: 'one', acAsrConf: 0 }, { utf8: ' two', tOffsetMs: 1000 }, { utf8: ' three', tOffsetMs: 2000 }, { utf8: ' four', tOffsetMs: 3000 }] },
    { tStartMs: 1000, dDurationMs: 5000, segs: [{ utf8: 'two', acAsrConf: 0 }, { utf8: ' three', tOffsetMs: 1000 }, { utf8: ' four', tOffsetMs: 2000 }, { utf8: ' five', tOffsetMs: 3000 }] },
  ] });
  const bad = extractor.handleMessage(captureMsg({ videoId: asr.fixture.videoId, body: rolling, trackKind: 'asr' }, { lang: 'en-GB' }));
  assert.deepEqual(bad, { accepted: true, code: 'EX_UNSUPPORTED_FORMAT' });
  const info = extractor.tracks().find((x) => x.key === 'en-GB|asr');
  assert.deepEqual([info.ok, info.code, info.cueCount], [false, 'EX_UNSUPPORTED_FORMAT', 0]);
  const conv = extractor.convert('en-GB|asr', { mode: 'long' });
  assert.deepEqual([conv.ok, conv.code, conv.cues.length], [false, 'EX_UNSUPPORTED_FORMAT', 0]);
  assert.equal(rankUsable(extractor.tracks())[0].key, 'en|asr', 'المعطوب لا يُختار');
});

test('المدة تُقرأ عند الطلب: التقاط سبق معرفتها يُفحص بحدودها لاحقًا', () => {
  const { extractor, state } = makeExtractor({ videoId: VID, durationMs: null });
  extractor.handleMessage(captureMsg(base));
  assert.equal(extractor.tracks()[0].completeness, null, 'المدة مجهولة');
  assert.deepEqual(extractor.tracks()[0].warnings, []);
  state.durationMs = manual.fixture.durationMs;
  assert.ok(extractor.tracks()[0].completeness >= 0.85);
  assert.equal(extractor.convert('en|manual').report.completeness, extractor.tracks()[0].completeness);
  state.durationMs = manual.fixture.durationMs * 3; // مدة أطول بكثير: النص يبدو ناقصًا
  assert.deepEqual(extractor.tracks()[0].warnings, ['EX_MAYBE_INCOMPLETE']);
  assert.equal(extractor.convert('en|manual').ok, true, 'تحذير لا رفض');
  state.durationMs = 1000; // أقصر من النص بكثير: ثابت الحدود يمنع التصدير برمزه (تدقيق 7a66f91، U39)
  const info = extractor.tracks()[0];
  assert.deepEqual([info.ok, info.code], [false, 'EX_BEYOND_DURATION']);
  assert.equal(extractor.convert('en|manual').ok, false);
});

test('سقف الذاكرة: ثمانية مسارات للفيديو، والأقدم يسقط', () => {
  const { extractor } = makeExtractor({ videoId: VID, durationMs: manual.fixture.durationMs });
  for (let i = 0; i < 10; i++) extractor.handleMessage(captureMsg(base, { lang: `en-x${i}` }));
  const keys = extractor.tracks().map((x) => x.key);
  assert.equal(keys.length, 8);
  assert.deepEqual([keys[0], keys[7]], ['en-x2|manual', 'en-x9|manual']);
  assert.equal(extractor.convert('en-x0|manual').code, 'EX_NO_TRACK');
});

test('التنقل يفرّغ كل المسارات والتحويلات المخزنة', () => {
  const { extractor, state } = makeExtractor({ videoId: VID, durationMs: manual.fixture.durationMs });
  extractor.handleMessage(captureMsg(base));
  extractor.convert('en|manual', { mode: 'long' });
  state.videoId = 'YYYYYYYYYYY';
  extractor.setVideo('YYYYYYYYYYY');
  assert.equal(extractor.tracks().length, 0);
  assert.equal(extractor.convert('en|manual', { mode: 'long' }).code, 'EX_NO_TRACK');
  assert.equal(extractor.diagnostics().tracks.length, 0);
});

test('التشخيص المنقّى: نوع الفشل وحجم الجسم وحالة الثوابت، بلا جسم ولا نص ولا رابط ولا رمز', () => {
  const { extractor } = makeExtractor({ videoId: VID, durationMs: manual.fixture.durationMs });
  // جسم فيه رابط ورمز في نص المقطع نفسه (متحدث ينطق عنوانًا) ولغة وتحقق ملغوم: لا يخرج شيء منها.
  const hostile = JSON.stringify({ events: [{
    tStartMs: 0, dDurationMs: 2000,
    segs: [{ utf8: 'visit https://www.youtube.com/api/timedtext?v=AAAAAAAAAAA&pot=ABCDEFGHIJKLMNOPQRSTUVWX now' }],
  }] });
  extractor.handleMessage(captureMsg({ videoId: VID, body: hostile }));
  extractor.handleMessage(captureMsg(base, { lang: 'en-GB' }));
  extractor.handleMessage(captureMsg(base, { hasTlang: true, lang: 'en-US' })); // بلا tlang صالح: EX_BAD_LANG (AA1)
  extractor.handleMessage(captureMsg(base, { body: '', bodyLength: 0, lang: 'en-AU' }));
  const d = extractor.diagnostics();
  assert.equal(d.tracks.length, 2);
  const gb = d.tracks.find((x) => x.key === 'en-GB|manual');
  assert.equal(gb.bodyLength, manual.body.length);
  assert.equal(gb.format, 'json3');
  assert.equal(gb.invariants.length, 6);
  assert.ok(gb.invariants.every((x) => x.ok === true && typeof x.id === 'number' && typeof x.key === 'string'));
  assert.deepEqual(d.rejected, { EX_BAD_LANG: 1, EX_EMPTY_BODY: 1 });
  assert.deepEqual(d.recentRejections.map((x) => x.code), ['EX_BAD_LANG', 'EX_EMPTY_BODY']);
  const report = createDiagnosticReport({ version: '0.3.0', browser: 'Brave 1.98', at: '2026-11-01T12:00:00.000Z', sections: { extract: d } });
  const text = formatDiagnosticReport(report);
  assert.deepEqual(findSecrets(text), [], text);
  for (const leaked of ['youtube.com', 'timedtext', 'ABCDEFGH', 'visit', manual.body.slice(100, 140)]) {
    assert.equal(text.includes(leaked), false, `يسرّب: ${leaked}`);
  }
  assert.equal(report.sections.extract.tracks[0].bodyLength > 0, true);
});

test('التشخيص يذكر فشل الثوابت لا نصها', () => {
  const { extractor, state } = makeExtractor({ videoId: VID, durationMs: manual.fixture.durationMs });
  extractor.handleMessage(captureMsg(base));
  state.durationMs = 1000;
  const t = extractor.diagnostics().tracks[0];
  assert.deepEqual([t.ok, t.code], [false, 'EX_BEYOND_DURATION']);
  assert.deepEqual(t.invariants.filter((x) => !x.ok).map((x) => x.key), ['bounds']);
});
