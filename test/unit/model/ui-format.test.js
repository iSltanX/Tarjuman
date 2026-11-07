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
  assert.ok(css.includes('--tj-p-accent: #D9937B;'));
  assert.ok(css.includes('--tj-p-accent-ink: #0F1917;'));
  assert.ok(css.includes('--tj-p-selected: rgb(217 147 123 / 18%);'));
  assert.ok(css.includes('--tj-p-selected-ink: #D9937B;'));
  assert.ok(css.includes('--tj-p-menu-bg: rgb(15 25 23 / 92%);'));
  assert.ok(css.includes('--tj-p-sub-bg-soft: rgb(0 0 0 / 72%);'));
  assert.equal(Object.keys(PLAYER_TOKENS).length, (css.match(/--tj-p-/g) || []).length);
});

test('تدقيق 5fedcb9 (CL-001): الإزاحة الموقّعة داخل الجمل العربية معزولة LTR في كل سطح، والقيمة نفسها كالشارة', async () => {
  const { offsetInline, formatOffset } = await import('../../../src/ui/format.js');
  const { offsetToast, badgeTip, nudgeFlash } = await import('../../../src/player/controls/text.js');
  const { offsetLine, offsetNotice } = await import('../../../src/pages/editor/text.js');
  const { rowModel } = await import('../../../src/pages/library/model.js');
  const isolated = (s, ms) => s.includes(`⁦${formatOffset(ms)}⁩`);
  assert.equal(offsetInline(500), '⁦+0.5⁩');
  assert.equal(offsetInline(-1000), '⁦−1.0⁩');
  for (const ms of [500, -1000]) {
    for (const s of [offsetToast(ms), badgeTip(ms), nudgeFlash(ms), offsetLine(ms), offsetNotice(ms)]) assert.ok(isolated(s, ms), s);
  }
  const e = { videoId: 'AAAAAAAAAAA', title: 't', updatedAt: '2026-11-01T10:00:00.000Z', rev: 1, english: [], arabic: null, fingerprints: 0, view: { displayOffsetMs: -1500, displayMode: 'ar' } };
  assert.ok(isolated(rowModel({ ...e, summary: { filled: 0, edited: 0, warned: 0, marks: { todo: 0, done: 0 } }, slots: [] }, Date.now()).offsetText, -1500));
});

test('تدقيق 5fedcb9 (CL-002): نص مقطع فيه حرف عربي RTL ولو بدأ بكلمة لاتينية، والخالي منه LTR؛ وجمل المزامنة بلا plaintext', async () => {
  const { textDirection } = await import('../../../src/ui/format.js');
  const { readFileSync } = await import('node:fs');
  assert.equal(textDirection('API هو الواجهة! (الجزء 3)'), 'rtl');
  assert.equal(textDirection('iPhone 17: مراجعة كاملة.'), 'rtl');
  assert.equal(textDirection('Hello world.'), 'ltr');
  assert.equal(textDirection(''), 'ltr');
  const css = readFileSync(new URL('../../../src/player/controls/styles.js', import.meta.url), 'utf8');
  assert.match(css, /button\.item\.sentence \{[^}]*unicode-bidi: isolate/);
  const { nameHintText } = await import('../../../src/pages/library/model.js');
  assert.ok(nameHintText({ videoId: 'BBBBBBBBBBB', differs: true }, () => 'Talk: part 2!').includes('⁨Talk: part 2!⁩'));
});
