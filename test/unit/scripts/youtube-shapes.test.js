// ف8 (2026-11-10): «هل تغيّر يوتيوب؟» أشكال بلا قيم ومقارنتها بخط الأساس. الوحدة نقية؛ والمشغّل الحي في test/live لا يُشغَّل هنا.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NAV_EVENTS, diffLine, diffShapes, logRow, requestShape, shapeOf, snapshot } from '../../../scripts/youtube-shapes.mjs';
import { SELECTORS } from '../../../src/player/youtube-dom.js';

const BASELINE = JSON.parse(readFileSync(new URL('../../fixtures/youtube/shapes-baseline.json', import.meta.url), 'utf8'));

test('shapeOf: الأنواع والمفاتيح لا القيم، وأول عنصر من المصفوفة', () => {
  assert.deepEqual(shapeOf({ b: 'x', a: [{ lang: 'en', n: 3 }, { lang: 'ar' }], c: null }), { a: [{ lang: 'string', n: 'number' }], b: 'string', c: 'null' });
  assert.equal(shapeOf('secret-token-123'), 'string');
});

test('requestShape: أسماء المعاملات مرتبة، بلا قيمة (لا معرّف ولا رمز pot) ولا مسار', () => {
  const s = requestShape('https://www.youtube.com/api/timedtext?v=AAAAAAAAAAA&lang=en&pot=SECRET&fmt=json3&lang=ar');
  assert.deepEqual(s, { params: ['fmt', 'lang', 'pot', 'v'] });
  assert.ok(!JSON.stringify(s).includes('SECRET') && !JSON.stringify(s).includes('AAAAAAAAAAA'));
  assert.equal(requestShape('not a url'), null);
});

test('snapshot وdiffShapes: عنصر غاب يُسمّى «غاب»، وطلب بمعامل جديد «تغيّر»، والمصدر والتاريخ لا يُقارنان', () => {
  const inPage = { dom: Object.fromEntries(Object.keys(SELECTORS).map((k) => [k, k !== 'liveBadge'])), tracklist: { renderer: { captionTracks: ['object'] }, track: { languageCode: 'string' } } };
  const base = snapshot({ inPage, requests: ['https://www.youtube.com/api/timedtext?v=x&lang=en'], events: ['yt-navigate-finish'], source: 'A', at: '2026-01-01' });
  const renamed = structuredClone(inPage);
  renamed.dom.rightControls = false;
  const now = snapshot({ inPage: renamed, requests: ['https://www.youtube.com/api/timedtext?v=y&lang=ar&pot=z'], events: ['yt-navigate-finish'], source: 'B', at: '2026-02-02' });
  const diffs = diffShapes(base, now);
  assert.deepEqual(diffs.map(diffLine), ['غاب: dom.rightControls', 'تغيّر: timedtext']);
  assert.deepEqual(diffShapes(base, structuredClone(base)), [], 'لا فروق مع نفسه');
  assert.deepEqual(Object.keys(base.events), NAV_EVENTS);
});

test('صف السجل بأعمدة الجدول، ويذكر الفروق', () => {
  const row = logRow({ date: '2026-11-10', browser: 'chrome', version: '157.0', diffs: [{ path: 'dom.rightControls', kind: 'missing' }], source: 'المشغّل المحلي' });
  assert.equal(row.split('|').length - 2, 5, 'خمسة أعمدة');
  assert.match(row, /\| 2026-11-10 \| — \| 157\.0 \| — \|/);
  assert.match(row, /غاب: dom\.rightControls/);
});

test('خط الأساس في المستودع: أشكال بلا قيم، ومصدره مذكور، ومفاتيح dom هي SELECTORS', () => {
  assert.equal(BASELINE.version, 1);
  assert.ok(BASELINE.source && BASELINE.at);
  assert.deepEqual(Object.keys(BASELINE.dom).sort(), Object.keys(SELECTORS).sort());
  assert.ok(Object.values(BASELINE.dom).every((v) => v === true || v === false));
  const text = JSON.stringify(BASELINE);
  assert.ok(!/https?:\/\//.test(text), 'بلا رابط');
  for (const id of ['iG9CE55wbtY', 'walkF00001x']) assert.ok(!text.includes(id), `بلا معرّف فيديو (${id})`);
});
