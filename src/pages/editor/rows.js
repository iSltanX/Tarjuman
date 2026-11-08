// صف المقطع في القائمة (مواصفة التصميم §١١.٢ TJ/Editor/SegmentRow): مربع تحديد، والرقم وعلامة «معدّل»،
// وحقلا الزمن LTR، والمدة، والنص العربي، والإنجليزي المرجعي، وزرّا ± للمقطع، ورسالة المشكلة تحته. الأحداث
// تُفوَّض من حاوية القائمة (app.js)؛ هنا البناء والتحديث فقط. الحقل المركَّز لا يُكتب فوقه إلا بفعل صريح
// (تراجع أو نقل)، فلا يقفز المؤشر أثناء الكتابة.
import { messageFor } from '../../core/errors/index.js';
import { getDir, t } from '../../i18n/index.js';
import { el } from '../../ui/components.js';
import { formatTimecode, ltrInline } from '../../ui/format.js';
import { langDirection, textDirection } from '../../core/lang/index.js';
import { editorIcon } from './icons.js';
import { durationText, markActionLabel, markBadge, markTitle, seconds } from './text.js';
import { ROW, textLines } from './virtual.js';

const HAS_LETTER = /\p{L}/u;

/**
 * اتجاه حقل الترجمة (§٤): من لغتها إن عُرفت (AA1)، وإلا RTL إن احتوى حرفًا من نص يُكتب من اليمين ولو بدأ بكلمة لاتينية، أو
 * خلا من الحروف (حقل فارغ: اتجاه الواجهة)، وLTR ما سوى ذلك.
 * @param {string} text @param {string | null} [lang]
 */
export const textDir = (text, lang = null) => (lang && langDirection(lang)) || (!HAS_LETTER.test(text) ? getDir() : textDirection(text));

/**
 * @typedef {{
 *   rows: ({ type: 'cue', index: number } | { type: 'missing', n: number })[],
 *   session: ReturnType<typeof import('../../core/edit/index.js').createEditSession>,
 *   report: import('../../core/edit/issues.js').IssueReport,
 *   refs: string[], refLang?: string | null, lang?: string | null, showEnglish: boolean, readOnly: boolean,
 *   match?: (index: number) => 'current' | 'match' | null, refRanges?: (index: number) => { start: number, end: number }[] | null,
 *   markOf?: (index: number) => { kind: 'todo' | 'done', state: 'linked' | 'moved' } | null,
 *   selection: Set<number>, activeIndex: number | null, stepMs: number, lines?: (text: string) => number
 * }} RowContext lines أسطر النص المرئية بالتفاف العمود (الافتراضي بفواصل الأسطر)
 */

