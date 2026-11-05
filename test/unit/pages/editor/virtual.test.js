// تخطيط القائمة الافتراضية (P8-AC1 وR38): ارتفاعات محسوبة، وبحث ثنائي، والمدى المرئي وحده يُرسم.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROW, RowLayout, rowHeight, textLines } from '../../../../src/pages/editor/virtual.js';

test('ارتفاع الصف من بياناته: سطران إلى أربعة، وسطر رسالة للمشكلة، وصف الناقص ثابت', () => {
  const two = rowHeight({ type: 'cue', lines: 1 });
  assert.equal(two, ROW.pad + 2 * ROW.line + ROW.fieldChrome);
  assert.equal(rowHeight({ type: 'cue', lines: 9 }), ROW.pad + 4 * ROW.line + ROW.fieldChrome);
  assert.equal(rowHeight({ type: 'cue', lines: 2, message: true }), two + ROW.message);
  assert.equal(rowHeight({ type: 'missing' }), ROW.missing);
  assert.deepEqual(['أ', 'أ\nب\nج', 'أ\nب\nج\nد\nه'].map(textLines), [2, 3, 4]);
});

test('المواضع والبحث: كل موضع يقع في صفه، والحدود بين الصفوف للصف التالي', () => {
  const l = new RowLayout([10, 20, 30]);
  assert.equal(l.total, 60);
  assert.deepEqual([0, 10, 30].map((i, k) => l.offsetOf(k)), [0, 10, 30]);
  assert.deepEqual([0, 9.5, 10, 29, 30, 59, 500].map((y) => l.indexAt(y)), [0, 0, 1, 1, 2, 2, 2]);
  assert.equal(new RowLayout([]).indexAt(0), -1);
});

test('المدى المرئي بهامش، وتغيير ارتفاع صف يعيد التخطيط', () => {
  const l = new RowLayout(Array(100).fill(50));
  assert.deepEqual(l.range(0, 200, 2), [0, 6]);
  assert.deepEqual(l.range(1000, 200, 2), [18, 26]);
  assert.deepEqual(l.range(10 ** 6, 200, 2), [97, 100]);
  assert.equal(l.setHeight(0, 100), true);
  assert.equal(l.setHeight(0, 100), false);
  assert.equal(l.offsetOf(1), 100);
  assert.equal(l.total, 5050);
  assert.deepEqual(new RowLayout([]).range(0, 100), [0, 0]);
});

test('الأداء: 50,000 صف تخطيطًا وبحثًا دون مسح خطي لكل تمرير', () => {
  const l = new RowLayout(Array.from({ length: 50000 }, (_, i) => rowHeight({ type: 'cue', lines: (i % 4) + 1, message: i % 7 === 0 })));
  let t = performance.now();
  l.build();
  const buildMs = performance.now() - t;
  t = performance.now();
  for (let k = 0; k < 10000; k++) l.range((k * 997) % l.total, 800);
  const rangeMs = performance.now() - t;
  const [s, e] = l.range(l.total / 2, 800);
  assert.ok(e - s < 40, `المرسوم ${e - s} صفًا فقط`);
  assert.ok(buildMs < 50 && rangeMs < 200, `البناء ${buildMs.toFixed(1)}ms والمدى ${rangeMs.toFixed(1)}ms`);
});

test('تدقيق 5fedcb9 (CL-004): المحرّر تحت 1100 بعمود عربية لا يضيق عن 240 وتمرير أفقي مع الرأس، وتحت 900 اللوحة فوق القائمة', async () => {
  const { readFile } = await import('node:fs/promises');
  const css = await readFile(new URL('../../../../src/pages/editor/editor.css', import.meta.url), 'utf8');
  const block = (q) => { const i = css.indexOf(`@media (max-width: ${q}px)`); return i < 0 ? '' : css.slice(i, css.indexOf('\n}', i)); };
  assert.match(block(1100), /--ed-cols: [^;]*minmax\(240px, 1\.5fr\)/);
  assert.match(block(1100), /\.ed-main \{ overflow-x: auto; \}/);
  assert.match(block(1100), /\.ed-list__head, \.ed-list \{ min-width: 944px; \}/);
  assert.match(block(900), /\.ed-body \{ grid-template-columns: minmax\(0, 1fr\);/);
  // الأعمدة الثابتة والدنيا تتسع في 944: 448 ثابتة (حقلا الزمن 120 يتسعان لـ«00:00:00,000»؛ تدقيق 7a66f91، CLA-X8) + 240 + 160
  // + سبع فجوات 10 + حشو 24.
  assert.match(block(1100), /--ed-cols: 24px 44px 120px 120px 36px /);
  assert.ok(448 + 240 + 160 + 70 + 24 <= 944);
});
