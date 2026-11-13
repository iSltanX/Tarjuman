// الالتقاط بأي لغة (AA1، حرية اللغات): المسار بأي لغة يُقبل بمفتاحه، والمترجم آليًا من يوتيوب يُقبل موسومًا بلغتيه ومفتاحه
// الثلاثي ويُحوَّل ببنيته (قرار سلطان ق٢)، ولا يُختار افتراضيًا؛ وقائمة المسارات من بيانات المشغّل تُقرأ منقّاة للفيديو المعروض.
// الأجسام هنا عيّنتا P1 الحقيقيتان بالإنجليزية بوسم لغة آخر (اختبار قبول ومفاتيح، لا لغة النص)؛ الجسم الحقيقي لغير الإنجليزية
// لا يُجلب تحت الأتمتة، ودليله في جلسة AA5 اليدوية.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankTracks, rankUsable } from '../../../src/core/model/track-order.js';
import { MAX_LISTED_TRACKS, validateTracklistMessage } from '../../../src/extract/message.js';
import { convertCapture } from '../../../src/extract/capture-adapter.js';
import { captureMsg, makeExtractor, sample } from './helpers.js';

const manual = sample('manual');
const asr = sample('asr');
const VID = manual.fixture.videoId;

test('مسار بأي لغة يُقبل بمفتاحه lang|kind، والمترجم آليًا بـlang|kind|via ولغة محتواه tlang', () => {
  const { extractor, state } = makeExtractor({ videoId: VID, durationMs: asr.fixture.durationMs });
  state.durationMs = asr.fixture.durationMs;
  assert.equal(extractor.handleMessage(captureMsg({ videoId: VID, body: manual.body }, { lang: 'ja' })).accepted, true);
  assert.equal(extractor.handleMessage(captureMsg({ videoId: VID, body: asr.body, trackKind: 'asr' }, { lang: 'es' })).accepted, true);
  assert.equal(extractor.handleMessage(captureMsg({ videoId: VID, body: manual.body }, { lang: 'en', hasTlang: true, tlang: 'ar' })).accepted, true);
  const tracks = extractor.tracks();
  assert.deepEqual(tracks.map((t) => [t.key, t.lang, t.kind, t.via]), [
    ['ja|manual', 'ja', 'manual', null],
    ['es|asr', 'es', 'asr', null],
    ['ar|manual|en', 'ar', 'manual', 'en'],
  ]);
  const mt = extractor.convert('ar|manual|en');
  assert.equal(mt.ok, true);
  assert.equal(mt.via, 'en');
  assert.equal(mt.lang, 'ar');
  assert.equal(extractor.convert('ja|manual').via, null);
});

test('المترجم آليًا عن مسار تلقائي يُحوَّل ببنية جسمه كما وصل، فلا تحذير «النوع لا يطابق البنية»', () => {
  const asIs = convertCapture({ body: manual.body, trackKind: 'asr', via: 'en' }, manual.fixture.durationMs);
  assert.equal(asIs.ok, true);
  assert.equal(asIs.report.trackKind, 'manual');
  assert.equal(asIs.report.kindFromStructure, true);
  assert.equal(asIs.warnings.includes('KIND_MISMATCH'), false);
  const original = convertCapture({ body: manual.body, trackKind: 'asr' }, manual.fixture.durationMs);
  assert.equal(original.warnings.includes('KIND_MISMATCH'), true, 'الأصلي بنوعه المعلن كما كان');
});

test('الترتيب والاختيار: الأصلي قبل المترجم آليًا، واليدوي قبل التلقائي، بلا تفضيل للإنجليزية', () => {
  const t = (key, kind, via, at) => ({ key, lang: key.split('|')[0], kind, via, capturedAt: at, ok: true, cueCount: 3 });
  const list = [
    t('ar|manual|en', 'manual', 'en', '2026-01-01T00:00:03.000Z'),
    t('ja|asr', 'asr', null, '2026-01-01T00:00:02.000Z'),
    t('fr|manual', 'manual', null, '2026-01-01T00:00:01.000Z'),
    t('en|manual', 'manual', null, '2026-01-01T00:00:00.000Z'),
  ];
  assert.deepEqual(rankTracks(list).map((x) => x.key), ['fr|manual', 'en|manual', 'ja|asr', 'ar|manual|en']);
  assert.equal(rankUsable([list[0]])[0].key, 'ar|manual|en', 'وحده يُختار، لكن لا يتقدّم على أصلي');
});

