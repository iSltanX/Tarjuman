// لوحة «الاستكمال» في المحرّر (R52، مواصفة التصميم §١٩.٩): اختيار المقاطع بمربعات وأعداد (الناقص والفارغ تلقائيًا، و«بلا
// حروف عربية» اختياري، والمعلّمة والمحددة)، و«تنزيل ملف الاستكمال» و«نسخ تعليماته»، و«استيراد ملف تصحيح…» بمعاينة واختيار،
// وحالة الأجزاء المستلمة. الملف من buildPatchPackage والقراءة من readPatch (P11)؛ وحوار المعاينة هنا، والتطبيق خطوة واحدة في
// الجلسة لا تُحفظ حتى «حفظ».
import { messageFor } from '../../core/errors/index.js';
import { alertBox, button, el, ltr, statusPill } from '../../ui/components.js';
import { COUNT_FORMS, formatCount, formatTimecode } from '../../ui/format.js';
import { openDialog, setDisabled } from './dialogs.js';
import { numberList } from './text.js';

const GROUPS = Object.freeze([
  ['missing', 'الناقصة', 'مقاطع في الأصل لا تقابلها ترجمة.'],
  ['empty', 'الفارغة', 'مقاطع بلا نص.'],
  ['noArabic', 'غير المترجمة', 'اختياري: مقاطع نصها مطابق للأصل أو بلا حرف من حروف لغة الترجمة؛ قد تكون أسماء أو أرقامًا صحيحة كما هي، فراجعها قبل اختيارها.'],
  ['marked', 'المعلّمة بـ«أعود إليه»', null],
  ['selected', 'المحددة', 'بمربعات التحديد في القائمة.'],
]);
const MAX_PREVIEW = 300;

/**
 * @param {HTMLElement} box
 * @param {{
 *   doc: Document, reason: string | null, groups: Record<string, number[]>, picks: Record<string, boolean>, numbers: number[],
 *   parts: import('../../core/import/patch.js').PartStatus[] | null, glossaryCount: number, readOnly: string | null, busy: boolean,
 *   onPick: (key: string, on: boolean) => void, onDownload: () => void, onCopy: () => void, onImport: (files: File[]) => void
 * }} o
 */
export function renderCompletePanel(box, o) {
  const { doc } = o;
  const checks = GROUPS.map(([key, label, hint]) => {
    const count = o.groups[key]?.length ?? 0;
    const input = el('input', { attrs: { type: 'checkbox', 'data-group': key }, on: { change: () => o.onPick(key, input.checked) }, doc });
    input.checked = Boolean(o.picks[key]);
    input.disabled = Boolean(o.reason) || (!count && !input.checked);
    return el('label', {
      className: 'ed-radio ed-complete__group',
      attrs: hint ? { title: hint } : {},
      children: [input, el('span', { text: `${label} (${count})`, doc })],
      doc,
    });
  });
  const download = button({ label: 'تنزيل ملف الاستكمال', variant: 'primary', size: 'sm', loading: o.busy, onClick: o.onDownload, doc });
  const copy = button({ label: 'نسخ تعليمات الاستكمال', size: 'sm', onClick: o.onCopy, doc });
  setDisabled(download, o.reason ?? (o.numbers.length ? null : messageFor('ED_COMPLETE_NOTHING')));
  setDisabled(copy, o.reason);
  const file = el('input', { attrs: { type: 'file', accept: '.srt,.txt,.md,text/plain', multiple: '', hidden: '', 'aria-hidden': 'true', tabindex: '-1' }, doc });
  file.addEventListener('change', () => {
    const files = [...(file.files ?? [])];
    file.value = '';
    if (files.length) o.onImport(files);
  });
  const importBtn = button({ label: 'رفع الاستكمال المترجم…', size: 'sm', onClick: () => file.click(), doc });
  setDisabled(importBtn, o.reason ?? o.readOnly);

  const parts = o.parts ? el('section', {
    className: 'ed-markgroup',
    children: [
      el('h3', { className: 'tj-label', text: 'اكتمال الأجزاء', doc }),
      el('ul', {
        className: 'ed-resume',
        children: o.parts.map((p) => el('li', {
          className: 'ed-resume__item',
          children: [
            el('span', { className: 'tj-body-sm', text: `الجزء ${p.index} (${p.from}–${p.to})`, doc }),
            statusPill({ tone: p.complete ? 'success' : p.received ? 'warning' : 'neutral', text: p.complete ? 'مكتمل ✓' : `${p.received} من ${p.total}`, doc }),
          ],
          doc,
        })),
        doc,
      }),
      el('p', { className: 'tj-caption', text: 'يُعدّ الجزء مكتملًا حين تقابل كل مقاطعه ترجمة في الملف الحالي.', doc }),
    ],
    doc,
  }) : null;

  box.replaceChildren(...[
    el('div', {
      className: 'ed-panel__head',
      children: [el('h2', { className: 'tj-h4', text: 'الاستكمال', doc }), statusPill({ tone: o.numbers.length ? 'info' : 'neutral', text: o.numbers.length ? formatCount(o.numbers.length, COUNT_FORMS.cue) : 'لا مقاطع مختارة', doc })],
      doc,
    }),
    el('p', { className: 'tj-caption', text: 'ملف صغير بالمقاطع المختارة من الأصل، تترجمه بتعليماته، ثم ترفع ما يعيده النموذج فيوضع كل مقطع في موضعه.', doc }),
    o.reason ? alertBox({ tone: 'info', title: 'لا يُبنى ملف الاستكمال الآن', text: o.reason, doc }) : null,
    el('fieldset', { className: 'ed-fieldset', children: [el('legend', { className: 'tj-label', text: 'المقاطع', doc }), ...checks], doc }),
    o.numbers.length ? el('p', { className: 'tj-caption', text: `الأرقام: ${numberList(o.numbers)}`, doc }) : null,
    el('div', { className: 'ed-group ed-wrap', children: [download, copy], doc }),
    o.glossaryCount ? el('p', { className: 'tj-caption', text: `+ القاموس (${o.glossaryCount}) في التعليمات.`, doc }) : null,
    el('div', { className: 'ed-group', children: [importBtn, file], doc }),
    parts,
  ].filter(Boolean));
}

