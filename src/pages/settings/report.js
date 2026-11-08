// «الإبلاغ عن مشكلة» (جولة النشر T2.1): زر في قسم «حول» يفتح تحته نموذجًا. يختار المستخدم النوع (خلل أو اقتراح أو أخرى)
// ويصف ما حدث (حتى 2000 محرف)، ويرى قبل الإرسال كل ما سيُرسل (الجسم المبني نفسه صفًّا صفًّا ونصه كاملًا)، ثم يرسله بنفسه.
// أول ضغطة «أرسل البلاغ» تطلب إذن مضيف خادم البلاغات (وفي Firefox موافقة «البيانات التقنية والتفاعل») قبل أي انتظار. ولا طلب
// قبل الضغطة، ولا إعادة تلقائية، ومحاولة واحدة في كل مرة. والنجاح يعرض رقم البلاغ مع نسخه، والفشل يتبع جدول الردود في العقد
// بـ«أعد المحاولة» و«انسخ البلاغ»، والنسخ يعمل بلا شبكة. والطلب نفسه في src/core/report/client.js وحده.
import { findSecrets } from '../../core/diagnostics/sanitize.js';
import { personalHintText, personalHints } from '../../core/report/personal.js';
import { REPORTS_ORIGIN, hostGranted, requestReportPermission, retryable, sendReport } from '../../core/report/client.js';
import { collectDiagnostics } from '../../core/report/diagnostics.js';
import { SUPPORT_EMAIL, failureText } from '../../core/report/messages.js';
import { KIND_LABELS, LIMITS, REPORT_KINDS, buildPayload, formError, reviewRows, serialise } from '../../core/report/payload.js';
import { button, el, ltr } from '../../ui/components.js';
import { segmented } from '../../ui/forms.js';

export const REPORT_LABEL = 'الإبلاغ عن مشكلة';
const REPORTS_HOST = new URL(REPORTS_ORIGIN).host;
const TEXT_PROMPTS = Object.freeze({ bug: 'ماذا حدث؟', suggestion: 'ما اقتراحك؟', other: 'اكتب رسالتك' });
const count = new Intl.NumberFormat('ar-u-nu-latn', { useGrouping: false });

/**
 * @typedef {{
 *   diagnostics?: () => Promise<import('../../core/report/payload.js').Diagnostics>,
 *   requestPermission?: (target: 'chromium' | 'firefox') => Promise<boolean>,
 *   send?: (payload: object, key: string) => Promise<import('../../core/report/client.js').SendOutcome>,
 *   copy?: (text: string) => Promise<void>,
 *   newKey?: () => string,
 * }} ReportEnv
 */

/** المصادر الحية، تُقرأ عند الحاجة لا عند تركيب الصفحة. @returns {Required<ReportEnv>} */
const liveEnv = () => ({
  diagnostics: () => collectDiagnostics(),
  requestPermission: (target) => requestReportPermission(globalThis.chrome, target),
  send: (payload, key) => sendReport(payload, key, { granted: () => hostGranted(globalThis.chrome) }),
  copy: (text) => globalThis.navigator.clipboard.writeText(text),
  newKey: () => globalThis.crypto.randomUUID(),
});

/** @param {HTMLButtonElement} b @param {string | null} reason سبب التعطيل، أو null للتفعيل */
function setDisabled(b, reason) {
  if (reason) {
    b.setAttribute('aria-disabled', 'true');
    b.title = reason;
  } else {
    b.removeAttribute('aria-disabled');
    b.title = '';
  }
}

/**
 * @param {{ doc?: Document, env?: ReportEnv }} [o]
 * @returns {{ root: HTMLElement, open: () => void, readonly state: object }}
 */
