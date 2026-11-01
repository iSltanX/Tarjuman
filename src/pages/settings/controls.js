// عناصر نماذج الإعدادات (figma-design-brief §١٤.٢): مقطّعة (Segmented) بأزرار radio حقيقية، وحقل رقمي بوحدة وتحقق عند
// الإتمام، وعلامة «حُفظ» العابرة بجانب كل خيار. كلها DOM وtextContent فقط، وتُبنى داخل الصفحة وتُطلب ترقيتها إلى
// src/ui بمسار الاستثناء (sharedRequests).
import { messageFor } from '../../core/errors/index.js';
import { el } from '../../ui/components.js';

let seq = 0;
const uid = (p) => `${p}-${++seq}`;

export const SAVED_MS = 2000;

/**
 * علامة نتيجة الحفظ بجانب الخيار: «حُفظ» أو خطأ، وتختفي بعد ثانيتين. منطقة حيّة فيعلنها قارئ الشاشة.
 * @param {{ doc?: Document, setTimer?: (fn: () => void, ms: number) => unknown, clearTimer?: (id: unknown) => void }} [env]
 * @returns {{ root: HTMLElement, flash: (text: string, tone?: 'success' | 'danger') => void }}
 */
export function savedMark({ doc = document, setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id) } = {}) {
  const root = el('span', { className: 'st-saved', attrs: { role: 'status', 'aria-live': 'polite' }, doc });
  let timer = null;
  return {
    root,
    flash(text, tone = 'success') {
      if (timer !== null) clearTimer(timer);
      root.className = `st-saved st-saved--${tone}`;
      root.textContent = text;
      timer = setTimer(() => {
        timer = null;
        root.className = 'st-saved';
        root.textContent = '';
      }, tone === 'danger' ? SAVED_MS * 3 : SAVED_MS);
    },
  };
}

/**
 * مقطّعة: خيار واحد من عدة، بأزرار radio (أسهم لوحة المفاتيح من المتصفح نفسه). `set` يغيّر المختار بلا استدعاء onChange.
 * @param {{
 *   legend: string, options: { value: string, label: string }[], value: string, onChange: (value: string) => void,
 *   doc?: Document, className?: string
 * }} o
 * @returns {{ root: HTMLElement, set: (value: string) => void, value: () => string, inputs: HTMLInputElement[] }}
 */
export function segmented({ legend, options, value, onChange, doc = document, className = '' }) {
  const name = uid('st-seg');
  let current = value;
  const inputs = options.map((o) => {
    const input = el('input', { attrs: { type: 'radio', name, value: o.value }, doc });
    input.checked = o.value === current;
    input.addEventListener('change', () => {
      if (!input.checked || current === o.value) return;
      current = o.value;
      onChange(o.value);
    });
    return input;
  });
  const root = el('fieldset', {
    className: `st-seg ${className}`.trim(),
    children: [
      el('legend', { className: 'tj-sr-only', text: legend, doc }),
      ...options.map((o, i) => el('label', { className: 'st-seg__option', children: [inputs[i], el('span', { className: 'st-seg__label', text: o.label, doc })], doc })),
    ],
    doc,
  });
  return {
    root, inputs, value: () => current,
    set(v) {
      current = v;
      inputs.forEach((input, i) => { input.checked = options[i].value === v; });
    },
  };
}

/**
 * حقل رقمي بنص (لا type=number، فيقبل الأرقام الهندية) ووحدة بعده. يُتمّ عند `change` (إلغاء التركيز أو Enter):
 * `parse` يعيد { ok, value } أو { ok:false, code }؛ الخطأ يظهر تحت الحقل ولا يُستدعى `commit`. `set` لا يمسّ الحقل
 * وهو مركَّز (كي لا تُمحى كتابة المستخدم بتحديث من سياق آخر) إلا بـ`force` (بعد فشل حفظ ما كُتب فيه فيعود إلى المحفوظ)؛
 * وحين يغيّر القيمة فعلًا يمسح خطأ التحقق القديم فلا يبقى بجانب قيمة صالحة.
 * @param {{
 *   label: string, hint?: string, unit?: string, value: string, parse: (text: string) => { ok: true, value: number } | { ok: false, code: string },
 *   commit: (value: number) => Promise<unknown> | unknown, mark?: HTMLElement | null, doc?: Document
 * }} o
 * @returns {{ root: HTMLElement, input: HTMLInputElement, set: (text: string, opts?: { force?: boolean }) => void, setError: (code: string | null) => void }}
 */
export function numberField({ label, hint, unit, value, parse, commit, mark = null, doc = document }) {
  const id = uid('st-num');
  const input = el('input', { className: 'tj-field__input tj-field__input--mono st-num__input', attrs: { id, type: 'text', inputmode: 'numeric', autocomplete: 'off', spellcheck: 'false' }, dir: 'ltr', doc });
  input.value = value;
  const hintEl = hint ? el('span', { className: 'tj-field__hint', text: hint, attrs: { id: `${id}-hint` }, doc }) : null;
  const errEl = el('span', { className: 'tj-field__error', attrs: { id: `${id}-error`, role: 'alert' }, doc });
  errEl.hidden = true;
  const root = el('div', {
    className: 'tj-field st-num',
    children: [
      el('div', { className: 'st-num__head', children: [el('label', { className: 'tj-field__label', text: label, attrs: { for: id }, doc }), mark], doc }),
      el('div', { className: 'st-num__box', children: [input, unit ? el('span', { className: 'st-num__unit', text: unit, doc }) : null], doc }),
      hintEl, errEl,
    ],
    doc,
  });
  const setError = (code) => {
    errEl.textContent = code ? messageFor(code) : '';
    errEl.hidden = !code;
    root.classList.toggle('tj-field--error', Boolean(code));
    input.setAttribute('aria-invalid', code ? 'true' : 'false');
    input.setAttribute('aria-describedby', [hintEl && hintEl.id, code && errEl.id].filter(Boolean).join(' '));
  };
  setError(null);
  input.addEventListener('change', async () => {
    const parsed = parse(input.value);
    if (!parsed.ok) {
      setError(parsed.code);
      return;
    }
    setError(null);
    await commit(parsed.value);
  });
  return {
    root, input, setError,
    set(text, { force = false } = {}) {
      if (doc.activeElement === input && !force) return;
      if (input.value !== text) setError(null);
      input.value = text;
    },
  };
}
