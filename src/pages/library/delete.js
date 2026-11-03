// محتوى حوار الحذف (تصميم LibraryDialogs): عنوان الفيديو سطرًا، ثم «ما يُحذف» بنودًا من بيانات الفيديو الفعلية
// (deleteSummary في model.js) و«ما يبقى» إن وُجد، ثم تنبيه التراجع. لا بند لما لا يوجد.
import { el } from '../../ui/components.js';
import { textDirection } from '../../ui/format.js';

/**
 * @param {{ doc: Document, subtitle?: string, summary: { items: string[], keeps: string[] }, note: string }} o
 * @returns {HTMLElement}
 */
export function deleteContent({ doc, subtitle, summary, note }) {
  const list = (items) => el('ul', { className: 'lib-del__list', children: items.map((t) => el('li', { text: t, doc })), doc });
  return el('div', {
    className: 'lib-del',
    children: [
      subtitle ? el('p', { className: 'tj-caption lib-del__title', text: subtitle, dir: textDirection(subtitle), doc }) : null,
      el('span', { className: 'lib-del__eyebrow', text: 'ما يُحذف', doc }),
      list(summary.items),
      summary.keeps.length ? el('span', { className: 'lib-del__eyebrow', text: 'ما يبقى', doc }) : null,
      summary.keeps.length ? list(summary.keeps) : null,
      el('p', { className: 'tj-body-sm lib-del__note', text: note, doc }),
    ],
    doc,
  });
}
