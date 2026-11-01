// مجموعة خيارات (radio) لحوارات المحفوظات: ما يُحذف، وتوقيت الملف المصدَّر. fieldset بوسم legend لقارئ الشاشة،
// والقيمة تُقرأ من حالة المجموعة لا من DOM. تُبنى داخل الصفحة وتُطلب ترقيتها إلى src/ui (sharedRequests).
import { el } from '../../ui/components.js';

let seq = 0;

/**
 * @param {{ legend: string, options: { value: string, label: string, hint?: string }[], value?: string, doc?: Document }} o
 * @returns {{ root: HTMLElement, value: () => string }}
 */
export function radioGroup({ legend, options, value = options[0]?.value, doc = document }) {
  const name = `lib-choice-${++seq}`;
  let current = value;
  const inputs = options.map((o) => {
    const input = el('input', { attrs: { type: 'radio', name, value: o.value }, doc });
    input.checked = o.value === current;
    input.addEventListener('change', () => {
      if (input.checked) current = o.value;
    });
    return { o, input };
  });
  const root = el('fieldset', {
    className: 'lib-choice',
    children: [
      el('legend', { className: 'tj-sr-only', text: legend, doc }),
      ...inputs.map(({ o, input }) => el('label', {
        className: 'lib-choice__option',
        children: [input, el('span', { className: 'lib-choice__text', children: [el('span', { className: 'lib-choice__label', text: o.label, doc }), o.hint ? el('span', { className: 'lib-choice__hint', text: o.hint, doc }) : null], doc })],
        doc,
      })),
    ],
    doc,
  });
  return { root, value: () => current };
}
