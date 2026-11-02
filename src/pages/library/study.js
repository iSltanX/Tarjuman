// حوار «نص دراسي…» (R58، P13-AC7، مواصفة التصميم §١٩.٧) في قائمة التصدير: الصيغة (TXT أو Markdown)، واللغة (العربية أو
// ثنائي اللغة، والثنائي معطّل بسببه إن لم يُحفظ مسار إنجليزي)، ومعاينة اسم الملف. النص يبنيه buildStudyText (P11) ويُحفظ
// عبر saveFile عند التأكيد؛ لا يُعرض شيء من نصه هنا.
import { choiceGroup, el, ltr } from '../../ui/components.js';

/**
 * @param {{ doc: Document, hasEnglish: boolean, name: (o: { format: 'txt' | 'md', bilingual: boolean }) => Promise<string> }} o
 * @returns {{ root: HTMLElement, value: () => { format: 'txt' | 'md', bilingual: boolean }, ready: Promise<void> }}
 */
export function studyContent({ doc, hasEnglish, name }) {
  const preview = el('span', { doc });
  const format = choiceGroup({
    legend: 'الصيغة', value: 'txt', doc,
    options: [{ value: 'txt', label: 'نص عادي (TXT)' }, { value: 'md', label: 'Markdown', hint: 'بروابط الأوقات إلى الفيديو.' }],
    onChange: () => { refresh(); },
  });
  const language = choiceGroup({
    legend: 'اللغة', value: 'ar', doc,
    options: [
      { value: 'ar', label: 'العربية وحدها' },
      { value: 'bi', label: 'ثنائي: العربية والإنجليزية', disabledReason: hasEnglish ? null : 'لا مسار إنجليزي محفوظ لهذا الفيديو.' },
    ],
    onChange: () => { refresh(); },
  });
  const value = () => ({ format: /** @type {'txt' | 'md'} */ (format.value()), bilingual: language.value() === 'bi' });
  let seq = 0;
  async function refresh() {
    const mine = ++seq;
    let text = '';
    try {
      text = await name(value());
    } catch {
      text = '';
    }
    if (mine === seq) preview.replaceChildren(...(text ? [ltr(text, { mono: true, doc })] : []));
  }
  const root = el('div', {
    className: 'lib-study',
    children: [
      el('span', { className: 'tj-label', text: 'الصيغة', doc }), format.root,
      el('span', { className: 'tj-label', text: 'اللغة', doc }), language.root,
      el('p', { className: 'tj-caption lib-study__name', children: ['اسم الملف: ', preview], doc }),
    ],
    doc,
  });
  return { root, value, ready: refresh() };
}
