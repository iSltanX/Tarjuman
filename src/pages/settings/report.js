// «الإبلاغ عن مشكلة» (جولة النشر T2.1، وبلا خادم منذ و1 في 2.2.0، قرار سلطان ق3): زر في قسم «حول» يفتح تحته نموذجًا. يختار
// المستخدم النوع (خلل أو اقتراح أو أخرى) ويصف ما حدث (حتى 2000 محرف)، ويرى كل ما يُرفق (الجسم المبني نفسه صفًّا صفًّا ونصه
// كاملًا)، ثم «نسخ البلاغ» فيرسله بنفسه إلى بريد الدعم الظاهر تحته مع زر نسخه. لا يُرسل ترجمان شيئًا: لا خادم ولا طلب ولا إذن،
// ولا يُفتح بريد ولا رابط تلقائيًا. والنسخ وحده يكتب في الحافظة، بضغطة المستخدم.
import { getLocale, t } from '../../i18n/index.js';
import { findSecrets } from '../../core/diagnostics/sanitize.js';
import { personalHintText, personalHints } from '../../core/report/personal.js';
import { collectDiagnostics } from '../../core/report/diagnostics.js';
import { SUPPORT_EMAIL } from '../../core/report/messages.js';
import { KIND_LABELS, LIMITS, REPORT_KINDS, buildPayload, formError, reviewRows, serialise } from '../../core/report/payload.js';
import { button, el, ltr } from '../../ui/components.js';
import { segmented } from '../../ui/forms.js';

/** عنوان اللوحة وزرها بلغة الواجهة الحالية. */
export const reportLabel = () => t('settings.report.label');
const promptOf = (kind) => t(`settings.report.prompts.${kind}`);
/** أرقام لاتينية بلا فواصل آلاف في اللغتين. */
const count = { format: (n) => new Intl.NumberFormat(`${getLocale()}-u-nu-latn`, { useGrouping: false }).format(n) };

/**
 * @typedef {{
 *   diagnostics?: () => Promise<import('../../core/report/payload.js').Diagnostics>,
 *   copy?: (text: string) => Promise<void>,
 * }} ReportEnv
 */

