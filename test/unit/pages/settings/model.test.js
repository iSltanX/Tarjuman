// نموذج الإعدادات (P7-AC4/AC8): قراءة حقول الإدخال بتحقق يطابق نموذج الإعدادات، وحالة «الخط والحجم افتراضيان»،
// وهندسة المعاينة، وكلمة تأكيد المسح، واتساق ملف الخطوط مع بيانات خطوط الترجمة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_SETTINGS, mergeSettings, validateSettings } from '../../../../src/core/model/settings.js';
import { SUBTITLE_FONT_LIST } from '../../../../src/ui/subtitle-fonts.js';
import {
  confirmWord, DEFAULT_SCALE_MARK_PCT, completenessText, confirmWordOk, normalizeNumber, parseCompleteness, parseDrift, parseSplit, parseStep,
  previewStyle, snapScale, stepChoice, stepText,
} from '../../../../src/pages/settings/model.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

test('الأرقام الهندية والفاصلة العربية تُقبل في الحقول', () => {
  assert.equal(normalizeNumber('٠٫٣'), '0.3');
  assert.equal(normalizeNumber('١٢٣'), '123');
  assert.equal(normalizeNumber('1,5'), '1.5');
  assert.equal(normalizeNumber(null), '');
});

test('الخطوة المخصصة: من 0.1 إلى 10 ثوانٍ بمضاعفات 0.1، بالملي ثانية', () => {
  const ok = (t) => parseStep(t);
  assert.deepEqual(ok('0.5'), { ok: true, value: 500 });
  assert.deepEqual(ok('1'), { ok: true, value: 1000 });
  assert.deepEqual(ok('2.5'), { ok: true, value: 2500 });
  assert.deepEqual(ok('0.1'), { ok: true, value: 100 });
  assert.deepEqual(ok('10'), { ok: true, value: 10000 });
  assert.deepEqual(ok('٠٫٣'), { ok: true, value: 300 });
  assert.deepEqual(ok(' 1,5 '), { ok: true, value: 1500 });
  assert.deepEqual(ok('0.3'), { ok: true, value: 300 }, '0.3×1000 يُقرَّب فلا يضيع بالفاصلة العائمة');
  for (const bad of ['', '0', '0.05', '0.25', '1.25', '10.1', '11', '-1', 'abc', '1e1', '.5', '1.', '٠']) {
    assert.deepEqual(ok(bad), { ok: false, code: 'PG_STEP_INVALID' }, JSON.stringify(bad));
  }
});

test('عتبة التقسيم 50..2000، والانحراف 10..5000، والاكتمال 50..100% بنسبة كسرية', () => {
  assert.deepEqual(parseSplit('50'), { ok: true, value: 50 });
  assert.deepEqual(parseSplit('2000'), { ok: true, value: 2000 });
  assert.deepEqual(parseSplit('٣٠٠'), { ok: true, value: 300 });
  for (const bad of ['49', '2001', '12.5', '', 'x', '-5', '1e3']) assert.deepEqual(parseSplit(bad), { ok: false, code: 'PG_SPLIT_INVALID' }, bad);

  assert.deepEqual(parseDrift('10'), { ok: true, value: 10 });
  assert.deepEqual(parseDrift('5000'), { ok: true, value: 5000 });
  for (const bad of ['9', '5001', '100.5', '']) assert.deepEqual(parseDrift(bad), { ok: false, code: 'PG_DRIFT_INVALID' }, bad);

  assert.deepEqual(parseCompleteness('85'), { ok: true, value: 0.85 });
  assert.deepEqual(parseCompleteness('50'), { ok: true, value: 0.5 });
  assert.deepEqual(parseCompleteness('100'), { ok: true, value: 1 });
  for (const bad of ['49', '101', '85.5', '', '0']) assert.deepEqual(parseCompleteness(bad), { ok: false, code: 'PG_COMPLETENESS_INVALID' }, bad);
  assert.equal(completenessText(0.85), '85');
  assert.equal(completenessText(0.9), '90');
});

