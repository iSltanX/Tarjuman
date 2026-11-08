// البحث والاستبدال في المحرّر (R51، مواصفة التصميم §١٩.٩): حقل بحث في شريط الأدوات يركّزه ⌘F (القائمة افتراضية فلا يرى
// بحث المتصفح صفوفها المخفية)، وخيارات منبثقة (العربية أو الإنجليزية للقراءة فقط، وكلمة كاملة، وتجاهل التشكيل)، وعدّاد
// «3 من 41» بـ↑↓، وصف استبدال: «استبدال هنا» و«معاينة استبدال الكل…» بمربعات اختيار. المطابقة في searchCues والاستبدال
// الحرفي في planReplace (P11)، وتطبيقه خطوة واحدة في الجلسة. هنا الحالة والعناصر فقط؛ لا يمس التوقيت ولا المرجع.
//
// كل مطابقة تحمل نصها كما وُجد، فلا يُستبدل موضع تغيّر نصه بعد البحث، والبحث المعلّق يُنفَّذ قبل الاستبدال (U23). وما أُدرج
// باستبدال هنا لا يصير مطابقة حالية حتى بحث جديد أو تنقّل صريح، فلا يعشّش البديل في نفسه (U74). وفواصل الأسطر ظاهرة «↵» في
// المقتطفات (U27). تدقيق 7a66f91.
import { keepBreaks, planReplace, searchCues } from '../../core/edit/index.js';
import { button, el } from '../../ui/components.js';
import { COUNT_FORMS, formatCount, textDirection } from '../../ui/format.js';
import { openDialog, setDisabled } from './dialogs.js';
import { COUNT, isMac, keyHint } from './text.js';

const DELAY_MS = 120;
const MAX_PREVIEW = 400;
const CONTEXT = 24;

/** نص في سطر واحد، وفاصل السطر «↵» ظاهر فيه (فيرى المستخدم أن المطابقة تعبره). @param {string} s */
export const flatten = (s) => s.replace(/\s*\n\s*/g, ' ↵ ');

/** مقتطف حول المطابقة بأجزائه الثلاثة: قبلها، وهي، وبعدها (في سطر واحد، وفواصل الأسطر «↵»). */
export function snippet(text, start, end, around = CONTEXT) {
  const flat = flatten;
  const from = Math.max(0, start - around);
  const to = Math.min(text.length, end + around);
  return {
    before: (from > 0 ? '…' : '') + flat(text.slice(from, start)),
    hit: flat(text.slice(start, end)),
    after: flat(text.slice(end, to)) + (to < text.length ? '…' : ''),
  };
}

/**
 * @param {{
 *   doc: Document,
 *   cues: () => { n: number, startMs: number, endMs: number, text: string }[],
 *   english: () => string[],
 *   readOnly: () => string | null,
 *   active: () => number | null,
 *   onChange: () => void,
 *   reveal: (index: number, match: { start: number, end: number } | null, opts: { focus: boolean, field: 'ar' | 'en' }) => void,
 *   replace: (matches: { index: number, start: number, end: number, text?: string }[], replacement: string, only: number[]) => { ok: boolean, count: number },
 *   extra?: HTMLElement | null,
 * }} o extra عنصر يُلحق بآخر صف البحث (زر طي الأدوات)
 */
