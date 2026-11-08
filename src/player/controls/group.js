// مجموعة الأزرار داخل شريط يوتيوب (مواصفة التصميم الأولى §٥، والهوية البصرية docs/identity.md): تحميل الأصل، والترجمة، والنص المتزامن
// (يفتح اللوحة ويغلقها؛ مضغوط aria-pressed، ومخفي إن أُخفي زرها)، و−، والشارة، و+، بهذا الترتيب LTR دائمًا، بمقاس يتسع
// له الشريط (bar.js fitSize) ولا يُخفى منها شيء. أيقونات بلا حروف ولا صناديق ولا نقاط حالة: اسم الوظيفة (ومعنى حالتها) في التلميح
// عند المرور والتركيز وفي اسم الوصول ووصفه، والانشغال ماسّتا نبض مكان الأيقونة. Shadow DOM مغلق داخل عنصر واحد يُدرج في
// بداية أدوات الشريط اليمنى، فيظهر ويختفي مع الشريط كأي زر أصلي. الأزرار تبقى قابلة للتركيز وهي معطّلة (aria-disabled)
// لتقرأ سببها. لا منطق منتج هنا: كل ضغط يُبلَّغ.
import { getLocale } from '../../i18n/index.js';
import { createSheet } from '../overlay/sheet.js';
import { playerIcon } from './icons.js';
import { GROUP_ID, PULSE_MS, groupCss } from './styles.js';
import { LABELS } from './text.js';

export const KINDS = Object.freeze(['download', 'upload', 'panel', 'minus', 'badge', 'plus']);
// النوافذ الثلاث حوارات غير نمطية لا قوائم (فيها عناوين ومجموعات اختيار وحقول؛ تدقيق 7a66f91، U44). وزر الرفع بلا ترجمة يفتح
// منتقي الملفات مباشرة، فلا يعلن نافذة (popup: null في نموذجه).
const MENU_KINDS = { download: 'dialog', upload: 'dialog', badge: 'dialog' };
// ضغطات التفعيل والإغلاق لا تصل إلى اختصارات يوتيوب (المسافة توقف التشغيل، وEsc يخرج من ملء الشاشة).
const OWN_KEYS = new Set(['Enter', ' ', 'Spacebar', 'Escape']);

/**
 * label اسم الوصول (وفيه السبب إن عُطّل)، وdescription معنى الحالة لقارئ الشاشة (أو null)، وtip نص التلميح البصري (تعرضه الطبقة).
 * pressed للزر المبدِّل (اللوحة مفتوحة)، وhidden لزر أخفاه المستخدم، وpopup نوع ما يفتحه الزر إن خالف نوعه الثابت (null: لا نافذة).
 * @typedef {{ label: string, tip?: string, description?: string | null, disabled?: boolean, unavailable?: boolean, loading?: boolean, expanded?: boolean, pressed?: boolean, hidden?: boolean, popup?: string | null }} ButtonModel
 * @typedef {{
 *   size: 'normal' | 'compact' | 'tight' | 'fullscreen',
 *   download: ButtonModel, upload: ButtonModel, panel: ButtonModel, minus: ButtonModel, plus: ButtonModel,
 *   badge: ButtonModel & { text: string, sign: 'zero' | 'positive' | 'negative' },
 * }} GroupModel
 */

/**
 * @param {{
 *   doc: Document, win: Window,
 *   on: {
 *     action: (kind: string, info: { keyboard: boolean }) => void,
 *     hint: (kind: string | null, info?: { pointer?: boolean }) => void,
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
  // لغة الواجهة للقارئ الآلي؛ وترتيب الأزرار LTR ثابت لأنه ترتيب شريط يوتيوب نفسه (الاتجاه على القوائم والرسائل في layer.js).
  group.setAttribute('lang', getLocale());
  group.setAttribute('data-size', 'normal');
  root.appendChild(group);

  /** @type {Record<string, { el: HTMLElement, load: HTMLElement | null, text: HTMLElement | null }>} */
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
    if (kind === 'panel') el.setAttribute('aria-pressed', 'false');
    let text = null;
    let load = null;
    if (kind === 'badge') {
      text = doc.createElement('span');
      text.textContent = '0.0';
      el.appendChild(text);
      el.setAttribute('data-sign', 'zero');
    } else {
      el.appendChild(playerIcon(doc, kind));
    }
    if (kind === 'download' || kind === 'upload') {
      // الانشغال: ماستان تتناوبان نبضًا في صندوق الأيقونة نفسه (بلا دوّار)، وتحلّان محلّها ما دام العمل جاريًا.
      load = doc.createElement('span');
      load.className = 'load';
      load.setAttribute('aria-hidden', 'true');
      load.setAttribute('hidden', '');
      load.appendChild(doc.createElement('i'));
      load.appendChild(doc.createElement('i'));
      el.appendChild(load);
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
    // مغادرة المؤشر تُبلَّغ بأنها مغادرة مؤشر: يبقى التلميح لحظة فيمكن المرور فوقه (U89)؛ وفقد التركيز يخفيه فورًا.
    el.addEventListener('pointerleave', () => on.hint(null, { pointer: true }));
    el.addEventListener('focus', () => on.hint(kind));
    el.addEventListener('blur', () => on.hint(null));
    group.appendChild(el);
    buttons[kind] = { el, load, text };
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
        setAttr(b.el, 'aria-description', s.description ?? null);
        setAttr(b.el, 'aria-disabled', s.disabled ? 'true' : null);
        setAttr(b.el, 'data-unavailable', s.unavailable ? '' : null);
        setAttr(b.el, 'aria-busy', s.loading ? 'true' : null);
        setAttr(b.el, 'data-busy', s.loading ? '' : null);
        if (MENU_KINDS[kind]) {
          const popup = s.popup === undefined ? MENU_KINDS[kind] : s.popup;
          setAttr(b.el, 'aria-haspopup', popup);
          setAttr(b.el, 'aria-expanded', popup ? (s.expanded ? 'true' : 'false') : null);
        }
        if (kind === 'panel') {
          setAttr(b.el, 'aria-pressed', s.pressed ? 'true' : 'false');
          setAttr(b.el, 'hidden', s.hidden ? '' : null);
        }
        if (b.load) setAttr(b.load, 'hidden', s.loading ? null : '');
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

    /** نوع الزر المركّز داخل المجموعة (للحزام الحي)، أو null. */
    focused: () => root.activeElement?.getAttribute?.('data-kind') ?? null,

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
