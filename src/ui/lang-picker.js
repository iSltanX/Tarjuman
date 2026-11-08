// منتقي اللغة المشترك لصفحات الإضافة (AA3، لوحتا 09 و15، ومكوّنا .lang و.lang-swap في لوحة 19): حقل بارتفاع 40 فيه تسميته
// («من» أو «إلى») واسم اللغة بالعربية، وقائمة منسدلة فيها بحث، ثم «تلقائي» إن أُتيح، ثم العربية والإنجليزية للوصول السريع (قرار سلطان)،
// ثم لغات الفيديو، ثم الأخيرة، ثم كل اللغات؛
// ولكل لغة اسمها العربي، وفي سطرها اسمها بلغتها ورمزها، وكل اسم معزول الاتجاه باتجاه لغته. الأسماء والقائمة من بيانات المتصفح
// (src/core/lang)، فلا قائمة لغات مكتوبة هنا. نمط combobox وlistbox: الحقل المكتوب يملك التركيز، والأسهم تنقل الخيار النشط
// (aria-activedescendant)، وEnter يختار، وEsc يغلق ويعيد التركيز إلى الحقل. textContent وsetAttribute فقط.
import { describeLang, knownLanguages, searchLanguages } from '../core/lang/index.js';
import { el, icon } from './components.js';

export const LANG_TEXT = Object.freeze({
  from: 'من', to: 'إلى', empty: 'اختر لغة', search: 'ابحث عن لغة', auto: 'تلقائي من ترجمة الفيديو', autoShort: 'تلقائي',
  quick: 'للوصول السريع', video: 'في هذا الفيديو', recent: 'المستخدمة مؤخرًا', all: 'كل اللغات', results: 'النتائج', none: 'لا لغة بهذا الاسم أو الرمز',
  swap: 'مبادلة اللغتين', list: 'اللغات',
});

/** القيمة «تلقائي» في حقل «من» بالإعدادات (lang-prefs AUTO_SOURCE). */
export const AUTO = 'auto';

/**
 * أول لغتين في قائمتي «من» و«إلى» للوصول السريع (قرار سلطان، 2026-11-07): العربية ثم الإنجليزية، ثم بقية اللغات. ترتيبٌ لا إلزام: أي
 * لغة أخرى تُختار كما هي، والبحث كما هو، والافتراضي لا يتغير.
 */
export const QUICK_LANGS = Object.freeze(['ar', 'en']);

let seq = 0;
/** القائمة المفتوحة الآن (واحدة في الصفحة). @type {{ close: () => void } | null} */
let openNow = null;

/** وصف لغة للعرض، والرمز الذي لا يعرفه المتصفح يبقى رمزه. @param {string} code */
const describe = (code) => describeLang(code) ?? { code, arabic: code, native: null, dir: null, known: false };

/**
 * اسم الحقل الظاهر: الاسم العربي، و«تلقائي» للقيمة التلقائية، وإلا null («اختر لغة»).
 * @param {string | null} value @param {string} [autoLabel]
 */
export function valueLabel(value, autoLabel = LANG_TEXT.auto) {
  if (value === AUTO) return autoLabel;
  return value ? describe(value).arabic : null;
}

/**
 * حقل لغة بقائمته. الحقل زر يفتح القائمة؛ والقائمة تُلحق بـanchor (حاوية الصف كله افتراضيًا) لتأخذ عرضه.
 * @param {{
 *   label: string, value: string | null, onChange: (code: string) => void, anchor?: HTMLElement | null,
 *   recent?: () => string[], video?: () => string[], auto?: string | null, note?: () => string | null,
 *   disabled?: boolean, doc?: Document,
 * }} o auto: نص خيار «تلقائي» إن أُتيح (حقل «من» في الإعدادات)؛ video: رموز لغات مسارات الفيديو؛ note: سطر تحت الحقل
 * @returns {{ root: HTMLElement, field: HTMLButtonElement, set: (v: string | null) => void, get: () => string | null, open: () => void, close: () => void, setDisabled: (d: boolean) => void }}
 */
