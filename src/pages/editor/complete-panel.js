// لوحة «الاستكمال» في المحرّر (R52، مواصفة التصميم §١٩.٩): اختيار المقاطع بمربعات وأعداد (الناقص والفارغ تلقائيًا، و«بلا
// حروف عربية» اختياري، والمعلّمة والمحددة)، و«تنزيل ملف الاستكمال» و«نسخ تعليماته»، و«استيراد ملف تصحيح…» بمعاينة واختيار،
// وحالة الأجزاء المستلمة. الملف من buildPatchPackage والقراءة من readPatch (P11)؛ وحوار المعاينة هنا، والتطبيق خطوة واحدة في
// الجلسة لا تُحفظ حتى «حفظ».
import { messageFor } from '../../core/errors/index.js';
import { t } from '../../i18n/index.js';
import { alertBox, button, el, ltr, statusPill } from '../../ui/components.js';
import { COUNT_FORMS, formatCount, formatTimecode } from '../../ui/format.js';
import { openDialog, setDisabled } from './dialogs.js';
import { numberList } from './text.js';

// المجموعات برموزها؛ النصوص (التسمية والتلميح) من الفهرس عند الرسم. «marked» بلا تلميح.
const GROUPS = Object.freeze(['missing', 'empty', 'noArabic', 'marked', 'selected']);
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
  const checks = GROUPS.map((key) => {
    const label = t(`editor.complete.groups.${key}`);
    const hint = key === 'marked' ? null : t(`editor.complete.hints.${key}`);
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
  const download = button({ label: t('editor.complete.download'), variant: 'primary', size: 'sm', loading: o.busy, onClick: o.onDownload, doc });
  const copy = button({ label: t('editor.complete.copy'), size: 'sm', onClick: o.onCopy, doc });
  setDisabled(download, o.reason ?? (o.numbers.length ? null : messageFor('ED_COMPLETE_NOTHING')));
  setDisabled(copy, o.reason);
  const file = el('input', { attrs: { type: 'file', accept: '.srt,.txt,.md,text/plain', multiple: '', hidden: '', 'aria-hidden': 'true', tabindex: '-1' }, doc });
  file.addEventListener('change', () => {
    const files = [...(file.files ?? [])];
    file.value = '';
    if (files.length) o.onImport(files);
  });
  const importBtn = button({ label: t('editor.complete.import'), size: 'sm', onClick: () => file.click(), doc });
  setDisabled(importBtn, o.reason ?? o.readOnly);

  const parts = o.parts ? el('section', {
    className: 'ed-markgroup',
    children: [
      el('h3', { className: 'tj-label', text: t('editor.complete.partsTitle'), doc }),
      el('ul', {
        className: 'ed-resume',
        children: o.parts.map((p) => el('li', {
          className: 'ed-resume__item',
          children: [
            el('span', { className: 'tj-body-sm', text: t('editor.complete.part', { index: p.index, from: p.from, to: p.to }), doc }),
            statusPill({ tone: p.complete ? 'success' : p.received ? 'warning' : 'neutral', text: p.complete ? t('editor.complete.partDone') : t('editor.complete.partProgress', { received: p.received, total: p.total }), doc }),
          ],
          doc,
        })),
        doc,
      }),
      el('p', { className: 'tj-caption', text: t('editor.complete.partsNote'), doc }),
    ],
    doc,
  }) : null;

  box.replaceChildren(...[
    el('div', {
      className: 'ed-panel__head',
      children: [el('h2', { className: 'tj-h4', text: t('editor.complete.title'), doc }), statusPill({ tone: o.numbers.length ? 'info' : 'neutral', text: o.numbers.length ? formatCount(o.numbers.length, COUNT_FORMS.cue) : t('editor.complete.noneSelected'), doc })],
      doc,
    }),
    el('p', { className: 'tj-caption', text: t('editor.complete.intro'), doc }),
    o.reason ? alertBox({ tone: 'info', title: t('editor.complete.unavailable'), text: o.reason, doc }) : null,
    el('fieldset', { className: 'ed-fieldset', children: [el('legend', { className: 'tj-label', text: t('editor.complete.cues'), doc }), ...checks], doc }),
    o.numbers.length ? el('p', { className: 'tj-caption', text: t('editor.complete.numbers', { list: numberList(o.numbers) }), doc }) : null,
    el('div', { className: 'ed-group ed-wrap', children: [download, copy], doc }),
    o.glossaryCount ? el('p', { className: 'tj-caption', text: t('editor.complete.glossary', { n: o.glossaryCount }), doc }) : null,
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
  const applyLabel = () => t('editor.complete.applyTo', { n: picked.size, count: formatCount(picked.size, COUNT_FORMS.cue) });
  const sync = () => {
    total.textContent = t('editor.complete.picked', { count: formatCount(picked.size, COUNT_FORMS.cue), total: plan.items.length });
    if (applyBtn) {
      applyBtn.firstChild.textContent = applyLabel();
      setDisabled(applyBtn, picked.size ? null : t('editor.complete.pickOne'));
    }
  };
  const flat = (s) => s.replace(/\s*\n\s*/g, ' / ');
  const rows = plan.items.slice(0, MAX_PREVIEW).map((it) => {
    const box = el('input', { attrs: { type: 'checkbox', checked: '', 'aria-label': t('editor.complete.applyAria', { n: it.n }) }, on: { change: () => { if (box.checked) picked.add(it.n); else picked.delete(it.n); sync(); } }, doc });
    return el('label', {
      className: 'ed-replace-item',
      children: [
        box,
        el('span', { className: 'ed-replace-item__n tj-mono-sm', text: String(it.n), doc }),
        el('span', {
          className: 'ed-replace-item__text', dir: 'auto',
          children: it.action === 'replace'
            ? [t('editor.complete.replace'), it.before.text ? el('del', { text: flat(it.before.text), doc }) : el('del', { text: t('editor.complete.empty'), doc }), ' ', el('ins', { text: flat(it.after.text), doc })]
            : [t('editor.complete.insertAt'), ltr(formatTimecode(it.after.startMs), { doc }), ': ', el('ins', { text: flat(it.after.text), doc })],
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
        text: t('editor.complete.summary', { count: formatCount(plan.items.length, COUNT_FORMS.cue), replace: plan.items.length - inserts, insert: inserts }),
        doc,
      }),
      ...plan.warnings.map((w) => alertBox({ tone: 'warning', title: t('editor.complete.warning'), text: messageFor(w.code, w.params), doc })),
      plan.notes.length ? el('details', { className: 'ed-notes', children: [el('summary', { text: t('editor.complete.readNotes', { n: plan.notes.length }), doc }), el('ul', { children: plan.notes.map((note) => el('li', { className: 'tj-auto', text: note, doc })), doc })], doc }) : null,
      rows.length ? el('div', { className: 'ed-preview-table ed-replace-list', children: rows, doc }) : el('p', { className: 'tj-caption', text: t('editor.complete.nothing'), doc }),
      plan.items.length > MAX_PREVIEW ? el('p', { className: 'tj-caption', text: t('editor.complete.truncated', { n: MAX_PREVIEW }), doc }) : null,
      total,
    ].filter(Boolean),
    doc,
  });
  sync();
  const v = await openDialog({
    doc, size: 'lg', title: t('editor.complete.previewTitle'), content, focus: 'cancel',
    actions: [
      { label: applyLabel(), value: 'apply', variant: 'primary', ref: (b) => { applyBtn = b; sync(); } },
      { label: t('common.cancel'), value: 'cancel' },
    ],
  });
  return v === 'apply' && picked.size ? [...picked].sort((a, b) => a - b) : null;
}
