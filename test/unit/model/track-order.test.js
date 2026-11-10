// ترتيب المسارات عند تعددها (P3-AC1) من موضعه الواحد src/core/model/track-order.js. منذ 2.0.0 (AA1) لا تفضيل للغة ولا للهجة:
// اليدوي قبل التلقائي ثم الأحدث، والأصلي قبل المترجم آليًا (aa1-languages.test.js). وحُذف src/extract/select.js (ح6): لم
// يستعمله شيء في الإضافة، والمشغّل والمتحكم يأخذان أول الصالح من rankUsable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankTracks, rankUsable } from '../../../src/core/model/track-order.js';

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

test('rankUsable: الصالح وحده بالترتيب نفسه، فالأول هو المختار افتراضيًا', () => {
  const list = [t('en|manual'), t('en|asr'), t('en-GB|asr', { ok: false, cueCount: 0, code: 'EX_INVARIANT_FAILED' })];
  assert.deepEqual(keys(rankUsable(list)), ['en|manual', 'en|asr']);
});

test('rankUsable: لا مسار صالح ← قائمة فارغة', () => {
  assert.deepEqual(rankUsable([]), []);
  assert.deepEqual(rankUsable([t('en|manual', { ok: false, cueCount: 0 })]), []);
  assert.deepEqual(rankUsable([t('en|manual', { cueCount: 0 })]), []);
});
