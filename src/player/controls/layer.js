// طبقة القوائم والتلميحات والرسائل (مواصفة التصميم الأولى §٥.٢ و§٦ و§٧.٢): عنصر واحد داخل #movie_player نفسه (فتبقى
// القوائم ظاهرة في ملء الشاشة)، بـShadow DOM مغلق. القوائم والتلميحات تتبع ظهور الشريط (تختفي معه)، إلا قائمة فيها
// التركيز يكتب المستخدم في حقلها (product-spec §٦.٤، قرار سلطان في W4): تبقى ظاهرة حتى يغادر حقلها أو يغلقها. والرسائل
// العابرة غير حاجبة فوق موضع الشريط. لا تلتقط الطبقة النقرات إلا على قائمة أو رسالة، ولا تصل منها ضغطة إلى اختصارات يوتيوب.
import { getDir, getLocale, t as translate } from '../../i18n/index.js';
import { onHold } from '../../ui/hold.js';
import { createSheet } from '../overlay/sheet.js';
import { glyph } from './glyphs.js';
import { morphChildren } from './morph.js';
import { LAYER_ID, layerCss } from './styles.js';

const GAP_PX = 12;
const EDGE_PX = 8;
const MENU_W = { normal: 280, compact: 264, fullscreen: 320 };
// ما يخص القائمة لا يصل إلى المشغّل: الضغطات (الأرقام والمسافة والأسهم اختصارات ليوتيوب) والنقر (تشغيل وإيقاف).
const ISOLATE = ['keydown', 'keyup', 'keypress', 'click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'contextmenu', 'wheel'];
/** حقل يُكتب فيه (لا مربع اختيار ولا منتقي ملفات). @param {Element | null | undefined} el */
const typable = (el) => String(el?.tagName).toLowerCase() === 'input' && !['checkbox', 'radio', 'file', 'button'].includes(el.getAttribute('type') ?? 'text');

/**
 * focusLeave: خرج التركيز من القائمة إلى عنصر خارج الطبقة (يقرر المستدعي الإغلاق؛ U46). tipHover: المؤشر دخل التلميح أو غادره
 * (U89). focusLost: زالت رسالة كان فيها التركيز (انقضت أو فُعّل زرها بلوحة المفاتيح)، فيعيده المستدعي إلى زر ظاهر (U88).
 * @param {{ doc: Document, win: Window, on: { escape: () => void, files: (files: File[]) => void, focusLeave?: (to: Element) => void, tipHover?: (inside: boolean) => void, focusLost?: () => void } }} deps
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
  // لغة الواجهة واتجاهها على عناصر ترجمان وحدها (المضيف نفسه يبقى LTR للمواضع المطلقة): lang للقارئ الآلي (WCAG 3.1.2؛ تدقيق 7a66f91، U48).
  layer.setAttribute('lang', getLocale());
  layer.setAttribute('dir', getDir());
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
  toasts.setAttribute('lang', getLocale());
  toasts.setAttribute('dir', getDir());
  toasts.setAttribute('data-size', 'normal');
  // إعلان ما لا يُرى نصه في مكان مركّز (الإزاحة بعد ± من الشريط، U48): منطقة حية مخفية بصريًا.
  const live = doc.createElement('div');
  live.className = 'sr';
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'true');
  live.setAttribute('lang', getLocale());
  live.setAttribute('dir', getDir());
  const input = doc.createElement('input');
  input.setAttribute('type', 'file');
  // SRT، وTXT وMarkdown بمحتوى موقّت (R48): القارئ يزيل أغلفتها الواضحة بملاحظات.
  input.setAttribute('accept', '.srt,.txt,.md,application/x-subrip,text/plain,text/markdown');
  input.setAttribute('multiple', '');
  input.setAttribute('hidden', '');
  input.setAttribute('tabindex', '-1');
  layer.appendChild(menu);
  layer.appendChild(tip);
  root.appendChild(layer);
  root.appendChild(toasts);
  root.appendChild(live);
  root.appendChild(input);

  for (const type of ISOLATE) {
    menu.addEventListener(type, (ev) => {
      if (type === 'keydown' && ev.key === 'Escape') on.escape();
      ev.stopPropagation();
    });
    toasts.addEventListener(type, (ev) => ev.stopPropagation());
    tip.addEventListener(type, (ev) => ev.stopPropagation());
  }
  // التلميح يلتقط المؤشر (U89): الجلسة تبقيه ما دام المؤشر فوقه أو فوق زره.
  tip.addEventListener('pointerenter', () => on.tipHover?.(true));
  tip.addEventListener('pointerleave', () => on.tipHover?.(false));
  // الكتابة في حقل القائمة تبقيها ظاهرة والشريط مخفي (data-typing)؛ ومغادرة الحقل تعيدها إلى قاعدة الشريط. التركيز
  // المنتقل بين حقلين يمر بـfocusout ثم focusin في المهمة نفسها، فلا ترمش القائمة.
  const syncTyping = (el) => {
    if (typable(el)) layer.setAttribute('data-typing', '');
    else layer.removeAttribute('data-typing');
  };
  menu.addEventListener('focusin', (ev) => syncTyping(ev.target));
  // خروج التركيز إلى ما خارج الطبقة (Tab من آخر بند، أو نقرة في الصفحة) يُبلَّغ (U46). والوجهة الغائبة (المتصفح نفسه فقد
  // التركيز، أو أُزيل العنصر المركّز في تحديث) ليست خروجًا. والوجهة داخل جذر مظلل آخر تصل مضيفَه (المجموعة).
  menu.addEventListener('focusout', (ev) => {
    syncTyping(null);
    const to = ev.relatedTarget ?? null;
    if (to && !root.contains(to) && to !== host) on.focusLeave?.(to);
  });
  // بعد نقرة الفأرة على بند لا يبقى التركيز فيه (كأزرار الشريط، group.js): وإلا بقيت القائمة «مركّزة» فلا تُغلق مع اختفاء
  // الشريط، وتلتقط المسافة وEnter وهي خفية فتنفّذ بندًا لا يُرى (تدقيق 5fedcb9، GM-003). ولوحة المفاتيح (detail = 0) تبقي
  // التركيز، والحقول تبقيه للكتابة.
  menu.addEventListener('click', (ev) => {
    if (!(ev.detail > 0)) return;
    queueMicrotask(() => {
      const f = root.activeElement;
      if (f && menu.contains(f) && !typable(f)) f.blur();
    });
  });
  // نقرة فتح المنتقي (input.click) تصعد عبر الجذر إلى المشغّل؛ لا تصل إليه فتوقف التشغيل أو تبدأه.
  input.addEventListener('click', (ev) => ev.stopPropagation());
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
  /** المسافة من أسفل المشغّل إلى أعلى القائمة المفتوحة. */
  let menuTop = 0;
  /** القائمة المفتوحة تضبط سطر الترجمة (التوقيت): تُرفع فوقه حين يتسع المشغّل (تدقيق 7a66f91، P-11). */
  let avoidLine = false;
  /** أعلى ما رُفعت إليه القائمة المفتوحة: ترتفع إن كبر السطر ولا تنزل بين المقاطع، فلا تقفز مع كل مقطع. */
  let liftY = 0;
  /** صناديق الرسائل بمعرّفاتها: تُحدَّث بالفرق فلا يُعاد إعلان القائم ولا يُفصل زر مركّز (U48 N08، U88). */
  const boxes = new Map();
  let liveText = '';
  let stageObserver = null;

  const setVar = (el, k, v) => el.style.setProperty(k, v);

  /** موضع زر بالنسبة إلى المشغّل: مركزه الأفقي والمسافة من أسفل المشغّل إلى أعلاه. */
  function relative(el) {
    const p = host.parentNode?.getBoundingClientRect?.() ?? { left: 0, bottom: bar.height, width: bar.width };
    const r = el.getBoundingClientRect();
    return { cx: r.left - p.left + r.width / 2, above: Math.max(0, p.bottom - r.top), playerW: p.width || bar.width };
  }

  /** أعلى سطر الترجمة الظاهر عن أسفل المشغّل (تنشره طبقة الترجمة data-stage-top)، أو NaN. */
  function stageTop() {
    const overlay = host.parentNode?.querySelector?.('#tarjuman-overlay');
    const v = overlay && !overlay.hasAttribute('hidden') ? Number(overlay.getAttribute('data-stage-top')) : NaN;
    return Number.isFinite(v) && v > 0 ? v : NaN;
  }

  function placeMenu() {
    if (menu.hasAttribute('hidden') || !anchor) return;
    const { cx, above, playerW } = relative(anchor);
    const w = Math.min(MENU_W[bar.size] ?? MENU_W.normal, Math.max(0, playerW - 2 * EDGE_PX));
    const x = Math.max(EDGE_PX, Math.min(cx - w / 2, playerW - w - EDGE_PX));
    let y = Math.max(above, bar.lift) + GAP_PX;
    // قائمة التوقيت لا تغطي السطر الذي تضبطه: فوقه إن اتسع المشغّل لارتفاعها كاملًا، وإلا فوق زرها كما كانت.
    if (avoidLine) {
      const line = stageTop();
      const need = menu.scrollHeight || menu.getBoundingClientRect().height || 0;
      const fits = (top) => bar.height > 0 && bar.height - top - EDGE_PX >= need;
      if (Number.isFinite(line) && line + GAP_PX > liftY && fits(line + GAP_PX)) liftY = line + GAP_PX;
      if (liftY > y && fits(liftY)) y = liftY;
    }
    setVar(menu, '--w', `${Math.round(w)}px`);
    setVar(menu, '--x', `${Math.round(x)}px`);
    setVar(menu, '--y', `${Math.round(y)}px`);
    setVar(menu, '--max-h', `${Math.max(120, Math.round(Math.min(bar.height * 0.7, bar.height - y - EDGE_PX)))}px`);
    menuTop = y + (menu.getBoundingClientRect().height || 0);
    placeToasts();
  }

  /**
   * الرسائل فوق الشريط، وفوق القائمة المفتوحة إن وُجدت فلا تغطي بنودها (كشفه الاختبار الحي)، وفوق سطر الترجمة الظاهر فلا
   * تحجبه (طبقة الترجمة تنشر أعلاه data-stage-top؛ تدقيق 5fedcb9، CL-003)؛ ولا تتجاوز حافة المشغّل العليا في مشغّل قصير
   * (CL-016): إن لم يتسع فوقها مكان نزلت إلى أعلى ما يتسع.
   */
  function placeToasts() {
    let y = menu.hasAttribute('hidden') ? bar.lift + GAP_PX : Math.max(bar.lift + GAP_PX, menuTop + GAP_PX);
    const top = stageTop();
    if (Number.isFinite(top)) y = Math.max(y, top + GAP_PX);
    const h = toasts.getBoundingClientRect?.()?.height ?? 0;
    if (bar.height > 0 && h > 0 && y + h > bar.height - EDGE_PX) y = Math.max(EDGE_PX, bar.height - h - EDGE_PX);
    setVar(toasts, '--y', `${Math.round(y)}px`);
  }

  function placeTip() {
    if (tip.hasAttribute('hidden') || !tipAnchor) return;
    const { cx, above, playerW } = relative(tipAnchor);
    const w = tip.getBoundingClientRect().width || 0;
    const x = w ? Math.max(EDGE_PX + w / 2, Math.min(cx, playerW - EDGE_PX - w / 2)) : cx;
    setVar(tip, '--x', `${Math.round(x)}px`);
    setVar(tip, '--y', `${Math.round(Math.max(above, bar.lift) + GAP_PX)}px`);
  }

  /** صندوق رسالة واحدة: رمزها ونصها، وفعلها (تراجع) وزر إغلاقها إن دامت. */
  function toastBox(t, dismiss, run) {
    const box = doc.createElement('div');
    box.className = 'toast';
    box.setAttribute('data-tone', t.tone);
    box.setAttribute('data-id', t.id);
    box.setAttribute('role', t.tone === 'error' || t.tone === 'warning' ? 'alert' : 'status');
    // المؤشر والتركيز يُمسكان مؤقت زوالها (WCAG 2.2.1؛ U-042)، والجلسة تملك المؤقت.
    onHold(box, (why, held) => on.toastHold?.(t.id, why, held));
    const g = glyph(doc, t.icon ?? t.tone);
    const tx = doc.createElement('span');
    tx.className = 'text';
    tx.textContent = t.text;
    box.appendChild(g);
    box.appendChild(tx);
    if (t.action) {
      const a = doc.createElement('button');
      a.setAttribute('type', 'button');
      a.className = 'act';
      a.textContent = t.action.label;
      a.addEventListener('click', () => run(t.id));
      box.appendChild(a);
    }
    if (t.persist) {
      const x = doc.createElement('button');
      x.setAttribute('type', 'button');
      x.className = 'x';
      x.setAttribute('aria-label', translate('player.controls.dismissMessage'));
      x.appendChild(glyph(doc, 'x', 'glyph glyph--x'));
      x.addEventListener('click', () => dismiss(t.id));
      box.appendChild(x);
    }
    return box;
  }

  // نقرة الفأرة على زر رسالة لا تُبقي التركيز فيه (كأزرار الشريط والقوائم): فلا تلتقط المسافة بعدها ولا يُنقل التركيز إلى الشريط
  // حين تزول الرسالة. ولوحة المفاتيح (detail = 0) تبقيه، فتعيده الجلسة إلى زر ظاهر عند زوالها (U88).
  toasts.addEventListener('click', (ev) => {
    if (!(ev.detail > 0)) return;
    const f = root.activeElement;
    if (f && toasts.contains(f)) f.blur();
  }, true);

  return {
    host,
    root,
    styleMode,

    /** @param {{ size: string, width: number, height: number, lift: number, hidden: boolean }} b */
    setBar(b) {
      // تغيّر المشغّل (ملء الشاشة، أو المسرح) والقائمة مفتوحة: يُحسب الرفع من جديد لا بقيمة المشغّل السابق (مراجعة C6).
      if (b.height !== bar.height || b.size !== bar.size) liftY = 0;
      bar = b;
      if (layer.getAttribute('data-size') !== b.size) layer.setAttribute('data-size', b.size);
      if (toasts.getAttribute('data-size') !== b.size) toasts.setAttribute('data-size', b.size);
      const state = b.hidden ? 'hidden' : 'shown';
      if (layer.getAttribute('data-bar') !== state) layer.setAttribute('data-bar', state);
      placeToasts();
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
     * @param {Node[]} children @param {Element} el @param {{ label: string, role?: string, avoidLine?: boolean }} a11y
     */
    openMenu(children, el, a11y) {
      anchor = el;
      avoidLine = !!a11y.avoidLine;
      liftY = 0;
      menu.replaceChildren(...children);
      menu.setAttribute('role', a11y.role ?? 'dialog');
      menu.setAttribute('aria-label', a11y.label);
      menu.removeAttribute('hidden');
      // استبدال المحتوى قد يزيل الحقل المركّز دون focusout.
      syncTyping(root.activeElement);
      placeMenu();
    },

    /**
     * يحدّث القائمة المفتوحة في مكانها (morph): العقد نفسها ما بقيت بنيتها، واسمها إن تغيّر (تأكيد «رفع» صار «استبدال»).
     * @param {Element[]} children @param {string} [label]
     */
    patchMenu(children, label) {
      if (label && menu.getAttribute('aria-label') !== label) menu.setAttribute('aria-label', label);
      const n = morphChildren(menu, children);
      syncTyping(root.activeElement);
      placeMenu();
      return n;
    },

    closeMenu() {
      anchor = null;
      avoidLine = false;
      liftY = 0;
      menu.setAttribute('hidden', '');
      menu.replaceChildren();
      syncTyping(null);
      placeToasts();
    },

    menuOpen: () => !menu.hasAttribute('hidden'),

    /** المستخدم يكتب في حقل القائمة الآن (فتبقى ظاهرة مع اختفاء الشريط، ولا تُغلق تلقائيًا). */
    isTyping: () => layer.hasAttribute('data-typing'),

    /** العنصر المركّز داخل الطبقة (الجذر مغلق فلا يراه document.activeElement). */
    focused: () => root.activeElement ?? null,
    /** القائمة باقية مفتوحة بقرار (تركيز لوحة المفاتيح، أو تأكيد ينتظر، أو عمل جارٍ): تبقى ظاهرة والشريط مخفي، فلا تُترك خفية تعمل. */
    setKeep(on) {
      if (on) layer.setAttribute('data-keep', '');
      else layer.removeAttribute('data-keep');
    },

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
     * الرسالة بفعل («تراجع») تحمل زره بعد نصها؛ الضغط يُبلَّغ إلى الجلسة وحدها. تُحدَّث بالفرق بمعرّفاتها (U48 N08، U88): الباقية
     * تبقى عقدها بأعيانها في مكانها (فلا يُعاد إعلان خطأ قديم ولا يُفصل «تراجع» مركّز)، والزائلة تُزال، والجديدة تُلحق. وإن زالت
     * رسالة فيها التركيز أُبلغ focusLost فلا يسقط إلى الصفحة.
     * @param {{ id: string, tone: 'success' | 'info' | 'warning' | 'error', text: string, persist: boolean, action?: { label: string } | null, icon?: 'clock' | null }[]} list
     * @param {(id: string) => void} dismiss
     * @param {(id: string) => void} [run] فعل الرسالة
     */
    renderToasts(list, dismiss, run = () => {}) {
      const ids = new Set(list.map((t) => t.id));
      const focused = root.activeElement ?? null;
      let lost = false;
      for (const [id, box] of boxes) {
        if (ids.has(id)) continue;
        if (focused && box.contains(focused)) lost = true;
        box.remove();
        boxes.delete(id);
      }
      list.forEach((t, i) => {
        let box = boxes.get(t.id);
        if (!box) {
          box = toastBox(t, dismiss, run);
          boxes.set(t.id, box);
        }
        // لا تُنقل عقدة قائمة (النقل يُسقط تركيزها): الترتيب ثابت بالإلحاق، فلا يُدرج إلا الجديد في موضعه.
        if (toasts.children[i] !== box) toasts.insertBefore(box, toasts.children[i] ?? null);
      });
      // ارتفاع الرسائل الجديد يحدد ما يتسع فوقها (CL-016).
      placeToasts();
      if (lost) on.focusLost?.();
    },

    /** يعلن نصًا في المنطقة الحية المخفية (الإزاحة بعد ± من الشريط؛ U48). النص نفسه مرتين يُعاد إعلانه. @param {string} text */
    announce(text) {
      liveText = liveText === text ? `${text}\u00A0` : text;
      live.textContent = liveText;
    },

    /** @param {Element} player يضع الطبقة آخر أبناء المشغّل إن لم تكن فيه. */
    attachTo(player) {
      if (host.parentNode === player) return false;
      player.appendChild(host);
      // سطر الترجمة يكبر أو يصغر بعد ظهور رسالة أو قائمة (CL-X3): يُعاد الموضع بتغيّر data-stage-top وحده.
      const MO = win.MutationObserver ?? globalThis.MutationObserver;
      stageObserver?.disconnect();
      stageObserver = MO ? new MO(() => {
        placeMenu();
        placeToasts();
      }) : null;
      stageObserver?.observe(player, { attributes: true, attributeFilter: ['data-stage-top'], subtree: true });
      return true;
    },

    isConnected: () => host.isConnected,

    /** للحزام الحي: ما يظهر في الطبقة الآن (بلا نص تعليمات أبدًا؛ لا يُنسخ إليها). */
    peek() {
      const fontOf = (e) => {
        if (!e || !win.getComputedStyle) return null;
        const cs = win.getComputedStyle(e);
        return { family: cs.fontFamily, size: cs.fontSize, weight: cs.fontWeight, lineHeight: cs.lineHeight };
      };
      const box = (e) => {
        const r = e.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), height: Math.round(r.height) };
      };
      const items = menu.hasAttribute('hidden') ? [] : [...menu.querySelectorAll('button, input')].map((e) => ({
        fid: e.getAttribute('data-fid'), text: e.textContent, value: e.value ?? null, disabled: e.getAttribute('aria-disabled') === 'true', box: box(e),
      }));
      return {
        bar: layer.getAttribute('data-bar'),
        typing: layer.hasAttribute('data-typing'),
        opacity: win.getComputedStyle ? win.getComputedStyle(layer).opacity : null,
        menu: menu.hasAttribute('hidden') ? null : { label: menu.getAttribute('aria-label'), text: menu.textContent, box: box(menu), items },
        tip: tip.hasAttribute('hidden') ? null : tip.textContent,
        tipBox: tip.hasAttribute('hidden') ? null : box(tip),
        toasts: [...toasts.children].map((t) => ({ tone: t.getAttribute('data-tone'), text: t.textContent, box: box(t) })),
        focusedFid: root.activeElement?.getAttribute?.('data-fid') ?? null,
        // خط الرسالة وخط القائمة كما يحسبهما المتصفح (U42)، والمنطقة الحية (U48)، والعنصر المركّز داخل الطبقة.
        fonts: {
          toast: fontOf(toasts.querySelector('.toast .text')),
          menu: menu.hasAttribute('hidden') ? null : fontOf(menu),
        },
        role: menu.hasAttribute('hidden') ? null : menu.getAttribute('role'),
        live: live.textContent,
        focused: root.activeElement ? { tag: root.activeElement.tagName, cls: root.activeElement.className, text: root.activeElement.textContent } : null,
      };
    },

    destroy() {
      stageObserver?.disconnect();
      stageObserver = null;
      sheet.release();
      host.remove();
    },
  };
}
