// نص الأصل المحاذي لمقطع ترجمة بالتداخل الزمني (originalLookup): نُقل من لوحة المشغّل إلى النواة في الفكرة ١١، فتستعمله اللوحة
// وتصدير «مع الأصل» وحارس الاستيراد بتعريف واحد، ولا تستورد النواة من المشغّل. والاختبارات الثلاثة الأولى كانت في
// test/unit/player/panel/model.test.js كما هي.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { flatText, originalLookup } from '../../../src/core/align/original.js';
import * as alignIndex from '../../../src/core/align/index.js';
import * as panelModel from '../../../src/player/panel/model.js';
import { flatText as panelFlatText } from '../../../src/player/panel/text.js';

const cue = (n, startMs, endMs, text = `c${n}`) => ({ n, startMs, endMs, text });
const src = (p) => readFileSync(new URL(`../../../src/${p}`, import.meta.url), 'utf8');

test('الأصل المتداخل: يُضم نص ما يتداخل زمنًا مع مقطع عربي بترتيب الزمن', () => {
  const en = [cue(1, 0, 1500, 'one'), cue(2, 1500, 3000, 'two'), cue(3, 3000, 4000, 'three')];
  const lookup = originalLookup(en);
  assert.equal(lookup(1000, 3000), 'one two');
  assert.equal(lookup(3500, 5500), 'three');
  assert.equal(lookup(4000, 5000), '', 'لا تداخل عند التماس فقط');
  assert.equal(lookup(1500, 3000), 'two', 'التماس عند الحد لا يُحتسب');
});

test('الأصل المتداخل: غير المرتب لا يفقد شيئًا، والأسطر المتعددة تُسوّى', () => {
  const en = [cue(2, 3000, 4000, 'late'), cue(1, 0, 3000, 'early\nsecond line')];
  assert.equal(originalLookup(en)(0, 5000), 'early second line late');
});

test('الأصل المتداخل يخدم آلاف المقاطع بلا مسح خطي', () => {
  const en = Array.from({ length: 5000 }, (_, i) => cue(i + 1, i * 1000, i * 1000 + 900, `e${i}`));
  const lookup = originalLookup(en);
  const t0 = process.hrtime.bigint();
  let hits = 0;
  for (let i = 0; i < 5000; i++) if (lookup(i * 1000 + 100, i * 1000 + 800) === `e${i}`) hits++;
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.equal(hits, 5000);
  assert.ok(ms < 500, `5000 بحثًا في ${ms.toFixed(0)}ms`);
});

test('الفكرة ١١: originalLookup وflatText في النواة بتعريف واحد، واللوحة تستوردهما منها ولا تعرّفهما', () => {
  assert.equal(alignIndex.originalLookup, originalLookup, 'من واجهة المحاذاة');
  assert.equal(alignIndex.flatText, flatText);
  assert.equal(panelFlatText, flatText, 'نص اللوحة يعيد تصدير تعريف النواة نفسه');
  assert.equal(Object.hasOwn(panelModel, 'originalLookup'), false, 'نموذج اللوحة لم يعد يعرّفه');
  assert.match(src('player/panel/transcript.js'), /import \{ originalLookup \} from '\.\.\/\.\.\/core\/align\/original\.js';/);
  assert.doesNotMatch(src('core/align/original.js'), /from '\.\.\/\.\.\/(?:player|pages|content)\//, 'النواة لا تستورد من المشغّل ولا الصفحات');
  assert.equal(flatText('سطر أول\n  سطر ثانٍ '), 'سطر أول سطر ثانٍ');
  assert.equal(flatText(null), '');
});
