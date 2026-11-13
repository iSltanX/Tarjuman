// بطاقة «المصطلحات» (R62، P13-AC7، مواصفة التصميم §١٩.٨): جدول (الإنجليزية · العربية المفضّلة · ملاحظة) بإضافة وحذف،
// وعدّاد «12 من 100»، ومفتاح «أرفق القاموس بتعليمات الترجمة». الحفظ فوري في التفضيلات (prefs.glossary) بتحقق النموذج
// نفسه، والقاموس يُرفق بالنص نفسه أينما نُسخت التعليمات (instructions في P11). DOM وtextContent فقط.
// ومنذ الفكرة ٨ (ح-45 وح-47): قوائم لكل زوج لغتين بجانب القاموس العام (المفتاح glossaries)، بمحدد «القاموس: عام / ‹من› ← ‹إلى›» فوق
// الجدول نفسه، مخفيٍّ حتى تُنشأ أول قائمة فلا تتغير التجربة لمن يكفيه العام، و«+ زوج» ينشئها، وحذف القائمة بتأكيد، وسطر «يُرسل أول
// 100» حين يزيد ما يُرفق لزوج على الحد. والجدول والإضافة والحذف للقائمة المختارة.
import { getLocale, t } from '../../i18n/index.js';
import { describeLang, textDirection } from '../../core/lang/index.js';
import { messageFor } from '../../core/errors/index.js';
import { GLOSSARY_LIMITS } from '../../core/model/prefs.js';
import { ANY_SOURCE, DEFAULT_GLOSSARIES, findList, listPair, termsFor } from '../../core/model/glossaries.js';
import { button, chipGroup, el } from '../../ui/components.js';
import { COUNT_FORMS, formatCount } from '../../ui/format.js';
import { AUTO, langPair } from '../../ui/lang-picker.js';
import { glossaryCounter, termDraft } from './model.js';

let seq = 0;

/** قيمة رقاقة القاموس العام في المحدد. */
const GENERAL = 'general';
/** @param {{ from: string, to: string }} p */
const chipValue = (p) => `${p.from}>${p.to}`;

/**
 * @typedef {import('../../core/model/glossaries.js').ListPair} ListPair
 * @typedef {{ glossaries: import('../../core/model/glossaries.js').Glossaries, added?: boolean, removed?: boolean, reason?: string | null, pair?: ListPair | null }} ListResult
 */

/**
 * @param {{
 *   doc: Document, getPrefs: () => import('../../core/model/prefs.js').Prefs,
 *   savePrefs: (patch: object, mark: { flash: Function }) => Promise<unknown>,
 *   addTerm: (term: import('../../core/model/prefs.js').GlossaryTerm, mark: { flash: Function }) => Promise<{ added: boolean, reason: 'duplicate' | 'limit' | null } | null>,
 *   removeTerm: (source: string, mark: { flash: Function }) => Promise<{ removed: boolean } | null>,
 *   attachMark: { root: HTMLElement, flash: Function }, listMark: { root: HTMLElement, flash: Function },
 *   getGlossaries?: () => import('../../core/model/glossaries.js').Glossaries,
 *   lists?: {
 *     add: (pair: ListPair, mark: { flash: Function }) => Promise<ListResult | null>,
 *     remove: (pair: ListPair, mark: { flash: Function }) => Promise<ListResult | null>,
 *     addTerm: (pair: ListPair, term: import('../../core/model/prefs.js').GlossaryTerm, mark: { flash: Function }) => Promise<ListResult | null>,
 *     removeTerm: (pair: ListPair, source: string, mark: { flash: Function }) => Promise<ListResult | null>,
 *   },
 *   confirm?: (o: object) => Promise<boolean>,
 * }} o addTerm وremoveTerm على أحدث تفضيلات بالمفتاح الموحّد لا بقائمة من العرض (تدقيق 7a66f91، U13)؛ وnull عند الفشل. وlists
 *   مثلها لقوائم الأزواج على أحدث قيمة في الكاتب (الفكرة ٨)
 */
