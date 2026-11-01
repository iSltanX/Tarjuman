// اللوحة الجانبية (مواصفة التصميم §١١.٢): المشكلات بعددها وكل بند يقفز إلى صفه، والمقارنة بملخصها وزر
// «استعادة التوقيت الأصلي…» حين يتطابق العدد والترقيم وحده، وملاحظات الاستيراد. وصف فقط: لا إصلاح تلقائي.
import { messageFor } from '../../core/errors/index.js';
import { button, el, statusPill } from '../../ui/components.js';
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
          el('span', { className: 'ed-issue__text', text: `${x.tone === 'error' ? 'خطأ' : 'تحذير'}: ${messageFor(x.code, x.params ?? undefined)}`, doc }),
        ],
        on: { click: () => onJump(x.index, x.field) },
        doc,
      })],
      doc,
    })),
    doc,
  });
  box.replaceChildren(
    el('div', { className: 'ed-panel__head', children: [el('h2', { className: 'tj-h4', text: 'المشكلات', doc }), statusPill({ tone, text: report.list.length ? issuesSummary(report) : 'لا مشكلات ✓', doc })], doc }),
    report.errors ? el('p', { className: 'tj-caption', text: 'الأخطاء تمنع الحفظ والتصدير، ولا إصلاح تلقائي.', doc }) : null,
    report.exportBlockers.length ? el('p', { className: 'tj-caption', text: 'التداخل والمقطع بلا نص يمنعان التصدير وحده؛ الحفظ متاح.', doc }) : null,
    items.length ? list : null,
    items.length > MAX_ITEMS ? el('p', { className: 'tj-caption', text: `و${items.length - MAX_ITEMS} أخرى في القائمة.`, doc }) : null,
  );
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
    : button({ label: 'استعادة التوقيت الأصلي…', variant: 'secondary', size: 'sm', disabledReason: readOnly ? messageFor('ED_READ_ONLY') : null, onClick: onRestore, doc });
  box.replaceChildren(
    el('div', { className: 'ed-panel__head', children: [el('h2', { className: 'tj-h4', text: 'المقارنة', doc })], doc }),
    el('ul', { className: 'ed-cmp', children: lines, doc }),
    jumpable.length ? el('div', {
      className: 'ed-chips',
      attrs: { role: 'group', 'aria-label': 'انتقال إلى مقاطع في التقرير' },
      children: jumpable.map((n) => el('button', { className: 'ed-chip tj-mono-sm', text: String(n), attrs: { type: 'button', 'aria-label': `انتقال إلى المقطع ${n}` }, on: { click: () => onJumpN(n) }, doc })),
      doc,
    }) : null,
    restore,
    notes.length ? el('details', {
      className: 'ed-notes',
      children: [el('summary', { text: `ملاحظات الاستيراد (${notes.length})`, doc }), el('ul', { children: notes.map((t) => el('li', { className: 'tj-auto', text: t, doc })), doc })],
      doc,
    }) : null,
  );
}
