// «الإبلاغ عن مشكلة» في «حول» بـDOM وهمي (جولة النشر T2.1، وبلا خادم منذ و1 في 2.2.0، قرار سلطان ق3): الزر يفتح النموذج،
// والمعاينة هي الجسم نفسه، و«نسخ البلاغ» وحده بلا شبكة ولا إذن، وبريد الدعم ظاهر مع زر نسخه، ولا زر إرسال ولا رابط بريد، وما
// يشبه رمز جلسة يمنع النسخ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPayload, serialise } from '../../../../src/core/report/payload.js';
import { SUPPORT_EMAIL } from '../../../../src/core/report/messages.js';
import { reportPanel } from '../../../../src/pages/settings/report.js';
import { createSettings } from '../../../../src/pages/settings/view.js';
import { createStore } from '../../../../src/core/store/index.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { buttonNamed, findAll, newDocument, settle, textOf } from '../library/fake-dom.js';

const DIAG = { appVersion: '1.0.0', os: 'macos', osVersion: '15.6.1', arch: 'arm64', browser: 'Google Chrome', browserVersion: '156.0.7650.10', buildTarget: 'chromium', test: false };

function harness({ diag = DIAG, copyFails = false, copy = null, diagnostics = null } = {}) {
  const doc = newDocument();
  const log = [];
  const env = {
    diagnostics: diagnostics ?? (async () => diag),
    copy: copy ?? (async (text) => { log.push(['copy', text]); if (copyFails) throw new Error('denied'); }),
  };
  const panel = reportPanel({ doc, env });
  doc.body.append(panel.root);
  const textarea = panel.root.querySelector('textarea');
  const type = (value) => {
    textarea.value = value;
    textarea.dispatchEvent({ type: 'input' });
  };
  const result = () => panel.root.querySelector('.st-report__result');
  return { doc, panel, env, log, type, result, region: panel.root.querySelector('#st-report'), trigger: buttonNamed(panel.root, 'الإبلاغ عن مشكلة') };
}

test('«حول» يضم زر «الإبلاغ عن مشكلة» والنموذج مغلق حتى يُضغط، ولا تشخيص قبل الفتح', async () => {
  const doc = newDocument();
  let reads = 0;
  const area = createMemoryArea({ unlimited: true });
  const settings = createSettings({ store: createStore({ area }), version: '1.0.0', doc, clipboardWrite: async () => {}, diagnosticsText: async () => '{}', report: { diagnostics: async () => { reads += 1; return DIAG; } } });
  doc.body.append(settings.root);
  const about = settings.root.querySelector('#about');
  const trigger = buttonNamed(about, 'الإبلاغ عن مشكلة');
  assert.ok(trigger, 'الزر في قسم «حول»');
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(about.querySelector('#st-report').hidden, true);
  assert.equal(reads, 0, 'لا قراءة قبل الفتح');
  trigger.click();
  await settle();
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  assert.equal(about.querySelector('#st-report').hidden, false);
  assert.equal(reads, 1);
  trigger.click();
  assert.equal(about.querySelector('#st-report').hidden, true, 'الزر نفسه يغلقه');
});

test('النموذج: النوع خلل واقتراح وأخرى، والوصف حتى 2000 بعدّاد، والمعاينة صفوف الجسم نفسه ونصه كاملًا، ولا ذكر لخادم ولا إذن', async () => {
  const h = harness();
  h.trigger.click();
  await settle();
  const kinds = findAll(h.region, (e) => e.tagName === 'input' && e.getAttribute('type') === 'radio');
  assert.deepEqual(kinds.map((k) => k.getAttribute('value')), ['bug', 'suggestion', 'other']);
  assert.equal(textOf(h.region.querySelector('fieldset legend')), 'نوع البلاغ');
  assert.equal(h.region.querySelector('textarea').getAttribute('maxlength'), '2000');
  assert.ok(findAll(h.region, (e) => e.tagName === 'label' && e.getAttribute('for') === 'st-report-text').length === 1, 'للوصف تسمية');
  h.type('  الترجمة تتأخر  ');
  kinds[1].checked = true;
  kinds[1].dispatchEvent({ type: 'change' });
  assert.equal(textOf(h.region.querySelector('#st-report-count')), '13 / 2000', 'المحارف بعد القص، بلا فاصلة آلاف');
  const expected = buildPayload({ kind: 'suggestion', description: 'الترجمة تتأخر' }, DIAG);
  assert.equal(h.region.querySelector('pre').textContent, serialise(expected), 'نص البلاغ كاملًا هو الجسم الذي يُنسخ');
  const fields = findAll(h.region, (e) => e.hasAttribute('data-report-field')).map((e) => e.getAttribute('data-report-field'));
  assert.deepEqual(fields, ['product', 'kind', 'app_version', 'diagnostics.browser · browser_version', 'diagnostics.build_target', 'os · os_version · arch', 'locale']);
  const all = textOf(h.region);
  assert.ok(!/app-reports|خادم البلاغات|إذن|البيانات التقنية والتفاعل|Idempotency/.test(all), 'لا خادم ولا إذن ولا مفتاح');
  assert.ok(all.includes('لا يُرسل ترجمان شيئًا بنفسه'));
});

