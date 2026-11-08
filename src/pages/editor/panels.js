// اللوحة الجانبية (مواصفة التصميم §١١.٢): المشكلات بعددها وكل بند يقفز إلى صفه، والمقارنة بملخصها وزر
// «استعادة التوقيت الأصلي…» حين يتطابق العدد والترقيم وحده، وملاحظات الاستيراد. وصف فقط: لا إصلاح تلقائي.
import { messageFor } from '../../core/errors/index.js';
import { t } from '../../i18n/index.js';
import { button, el, statusPill } from '../../ui/components.js';
import { textDirection } from '../../ui/format.js';
import { comparisonLines, issuesSummary, restoreUnavailable } from './text.js';

const MAX_ITEMS = 200;

/**
 * @param {HTMLElement} box
 * @param {{ doc: Document, report: import('../../core/edit/issues.js').IssueReport, onJump: (index: number, field: string | null) => void }} o
 */
export function renderIssues(box, { doc, report, onJump }) {
  const items = [...report.list.filter((x) => x.tone === 'error'), ...report.list.filter((x) => x.tone === 'warning')];
  const tone = report.errors ? 'danger' : report.warnings ? 'warning' : 'success';
  const list = el('ul', {
    className: 'ed-issues',
    children: items.slice(0, MAX_ITEMS).map((x) => el('li', {
      children: [el('button', {
        className: `ed-issue ed-issue--${x.tone}`,
        attrs: { type: 'button', 'data-index': String(x.index), 'data-field': x.field ?? '' },
        children: [
          el('span', { className: 'ed-issue__n tj-mono-sm', text: String(x.n), doc }),
          el('span', { className: 'ed-issue__text', text: `${t(x.tone === 'error' ? 'editor.issues.error' : 'editor.issues.warning')}: ${messageFor(x.code, x.params ?? undefined)}`, doc }),
        ],
        on: { click: () => onJump(x.index, x.field) },
        doc,
      })],
      doc,
    })),
    doc,
  });
  // replaceChildren يكتب null نصًا، فتُسقط الأجزاء الغائبة قبله.
  box.replaceChildren(...[
    el('div', { className: 'ed-panel__head', children: [el('h2', { className: 'tj-h4', text: t('editor.issues.title'), doc }), statusPill({ tone, text: report.list.length ? issuesSummary(report) : t('editor.issues.noneChecked'), doc })], doc }),
    report.errors ? el('p', { className: 'tj-caption', text: t('editor.issues.errorsBlock'), doc }) : null,
    report.exportBlockers.length ? el('p', { className: 'tj-caption', text: t('editor.issues.exportBlockers'), doc }) : null,
    items.length ? list : null,
    items.length > MAX_ITEMS ? el('p', { className: 'tj-caption', text: t('editor.issues.more', { n: items.length - MAX_ITEMS }), doc }) : null,
  ].filter(Boolean));
}

/**
 * مرجع المقارنة (R50، P14): التصدير الإنجليزي المستعمل، واختيار غيره عند التعدد بترتيبه وسببه، وبيان غيابه أو ضعف الثقة به.
 * الاختيار معاينةٌ تعيد المقارنة والعمود المرجعي، ولا يُحفظ إلا بـ«اعتماد هذا المرجع».
 * @param {HTMLElement} box
 * @param {{
 *   doc: Document, options: { id: string, label: string, score: number, why: string }[], savedId: string | null,
 *   shownId: string | null, preview: boolean, readOnly: string | null, busy: boolean,
 *   onChoose: (id: string | null) => void, onCommit: () => void, onCancel: () => void
 * }} o
 */
