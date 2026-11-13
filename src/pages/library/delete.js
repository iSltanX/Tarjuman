// محتوى حوار الحذف (تصميم LibraryDialogs): عنوان الفيديو سطرًا، ثم «ما يُحذف» بنودًا من بيانات الفيديو الفعلية
// (deleteSummary في model.js) و«ما يبقى» إن وُجد، ثم تنبيه التراجع. لا بند لما لا يوجد.
import { t } from '../../i18n/index.js';
import { el, ltrNodes } from '../../ui/components.js';
import { textDirection } from '../../ui/format.js';

/**
 * @param {{ doc: Document, subtitle?: string, summary: { items: string[], keeps: string[] }, note: string }} o
 * @returns {HTMLElement}
 */
export function deleteContent({ doc, subtitle, summary, note }) {
  // اسم الملف في بند «الترجمة 2 — ملف …» عنصر معزول ذري (ltrNodes): لا تنقلب أجزاؤه إن انكسر سطره في الحوار.
  const item = (t) => {
    const nodes = ltrNodes(t, { doc });
    return el('li', nodes ? { children: nodes, doc } : { text: t, doc });
  };
  const list = (items) => el('ul', { className: 'lib-del__list', children: items.map(item), doc });
  return el('div', {
    className: 'lib-del',
    children: [
      subtitle ? el('p', { className: 'tj-caption lib-del__title', text: subtitle, dir: textDirection(subtitle), doc }) : null,
      el('span', { className: 'lib-del__eyebrow', text: t('library.delete.eyebrowDeleted'), doc }),
      list(summary.items),
      summary.keeps.length ? el('span', { className: 'lib-del__eyebrow', text: t('library.delete.eyebrowKept'), doc }) : null,
      summary.keeps.length ? list(summary.keeps) : null,
      el('p', { className: 'tj-body-sm lib-del__note', text: note, doc }),
    ],
    doc,
  });
}
