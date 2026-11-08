// لوحة «المراجعة» في المحرّر (R53، مواصفة التصميم §١٩.٩): الكثافة والعلامات وآخر موضع، بجانب لوحتي المشكلات والمقارنة
// (panels.js). الفحص الآلي منفصل عن العلامات البشرية، والعلامات التي فقدت مقطعها منفصلة بإزالتها، و«تابع من آخر موضع» لكل
// ترجمة. وصف وقفز فقط: لا إصلاح تلقائي ولا كتابة هنا.
import { messageFor } from '../../core/errors/index.js';
import { button, el, statusPill } from '../../ui/components.js';
import { formatCount, formatTimecode } from '../../ui/format.js';
import { COUNT, MARK_LABEL } from './text.js';

const MAX_ITEMS = 200;

const head = (doc, title, pill) => el('div', { className: 'ed-panel__head', children: [el('h2', { className: 'tj-h4', text: title, doc }), pill], doc });

/**
 * الكثافة: تنبيهات القراءة السريعة وطول السطر بعتبتها، وكل بند يقفز إلى صفه. لا تمنع الحفظ ولا التصدير.
 * @param {HTMLElement} box
 * @param {{ doc: Document, items: import('../../core/edit/issues.js').Issue[], maxCps: number, maxLineChars: number, onJump: (index: number) => void }} o
 */
export function renderDensity(box, { doc, items, maxCps, maxLineChars, onJump }) {
  const list = el('ul', {
    className: 'ed-issues',
    children: items.slice(0, MAX_ITEMS).map((x) => el('li', {
      children: [el('button', {
        className: 'ed-issue ed-issue--warning',
        attrs: { type: 'button' },
        children: [el('span', { className: 'ed-issue__n tj-mono-sm', text: String(x.n), doc }), el('span', { className: 'ed-issue__text', text: messageFor(x.code, x.params ?? undefined), doc })],
        on: { click: () => onJump(x.index) },
        doc,
      })],
      doc,
    })),
    doc,
  });
  box.replaceChildren(...[
    head(doc, 'سرعة القراءة وطول السطر', statusPill({ tone: items.length ? 'warning' : 'success', text: items.length ? formatCount(items.length, COUNT.warning) : 'لا تنبيهات ✓', doc })),
    el('p', { className: 'tj-caption', text: `الحد ${maxCps} حرفًا في الثانية (من الإعدادات) و${maxLineChars} حرفًا للسطر. تنبيه لا يمنع الحفظ ولا التصدير، ولا يختصر النص.`, doc }),
    items.length ? list : null,
    items.length > MAX_ITEMS ? el('p', { className: 'tj-caption', text: `و${items.length - MAX_ITEMS} أخرى.`, doc }) : null,
  ].filter(Boolean));
}

/**
 * العلامات البشرية: «أعود إليه» و«راجعته» و«تحتاج تحقق» (قد تكون انتقلت)، واليتيمة بإزالتها.
 * @param {HTMLElement} box
 * @param {{
 *   doc: Document, marks: ReturnType<typeof import('../../core/edit/review.js').reviewGroups>['marks'], readOnly: boolean,
 *   onJump: (index: number) => void, onRemoveOrphans: () => void
 * }} o
 */
export function renderMarks(box, { doc, marks, readOnly, onJump, onRemoveOrphans }) {
  const chips = (entries) => el('div', {
    className: 'ed-chips',
    children: entries.slice(0, MAX_ITEMS).map((e) => el('button', {
      className: `ed-chip tj-mono-sm ed-chip--${e.kind}${e.state === 'moved' ? ' ed-chip--moved' : ''}`,
      text: String(e.n), attrs: { type: 'button', 'aria-label': `انتقال إلى المقطع ${e.n} (${MARK_LABEL[e.kind]}${e.state === 'moved' ? '، قد تكون انتقلت' : ''})` },
      on: { click: () => onJump(e.index) },
      doc,
    })),
    doc,
  });
  const group = (title, entries, note) => el('section', {
    className: 'ed-markgroup',
    children: [
      el('h3', { className: 'tj-label', text: `${title} (${entries.length})`, doc }),
      note ? el('p', { className: 'tj-caption', text: note, doc }) : null,
      entries.length ? chips(entries) : el('p', { className: 'tj-caption', text: 'لا شيء.', doc }),
    ],
    doc,
  });
  const total = marks.todo.length + marks.done.length + marks.check.length + marks.orphan.length;
  const orphan = marks.orphan.length ? el('section', {
    className: 'ed-markgroup',
    children: [
      el('h3', { className: 'tj-label', text: `فقدت مقطعها (${marks.orphan.length})`, doc }),
      el('p', { className: 'tj-caption', text: `لا مقطع يطابقها بعد الاستبدال أو الدمج أو الشطر: ${marks.orphan.slice(0, 8).map((m) => `${m.n} عند ${formatTimecode(m.startMs)}`).join('، ')}${marks.orphan.length > 8 ? '…' : ''}.`, doc }),
      button({ label: 'إزالة العلامات التي فقدت مقطعها', size: 'sm', variant: 'ghost', disabledReason: readOnly ? messageFor('ED_READ_ONLY') : null, onClick: onRemoveOrphans, doc }),
    ],
    doc,
  }) : null;
  box.replaceChildren(...[
    head(doc, 'العلامات', statusPill({ tone: marks.todo.length ? 'warning' : total ? 'success' : 'neutral', text: total ? formatCount(total, COUNT.mark) : 'لا علامات', doc })),
    el('p', { className: 'tj-caption', text: 'مراجعتك أنت، منفصلة عن الفحص الآلي. بدّل علامة المقطع من زر العلامة في صفه، أو من المشغّل («علّم للمراجعة»).', doc }),
    group(MARK_LABEL.todo, marks.todo),
    group(MARK_LABEL.done, marks.done),
    group('تحتاج تحقق', marks.check, marks.check.length ? 'تغيّر نص مقطعها أو زمنه منذ وُضعت: تأكد أنها على المقطع الصحيح ثم بدّلها.' : null),
    orphan,
  ].filter(Boolean));
}

/**
 * «تابع من آخر موضع» لكل ترجمة ممتلئة.
 * @param {HTMLElement} box
 * @param {{ doc: Document, items: { slot: number, name: string | null, n: number | null, editing: boolean }[], onResume: (slot: number) => void }} o
 */
export function renderResume(box, { doc, items, onResume }) {
  const rows = items.map((it) => el('li', {
    className: 'ed-resume__item',
    children: [
      el('span', { className: 'tj-body-sm', text: `الترجمة ${it.slot}${it.name ? ` «${it.name}»` : ''}${it.editing ? ' (قيد التحرير)' : ''}`, doc }),
      it.n === null
        ? el('span', { className: 'tj-caption', text: 'لا موضع محفوظ', doc })
        : button({ label: `تابع من المقطع ${it.n}`, size: 'sm', variant: 'ghost', onClick: () => onResume(it.slot), doc }),
    ],
    doc,
  }));
  box.replaceChildren(
    head(doc, 'آخر موضع', el('span', { doc })),
    el('ul', { className: 'ed-resume', children: rows, doc }),
  );
}
