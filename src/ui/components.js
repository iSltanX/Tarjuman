// بُناة DOM للمكوّنات الأساسية (figma-design-brief.md §١٤.٢). textContent وsetAttribute فقط، ولا HTML
// نصي أبدًا (فحص ثابت). المكوّن الجديد يُبنى داخل صفحة مرحلته، ثم يُرفع إلى هنا بطلب ملف مشترك.

const SVG = 'http://www.w3.org/2000/svg';

/** أيقونات بخط 2px على شبكة 24 بنمط Lucide (§٣.٤). */
const ICONS = {
  info: [['circle', { cx: 12, cy: 12, r: 10 }], ['path', { d: 'M12 16v-4' }], ['path', { d: 'M12 8h.01' }]],
  warning: [['path', { d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3' }], ['path', { d: 'M12 9v4' }], ['path', { d: 'M12 17h.01' }]],
  success: [['path', { d: 'M22 11.08V12a10 10 0 1 1-5.93-9.14' }], ['path', { d: 'm9 11 3 3L22 4' }]],
  danger: [['circle', { cx: 12, cy: 12, r: 10 }], ['path', { d: 'm15 9-6 6' }], ['path', { d: 'm9 9 6 6' }]],
  editor: [['path', { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' }], ['path', { d: 'M14 2v4a2 2 0 0 0 2 2h4' }], ['path', { d: 'M16 13H8' }], ['path', { d: 'M16 17H8' }]],
  library: [['path', { d: 'm16 6 4 14' }], ['path', { d: 'M12 6v14' }], ['path', { d: 'M8 8v12' }], ['path', { d: 'M4 4v16' }]],
  settings: [['path', { d: 'M20 7h-9' }], ['path', { d: 'M14 17H5' }], ['circle', { cx: 17, cy: 17, r: 3 }], ['circle', { cx: 7, cy: 7, r: 3 }]],
  screen: [['rect', { x: 3, y: 4, width: 18, height: 13, rx: 2 }], ['path', { d: 'M7 13h10' }], ['path', { d: 'M9 10h6' }], ['path', { d: 'M8 21h8' }]],
};

/**
 * @param {keyof typeof ICONS} name
 * @param {{ doc?: Document, className?: string }} [opts]
 */
export function icon(name, { doc = document, className = 'tj-icon' } = {}) {
  const svg = doc.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  for (const [tag, attrs] of ICONS[name] ?? []) {
    const node = doc.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    svg.append(node);
  }
  return svg;
}

/**
 * عنصر بخصائص آمنة.
 * @param {string} tag
 * @param {{ className?: string, text?: string, attrs?: Record<string, string>, dir?: 'rtl' | 'ltr' | 'auto', children?: (Node | string | null | false)[], on?: Record<string, EventListener>, doc?: Document }} [o]
 */
export function el(tag, { className, text, attrs, dir, children, on, doc = document } = {}) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (dir) node.dir = dir;
  for (const [k, v] of Object.entries(attrs ?? {})) node.setAttribute(k, v);
  for (const c of children ?? []) if (c !== null && c !== false && c !== undefined) node.append(c);
  for (const [t, fn] of Object.entries(on ?? {})) node.addEventListener(t, fn);
  return node;
}

/**
 * نص LTR معزول (زمن، أو معرّف، أو اسم ملف) داخل واجهة عربية.
 * @param {string} text @param {{ mono?: boolean, doc?: Document }} [o]
 */
export const ltr = (text, { mono = true, doc = document } = {}) => el('bdi', { className: mono ? 'tj-ltr tj-mono' : 'tj-ltr', text, dir: 'ltr', doc });

/**
 * زر. المعطّل يبقى قابلًا للتركيز ويذكر سببه دائمًا (§١٢ «معطّل بسبب»).
 * @param {{
 *   label: string, variant?: 'primary' | 'secondary' | 'ghost' | 'danger', size?: 'sm' | 'md' | 'lg',
 *   icon?: keyof typeof ICONS, disabledReason?: string | null, loading?: boolean, type?: 'button' | 'submit',
 *   value?: string, onClick?: (e: MouseEvent) => void, doc?: Document
 * }} o
 */
export function button({ label, variant = 'secondary', size = 'md', icon: iconName, disabledReason = null, loading = false, type = 'button', value, onClick, doc = document }) {
  const b = el('button', { className: `tj-btn tj-btn--${variant}${size === 'md' ? '' : ` tj-btn--${size}`}`, attrs: { type }, doc });
  if (iconName) b.append(icon(iconName, { doc }));
  b.append(el('span', { text: label, doc }));
  if (value !== undefined) b.value = value;
  if (loading) b.setAttribute('aria-busy', 'true');
  if (disabledReason) {
    b.setAttribute('aria-disabled', 'true');
    b.title = disabledReason;
    const id = `tj-reason-${Math.random().toString(36).slice(2, 8)}`;
    b.setAttribute('aria-describedby', id);
    b.append(el('span', { className: 'tj-sr-only', text: disabledReason, attrs: { id }, doc }));
  }
  b.addEventListener('click', (e) => {
    if (b.getAttribute('aria-disabled') === 'true' || b.getAttribute('aria-busy') === 'true') {
      e.preventDefault();
      return;
    }
    onClick?.(e);
  });
  return b;
}

/**
 * حقل بتسمية وتلميح وخطأ. الحقل الرقمي أو الزمني يُعرض LTR بخط أحادي.
 * @param {{
 *   label: string, value?: string, type?: 'text' | 'number' | 'search', hint?: string, error?: string,
 *   mono?: boolean, placeholder?: string, disabled?: boolean, onInput?: (value: string) => void, doc?: Document
 * }} o
 * @returns {{ root: HTMLElement, input: HTMLInputElement, setError: (msg: string | null) => void }}
 */
export function field({ label, value = '', type = 'text', hint, error, mono = false, placeholder, disabled = false, onInput, doc = document }) {
  const id = `tj-field-${Math.random().toString(36).slice(2, 8)}`;
  const input = el('input', { className: `tj-field__input${mono ? ' tj-field__input--mono' : ''}`, attrs: { id, type }, doc });
  input.value = value;
  if (placeholder) input.placeholder = placeholder;
  if (mono) input.dir = 'ltr';
  input.disabled = disabled;
  const hintEl = hint ? el('span', { className: 'tj-field__hint', text: hint, attrs: { id: `${id}-hint` }, doc }) : null;
  const errEl = el('span', { className: 'tj-field__error', attrs: { id: `${id}-error`, role: 'alert' }, doc });
  const root = el('div', { className: 'tj-field', children: [el('label', { className: 'tj-field__label', text: label, attrs: { for: id }, doc }), input, hintEl, errEl], doc });
  const setError = (msg) => {
    errEl.textContent = msg ?? '';
    errEl.hidden = !msg;
    root.classList.toggle('tj-field--error', !!msg);
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    input.setAttribute('aria-describedby', [hintEl && hintEl.id, msg && errEl.id].filter(Boolean).join(' '));
  };
  setError(error ?? null);
  if (onInput) input.addEventListener('input', () => onInput(input.value));
  // حقول المشغّل وحدها تحتاج عزل الضغطات عن اختصارات يوتيوب؛ صفحات الإضافة لا اختصارات فيها.
  return { root, input, setError };
}

/**
 * تنبيه مضمّن. الخطأ يحمل عنوانًا وسببًا وما يمكن فعله (§١٢).
 * @param {{ tone?: 'info' | 'success' | 'warning' | 'danger', title?: string, text?: string, action?: HTMLElement, doc?: Document }} o
 */
export function alertBox({ tone = 'info', title, text, action, doc = document }) {
  return el('div', {
    className: `tj-alert tj-alert--${tone}`,
    attrs: { role: tone === 'danger' || tone === 'warning' ? 'alert' : 'status' },
    children: [
      icon(tone, { doc }),
      el('div', { className: 'tj-alert__body', children: [title ? el('strong', { className: 'tj-alert__title', text: title, doc }) : null, text ? el('p', { className: 'tj-alert__text', text, doc }) : null, action ?? null], doc }),
    ],
    doc,
  });
}

/**
 * حالة فارغة: رسم خطي بسيط وجملة وخطوات أو زر.
 * @param {{ title: string, text?: string, steps?: string[], action?: HTMLElement, doc?: Document }} o
 */
export function emptyState({ title, text, steps, action, doc = document }) {
  return el('section', {
    className: 'tj-empty',
    children: [
      icon('screen', { doc, className: 'tj-icon tj-empty__art' }),
      el('h2', { className: 'tj-empty__title', text: title, doc }),
      text ? el('p', { className: 'tj-empty__text', text, doc }) : null,
      steps?.length ? el('ol', { className: 'tj-empty__steps', children: steps.map((s) => el('li', { text: s, doc })), doc }) : null,
      action ?? null,
    ],
    doc,
  });
}

/**
 * شارة حالة: نقطة ونص (لا معنى باللون وحده).
 * @param {{ tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'edited', text: string, doc?: Document }} o
 */
export const statusPill = ({ tone = 'neutral', text, doc = document }) => el('span', { className: `tj-pill${tone === 'neutral' ? '' : ` tj-pill--${tone}`}`, text, doc });

/**
 * حوار تأكيد عبر <dialog>. الزر الخطِر يذكر الفعل. Esc والإلغاء يعيدان false.
 * @param {{ title: string, body?: string, confirmLabel: string, cancelLabel?: string, tone?: 'default' | 'danger', content?: HTMLElement, doc?: Document }} o
 * @returns {Promise<boolean>}
 */
export function confirmDialog({ title, body, confirmLabel, cancelLabel = 'إلغاء', tone = 'default', content, doc = document }) {
  return new Promise((resolve) => {
    const dialog = el('dialog', { className: `tj-dialog${tone === 'danger' ? ' tj-dialog--danger' : ''}`, doc });
    const form = el('form', {
      className: 'tj-dialog__form', attrs: { method: 'dialog' },
      children: [
        el('h2', { className: 'tj-dialog__title', text: title, doc }),
        body ? el('p', { className: 'tj-dialog__body', text: body, doc }) : null,
        content ?? null,
        el('div', {
          className: 'tj-dialog__footer',
          children: [
            button({ label: confirmLabel, variant: tone === 'danger' ? 'danger' : 'primary', type: 'submit', value: 'confirm', doc }),
            button({ label: cancelLabel, variant: 'secondary', type: 'submit', value: 'cancel', doc }),
          ],
          doc,
        }),
      ],
      doc,
    });
    dialog.append(form);
    dialog.addEventListener('close', () => {
      resolve(dialog.returnValue === 'confirm');
      dialog.remove();
    }, { once: true });
    doc.body.append(dialog);
    dialog.showModal();
    form.querySelector('button[value="cancel"]').focus();
  });
}
