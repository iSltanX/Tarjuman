// لوحة «المراجعة» في المحرّر (R53، مواصفة التصميم §١٩.٩): الكثافة والعلامات وآخر موضع، بجانب لوحتي المشكلات والمقارنة
// (panels.js). الفحص الآلي منفصل عن العلامات البشرية، والعلامات التي فقدت مقطعها منفصلة بإزالتها، و«تابع من آخر موضع» لكل
// ترجمة. وصف وقفز فقط: لا إصلاح تلقائي ولا كتابة هنا.
import { messageFor } from '../../core/errors/index.js';
import { joinList, t } from '../../i18n/index.js';
import { button, el, statusPill } from '../../ui/components.js';
import { formatCount, formatTimecode } from '../../ui/format.js';
import { COUNT, MARK_LABEL, isolate } from './text.js';

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
    head(doc, t('editor.density.title'), statusPill({ tone: items.length ? 'warning' : 'success', text: items.length ? formatCount(items.length, COUNT.warning) : t('editor.density.none'), doc })),
    el('p', { className: 'tj-caption', text: t('editor.density.limits', { cps: maxCps, chars: maxLineChars }), doc }),
    items.length ? list : null,
    items.length > MAX_ITEMS ? el('p', { className: 'tj-caption', text: t('editor.density.more', { n: items.length - MAX_ITEMS }), doc }) : null,
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
      text: String(e.n), attrs: { type: 'button', 'aria-label': t('editor.marks.jumpAria', { n: e.n, label: MARK_LABEL[e.kind], moved: e.state === 'moved' }) },
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
      entries.length ? chips(entries) : el('p', { className: 'tj-caption', text: t('editor.marks.nothing'), doc }),
    ],
    doc,
  });
  const total = marks.todo.length + marks.done.length + marks.check.length + marks.orphan.length;
  const orphan = marks.orphan.length ? el('section', {
    className: 'ed-markgroup',
    children: [
      el('h3', { className: 'tj-label', text: t('editor.marks.orphanTitle', { n: marks.orphan.length }), doc }),
      el('p', { className: 'tj-caption', text: t('editor.marks.orphanNote', { list: `${joinList(marks.orphan.slice(0, 8).map((m) => t('editor.marks.orphanItem', { n: m.n, at: formatTimecode(m.startMs) })))}${marks.orphan.length > 8 ? '…' : ''}` }), doc }),
      button({ label: t('editor.marks.removeOrphans'), size: 'sm', variant: 'ghost', disabledReason: readOnly ? messageFor('ED_READ_ONLY') : null, onClick: onRemoveOrphans, doc }),
    ],
    doc,
  }) : null;
  box.replaceChildren(...[
    head(doc, t('editor.marks.title'), statusPill({ tone: marks.todo.length ? 'warning' : total ? 'success' : 'neutral', text: total ? formatCount(total, COUNT.mark) : t('editor.marks.none'), doc })),
    el('p', { className: 'tj-caption', text: t('editor.marks.intro'), doc }),
    group(MARK_LABEL.todo, marks.todo),
    group(MARK_LABEL.done, marks.done),
    group(t('editor.marks.check'), marks.check, marks.check.length ? t('editor.marks.checkNote') : null),
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
      // اسم الخانة معزول اتجاهًا كما في رأس المحرّر (editSlotLabel).
      el('span', { className: 'tj-body-sm', text: t('editor.resume.item', { n: it.slot, name: it.name ? isolate(it.name) : '', editing: it.editing }), doc }),
      it.n === null
        ? el('span', { className: 'tj-caption', text: t('editor.resume.none'), doc })
        : button({ label: t('editor.resume.from', { n: it.n }), size: 'sm', variant: 'ghost', onClick: () => onResume(it.slot), doc }),
    ],
    doc,
  }));
  box.replaceChildren(
    head(doc, t('editor.resume.title'), el('span', { doc })),
    el('ul', { className: 'ed-resume', children: rows, doc }),
  );
}
