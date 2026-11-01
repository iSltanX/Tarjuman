import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readTimedtextParams } from '../../../src/extract/timedtext-params.js';
import { validateCaptureMessage } from '../../../src/extract/message.js';
import { checkAcceptance } from '../../../src/extract/capture-adapter.js';
import { createCaptureStore } from '../../../src/extract/capture-store.js';
import { videoIdFromLocation } from '../../../src/extract/video-id.js';

// رابط اصطناعي بقيم وهمية؛ لا يُحفظ أي رابط حقيقي في المستودع.
const fake = (extra) => `https://www.youtube.com/api/timedtext?v=AAAAAAAAAAA&caps=asr&opi=1&xoaf=5&expire=1700000000&sparams=ip,expire&signature=FAKE&lang=en&fmt=json3&pot=FAKEPOTVALUEFAKEPOTVALUE${extra}`;

test('readTimedtextParams: القيم المسموح بها فقط', () => {
  const m = readTimedtextParams(fake('&kind=asr'));
  assert.deepEqual(m, {
    videoId: 'AAAAAAAAAAA', lang: 'en', trackKind: 'asr', kindParam: 'asr', capsAsr: true,
    hasTlang: false, format: 'json3', hasPot: true,
  });
  assert.equal(readTimedtextParams(fake('')).trackKind, 'manual', 'caps=asr وحده لا يعني تلقائيًا');
  assert.equal(readTimedtextParams(fake('&tlang=ar')).hasTlang, true);
  assert.equal(JSON.stringify(m).includes('FAKE'), false);
  assert.equal(readTimedtextParams('/api/timedtext?v=AAAAAAAAAAA&lang=en', 'https://www.youtube.com/watch?v=x').videoId, 'AAAAAAAAAAA');
  assert.equal(readTimedtextParams('https://evil.example/api/timedtext?v=AAAAAAAAAAA'), null);
  assert.equal(readTimedtextParams('https://www.youtube.com/api/stats/watchtime?v=AAAAAAAAAAA'), null);
  assert.equal(readTimedtextParams('http://www.youtube.com/api/timedtext?v=AAAAAAAAAAA'), null);
  assert.equal(readTimedtextParams('::'), null);
  assert.equal(readTimedtextParams(fake('').replace('v=AAAAAAAAAAA', 'v=bad')).videoId, null);
});

const msg = (over = {}) => ({
  source: 'tarjuman', v: 1, kind: 'timedtext', videoId: 'AAAAAAAAAAA', lang: 'en', trackKind: 'manual',
  kindParam: null, capsAsr: true, hasTlang: false, format: 'json3', hasPot: true, transport: 'fetch',
  status: 200, bodyLength: 2, body: '{"events":[]}', ...over,
});

test('validateCaptureMessage: يرفض غير المتوقع وينسخ المعروف فقط', () => {
  assert.equal(validateCaptureMessage(null), null);
  assert.equal(validateCaptureMessage({ ...msg(), source: 'x' }), null);
  assert.equal(validateCaptureMessage({ ...msg(), v: 2 }), null);
  assert.equal(validateCaptureMessage({ ...msg(), body: 5 }), null);
  assert.equal(validateCaptureMessage({ ...msg(), status: '200' }), null);
  const m = validateCaptureMessage({ ...msg(), url: 'https://secret', videoId: '<script>', extra: 1 });
  assert.equal(m.videoId, null);
  assert.equal('url' in m, false);
  assert.equal('extra' in m, false);
});

test('checkAcceptance: قواعد العقد بالترتيب', () => {
  const ctx = { currentVideoId: 'AAAAAAAAAAA' };
  const v = (o, c = ctx) => checkAcceptance(validateCaptureMessage(msg(o)), c);
  assert.equal(v({}).accepted, true);
  assert.equal(v({}, { currentVideoId: null }).code, 'EX_NO_VIDEO');
  assert.equal(v({ videoId: 'BBBBBBBBBBB' }).code, 'EX_WRONG_VIDEO');
  assert.equal(v({ hasTlang: true }).code, 'EX_TRANSLATED_TRACK');
  assert.equal(v({ lang: 'de' }).code, 'EX_NOT_ENGLISH');
  assert.equal(v({ lang: 'en-GB' }).accepted, true);
  assert.equal(v({ lang: 'eng' }).code, 'EX_NOT_ENGLISH');
  assert.equal(v({ status: 403 }).code, 'EX_EMPTY_BODY');
  assert.equal(v({ body: '', bodyLength: 0 }).code, 'EX_EMPTY_BODY');
  assert.equal(v({ format: 'srv3', body: '<timedtext/>' }).code, 'EX_UNSUPPORTED_FORMAT');
  assert.equal(v({ format: 'default' }).accepted, true);
  assert.equal(v({}, { ...ctx, isLive: true }).code, 'EX_LIVE');
});

test('capture-store: يُفرَّغ ما لا يخص الفيديو الحالي ولا يقبل غيره', () => {
  const s = createCaptureStore();
  s.setCurrentVideo('AAAAAAAAAAA');
  s.accept({ videoId: 'AAAAAAAAAAA', lang: 'en', trackKind: 'manual', body: 'x' });
  s.accept({ videoId: 'AAAAAAAAAAA', lang: 'en', trackKind: 'manual', body: 'y' });
  assert.equal(s.accepted().length, 1);
  assert.equal(s.accepted()[0].body, 'y');
  assert.throws(() => s.accept({ videoId: 'BBBBBBBBBBB', lang: 'en', trackKind: 'manual' }));
  s.setCurrentVideo('BBBBBBBBBBB');
  assert.equal(s.accepted().length, 0);
  assert.equal(s.navigations, 2);
});

test('videoIdFromLocation', () => {
  assert.equal(videoIdFromLocation({ pathname: '/watch', search: '?v=AAAAAAAAAAA&t=5' }), 'AAAAAAAAAAA');
  assert.equal(videoIdFromLocation({ pathname: '/watch', search: '?v=short' }), null);
  assert.equal(videoIdFromLocation({ pathname: '/shorts/AAAAAAAAAAA', search: '' }), 'AAAAAAAAAAA');
  assert.equal(videoIdFromLocation({ pathname: '/', search: '' }), null);
  assert.equal(videoIdFromLocation({ pathname: '/results', search: '?search_query=a' }), null);
});
