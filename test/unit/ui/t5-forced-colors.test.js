// ت-٥ (تحقق Fable للتصميم، البند 27 في الجولة الثانية): لا دعم لوضع التباين العالي. ستة حقول تلغي حلقة التركيز بـ`outline: none`
// وتكتفي بظل يمحوه ذلك الوضع، والحالات المختارة تُميَّز بالخلفية وحدها فتتساوى فيه. صار: حدّ شفاف بدل `none` (يظهر بلون النظام في
// الوضع)، وكتلة `@media (forced-colors: active)` في كل ورقة أنماط تميّز المختار بحدّ بلون النظام، والمفتاح بمسار وإبهام ظاهرين.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { groupCss, layerCss } from '../../../src/player/controls/styles.js';
import { panelCss } from '../../../src/player/panel/styles.js';

const read = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const SHEETS = {
  'src/ui/components.css': read('src/ui/components.css'),
  'src/pages/editor/editor.css': read('src/pages/editor/editor.css'),
  'src/pages/settings/settings.css': read('src/pages/settings/settings.css'),
  'player/controls groupCss': groupCss(),
  'player/controls layerCss': layerCss(),
  'player/panel panelCss': panelCss(),
};
/** كتلة forced-colors في الورقة (أول واحدة)، أو ''. */
const forcedBlock = (css) => {
  const i = css.indexOf('@media (forced-colors: active)');
  if (i < 0) return '';
  let depth = 0;
  for (let k = css.indexOf('{', i); k < css.length; k++) {
    if (css[k] === '{') depth++;
    else if (css[k] === '}' && --depth === 0) return css.slice(i, k + 1);
  }
  return '';
};

test('ت-٥: لا قاعدة تلغي حلقة التركيز بـoutline: none، والحقول بحدّ شفاف يظهر في التباين العالي', () => {
  for (const [name, css] of Object.entries(SHEETS)) {
    assert.doesNotMatch(css, /outline:\s*none/, `${name}: outline: none`);
  }
  for (const sel of ['.tj-field__input:focus-visible', '.tj-lang:focus-visible']) {
    assert.match(SHEETS['src/ui/components.css'], new RegExp(`${sel.replace(/[.]/g, '\\.')}[^{]*\\{ outline: 2px solid transparent`), sel);
  }
  assert.match(SHEETS['player/controls layerCss'], /input\.num:focus-visible \{ outline: 2px solid transparent/);
});

test('ت-٥: كل ورقة تميّز مختارها في وضع التباين العالي بحدّ بلون النظام', () => {
  const expect = {
    'src/ui/components.css': ['.tj-seg__option input:checked + .tj-seg__label', '.tj-chip[aria-pressed="true"]', '.tj-slots__slot[aria-checked="true"]', '.tj-lang-item.is-active', '.tj-choice__option:has(input:checked)'],
    'src/pages/editor/editor.css': ['.ed-seg__opt[aria-checked="true"]', '.ed-tab[aria-selected="true"]', '.ed-row.is-selected', '.ed-row.is-active'],
    'src/pages/settings/settings.css': ['.st-nav__link[aria-current="page"]', '.st-font:has(input:checked)', '.st-switch__input:checked + .st-switch__track'],
    'player/controls groupCss': ['.btn[aria-pressed="true"]'],
    'player/controls layerCss': ['button.slot[aria-checked="true"]', 'button.item[aria-checked="true"]', '.seg button[aria-checked="true"]', 'button.item.sentence[aria-current="true"]'],
    'player/panel panelCss': ['.segs button[aria-checked="true"]', '.ra[aria-pressed="true"]', '.switch[aria-checked="true"] .switch__track'],
  };
  for (const [name, sels] of Object.entries(expect)) {
    const block = forcedBlock(SHEETS[name]);
    assert.ok(block, `${name}: كتلة forced-colors`);
    assert.match(block, /Highlight/, `${name}: بلون النظام`);
    for (const sel of sels) assert.ok(block.includes(sel), `${name}: ${sel}`);
  }
});
