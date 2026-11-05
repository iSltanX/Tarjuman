// تدقيق 7a66f91، C8 (U69): خطوة الاختبار الحي تسمّي الفحص الذي لم يُنفّذ. كانت تسجّل استثناء شرطها المسبق باسم فحص نجح قبله،
// فبقي العدد 18 وخفي أن fingerprint-upload-no-false-drift لم يُنفّذ (test/live/review/run.mjs). بلا متصفح.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeStep } from '../helpers/live-step.mjs';

const session = () => {
  const result = { checks: [] };
  const check = (id, ok, detail = null) => result.checks.push({ id, ok: !!ok, detail });
  return { result, check, step: makeStep(result, check) };
};

test('استثناء بعد الفحص الأول: الثاني يُسجَّل باسمه فاشلًا «لم يُنفّذ»، ولا يتكرر اسم الأول', async () => {
  const { result, check, step } = session();
  await step('fingerprint-new-timing-saved', async () => {
    check('fingerprint-new-timing-saved', true);
    throw new Error('DOM.setFileInputFiles: No node found for given backend id (https://x.test/a)');
  }, ['fingerprint-new-timing-saved', 'fingerprint-upload-no-false-drift']);
  assert.deepEqual(result.checks.map((c) => [c.id, c.ok]), [['fingerprint-new-timing-saved', true], ['fingerprint-upload-no-false-drift', false]]);
  const d = result.checks[1].detail;
  assert.equal(d.notRun, true);
  assert.equal(d.step, 'fingerprint-new-timing-saved');
  assert.match(d.error, /No node found/);
  assert.doesNotMatch(d.error, /https?:/, 'الروابط تُحجب');
});

test('استثناء قبل أي فحص: كل المتوقع فاشل «لم يُنفّذ»، وبلا قائمة فاسم الخطوة وحده كما كان', async () => {
  const { result, step } = session();
  await step('a', async () => { throw new Error('x'); }, ['a', 'b', 'c']);
  assert.deepEqual(result.checks.map((c) => `${c.id}:${c.ok}:${c.detail.notRun}`), ['a:false:true', 'b:false:true', 'c:false:true']);
  const s2 = session();
  await s2.step('solo', async () => { throw new Error('y'); });
  assert.deepEqual(s2.result.checks.map((c) => [c.id, c.ok]), [['solo', false]]);
});

test('استثناء بعد الفحوص كلها: فحص واحد باسم ‹الخطوة›-step، ونجاح بلا استثناء لا يضيف شيئًا', async () => {
  const { result, check, step } = session();
  await step('r', async () => { check('r', true); check('r2', false); throw new Error('late'); }, ['r', 'r2']);
  assert.deepEqual(result.checks.map((c) => [c.id, c.ok]), [['r', true], ['r2', false], ['r-step', false]]);
  await step('ok', async () => { check('ok', true); });
  assert.equal(result.checks.length, 4);
});
