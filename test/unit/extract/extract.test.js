import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORMATS, formatOf, readTimedtextParams } from '../../../src/extract/timedtext-params.js';
import { validateCaptureMessage } from '../../../src/extract/message.js';
import { checkAcceptance } from '../../../src/extract/capture-adapter.js';
import { createCaptureStore } from '../../../src/extract/capture-store.js';
import { createPendingBuffer } from '../../../src/extract/pending.js';

test('pending: التقاط سبق تغيّر العنوان يُسحب لفيديوه خلال النافذة فقط', () => {
  const p = createPendingBuffer({ windowMs: 2000 });
  const m = (videoId) => ({ videoId, lang: 'en', trackKind: 'manual' });
  p.add(m('AAAAAAAAAAA'), 1000);
  p.add(m('BBBBBBBBBBB'), 1500);
  p.add(m(null), 1500);
  assert.equal(p.size, 2);
  assert.deepEqual(p.take('CCCCCCCCCCC', 2000), []);
  const hit = p.take('AAAAAAAAAAA', 2300);
  assert.equal(hit.length, 1);
  assert.equal(hit[0].ageMs, 1300);
  assert.equal(p.take('AAAAAAAAAAA', 2300).length, 0, 'لا يُسحب مرتين');
  assert.equal(p.take('BBBBBBBBBBB', 3600).length, 0, 'انتهت النافذة');
  assert.equal(p.take(null, 3600).length, 0);
});

// رابط اصطناعي بقيم وهمية؛ لا يُحفظ أي رابط حقيقي في المستودع.
const fake = (extra) => `https://www.youtube.com/api/timedtext?v=AAAAAAAAAAA&caps=asr&opi=1&xoaf=5&expire=1700000000&sparams=ip,expire&signature=FAKE&lang=en&fmt=json3&pot=FAKEPOTVALUEFAKEPOTVALUE${extra}`;

test('readTimedtextParams: القيم المسموح بها فقط', () => {
  const m = readTimedtextParams(fake('&kind=asr'));
  assert.deepEqual(m, {
    videoId: 'AAAAAAAAAAA', lang: 'en', trackKind: 'asr', kindParam: 'asr', capsAsr: true,
    hasTlang: false, tlang: null, format: 'json3', hasPot: true,
  });
  assert.equal(readTimedtextParams(fake('')).trackKind, 'manual', 'caps=asr وحده لا يعني تلقائيًا');
  assert.equal(readTimedtextParams(fake('&tlang=ar')).hasTlang, true);
  assert.equal(readTimedtextParams(fake('&tlang=ar')).tlang, 'ar', 'لغة ترجمة يوتيوب الآلية (AA1)');
  assert.equal(readTimedtextParams(fake('&tlang=a!')).tlang, null);
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

test('الفكرة ٤ (الإنذار المبكر): fmt=vtt يُسمّى vtt لا other، والمجهول other، وبلا fmt default', () => {
  const at = (fmt) => readTimedtextParams(fake('').replace('&fmt=json3', fmt === null ? '' : `&fmt=${fmt}`)).format;
  assert.deepEqual([at('json3'), at('srv3'), at('vtt'), at('ttml'), at('VTT'), at(null)], ['json3', 'srv3', 'vtt', 'other', 'other', 'default']);
  assert.deepEqual([...FORMATS], ['json3', 'srv3', 'vtt', 'other', 'default']);
  assert.ok(Object.isFrozen(FORMATS));
  assert.equal(formatOf('vtt'), 'vtt');
  // والرسالة تحفظ الاسم (كانت تصير other)، وكل صنف من FORMATS يمر كما هو.
  for (const f of FORMATS) assert.equal(validateCaptureMessage(msg({ format: f })).format, f);
  assert.equal(validateCaptureMessage(msg({ format: 'ttml' })).format, 'other');
});

test('الفكرة ٤ (الإنذار المبكر): وسم responseType=document يمر بقيمته وحدها، وغيره null', () => {
  assert.equal(validateCaptureMessage(msg({ body: '', bodyLength: 0, responseType: 'document' })).responseType, 'document');
  for (const v of [undefined, 'text', 'json', 'Document', 1]) assert.equal(validateCaptureMessage(msg({ responseType: v })).responseType, null, String(v));
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
  // منذ 2.0.0 (AA1): أي لغة صالحة، والمترجم آليًا بلغة صالحة (قرار سلطان ق٢)؛ والمرفوض الرمز غير الصالح وحده.
  assert.equal(v({ lang: 'de' }).accepted, true);
  assert.equal(v({ lang: 'ja' }).accepted, true);
  assert.equal(v({ lang: 'en-GB' }).accepted, true);
  assert.equal(v({ lang: 'eng' }).accepted, true);
  assert.equal(v({ lang: 'e!' }).code, 'EX_BAD_LANG');
  assert.equal(v({ hasTlang: true, tlang: 'ar' }).accepted, true);
  assert.equal(v({ hasTlang: true }).code, 'EX_BAD_LANG', 'tlang بلا لغة صالحة');
  assert.equal(v({ status: 403 }).code, 'EX_EMPTY_BODY');
  assert.equal(v({ body: '', bodyLength: 0 }).code, 'EX_EMPTY_BODY');
  assert.equal(v({ format: 'srv3', body: '<timedtext/>' }).code, 'EX_UNSUPPORTED_FORMAT');
  assert.equal(v({ format: 'default' }).accepted, true);
  assert.equal(v({}, { ...ctx, isLive: true }).code, 'EX_LIVE');
  // الفكرة ٤-ب: سبب الرفض يحدد موضعه داخل رمزه (القائمة كلها في test/unit/convert/reasons.test.js).
  assert.equal(v({ format: 'srv3', body: '<timedtext/>' }).reason, 'fmt-srv3');
  assert.equal(v({ format: 'default', body: '<transcript/>' }).reason, 'default-not-json');
  assert.equal(v({ status: 403 }).reason, 'status');
  assert.equal(v({ body: '', bodyLength: 0 }).reason, 'blank');
  assert.equal(v({ hasTlang: true }).reason, 'bad-tlang');
  // الإنذار المبكر: vtt باسمها، ورد XHR بنوع document بلا جسم صيغةٌ لا تُقرأ لا «استجابة فارغة»، والحالة قبلهما.
  assert.deepEqual([v({ format: 'vtt', body: 'WEBVTT' }).code, v({ format: 'vtt', body: 'WEBVTT' }).reason], ['EX_UNSUPPORTED_FORMAT', 'fmt-vtt']);
  const doc = v({ body: '', bodyLength: 0, responseType: 'document' });
  assert.deepEqual([doc.accepted, doc.code, doc.reason], [false, 'EX_UNSUPPORTED_FORMAT', 'xhr-document']);
  assert.equal(v({ body: '', bodyLength: 0, responseType: 'document', status: 404 }).reason, 'status');
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