test('كل قيمة مقبولة من الحقول يقبلها مدقق الإعدادات (القراءة والكتابة متسقتان)', () => {
  const step = parseStep('2.3').value;
  const split = parseSplit('777').value;
  const drift = parseDrift('250').value;
  const completeness = parseCompleteness('73').value;
  const next = mergeSettings(DEFAULT_SETTINGS, { offsetStepMs: step, export: { splitThreshold: split }, thresholds: { driftMs: drift, completeness } });
  assert.deepEqual(validateSettings(next), { ok: true });
  for (const t of ['0.1', '10']) assert.deepEqual(validateSettings(mergeSettings(DEFAULT_SETTINGS, { offsetStepMs: parseStep(t).value })), { ok: true });
});

test('الخطوة: نص الحقل وزر المقطّعة', () => {
  assert.equal(stepText(500), '0.5');
  assert.equal(stepText(1000), '1');
  assert.equal(stepText(2500), '2.5');
  assert.equal(stepChoice(500), '0.5');
  assert.equal(stepChoice(1000), '1');
  assert.equal(stepChoice(1500), 'custom');
});

test('منزلق الحجم: يقرّب إلى شبكة 5 ويقصر على 70..160، وعلامة الافتراضي عند 33%', () => {
  assert.equal(snapScale('103'), 105);
  assert.equal(snapScale(101), 100);
  assert.equal(snapScale(10), 70);
  assert.equal(snapScale(999), 160);
  assert.equal(snapScale('x'), 100);
  assert.ok(Math.abs(DEFAULT_SCALE_MARK_PCT - 33.33) < 0.01);
});

test('المعاينة: الحجم نسبي (4.6% من ارتفاع مرجعي)، والخط بسلسلته، والموضع والخلفية', () => {
  const base = { font: 'almarai', scale: 100, background: 'soft', position: 'bottom' };
  assert.equal(previewStyle(base).fontSize, '18px');
  assert.equal(previewStyle({ ...base, scale: 70 }).fontSize, '13px');
  assert.equal(previewStyle({ ...base, scale: 160 }).fontSize, '29px');
  assert.ok(Number.parseInt(previewStyle({ ...base, scale: 160 }).fontSize, 10) > Number.parseInt(previewStyle({ ...base, scale: 70 }).fontSize, 10));
  assert.match(previewStyle({ ...base, font: 'markazi' }).fontFamily, /^"Tarjuman Subtitle Markazi Text", "Tarjuman Subtitle Almarai", /);
  assert.deepEqual([previewStyle(base).anchor, previewStyle(base).offset], ['bottom', '8%']);
  assert.deepEqual([previewStyle({ ...base, position: 'raised' }).anchor, previewStyle({ ...base, position: 'raised' }).offset], ['bottom', '20%']);
  assert.deepEqual([previewStyle({ ...base, position: 'top' }).anchor, previewStyle({ ...base, position: 'top' }).offset], ['top', '8%']);
  assert.equal(previewStyle({ ...base, background: 'solid' }).background, 'solid');
});

test('كلمة تأكيد المسح: «امسح» وحدها (بمسافات طرفية مقبولة)', () => {
  assert.equal(confirmWord(), 'امسح');
  assert.equal(confirmWordOk('امسح'), true);
  assert.equal(confirmWordOk('  امسح '), true);
  for (const bad of ['', 'امسحه', 'امسح كل', 'مسح', 'delete', null, undefined]) assert.equal(confirmWordOk(bad), false, String(bad));
});

test('ملف الخطوط: عائلات وأوزان وملفات كل خط في بيانات خطوط الترجمة، من الإضافة نفسها بلا شبكة', () => {
  const css = readFileSync(path.join(ROOT, 'src/pages/settings/fonts.css'), 'utf8');
  assert.equal(/https?:|\/\/[a-z]/i.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), false, 'لا رابط خارجي');
  assert.equal(/@import/.test(css), false);
  for (const f of SUBTITLE_FONT_LIST) {
    for (const w of [400, 700]) {
      const block = css.split('@font-face').find((b) => b.includes(`"${f.family}"`) && b.includes(`font-weight: ${w}`));
      assert.ok(block, `${f.family} ${w}`);
      assert.ok(block.includes(`url("../../${f.files[w]}")`), `${f.family} ${w}: ملفه`);
      assert.ok(existsSync(path.join(ROOT, 'src', f.files[w])), `${f.files[w]} موجود`);
    }
  }
  assert.equal(css.split('@font-face').length - 1, SUBTITLE_FONT_LIST.length * 2, 'لا عائلة زائدة');
});
