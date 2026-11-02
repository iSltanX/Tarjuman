// صيغ العرض المشتركة (src/ui/format.js) ورموز المشغّل: أرقام لاتينية، والإزاحة بعلامتها، والعدّ بالعربية.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COUNT_FORMS, formatBytes, formatCount, formatOffset, formatTimecode } from '../../../src/ui/format.js';
import { PLAYER_TOKENS, playerTokensCss } from '../../../src/ui/player-tokens.js';

test('الإزاحة: +0.5 و−1.0 و0.0، والعلامة جزء من القيمة', () => {
  assert.equal(formatOffset(0), '0.0');
  assert.equal(formatOffset(500), '+0.5');
  assert.equal(formatOffset(-1000), '−1.0');
  assert.equal(formatOffset(12300), '+12.3');
  assert.equal(formatOffset(-40), '0.0');
});

test('الزمن بصيغة SRT وأرقام لاتينية', () => {
  assert.equal(formatTimecode(724500), '00:12:04,500');
  assert.equal(formatTimecode(0), '00:00:00,000');
  assert.equal(formatTimecode(36000000 + 1), '10:00:00,001');
  assert.equal(formatTimecode(-1500), '−00:00:01,500');
});

test('العدّ بالعربية', () => {
  const c = (n) => formatCount(n, COUNT_FORMS.cue);
  assert.deepEqual([c(0), c(1), c(2), c(3), c(10), c(11), c(100), c(103), c(412)], ['0 مقطع', 'مقطع واحد', 'مقطعان', '3 مقاطع', '10 مقاطع', '11 مقطعًا', '100 مقطع', '103 مقاطع', '412 مقطعًا']);
  assert.equal(formatCount(24, COUNT_FORMS.video), '24 فيديو');
});

test('الأحجام ورموز المشغّل', () => {
  assert.equal(formatBytes(2.1 * 1024 * 1024), '2.1 م.ب');
  assert.equal(formatBytes(820 * 1024), '820 ك.ب');
  const css = playerTokensCss();
  assert.match(css, /^:host \{ /);
  assert.ok(css.includes('--tj-p-accent: #A5ACFF;'));
  assert.ok(css.includes('--tj-p-accent-ink: #14143A;'));
  assert.ok(css.includes('--tj-p-sub-bg-soft: rgb(0 0 0 / 72%);'));
  assert.equal(Object.keys(PLAYER_TOKENS).length, (css.match(/--tj-p-/g) || []).length);
});
