// عرض الطبقة (P5، عقد interfaces §٣): حاوية Shadow DOM مغلقة، وكل ما يظهر فيها يدخل بـtextContent وعناصر DOM
// (لا HTML نصي أبدًا: Trusted Types في يوتيوب). سطر لكل سطر في المقطع، واتجاه كل سطر من حروفه. الطبقة لا تلتقط
// النقرات (pointer-events: none في الورقة)، فلا تحجب أي أداة من أدوات يوتيوب.
import { createSheet } from './sheet.js';
import { FADE_MS, HOST_ID, LINE_PAD_X, overlayCss } from './styles.js';
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
  /** لغة سطر الأصل في الوضع المزدوج (رمز مساره)، ولغة سطر الترجمة (رمزها أو null «غير محددة»، AA1؛ كانت ar ثابتة، U48). */
  let enLang = 'en';
  let trLang = null;
  let layout = { anchor: 'bottom', offsetPx: 0 };

  /**
   * أعلى السطر الظاهر عن أسفل المشغّل (موضعه المقصود لا أثناء انتقاله) سمةً على المضيف، فتضع أدوات المشغّل رسائلها فوقه
   * لا عليه (§٦.٥ «المشغّل للمشاهدة»؛ تدقيق 5fedcb9، CL-003). والجذر مغلق فلا يُقرأ من خارجه غيرها.
   */
  function publishStage() {
    if (stage.hasAttribute('data-empty') || layout.anchor !== 'bottom') {
      host.removeAttribute('data-stage-top');
      return;
    }
    const h = stage.getBoundingClientRect?.()?.height ?? 0;
    host.setAttribute('data-stage-top', String(Math.round(layout.offsetPx + h)));
  }

  function line(text, kind) {
    const el = doc.createElement('div');
    el.className = `line ${kind}`;
    const lang = kind === 'en' ? enLang : trLang;
    el.setAttribute('dir', lineDirection(text, lang));
    // لغة غير معروفة «und» (BCP-47)، فلا يُنطق السطر بلغة مفترضة.
    el.setAttribute('lang', lang ?? 'und');
    el.textContent = text;
    return el;
  }

  /**
   * ف2: سطر التفّ بحد العرض يبقى صندوقه بعرض الحد (text-wrap: balance لا يضيّق الكتلة)، فيُضيَّق إلى أعرض سطر ملتفّ فيه.
   * القياس من مستطيلات نصه (Range) مجمّعة بالسطر، لأن السطر الواحد قد يكون عدة مستطيلات (مقاطع اتجاه مختلطة). والسطر الذي لم
   * يلتفّ بلا عرض صريح (fit-content كما كان). يُعاد مع كل رسم وتبدّل خط أو حجم أو تحميل خط.
   * @param {HTMLElement} el
   */
  function fitLine(el) {
    el.style.removeProperty('width');
    if (typeof doc.createRange !== 'function' || !el.textContent) return;
    const range = doc.createRange();
    range.selectNodeContents(el);
    const rows = new Map();
    for (const r of range.getClientRects?.() ?? []) {
      if (!(r.width > 0)) continue;
      const key = Math.round(r.top + r.height / 2);
      const near = [...rows.keys()].find((k) => Math.abs(k - key) <= r.height / 3);
      const row = rows.get(near ?? key) ?? { left: Infinity, right: -Infinity };
      row.left = Math.min(row.left, r.left);
      row.right = Math.max(row.right, r.right);
      rows.set(near ?? key, row);
    }
    if (rows.size < 2) return;
    const widest = Math.max(...[...rows.values()].map((x) => x.right - x.left));
    el.style.setProperty('width', `${Math.ceil(widest) + LINE_PAD_X * 2 + 1}px`);
  }

  function fitAll() {
    for (const el of stage.children) fitLine(el);
  }

  // الخط المختار يُحمَّل بعد أول رسم أحيانًا، فتتغير عروض الأسطر: يُعاد التضييق.
  const fonts = doc.fonts;
  const onFonts = () => fitAll();
  fonts?.addEventListener?.('loadingdone', onFonts);

  /** تغيّرت لغة سطر معروض (U-030): يُعاد رسم الظاهر بسمتي lang وdir الجديدتين دون انتظار المقطع التالي. */
  function redrawShown() {
    if (!shown.ar.length && !shown.en.length) return;
    stage.replaceChildren(...shown.ar.map((t) => line(t, 'ar')), ...shown.en.map((t) => line(t, 'en')));
    fitAll();
    publishStage();
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
    publishStage();
  }

  return {
    host,
    styleMode,

    /**
     * أسطر الظاهر الآن. عند الفراغ تتلاشى الطبقة 80ms ثم يُزال المحتوى؛ وبين مقطعين متتاليين يتبدل النص في مكانه بلا وميض
     * (والفجوة الأقصر من التلاشي يصلها محرّك المزامنة، فلا يصل هنا فراغ بينهما؛ تدقيق 7a66f91، U49، CL-X1).
     * @param {{ ar: string[], en: string[] }} lines
     */
    render({ ar, en }) {
      if (sameLines(ar, shown.ar) && sameLines(en, shown.en)) return;
      if (!ar.length && !en.length) {
        shown = { ar: [], en: [] };
        stage.setAttribute('data-empty', '');
        publishStage();
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
      fitAll();
      publishStage();
    },

    /** @param {boolean} hidden إخفاء تام (إعلان أو تنقّل): يمسح المحتوى أيضًا فلا يبقى شيء من السابق. */
    setHidden(hidden) {
      if (hidden) {
        clear();
        host.setAttribute('hidden', '');
      } else {
        host.removeAttribute('hidden');
      }
    },

    /** @param {string | null | undefined} lang رمز لغة مسار الأصل (يُطبَّق على الأسطر التالية). */
    setLang(lang) {
      const next = lang ? String(lang) : 'en';
      if (next === enLang) return;
      enLang = next;
      redrawShown();
    },

    /** @param {string | null | undefined} lang رمز لغة الترجمة، أو null «غير محددة» (AA1؛ يُطبَّق على الأسطر التالية). */
    setTranslationLang(lang) {
      const next = lang ? String(lang) : null;
      if (next === trLang) return;
      trLang = next;
      redrawShown();
    },

    /** @param {{ background: 'none' | 'soft' | 'solid' }} a */
    setAppearance(a) {
      stage.setAttribute('data-bg', a.background);
    },

    /**
     * عائلة الخط بسلسلتها (المختار ثم المراعي المضمّن ثم خطوط النظام العربية)، وحد عرض السطر لكلٍّ بوحدة em (ف2)؛ تتغير
     * دون إعادة بناء الأسطر.
     * @param {{ ar: string, en: string, capAr?: number, capEn?: number }} f
     */
    setFont(f) {
      const set = (name, value) => {
        if (host.style.getPropertyValue(name) !== value) host.style.setProperty(name, value);
      };
      set('--tj-sub-font', f.ar);
      set('--tj-sub-font-en', f.en);
      if (Number.isFinite(f.capAr)) set('--tj-cap-ar', `${f.capAr}em`);
      if (Number.isFinite(f.capEn)) set('--tj-cap-en', `${f.capEn}em`);
      fitAll();
    },

    /** @param {{ fontPx: number, anchor: 'top' | 'bottom', offsetPx: number }} l */
    setLayout(l) {
      host.style.setProperty('--tj-fs', `${l.fontPx}px`);
      host.style.setProperty('--tj-offset', `${l.offsetPx}px`);
      host.setAttribute('data-anchor', l.anchor);
      layout = { anchor: l.anchor, offsetPx: l.offsetPx };
      fitAll();
      publishStage();
    },

    /** @param {Element} parent يضع المضيف آخر أبناء الأب إن لم يكن فيه. */
    attachTo(parent) {
      if (host.parentNode === parent) return;
      parent.appendChild(host);
      fitAll();
    },

    isConnected: () => host.isConnected,

    /** للحزام الحي وحده: ما يظهر الآن (نصًا واتجاهًا). لا يدخل تقرير التشخيص أبدًا. */
    peek(withBox = true) {
      const empty = stage.hasAttribute('data-empty');
      // أثناء التلاشي تبقى العناصر دقائق قليلة في DOM وهي غير مرئية: الظاهر فعلًا لا يشملها.
      const rows = empty ? [] : [...stage.children].map((c) => ({ kind: c.className.includes('en') ? 'en' : 'ar', dir: c.getAttribute('dir'), text: c.textContent }));
      // الخط المطبَّق فعلًا على أول سطر (للحزام الحي: عائلة الخط وحجمه وعرض كل سطر).
      const first = stage.children[0];
      const cs = first && win.getComputedStyle ? win.getComputedStyle(first) : null;
      const box = (e) => {
        const r = e.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), height: Math.round(r.height) };
      };
      return {
        lines: rows, hidden: host.hasAttribute('hidden'), empty, fading: empty && stage.children.length > 0, connected: host.isConnected,
        ...(withBox ? { host: box(host), stage: box(stage), lineBoxes: [...stage.children].map(box) } : {}),
        font: cs ? { family: cs.fontFamily, size: cs.fontSize, weight: cs.fontWeight } : null,
      };
    },

    destroy() {
      cancelFade();
      fonts?.removeEventListener?.('loadingdone', onFonts);
      sheet.release();
      host.remove();
    },
  };
}