export function reportPanel({ doc = document, env = {} } = {}) {
  const deps = liveEnv();
  for (const [k, v] of Object.entries(env)) if (v !== undefined) deps[k] = v;
  let opened = false;
  let kind = 'bug';
  let text = '';
  /** @type {import('../../core/report/payload.js').Diagnostics | null} */
  let diag = null;
  let diagFailed = false;
  let busy = false;
  /**
   * مفتاح عدم التكرار لهذا البلاغ بعينه: يُعاد في محاولاته بعد فشل، وجسم معدَّل يأخذ مفتاحًا جديدًا، والنجاح يختم البلاغ فيأخذ
   * التالي مفتاحًا جديدًا ولو طابق وصفه الأول (عقد app-reports: مفتاح لكل بلاغ يُعاد في محاولاته وحدها).
   */
  let key = null;
  let keyBody = null;
  /** @type {null | { state: 'sent' | 'id-copied' | 'id-copy-failed', id: number } | { state: 'failed', failure: string, retryAfterSeconds?: number } | { state: 'copied' | 'copy-failed' }} */
  let outcome = null;
  /** آخر فعل في منطقة النتيجة كان عليه التركيز (data-report-action): يعود إليه بعد إعادة رسمها إن بقي. */
  let focusAction = null;
  /** نتيجة نسخ أثناء الإرسال (النسخ لا يمس الشبكة فيعمل والإرسال جارٍ؛ تدقيق 7a66f91، U59 L-20). */
  let copiedWhileBusy = null;
  /** حال منطقة النتيجة المرسومة: تُعاد حين تتغير وحدها، لا مع كل حرف في الوصف (كانت role=alert تُدرج من جديد؛ U52). */
  let painted = null;

  const regionId = 'st-report';
  const textId = 'st-report-text';
  const countId = 'st-report-count';

  const trigger = button({ label: REPORT_LABEL, variant: 'secondary', icon: 'flag', doc, onClick: () => (opened ? close() : open()) });
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', regionId);

  const kinds = segmented({
    legend: 'نوع البلاغ', value: kind, doc,
    options: REPORT_KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] })),
    onChange: (v) => { kind = v; textLabel.textContent = TEXT_PROMPTS[v]; render(); },
  });
  const textarea = el('textarea', {
    className: 'tj-field__input st-report__text',
    attrs: { id: textId, rows: '5', maxlength: String(LIMITS.description), 'aria-describedby': `${countId} st-report-warn st-report-hint` },
    doc,
  });
  textarea.addEventListener('input', () => {
    text = String(textarea.value ?? '');
    render();
  });
  // عنوان الحقل بحسب نوع البلاغ (ق-6).
  const textLabel = el('label', { className: 'tj-field__label', text: TEXT_PROMPTS[kind], attrs: { for: textId }, doc });
  const counter = el('span', { className: 'tj-caption st-report__count', attrs: { id: countId }, doc });
  const secretAlert = el('p', { className: 'st-report__secret', attrs: { role: 'alert' }, doc });
  // تذكير غير مانع برابط يوتيوب أو بريد أو معرّف في الوصف (تدقيق 7a66f91، U84): يُحدَّث نصه حين يتغير وحده فلا يُعاد إعلانه.
  const personalNote = el('p', { className: 'st-report__hint', attrs: { id: 'st-report-hint', role: 'status' }, doc });
  personalNote.hidden = true;
  const rows = el('dl', { className: 'st-report__rows', doc });
  // حال قراءة التشخيص فقرة شقيقة للقائمة لا ابنًا لها (أبناء dl أزواج dt/dd وحدها؛ U58).
  const rowsStatus = el('p', { className: 'tj-caption st-report__rows-status', doc });
  const json = el('pre', { className: 'st-report__json', attrs: { dir: 'ltr' }, doc });

  const sendBtn = button({ label: 'إرسال البلاغ', variant: 'primary', doc, onClick: () => send() });
  const copyBtn = button({ label: 'نسخ البلاغ', variant: 'secondary', icon: 'copy', doc, onClick: () => copyReport() });
  // tabindex=-1: يستقبل التركيز برمجيًا حين يزول الزر الذي كان عليه (renderResult)، ولا يدخل ترتيب Tab.
  const result = el('div', { className: 'st-report__result', attrs: { role: 'status', tabindex: '-1' }, doc });

  const region = el('div', {
    className: 'st-report',
    attrs: { id: regionId, role: 'group', 'aria-labelledby': 'st-report-title' },
    children: [
      el('h3', { className: 'tj-h4', text: REPORT_LABEL, attrs: { id: 'st-report-title' }, doc }),
      el('p', { className: 'tj-body-sm', text: 'يصل البلاغ إلى مطوّر ترجمان في قناة خاصة لا تُنشر، ولا يُرسل شيء قبل أن تراجعه وتضغط «إرسال البلاغ» بنفسك.', doc }),
      kinds.root,
      textLabel,
      textarea,
      counter,
      el('p', { className: 'tj-caption', text: 'يُرسل نصك كما كتبته. لا تضع فيه نص ترجمة ولا بيانات شخصية لا يحتاجها البلاغ.', attrs: { id: 'st-report-warn' }, doc }),
      secretAlert,
      personalNote,
      el('div', {
        className: 'st-panel st-report__review',
        children: [
          el('strong', { className: 'st-panel__title', text: 'ما يُرفق تلقائيًا (تراه كله قبل الإرسال)', doc }),
          rowsStatus,
          rows,
          el('details', {
            className: 'st-details',
            children: [el('summary', { className: 'st-details__summary', text: 'نص البلاغ كاملًا كما سيُرسل', doc }), json],
            doc,
          }),
          el('p', { className: 'tj-caption', text: 'لا يُرفق تلقائيًا نص ترجمة، ولا معرّف فيديو أو عنوانه أو رابطه، ولا حساب. ويضيف المتصفح ما يضيفه إلى أي طلب، ومنه عنوان الإضافة. رقم البلاغ مرجعك الوحيد.', doc }),
          el('p', { className: 'tj-caption st-report__permission', doc }),
        ],
        doc,
      }),
      el('div', { className: 'st-actions', children: [sendBtn, copyBtn], doc }),
      result,
    ],
    doc,
  });
  region.hidden = true;
  const permissionNote = region.querySelector('.st-report__permission');

  /** الجسم للمعاينة (بوصف مؤقت إن كان فارغًا)، أو null قبل قراءة التشخيص. */
  const preview = () => (diag ? buildPayload({ kind, description: text.trim() || '…' }, diag) : null);
  /** لا يُرسل البلاغ ولا يُنسخ وفيه ما يشبه رمز جلسة أو ملف ارتباط أو توقيعًا (منقّي التشخيص نفسه؛ الروابط وحدها مسموحة). */
  const secrets = () => [...new Set(findSecrets(text, ['url']).map((f) => f.type))];
  /** سبب منع الإرسال والنسخ، أو null. */
  function blockedReason() {
    if (!diag) return diagFailed ? 'تعذّرت قراءة إصدار المتصفح والنظام.' : 'يُقرأ إصدار المتصفح والنظام…';
    const error = formError({ kind, description: text });
    if (error === 'empty') return 'اكتب وصفًا أولًا.';
    if (error === 'too-long') return `الوصف أطول من ${count.format(LIMITS.description)} حرف؛ اختصره.`;
    if (secrets().length) return 'احذف ما يشبه رمز جلسة أو ملف ارتباط من الوصف.';
    return null;
  }

  /** زر في منطقة النتيجة باسم فعله، ليعود إليه التركيز بعد إعادة الرسم. */
  const action = (name, opts) => {
    const b = button({ doc, ...opts });
    b.setAttribute('data-report-action', name);
    return b;
  };

  /**
   * إعادة الرسم تبدّل عقد النتيجة كلها. فإن كان التركيز فيها («أعد المحاولة» بلوحة المفاتيح مثلًا) لا يسقط إلى الصفحة: يعود إلى
   * الفعل نفسه في الرسم الجديد إن وُجد، وإلا إلى منطقة النتيجة نفسها فيُقرأ ما فيها («يُرسل البلاغ…» ثم النتيجة).
   */
  function renderResult() {
    const state = JSON.stringify({ busy, outcome, copiedWhileBusy });
    if (state === painted) return;
    painted = state;
    const active = doc.activeElement;
    const inside = Boolean(active) && (active === result || result.contains(active));
    if (inside && active !== result) focusAction = active.getAttribute?.('data-report-action') ?? null;
    paintResult();
    if (!inside) return;
    const target = focusAction ? result.querySelector(`[data-report-action="${focusAction}"]`) : null;
    (target ?? result).focus?.();
  }

  function paintResult() {
    if (busy) {
      const note = copiedWhileBusy ? el('p', { className: 'tj-caption', text: copiedWhileBusy === 'copied' ? 'نُسخ البلاغ نصًّا.' : 'تعذّر النسخ. افتح «نص البلاغ كاملًا كما سيُرسل» وانسخه يدويًا.', doc }) : null;
      result.replaceChildren(el('p', { className: 'tj-body-sm', text: 'يُرسل البلاغ…', doc }), ...(note ? [note] : []));
      return;
    }
    if (!outcome) {
      result.replaceChildren();
      return;
    }
    if (outcome.state === 'sent' || outcome.state === 'id-copied' || outcome.state === 'id-copy-failed') {
      const id = outcome.id;
      const copyId = action('copy-id', { label: 'نسخ الرقم', variant: 'ghost', size: 'sm', icon: 'copy', onClick: () => {
        // فشل الحافظة (رفض أو غيابها) نتيجة ظاهرة لا صمت: الرقم ظاهر فوقه ليُنسخ باليد.
        Promise.resolve().then(() => deps.copy(`#${id}`)).then(
          () => { outcome = { state: 'id-copied', id }; render(); },
          () => { outcome = { state: 'id-copy-failed', id }; render(); },
        );
      } });
      const copyNote = outcome.state === 'id-copied'
        ? el('span', { className: 'tj-caption', attrs: { 'data-report-copy': 'done' }, text: 'نُسخ الرقم.', doc })
        : outcome.state === 'id-copy-failed'
          ? el('span', { className: 'tj-caption st-report__copy-failed', attrs: { role: 'alert', 'data-report-copy': 'failed' }, text: 'تعذّر نسخ الرقم. حدّده أعلاه وانسخه يدويًا.', doc })
          : null;
      result.replaceChildren(el('div', {
        className: 'st-report__done', attrs: { 'data-report-result': 'sent' },
        children: [
          el('p', { className: 'tj-body-sm', children: ['وصل بلاغك برقم ', ltr(`#${id}`, { doc }), '. احتفظ به إن أردت المتابعة عبر بريد الدعم ', ltr(SUPPORT_EMAIL, { doc }), '؛ لا يُرسل إليك شيء ولا نطلب بريدًا.'], doc }),
          el('div', { className: 'st-actions', children: [copyId, copyNote], doc }),
        ],
        doc,
      }));
      return;
    }
    if (outcome.state === 'failed') {
      const again = retryable(outcome.failure);
      result.replaceChildren(el('div', {
        className: 'st-report__failed', attrs: { role: 'alert', 'data-report-result': 'failed', 'data-failure': outcome.failure },
        children: [
          el('p', { className: 'tj-body-sm', text: failureText(outcome.failure, outcome.retryAfterSeconds), doc }),
          el('div', {
            className: 'st-actions',
            children: [
              again ? action('retry', { label: 'أعد المحاولة', variant: 'secondary', icon: 'restore', onClick: () => send() }) : null,
              action('copy', { label: 'نسخ البلاغ', variant: 'secondary', icon: 'copy', onClick: () => copyReport() }),
            ],
            doc,
          }),
        ],
        doc,
      }));
      return;
    }
    const copied = outcome.state === 'copied';
    result.replaceChildren(el('p', {
      className: 'tj-body-sm', attrs: { 'data-report-result': outcome.state },
      text: copied ? 'نُسخ البلاغ نصًّا. لم يُرسل شيء.' : 'تعذّر النسخ. افتح «نص البلاغ كاملًا كما سيُرسل» وانسخه يدويًا.',
      doc,
    }));
  }

  function render() {
    const length = text.trim().length;
    counter.replaceChildren(ltr(`${count.format(length)} / ${count.format(LIMITS.description)}`, { doc }));
    const found = secrets();
    secretAlert.hidden = found.length === 0;
    // النص يُكتب حين يتغير وحده: كتابته مع كل حرف تعيد إعلان role=alert (U52، N13).
    const secretText = found.length ? 'في وصفك ما يشبه رمز جلسة أو ملف ارتباط أو توقيع طلب. احذفه قبل الإرسال أو النسخ؛ لا يحتاج البلاغ شيئًا منها.' : '';
    if (secretAlert.textContent !== secretText) secretAlert.textContent = secretText;
    const hint = found.length ? '' : personalHintText(personalHints(text));
    if (personalNote.textContent !== hint) personalNote.textContent = hint;
    personalNote.hidden = !hint;
    const p = preview();
    rows.replaceChildren(...(p ? reviewRows(p).map((row) => el('div', {
      className: 'st-report__row', attrs: { 'data-report-field': row.field },
      children: [el('dt', { text: row.label, doc }), el('dd', { children: [ltr(row.value, { doc })], doc })],
      doc,
    })) : []));
    rows.hidden = !p;
    rowsStatus.hidden = Boolean(p);
    rowsStatus.textContent = p ? '' : diagFailed ? 'تعذّرت قراءة إصدار المتصفح والنظام.' : 'يُقرأ إصدار المتصفح والنظام…';
    json.textContent = p ? serialise(p) : '';
    const firefox = diag?.buildTarget === 'firefox';
    permissionNote.textContent = `عند أول إرسال يطلب المتصفح إذنك بالاتصال بخادم البلاغات وحده (${REPORTS_HOST})${firefox ? '، ومعه موافقة «البيانات التقنية والتفاعل» لأن البلاغ يحمل إصدار المتصفح والنظام' : ''}، وتسحبه متى شئت من صفحة إضافات المتصفح.`;
    const reason = blockedReason();
    setDisabled(sendBtn, busy ? null : reason);
    // النسخ يعمل أثناء الإرسال (لا يمس الشبكة)، فلا يبدو مفعّلًا ثم يسكت (U59 L-20)؛ والانشغال على زر الإرسال وحده.
    setDisabled(copyBtn, reason);
    sendBtn.setAttribute('aria-busy', busy ? 'true' : 'false');
    copyBtn.setAttribute('aria-busy', 'false');
    textarea.disabled = busy;
    kinds.inputs.forEach((input) => { input.disabled = busy; });
    renderResult();
  }

  function open() {
    opened = true;
    region.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    if (!diag && !diagFailed) {
      Promise.resolve().then(deps.diagnostics).then(
        (d) => { diag = d; render(); },
        () => { diagFailed = true; render(); },
      );
    }
    render();
    textarea.focus?.();
  }

  function close() {
    opened = false;
    region.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  }

  function send() {
    if (busy || blockedReason()) return;
    const target = diag.buildTarget === 'firefox' ? 'firefox' : 'chromium';
    // الإذن أول ما في الضغطة قبل أي انتظار (المتصفح يرفض طلبه خارج فعل المستخدم).
    const asked = deps.requestPermission(target);
    const payload = buildPayload({ kind, description: text }, diag);
    const body = serialise(payload);
    if (body !== keyBody) {
      key = deps.newKey();
      keyBody = body;
    }
    const k = key;
    busy = true;
    outcome = null;
    copiedWhileBusy = null;
    render();
    Promise.resolve(asked)
      .then((granted) => (granted ? deps.send(payload, k) : { ok: false, failure: 'permission', status: null }))
      .catch(() => ({ ok: false, failure: 'unexpected', status: null }))
      .then((r) => {
        busy = false;
        if (r.ok) {
          outcome = { state: 'sent', id: r.id };
          // البلاغ التالي بلاغ جديد ولو طابق نصّه هذا: المفتاح لإعادة البلاغ نفسه بعد فشل، لا لما بعد النجاح (مراجعة T8).
          key = null;
          keyBody = null;
          text = '';
          textarea.value = '';
        } else {
          outcome = { state: 'failed', failure: r.failure, ...(r.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: r.retryAfterSeconds }) };
        }
        render();
      });
  }

  function copyReport() {
    if (blockedReason()) return;
    const body = serialise(buildPayload({ kind, description: text }, diag));
    const during = busy;
    // يُحسم بحال الإرسال لحظة انتهاء النسخ: نسخٌ بدأ أثناء الإرسال وانتهى بعده لا يكتب فوق نتيجة الإرسال (رقم البلاغ أو سبب
    // فشله؛ ملاحظة المراجعة المستقلة)، وأثناءه يُقال تحت «يُرسل البلاغ…».
    const settle = (state) => {
      if (busy) copiedWhileBusy = state;
      else if (!during) outcome = { state };
      render();
    };
    Promise.resolve().then(() => deps.copy(body)).then(() => settle('copied'), () => settle('copy-failed'));
  }

  render();
  return {
    root: el('div', { className: 'st-report-host', children: [el('div', { className: 'st-actions', children: [trigger], doc }), region], doc }),
    open,
    get state() { return { opened, kind, text, busy, key, outcome, diag }; },
  };
}
