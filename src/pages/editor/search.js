// البحث والاستبدال في المحرّر (R51، مواصفة التصميم §١٩.٩): حقل بحث في شريط الأدوات يركّزه ⌘F (القائمة افتراضية فلا يرى
// بحث المتصفح صفوفها المخفية)، وخيارات منبثقة (العربية أو الإنجليزية للقراءة فقط، وكلمة كاملة، وتجاهل التشكيل)، وعدّاد
// «3 من 41» بـ↑↓، وصف استبدال: «استبدال هنا» و«معاينة استبدال الكل…» بمربعات اختيار. المطابقة في searchCues والاستبدال
// الحرفي في planReplace (P11)، وتطبيقه خطوة واحدة في الجلسة. هنا الحالة والعناصر فقط؛ لا يمس التوقيت ولا المرجع.
import { planReplace, searchCues } from '../../core/edit/index.js';
import { button, el } from '../../ui/components.js';
import { COUNT_FORMS, formatCount } from '../../ui/format.js';
import { openDialog, setDisabled } from './dialogs.js';
import { COUNT } from './text.js';

const DELAY_MS = 120;
const MAX_PREVIEW = 400;
const CONTEXT = 24;

/** مقتطف حول المطابقة بأجزائه الثلاثة: قبلها، وهي، وبعدها (بلا فواصل أسطر). */
export function snippet(text, start, end, around = CONTEXT) {
  const flat = (s) => s.replace(/\s*\n\s*/g, ' ');
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
 *   replace: (matches: { index: number, start: number, end: number }[], replacement: string, only: number[]) => { ok: boolean, count: number },
 * }} o
 */
export function createSearch({ doc, cues, english, readOnly, active, onChange, reveal, replace }) {
  const win = doc.defaultView;
  const S = {
    query: '', key: '', field: /** @type {'ar' | 'en'} */ ('ar'), wholeWord: false, ignoreMarks: false,
    matches: /** @type {{ index: number, start: number, end: number }[]} */ ([]), current: -1,
    byIndex: /** @type {Map<number, number[]>} */ (new Map()), replaceOpen: false, timer: 0,
  };

  const input = el('input', {
    className: 'ed-search__input',
    attrs: { type: 'search', placeholder: 'بحث في المقاطع (⌘F)', 'aria-label': 'بحث في المقاطع', autocomplete: 'off', spellcheck: 'false' },
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
    children: [el('option', { text: 'في العربية', attrs: { value: 'ar' }, doc }), el('option', { text: 'في الإنجليزية (قراءة فقط)', attrs: { value: 'en' }, doc })],
    doc,
  });
  const check = (label, key) => {
    const box = el('input', { attrs: { type: 'checkbox' }, on: { change: () => { S[key] = box.checked; run(); } }, doc });
    return el('label', { className: 'ed-radio', children: [box, el('span', { text: label, doc })], doc });
  };
  const optsPanel = el('div', {
    className: 'ed-search__opts', attrs: { role: 'group', 'aria-label': 'خيارات البحث', hidden: '' },
    children: [fieldSel, check('كلمة كاملة', 'wholeWord'), check('تجاهل التشكيل', 'ignoreMarks')],
    doc,
  });
  const optsBtn = button({ label: 'الخيارات', size: 'sm', variant: 'ghost', onClick: () => toggleOpts(), doc });
  optsBtn.setAttribute('aria-expanded', 'false');
  optsBtn.setAttribute('aria-haspopup', 'true');
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
          counter, prevBtn, nextBtn, replaceToggle,
        ],
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
    const key = `${input.value}|${S.field}|${S.wholeWord}|${S.ignoreMarks}`;
    const fresh = key !== S.key;
    S.key = key;
    S.query = input.value;
    // بعد «استبدال هنا» تكون الحالية أول نتيجة بعد النص المُدرَج، لا داخله (وإلا عشّش الاستبدال في نفسه).
    const was = fresh ? null : after ?? S.matches[S.current];
    const list = cues();
    S.matches = S.query.trim() ? searchCues(list, S.query, { field: S.field, english: S.field === 'en' ? english() : null, wholeWord: S.wholeWord, ignoreMarks: S.ignoreMarks }) : [];
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
    } else if (!was) S.current = Math.min(Math.max(S.current, 0), S.matches.length - 1);
    else {
      const k = S.matches.findIndex((m) => m.index > was.index || (m.index === was.index && m.start >= was.start));
      S.current = k < 0 ? S.matches.length - 1 : k;
    }
    render();
    onChange();
    const m = S.matches[S.current];
    if (fresh && m) reveal(m.index, m, { focus: false, field: S.field });
  }

  function step(dir, { focus }) {
    if (!S.matches.length) return;
    S.current = S.current < 0 ? (dir > 0 ? 0 : S.matches.length - 1) : (S.current + dir + S.matches.length) % S.matches.length;
    render();
    onChange();
    const m = S.matches[S.current];
    reveal(m.index, m, { focus, field: S.field });
  }

  function replaceWhy() {
    const ro = readOnly();
    if (ro) return ro;
    if (S.field === 'en') return 'الإنجليزية للقراءة فقط: ابحث في العربية للاستبدال.';
    if (!S.matches.length) return S.query.trim() ? 'لا نتائج لاستبدالها.' : 'اكتب ما تبحث عنه أولًا.';
    return null;
  }

  function replaceHere() {
    if (replaceWhy()) return;
    if (S.current < 0) S.current = 0;
    const m = S.matches[S.current];
    const r = replace(S.matches, replaceIn.value, [S.current]);
    if (!r.ok) return;
    run({ after: { index: m.index, start: m.start + replaceIn.value.length } });
    if (S.matches.length) reveal(S.matches[S.current].index, S.matches[S.current], { focus: false, field: 'ar' });
    else reveal(m.index, null, { focus: false, field: 'ar' });
  }

  async function previewAll() {
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
            className: 'ed-replace-item__text', dir: 'auto',
            children: [sn.before, el('del', { text: sn.hit, doc }), el('ins', { text: replacement || '∅', doc }), sn.after],
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
        applyBtn.firstChild.textContent = `استبدال ${picked.size}`;
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
        el('p', { className: 'tj-caption', text: `يتغير نص ${formatCount(plan.changes.length, COUNT_FORMS.cue)}.`, doc }),
        total,
      ],
      doc,
    });
    sync();
    const v = await openDialog({
      doc, size: 'lg', title: 'معاينة استبدال الكل', content, focus: 'cancel',
      actions: [
        { label: `استبدال ${picked.size}`, value: 'apply', variant: 'primary', ref: (b) => { applyBtn = b; sync(); } },
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
    const why = replaceWhy();
    setDisabled(hereBtn, why);
    setDisabled(allBtn, why);
    const m = S.matches[S.current];
    if (m) {
      const list = cues();
      const text = S.field === 'en' ? english()[m.index] ?? '' : list[m.index].text;
      const sn = snippet(text, m.start, m.end);
      where.replaceChildren(`المقطع ${list[m.index].n}: `, el('span', { dir: S.field === 'en' ? 'ltr' : 'auto', children: [sn.before, el('mark', { text: sn.hit, doc }), sn.after], doc }));
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
