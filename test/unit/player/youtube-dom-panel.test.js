// الفكرة ١ (الجولة الثالثة): مواضع لوحة النص وسمات صفحة المشاهدة في youtube-dom.js، مصدرًا واحدًا لأسماء يوتيوب (R39، عقد
// interfaces §٧). القيم هي ما كان في panel/column.js وpanel/session.js حرفيًا، فالنقل لا يغيّر سلوك اللوحة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as column from '../../../src/player/panel/column.js';
import { ATTRS, PANEL_SELECTORS, SELECTORS, isBelow } from '../../../src/player/youtube-dom.js';

test('PANEL_SELECTORS: محددات اللوحة كما كانت في column.js، مجمّدة، ولا شيء منها في SELECTORS', () => {
  assert.ok(Object.isFrozen(PANEL_SELECTORS));
  assert.deepEqual([PANEL_SELECTORS.secondaryInner, PANEL_SELECTORS.secondary, PANEL_SELECTORS.anySecondaryInner, PANEL_SELECTORS.anySecondary], [...column.COLUMN_SELECTORS]);
  assert.equal(PANEL_SELECTORS.below, column.BELOW_SELECTOR);
  assert.equal(PANEL_SELECTORS.belowAnchor, column.BELOW_ANCHOR_TAG);
  assert.equal(PANEL_SELECTORS.columns, column.COLUMNS_SELECTOR);
  assert.equal(PANEL_SELECTORS.primary, column.PRIMARY_SELECTOR);
  assert.equal(PANEL_SELECTORS.secondary, column.SECONDARY_SELECTOR);
  assert.equal(PANEL_SELECTORS.flexy, 'ytd-watch-flexy');
  const keys = new Set(Object.keys(SELECTORS));
  assert.deepEqual(Object.keys(PANEL_SELECTORS).filter((k) => keys.has(k)), [], 'مفاتيح منفصلة عن SELECTORS');
});

test('ATTRS: سمة العمود الواحد كما في column.js، والوضع الداكن على html، ونمط سمات التخطيط', () => {
  assert.ok(Object.isFrozen(ATTRS));
  assert.equal(ATTRS.singleColumn, column.SINGLE_COLUMN_ATTR);
  assert.equal(ATTRS.dark, 'dark');
  for (const name of ['is-two-columns_', 'is-single-column', 'theater', 'theater-requested_', 'fullscreen', 'full-bleed-player']) assert.ok(ATTRS.layout.test(name), name);
  for (const name of ['flexy', 'video-id', 'role']) assert.ok(!ATTRS.layout.test(name), name);
});

test('isBelow: العنصر بمعرّف #below وحده، لا العمود الثانوي ولا الغائب', () => {
  assert.equal(isBelow({ id: 'below' }), true);
  assert.equal(isBelow({ id: 'secondary' }), false);
  assert.equal(isBelow({ id: 'secondary-inner' }), false);
  assert.equal(isBelow(null), false);
  assert.equal(isBelow(undefined), false);
});
