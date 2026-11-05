// بطاقة «المصطلحات» (R62، P13-AC7، مواصفة التصميم §١٩.٨): جدول (الإنجليزية · العربية المفضّلة · ملاحظة) بإضافة وحذف،
// وعدّاد «12 من 100»، ومفتاح «أرفق القاموس بتعليمات الترجمة». الحفظ فوري في التفضيلات (prefs.glossary) بتحقق النموذج
// نفسه، والقاموس يُرفق بالنص نفسه أينما نُسخت التعليمات (instructions في P11). DOM وtextContent فقط.
import { messageFor } from '../../core/errors/index.js';
import { GLOSSARY_LIMITS } from '../../core/model/prefs.js';
import { button, el } from '../../ui/components.js';
import { glossaryCounter, termDraft } from './model.js';

let seq = 0;

/**
 * @param {{
 *   doc: Document, getPrefs: () => import('../../core/model/prefs.js').Prefs,
 *   savePrefs: (patch: object, mark: { flash: Function }) => Promise<unknown>,
 *   addTerm: (term: import('../../core/model/prefs.js').GlossaryTerm, mark: { flash: Function }) => Promise<{ added: boolean, reason: 'duplicate' | 'limit' | null } | null>,
 *   removeTerm: (source: string, mark: { flash: Function }) => Promise<{ removed: boolean } | null>,
 *   attachMark: { root: HTMLElement, flash: Function }, listMark: { root: HTMLElement, flash: Function },
 * }} o addTerm وremoveTerm على أحدث تفضيلات بالمفتاح الموحّد لا بقائمة من العرض (تدقيق 7a66f91، U13)؛ وnull عند الفشل
 */
