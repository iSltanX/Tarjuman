// طبقة القوائم والتلميحات والرسائل (figma-design-brief §٥.٢ و§٦ و§٧.٢): عنصر واحد داخل #movie_player نفسه (فتبقى
// القوائم ظاهرة في ملء الشاشة)، بـShadow DOM مغلق. القوائم والتلميحات تتبع ظهور الشريط (تختفي معه)، والرسائل العابرة
// غير حاجبة فوق موضع الشريط. لا تلتقط الطبقة النقرات إلا على قائمة أو رسالة، ولا تصل منها ضغطة إلى اختصارات يوتيوب.
import { createSheet } from '../overlay/sheet.js';
import { LAYER_ID, layerCss } from './styles.js';

const GAP_PX = 12;
const EDGE_PX = 8;
const MENU_W = { normal: 300, compact: 300, fullscreen: 340 };
// ما يخص القائمة لا يصل إلى المشغّل: الضغطات (الأرقام والمسافة والأسهم اختصارات ليوتيوب) والنقر (تشغيل وإيقاف).
const ISOLATE = ['keydown', 'keyup', 'keypress', 'click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'contextmenu', 'wheel'];
const GLYPH = { success: '✓', info: 'ⓘ', warning: '⚠', error: '✕' };

/**
 * @param {{ doc: Document, win: Window, on: { escape: () => void, files: (files: File[]) => void } }} deps
 */
export function createLayer({ doc, win, on }) {
  const host = doc.createElement('div');
  host.id = LAYER_ID;
  const root = host.attachShadow({ mode: 'closed' });
  const sheet = createSheet({ doc, win }, layerCss());
  const styleMode = sheet.adopt(root);

  const layer = doc.createElement('div');
  layer.className = 'layer';
  layer.setAttribute('data-size', 'normal');
  const tip = doc.createElement('div');
  tip.className = 'tip';
  tip.setAttribute('role', 'tooltip');
  tip.setAttribute('hidden', '');
  const menu = doc.createElement('div');
  menu.className = 'menu';
  menu.setAttribute('hidden', '');
  const toasts = doc.createElement('div');
  toasts.className = 'toasts';
  toasts.setAttribute('role', 'status');
  toasts.setAttribute('aria-live', 'polite');
  const input = doc.createElement('input');
  input.setAttribute('type', 'file');
  input.setAttribute('accept', '.srt,application/x-subrip,text/plain');
  input.setAttribute('multiple', '');
  input.setAttribute('hidden', '');
  input.setAttribute('tabindex', '-1');
  layer.appendChild(menu);
  layer.appendChild(tip);
  root.appendChild(layer);
  root.appendChild(toasts);
  root.appendChild(input);

  for (const type of ISOLATE) {
    menu.addEventListener(type, (ev) => {
      if (type === 'keydown' && ev.key === 'Escape') on.escape();
      ev.stopPropagation();
    });
    toasts.addEventListener(type, (ev) => ev.stopPropagation());
  }
  input.addEventListener('change', () => {
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length) on.files(files);
  });

  /** @type {{ size: string, width: number, height: number, lift: number, hidden: boolean }} */
  let bar = { size: 'normal', width: 0, height: 0, lift: 48, hidden: false };
  /** @type {Element | null} زر القائمة المفتوحة: موضعها فوقه */
  let anchor = null;
  /** @type {Element | null} */
  let tipAnchor = null;

  const setVar = (el, k, v) => el.style.setProperty(k, v);

  /** موضع زر بالنسبة إلى المشغّل: مركزه الأفقي والمسافة من أسفل المشغّل إلى أعلاه. */
  function relative(el) {
    const p = host.parentNode?.getBoundingClientRect?.() ?? { left: 0, bottom: bar.height, width: bar.width };
    const r = el.getBoundingClientRect();
    return { cx: r.left - p.left + r.width / 2, above: Math.max(0, p.bottom - r.top), playerW: p.width || bar.width };
  }

  function placeMenu() {
    if (menu.hasAttribute('hidden') || !anchor) return;
    const { cx, above, playerW } = relative(anchor);
    const w = Math.min(MENU_W[bar.size] ?? 300, Math.max(0, playerW - 2 * EDGE_PX));
    const x = Math.max(EDGE_PX, Math.min(cx - w / 2, playerW - w - EDGE_PX));
    const y = Math.max(above, bar.lift) + GAP_PX;
    setVar(menu, '--x', `${Math.round(x)}px`);
    setVar(menu, '--y', `${Math.round(y)}px`);
    setVar(menu, '--max-h', `${Math.max(120, Math.round(Math.min(bar.height * 0.7, bar.height - y - EDGE_PX)))}px`);
  }

  function placeTip() {
    if (tip.hasAttribute('hidden') || !tipAnchor) return;
    const { cx, above, playerW } = relative(tipAnchor);
    const w = tip.getBoundingClientRect().width || 0;
    const x = w ? Math.max(EDGE_PX + w / 2, Math.min(cx, playerW - EDGE_PX - w / 2)) : cx;
    setVar(tip, '--x', `${Math.round(x)}px`);
    setVar(tip, '--y', `${Math.round(Math.max(above, bar.lift) + GAP_PX)}px`);
  }

  return {
    host,
    root,
    styleMode,

    /** @param {{ size: string, width: number, height: number, lift: number, hidden: boolean }} b */
    setBar(b) {
      bar = b;
      if (layer.getAttribute('data-size') !== b.size) layer.setAttribute('data-size', b.size);
      const state = b.hidden ? 'hidden' : 'shown';
      if (layer.getAttribute('data-bar') !== state) layer.setAttribute('data-bar', state);
      setVar(toasts, '--y', `${Math.round(b.lift + GAP_PX)}px`);
      placeMenu();
      placeTip();
    },

    /** @param {string | null} text @param {Element | null} el */
    showTip(text, el) {
      if (!text || !el) {
        tip.setAttribute('hidden', '');
        tipAnchor = null;
        return;
      }
      tipAnchor = el;
      if (tip.textContent !== text) tip.textContent = text;
      tip.removeAttribute('hidden');
      placeTip();
    },

    /**
     * يعرض محتوى القائمة فوق زرها. المحتوى عقدة جاهزة (تبنيها وحدات القوائم)؛ وتبديله لا يغيّر موضعها.
     * @param {Node[]} children @param {Element} el @param {{ label: string, role?: string }} a11y
     */
    openMenu(children, el, a11y) {
      anchor = el;
      menu.replaceChildren(...children);
      menu.setAttribute('role', a11y.role ?? 'menu');
      menu.setAttribute('aria-label', a11y.label);
      menu.removeAttribute('hidden');
      placeMenu();
    },

    /** @param {Node[]} children */
    replaceMenu(children) {
      menu.replaceChildren(...children);
    },

    closeMenu() {
      anchor = null;
      menu.setAttribute('hidden', '');
      menu.replaceChildren();
    },

    menuOpen: () => !menu.hasAttribute('hidden'),

    /** العنصر المركّز داخل الطبقة (الجذر مغلق فلا يراه document.activeElement). */
    focused: () => root.activeElement ?? null,

    /** @param {string} fid */
    find: (fid) => menu.querySelector(`[data-fid="${fid}"]`),

    /** أول عنصر قابل للتركيز في القائمة (يُعطى بالسمة data-first أو أول زر أو حقل). */
    focusFirst() {
      const el = menu.querySelector('[data-first]') ?? menu.querySelector('button, input');
      el?.focus();
    },

    /** @param {EventTarget[]} path */
    owns: (path) => path.includes(host),

    /** يفتح منتقي الملفات (يحتاج فعل المستخدم). */
    pickFiles() {
      input.value = '';
      input.click();
    },

    /**
     * @param {{ id: string, tone: 'success' | 'info' | 'warning' | 'error', text: string, persist: boolean }[]} list
     * @param {(id: string) => void} dismiss
     */
    renderToasts(list, dismiss) {
      const key = list.map((t) => `${t.id}`).join('|');
      if (toasts.getAttribute('data-key') === key) return;
      toasts.setAttribute('data-key', key);
      toasts.replaceChildren(...list.map((t) => {
        const box = doc.createElement('div');
        box.className = 'toast';
        box.setAttribute('data-tone', t.tone);
        box.setAttribute('role', t.tone === 'error' || t.tone === 'warning' ? 'alert' : 'status');
        const g = doc.createElement('span');
        g.className = 'glyph';
        g.setAttribute('aria-hidden', 'true');
        g.textContent = GLYPH[t.tone] ?? GLYPH.info;
        const tx = doc.createElement('span');
        tx.className = 'text';
        tx.textContent = t.text;
        box.appendChild(g);
        box.appendChild(tx);
        if (t.persist) {
          const x = doc.createElement('button');
          x.setAttribute('type', 'button');
          x.className = 'x';
          x.setAttribute('aria-label', 'إغلاق الرسالة');
          x.textContent = '✕';
          x.addEventListener('click', () => dismiss(t.id));
          box.appendChild(x);
        }
        return box;
      }));
    },

    /** @param {Element} player يضع الطبقة آخر أبناء المشغّل إن لم تكن فيه. */
    attachTo(player) {
      if (host.parentNode === player) return false;
      player.appendChild(host);
      return true;
    },

    isConnected: () => host.isConnected,

    /** للحزام الحي: ما يظهر في الطبقة الآن (بلا نص تعليمات أبدًا؛ لا يُنسخ إليها). */
    peek() {
      const box = (e) => {
        const r = e.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), height: Math.round(r.height) };
      };
      const items = menu.hasAttribute('hidden') ? [] : [...menu.querySelectorAll('button, input')].map((e) => ({
        fid: e.getAttribute('data-fid'), text: e.textContent, value: e.value ?? null, disabled: e.getAttribute('aria-disabled') === 'true', box: box(e),
      }));
      return {
        bar: layer.getAttribute('data-bar'),
        menu: menu.hasAttribute('hidden') ? null : { label: menu.getAttribute('aria-label'), text: menu.textContent, box: box(menu), items },
        tip: tip.hasAttribute('hidden') ? null : tip.textContent,
        toasts: [...toasts.children].map((t) => ({ tone: t.getAttribute('data-tone'), text: t.textContent, box: box(t) })),
        focusedFid: root.activeElement?.getAttribute?.('data-fid') ?? null,
      };
    },

    destroy() {
      sheet.release();
      host.remove();
    },
  };
}