const listMsg = (over = {}) => ({ source: 'tarjuman', v: 1, kind: 'tracklist', videoId: VID, tracks: [], translatable: false, ...over });

test('قائمة المسارات: اللغة والنوع والاسم وحدها، والمكرر والتالف والزائد يُسقط، ومحارف التحكم تُجرَّد', () => {
  const v = validateTracklistMessage(listMsg({
    tracks: [
      { lang: 'en', kind: 'asr', name: 'English (auto-generated)', baseUrl: 'https://secret' },
      { lang: 'ja', name: '日本語‮' },
      { lang: 'ja', kind: 'manual', name: 'dup' },
      { lang: 'x!', name: 'bad' },
      { lang: 'ar', kind: 'manual', name: 5 },
    ],
    translatable: true,
  }));
  assert.deepEqual(v, {
    videoId: VID,
    translatable: true,
    tracks: [
      { lang: 'en', kind: 'asr', name: 'English (auto-generated)' },
      { lang: 'ja', kind: 'manual', name: '日本語' },
      { lang: 'ar', kind: 'manual', name: null },
    ],
  });
  assert.equal(JSON.stringify(v).includes('secret'), false, 'لا رابط');
  assert.equal(validateTracklistMessage(listMsg({ videoId: 'bad' })), null);
  assert.equal(validateTracklistMessage(listMsg({ kind: 'timedtext' })), null);
  assert.equal(validateTracklistMessage({ ...listMsg(), source: 'x' }), null);
  const many = validateTracklistMessage(listMsg({ tracks: Array.from({ length: 100 }, (_, i) => ({ lang: `l${String.fromCharCode(97 + (i % 26))}${i > 25 ? 'x' : ''}`, kind: i % 2 ? 'asr' : 'manual' })) }));
  assert.ok(many.tracks.length <= MAX_LISTED_TRACKS);
});

test('المستخرج يحفظ قائمة الفيديو المعروض وحده، ويُبلِّغ بكل قائمة له، ويفرّغها عند التنقل', () => {
  const { extractor, state } = makeExtractor({ videoId: VID });
  let events = 0;
  extractor.subscribe(() => events++);
  assert.equal(extractor.available(), null);
  assert.deepEqual(extractor.handleMessage(listMsg({ videoId: 'ZZZZZZZZZZZ', tracks: [{ lang: 'en' }] })), { accepted: false, code: 'EX_WRONG_VIDEO' });
  assert.equal(extractor.handleMessage(listMsg({ tracks: [{ lang: 'en', kind: 'asr' }, { lang: 'ja' }], translatable: true })).accepted, true);
  assert.deepEqual(extractor.available(), { videoId: VID, translatable: true, tracks: [{ lang: 'en', kind: 'asr', name: null }, { lang: 'ja', kind: 'manual', name: null }] });
  assert.equal(events, 1);
  extractor.handleMessage(listMsg({ tracks: [{ lang: 'en', kind: 'asr' }, { lang: 'ja' }], translatable: true }));
  // تحقق Gemini، Y3: القائمة نفسها تصل بعد تغيّر عنوان المستند، والتبليغ بها يعيد حساب عنوان الفيديو في المتحكم.
  assert.equal(events, 2, 'تبليغ بالقائمة نفسها');
  assert.equal(extractor.diagnostics().listed.tracks, 2);
  state.videoId = 'BBBBBBBBBBB';
  extractor.setVideo('BBBBBBBBBBB');
  assert.equal(extractor.available(), null, 'لا قائمة فيديو سابق');
  assert.equal(extractor.tracks().length, 0);
});