export function createSearch({ doc, cues, english, readOnly, active, onChange, reveal, replace, extra = null }) {
  const win = doc.defaultView;
  const S = {
    query: '', key: '', field: /** @type {'ar' | 'en'} */ ('ar'), wholeWord: false, ignoreMarks: false,
    matches: /** @type {{ index: number, start: number, end: number, text?: string }[]} */ ([]), current: -1,
    byIndex: /** @type {Map<number, number[]>} */ (new Map()), replaceOpen: false, timer: 0,
    /**
     * ما أُدرج باستبدال هنا منذ آخر بحث جديد أو تنقّل، ونص مقطعه بعده: إن تغيّر المقطع بعدها (تراجع أو كتابة) سقط النطاق،
     * فلا يحجب مطابقة حقيقية عادت أو انزاحت (مراجعة C3).
     * @type {{ index: number, start: number, end: number, text: string }[]}
     */
    inserted: [],
  };
  /** حكم «داخل ما أُدرج» على المقاطع الحاضرة (تُمرَّر مرة لكل بحث، لا تُبنى لكل مطابقة). */
  const insertedIn = (list) => (m) => S.inserted.some((r) => r.index === m.index && list[m.index]?.text === r.text && m.start >= r.start && m.end <= r.end);
  const mac = isMac(win);

  const input = el('input', {
    className: 'ed-search__input',
    attrs: { type: 'search', placeholder: `بحث في المقاطع (${keyHint('F', { mac })})`, 'aria-label': 'بحث في المقاطع', autocomplete: 'off', spellcheck: 'false' },
    on: {
      input: () => schedule(),
      keydown: (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          run();
          step(e.shiftKey ? -1 : 1, { focus: false });
        } else if (e.key === 'Escape' && input.value) {
          e.preventDefault();
          input.value = '';
          run();
        }
      },
    },
    doc,
  });
  const fieldSel = el('select', {
    className: 'ed-select',
    attrs: { 'aria-label': 'البحث في' },
    on: { change: () => { S.field = fieldSel.value === 'en' ? 'en' : 'ar'; run(); } },
    children: [el('option', { text: 'في الترجمة', attrs: { value: 'ar' }, doc }), el('option', { text: 'في الأصل (قراءة فقط)', attrs: { value: 'en' }, doc })],
    doc,
  });
  const check = (label, key) => {
    const box = el('input', { attrs: { type: 'checkbox' }, on: { change: () => { S[key] = box.checked; run(); } }, doc });
    return el('label', { className: 'ed-radio', children: [box, el('span', { text: label, doc })], doc });
  };
  // لوحة خيارات لا قائمة: الزر يتحكم بها (aria-expanded وaria-controls) بلا aria-haspopup الذي يعني قائمة (I06).
  const optsPanel = el('div', {
    className: 'ed-search__opts', attrs: { role: 'group', id: 'ed-search-opts', 'aria-label': 'خيارات البحث', hidden: '' },
    children: [fieldSel, check('كلمة كاملة', 'wholeWord'), check('تجاهل التشكيل', 'ignoreMarks')],
    doc,
  });
  const optsBtn = button({ label: 'الخيارات', size: 'sm', variant: 'ghost', onClick: () => toggleOpts(), doc });
  optsBtn.setAttribute('aria-expanded', 'false');
  optsBtn.setAttribute('aria-controls', optsPanel.id);
  const counter = el('span', { className: 'ed-search__count tj-caption', attrs: { 'aria-live': 'polite' }, doc });
  const prevBtn = button({ label: '↑', size: 'sm', title: 'السابقة (⇧ Enter)', onClick: () => step(-1, { focus: true }), doc });
  const nextBtn = button({ label: '↓', size: 'sm', title: 'التالية (Enter)', onClick: () => step(1, { focus: true }), doc });
  prevBtn.setAttribute('aria-label', 'النتيجة السابقة');
  nextBtn.setAttribute('aria-label', 'النتيجة التالية');
  const replaceToggle = button({ label: 'استبدال', size: 'sm', onClick: () => toggleReplace(), doc });
  replaceToggle.setAttribute('aria-expanded', 'false');

  const replaceIn = el('input', {
    className: 'ed-search__input',
    attrs: { type: 'text', placeholder: 'استبدل بـ', 'aria-label': 'نص الاستبدال', autocomplete: 'off', spellcheck: 'false' },
    on: { keydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); replaceHere(); } }, input: () => render() },
    doc,
  });
  const hereBtn = button({ label: 'استبدال هنا', size: 'sm', onClick: () => replaceHere(), doc });
  const allBtn = button({ label: 'معاينة استبدال الكل…', size: 'sm', onClick: () => previewAll(), doc });
  const replaceRow = el('div', { className: 'ed-toolbar__row ed-search__replace', attrs: { hidden: '' }, children: [replaceIn, hereBtn, allBtn], doc });
  const where = el('p', { className: 'ed-search__where tj-caption', doc });

  const root = el('div', {
    className: 'ed-search',
    children: [
      el('div', {
        className: 'ed-toolbar__row',
        children: [
          el('span', { className: 'ed-search__box', children: [input, optsBtn, optsPanel], doc }),
          counter, prevBtn, nextBtn, replaceToggle, extra,
        ].filter(Boolean),
        doc,
      }),
      replaceRow, where,
    ],
    doc,
  });

  doc.addEventListener('click', (e) => {
    if (!optsPanel.hidden && !optsPanel.contains(e.target) && !optsBtn.contains(e.target)) toggleOpts(false);
  });
  optsPanel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      toggleOpts(false);
      optsBtn.focus();
    }
  });

  function toggleOpts(open = optsPanel.hidden) {
    optsPanel.hidden = !open;
    optsBtn.setAttribute('aria-expanded', String(open));
    if (open) fieldSel.focus();
  }

  function toggleReplace(open = !S.replaceOpen) {
    S.replaceOpen = open;
    replaceRow.hidden = !open;
    replaceToggle.setAttribute('aria-expanded', String(open));
    if (open) replaceIn.focus();
    render();
  }

  function schedule() {
    win.clearTimeout(S.timer);
    S.timer = win.setTimeout(run, DELAY_MS);
  }

  /**
   * يعيد البحث بعد كتابة الاستعلام أو تغيّر خياراته (فتصير الحالية أقرب نتيجة من المقطع الحالي ويُمرَّر إليها)، أو بعد تغيّر
   * المقاطع (فتبقى الحالية قرب موضعها).
   */
  function run({ after = null } = {}) {
    win.clearTimeout(S.timer);
    S.timer = 0;
    const key = `${input.value}|${S.field}|${S.wholeWord}|${S.ignoreMarks}`;
    const fresh = key !== S.key;
    S.key = key;
    S.query = input.value;
    if (fresh) S.inserted = [];
    // بعد «استبدال هنا» تكون الحالية أول نتيجة بعد النص المُدرَج، لا داخله (وإلا عشّش الاستبدال في نفسه).
    const was = fresh ? null : after ?? S.matches[S.current];
    const list = cues();
    const found = S.query.trim() ? searchCues(list, S.query, { field: S.field, english: S.field === 'en' ? english() : null, wholeWord: S.wholeWord, ignoreMarks: S.ignoreMarks }) : [];
    // نص كل مطابقة عربية كما وُجد: الاستبدال يرفض موضعًا تغيّر بعده.
    S.matches = S.field === 'ar' ? found.map((m) => ({ ...m, text: list[m.index].text.slice(m.start, m.end) })) : found;
    const inserted = insertedIn(list);
    S.byIndex = new Map();
    S.matches.forEach((m, k) => {
      if (!S.byIndex.has(m.index)) S.byIndex.set(m.index, []);
      S.byIndex.get(m.index).push(k);
    });
    if (!S.matches.length) S.current = -1;
    else if (fresh) {
      const from = active() ?? 0;
      const k = S.matches.findIndex((m) => m.index >= from);
      S.current = k < 0 ? 0 : k;
    } else if (!was) {
      const k = Math.min(Math.max(S.current, 0), S.matches.length - 1);
      S.current = inserted(S.matches[k]) ? S.matches.findIndex((m) => !inserted(m)) : k;
    } else {
      // الأولى بعد الموضع خارج ما أُدرج، وإلا الالتفاف إلى أول ما لم يُدرج، وإلا لا حالية (لا التفاف إلى المُدرَج نفسه؛ U74).
      const k = S.matches.findIndex((m) => (m.index > was.index || (m.index === was.index && m.start >= was.start)) && !inserted(m));
      S.current = k >= 0 ? k : S.inserted.length ? S.matches.findIndex((m) => !inserted(m)) : S.matches.length - 1;
    }
    render();
    onChange();
    const m = S.matches[S.current];
    if (fresh && m) reveal(m.index, m, { focus: false, field: S.field });
  }

  function step(dir, { focus }) {
    if (!S.matches.length) return;
    // التنقّل الصريح يجعل أي نتيجة حالية، ومنها ما أُدرج.
    S.inserted = [];
    S.current = S.current < 0 ? (dir > 0 ? 0 : S.matches.length - 1) : (S.current + dir + S.matches.length) % S.matches.length;
    render();
    onChange();
    const m = S.matches[S.current];
    reveal(m.index, m, { focus, field: S.field });
  }

  function replaceWhy() {
    const ro = readOnly();
    if (ro) return ro;
    if (S.field === 'en') return 'الأصل للقراءة فقط: ابحث في الترجمة للاستبدال.';
    if (!S.matches.length) return S.query.trim() ? 'لا نتائج لاستبدالها.' : 'اكتب ما تبحث عنه أولًا.';
    return null;
  }

  /** «استبدال هنا» وحده: لا مطابقة خارج ما استُبدل للتو (التنقّل بـ↑↓ يختارها صراحةً). */
  function hereWhy() {
    return replaceWhy() ?? (S.current < 0 && S.inserted.length && S.matches.every(insertedIn(cues())) ? 'لا مطابقات أخرى خارج ما استُبدل؛ اختر نتيجة بـ↑↓ لتستبدلها.' : null);
  }

  function replaceHere() {
    // بحث معلّق بعد تغيّر المقاطع (تراجع أو كتابة) يُنفَّذ أولًا، فالاستبدال في موضع حاضر لا قديم (U23).
    if (S.timer) run();
    if (hereWhy()) return;
    if (S.current < 0) {
      const inserted = insertedIn(cues());
      S.current = S.matches.findIndex((x) => !inserted(x));
    }
    const m = S.matches[S.current];
    const r = replace(S.matches, replaceIn.value, [S.current]);
    if (!r.ok) return;
    const len = keepBreaks(m.text ?? '', replaceIn.value).length;
    const delta = len - (m.end - m.start);
    const now = cues()[m.index]?.text ?? '';
    // نطاقات المقطع نفسه تنزاح بالفرق وتأخذ نصه الجديد؛ وغيرها كما هي.
    S.inserted = S.inserted.map((x) => (x.index !== m.index ? x : { ...x, text: now, ...(x.start >= m.end ? { start: x.start + delta, end: x.end + delta } : {}) }));
    S.inserted.push({ index: m.index, start: m.start, end: m.start + len, text: now });
    run({ after: { index: m.index, start: m.start + len } });
    const cur = S.matches[S.current];
    if (cur) reveal(cur.index, cur, { focus: false, field: 'ar' });
    else reveal(m.index, null, { focus: false, field: 'ar' });
  }

  async function previewAll() {
    if (S.timer) run();
    if (replaceWhy()) return;
    const list = cues();
    const replacement = replaceIn.value;
    // ما عُرض هو ما يُطبَّق: المطابقات ملتقطة عند فتح الحوار، فلا يغيّرها إعادة بحث وهو مفتوح.
    const matches = S.matches;
    const picked = new Set(matches.map((_, k) => k));
    const rows = matches.slice(0, MAX_PREVIEW).map((m, k) => {
      const c = list[m.index];
      const sn = snippet(c.text, m.start, m.end);
      const box = el('input', { attrs: { type: 'checkbox', checked: '', 'aria-label': `استبدال في المقطع ${c.n}` }, on: { change: () => { if (box.checked) picked.add(k); else picked.delete(k); sync(); } }, doc });
      return el('label', {
        className: 'ed-replace-item',
        children: [
          box,
          el('span', { className: 'ed-replace-item__n tj-mono-sm', text: String(c.n), doc }),
          el('span', {
            className: 'ed-replace-item__text', dir: textDirection(`${sn.before}${sn.hit}${sn.after}`),
            children: [sn.before, el('del', { text: sn.hit, doc }), el('ins', { text: flatten(keepBreaks(c.text.slice(m.start, m.end), replacement)) || '∅', doc }), sn.after],
            doc,
          }),
        ],
        doc,
      });
    });
    let applyBtn = null;
    const total = el('p', { className: 'tj-caption', doc });
    const sync = () => {
      const cuesTouched = new Set([...picked].map((k) => matches[k].index)).size;
      total.textContent = `المختار: ${formatCount(picked.size, COUNT.match)} في ${formatCount(cuesTouched, COUNT_FORMS.cue)}.`;
      if (applyBtn) {
        applyBtn.firstChild.textContent = `استبدال ${picked.size === 2 ? 'موضعين' : formatCount(picked.size, COUNT.match)}`;
        setDisabled(applyBtn, picked.size ? null : 'اختر موضعًا واحدًا على الأقل.');
      }
    };
    const plan = planReplace(list, matches, replacement);
    const content = el('div', {
      className: 'tj-stack',
      children: [
        el('p', { className: 'tj-body-sm', text: `«${S.query}» ← «${replacement}». حرفيًا في المواضع المختارة وحدها؛ التوقيت والأرقام كما هي، وكل الاستبدال خطوة واحدة في التراجع.`, doc }),
        el('div', { className: 'ed-preview-table ed-replace-list', children: rows, doc }),
        matches.length > MAX_PREVIEW ? el('p', { className: 'tj-caption', text: `تُعرض أول ${MAX_PREVIEW} موضع؛ والباقي (${matches.length - MAX_PREVIEW}) يُستبدل معها.`, doc }) : null,
        total,
      ],
      doc,
    });
    sync();
    const v = await openDialog({
      doc, size: 'lg', title: 'معاينة استبدال الكل', content, focus: 'cancel',
      actions: [
        { label: `استبدال ${picked.size === 2 ? 'موضعين' : formatCount(picked.size, COUNT.match)}`, value: 'apply', variant: 'primary', ref: (b) => { applyBtn = b; sync(); } },
        { label: 'إلغاء', value: 'cancel' },
      ],
    });
    if (v !== 'apply' || !picked.size) return;
    replace(matches, replacement, [...picked].sort((a, b) => a - b));
    run();
  }

  function render() {
    const n = S.matches.length;
    counter.textContent = !S.query.trim() ? '' : n ? `${S.current < 0 ? 0 : S.current + 1} من ${n}` : 'لا نتائج';
    for (const b of [prevBtn, nextBtn]) setDisabled(b, n ? null : 'لا نتائج');
    setDisabled(hereBtn, hereWhy());
    setDisabled(allBtn, replaceWhy());
    const m = S.matches[S.current];
    if (m) {
      const list = cues();
      const text = S.field === 'en' ? english()[m.index] ?? '' : list[m.index].text;
      const sn = snippet(text, m.start, m.end);
      where.replaceChildren(`المقطع ${list[m.index].n}: `, el('span', { dir: S.field === 'en' ? 'ltr' : textDirection(`${sn.before}${sn.hit}${sn.after}`), children: [sn.before, el('mark', { text: sn.hit, doc }), sn.after], doc }));
      where.hidden = false;
    } else {
      where.replaceChildren();
      where.hidden = true;
    }
  }

  render();
  return {
    root,
    get state() { return S; },
    /** ⌘F. */
    focus() {
      input.focus();
      input.select();
    },
    /** المقاطع تغيّرت (كتابة أو بنية): يُعاد البحث بعد سكون قصير. */
    refresh() {
      if (S.query.trim()) schedule();
      else render();
    },
    render,
    /** حالة صف لتمييزه: 'current' أو 'match' أو null. @param {number} index */
    rowState(index) {
      const ks = S.byIndex.get(index);
      if (!ks) return null;
      return ks.includes(S.current) ? 'current' : 'match';
    },
    /** مواضع المطابقة في المرجع الإنجليزي لصف (لتمييزها فيه)، أو null. @param {number} index */
    englishRanges(index) {
      if (S.field !== 'en') return null;
      const ks = S.byIndex.get(index);
      return ks ? ks.map((k) => S.matches[k]) : null;
    },
    /** المطابقة الحالية إن كانت في هذا الصف (لتحديدها في النص عند التركيز). @param {number} index */
    currentIn(index) {
      const m = S.matches[S.current];
      return m && m.index === index && S.field === 'ar' ? m : null;
    },
  };
}