test('و1: لا زر إرسال ولا رابط بريد؛ وبريد الدعم ظاهر مع زر نسخه، ونسخه يُقال وفشله يُقال', async () => {
  const h = harness();
  h.trigger.click();
  await settle();
  assert.ok(buttonNamed(h.region, 'إرسال البلاغ') === null, 'لا إرسال');
  assert.equal(findAll(h.region, (e) => e.tagName === 'a').length, 0, 'لا رابط (ولا mailto)');
  assert.ok(textOf(h.region.querySelector('.st-report__email')).includes(SUPPORT_EMAIL));
  buttonNamed(h.region, 'نسخ البريد').click();
  await settle();
  assert.deepEqual(h.log, [['copy', SUPPORT_EMAIL]]);
  assert.ok(textOf(h.region.querySelector('.st-report__email')).includes('نُسخ البريد.'));
  const f = harness({ copyFails: true });
  f.trigger.click();
  await settle();
  buttonNamed(f.region, 'نسخ البريد').click();
  await settle();
  assert.ok(textOf(f.region.querySelector('.st-report__email')).includes('تعذّر نسخ البريد'));
});

test('«نسخ البلاغ» يعمل بلا شبكة ولا إذن: الجسم نفسه منسَّقًا، وفشل النسخ يقول البديل', async () => {
  const h = harness();
  h.trigger.click();
  await settle();
  assert.equal(buttonNamed(h.region, 'نسخ البلاغ').getAttribute('aria-disabled'), 'true', 'معطّل بلا وصف');
  h.type('اقتراح: اختصار للمزامنة');
  buttonNamed(h.region, 'نسخ البلاغ').click();
  await settle();
  assert.deepEqual(h.log.map((x) => x[0]), ['copy']);
  assert.equal(h.log[0][1], serialise(buildPayload({ kind: 'bug', description: 'اقتراح: اختصار للمزامنة' }, DIAG)));
  assert.ok(textOf(h.result()).includes('نُسخ البلاغ نصًّا. الصقه في رسالة إلى بريد الدعم.'));
  const f = harness({ copyFails: true });
  f.trigger.click();
  await settle();
  f.type('x');
  buttonNamed(f.region, 'نسخ البلاغ').click();
  await settle();
  assert.ok(textOf(f.result()).includes('تعذّر النسخ'));
});

test('ما يشبه رمز جلسة أو ملف ارتباط في الوصف يمنع النسخ، والرابط العام وحده لا يمنع', async () => {
  const h = harness();
  h.trigger.click();
  await settle();
  h.type('الملف من https://www.youtube.com/watch?v=abc فيه خلل');
  assert.equal(buttonNamed(h.region, 'نسخ البلاغ').getAttribute('aria-disabled'), null);
  h.type('ملف الارتباط SAPISID=abcdef0123456789 ظهر');
  assert.equal(buttonNamed(h.region, 'نسخ البلاغ').getAttribute('aria-disabled'), 'true');
  assert.ok(textOf(h.region.querySelector('.st-report__secret')).includes('رمز جلسة'));
  buttonNamed(h.region, 'نسخ البلاغ').click();
  await settle();
  assert.equal(h.log.length, 0);
});

test('تعذّر التشخيص: لا نسخ، والسبب مكتوب', async () => {
  const h = harness({ diagnostics: async () => { throw new Error('x'); } });
  h.trigger.click();
  await settle();
  h.type('خلل');
  assert.equal(buttonNamed(h.region, 'نسخ البلاغ').getAttribute('aria-disabled'), 'true');
  assert.ok(textOf(h.region).includes('تعذّرت قراءة إصدار المتصفح والنظام.'));
});

test('فشل الحافظة متزامنًا نتيجة ظاهرة لا صمت', async () => {
  const h = harness({ copy: () => { throw new Error('sync'); } });
  h.trigger.click();
  await settle();
  h.type('خلل');
  buttonNamed(h.region, 'نسخ البلاغ').click();
  await settle();
  assert.ok(textOf(h.result()).includes('تعذّر النسخ'));
});

// ---- المراجعة المستقلة (2026-11-04) ----

test('ق-6: عنوان حقل الوصف يتبع نوع البلاغ', async () => {
  const h = harness();
  h.trigger.click();
  await settle();
  const label = () => textOf(h.region.querySelector('label[for="st-report-text"]'));
  assert.equal(label(), 'ماذا حدث؟');
  const pick = (kind) => { const r = h.region.querySelector(`input[value="${kind}"]`); r.checked = true; r.dispatchEvent({ type: 'change' }); };
  pick('suggestion');
  assert.equal(label(), 'ما اقتراحك؟');
  pick('other');
  assert.equal(label(), 'اكتب رسالتك');
  pick('bug');
  assert.equal(label(), 'ماذا حدث؟');
});
