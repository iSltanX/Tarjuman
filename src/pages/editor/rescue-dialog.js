// حوار «مقارنة وإعادة التطبيق…» في لافتة التعارض (R57، مواصفة التصميم §١٩.٩): تغييراتي مقابل الأحدث بأعدادها، واختيار لكل
// تعارض (والأحدث افتراضيًا فلا يُكتب فوقه بصمت)، و«تطبيق غير المتعارض (N)». يعيد الاختيارات أو 'export' أو null؛ والتطبيق
// في الجلسة (app.js) لا يكتب شيئًا حتى «حفظ».
import { t } from '../../i18n/index.js';
import { alertBox, el } from '../../ui/components.js';
import { COUNT_FORMS, formatCount, formatTimecode, ltrInline, offsetInline } from '../../ui/format.js';
import { openDialog } from './dialogs.js';

let seq = 0;
const span = (cues) => (cues.length ? t('editor.range', { from: formatTimecode(cues[0].startMs), to: formatTimecode(cues[cues.length - 1].endMs) }) : '');
// التعارض الزمني نصّاه متطابقان فيُذكر الزمن بجانب النص ليتميّز الخياران (U-037)؛ ويُذكر كلما اختلف زمنا الطرفين.
const side = (cues, other) => (span(cues) && span(cues) !== span(other) ? `${flat(cues)} (${ltrInline(span(cues))})` : flat(cues));
const flat = (cues) => (cues.length ? cues.map((c) => c.text.replace(/\s*\n\s*/g, ' / ')).join(' | ') : t('editor.rescue.deleted'));

/**
 * @param {{
 *   doc: Document,
 *   first: ReturnType<typeof import('../../core/edit/rescue.js').planRescue>,
 *   offsets: { mine: number, theirs: number },
 * }} o
 * @returns {Promise<{ resolve: Record<number, 'mine' | 'theirs'>, offsetChoice: 'mine' | 'theirs' } | 'export' | null>}
 */
export async function openRescueDialog({ doc, first, offsets }) {
  if (!first.ok) {
    const v = await openDialog({
      doc, tone: 'danger', title: t('editor.rescue.failedTitle'),
      content: alertBox({ tone: 'warning', title: t('editor.rescue.noAuto'), text: first.reason, doc }),
      body: t('editor.rescue.failedBody'),
      actions: [{ label: t('editor.rescue.export'), value: 'export', variant: 'primary' }, { label: t('editor.rescue.close'), value: 'cancel' }],
      focus: 'export',
    });
    return v === 'export' ? 'export' : null;
  }
  const resolve = {};
  let offsetChoice = 'theirs';
  const radio = (name, value, label, checked, onPick) => el('label', {
    className: 'ed-radio',
    children: [el('input', { attrs: { type: 'radio', name, value, ...(checked ? { checked: '' } : {}) }, on: { change: onPick }, doc }), el('span', { dir: 'auto', text: label, doc })],
    doc,
  });
  const conflicts = first.conflicts.map((c) => {
    const name = `ed-rescue-${++seq}`;
    return el('fieldset', {
      className: 'ed-fieldset',
      children: [
        el('legend', { className: 'tj-label', text: t('editor.rescue.cue', { n: c.n }), doc }),
        radio(name, 'theirs', t('editor.rescue.theirs', { text: side(c.theirs, c.mine) }), true, () => { resolve[c.key] = 'theirs'; }),
        radio(name, 'mine', t('editor.rescue.mine', { text: side(c.mine, c.theirs) }), false, () => { resolve[c.key] = 'mine'; }),
      ],
      doc,
    });
  });
  const offsetBox = first.offsetConflict ? el('fieldset', {
    className: 'ed-fieldset',
    children: [
      el('legend', { className: 'tj-label', text: t('editor.rescue.offset'), doc }),
      radio('ed-rescue-offset', 'theirs', t('editor.rescue.offsetTheirs', { off: offsetInline(offsets.theirs) }), true, () => { offsetChoice = 'theirs'; }),
      radio('ed-rescue-offset', 'mine', t('editor.rescue.offsetMine', { off: offsetInline(offsets.mine) }), false, () => { offsetChoice = 'mine'; }),
    ],
    doc,
  }) : null;
  const content = el('div', {
    className: 'tj-stack',
    children: [
      el('p', {
        className: 'tj-body-sm',
        text: t('editor.rescue.counts', { mine: formatCount(first.counts.mine, COUNT_FORMS.cue), theirs: formatCount(first.counts.theirs, COUNT_FORMS.cue), conflicts: first.conflicts.length }),
        doc,
      }),
      el('p', { className: 'tj-caption', text: t('editor.rescue.explain'), doc }),
      conflicts.length ? el('div', { className: 'ed-preview-table ed-rescue-list', children: conflicts, doc }) : null,
      offsetBox,
    ].filter(Boolean),
    doc,
  });
  const v = await openDialog({
    doc, size: 'lg', title: t('editor.rescue.title'), content, focus: 'cancel',
    actions: [
      { label: t('editor.rescue.apply', { n: first.kept.length }), value: 'apply', variant: 'primary' },
      { label: t('editor.rescue.export'), value: 'export' },
      { label: t('common.cancel'), value: 'cancel' },
    ],
  });
  if (v === 'export') return 'export';
  return v === 'apply' ? { resolve, offsetChoice } : null;
}