export function glossaryControl({ doc, getPrefs, savePrefs, addTerm, removeTerm, attachMark, listMark }) {
  const id = `st-gl-${++seq}`;
  const attach = el('input', { className: 'st-switch__input', attrs: { id: `${id}-attach`, type: 'checkbox', role: 'switch' }, doc });
  attach.addEventListener('change', () => savePrefs({ glossary: { attach: attach.checked } }, attachMark));
  const attachRow = el('label', {
    className: 'st-switch', attrs: { for: `${id}-attach` },
    children: [attach, el('span', { className: 'st-switch__track', attrs: { 'aria-hidden': 'true' }, doc }), el('span', { className: 'st-switch__label', text: 'أرفق القاموس بتعليمات الترجمة', doc })],
    doc,
  });

  const counter = el('span', { className: 'tj-pill tj-pill--plain st-gl__count', attrs: { 'aria-live': 'polite' }, doc });
  const body = el('tbody', { doc });
  const table = el('table', {
    className: 'st-gl__table',
    children: [
      el('caption', { className: 'tj-sr-only', text: 'مصطلحات القاموس', doc }),
      el('thead', { children: [el('tr', { children: ['الإنجليزية', 'العربية المفضّلة', 'ملاحظة', ''].map((h, i) => el('th', { text: h, attrs: { scope: 'col', ...(i === 3 ? { 'aria-label': 'حذف' } : {}) }, doc })), doc })], doc }),
      body,
    ],
    doc,
  });
  const empty = el('p', { className: 'tj-caption st-gl__empty', text: 'لا مصطلحات بعد. أضف المصطلح الإنجليزي ومقابله الذي تفضّله، فيُطلب من النموذج التزامه.', doc });
  const tableWrap = el('div', { className: 'st-gl__wrap', children: [table], doc });

  // حقول الإضافة: كل حقل بتسميته، والخطأ تحت الحقل المعني.
  const inputs = {};
  const errors = {};
  const fieldOf = (key, label, max, dir) => {
    const fid = `${id}-${key}`;
    inputs[key] = el('input', { className: 'tj-field__input', attrs: { id: fid, type: 'text', autocomplete: 'off', spellcheck: key === 'source' ? 'false' : 'true', maxlength: String(max) }, dir, doc });
    errors[key] = el('span', { className: 'tj-field__error', attrs: { id: `${fid}-error`, role: 'alert' }, doc });
    errors[key].hidden = true;
    return el('div', { className: `tj-field st-gl__field st-gl__field--${key}`, children: [el('label', { className: 'tj-field__label', text: label, attrs: { for: fid }, doc }), inputs[key], errors[key]], doc });
  };
  const fields = [
    fieldOf('source', 'المصطلح الإنجليزي', GLOSSARY_LIMITS.maxSource, 'ltr'),
    fieldOf('target', 'العربية المفضّلة', GLOSSARY_LIMITS.maxTarget, 'rtl'),
    fieldOf('note', 'ملاحظة (اختيارية)', GLOSSARY_LIMITS.maxNote, 'auto'),
  ];
  const formError = el('p', { className: 'tj-field__error st-gl__error', attrs: { role: 'alert' }, doc });
  formError.hidden = true;
  const clearErrors = () => {
    for (const k of Object.keys(errors)) {
      errors[k].hidden = true;
      errors[k].textContent = '';
      inputs[k].setAttribute('aria-invalid', 'false');
      inputs[k].removeAttribute('aria-describedby');
    }
    formError.hidden = true;
    formError.textContent = '';
  };
  const add = button({ label: 'إضافة', icon: 'plus', variant: 'secondary', size: 'sm', type: 'submit', doc });
  const form = el('form', { className: 'st-gl__add', attrs: { 'aria-label': 'إضافة مصطلح' }, children: [...fields, el('div', { className: 'st-gl__submit', children: [add], doc }), formError], doc });
  form.addEventListener('submit', async (e) => {
    e.preventDefault?.();
    clearErrors();
    const terms = getPrefs().glossary.terms;
    let r = termDraft({ source: inputs.source.value, target: inputs.target.value, note: inputs.note.value }, terms);
    // المكرر والحد يُفحصان مرة ثانية على المخزَّن نفسه: صفحة أخرى لم يصل إشعارها ربما أضافت المصطلح أو ملأت القاموس.
    const saved = r.ok ? await addTerm(r.term, listMark) : null;
    if (r.ok && !saved) return;
    if (saved && !saved.added) r = saved.reason === 'duplicate' ? { ok: false, code: 'PG_TERM_DUPLICATE', field: 'source' } : { ok: false, code: 'PG_TERM_LIMIT', field: null };
    if (!r.ok) {
      if (r.field) {
        errors[r.field].textContent = messageFor(r.code);
        errors[r.field].hidden = false;
        inputs[r.field].setAttribute('aria-invalid', 'true');
        inputs[r.field].setAttribute('aria-describedby', errors[r.field].id);
        inputs[r.field].focus?.();
      } else {
        formError.textContent = messageFor(r.code);
        formError.hidden = false;
      }
      return;
    }
    for (const k of Object.keys(inputs)) inputs[k].value = '';
    listMark.flash(messageFor('PG_TERM_ADDED'), 'success');
    inputs.source.focus?.();
  });

  function rowOf(term) {
    const remove = button({
      label: `حذف المصطلح ${term.source}`, iconOnly: true, icon: 'trash', variant: 'ghost', size: 'sm', title: 'حذف', doc,
      onClick: async () => {
        if (await removeTerm(term.source, listMark)) listMark.flash(messageFor('PG_TERM_REMOVED'), 'success');
      },
    });
    return el('tr', {
      children: [
        el('td', { className: 'st-gl__source', text: term.source, dir: 'ltr', attrs: { lang: 'en' }, doc }),
        el('td', { className: 'st-gl__target', text: term.target, dir: 'rtl', doc }),
        el('td', { className: 'st-gl__note', text: term.note ?? '', dir: 'auto', doc }),
        el('td', { className: 'st-gl__del', children: [remove], doc }),
      ],
      doc,
    });
  }

  function sync() {
    const g = getPrefs().glossary;
    attach.checked = g.attach;
    counter.textContent = glossaryCounter(g.terms.length);
    body.replaceChildren(...g.terms.map(rowOf));
    tableWrap.hidden = !g.terms.length;
    empty.hidden = Boolean(g.terms.length);
    const full = g.terms.length >= GLOSSARY_LIMITS.maxTerms;
    add.setAttribute('aria-disabled', full ? 'true' : 'false');
    add.title = full ? messageFor('PG_TERM_LIMIT') : '';
  }

  return {
    attachRow, counter, list: el('div', { className: 'st-gl', children: [tableWrap, empty, form], doc }),
    inputs, form, sync,
  };
}
