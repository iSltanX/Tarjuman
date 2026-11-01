// مجموعة الأزرار الخمسة داخل شريط يوتيوب (figma-design-brief §٥): تحميل، ورفع، و−، والشارة، و+، بهذا الترتيب
// LTR دائمًا. Shadow DOM مغلق داخل عنصر واحد يُدرج في بداية أدوات الشريط اليمنى، فيظهر ويختفي مع الشريط كأي زر
// أصلي. الأزرار تبقى قابلة للتركيز وهي معطّلة (aria-disabled) لتقرأ سببها. لا منطق منتج هنا: كل ضغط يُبلَّغ.
import { createSheet } from '../overlay/sheet.js';
import { playerIcon } from './icons.js';
import { GROUP_ID, PULSE_MS, groupCss } from './styles.js';
import { LABELS } from './text.js';

export const KINDS = Object.freeze(['download', 'upload', 'minus', 'badge', 'plus']);
const MENU_KINDS = { download: 'menu', upload: 'menu', badge: 'dialog' };
// ضغطات التفعيل والإغلاق لا تصل إلى اختصارات يوتيوب (المسافة توقف التشغيل، وEsc يخرج من ملء الشاشة).
const OWN_KEYS = new Set(['Enter', ' ', 'Spacebar', 'Escape']);

/**
 * @typedef {{ label: string, disabled?: boolean, unavailable?: boolean, loading?: boolean, dot?: 'ready' | 'loaded' | 'warning' | null, expanded?: boolean }} ButtonModel
 * @typedef {{
 *   size: 'normal' | 'compact' | 'fullscreen',
 *   download: ButtonModel, upload: ButtonModel, minus: ButtonModel, plus: ButtonModel,
 *   badge: ButtonModel & { text: string, sign: 'zero' | 'positive' | 'negative' },
 * }} GroupModel
 */

/**
 * @param {{
 *   doc: Document, win: Window,
 *   on: {
 *     action: (kind: string, info: { keyboard: boolean }) => void,
 *     hint: (kind: string | null) => void,
 *     escape: () => void,
 *   },
 * }} deps
 */