export function glossaryControl({ doc, getPrefs, savePrefs, addTerm, removeTerm, attachMark, listMark, getGlossaries = () => DEFAULT_GLOSSARIES, lists = null, confirm = async () => false }) {
  const id = `st-gl-${++seq}`;
  const attach = el('input', { className: 'st-switch__input', attrs: { id: `${id}-attach`, type: 'checkbox', role: 'switch' }, doc });
  attach.addEventListener('change', () => savePrefs({ glossary: { attach: attach.checked } }, attachMark));
  const attachRow = el('label', {
    className: 'st-switch', attrs: { for: `${id}-attach` },
    children: [attach, el('span', { className: 'st-switch__track', attrs: { 'aria-hidden': 'true' }, doc }), el('span', { className: 'st-switch__label', text: t('settings.glossary.attachSwitch'), doc })],
    doc,
  });

  // ---- القائمة المعروضة (الفكرة ٨): null للقاموس العام، وإلا زوج قائمة ----
  /** @type {ListPair | null} */
  let selected = null;
  const selectedList = () => (selected ? findList(getGlossaries(), selected) : null);
  /** مصطلحات القائمة المعروضة. */
  const termsNow = () => selectedList()?.terms ?? getPrefs().glossary.terms;
  const langName = (code) => (code === ANY_SOURCE ? t('settings.glossary.anySource') : describeLang(code, getLocale())?.name ?? code);
  /** «الإنجليزية ← العربية» و«أي لغة ← الفرنسية». @param {ListPair} p */
  const pairText = (p) => t('common.pair', { from: langName(p.from), to: langName(p.to) });

  const counter = el('span', { className: 'tj-pill tj-pill--plain st-gl__count', attrs: { 'aria-live': 'polite' }, doc });
  const body = el('tbody', { doc });
  const table = el('table', {
    className: 'st-gl__table',
    children: [
      el('caption', { className: 'tj-sr-only', text: t('settings.glossary.caption'), doc }),
      el('thead', { children: [el('tr', { children: [t('settings.glossary.colSource'), t('settings.glossary.colTarget'), t('settings.glossary.colNote'), ''].map((h, i) => el('th', { text: h, attrs: { scope: 'col', ...(i === 3 ? { 'aria-label': t('settings.glossary.delete') } : {}) }, doc })), doc })], doc }),
      body,
    ],
    doc,
  });
  const empty = el('p', { className: 'tj-caption st-gl__empty', text: t('settings.glossary.empty'), doc });
  const tableWrap = el('div', { className: 'st-gl__wrap', children: [table], doc });

  // ---- محدد القائمة: «القاموس: عام / ‹من› ← ‹إلى›»، مخفي حتى أول قائمة ----
  const chipsHost = el('div', { className: 'st-gl__chips', doc });
  const listsBar = el('div', { className: 'st-gl__lists', children: [el('span', { className: 'tj-label', text: t('settings.glossary.listPick'), doc }), chipsHost], doc });
  listsBar.hidden = true;
  let chips = null;
  let chipsKey = null;
  const addPairBtn = button({ label: t('settings.glossary.addPair'), icon: 'plus', variant: 'ghost', size: 'sm', doc, onClick: () => openPairForm() });
  addPairBtn.setAttribute('aria-label', t('settings.glossary.addPairAria'));
  addPairBtn.setAttribute('aria-expanded', 'false');
  addPairBtn.setAttribute('aria-controls', `${id}-pair`);
  const removeListBtn = button({ label: t('settings.glossary.removePair'), icon: 'trash', variant: 'ghost', size: 'sm', doc, onClick: () => removeSelected() });
  removeListBtn.hidden = true;
  if (!lists) addPairBtn.hidden = true;
  const head = el('div', { className: 'st-gl__head', children: [listsBar, counter, addPairBtn, removeListBtn], doc });

  // ---- «+ زوج»: نموذج في مكانه، «من» (أو «أي لغة») و«إلى» ----
  let draft = { from: null, to: null };
  const picker = langPair({ from: null, to: null, autoFrom: t('settings.glossary.anySource'), doc, onChange: (p) => { draft = p; pairError.hidden = true; } });
  const pairError = el('p', { className: 'tj-field__error', attrs: { role: 'alert' }, doc });
  pairError.hidden = true;
  const createBtn = button({ label: t('settings.glossary.createPair'), size: 'sm', doc, onClick: () => createPair() });
  const cancelBtn = button({ label: t('common.cancel'), variant: 'ghost', size: 'sm', doc, onClick: () => closePairForm(true) });
  const pairForm = el('div', {
    className: 'st-gl__pair', attrs: { id: `${id}-pair`, role: 'group', 'aria-label': t('settings.glossary.pairForm') },
    children: [picker.root, el('p', { className: 'tj-caption', text: t('settings.glossary.pairHint'), doc }), el('div', { className: 'st-actions', children: [createBtn, cancelBtn], doc }), pairError],
    doc,
  });
  pairForm.hidden = true;
  function openPairForm() {
    draft = { from: null, to: null };
    picker.set(draft);
    pairError.hidden = true;
    pairForm.hidden = false;
    addPairBtn.setAttribute('aria-expanded', 'true');
    picker.fromField.field.focus?.();
  }
  function closePairForm(focusBack) {
    pairForm.hidden = true;
    addPairBtn.setAttribute('aria-expanded', 'false');
    if (focusBack) addPairBtn.focus?.();
  }
  const pairFails = (code) => {
    pairError.textContent = messageFor(code);
    pairError.hidden = false;
  };
  async function createPair() {
    const from = draft.from === AUTO ? ANY_SOURCE : draft.from;
    if (!from || !draft.to) return pairFails('PG_LIST_PAIR_MISSING');
    if (!listPair({ from, to: draft.to })) return pairFails('PG_LIST_PAIR_SAME');
    const r = await lists.add({ from, to: draft.to }, listMark);
    if (!r) return undefined;
    if (!r.added && r.reason !== 'duplicate') return pairFails(r.reason === 'limit' ? 'PG_LIST_LIMIT' : 'PG_LIST_PAIR_SAME');
    // الموجودة تُختار كما تُختار الجديدة.
    selected = r.pair;
    closePairForm(false);
    listMark.flash(messageFor(r.added ? 'PG_LIST_ADDED' : 'PG_LIST_EXISTS'), r.added ? 'success' : 'info');
    sync();
    inputs.source.focus?.();
    return undefined;
  }

  async function removeSelected() {
    const list = selectedList();
    if (!list || !lists) return;
    const n = list.terms.length;
    const ok = await confirm({
      title: t('settings.glossary.removeTitle', { pair: pairText(list) }),
      body: t('settings.glossary.removeBody', { n, count: formatCount(n, COUNT_FORMS.term) }),
      confirmLabel: t('settings.glossary.removeConfirm'), tone: 'danger', doc,
    });
    if (!ok) return;
    if (!(await lists.remove({ from: list.from, to: list.to }, listMark))) return;
    selected = null;
    listMark.flash(messageFor('PG_LIST_REMOVED'), 'success');
    sync();
    // الزر زال مع القائمة: التركيز إلى رقاقة القاموس العام إن بقي المحدد، وإلا إلى «+ زوج».
    (chipOf(GENERAL) ?? addPairBtn).focus?.();
  }

  // حقول الإضافة: كل حقل بتسميته، والخطأ تحت الحقل المعني.
  const inputs = {};
  const errors = {};
  const fieldOf = (key, label, max, dir) => {
    const fid = `${id}-${key}`;
    inputs[key] = el('input', { className: 'tj-field__input', attrs: { id: fid, type: 'text', autocomplete: 'off', spellcheck: key === 'source' ? 'false' : 'true', maxlength: String(max), 'data-tj-keep': `settings.glossary.${key}` }, dir, doc });
    errors[key] = el('span', { className: 'tj-field__error', attrs: { id: `${fid}-error`, role: 'alert' }, doc });
    errors[key].hidden = true;
    return el('div', { className: `tj-field st-gl__field st-gl__field--${key}`, children: [el('label', { className: 'tj-field__label', text: label, attrs: { for: fid }, doc }), inputs[key], errors[key]], doc });
  };
  const fields = [
    fieldOf('source', t('settings.glossary.colSource'), GLOSSARY_LIMITS.maxSource, 'auto'),
    fieldOf('target', t('settings.glossary.colTarget'), GLOSSARY_LIMITS.maxTarget, 'auto'),
    fieldOf('note', t('settings.glossary.fieldNote'), GLOSSARY_LIMITS.maxNote, 'auto'),
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
  /** رسائل المكرر والحد بلفظ القائمة حين تكون المعروضة قائمة زوج. */
  const codeFor = (code) => (selected ? { PG_TERM_DUPLICATE: 'PG_LIST_TERM_DUPLICATE', PG_TERM_LIMIT: 'PG_LIST_TERM_LIMIT' }[code] ?? code : code);
  const add = button({ label: t('settings.glossary.add'), icon: 'plus', variant: 'secondary', size: 'sm', type: 'submit', doc });
  const form = el('form', { className: 'st-gl__add', attrs: { 'aria-label': t('settings.glossary.addForm') }, children: [...fields, el('div', { className: 'st-gl__submit', children: [add], doc }), formError], doc });
  form.addEventListener('submit', async (e) => {
    e.preventDefault?.();
    clearErrors();
    const list = selectedList();
    let r = termDraft({ source: inputs.source.value, target: inputs.target.value, note: inputs.note.value }, termsNow());
    // المكرر والحد يُفحصان مرة ثانية على المخزَّن نفسه: صفحة أخرى لم يصل إشعارها ربما أضافت المصطلح أو ملأت القاموس.
    const saved = r.ok ? await (list && lists ? lists.addTerm({ from: list.from, to: list.to }, r.term, listMark) : addTerm(r.term, listMark)) : null;
    if (r.ok && !saved) return;
    if (saved && !saved.added) {
      if (saved.reason === 'missing') {
        // حُذفت القائمة من صفحة أخرى بين العرض والإضافة: يُعرض القاموس العام، والمصطلح باقٍ في الحقول.
        selected = null;
        sync();
        r = { ok: false, code: 'PG_LIST_GONE', field: null };
      } else r = saved.reason === 'duplicate' ? { ok: false, code: 'PG_TERM_DUPLICATE', field: 'source' } : { ok: false, code: 'PG_TERM_LIMIT', field: null };
    }
    if (!r.ok) {
      const message = messageFor(codeFor(r.code));
      if (r.field) {
        errors[r.field].textContent = message;
        errors[r.field].hidden = false;
        inputs[r.field].setAttribute('aria-invalid', 'true');
        inputs[r.field].setAttribute('aria-describedby', errors[r.field].id);
        inputs[r.field].focus?.();
      } else {
        formError.textContent = message;
        formError.hidden = false;
      }
      return;
    }
    for (const k of Object.keys(inputs)) inputs[k].value = '';
    listMark.flash(messageFor('PG_TERM_ADDED'), 'success');
    inputs.source.focus?.();
  });

  function rowOf(term, i) {
    const remove = button({
      label: t('settings.glossary.remove', { source: term.source }), iconOnly: true, icon: 'trash', variant: 'ghost', size: 'sm', title: t('settings.glossary.delete'), doc,
      onClick: async () => {
        const list = selectedList();
        if (await (list && lists ? lists.removeTerm({ from: list.from, to: list.to }, term.source, listMark) : removeTerm(term.source, listMark))) {
          listMark.flash(messageFor('PG_TERM_REMOVED'), 'success');
          // الزر زال مع صفه: التركيز إلى حذف الصف الذي حلّ محله، أو السابق، أو حقل الإضافة (تدقيق 7a66f91، U58).
          const rows = body.querySelectorAll('button');
          (rows[Math.min(i, rows.length - 1)] ?? inputs.source).focus?.();
        }
      },
    });
    remove.setAttribute('data-term', term.source);
    return el('tr', {
      children: [
        // المصطلح ومقابله بأي لغتين (AA3): اتجاه كلٍّ من نصه، بلا lang مفترض.
        el('td', { className: 'st-gl__source', text: term.source, dir: textDirection(term.source), doc }),
        el('td', { className: 'st-gl__target', text: term.target, dir: textDirection(term.target), doc }),
        el('td', { className: 'st-gl__note', text: term.note ?? '', dir: 'auto', doc }),
        el('td', { className: 'st-gl__del', children: [remove], doc }),
      ],
      doc,
    });
  }

  // سطر «يُرسل أول 100» (الفكرة ٨): ما يُرفق لزوجٍ (قائمته و«أي لغة ← إلى» والقاموس العام بلا تكرار) قد يزيد على الحد فيُقطع.
  const capLine = el('p', { className: 'tj-caption st-gl__cap', attrs: { 'aria-live': 'polite' }, doc });
  capLine.hidden = true;
  function paintCap() {
    const prefs = getPrefs();
    const g = getGlossaries();
    const max = GLOSSARY_LIMITS.maxTerms;
    const totalFor = (l) => termsFor(prefs, g, { source: l.from === ANY_SOURCE ? null : l.from, target: l.to }).total;
    const list = selectedList();
    let text = '';
    if (list) {
      const total = totalFor(list);
      if (total > max) text = t('settings.glossary.sentCap', { max: formatCount(max, COUNT_FORMS.term), count: formatCount(total, COUNT_FORMS.term, { case: 'gen' }) });
    } else if (g.lists.some((l) => totalFor(l) > max)) {
      text = t('settings.glossary.sentCapGeneral', { max: formatCount(max, COUNT_FORMS.term, { case: 'gen' }) });
    }
    capLine.textContent = text;
    capLine.hidden = !text;
  }

  /** رقاقة قائمة في المحدد بقيمتها، إن كان ظاهرًا. @param {string} value */
  const chipOf = (value) => (listsBar.hidden ? null : [...(chips?.root.querySelectorAll('button') ?? [])].find((b) => b.getAttribute('data-filter') === value) ?? null);

  /** المحدد يُبنى حين تتغير القوائم (زوجًا أو عددًا)، وأعداد المصطلحات على رقائقه في كل مزامنة. */
  function paintPicker() {
    const g = getGlossaries();
    listsBar.hidden = g.lists.length === 0;
    const key = JSON.stringify([getLocale(), g.lists.map(chipValue)]);
    if (key !== chipsKey) {
      chipsKey = key;
      const focused = chips?.root.contains(doc.activeElement) ? doc.activeElement.getAttribute?.('data-filter') : null;
      chips = chipGroup({
        options: [{ value: GENERAL, label: t('settings.glossary.listGeneral') }, ...g.lists.map((l) => ({ value: chipValue(l), label: pairText(l) }))],
        value: selected ? chipValue(selectedList() ?? selected) : GENERAL,
        ariaLabel: t('settings.glossary.listRow'),
        onChange: (v) => {
          const l = g.lists.find((x) => chipValue(x) === v);
          selected = v === GENERAL || !l ? null : { from: l.from, to: l.to };
          clearErrors();
          sync();
        },
        doc,
      });
      chipsHost.replaceChildren(chips.root);
      if (focused) chipOf(focused)?.focus?.();
    }
    const list = selectedList();
    chips.set(list ? chipValue(list) : GENERAL);
    chips.setCounts(Object.fromEntries([[GENERAL, getPrefs().glossary.terms.length], ...g.lists.map((l) => [chipValue(l), l.terms.length])]));
    removeListBtn.hidden = !list;
    if (list) removeListBtn.setAttribute('aria-label', t('settings.glossary.removePairAria', { pair: pairText(list) }));
  }

  /** آخر قائمة رُسمت: الجدول يُعاد بناؤه حين تتغير المصطلحات وحدها، لا مع كل حفظ في الصفحة (كان يُسقط تركيز زر حذف، U58). */
  let drawn = null;
  function sync() {
    const g = getPrefs().glossary;
    // قائمة مختارة حُذفت من صفحة أخرى: يُعرض القاموس العام.
    if (selected && !selectedList()) selected = null;
    paintPicker();
    attach.checked = g.attach;
    const terms = termsNow();
    counter.textContent = glossaryCounter(terms.length);
    const key = JSON.stringify([selected ? chipValue(selected) : GENERAL, terms]);
    if (key !== drawn) {
      drawn = key;
      // التركيز على زر حذف مصطلح باقٍ يعود إليه بعد إعادة البناء (تغيّر من تبويب آخر).
      const focused = body.contains(doc.activeElement) ? doc.activeElement.getAttribute?.('data-term') : null;
      body.replaceChildren(...terms.map(rowOf));
      if (focused) [...body.querySelectorAll('button')].find((b) => b.getAttribute('data-term') === focused)?.focus?.();
    }
    tableWrap.hidden = !terms.length;
    empty.textContent = t(selected ? 'settings.glossary.pairEmpty' : 'settings.glossary.empty');
    empty.hidden = Boolean(terms.length);
    const full = terms.length >= GLOSSARY_LIMITS.maxTerms;
    add.setAttribute('aria-disabled', full ? 'true' : 'false');
    add.title = full ? messageFor(codeFor('PG_TERM_LIMIT')) : '';
    paintCap();
  }

  return {
    attachRow, counter, head, list: el('div', { className: 'st-gl', children: [pairForm, capLine, tableWrap, empty, form], doc }),
    inputs, form, sync, pairForm, picker,
    get selected() { return selected; },
    /** يختار قائمة زوج أو القاموس العام (null) كما تفعل رقاقته. @param {ListPair | null} pair */
    select(pair) {
      selected = pair ? listPair(pair) : null;
      clearErrors();
      sync();
    },
  };
}
