// بُناة DOM للمكوّنات المشتركة بين صفحات الإضافة. textContent وsetAttribute فقط، ولا HTML نصي أبدًا (فحص ثابت).
// هنا: الأيقونات، والزر، والحقل، والشارة، والتنبيه، والحالة الفارغة، وحوار التأكيد، والشريط العلوي، ومجموعة الاختيار،
// ورقائق التصفية، ومحدد الترجمات الموجودة. الأيقونات في icons.js، والقائمة المنسدلة في menu.js، والشعار في logo.js.

import { ICONS } from './icons.js';
import { logo } from './logo.js';

export { ICONS };

const SVG = 'http://www.w3.org/2000/svg';

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
  const shown = plain || typeof text !== 'string' ? text : text.replace(/\s*✓$/, '');
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
 * الشريط العلوي المشترك: الشعار المعتمد (التركيب الأفقي)، وروابط الصفحتين (الحالية بـaria-current)، و«بياناتك على جهازك».
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
        el('span', { className: 'tj-topbar__end', children: [icon('shield', { doc }), el('span', { text: 'بياناتك على جهازك', doc })], doc }),
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
    shown.forEach((s, i) => {
      let b = byN.get(s.n);
      if (!b) {
        b = make(s.n);
        byN.set(s.n, b);
      }
      b.setAttribute('aria-checked', s.active ? 'true' : 'false');
      b.setAttribute('aria-label', slotLabel(s));
      b.title = s.name ? `${slotLabel(s)} — ${s.name}` : slotLabel(s);
      b.tabIndex = s.n === focusN ? 0 : -1;
      // لا يُنقل زر في مكانه: نقل العقدة المركّزة يُسقط التركيز إلى body (لوحة المفاتيح بعد اختيار خانة).
      if (root.children[i] !== b) root.insertBefore(b, root.children[i] ?? null);
    });
    root.hidden = shown.length < 2;
  }
  update(slots);
  return {
    root, update,
    get buttons() { return /** @type {HTMLButtonElement[]} */ ([...root.children]); },
    button: (n) => byN.get(n) ?? null,
  };
}
