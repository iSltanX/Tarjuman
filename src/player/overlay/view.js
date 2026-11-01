// عرض الطبقة (P5، عقد interfaces §٣): حاوية Shadow DOM مغلقة، وكل ما يظهر فيها يدخل بـtextContent وعناصر DOM
// (لا HTML نصي أبدًا: Trusted Types في يوتيوب). سطر لكل سطر في المقطع، واتجاه كل سطر من حروفه. الطبقة لا تلتقط
// النقرات (pointer-events: none في الورقة)، فلا تحجب أي أداة من أدوات يوتيوب.
import { createSheet } from './sheet.js';
import { FADE_MS, HOST_ID, overlayCss } from './styles.js';
import { lineDirection } from './text.js';

const sameLines = (a, b) => a.length === b.length && a.every((l, i) => l === b[i]);

/**
 * @param {{ doc: Document, win: Window }} env
 */
export function createOverlayView({ doc, win }) {
  const host = doc.createElement('div');
  host.id = HOST_ID;
  const root = host.attachShadow({ mode: 'closed' });
  const sheet = createSheet({ doc, win }, overlayCss());
  const styleMode = sheet.adopt(root);

  const stage = doc.createElement('div');
  stage.className = 'stage';
  stage.setAttribute('data-empty', '');
  stage.setAttribute('data-bg', 'soft');
  root.appendChild(stage);

  /** @type {{ ar: string[], en: string[] }} */
  let shown = { ar: [], en: [] };
  let fadeTimer = 0;

  function line(text, kind) {
    const el = doc.createElement('div');
    el.className = `line ${kind}`;
    el.setAttribute('dir', lineDirection(text));
    el.textContent = text;
    return el;
  }

  function cancelFade() {
    if (!fadeTimer) return;
    win.clearTimeout(fadeTimer);
    fadeTimer = 0;
  }

  /** مسح فوري بلا تلاشٍ (تبديل الفيديو، والإخفاء أثناء الإعلان). */
  function clear() {
    cancelFade();
    shown = { ar: [], en: [] };
    stage.setAttribute('data-empty', '');
    stage.replaceChildren();
  }

  return {
    host,
    styleMode,

    /**
     * أسطر الظاهر الآن. عند الفراغ تتلاشى الطبقة 80ms ثم يُزال المحتوى؛ وبين مقطعين متتاليين يتبدل النص
     * في مكانه بلا وميض.
     * @param {{ ar: string[], en: string[] }} lines
     */
    render({ ar, en }) {
      if (sameLines(ar, shown.ar) && sameLines(en, shown.en)) return;
      if (!ar.length && !en.length) {
        shown = { ar: [], en: [] };
        stage.setAttribute('data-empty', '');
        cancelFade();
        fadeTimer = win.setTimeout(() => {
          fadeTimer = 0;
          if (!shown.ar.length && !shown.en.length) stage.replaceChildren();
        }, FADE_MS + 40);
        return;
      }
      cancelFade();
      shown = { ar: [...ar], en: [...en] };
      stage.replaceChildren(...ar.map((t) => line(t, 'ar')), ...en.map((t) => line(t, 'en')));
      stage.removeAttribute('data-empty');
    },

    clear,

    /** @param {boolean} hidden إخفاء تام (إعلان أو تنقّل): يمسح المحتوى أيضًا فلا يبقى شيء من السابق. */
    setHidden(hidden) {
      if (hidden) {
        clear();
        host.setAttribute('hidden', '');
      } else {
        host.removeAttribute('hidden');
      }
    },

    /** @param {{ background: 'none' | 'soft' | 'solid' }} a */
    setAppearance(a) {
      stage.setAttribute('data-bg', a.background);
    },

    /** @param {{ fontPx: number, anchor: 'top' | 'bottom', offsetPx: number }} l */
    setLayout(l) {
      host.style.setProperty('--tj-fs', `${l.fontPx}px`);
      host.style.setProperty('--tj-offset', `${l.offsetPx}px`);
      host.setAttribute('data-anchor', l.anchor);
    },

    /** @param {Element} parent يضع المضيف آخر أبناء الأب إن لم يكن فيه. */
    attachTo(parent) {
      if (host.parentNode !== parent) parent.appendChild(host);
    },

    isConnected: () => host.isConnected,

    /** للحزام الحي وحده: ما يظهر الآن (نصًا واتجاهًا). لا يدخل تقرير التشخيص أبدًا. */
    peek(withBox = true) {
      const empty = stage.hasAttribute('data-empty');
      // أثناء التلاشي تبقى العناصر دقائق قليلة في DOM وهي غير مرئية: الظاهر فعلًا لا يشملها.
      const rows = empty ? [] : [...stage.children].map((c) => ({ kind: c.className.includes('en') ? 'en' : 'ar', dir: c.getAttribute('dir'), text: c.textContent }));
      const box = (e) => {
        const r = e.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), height: Math.round(r.height) };
      };
      return {
        lines: rows, hidden: host.hasAttribute('hidden'), empty, fading: empty && stage.children.length > 0, connected: host.isConnected,
        ...(withBox ? { host: box(host), stage: box(stage) } : {}),
      };
    },

    destroy() {
      cancelFade();
      sheet.release();
      host.remove();
    },
  };
}
