// «الإبلاغ عن مشكلة» (جولة النشر T2.1): الجسم بعقد app-reports v1 حرفًا، وسقوفه، وتضييق التشخيص، والمعاينة لكل حقل، ونسخه.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KIND_LABELS, LIMITS, PRODUCT_ID, REPORT_KINDS, buildPayload, diagnosticsOf, formError, reviewRows, serialise } from '../../../src/core/report/payload.js';

const DIAG = Object.freeze({
  appVersion: '1.0.0', os: 'macos', osVersion: '15.6.1', arch: 'arm64',
  browser: 'Google Chrome', browserVersion: '156.0.7650.10', buildTarget: 'chromium', test: false,
});
const CONTRACT_FIELDS = ['product', 'app_version', 'os', 'os_version', 'arch', 'locale', 'kind', 'description', 'diagnostics'];

test('المنتج tarjuman ثابت، والأنواع خلل واقتراح وأخرى، والسقوف من العقد', () => {
  assert.equal(PRODUCT_ID, 'tarjuman');
  assert.deepEqual(REPORT_KINDS, ['bug', 'suggestion', 'other']);
  assert.deepEqual(REPORT_KINDS.map((k) => KIND_LABELS[k]), ['خلل', 'اقتراح', 'أخرى']);
  assert.deepEqual(LIMITS, { description: 2000, diagnostics: 16 * 1024 });
});

test('الجسم بحقول العقد وحدها، والوصف مقصوص الأطراف، والتشخيص الاسم والإصدار وهدف البناء لا غير', () => {
  const p = buildPayload({ kind: 'bug', description: '  الترجمة لا تظهر بعد الرفع  ' }, DIAG);
  assert.deepEqual(Object.keys(p), CONTRACT_FIELDS);
  assert.deepEqual(p, {
    product: 'tarjuman', app_version: '1.0.0', os: 'macos', os_version: '15.6.1', arch: 'arm64', locale: 'ar', kind: 'bug',
    description: 'الترجمة لا تظهر بعد الرفع',
    diagnostics: { browser: 'Google Chrome', browser_version: '156.0.7650.10', build_target: 'chromium' },
  });
  assert.equal('test' in p, false, 'لا test في بناء الإنتاج');
  assert.equal('attachments' in p || 'category' in p, false, 'لا مرفقات ولا فئة في هذا الإصدار');
});

test('test: true من بناء التطوير وحده', () => {
  assert.equal(buildPayload({ kind: 'other', description: 'x' }, { ...DIAG, test: true }).test, true);
  assert.equal('test' in buildPayload({ kind: 'other', description: 'x' }, { ...DIAG, test: false }), false);
});

test('حدود الوصف: فارغ بعد القص مرفوض، و2000 مقبول، و2001 مرفوض، ونوع مجهول مرفوض', () => {
  assert.equal(formError({ kind: 'bug', description: '   \n ' }), 'empty');
  assert.equal(formError({ kind: 'bug', description: 'ع'.repeat(2000) }), null);
  assert.equal(formError({ kind: 'bug', description: ` ${'ع'.repeat(2000)} ` }), null, 'القص قبل العد');
  assert.equal(formError({ kind: 'bug', description: 'ع'.repeat(2001) }), 'too-long');
  assert.equal(formError({ kind: 'crash', description: 'x' }), 'kind', 'crash ليس من أنواع ترجمان');
  assert.throws(() => buildPayload({ kind: 'bug', description: '' }, DIAG), /بلاغ غير صالح: empty/);
});

test('التشخيص بأشكال ضيقة: ما خرج عن شكله unknown لا نص حر، وهدف البناء firefox أو chromium لا غير', () => {
  const d = diagnosticsOf({ ...DIAG, browser: 'Chrome <script>', browserVersion: '156; DROP', buildTarget: 'safari' });
  assert.deepEqual(d, { browser: 'unknown', browser_version: 'unknown', build_target: 'chromium' });
  assert.equal(diagnosticsOf({ ...DIAG, buildTarget: 'firefox' }).build_target, 'firefox');
  const p = buildPayload({ kind: 'bug', description: 'x' }, { ...DIAG, os: 'Mac OS X', osVersion: 'https://x', arch: '', appVersion: '1.0.0-dev' });
  assert.deepEqual([p.os, p.os_version, p.arch, p.app_version], ['unknown', 'unknown', 'unknown', 'unknown']);
});

test('لا شيء من يوتيوب ولا من المحفوظات في الجسم: لا معرّف فيديو ولا عنوان ولا رابط ولا معرّف مستخدم أو جهاز', () => {
  const p = buildPayload({ kind: 'suggestion', description: 'اقتراح' }, { ...DIAG, videoId: 'dQw4w9WgXcQ', title: 'عنوان', url: 'https://www.youtube.com/watch?v=x', userId: 'u1', deviceId: 'd1' });
  const text = JSON.stringify(p);
  for (const leak of ['dQw4w9WgXcQ', 'عنوان', 'youtube', 'u1', 'd1']) assert.equal(text.includes(leak), false, leak);
  assert.ok(JSON.stringify(p.diagnostics).length <= LIMITS.diagnostics);
});

test('المعاينة تعرض كل حقل في الجسم إلا الوصف (يُعرض في حقله)، وبلاغ التطوير يظهر صفًّا', () => {
  const p = buildPayload({ kind: 'bug', description: 'x' }, { ...DIAG, test: true });
  const rows = reviewRows(p);
  const covered = rows.flatMap((r) => r.field.split(' · ').map((f) => f.replace(/^diagnostics\./, '')));
  for (const f of [...CONTRACT_FIELDS.filter((x) => x !== 'description' && x !== 'diagnostics'), 'test', ...Object.keys(p.diagnostics)]) {
    assert.ok(covered.includes(f), `الحقل ${f} غير معروض`);
  }
  assert.deepEqual(rows.find((r) => r.field === 'kind').value, 'خلل (bug)');
  assert.equal(rows.find((r) => r.field === 'test').value, 'نعم: بناء تطوير');
  assert.equal(reviewRows(buildPayload({ kind: 'bug', description: 'x' }, DIAG)).some((r) => r.field === 'test'), false);
});

test('«انسخ البلاغ»: الجسم نفسه JSON منسَّقًا يعود كما هو', () => {
  const p = buildPayload({ kind: 'other', description: 'سطر\nوسطر' }, DIAG);
  const text = serialise(p);
  assert.ok(text.includes('\n  "product": "tarjuman"'));
  assert.deepEqual(JSON.parse(text), p);
});
