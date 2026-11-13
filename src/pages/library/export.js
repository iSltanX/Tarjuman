// حوار «تصدير…» لملف الترجمة (الفكرة ١١، ح-50، على نمط حوار «نص دراسي…» study.js): الصيغة (SRT أو WebVTT)، والمحتوى (الترجمة
// وحدها أو مع الأصل في سطر تحت كل مقطع؛ و«مع الأصل» معطّل بسببه إن لم يُحفظ مسار أصل)، والتوقيت حين لا تكون الإزاحة صفرًا (كان
// حوارًا مستقلًا قبله)، ومعاينة اسم الملف. الملف يبنيه buildSubtitleExport ويُحفظ عبر saveFile عند التأكيد؛ لا يُعرض شيء من نصه هنا.
import { t } from '../../i18n/index.js';
import { el, ltr } from '../../ui/components.js';
import { offsetInline } from '../../ui/format.js';
import { radioGroup } from './choice.js';
import { segGroup } from './seg.js';

/**
 * @param {{
 *   doc: Document, offsetMs: number, hasOriginal: boolean,
 *   name: (o: { format: 'srt' | 'vtt', bilingual: boolean }) => string,
 * }} o
 * @returns {{ root: HTMLElement, value: () => import('./actions.js').ExportChoice }}
 */
export function exportContent({ doc, offsetMs, hasOriginal, name }) {
  const preview = el('span', { className: 'lib-study__file', doc });
  const dualHint = el('p', { className: 'tj-field__hint', text: t('library.exportDialog.withOriginalHint'), doc });
  dualHint.hidden = true;
  const format = segGroup({
    legend: t('library.exportDialog.format'), value: 'srt', doc,
    options: [{ value: 'srt', label: 'SRT' }, { value: 'vtt', label: 'WebVTT' }],
    onChange: () => refresh(),
  });
  const content = segGroup({
    legend: t('library.exportDialog.content'), value: 'only', doc,
    options: [
      { value: 'only', label: t('library.exportDialog.translationOnly') },
      { value: 'dual', label: t('library.exportDialog.withOriginal'), disabledReason: hasOriginal ? null : t('library.study.noOriginal') },
    ],
    onChange: (v) => { dualHint.hidden = v !== 'dual'; refresh(); },
  });
  // التوقيت (كان حوار «توقيت الملف المصدَّر» بعد البند): الظاهر افتراضيًا، والمحفوظ متاح لمن يريد الملف رغم الإزاحة.
  const timing = offsetMs !== 0 ? radioGroup({
    legend: t('library.dialog.timingTitle'),
    options: [
      { value: 'shown', label: t('library.dialog.timingShown', { offset: offsetInline(offsetMs) }) },
      { value: 'saved', label: t('library.dialog.timingSaved') },
    ],
    doc,
  }) : null;
  const value = () => ({
    format: /** @type {'srt' | 'vtt'} */ (format.value() === 'vtt' ? 'vtt' : 'srt'),
    bilingual: content.value() === 'dual',
    timing: /** @type {'shown' | 'saved'} */ (timing?.value() === 'saved' ? 'saved' : 'shown'),
  });
  function refresh() {
    let text = '';
    try {
      text = name(value());
    } catch {
      text = '';
    }
    preview.replaceChildren(...(text ? [ltr(text, { mono: true, doc })] : []));
  }
  const field = (label, ...kids) => el('div', { className: 'tj-field', children: [el('span', { className: 'tj-field__label', text: label, doc }), ...kids], doc });
  const root = el('div', {
    className: 'lib-study lib-export',
    children: [
      field(t('library.exportDialog.format'), format.root, el('p', { className: 'tj-field__hint', text: t('library.exportDialog.formatHint'), doc })),
      field(t('library.exportDialog.content'), content.root, dualHint),
      timing ? field(t('library.dialog.timingTitle'), el('p', { className: 'tj-field__hint', text: t('library.dialog.timingBody', { offset: offsetInline(offsetMs) }), doc }), timing.root) : null,
      el('div', { className: 'tj-field lib-study__name', children: [el('span', { className: 'tj-field__label', text: t('library.study.fileName'), doc }), preview], doc }),
    ],
    doc,
  });
  refresh();
  return { root, value };
}
