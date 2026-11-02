// حوار «مقارنة وإعادة التطبيق…» في لافتة التعارض (R57، مواصفة التصميم §١٩.٩): تغييراتي مقابل الأحدث بأعدادها، واختيار لكل
// تعارض (والأحدث افتراضيًا فلا يُكتب فوقه بصمت)، و«تطبيق غير المتعارض (N)». يعيد الاختيارات أو 'export' أو null؛ والتطبيق
// في الجلسة (app.js) لا يكتب شيئًا حتى «حفظ».
import { alertBox, el } from '../../ui/components.js';
import { COUNT_FORMS, formatCount, formatOffset } from '../../ui/format.js';
import { openDialog } from './dialogs.js';

let seq = 0;
const flat = (cues) => (cues.length ? cues.map((c) => c.text.replace(/\s*\n\s*/g, ' / ')).join(' | ') : '(حُذف)');

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
      doc, tone: 'danger', title: 'تعذّرت المقارنة بالنسخة الأحدث',
      content: alertBox({ tone: 'warning', title: 'لا تُعاد التعديلات تلقائيًا', text: first.reason, doc }),
      body: 'تعديلاتك ما زالت هنا ولم يُكتب شيء. صدّر نسختك لتحتفظ بها، ثم أعد الفتح لترى الأحدث.',
      actions: [{ label: 'تصدير نسختي…', value: 'export', variant: 'primary' }, { label: 'إغلاق', value: 'cancel' }],
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
        el('legend', { className: 'tj-label', text: `المقطع ${c.n}`, doc }),
        radio(name, 'theirs', `الأحدث: ${flat(c.theirs)}`, true, () => { resolve[c.n] = 'theirs'; }),
        radio(name, 'mine', `تعديلي: ${flat(c.mine)}`, false, () => { resolve[c.n] = 'mine'; }),
      ],
      doc,
    });
  });
  const offsetBox = first.offsetConflict ? el('fieldset', {
    className: 'ed-fieldset',
    children: [
      el('legend', { className: 'tj-label', text: 'إزاحة العرض', doc }),
      radio('ed-rescue-offset', 'theirs', `الأحدث: ${formatOffset(offsets.theirs)} ث`, true, () => { offsetChoice = 'theirs'; }),
      radio('ed-rescue-offset', 'mine', `إزاحتي: ${formatOffset(offsets.mine)} ث`, false, () => { offsetChoice = 'mine'; }),
    ],
    doc,
  }) : null;
  const content = el('div', {
    className: 'tj-stack',
    children: [
      el('p', {
        className: 'tj-body-sm',
        text: `تعديلاتي: ${formatCount(first.counts.mine, COUNT_FORMS.cue)} · تغييرات الأحدث: ${formatCount(first.counts.theirs, COUNT_FORMS.cue)} · متعارضة: ${first.conflicts.length}.`,
        doc,
      }),
      el('p', { className: 'tj-caption', text: 'يُعاد تطبيق ما لا يتعارض من تعديلاتك فوق النسخة الأحدث، ويبقى كل ما غيّره الأحدث. وفي المتعارض يبقى الأحدث ما لم تختر تعديلك. لا يُكتب شيء حتى «حفظ»، والتراجع يعيد الأحدث كما هو.', doc }),
      conflicts.length ? el('div', { className: 'ed-preview-table ed-rescue-list', children: conflicts, doc }) : null,
      offsetBox,
    ].filter(Boolean),
    doc,
  });
  const v = await openDialog({
    doc, size: 'lg', title: 'مقارنة تغييراتي بالنسخة الأحدث', content, focus: 'cancel',
    actions: [
      { label: `تطبيق غير المتعارض (${first.kept.length})`, value: 'apply', variant: 'primary' },
      { label: 'تصدير نسختي…', value: 'export' },
      { label: 'إلغاء', value: 'cancel' },
    ],
  });
  if (v === 'export') return 'export';
  return v === 'apply' ? { resolve, offsetChoice } : null;
}