export function langField({ label, value, onChange, anchor = null, recent = () => [], video = () => [], auto = null, quick = QUICK_LANGS, disabled = false, doc = document }) {
  const id = `tj-lang-${++seq}`;
  let current = value;
  const k = el('span', { className: 'tj-lang__k', text: label, doc });
  const v = el('span', { className: 'tj-lang__v', doc });
  const field = /** @type {HTMLButtonElement} */ (el('button', {
    className: 'tj-lang',
    attrs: { type: 'button', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-controls': `${id}-pop` },
    children: [k, v, icon('chev-down', { doc })],
    doc,
  }));
  const root = el('div', { className: 'tj-lang-pick', children: [field], doc });

  function paint() {
    const name = valueLabel(current, auto ?? LANG_TEXT.auto);
    v.textContent = name ?? LANG_TEXT.empty;
    v.classList.toggle('is-empty', !name || current === AUTO);
    // الاسم عربي دائمًا، والرمز الذي لا يعرف المتصفح اسمه لاتيني: اتجاهه من أول حرف قوي فيه، معزولًا عن جاره.
    v.setAttribute('dir', 'auto');
    field.setAttribute('aria-label', `${label}: ${name ?? LANG_TEXT.empty}`);
    field.classList.toggle('is-set', !!current && current !== AUTO);
  }
  paint();

  // ---- القائمة ----
  const input = /** @type {HTMLInputElement} */ (el('input', {
    className: 'tj-field__input tj-lang-pop__search',
    attrs: {
      type: 'search', role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': 'true', 'aria-controls': `${id}-list`,
      placeholder: LANG_TEXT.search, 'aria-label': `${LANG_TEXT.search} — ${label}`, autocomplete: 'off', spellcheck: 'false', dir: 'auto',
    },
    doc,
  }));
  const list = el('div', { className: 'tj-lang-pop__list', attrs: { id: `${id}-list`, role: 'listbox', 'aria-label': `${label}: ${LANG_TEXT.list}` }, doc });
  const pop = el('div', {
    className: 'tj-lang-pop',
    attrs: { id: `${id}-pop` },
    children: [el('div', { className: 'tj-lang-pop__search-wrap', children: [icon('search', { doc }), input], doc }), list],
    doc,
  });
  pop.hidden = true;
  /** @type {HTMLElement[]} */
  let options = [];
  let active = -1;
  let opened = false;
  /** هوية هذا المنتقي في «القائمة المفتوحة الآن». */
  const self = { close: () => close() };

  function option(code, { autoItem = false, name = null } = {}) {
    const d = autoItem ? null : describe(code);
    const on = code === current;
    const oid = `${id}-o${options.length}`;
    const parts = autoItem ? [] : [
      d.native && d.native !== d.arabic ? el('bdi', { text: d.native, dir: d.dir === 'rtl' ? 'rtl' : 'ltr', doc }) : null,
      el('bdi', { className: 'tj-lang-item__c', text: d.code, dir: 'ltr', doc }),
    ].filter(Boolean);
    const sub = [];
    for (const [i, p] of parts.entries()) {
      if (i) sub.push(' · ');
      sub.push(p);
    }
    const o = el('div', {
      className: `tj-lang-item${on ? ' is-on' : ''}`,
      attrs: {
        id: oid, role: 'option', 'aria-selected': on ? 'true' : 'false', 'data-code': code,
        'aria-label': autoItem ? name : [d.arabic, d.native && d.native !== d.arabic ? d.native : null, d.code].filter(Boolean).join('، '),
      },
      children: [
        el('span', { className: 'tj-lang-item__name', text: autoItem ? name : d.arabic, doc }),
        sub.length ? el('span', { className: 'tj-lang-item__n', children: sub, doc }) : null,
        on ? icon('check', { doc }) : null,
      ],
      doc,
    });
    o.addEventListener('pointerdown', (e) => e.preventDefault());
    o.addEventListener('click', () => pick(code));
    options.push(o);
    return o;
  }

  const groupHead = (text) => el('div', { className: 'tj-lang-pop__label', attrs: { role: 'presentation' }, text, doc });

  function fill() {
    options = [];
    active = -1;
    const q = input.value.trim();
    const nodes = [];
    if (!q) {
      const seen = new Set();
      if (auto) {
        nodes.push(option(AUTO, { autoItem: true, name: auto }));
      }
      // العربية والإنجليزية أولًا (QUICK_LANGS)، ثم لغات الفيديو والأخيرة وكل اللغات بلا تكرار.
      const first = [...new Set(quick)].filter(Boolean);
      if (first.length) {
        nodes.push(groupHead(LANG_TEXT.quick));
        for (const c of first) {
          seen.add(c);
          nodes.push(option(c));
        }
      }
      const fromVideo = [...new Set(video())].filter((c) => c && !seen.has(c));
      if (fromVideo.length) {
        nodes.push(groupHead(LANG_TEXT.video));
        for (const c of fromVideo) {
          seen.add(c);
          nodes.push(option(c));
        }
      }
      const rec = recent().filter((c) => c && !seen.has(c));
      if (rec.length) {
        nodes.push(groupHead(LANG_TEXT.recent));
        for (const c of rec) {
          seen.add(c);
          nodes.push(option(c));
        }
      }
      nodes.push(groupHead(LANG_TEXT.all));
      for (const l of knownLanguages()) if (!seen.has(l.code)) nodes.push(option(l.code));
    } else {
      // لغات الفيديو تدخل البحث وإن لم تكن في قائمة المتصفح الثنائية (en-GB وzh-Hant).
      const extra = [...new Set([...video(), ...recent()])].filter((c) => c && !knownLanguages().some((l) => l.code === c)).map((c) => describe(c));
      const hits = searchLanguages(q, [...extra, ...knownLanguages()]);
      if (hits.length) {
        nodes.push(groupHead(LANG_TEXT.results));
        for (const l of hits) nodes.push(option(l.code));
      } else {
        nodes.push(el('div', { className: 'tj-lang-pop__none', attrs: { role: 'status' }, text: LANG_TEXT.none, doc }));
      }
    }
    list.replaceChildren(...nodes);
    const at = options.findIndex((o) => o.getAttribute('data-code') === current);
    setActive(q ? 0 : at, { scroll: true });
  }

  function setActive(i, { scroll = true } = {}) {
    if (active >= 0) options[active]?.classList.remove('is-active');
    active = options.length ? Math.max(-1, Math.min(i, options.length - 1)) : -1;
    if (active >= 0) {
      const o = options[active];
      o.classList.add('is-active');
      input.setAttribute('aria-activedescendant', o.id);
      if (scroll && typeof o.scrollIntoView === 'function') o.scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  const onOutside = (e) => {
    if (!root.contains(e.target) && !pop.contains(e.target)) close();
  };

  function open() {
    if (opened || field.getAttribute('aria-disabled') === 'true') return;
    openNow?.close();
    opened = true;
    (anchor ?? root).append(pop);
    pop.hidden = false;
    field.setAttribute('aria-expanded', 'true');
    field.classList.add('is-open');
    input.value = '';
    fill();
    doc.addEventListener('pointerdown', onOutside, true);
    openNow = self;
    input.focus();
  }

  function close({ focus = false } = {}) {
    if (!opened) return;
    opened = false;
    pop.hidden = true;
    pop.remove();
    field.setAttribute('aria-expanded', 'false');
    field.classList.remove('is-open');
    doc.removeEventListener('pointerdown', onOutside, true);
    if (openNow === self) openNow = null;
    if (focus) field.focus();
  }

  function pick(code) {
    close({ focus: true });
    if (code === current) return;
    current = code;
    paint();
    onChange(code);
  }

  field.addEventListener('click', () => (opened ? close() : open()));
  field.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      open();
    }
  });
  input.addEventListener('input', () => fill());
  input.addEventListener('keydown', (e) => {
    // أثناء التركيب بمحرر إدخال (IME) يُتمّ Enter الكلمة ولا يختار.
    if (e.isComposing) return;
    if (e.key === 'ArrowDown') setActive(active + 1);
    else if (e.key === 'ArrowUp') setActive(Math.max(0, active - 1));
    else if (e.key === 'Home' && !input.value) setActive(0);
    else if (e.key === 'End' && !input.value) setActive(options.length - 1);
    else if (e.key === 'Enter') {
      if (active >= 0) pick(options[active].getAttribute('data-code'));
    } else if (e.key === 'Escape') {
      // يغلق القائمة وحدها، لا الحوار الذي يحويها.
      e.stopPropagation?.();
      close({ focus: true });
    } else if (e.key === 'Tab') {
      // التركيز إلى الحقل قبل إزالة القائمة، فيتابع Tab وShift+Tab من موضعه.
      close({ focus: true });
      return;
    } else return;
    e.preventDefault();
  });

  function setDisabled(d) {
    if (d) {
      close();
      field.setAttribute('aria-disabled', 'true');
    } else field.removeAttribute('aria-disabled');
  }
  setDisabled(disabled);

  return {
    root, field,
    set: (x) => {
      current = x;
      paint();
    },
    get: () => current,
    open, close: () => close(), setDisabled,
  };
}

