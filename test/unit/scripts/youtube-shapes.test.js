// ف8 (2026-11-10): «هل تغيّر يوتيوب؟» أشكال بلا قيم ومقارنتها بخط الأساس. الوحدة نقية؛ والمشغّل الحي في test/live لا يُشغَّل هنا.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NAV_EVENTS, WATCHED, collectInPage, diffLine, diffShapes, logRow, requestShape, shapeOf, snapshot } from '../../../scripts/youtube-shapes.mjs';
import { CLASSES, SELECTORS } from '../../../src/player/youtube-dom.js';

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

test('WATCHED: SELECTORS كلها كما هي، وزمن المشغّل بصنفه داخل الأدوات اليسرى كما يبحث عنه bar.js', () => {
  for (const [k, sel] of Object.entries(SELECTORS)) assert.equal(WATCHED[k], sel, k);
  assert.equal(WATCHED.timeDisplay, `${SELECTORS.leftControls} .${CLASSES.timeDisplay}`);
  assert.equal(CLASSES.timeDisplay, 'ytp-time-display');
  assert.deepEqual(Object.keys(WATCHED).sort(), [...Object.keys(SELECTORS), 'timeDisplay'].sort());
});

test('collectInPage: زمن بلا أدوات يسرى أو باسم آخر «غاب»، ووجوده في مكانه «موجود»', () => {
  const run = (present) => {
    const saved = { document: globalThis.document, window: globalThis.window };
    globalThis.document = { querySelector: (sel) => (present.includes(sel) ? {} : null), getElementById: () => null };
    globalThis.window = {};
    try {
      return collectInPage(WATCHED).dom;
    } finally {
      globalThis.document = saved.document;
      globalThis.window = saved.window;
    }
  };
  const all = Object.values(WATCHED);
  assert.equal(run(all).timeDisplay, true);
  const renamed = run(all.filter((sel) => sel !== WATCHED.timeDisplay));
  assert.equal(renamed.timeDisplay, false);
  assert.equal(renamed.leftControls, true);
  const base = snapshot({ inPage: { dom: run(all), tracklist: {} }, requests: [], events: [], source: 'A', at: 'x' });
  const now = snapshot({ inPage: { dom: renamed, tracklist: {} }, requests: [], events: [], source: 'B', at: 'y' });
  assert.deepEqual(diffShapes(base, now).map(diffLine), ['غاب: dom.timeDisplay']);
});

test('خط الأساس في المستودع: أشكال بلا قيم، ومصدره مذكور، ومفاتيح dom هي WATCHED، والتنقل الفعلي سُجّل', () => {
  assert.equal(BASELINE.version, 1);
  assert.ok(BASELINE.source && BASELINE.at);
  assert.deepEqual(Object.keys(BASELINE.dom).sort(), Object.keys(WATCHED).sort());
  // جُمع بعد انتقال فعلي إلى مقترح (Y2): كان yt-navigate-start false لأن الجولة لم تنتقل.
  assert.equal(BASELINE.events['yt-navigate-start'], true);
  assert.ok(Object.values(BASELINE.dom).every((v) => v === true || v === false));
  const text = JSON.stringify(BASELINE);
  assert.ok(!/https?:\/\//.test(text), 'بلا رابط');
  for (const id of ['iG9CE55wbtY', 'walkF00001x']) assert.ok(!text.includes(id), `بلا معرّف فيديو (${id})`);
});