/** @param {Document} doc @param {() => RowContext} ctx */
export function createRows(doc, ctx) {
  const timeInput = (field, n) => el('input', {
    className: 'ed-time',
    dir: 'ltr',
    attrs: { type: 'text', 'data-field': field, autocomplete: 'off', spellcheck: 'false', 'aria-label': t(field === 'start' ? 'editor.row.startAria' : 'editor.row.endAria', { n }) },
    doc,
  });
  const nudge = (dir) => el('button', {
    className: 'tj-btn tj-btn--ghost tj-btn--sm ed-row__nudge-btn',
    text: dir < 0 ? '−' : '+',
    attrs: { type: 'button', 'data-act': 'nudge', 'data-dir': String(dir) },
    doc,
  });
  // إجراءات الصف عند المرور أو التركيز (§١٩.٩): أيقونات بتلميحاتها، والمعطّل يذكر سببه.
  const action = (act, iconName) => el('button', {
    className: 'tj-btn tj-btn--ghost tj-btn--sm tj-btn--icon ed-row__act',
    attrs: { type: 'button', 'data-act': act },
    children: [editorIcon(iconName, { doc })],
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
          el('p', { className: 'ed-row__missing', text: t('editor.row.missing', { n: r.n }), doc }),
        ],
        doc,
      });
    }
    const cue = c.session.cueAt(r.index);
    const node = el('div', {
      className: 'ed-row',
      attrs: { 'data-row': String(row), 'data-index': String(r.index), role: 'listitem', 'aria-label': t('editor.row.cueAria', { n: cue.n }) },
      children: [
        el('input', { className: 'ed-row__check', attrs: { type: 'checkbox', 'data-act': 'select', 'aria-label': t('editor.row.selectAria', { n: cue.n }) }, doc }),
        el('span', {
          className: 'ed-row__n tj-mono',
          children: [
            el('span', { text: String(cue.n), doc }), el('span', { className: 'ed-row__dot', attrs: { 'aria-hidden': 'true' }, doc }),
            el('span', { className: 'tj-sr-only ed-row__edited', doc }), el('span', { className: 'ed-row__mark', doc }),
          ],
          doc,
        }),
        timeInput('start', cue.n),
        timeInput('end', cue.n),
        el('span', { className: 'ed-row__dur tj-mono-sm', doc }),
        el('textarea', { className: 'ed-row__text', attrs: { 'data-field': 'text', 'aria-label': t('editor.row.textAria', { n: cue.n }) }, doc }),
        // المرجع جملة إنجليزية: بلغتها فيُنطق بصوتها لا بصوت الصفحة العربية (WCAG 3.1.2؛ تدقيق 7a66f91، U48).
        el('p', { className: 'ed-row__en', dir: 'ltr', attrs: { lang: 'und' }, doc }),
        el('span', { className: 'ed-row__nudge', children: [nudge(-1), nudge(1), action('seek', 'play'), action('mark', 'flag'), action('merge', 'merge'), action('split', 'split')], doc }),
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
    num.querySelector('.ed-row__edited').textContent = edited ? t('editor.row.edited') : '';

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
    text.dir = textDir(text.value, c.lang ?? null);
    if ((c.lang ?? null) !== (text.getAttribute('lang') || null)) {
      if (c.lang) text.setAttribute('lang', c.lang);
      else text.removeAttribute('lang');
    }
    text.readOnly = c.readOnly;
    // خطأ النص مربوط بحقله كحقلي الزمن: الرسالة وصفه، وaria-invalid للخطأ المانع وحده (تدقيق 7a66f91، U26).
    text.setAttribute('aria-invalid', issues.some((x) => x.tone === 'error' && x.field === 'text') ? 'true' : 'false');
    if (first && first.field === 'text') text.setAttribute('aria-describedby', `ed-msg-${i}`);
    else text.removeAttribute('aria-describedby');
    text.style.height = `${(c.lines ?? textLines)(cue.text) * ROW.line + ROW.fieldChrome}px`;

    const ref = c.refs[i] ?? '';
    const ranges = c.refRanges?.(i);
    if (ranges?.length) {
      // نتائج البحث في المرجع الإنجليزي مميزة فيه (للقراءة فقط).
      const parts = [];
      let at = 0;
      for (const r of ranges) {
        parts.push(ref.slice(at, r.start), el('mark', { text: ref.slice(r.start, r.end), doc }));
        at = r.end;
      }
      parts.push(ref.slice(at));
      en.replaceChildren(...parts);
    } else if (en.childElementCount || en.textContent !== ref) en.textContent = ref;
    // اتجاهه ولغته من لغة العمود (لغة المسار أو الترجمة الأخرى، AA1)، وإلا من نصه؛ فلا يُنطق نص بصوت لغة أخرى (تدقيق Fable، UX §٣).
    en.dir = c.refLang ? langDirection(c.refLang) ?? textDirection(ref) : textDirection(ref);
    const refLang = c.refLang ?? 'und';
    if (en.getAttribute('lang') !== refLang) en.setAttribute('lang', refLang);
    const match = c.match?.(i) ?? null;
    node.classList.toggle('has-match', match === 'match');
    node.classList.toggle('is-match-current', match === 'current');
    en.hidden = !c.showEnglish;

    const step = seconds(c.stepMs);
    const [minus, plus, seek, markBtn, mergeBtn, splitBtn] = nudges.children;
    minus.hidden = c.readOnly;
    plus.hidden = c.readOnly;
    minus.setAttribute('aria-label', t('editor.row.earlierAria', { n: cue.n, step }));
    minus.title = t('editor.row.earlierTitle', { step });
    plus.setAttribute('aria-label', t('editor.row.laterAria', { n: cue.n, step }));
    plus.title = t('editor.row.laterTitle', { step });
    const label = (b, text, why = null) => {
      b.setAttribute('aria-label', why ? `${text} — ${why}` : text);
      b.title = why ? `${text}: ${why}` : text;
      if (why) b.setAttribute('aria-disabled', 'true');
      else b.removeAttribute('aria-disabled');
    };
    label(seek, t('editor.row.seek', { n: cue.n, at: formatTimecode(Math.max(0, cue.startMs + c.session.offsetMs)) }));
    const mark = c.markOf?.(i) ?? null;
    label(markBtn, markActionLabel(cue.n, mark), c.readOnly ? t('editor.row.readOnly') : null);
    markBtn.setAttribute('aria-pressed', mark ? 'true' : 'false');
    markBtn.dataset.kind = mark?.kind ?? '';
    const isLast = i >= c.session.count - 1;
    label(mergeBtn, t('editor.row.merge', { n: cue.n }), c.readOnly ? t('editor.row.readOnly') : isLast ? t('editor.row.noNext') : null);
    label(splitBtn, t('editor.row.split', { n: cue.n }), c.readOnly ? t('editor.row.readOnly') : null);
    const badge = num.querySelector('.ed-row__mark');
    badge.dataset.kind = mark?.kind ?? '';
    badge.dataset.state = mark?.state ?? '';
    if (mark) {
      const b = markBadge(mark);
      badge.replaceChildren(editorIcon(b.icon, { doc, className: 'tj-icon ed-row__mark-icon' }), b.suffix);
    } else badge.replaceChildren();
    badge.title = mark ? markTitle(mark) : '';

    msg.id = `ed-msg-${i}`;
    msg.hidden = !first;
    msg.className = `ed-row__msg${error ? ' ed-row__msg--error' : ''}`;
    // «(+N)» معزول LTR فلا يُرسم «(2+)» داخل الجملة العربية (U27).
    msg.textContent = first ? `${messageFor(first.code, first.params ?? undefined)}${issues.length > 1 ? ` (${ltrInline(`+${issues.length - 1}`)})` : ''}` : '';
  }

  return { create, update };
}
