// «الإبلاغ عن مشكلة» في «حول» بـDOM وهمي (جولة النشر T2.1): الزر يفتح النموذج، والمعاينة هي الجسم نفسه، والإذن يُطلب أول ما في
// الضغطة، وطلب واحد في كل مرة بلا إعادة تلقائية، والمفتاح يُعاد في المحاولة ويتجدد مع تعديل البلاغ، وكل صف في جدول الردود
// بنصه وأزراره، والنسخ بلا شبكة، وما يشبه رمز جلسة يمنع الإرسال والنسخ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPayload, serialise } from '../../../../src/core/report/payload.js';
import { reportPanel } from '../../../../src/pages/settings/report.js';
import { createSettings } from '../../../../src/pages/settings/view.js';
import { createStore } from '../../../../src/core/store/index.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { buttonNamed, findAll, newDocument, settle, textOf } from '../library/fake-dom.js';

const DIAG = { appVersion: '1.0.0', os: 'macos', osVersion: '15.6.1', arch: 'arm64', browser: 'Google Chrome', browserVersion: '156.0.7650.10', buildTarget: 'chromium', test: false };

function harness({ diag = DIAG, permission = true, outcomes = [{ ok: true, id: 41, replayed: false }], copyFails = false, copy = null, send = null, diagnostics = null } = {}) {
  const doc = newDocument();
  const log = [];
  let n = 0;
  const env = {
    diagnostics: diagnostics ?? (async () => diag),
    requestPermission: (target) => { log.push(['permission', target]); return Promise.resolve(permission); },
    send: async (payload, key) => {
      log.push(['send', payload, key]);
      return send ? send(payload, key) : (outcomes.shift() ?? { ok: false, failure: 'server', status: 500 });
    },
    copy: copy ?? (async (text) => { log.push(['copy', text]); if (copyFails) throw new Error('denied'); }),
    newKey: () => `0000000${++n}-0000-4000-8000-000000000000`,
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

test('«حول» يضم زر «الإبلاغ عن مشكلة» والنموذج مغلق حتى يُضغط، ولا طلب ولا تشخيص قبل الفتح', async () => {
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

test('النموذج: النوع خلل واقتراح وأخرى، والوصف حتى 2000 بعدّاد، والمعاينة صفوف الجسم نفسه ونصه كاملًا', async () => {
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
  assert.equal(h.region.querySelector('pre').textContent, serialise(expected), 'نص البلاغ كاملًا هو الجسم الذي سيُرسل');
  const fields = findAll(h.region, (e) => e.hasAttribute('data-report-field')).map((e) => e.getAttribute('data-report-field'));
  assert.deepEqual(fields, ['product', 'kind', 'app_version', 'diagnostics.browser · browser_version', 'diagnostics.build_target', 'os · os_version · arch', 'locale']);
  assert.ok(textOf(h.region).includes('رقم البلاغ مرجعك الوحيد'));
  assert.ok(textOf(h.region).includes('app-reports.isultantf.workers.dev'), 'المضيف مذكور قبل الإذن');
  assert.equal(textOf(h.region).includes('البيانات التقنية والتفاعل'), false, 'موافقة Firefox لا تُذكر في Chromium');
});

test('في Firefox تُذكر موافقة «البيانات التقنية والتفاعل» ويُطلب الإذن بهدف firefox', async () => {
  const h = harness({ diag: { ...DIAG, browser: 'Firefox', browserVersion: '159.0.1', buildTarget: 'firefox' } });
  h.trigger.click();
  await settle();
  assert.ok(textOf(h.region).includes('موافقة «البيانات التقنية والتفاعل»'));
  h.type('خلل');
  buttonNamed(h.region, 'إرسال البلاغ').click();
  await settle();
  assert.deepEqual(h.log[0], ['permission', 'firefox']);
});

test('الإرسال معطّل بلا وصف، والإذن أول ما في الضغطة قبل أي انتظار، ثم طلب واحد، والنجاح يعرض الرقم مع نسخه ويفرغ الوصف', async () => {
  const h = harness();
  h.trigger.click();
  await settle();
  const send = buttonNamed(h.region, 'إرسال البلاغ');
  assert.equal(send.getAttribute('aria-disabled'), 'true');
  send.click();
  await settle();
  assert.equal(h.log.length, 0, 'لا طلب بلا وصف');
  h.type('لا تظهر الترجمة العربية');
  assert.equal(send.getAttribute('aria-disabled'), null);
  send.click();
  assert.deepEqual(h.log.map((x) => x[0]), ['permission'], 'الإذن داخل الضغطة نفسها متزامنًا');
  await settle();
  assert.deepEqual(h.log.map((x) => x[0]), ['permission', 'send']);
  assert.deepEqual(h.log[1][1], buildPayload({ kind: 'bug', description: 'لا تظهر الترجمة العربية' }, DIAG));
  assert.ok(textOf(h.result()).includes('وصل بلاغك برقم #41'));
  assert.ok(textOf(h.result()).includes('احتفظ به إن أردت المتابعة عبر بريد الدعم iSultanBy@gmail.com؛'), 'النجاح يسمّي وجهة المتابعة (قرار T4)');
  assert.equal(h.panel.root.querySelector('textarea').value, '');
  buttonNamed(h.result(), 'نسخ الرقم').click();
  await settle();
  assert.deepEqual(h.log.at(-1), ['copy', '#41']);
  assert.ok(textOf(h.result()).includes('نُسخ الرقم.'));
});

test('بعد النجاح: البلاغ التالي بنص مطابق بلاغ جديد بمفتاح جديد، لا إعادة للقديم (مراجعة T8)', async () => {
  const h = harness({ outcomes: [{ ok: true, id: 41, replayed: false }, { ok: true, id: 42, replayed: false }] });
  h.trigger.click();
  await settle();
  h.type('لا تظهر الترجمة العربية');
  buttonNamed(h.region, 'إرسال البلاغ').click();
  await settle();
  assert.ok(textOf(h.result()).includes('#41'));
  h.type('لا تظهر الترجمة العربية');
  buttonNamed(h.region, 'إرسال البلاغ').click();
  await settle();
  const sends = h.log.filter((x) => x[0] === 'send');
  assert.equal(sends.length, 2);
  assert.deepEqual(sends[0][1], sends[1][1], 'الحمولة نفسها');
  assert.notEqual(sends[0][2], sends[1][2], 'مفتاح جديد بعد النجاح');
  assert.ok(textOf(h.result()).includes('#42'));
});

test('رفض الإذن: لا طلب، ونص الإذن مع «أعد المحاولة» و«نسخ البلاغ»', async () => {
  const h = harness({ permission: false });
  h.trigger.click();
  await settle();
  h.type('خلل');
  buttonNamed(h.region, 'إرسال البلاغ').click();
  await settle();
  assert.deepEqual(h.log.map((x) => x[0]), ['permission']);
  assert.equal(h.result().querySelector('[data-report-result]').getAttribute('data-failure'), 'permission');
  assert.ok(buttonNamed(h.result(), 'أعد المحاولة') && buttonNamed(h.result(), 'نسخ البلاغ'));
});

test('جدول الردود: الإعادة لما يعاد (المهلة والشبكة و429 و5xx) لا لـ400 و413 و415، والنسخ في كل فشل، والمفتاح نفسه في الإعادة', async () => {
  const rows = [
    [{ ok: false, failure: 'invalid', status: 400 }, false, 'رفض خادم البلاغات البلاغ'],
    [{ ok: false, failure: 'too-large', status: 413 }, false, 'أكبر مما يقبله'],
    [{ ok: false, failure: 'unsupported', status: 415 }, false, 'لم يقبل خادم البلاغات صيغة'],
    // ما لا يُعاد يُنسخ ويُرسل إلى بريد الدعم بالاسم (قرار T4 في جولة النشر)، لا «بطريقتك».
    [{ ok: false, failure: 'invalid', status: 400 }, false, 'انسخه وأرسله إلى بريد الدعم iSultanBy@gmail.com.'],
    [{ ok: false, failure: 'too-large', status: 413 }, false, 'انسخه وأرسله إلى بريد الدعم iSultanBy@gmail.com.'],
    [{ ok: false, failure: 'unsupported', status: 415 }, false, 'انسخه وأرسله إلى بريد الدعم iSultanBy@gmail.com.'],
    [{ ok: false, failure: 'rate-limited', status: 429, retryAfterSeconds: 120 }, true, 'أعد المحاولة بعد دقيقتين'],
    [{ ok: false, failure: 'server', status: 503 }, true, 'العطل من جهته'],
    [{ ok: false, failure: 'timeout', status: null }, true, 'لم يردّ خادم البلاغات في الوقت'],
    [{ ok: false, failure: 'network', status: null }, true, 'تعذّر الوصول إلى خادم البلاغات'],
  ];
  for (const [outcome, again, text] of rows) {
    const h = harness({ outcomes: [outcome, { ok: true, id: 7, replayed: true }] });
    h.trigger.click();
    await settle();
    h.type('خلل في التوقيت');
    buttonNamed(h.region, 'إرسال البلاغ').click();
    await settle();
    assert.ok(textOf(h.result()).includes(text), `${outcome.failure}: ${textOf(h.result())}`);
    assert.equal(Boolean(buttonNamed(h.result(), 'أعد المحاولة')), again, `${outcome.failure}: إعادة`);
    assert.ok(buttonNamed(h.result(), 'نسخ البلاغ'), `${outcome.failure}: نسخ`);
    assert.equal(h.log.filter((x) => x[0] === 'send').length, 1, 'لا إعادة تلقائية');
    if (again) {
      buttonNamed(h.result(), 'أعد المحاولة').click();
      await settle();
      const sends = h.log.filter((x) => x[0] === 'send');
      assert.equal(sends.length, 2);
      assert.equal(sends[0][2], sends[1][2], 'المحاولة بالمفتاح نفسه');
      assert.ok(textOf(h.result()).includes('#7'));
    }
  }
});

test('تعديل البلاغ بعد فشل يأخذ مفتاحًا جديدًا، وضغطتان متتاليتان طلب واحد', async () => {
  let release;
  const h = harness({ send: () => new Promise((r) => { release = r; }) });
  h.trigger.click();
  await settle();
  h.type('الوصف الأول');
  const send = buttonNamed(h.region, 'إرسال البلاغ');
  send.click();
  await settle();
  send.click();
  await settle();
  assert.equal(h.log.filter((x) => x[0] === 'send').length, 1, 'محاولة واحدة في كل مرة');
  release({ ok: false, failure: 'server', status: 500 });
  await settle();
  const firstKey = h.log.find((x) => x[0] === 'send')[2];
  h.type('الوصف بعد التعديل');
  send.click();
  await settle();
  const keys = h.log.filter((x) => x[0] === 'send').map((x) => x[2]);
  assert.equal(keys.length, 2);
  assert.notEqual(keys[1], firstKey, 'جسم معدَّل بمفتاح جديد');
});

test('«نسخ البلاغ» يعمل بلا شبكة ولا إذن: الجسم نفسه منسَّقًا، وفشل النسخ يقول البديل', async () => {
  const h = harness();
  h.trigger.click();
  await settle();
  h.type('اقتراح: اختصار للمزامنة');
  buttonNamed(h.region, 'نسخ البلاغ').click();
  await settle();
  assert.deepEqual(h.log.map((x) => x[0]), ['copy'], 'لا إذن ولا طلب');
  assert.equal(h.log[0][1], serialise(buildPayload({ kind: 'bug', description: 'اقتراح: اختصار للمزامنة' }, DIAG)));
  assert.ok(textOf(h.result()).includes('نُسخ البلاغ نصًّا. لم يُرسل شيء.'));
  const f = harness({ copyFails: true });
  f.trigger.click();
  await settle();
  f.type('x');
  buttonNamed(f.region, 'نسخ البلاغ').click();
  await settle();
  assert.ok(textOf(f.result()).includes('تعذّر النسخ'));
});

test('ما يشبه رمز جلسة أو ملف ارتباط في الوصف يمنع الإرسال والنسخ، والرابط العام وحده لا يمنع', async () => {
  const h = harness();
  h.trigger.click();
  await settle();
  h.type('الملف من https://www.youtube.com/watch?v=abc فيه خلل');
  assert.equal(buttonNamed(h.region, 'إرسال البلاغ').getAttribute('aria-disabled'), null);
  h.type('ملف الارتباط SAPISID=abcdef0123456789 ظهر');
  assert.equal(buttonNamed(h.region, 'إرسال البلاغ').getAttribute('aria-disabled'), 'true');
  assert.equal(buttonNamed(h.region, 'نسخ البلاغ').getAttribute('aria-disabled'), 'true');
  assert.ok(textOf(h.region.querySelector('.st-report__secret')).includes('رمز جلسة'));
  buttonNamed(h.region, 'إرسال البلاغ').click();
  buttonNamed(h.region, 'نسخ البلاغ').click();
  await settle();
  assert.equal(h.log.length, 0);
});

test('تعذّر التشخيص: لا إرسال ولا نسخ، والسبب مكتوب', async () => {
  const h = harness({ diagnostics: async () => { throw new Error('x'); } });
  h.trigger.click();
  await settle();
  h.type('خلل');
  assert.equal(buttonNamed(h.region, 'إرسال البلاغ').getAttribute('aria-disabled'), 'true');
  assert.ok(textOf(h.region).includes('تعذّرت قراءة إصدار المتصفح والنظام.'));
});

// ---- المراجعة المستقلة (2026-11-04) ----

test('التركيز بعد «أعد المحاولة» بلوحة المفاتيح: لا يسقط مع إعادة الرسم، بل إلى منطقة النتيجة أثناء الإرسال ثم إلى الزر الجديد', async () => {
  let release;
  const h = harness({ send: () => new Promise((r) => { release = r; }) });
  h.trigger.click();
  await settle();
  h.type('خلل في المزامنة');
  buttonNamed(h.region, 'إرسال البلاغ').click();
  await settle();
  release({ ok: false, failure: 'network', status: null });
  await settle();
  const retry = buttonNamed(h.result(), 'أعد المحاولة');
  retry.focus();
  retry.click(); // Enter على الزر المركّز
  assert.ok(h.doc.activeElement === h.result(), 'أثناء الإرسال: التركيز على منطقة النتيجة لا على زر أُزيل');
  assert.equal(h.result().getAttribute('tabindex'), '-1', 'تستقبل التركيز برمجيًا ولا تدخل ترتيب Tab');
  await settle();
  release({ ok: false, failure: 'server', status: 503 });
  await settle();
  const again = buttonNamed(h.result(), 'أعد المحاولة');
  assert.ok(again && h.doc.activeElement === again, 'فشل ثانٍ: التركيز على «أعد المحاولة» الجديد');
  again.click();
  await settle();
  release({ ok: true, id: 9, replayed: false });
  await settle();
  assert.ok(h.doc.activeElement === h.result(), 'النجاح: التركيز على النتيجة فيُقرأ الرقم');
  const copyId = buttonNamed(h.result(), 'نسخ الرقم');
  copyId.focus();
  copyId.click();
  await settle();
  assert.ok(h.doc.activeElement === buttonNamed(h.result(), 'نسخ الرقم'), '«نسخ الرقم» المركّز يبقى مركّزًا بعد إعادة الرسم');
  // التركيز خارج النتيجة لا يُنقل إليها.
  const send = buttonNamed(h.region, 'إرسال البلاغ');
  send.focus();
  h.type('بلاغ آخر');
  assert.ok(h.doc.activeElement === send);
});

test('فشل نسخ رقم البلاغ نتيجة ظاهرة لا صمت، ولو رمت الحافظة متزامنةً', async () => {
  for (const copy of [async () => { throw new Error('denied'); }, () => { throw new TypeError('no clipboard'); }]) {
    const h = harness({ copy });
    h.trigger.click();
    await settle();
    h.type('خلل');
    buttonNamed(h.region, 'إرسال البلاغ').click();
    await settle();
    buttonNamed(h.result(), 'نسخ الرقم').click();
    await settle();
    const note = h.result().querySelector('[data-report-copy]');
    assert.ok(note !== null, 'سطر نتيجة النسخ');
    assert.equal(note.getAttribute('data-report-copy'), 'failed');
    assert.equal(note.getAttribute('role'), 'alert');
    assert.ok(textOf(note).includes('تعذّر نسخ الرقم'), textOf(note));
    assert.ok(textOf(h.result()).includes('#41'), 'الرقم باقٍ ظاهرًا لنسخه باليد');
  }
});

test('بلاغان مستقلان بالوصف نفسه من الصفحة نفسها: الثاني بمفتاح جديد فيُنشأ لا يُعاد الأول، والإعادة بعد الفشل بالمفتاح نفسه', async () => {
  const h = harness({ outcomes: [{ ok: true, id: 41, replayed: false }, { ok: false, failure: 'network', status: null }, { ok: true, id: 42, replayed: false }] });
  h.trigger.click();
  await settle();
  h.type('الترجمة تتأخر');
  buttonNamed(h.region, 'إرسال البلاغ').click();
  await settle();
  assert.ok(textOf(h.result()).includes('#41'));
  h.type('الترجمة تتأخر');
  buttonNamed(h.region, 'إرسال البلاغ').click();
  await settle();
  buttonNamed(h.result(), 'أعد المحاولة').click();
  await settle();
  const keys = h.log.filter((x) => x[0] === 'send').map((x) => x[2]);
  assert.equal(keys.length, 3);
  assert.notEqual(keys[1], keys[0], 'الإرسال الثاني بلاغ جديد بمفتاح جديد رغم تطابق الجسم');
  assert.equal(keys[2], keys[1], 'إعادة المحاولة بالمفتاح نفسه');
  assert.ok(textOf(h.result()).includes('#42'));
});

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