/**
 * معاينة ملف التصحيح قبل تطبيقه: كل بند بمربع اختيار (استبدال نص في موضعه أو إدراج ناقص بزمن الأصل)، والتحذيرات والملاحظات.
 * @param {{ doc: Document, plan: import('../../core/import/patch.js').PatchPlan }} o
 * @returns {Promise<number[] | null>} أرقام البنود المختارة، أو null
 */
export async function previewPatch({ doc, plan }) {
  const picked = new Set(plan.items.map((it) => it.n));
  let applyBtn = null;
  const total = el('p', { className: 'tj-caption', doc });
  const sync = () => {
    total.textContent = `المختار ${formatCount(picked.size, COUNT_FORMS.cue)} من ${plan.items.length}.`;
    if (applyBtn) {
      applyBtn.firstChild.textContent = `تطبيق على ${picked.size === 2 ? 'مقطعين' : formatCount(picked.size, COUNT_FORMS.cue)}`;
      setDisabled(applyBtn, picked.size ? null : 'اختر بندًا واحدًا على الأقل.');
    }
  };
  const flat = (s) => s.replace(/\s*\n\s*/g, ' / ');
  const rows = plan.items.slice(0, MAX_PREVIEW).map((it) => {
    const box = el('input', { attrs: { type: 'checkbox', checked: '', 'aria-label': `تطبيق المقطع ${it.n}` }, on: { change: () => { if (box.checked) picked.add(it.n); else picked.delete(it.n); sync(); } }, doc });
    return el('label', {
      className: 'ed-replace-item',
      children: [
        box,
        el('span', { className: 'ed-replace-item__n tj-mono-sm', text: String(it.n), doc }),
        el('span', {
          className: 'ed-replace-item__text', dir: 'auto',
          children: it.action === 'replace'
            ? ['استبدال: ', it.before.text ? el('del', { text: flat(it.before.text), doc }) : el('del', { text: '(فارغ)', doc }), ' ', el('ins', { text: flat(it.after.text), doc })]
            : ['إدراج عند ', ltr(formatTimecode(it.after.startMs), { doc }), ': ', el('ins', { text: flat(it.after.text), doc })],
          doc,
        }),
      ],
      doc,
    });
  });
  const inserts = plan.items.filter((x) => x.action === 'insert').length;
  const content = el('div', {
    className: 'tj-stack',
    children: [
      el('p', {
        className: 'tj-body-sm',
        text: `${formatCount(plan.items.length, COUNT_FORMS.cue)} في مواضعها: ${plan.items.length - inserts} استبدال و${inserts} إدراج. ما لم يرد في الملف لا يُمس، والتطبيق خطوة واحدة في التراجع ولا يُحفظ حتى «حفظ».`,
        doc,
      }),
      ...plan.warnings.map((w) => alertBox({ tone: 'warning', title: 'تنبيه', text: messageFor(w.code, w.params), doc })),
      plan.notes.length ? el('details', { className: 'ed-notes', children: [el('summary', { text: `ملاحظات القراءة (${plan.notes.length})`, doc }), el('ul', { children: plan.notes.map((t) => el('li', { className: 'tj-auto', text: t, doc })), doc })], doc }) : null,
      rows.length ? el('div', { className: 'ed-preview-table ed-replace-list', children: rows, doc }) : el('p', { className: 'tj-caption', text: 'لا بند يُطبَّق؛ انظر التنبيهات.', doc }),
      plan.items.length > MAX_PREVIEW ? el('p', { className: 'tj-caption', text: `تُعرض أول ${MAX_PREVIEW}؛ والباقي يُطبَّق معها إن بقي مختارًا.`, doc }) : null,
      total,
    ].filter(Boolean),
    doc,
  });
  sync();
  const v = await openDialog({
    doc, size: 'lg', title: 'معاينة الاستكمال المترجم', content, focus: 'cancel',
    actions: [
      { label: `تطبيق على ${picked.size === 2 ? 'مقطعين' : formatCount(picked.size, COUNT_FORMS.cue)}`, value: 'apply', variant: 'primary', ref: (b) => { applyBtn = b; sync(); } },
      { label: 'إلغاء', value: 'cancel' },
    ],
  });
  return v === 'apply' && picked.size ? [...picked].sort((a, b) => a - b) : null;
}