/**
 * صف «من ⇄ إلى» (لوحة 09: حقلان 40 وزر مبادلة 32 بفجوة 6). المبادلة تقلب القيمتين فورًا (و«تلقائي» لا يُنقل إلى «إلى»). القائمة
 * تُلحق بالصف فتأخذ عرضه كله.
 * @param {{
 *   from: string | null, to: string | null, onChange: (pair: { from: string | null, to: string | null }, why: 'from' | 'to' | 'swap') => void,
 *   recent?: () => string[], video?: () => string[], autoFrom?: string | null, doc?: Document,
 * }} o
 */
export function langPair({ from, to, onChange, recent = () => [], video = () => [], autoFrom = null, doc = document }) {
  const row = el('div', { className: 'tj-lang-row', attrs: { role: 'group', 'aria-label': 'لغتا الترجمة' }, doc });
  let pair = { from, to };
  const emit = (why) => onChange({ ...pair }, why);
  const fromField = langField({
    label: LANG_TEXT.from, value: from, anchor: row, recent, video, auto: autoFrom, doc,
    onChange: (c) => {
      pair = { ...pair, from: c };
      emit('from');
    },
  });
  const toField = langField({
    label: LANG_TEXT.to, value: to, anchor: row, recent, doc,
    onChange: (c) => {
      pair = { ...pair, to: c };
      emit('to');
    },
  });
  const swap = el('button', {
    className: 'tj-lang-swap', attrs: { type: 'button', 'aria-label': LANG_TEXT.swap, title: LANG_TEXT.swap },
    children: [icon('swap', { doc })],
    doc,
  });
  swap.addEventListener('click', () => {
    if (swap.getAttribute('aria-disabled') === 'true') return;
    const nextFrom = pair.to;
    // «تلقائي» قيمة «من» وحدها: تنتقل إلى «إلى» فارغةً لا «تلقائي».
    const nextTo = pair.from === AUTO ? null : pair.from;
    pair = { from: nextFrom, to: nextTo };
    fromField.set(pair.from);
    toField.set(pair.to);
    emit('swap');
  });
  row.append(fromField.root, swap, toField.root);
  return {
    root: row, fromField, toField, swap,
    get: () => ({ ...pair }),
    set: (p) => {
      pair = { from: p.from, to: p.to };
      fromField.set(pair.from);
      toField.set(pair.to);
    },
    setDisabled: (d) => {
      fromField.setDisabled(d);
      toField.setDisabled(d);
      if (d) swap.setAttribute('aria-disabled', 'true');
      else swap.removeAttribute('aria-disabled');
    },
  };
}