export function createGroup({ doc, win, on }) {
  const host = doc.createElement('div');
  host.id = GROUP_ID;
  const root = host.attachShadow({ mode: 'closed' });
  const sheet = createSheet({ doc, win }, groupCss());
  const styleMode = sheet.adopt(root);

  const group = doc.createElement('div');
  group.className = 'group';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', LABELS.group);
  group.setAttribute('data-size', 'normal');
  root.appendChild(group);

  /** @type {Record<string, { el: HTMLElement, dot: HTMLElement | null, spin: HTMLElement | null, text: HTMLElement | null }>} */
  const buttons = {};
  let lastKey = false;
  let pulseTimer = 0;

  for (const kind of KINDS) {
    const el = doc.createElement('button');
    el.setAttribute('type', 'button');
    el.className = kind === 'badge' ? 'btn badge' : 'btn';
    el.setAttribute('data-kind', kind);
    if (MENU_KINDS[kind]) {
      el.setAttribute('aria-haspopup', MENU_KINDS[kind]);
      el.setAttribute('aria-expanded', 'false');
    }
    let text = null;
    let dot = null;
    let spin = null;
    if (kind === 'badge') {
      text = doc.createElement('span');
      text.textContent = '0.0';
      el.appendChild(text);
      el.setAttribute('data-sign', 'zero');
    } else {
      el.appendChild(playerIcon(doc, kind));
    }
    if (kind === 'download' || kind === 'upload') {
      dot = doc.createElement('span');
      dot.className = 'dot';
      dot.setAttribute('hidden', '');
      spin = doc.createElement('span');
      spin.className = 'spin';
      spin.setAttribute('hidden', '');
      el.appendChild(dot);
      el.appendChild(spin);
    }
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      // ضغطة لوحة المفاتيح تولّد click بلا مؤشر (detail = 0) — فيُنقل التركيز إلى القائمة ويبقى على الزر.
      const keyboard = lastKey || ev.detail === 0;
      lastKey = false;
      // بعد نقرة الفأرة لا يبقى التركيز على الزر، فالمسافة بعدها توقف الفيديو كما في يوتيوب لا تكرر الضغطة.
      if (!keyboard) el.blur();
      on.action(kind, { keyboard });
    });
    el.addEventListener('keydown', (ev) => {
      if (!OWN_KEYS.has(ev.key)) return;
      ev.stopPropagation();
      if (ev.key === 'Escape') on.escape();
      else lastKey = true;
    });
    el.addEventListener('keyup', (ev) => {
      if (OWN_KEYS.has(ev.key)) ev.stopPropagation();
    });
    el.addEventListener('pointerenter', () => on.hint(kind));
    el.addEventListener('pointerleave', () => on.hint(null));
    el.addEventListener('focus', () => on.hint(kind));
    el.addEventListener('blur', () => on.hint(null));
    group.appendChild(el);
    buttons[kind] = { el, dot, spin, text };
  }
  // النقر المزدوج على الشريط لا يصل إلى المشغّل (ملء الشاشة).
  group.addEventListener('dblclick', (ev) => ev.stopPropagation());

  const setAttr = (el, name, value) => {
    if (value === null || value === false || value === undefined) {
      if (el.hasAttribute(name)) el.removeAttribute(name);
    } else if (el.getAttribute(name) !== String(value)) {
      el.setAttribute(name, String(value));
    }
  };

  return {
    host,
    styleMode,

    /** @param {GroupModel} m */
    update(m) {
      setAttr(group, 'data-size', m.size);
      for (const kind of KINDS) {
        const b = buttons[kind];
        const s = m[kind];
        setAttr(b.el, 'aria-label', s.label);
        setAttr(b.el, 'aria-disabled', s.disabled ? 'true' : null);
        setAttr(b.el, 'data-unavailable', s.unavailable ? '' : null);
        if (MENU_KINDS[kind]) setAttr(b.el, 'aria-expanded', s.expanded ? 'true' : 'false');
        if (b.dot) {
          setAttr(b.dot, 'hidden', s.dot && !s.loading ? null : '');
          setAttr(b.dot, 'data-tone', s.dot ?? null);
        }
        if (b.spin) setAttr(b.spin, 'hidden', s.loading ? null : '');
        if (kind === 'badge') {
          if (b.text.textContent !== m.badge.text) b.text.textContent = m.badge.text;
          setAttr(b.el, 'data-sign', m.badge.sign);
        }
      }
    },

    /** نبضة الشارة (120ms) بعد تغيّر الإزاحة. */
    pulse() {
      const el = buttons.badge.el;
      el.removeAttribute('data-pulse');
      if (pulseTimer) win.clearTimeout(pulseTimer);
      el.setAttribute('data-pulse', '');
      pulseTimer = win.setTimeout(() => {
        pulseTimer = 0;
        el.removeAttribute('data-pulse');
      }, PULSE_MS + 20);
    },

    /** @param {string} kind */
    button: (kind) => buttons[kind].el,

    /** @param {string} kind */
    focus(kind) {
      buttons[kind].el.focus();
    },

    /** هل العقدة (من composedPath) داخل المجموعة؟ @param {EventTarget[]} path */
    owns: (path) => path.includes(host),

    /** يضع المجموعة أول أدوات الشريط اليمنى؛ يعيد true إن نقلها. @param {Element} right */
    attachTo(right) {
      if (host.parentNode === right && right.firstChild === host) return false;
      right.insertBefore(host, right.firstChild);
      return true;
    },

    isConnected: () => host.isConnected,

    destroy() {
      if (pulseTimer) win.clearTimeout(pulseTimer);
      sheet.release();
      host.remove();
    },
  };
}