export function renderReference(box, { doc, options, savedId, shownId, preview, readOnly, busy, onChoose, onCommit, onCancel }) {
  const head = el('div', { className: 'ed-panel__head', children: [el('h2', { className: 'tj-h4', text: t('editor.ref.title'), doc }), preview ? statusPill({ tone: 'warning', text: t('editor.ref.previewUnsaved'), doc }) : el('span', { doc })], doc });
  if (!options.length) {
    box.replaceChildren(head, el('p', { className: 'tj-caption', text: t('editor.ref.noOriginal'), doc }));
    return;
  }
  const sel = el('select', {
    className: 'ed-select ed-ref-choice', attrs: { 'aria-label': t('editor.ref.choiceAria') },
    on: { change: () => onChoose(sel.value || null) },
    children: [
      ...options.map((o, k) => el('option', { text: `${o.label} — ${Math.round(o.score * 100)}%${k === 0 ? t('editor.ref.closest') : ''}`, attrs: { value: o.id }, doc })),
      el('option', { text: t('editor.ref.none'), attrs: { value: '' }, doc }),
    ],
    doc,
  });
  sel.value = shownId ?? '';
  sel.disabled = Boolean(readOnly) || busy;
  const shown = options.find((o) => o.id === shownId) ?? null;
  const weak = shown && shown.score < 0.5;
  box.replaceChildren(...[
    head,
    sel,
    shown ? el('p', { className: `tj-caption${weak ? ' ed-ref-weak' : ''}`, text: `${weak ? t('editor.ref.weak') : ''}${shown.why}`, doc }) : el('p', { className: 'tj-caption', text: t('editor.ref.noneNote'), doc }),
    el('p', { className: 'tj-caption', text: t('editor.ref.matchNote'), doc }),
    preview ? el('div', {
      className: 'ed-group ed-wrap',
      children: [
        button({ label: t('editor.ref.commit'), variant: 'primary', size: 'sm', loading: busy, onClick: onCommit, doc }),
        button({ label: t('editor.ref.cancel'), size: 'sm', variant: 'ghost', onClick: onCancel, doc }),
      ],
      doc,
    }) : null,
    !preview && savedId === null && options.length ? el('p', { className: 'tj-caption', text: t('editor.ref.unsavedNote'), doc }) : null,
  ].filter(Boolean));
}

/**
 * @param {HTMLElement} box
 * @param {{
 *   doc: Document, report: import('../../core/model/tracks.js').ComparisonReport | null, notes: string[],
 *   readOnly: boolean, onRestore: () => void, onJumpN: (n: number) => void
 * }} o
 */
export function renderComparison(box, { doc, report, notes, readOnly, onRestore, onJumpN }) {
  const lines = comparisonLines(report).map((l) => el('li', { className: `ed-cmp__line ed-cmp__line--${l.tone}`, text: l.text, doc }));
  const reason = restoreUnavailable(report);
  const jumpable = report && report.fingerprintId !== null
    ? [...new Set([...report.drift.map((d) => d.n), ...report.extra, ...report.missing])].sort((a, b) => a - b).slice(0, 12)
    : [];
  const restore = reason
    ? el('p', { className: 'tj-caption', text: reason, doc })
    : button({ label: t('editor.cmp.restore'), variant: 'secondary', size: 'sm', disabledReason: readOnly ? messageFor('ED_READ_ONLY') : null, onClick: onRestore, doc });
  box.replaceChildren(...[
    el('div', { className: 'ed-panel__head', children: [el('h2', { className: 'tj-h4', text: t('editor.cmp.title'), doc })], doc }),
    el('ul', { className: 'ed-cmp', children: lines, doc }),
    jumpable.length ? el('div', {
      className: 'ed-chips',
      attrs: { role: 'group', 'aria-label': t('editor.cmp.jumpGroup') },
      children: jumpable.map((n) => el('button', { className: 'ed-chip tj-mono-sm', text: String(n), attrs: { type: 'button', 'aria-label': t('editor.cmp.jumpTo', { n }) }, on: { click: () => onJumpN(n) }, doc })),
      doc,
    }) : null,
    restore,
    notes.length ? el('details', {
      className: 'ed-notes',
      children: [el('summary', { text: t('editor.cmp.notes', { n: notes.length }), doc }), el('ul', { children: notes.map((note) => el('li', { className: 'tj-auto', text: note, dir: textDirection(note), doc })), doc })],
      doc,
    }) : null,
  ].filter(Boolean));
}
