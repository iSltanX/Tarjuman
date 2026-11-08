// بلاغ المشكلة ولغة الواجهة: نصوص الأخطاء والتنبيه وصفوف المعاينة تتبع اللغة، أما جسم البلاغ المرسَل فلا تتغير بنيته ولا قيمه الآلية
// بلغة الواجهة إلا حقل locale وحده؛ ووصف المستخدم يُرسل كما كتبه في اللغتين.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setLocale } from '../../../src/i18n/index.js';
import { SUPPORT_EMAIL, failureText } from '../../../src/core/report/messages.js';
import { KIND_LABELS, REPORT_KINDS, buildPayload, reviewRows, serialise } from '../../../src/core/report/payload.js';
import { personalHintText } from '../../../src/core/report/personal.js';
import { browserLabel } from '../../../src/core/report/diagnostics.js';
import { reportPanel } from '../../../src/pages/settings/report.js';
import { buttonNamed, findAll, newDocument, settle, textOf } from '../pages/library/fake-dom.js';

const ARABIC = /[؀-ۿ]/;
const DIAG = { appVersion: '2.0.0', os: 'macos', osVersion: '15.6.1', arch: 'arm64', browser: 'Google Chrome', browserVersion: '156.0.7650.10', buildTarget: 'chromium', test: true };
const FORM = { kind: 'bug', description: 'الترجمة لا تظهر بعد الرفع' };
const withLocale = (locale, fn) => {
  setLocale(locale);
  try {
    return fn();
  } finally {
    setLocale('ar');
  }
};

test('جسم البلاغ المرسَل: لغة الواجهة تغيّر حقل locale وحده، وكل ما عداه بنيةً وقيمةً كما هو', () => {
  const ar = withLocale('ar', () => buildPayload(FORM, DIAG));
  const en = withLocale('en', () => buildPayload(FORM, DIAG));
  assert.equal(ar.locale, 'ar');
  assert.equal(en.locale, 'en');
  assert.deepEqual(Object.keys(ar), Object.keys(en), 'الحقول نفسها بترتيبها');
  const { locale: _a, ...restAr } = ar;
  const { locale: _e, ...restEn } = en;
  assert.deepEqual(restEn, restAr);
  assert.equal(en.description, 'الترجمة لا تظهر بعد الرفع', 'وصف المستخدم كما كتبه لا يُترجم');
  assert.equal(serialise(en).includes('Bug'), false, 'تسمية النوع للعرض وحده لا للإرسال');
});

test('صفوف المعاينة: ما يظهر هو الجسم نفسه، والتسميات بلغة الواجهة، والحقول (field) ثابتة', () => {
  const rowsAr = withLocale('ar', () => reviewRows(buildPayload(FORM, DIAG)));
  const rowsEn = withLocale('en', () => reviewRows(buildPayload(FORM, DIAG)));
  assert.deepEqual(rowsEn.map((r) => r.field), rowsAr.map((r) => r.field));
  assert.deepEqual(rowsEn.map((r) => r.label), ['Product', 'Type', 'Tarjuman version', 'Browser', 'Build', 'System', 'Interface language', 'Test report']);
  assert.equal(rowsEn.find((r) => r.field === 'kind').value, 'Bug (bug)');
  assert.equal(rowsEn.find((r) => r.field === 'locale').value, 'en');
  assert.equal(rowsEn.find((r) => r.field === 'test').value, 'Yes: development build');
  assert.equal(rowsEn.map((r) => `${r.label}${r.value}`).join('').match(ARABIC), null);
  withLocale('en', () => assert.deepEqual(REPORT_KINDS.map((k) => KIND_LABELS[k]), ['Bug', 'Suggestion', 'Other']));
});