/** المصادر الحية، تُقرأ عند الحاجة لا عند تركيب الصفحة. @returns {Required<ReportEnv>} */
const liveEnv = () => ({
  diagnostics: () => collectDiagnostics(),
  copy: (text) => globalThis.navigator.clipboard.writeText(text),
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
  /** @type {null | 'copied' | 'copy-failed'} نتيجة نسخ البلاغ */
  let outcome = null;
  /** @type {null | 'copied' | 'copy-failed'} نتيجة نسخ البريد */
  let emailOutcome = null;
  /** حال منطقة النتيجة المرسومة: تُعاد حين تتغير وحدها، لا مع كل حرف في الوصف (U52). */
  let painted = null;

  const regionId = 'st-report';
  const textId = 'st-report-text';
  const countId = 'st-report-count';

  const trigger = button({ label: reportLabel(), variant: 'secondary', icon: 'flag', doc, onClick: () => (opened ? close() : open()) });
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', regionId);

  const kinds = segmented({
    legend: t('settings.report.kindLegend'), value: kind, doc,
    options: REPORT_KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] })),
    onChange: (v) => { kind = v; textLabel.textContent = promptOf(v); render(); },
  });
  const textarea = el('textarea', {
    className: 'tj-field__input st-report__text',
    attrs: { id: textId, 'data-tj-keep': 'settings.report.text', rows: '5', maxlength: String(LIMITS.description), 'aria-describedby': `${countId} st-report-warn st-report-hint` },
    doc,
  });
  textarea.addEventListener('input', () => {
    text = String(textarea.value ?? '');
    // عودة النص بعد تبديل لغة الواجهة (data-tj-keep) تفتح اللوحة التي فيها حقله، فلا يبقى مخبوءًا.
    if (!opened && text) open();
    render();
  });
  // عنوان الحقل بحسب نوع البلاغ (ق-6).
  const textLabel = el('label', { className: 'tj-field__label', text: promptOf(kind), attrs: { for: textId }, doc });
  const counter = el('span', { className: 'tj-caption st-report__count', attrs: { id: countId }, doc });
  const secretAlert = el('p', { className: 'st-report__secret', attrs: { role: 'alert' }, doc });
  // تذكير غير مانع برابط يوتيوب أو بريد أو معرّف في الوصف (تدقيق 7a66f91، U84): يُحدَّث نصه حين يتغير وحده فلا يُعاد إعلانه.
  const personalNote = el('p', { className: 'st-report__hint', attrs: { id: 'st-report-hint', role: 'status' }, doc });
  personalNote.hidden = true;
  const rows = el('dl', { className: 'st-report__rows', doc });
  // حال قراءة التشخيص فقرة شقيقة للقائمة لا ابنًا لها (أبناء dl أزواج dt/dd وحدها؛ U58).
  const rowsStatus = el('p', { className: 'tj-caption st-report__rows-status', doc });
  const json = el('pre', { className: 'st-report__json', attrs: { dir: 'ltr' }, doc });

  const copyBtn = button({ label: t('settings.report.copy'), variant: 'primary', icon: 'copy', doc, onClick: () => copyReport() });
  // بريد الدعم ظاهرًا مع زر نسخه (ق3): لا رابط mailto ولا فتح بريد.
  const emailBtn = button({ label: t('settings.report.copyEmail'), variant: 'ghost', size: 'sm', icon: 'copy', doc, onClick: () => copyEmail() });
  emailBtn.setAttribute('data-report-action', 'copy-email');
  const emailNote = el('span', { className: 'tj-caption', attrs: { role: 'status' }, doc });
  const emailLine = el('div', {
    className: 'st-report__email',
    children: [el('p', { className: 'tj-body-sm', children: [t('settings.report.emailA'), ltr(SUPPORT_EMAIL, { doc }), t('settings.report.emailB')], doc }), el('div', { className: 'st-actions', children: [emailBtn, emailNote], doc })],
    doc,
  });
  const result = el('div', { className: 'st-report__result', attrs: { role: 'status', tabindex: '-1' }, doc });

  const region = el('div', {
    className: 'st-report',
    attrs: { id: regionId, role: 'group', 'aria-labelledby': 'st-report-title' },
    children: [
      el('h3', { className: 'tj-h4', text: reportLabel(), attrs: { id: 'st-report-title' }, doc }),
      el('p', { className: 'tj-body-sm', text: t('settings.report.intro'), doc }),
      kinds.root,
      textLabel,
      textarea,
      counter,
      el('p', { className: 'tj-caption', text: t('settings.report.warn'), attrs: { id: 'st-report-warn' }, doc }),
      secretAlert,
      personalNote,
      el('div', {
        className: 'st-panel st-report__review',
        children: [
          el('strong', { className: 'st-panel__title', text: t('settings.report.reviewTitle'), doc }),
          rowsStatus,
          rows,
          el('details', {
            className: 'st-details',
            children: [el('summary', { className: 'st-details__summary', text: t('settings.report.fullText'), doc }), json],
            doc,
          }),
          el('p', { className: 'tj-caption', text: t('settings.report.notAttached'), doc }),
        ],
        doc,
      }),
      el('div', { className: 'st-actions', children: [copyBtn], doc }),
      result,
      emailLine,
    ],
    doc,
  });
  region.hidden = true;

  /** الجسم للمعاينة (بوصف مؤقت إن كان فارغًا)، أو null قبل قراءة التشخيص. */
  const preview = () => (diag ? buildPayload({ kind, description: text.trim() || '…' }, diag) : null);
  /** لا يُنسخ البلاغ وفيه ما يشبه رمز جلسة أو ملف ارتباط أو توقيعًا (منقّي التشخيص نفسه؛ الروابط وحدها مسموحة). */
  const secrets = () => [...new Set(findSecrets(text, ['url']).map((f) => f.type))];
  /** سبب منع النسخ، أو null. */
  function blockedReason() {
    if (!diag) return t(diagFailed ? 'settings.report.diagFailed' : 'settings.report.diagReading');
    const error = formError({ kind, description: text });
    if (error === 'empty') return t('settings.report.writeFirst');
    if (error === 'too-long') return t('settings.report.tooLong', { n: count.format(LIMITS.description) });
    if (secrets().length) return t('settings.report.removeSecret');
    return null;
  }

  function renderResult() {
    const state = JSON.stringify({ outcome, emailOutcome });
    if (state === painted) return;
    painted = state;
    result.replaceChildren(...(outcome ? [el('p', {
      className: 'tj-body-sm', attrs: { 'data-report-result': outcome },
      text: t(outcome === 'copied' ? 'settings.report.copied' : 'settings.report.copyFailed'),
      doc,
    })] : []));
    emailNote.textContent = emailOutcome ? t(emailOutcome === 'copied' ? 'settings.report.emailCopied' : 'settings.report.emailCopyFailed') : '';
  }

  function render() {
    const length = text.trim().length;
    counter.replaceChildren(ltr(`${count.format(length)} / ${count.format(LIMITS.description)}`, { doc }));
    const found = secrets();
    secretAlert.hidden = found.length === 0;
    // النص يُكتب حين يتغير وحده: كتابته مع كل حرف تعيد إعلان role=alert (U52، N13).
    const secretText = found.length ? t('settings.report.secretAlert') : '';
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
    rowsStatus.textContent = p ? '' : t(diagFailed ? 'settings.report.diagFailed' : 'settings.report.diagReading');
    json.textContent = p ? serialise(p) : '';
    setDisabled(copyBtn, blockedReason());
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

  function copyReport() {
    if (blockedReason()) return;
    const body = serialise(buildPayload({ kind, description: text }, diag));
    Promise.resolve().then(() => deps.copy(body)).then(
      () => { outcome = 'copied'; render(); },
      () => { outcome = 'copy-failed'; render(); },
    );
  }

  function copyEmail() {
    // فشل الحافظة نتيجة ظاهرة لا صمت: البريد ظاهر فوقه ليُنسخ باليد.
    Promise.resolve().then(() => deps.copy(SUPPORT_EMAIL)).then(
      () => { emailOutcome = 'copied'; render(); },
      () => { emailOutcome = 'copy-failed'; render(); },
    );
  }

  render();
  return {
    root: el('div', { className: 'st-report-host', children: [el('div', { className: 'st-actions', children: [trigger], doc }), region], doc }),
    open,
    get state() { return { opened, kind, text, outcome, emailOutcome, diag }; },
  };
}
