// عناصر النماذج المشتركة (عقد interfaces §١٥): رُفعت من صفحة الإعدادات (P7) إلى src/ui في الإصدار الثاني بأصناف tj-.
// المقطّعة بأزرار radio حقيقية، وحقل رقمي بوحدة وتحقق عند الإتمام، وعلامة «حُفظ» العابرة. DOM وtextContent فقط.
// الصفحات الحالية تبقي نسخها المحلية حتى تلمسها مراحل W7.
import { messageFor } from '../core/errors/index.js';
import { el } from './components.js';

let seq = 0;
const uid = (p) => `${p}-${++seq}`;

export const SAVED_MS = 2000;

/**
 * علامة نتيجة الحفظ: «حُفظ» أو خطأ، وتختفي بعد ثانيتين (والخطأ بعد ست). منطقة حيّة فيعلنها قارئ الشاشة.
 * @param {{ doc?: Document, setTimer?: (fn: () => void, ms: number) => unknown, clearTimer?: (id: unknown) => void }} [env]
 * @returns {{ root: HTMLElement, flash: (text: string, tone?: 'success' | 'danger') => void }}
 */
export function savedMark({ doc = document, setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id) } = {}) {
  const root = el('span', { className: 'tj-saved', attrs: { role: 'status', 'aria-live': 'polite' }, doc });
  let timer = null;
  return {
    root,
    flash(text, tone = 'success') {
      if (timer !== null) clearTimer(timer);
      root.className = `tj-saved tj-saved--${tone}`;
      root.textContent = text;
      timer = setTimer(() => {
        timer = null;
        root.className = 'tj-saved';
        root.textContent = '';
      }, tone === 'danger' ? SAVED_MS * 3 : SAVED_MS);
    },
  };
}

/**
 * مقطّعة: خيار واحد من عدة، بأزرار radio (أسهم لوحة المفاتيح من المتصفح نفسه). `set` يغيّر المختار بلا onChange.
 * @param {{
 *   legend: string, options: { value: string, label: string, disabledReason?: string | null }[], value: string,
 *   onChange: (value: string) => void, doc?: Document, className?: string
 * }} o
 * @returns {{ root: HTMLElement, set: (value: string) => void, value: () => string, inputs: HTMLInputElement[] }}
 */
export function segmented({ legend, options, value, onChange, doc = document, className = '' }) {
  const name = uid('tj-seg');
  let current = value;
  const inputs = options.map((o) => {
    const input = el('input', { attrs: { type: 'radio', name, value: o.value }, doc });
    input.checked = o.value === current;
    if (o.disabledReason) {
      input.disabled = true;
      input.setAttribute('aria-disabled', 'true');
    }
    input.addEventListener('change', () => {
      if (!input.checked || current === o.value) return;
      current = o.value;
      onChange(o.value);
    });
    return input;
  });
  const root = el('fieldset', {
    className: `tj-seg ${className}`.trim(),
    children: [
      el('legend', { className: 'tj-sr-only', text: legend, doc }),
      ...options.map((o, i) => el('label', {
        className: 'tj-seg__option',
        attrs: o.disabledReason ? { title: o.disabledReason } : {},
        children: [inputs[i], el('span', { className: 'tj-seg__label', text: o.label, doc })],
        doc,
      })),
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
 * `parse` يعيد { ok, value } أو { ok:false, code }؛ الخطأ يظهر تحت الحقل ولا يُستدعى `commit`. `set` لا يمسّ الحقل وهو
 * مركَّز (فلا تُمحى كتابة المستخدم بتحديث من سياق آخر) إلا بـ`force`؛ وحين يغيّر القيمة فعلًا يمسح خطأ التحقق القديم.
 * @param {{
 *   label: string, hint?: string, unit?: string, value: string, parse: (text: string) => { ok: true, value: number } | { ok: false, code: string },
 *   commit: (value: number) => Promise<unknown> | unknown, mark?: HTMLElement | null, disabled?: boolean, doc?: Document
 * }} o
 * @returns {{ root: HTMLElement, input: HTMLInputElement, set: (text: string, opts?: { force?: boolean }) => void, setError: (code: string | null) => void }}
 */
export function numberField({ label, hint, unit, value, parse, commit, mark = null, disabled = false, doc = document }) {
  const id = uid('tj-num');
  const input = el('input', { className: 'tj-field__input tj-field__input--mono tj-num__input', attrs: { id, type: 'text', inputmode: 'numeric', autocomplete: 'off', spellcheck: 'false' }, dir: 'ltr', doc });
  input.value = value;
  input.disabled = disabled;
  const hintEl = hint ? el('span', { className: 'tj-field__hint', text: hint, attrs: { id: `${id}-hint` }, doc }) : null;
  const errEl = el('span', { className: 'tj-field__error', attrs: { id: `${id}-error`, role: 'alert' }, doc });
  errEl.hidden = true;
  const root = el('div', {
    className: 'tj-field tj-num',
    children: [
      el('div', { className: 'tj-num__head', children: [el('label', { className: 'tj-field__label', text: label, attrs: { for: id }, doc }), mark], doc }),
      el('div', { className: 'tj-num__box', children: [input, unit ? el('span', { className: 'tj-num__unit', text: unit, doc }) : null], doc }),
      hintEl, errEl,
    ],
    doc,
  });
  const setError = (errorCode) => {
    errEl.textContent = errorCode ? messageFor(errorCode) : '';
    errEl.hidden = !errorCode;
    root.classList.toggle('tj-field--error', Boolean(errorCode));
    input.setAttribute('aria-invalid', errorCode ? 'true' : 'false');
    input.setAttribute('aria-describedby', [hintEl && hintEl.id, errorCode && errEl.id].filter(Boolean).join(' '));
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