test('رسائل فشل الإرسال بالإنجليزية: لكل سبب نصه وبريد الدعم، وبصيغ الجمع في الانتظار', () => {
  withLocale('en', () => {
    for (const f of ['permission', 'network', 'timeout', 'invalid', 'too-large', 'unsupported', 'rate-limited', 'server', 'unexpected']) {
      const text = failureText(f);
      assert.match(text, /^[\x20-\x7e’“”]+$/u, f);
    }
    assert.ok(failureText('invalid').includes(SUPPORT_EMAIL));
    assert.ok(failureText('rate-limited', 30).endsWith('Try again in a minute.'));
    assert.ok(failureText('rate-limited', 120).endsWith('Try again in 2 minutes.'));
    assert.ok(failureText('rate-limited', 600).endsWith('Try again in 10 minutes.'));
    assert.ok(failureText('rate-limited', 3600).endsWith('Try again in an hour.'));
    assert.ok(failureText('rate-limited', 7200).endsWith('Try again in 2 hours.'));
    assert.ok(failureText('rate-limited', 10 * 60 * 60).endsWith('Try again in 10 hours.'));
    assert.equal(failureText('rate-limited'), 'Too many reports were sent from your network recently, so the server paused receiving.');
  });
  withLocale('ar', () => {
    assert.match(failureText('rate-limited', 7200), /أعد المحاولة بعد ساعتين\.$/);
    assert.match(failureText('rate-limited', 11 * 60), /أعد المحاولة بعد 11 دقيقة\.$/);
  });
});

test('تنبيه البيانات الشخصية وتسمية المتصفح المجهول بالإنجليزية', async () => {
  withLocale('en', () => {
    assert.equal(personalHintText(['email']), 'Your description seems to include an email address. It’s sent as you wrote it, so remove it if the report doesn’t need it.');
    assert.ok(personalHintText(['youtube-link', 'email', 'video-id']).includes('a YouTube link, an email address or a video ID'));
    assert.equal(personalHintText([]), '');
  });
  setLocale('en');
  try {
    assert.equal(await browserLabel({
      platformInfo: async () => null, uaData: () => undefined, userAgent: () => '', browserInfo: async () => null, isBrave: async () => false,
      manifestVersion: () => '2.0.0', target: () => 'chromium', development: () => false,
    }), 'Unknown');
  } finally {
    setLocale('ar');
  }
});

test('لوحة البلاغ بالإنجليزية: كل نصوصها إنجليزية والأزرار والحالات، والوصف حقل يعود بعد التبديل (data-tj-keep) ويفتح اللوحة', async () => {
  setLocale('en');
  try {
    const doc = newDocument();
    const log = [];
    const panel = reportPanel({
      doc,
      env: {
        diagnostics: async () => DIAG, requestPermission: async () => true,
        send: async (payload) => { log.push(payload); return { ok: false, failure: 'network', status: null }; },
        copy: async () => {}, newKey: () => '00000001-0000-4000-8000-000000000000',
      },
    });
    doc.body.append(panel.root);
    const textarea = panel.root.querySelector('textarea');
    assert.equal(textarea.getAttribute('data-tj-keep'), 'settings.report.text');
    const region = panel.root.querySelector('#st-report');
    assert.equal(region.hidden, true);
    // عودة النص بعد إعادة التحميل تُطلق input: تُفتح اللوحة فلا يبقى النص مخبوءًا.
    textarea.value = 'الترجمة تتأخر';
    textarea.dispatchEvent({ type: 'input' });
    await settle();
    assert.equal(region.hidden, false);
    buttonNamed(panel.root, 'Send report').click();
    await settle();
    assert.equal(log.length, 1);
    assert.equal(log[0].locale, 'en');
    assert.equal(log[0].description, 'الترجمة تتأخر', 'وصف المستخدم كما كتبه');
    const own = textOf(panel.root).replace('الترجمة تتأخر', '');
    assert.equal(own.match(ARABIC), null, own);
    assert.ok(textOf(panel.root).includes('Couldn’t reach the reports server.'));
    assert.deepEqual(findAll(region, (e) => e.tagName === 'input' && e.getAttribute('type') === 'radio').map((r) => r.getAttribute('value')), ['bug', 'suggestion', 'other']);
    assert.equal(textOf(region.querySelector('fieldset legend')), 'Report type');
  } finally {
    setLocale('ar');
  }
});
