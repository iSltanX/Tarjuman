// حوار «نص دراسي…» (R58، P13-AC7، مواصفة التصميم §١٩.٧، وتصميم LibraryDialogs) في قائمة التصدير: الصيغة (TXT أو Markdown)،
// واللغة (العربية أو ثنائي اللغة، والثنائي معطّل بسببه إن لم يُحفظ مسار إنجليزي)، ومعاينة اسم الملف. النص يبنيه
// buildStudyText (P11) ويُحفظ عبر saveFile عند التأكيد؛ لا يُعرض شيء من نصه هنا. وإن جعلت الإزاحة مقاطع قبل بداية الفيديو
// ذُكرت أرقامها قبل التنزيل (`note` من studyTimingNote) فلا تتغير روابطها بصمت.
import { t } from '../../i18n/index.js';
import { el, ltr } from '../../ui/components.js';
import { segGroup } from './seg.js';

/**
 * @param {{ doc: Document, hasEnglish: boolean, name: (o: { format: 'txt' | 'md', bilingual: boolean }) => Promise<string>, note?: string }} o
 * @returns {{ root: HTMLElement, value: () => { format: 'txt' | 'md', bilingual: boolean }, ready: Promise<void> }}
 */
export function studyContent({ doc, hasEnglish, name, note = '' }) {
  const preview = el('span', { className: 'lib-study__file', doc });
  const mdHint = el('p', { className: 'tj-field__hint', text: t('library.study.mdHint'), doc });
  mdHint.hidden = true;
  const format = segGroup({
    legend: t('library.study.format'), value: 'txt', doc,
    options: [{ value: 'txt', label: 'TXT', ariaLabel: t('library.study.txtAria') }, { value: 'md', label: 'Markdown' }],
    onChange: (v) => { mdHint.hidden = v !== 'md'; refresh(); },
  });
  const language = segGroup({
    legend: t('library.study.language'), value: 'ar', doc,
    options: [
      { value: 'ar', label: t('library.study.translationOnly') },
      { value: 'bi', label: t('library.study.bilingual'), disabledReason: hasEnglish ? null : t('library.study.noOriginal') },
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
  const field = (label, ...kids) => el('div', { className: 'tj-field', children: [el('span', { className: 'tj-field__label', text: label, doc }), ...kids], doc });
  const root = el('div', {
    className: 'lib-study',
    children: [
      field(t('library.study.format'), format.root, mdHint),
      field(t('library.study.language'), language.root),
      el('div', { className: 'tj-field lib-study__name', children: [el('span', { className: 'tj-field__label', text: t('library.study.fileName'), doc }), preview], doc }),
      note ? el('p', { className: 'tj-field__hint lib-study__note', text: note, attrs: { role: 'note' }, doc }) : null,
    ],
    doc,
  });
  return { root, value, ready: refresh() };
}
