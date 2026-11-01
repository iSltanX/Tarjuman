// صف المقطع في القائمة (مواصفة التصميم §١١.٢ TJ/Editor/SegmentRow): مربع تحديد، والرقم وعلامة «معدّل»،
// وحقلا الزمن LTR، والمدة، والنص العربي، والإنجليزي المرجعي، وزرّا ± للمقطع، ورسالة المشكلة تحته. الأحداث
// تُفوَّض من حاوية القائمة (app.js)؛ هنا البناء والتحديث فقط. الحقل المركَّز لا يُكتب فوقه إلا بفعل صريح
// (تراجع أو نقل)، فلا يقفز المؤشر أثناء الكتابة.
import { messageFor } from '../../core/errors/index.js';
import { el } from '../../ui/components.js';
import { formatTimecode } from '../../ui/format.js';
import { durationText, seconds } from './text.js';
import { ROW, textLines } from './virtual.js';

const HAS_ARABIC = /\p{Script=Arabic}/u;
const HAS_LETTER = /\p{L}/u;

/** سطر الترجمة RTL إن احتوى حرفًا عربيًا ولو بدأ بكلمة لاتينية، وLTR إن خلا منه (§٤). @param {string} text */
export const textDir = (text) => (HAS_ARABIC.test(text) || !HAS_LETTER.test(text) ? 'rtl' : 'ltr');

/**
 * @typedef {{
 *   rows: ({ type: 'cue', index: number } | { type: 'missing', n: number })[],
 *   session: ReturnType<typeof import('../../core/edit/index.js').createEditSession>,
 *   report: import('../../core/edit/issues.js').IssueReport,
 *   refs: string[], showEnglish: boolean, readOnly: boolean,
 *   selection: Set<number>, activeIndex: number | null, stepMs: number
 * }} RowContext
 */

/** @param {Document} doc @param {() => RowContext} ctx */
export function createRows(doc, ctx) {
  const timeInput = (field, n) => el('input', {
    className: 'ed-time',
    dir: 'ltr',
    attrs: { type: 'text', 'data-field': field, autocomplete: 'off', spellcheck: 'false', 'aria-label': `${field === 'start' ? 'بداية' : 'نهاية'} المقطع ${n}` },
    doc,
  });
  const nudge = (dir) => el('button', {
    className: 'tj-btn tj-btn--ghost tj-btn--sm ed-row__nudge-btn',
    text: dir < 0 ? '−' : '+',
    attrs: { type: 'button', 'data-act': 'nudge', 'data-dir': String(dir) },
    doc,
  });

  /** @param {number} row */
  function create(row) {
    const c = ctx();
    const r = c.rows[row];
    if (r.type === 'missing') {
      return el('div', {
        className: 'ed-row ed-row--missing',
        attrs: { 'data-row': String(row), role: 'listitem' },
        children: [
          el('span', { className: 'ed-row__n tj-mono', text: String(r.n), doc }),
          el('p', { className: 'ed-row__missing', text: `المقطع ${r.n} غير موجود في الملف العربي`, doc }),
        ],
        doc,
      });
    }
    const cue = c.session.cueAt(r.index);
    const node = el('div', {
      className: 'ed-row',
      attrs: { 'data-row': String(row), 'data-index': String(r.index), role: 'listitem', 'aria-label': `المقطع ${cue.n}` },
      children: [
        el('input', { className: 'ed-row__check', attrs: { type: 'checkbox', 'data-act': 'select', 'aria-label': `تحديد المقطع ${cue.n}` }, doc }),
        el('span', {
          className: 'ed-row__n tj-mono',
          children: [el('span', { text: String(cue.n), doc }), el('span', { className: 'ed-row__dot', attrs: { 'aria-hidden': 'true' }, doc }), el('span', { className: 'tj-sr-only ed-row__edited', doc })],
          doc,
        }),
        timeInput('start', cue.n),
        timeInput('end', cue.n),
        el('span', { className: 'ed-row__dur tj-mono-sm', doc }),
        el('textarea', { className: 'ed-row__text', attrs: { 'data-field': 'text', 'aria-label': `نص المقطع ${cue.n}` }, doc }),
        el('p', { className: 'ed-row__en', dir: 'ltr', doc }),
        el('span', { className: 'ed-row__nudge', children: [nudge(-1), nudge(1)], doc }),
        el('p', { className: 'ed-row__msg', doc }),
      ],
      doc,
    });
    update(node, row, true);
    return node;
  }

  /** @param {HTMLElement} node @param {number} row @param {boolean} force */
  function update(node, row, force) {
    const c = ctx();
    const r = c.rows[row];
    if (r.type !== 'cue') return;
    const i = r.index;
    const cue = c.session.cueAt(i);
    const issues = c.report.byIndex.get(i) ?? [];
    const error = issues.find((x) => x.tone === 'error');
    const first = error ?? issues[0];
    const edited = c.session.isChanged(i);
    const active = doc.activeElement;
    node.classList.toggle('is-edited', edited);
    node.classList.toggle('is-selected', c.selection.has(i));
    node.classList.toggle('is-active', c.activeIndex === i);
    node.classList.toggle('is-error', Boolean(error));
    node.classList.toggle('is-warning', !error && issues.length > 0);
    node.classList.toggle('is-readonly', c.readOnly);

    const [check, num, start, end, dur, text, en, nudges, msg] = node.children;
    check.checked = c.selection.has(i);
    check.disabled = c.readOnly;
    num.querySelector('.ed-row__edited').textContent = edited ? 'معدّل' : '';

    for (const [input, field] of [[start, 'start'], [end, 'end']]) {
      const want = c.session.draftAt(i, field) ?? formatTimecode(field === 'start' ? cue.startMs : cue.endMs);
      if ((force || active !== input) && input.value !== want) input.value = want;
      input.readOnly = c.readOnly;
      const bad = issues.some((x) => x.tone === 'error' && x.field === field);
      input.setAttribute('aria-invalid', bad ? 'true' : 'false');
      if (first && (first.field === field)) input.setAttribute('aria-describedby', `ed-msg-${i}`);
      else input.removeAttribute('aria-describedby');
    }
    dur.textContent = cue.endMs > cue.startMs ? durationText(cue.endMs - cue.startMs) : '—';

    if ((force || active !== text) && text.value !== cue.text) text.value = cue.text;
    text.dir = textDir(text.value);
    text.readOnly = c.readOnly;
    text.style.height = `${textLines(cue.text) * ROW.line + ROW.fieldChrome}px`;

    en.textContent = c.refs[i] ?? '';
    en.hidden = !c.showEnglish;

    nudges.hidden = c.readOnly;
    const step = seconds(c.stepMs);
    nudges.children[0].setAttribute('aria-label', `تقديم المقطع ${cue.n} ${step} ث (يظهر أبكر)`);
    nudges.children[0].title = `تقديم هذا المقطع ${step} ث (يظهر أبكر)`;
    nudges.children[1].setAttribute('aria-label', `تأخير المقطع ${cue.n} ${step} ث (يظهر لاحقًا)`);
    nudges.children[1].title = `تأخير هذا المقطع ${step} ث (يظهر لاحقًا)`;

    msg.id = `ed-msg-${i}`;
    msg.hidden = !first;
    msg.className = `ed-row__msg${error ? ' ed-row__msg--error' : ''}`;
    msg.textContent = first ? `${messageFor(first.code, first.params ?? undefined)}${issues.length > 1 ? ` (+${issues.length - 1})` : ''}` : '';
  }

  return { create, update };
}
