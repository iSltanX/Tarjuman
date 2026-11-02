// بُناة DOM للمكوّنات المشتركة بين صفحات الإضافة. textContent وsetAttribute فقط، ولا HTML نصي أبدًا (فحص ثابت).
// هنا: الأيقونات، والزر، والحقل، والشارة، والتنبيه، والحالة الفارغة، وحوار التأكيد، والشريط العلوي، ومجموعة الاختيار،
// ورقائق التصفية، ومحدد الترجمات الموجودة. القائمة المنسدلة في menu.js، والشعار في logo.js.

import { logo } from './logo.js';

const SVG = 'http://www.w3.org/2000/svg';

/** أيقونات بخط 2px على شبكة 24 بنمط Lucide. الاتجاهية منها (external, chevron) تُقلب بالـCSS عند الحاجة لا هنا. */
export const ICONS = Object.freeze({
  info: [['circle', { cx: 12, cy: 12, r: 10 }], ['path', { d: 'M12 16v-4' }], ['path', { d: 'M12 8h.01' }]],
  warning: [['path', { d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3' }], ['path', { d: 'M12 9v4' }], ['path', { d: 'M12 17h.01' }]],
  success: [['path', { d: 'M22 11.08V12a10 10 0 1 1-5.93-9.14' }], ['path', { d: 'm9 11 3 3L22 4' }]],
  danger: [['circle', { cx: 12, cy: 12, r: 10 }], ['path', { d: 'm15 9-6 6' }], ['path', { d: 'm9 9 6 6' }]],
  editor: [['path', { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' }], ['path', { d: 'M14 2v4a2 2 0 0 0 2 2h4' }], ['path', { d: 'M16 13H8' }], ['path', { d: 'M16 17H8' }]],
  library: [['path', { d: 'm16 6 4 14' }], ['path', { d: 'M12 6v14' }], ['path', { d: 'M8 8v12' }], ['path', { d: 'M4 4v16' }]],
  settings: [['path', { d: 'M20 7h-9' }], ['path', { d: 'M14 17H5' }], ['circle', { cx: 17, cy: 17, r: 3 }], ['circle', { cx: 7, cy: 7, r: 3 }]],
  screen: [['rect', { x: 3, y: 4, width: 18, height: 13, rx: 2 }], ['path', { d: 'M7 13h10' }], ['path', { d: 'M9 10h6' }], ['path', { d: 'M8 21h8' }]],
  external: [['path', { d: 'M15 3h6v6' }], ['path', { d: 'M10 14 21 3' }], ['path', { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' }]],
  edit: [['path', { d: 'M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z' }], ['path', { d: 'm15 5 4 4' }]],
  replace: [['path', { d: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8' }], ['path', { d: 'M21 3v5h-5' }], ['path', { d: 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16' }], ['path', { d: 'M8 16H3v5' }]],
  download: [['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }], ['path', { d: 'm7 10 5 5 5-5' }], ['path', { d: 'M12 15V3' }]],
  upload: [['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }], ['path', { d: 'm17 8-5-5-5 5' }], ['path', { d: 'M12 3v12' }]],
  chevron: [['path', { d: 'm6 9 6 6 6-6' }]],
  copy: [['rect', { x: 8, y: 8, width: 14, height: 14, rx: 2 }], ['path', { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' }]],
  check: [['path', { d: 'M20 6 9 17l-5-5' }]],
  more: [['circle', { cx: 12, cy: 12, r: 1 }], ['circle', { cx: 19, cy: 12, r: 1 }], ['circle', { cx: 5, cy: 12, r: 1 }]],
  trash: [['path', { d: 'M3 6h18' }], ['path', { d: 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6' }], ['path', { d: 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2' }], ['path', { d: 'M10 11v6' }], ['path', { d: 'M14 11v6' }]],
  search: [['circle', { cx: 11, cy: 11, r: 8 }], ['path', { d: 'm21 21-4.3-4.3' }]],
  restore: [['path', { d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' }], ['path', { d: 'M3 3v5h5' }]],
  clipboard: [['rect', { x: 8, y: 2, width: 8, height: 4, rx: 1 }], ['path', { d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' }]],
  alert: [['circle', { cx: 12, cy: 12, r: 10 }], ['path', { d: 'M12 8v4' }], ['path', { d: 'M12 16h.01' }]],
  x: [['path', { d: 'M18 6 6 18' }], ['path', { d: 'm6 6 12 12' }]],
  play: [['path', { d: 'm6 3 14 9-14 9V3z' }]],
  video: [['path', { d: 'm22 8-6 4 6 4V8Z' }], ['rect', { x: 2, y: 6, width: 14, height: 12, rx: 2 }]],
  folder: [['path', { d: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z' }]],
  clock: [['circle', { cx: 12, cy: 12, r: 10 }], ['path', { d: 'M12 6v6l4 2' }]],
  type: [['path', { d: 'M4 7V4h16v3' }], ['path', { d: 'M9 20h6' }], ['path', { d: 'M12 4v16' }]],
  shield: [['path', { d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z' }]],
  sliders: [['path', { d: 'M4 21v-7' }], ['path', { d: 'M4 10V3' }], ['path', { d: 'M12 21v-9' }], ['path', { d: 'M12 8V3' }], ['path', { d: 'M20 21v-5' }], ['path', { d: 'M20 12V3' }], ['path', { d: 'M1 14h6' }], ['path', { d: 'M9 8h6' }], ['path', { d: 'M17 16h6' }]],
  captions: [['rect', { x: 2, y: 5, width: 20, height: 14, rx: 2 }], ['path', { d: 'M7 13h4' }], ['path', { d: 'M15 13h2' }], ['path', { d: 'M7 17h2' }], ['path', { d: 'M13 17h4' }]],
  'hard-drive': [['path', { d: 'M22 12H2' }], ['path', { d: 'M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z' }], ['path', { d: 'M6 16h.01' }], ['path', { d: 'M10 16h.01' }]],
  activity: [['path', { d: 'M22 12h-4l-3 9L9 3l-3 9H2' }]],
  list: [['path', { d: 'M8 6h13' }], ['path', { d: 'M8 12h13' }], ['path', { d: 'M8 18h13' }], ['path', { d: 'M3 6h.01' }], ['path', { d: 'M3 12h.01' }], ['path', { d: 'M3 18h.01' }]],
  layers: [['path', { d: 'm12 2 9 4.5-9 4.5-9-4.5L12 2Z' }], ['path', { d: 'm3 11.5 9 4.5 9-4.5' }], ['path', { d: 'm3 16.5 9 4.5 9-4.5' }]],
  plus: [['path', { d: 'M5 12h14' }], ['path', { d: 'M12 5v14' }]],
});

export const ICON_NAMES = Object.freeze(Object.keys(ICONS));

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
 * @param {{ className?: string, text?: string, attrs?: Record<string, string>, dir?: 'rtl' | 'ltr' | 'auto', children?: (Node | string | null | false | undefined)[], on?: Record<string, EventListener>, doc?: Document }} [o]
 */
export function el(tag, { className, text, attrs, dir, children, on, doc = document } = {}) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (dir) node.dir = dir;
  for (const [k, v] of Object.entries(attrs ?? {})) if (v !== null && v !== undefined) node.setAttribute(k, v);
  for (const c of children ?? []) if (c !== null && c !== false && c !== undefined) node.append(c);
  for (const [t, fn] of Object.entries(on ?? {})) node.addEventListener(t, fn);
  return node;
}

/**
 * نص LTR معزول (زمن، أو معرّف، أو اسم ملف) داخل واجهة عربية.
 * @param {string} text @param {{ mono?: boolean, doc?: Document }} [o]
 */
export const ltr = (text, { mono = true, doc = document } = {}) => el('bdi', { className: mono ? 'tj-ltr tj-mono' : 'tj-ltr', text, dir: 'ltr', doc });

let seq = 0;
const uid = (p) => `${p}-${++seq}`;

/**
 * زر. المعطّل يبقى قابلًا للتركيز ويذكر سببه دائمًا («معطّل بسبب»). iconOnly يجعل النص اسم وصول فقط.
 * @param {{
 *   label: string, variant?: 'primary' | 'secondary' | 'ghost' | 'danger', size?: 'sm' | 'md' | 'lg',
 *   icon?: keyof typeof ICONS, iconOnly?: boolean, title?: string, className?: string,
 *   disabledReason?: string | null, loading?: boolean, type?: 'button' | 'submit',
 *   value?: string, onClick?: (e: MouseEvent) => void, doc?: Document
 * }} o
 */
export function button({ label, variant = 'secondary', size = 'md', icon: iconName, iconOnly = false, title, className = '', disabledReason = null, loading = false, type = 'button', value, onClick, doc = document }) {
  const b = el('button', {
    className: `tj-btn tj-btn--${variant}${size === 'md' ? '' : ` tj-btn--${size}`}${iconOnly ? ' tj-btn--icon' : ''} ${className}`.trim(),
    attrs: { type, ...(iconOnly ? { 'aria-label': label } : {}) },
    doc,
  });
  if (iconName) b.append(icon(iconName, { doc }));
  if (!iconOnly) b.append(el('span', { text: label, doc }));
  if (title || iconOnly) b.title = title ?? label;
  if (value !== undefined) b.value = value;
  if (loading) b.setAttribute('aria-busy', 'true');
  if (disabledReason) {
    b.setAttribute('aria-disabled', 'true');
    b.title = disabledReason;
    const id = uid('tj-reason');
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
  const id = uid('tj-field');
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
  return { root, input, setError };
}

/**
 * تنبيه مضمّن. الخطأ يحمل عنوانًا وسببًا وما يمكن فعله.
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
 * حالة فارغة: أيقونة وجملة وخطوات أو زر.
 * @param {{ title: string, text?: string, steps?: string[], action?: HTMLElement, icon?: keyof typeof ICONS, doc?: Document }} o
 */
export function emptyState({ title, text, steps, action, icon: iconName = 'captions', doc = document }) {
  return el('section', {
    className: 'tj-empty',
    children: [
      icon(iconName, { doc, className: 'tj-icon tj-empty__art' }),
      el('h2', { className: 'tj-empty__title', text: title, doc }),
      text ? el('p', { className: 'tj-empty__text', text, doc }) : null,
      steps?.length ? el('ol', { className: 'tj-empty__steps', children: steps.map((s) => el('li', { text: s, doc })), doc }) : null,
      action ?? null,
    ],
    doc,
  });
}

/**
 * شارة حالة: نقطة ونص (لا معنى باللون وحده). plain بلا نقطة لشارات الملفات.
 * @param {{ tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'edited' | 'brand', text: string, plain?: boolean, title?: string, doc?: Document }} o
 */
export function statusPill({ tone = 'neutral', text, plain = false, title, doc = document }) {
  // الشارة بنقطة مؤشرها الوحيد: علامة «✓» في آخر النص تكرر النقطة («• محفوظ ✓»)، فتُسقط هنا ويبقى النص كما هو في مصدره.
  const shown = plain ? text : String(text).replace(/\s*✓$/, '');
  const p = el('span', { className: `tj-pill${tone === 'neutral' ? '' : ` tj-pill--${tone}`}${plain ? ' tj-pill--plain' : ''}`, text: shown, doc });
  if (title) p.title = title;
  return p;
}

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

/** صفحات الشريط العلوي بروابطها النسبية (من داخل pages/<page>/). */
const NAV_PAGES = Object.freeze([
  { id: 'library', label: 'المحفوظات', href: '../library/index.html' },
  { id: 'settings', label: 'الإعدادات', href: '../settings/index.html' },
]);

/**
 * الشريط العلوي المشترك: الشعار المعتمد (التركيب الأفقي)، وروابط الصفحتين (الحالية بـaria-current)، و«محلي بالكامل».
 * @param {{ active: 'library' | 'settings' | 'editor' | null, doc?: Document }} o
 */
export function topbar({ active, doc = document }) {
  return el('header', {
    className: 'tj-topbar',
    children: [el('div', {
      className: 'tj-topbar__inner',
      children: [
        el('a', { className: 'tj-topbar__brand', attrs: { href: NAV_PAGES[0].href, 'aria-label': 'ترجمان — المحفوظات' }, children: [logo({ height: 24, label: null, doc })], doc }),
        el('nav', {
          className: 'tj-topbar__nav', attrs: { 'aria-label': 'صفحات ترجمان' },
          children: NAV_PAGES.map((p) => el('a', { className: 'tj-topbar__link', text: p.label, attrs: { href: p.href, ...(p.id === active ? { 'aria-current': 'page' } : {}) }, doc })),
          doc,
        }),
        el('span', { className: 'tj-topbar__end', children: [icon('shield', { doc }), el('span', { text: 'محلي بالكامل', doc })], doc }),
      ],
      doc,
    })],
    doc,
  });
}

/**
 * مجموعة اختيار واحد (radio) بخيارات ذات شرح، وخيار معطّل يذكر سببه، وعنصر إضافي تحت الخيار (حقل مثلًا).
 * @param {{
 *   legend: string, options: { value: string, label: string, hint?: string, disabledReason?: string | null, extra?: HTMLElement | null }[],
 *   value?: string, onChange?: (value: string) => void, doc?: Document
 * }} o
 * @returns {{ root: HTMLElement, value: () => string, set: (v: string) => void, inputs: HTMLInputElement[] }}
 */
export function choiceGroup({ legend, options, value = options[0]?.value, onChange, doc = document }) {
  const name = uid('tj-choice');
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
      onChange?.(o.value);
    });
    return input;
  });
  const root = el('fieldset', {
    className: 'tj-choice',
    children: [
      el('legend', { className: 'tj-sr-only', text: legend, doc }),
      ...options.map((o, i) => el('label', {
        className: 'tj-choice__option',
        attrs: o.disabledReason ? { title: o.disabledReason } : {},
        children: [inputs[i], el('span', {
          className: 'tj-choice__text',
          children: [
            el('span', { className: 'tj-choice__label', text: o.label, doc }),
            o.hint || o.disabledReason ? el('span', { className: 'tj-choice__hint', text: o.disabledReason ?? o.hint, doc }) : null,
            o.extra ? el('span', { className: 'tj-choice__extra', children: [o.extra], doc }) : null,
          ],
          doc,
        })],
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
 * رقائق تصفية بخيار واحد مضغوط (aria-pressed) وأعداد اختيارية.
 * @param {{ options: { value: string, label: string, count?: number | null }[], value: string, onChange: (value: string) => void, ariaLabel: string, doc?: Document }} o
 * @returns {{ root: HTMLElement, set: (value: string) => void, setCounts: (counts: Record<string, number>) => void }}
 */
export function chipGroup({ options, value, onChange, ariaLabel, doc = document }) {
  let current = value;
  /** اسم الوصول: «الكل (3)»؛ العدد جزء من الاسم لا نصًا ملتصقًا بالتسمية. */
  const name = (o, n) => (n === null || n === undefined || n === '' ? o.label : `${o.label} (${n})`);
  const chips = options.map((o) => {
    const count = el('span', { className: 'tj-chip__count', text: o.count === null || o.count === undefined ? '' : String(o.count), attrs: { 'aria-hidden': 'true' }, doc });
    const b = el('button', { className: 'tj-chip', attrs: { type: 'button', 'aria-pressed': o.value === current ? 'true' : 'false', 'data-filter': o.value, 'aria-label': name(o, o.count) }, children: [el('span', { text: o.label, attrs: { 'aria-hidden': 'true' }, doc }), count], doc });
    b.addEventListener('click', () => {
      if (current === o.value) return;
      set(o.value);
      onChange(o.value);
    });
    return { o, b, count };
  });
  function set(v) {
    current = v;
    for (const c of chips) c.b.setAttribute('aria-pressed', c.o.value === v ? 'true' : 'false');
  }
  return {
    root: el('div', { className: 'tj-chips', attrs: { role: 'group', 'aria-label': ariaLabel }, children: chips.map((c) => c.b), doc }),
    set,
    setCounts(counts) {
      for (const c of chips) {
        const n = counts[c.o.value];
        c.count.textContent = n === undefined ? '' : String(n);
        c.b.setAttribute('aria-label', name(c.o, n));
      }
    },
  };
}

/**
 * @typedef {{ n: 1 | 2 | 3, filled: boolean, active: boolean, name?: string | null }} SlotModel
 */

/** اسم الوصول لخانة: «الترجمة 2، نشطة» أو «الترجمة 3، فارغة». @param {SlotModel} s */
export const slotLabel = (s) => `الترجمة ${s.n}${s.active ? '، نشطة' : s.filled ? '' : '، فارغة'}`;

/**
 * محدد الترجمات الموجودة (جولة الصقل): زر لكل خانة محفوظة فقط، برقم خانتها (هويتها الثابتة في المشغّل والمحفوظات
 * والمحرّر)، والنشطة بلون الإبراز؛ ويختفي كله حين لا تكون إلا ترجمة واحدة أو لا شيء. لا خانات فارغة معروضة. يُعاد بناؤه
 * عند الإضافة والحذف والاستبدال بـupdate، ويبقى الربط برقم الخانة لا بموضع الزر.
 * @param {{ slots: SlotModel[], size?: 'sm' | 'md', ariaLabel?: string, onSelect?: (n: number) => void, doc?: Document }} o
 * @returns {{ root: HTMLElement, update: (slots: SlotModel[]) => void, readonly buttons: HTMLButtonElement[], button: (n: number) => HTMLButtonElement | null }}
 */
export function slotPicker({ slots, size = 'sm', ariaLabel = 'الترجمة النشطة', onSelect, doc = document }) {
  const root = el('div', { className: `tj-slots${size === 'md' ? ' tj-slots--md' : ''}`, attrs: { role: 'radiogroup', 'aria-label': ariaLabel }, doc });
  /** @type {Map<number, HTMLButtonElement>} */
  const byN = new Map();
  const make = (n) => {
    const b = el('button', { className: 'tj-slots__slot', text: String(n), attrs: { type: 'button', role: 'radio', 'data-slot': String(n), 'data-filled': 'true' }, doc });
    b.addEventListener('click', () => {
      if (b.getAttribute('aria-checked') === 'true') return;
      onSelect?.(n);
    });
    return b;
  };
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const list = [...root.children];
    const at = list.indexOf(doc.activeElement);
    if (at === -1 || list.length < 2) return;
    e.preventDefault();
    // الأرقام تُقرأ من اليسار (LTR كخط الأعداد): السهم الأيمن إلى الرقم التالي.
    list[((at + (e.key === 'ArrowRight' ? 1 : -1)) % list.length + list.length) % list.length].focus();
  });
  function update(list) {
    const shown = list.filter((s) => s.filled).sort((a, b) => a.n - b.n);
    for (const [n, b] of byN) {
      if (!shown.some((s) => s.n === n)) {
        b.remove();
        byN.delete(n);
      }
    }
    const focusN = (shown.find((s) => s.active) ?? shown[0])?.n ?? null;
    for (const s of shown) {
      let b = byN.get(s.n);
      if (!b) {
        b = make(s.n);
        byN.set(s.n, b);
      }
      b.setAttribute('aria-checked', s.active ? 'true' : 'false');
      b.setAttribute('aria-label', slotLabel(s));
      b.title = s.name ? `${slotLabel(s)} — ${s.name}` : slotLabel(s);
      b.tabIndex = s.n === focusN ? 0 : -1;
      root.append(b);
    }
    root.hidden = shown.length < 2;
  }
  update(slots);
  return {
    root, update,
    get buttons() { return /** @type {HTMLButtonElement[]} */ ([...root.children]); },
    button: (n) => byN.get(n) ?? null,
  };
}
