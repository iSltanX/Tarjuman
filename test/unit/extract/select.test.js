// اختيار المسار عند تعدد المسارات (P3-AC1). منذ 2.0.0 (AA1) لا تفضيل للغة ولا للهجة: اليدوي قبل التلقائي ثم الأحدث، والأصلي قبل
// المترجم آليًا (aa1-languages.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseTrack, rankTracks } from '../../../src/extract/select.js';

const t = (key, over = {}) => {
  const [lang, kind] = key.split('|');
  return { key, lang, kind, capturedAt: '2026-11-01T10:00:00.000Z', ok: true, cueCount: 100, ...over };
};
const keys = (list) => list.map((x) => x.key);

test('rankTracks: اليدوي قبل التلقائي، ثم الأحدث، ثم ترتيب الالتقاط (بلا تفضيل «en» على اللهجات منذ 2.0.0)', () => {
  const list = [
    t('en|asr'),
    t('en-GB|manual'),
    t('en|manual', { capturedAt: '2026-11-01T09:00:00.000Z' }),
    t('en|manual', { key: 'en_x|manual', lang: 'en_x' }),
    t('en-GB|asr'),
  ];
  assert.deepEqual(keys(rankTracks(list)), ['en-GB|manual', 'en_x|manual', 'en|manual', 'en|asr', 'en-GB|asr']);
});

test('rankTracks: الأحدث التقاطًا أولًا عند التساوي، والصالح قبل المعطوب، والمدخل لا يتغير', () => {
  const older = t('en|manual', { capturedAt: '2026-11-01T09:00:00.000Z' });
  const newer = t('en|asr', { capturedAt: '2026-11-01T11:00:00.000Z' });
  const newerAsr = t('en-GB|asr', { capturedAt: '2026-11-01T12:00:00.000Z' });
  const bad = t('en|manual', { key: 'en-US|manual', lang: 'en-US', ok: false, cueCount: 0, code: 'EX_INVARIANT_FAILED' });
  const input = [bad, newerAsr, newer, older];
  const snapshot = keys(input);
  assert.deepEqual(keys(rankTracks(input)), ['en|manual', 'en-GB|asr', 'en|asr', 'en-US|manual']);
  assert.deepEqual(keys(input), snapshot);
  const sameLang = [t('en|asr', { key: 'a|asr', capturedAt: '2026-11-01T08:00:00.000Z' }), t('en|asr', { key: 'b|asr', capturedAt: '2026-11-01T09:00:00.000Z' })];
  assert.deepEqual(keys(rankTracks(sameLang)), ['b|asr', 'a|asr']);
});

test('chooseTrack: اختيار المستخدم الصالح أقوى من الترتيب، والمعطوب لا يُختار', () => {
  const list = [t('en|manual'), t('en|asr'), t('en-GB|asr', { ok: false, cueCount: 0, code: 'EX_INVARIANT_FAILED' })];
  assert.equal(chooseTrack(list).key, 'en|manual');
  assert.equal(chooseTrack(list, 'en|asr').key, 'en|asr');
  assert.equal(chooseTrack(list, 'en-GB|asr').key, 'en|manual', 'المعطوب يرجع إلى الأفضل');
  assert.equal(chooseTrack(list, 'xx|manual').key, 'en|manual', 'مفتاح غير موجود يرجع إلى الأفضل');
});

test('chooseTrack: لا مسار صالح ← null', () => {
  assert.equal(chooseTrack([]), null);
  assert.equal(chooseTrack([t('en|manual', { ok: false, cueCount: 0 })]), null);
  assert.equal(chooseTrack([t('en|manual', { cueCount: 0 })]), null);
});
