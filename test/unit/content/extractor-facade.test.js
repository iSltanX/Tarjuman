// واجهة ExtractorAdapter كما يستعملها سكربت المحتوى (src/extract/index.js)، على عينة P1 الحقيقية.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createExtractor } from '../../../src/extract/index.js';
import { realTrack } from '../../helpers/fixtures.js';

const { fixture, body, cues } = realTrack('manual');
const VID = fixture.videoId;
const msg = (extra = {}) => ({
  source: 'tarjuman', v: 1, kind: 'timedtext', videoId: VID, lang: 'en', trackKind: 'manual', kindParam: null,
  capsAsr: true, hasTlang: false, format: 'json3', hasPot: true, transport: 'xhr', status: 200,
  bodyLength: body.length, body, truncated: false, ...extra,
});

function env(start = VID) {
  let current = start;
  let t = 1000;
  return {
    set: (id) => {
      current = id;
    },
    tick: (ms) => {
      t += ms;
    },
    opts: { currentVideoId: () => current, durationMs: () => fixture.durationMs, isLive: () => false, now: () => t },
  };
}

test('التقاط مقبول: مسار en|manual بعدد مقاطع P1، والتحويل العادي يعيد المقاطع نفسها', () => {
  const e = env();
  const x = createExtractor(e.opts);
  let events = 0;
  x.subscribe(() => events++);
  assert.deepEqual(x.handleMessage(msg()), { accepted: true, code: null });
  assert.equal(events, 1);
  const [t] = x.tracks();
  assert.equal(t.key, 'en|manual');
  assert.equal(t.cueCount, cues.length);
  assert.equal(t.ok, true);
  assert.ok(t.completeness >= 0.85);
  const conv = x.convert('en|manual');
  assert.equal(conv.ok, true);
  assert.deepEqual(conv.cues, cues);
  conv.cues[0].text = 'عبث';
  assert.notEqual(x.convert('en|manual').cues[0].text, 'عبث', 'نسخة مستقلة');
  assert.equal(x.convert('en|manual', { mode: 'long' }).mode, 'long', 'سلوك الوضع الطويل في test/unit/extract (P3)');
  assert.equal(x.convert('en|asr').code, 'EX_NO_TRACK');
  assert.equal(JSON.stringify(x.diagnostics()).includes(body.slice(0, 40)), false, 'التشخيص بلا جسم');
});

test('بيانات غير صالحة تُهمل، والرفض الذي يخص المستخدم يظهر في lastRejection', () => {
  const x = createExtractor(env().opts);
  assert.deepEqual(x.handleMessage({ source: 'tarjuman', v: 2 }), { accepted: false, code: null });
  assert.deepEqual(x.handleMessage('نص'), { accepted: false, code: null });
  assert.equal(x.handleMessage(msg({ hasTlang: true })).code, 'EX_BAD_LANG', 'ترجمة آلية بلا لغة صالحة (AA1)');
  assert.equal(x.lastRejection().code, 'EX_BAD_LANG');
  assert.equal(x.handleMessage(msg({ lang: 'a!' })).code, 'EX_BAD_LANG');
  assert.equal(x.handleMessage(msg({ videoId: 'ZZZZZZZZZZZ' })).code, 'EX_WRONG_VIDEO');
  assert.equal(x.lastRejection().code, 'EX_BAD_LANG', 'رفض فيديو آخر لا يُعرض للمستخدم');
  assert.equal(x.tracks().length, 0);
});

test('التنقل: يفرّغ مسارات الفيديو السابق، ويقبل التقاطًا سبق تغيّر العنوان خلال النافذة', () => {
  const e = env('XXXXXXXXXXX');
  const x = createExtractor(e.opts);
  assert.equal(x.handleMessage(msg()).code, 'EX_WRONG_VIDEO', 'المشغّل طلب ترجمة التالي قبل تغيّر العنوان');
  e.tick(300);
  e.set(VID);
  x.setVideo(VID);
  assert.equal(x.tracks().length, 1, 'أُعيد تقييمه بكل القواعد فقُبل');
  e.set('YYYYYYYYYYY');
  x.setVideo('YYYYYYYYYYY');
  assert.equal(x.tracks().length, 0);
  assert.equal(x.convert('en|manual').code, 'EX_NO_TRACK');
});
