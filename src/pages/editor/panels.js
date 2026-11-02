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
  // replaceChildren يكتب null نصًا، فتُسقط الأجزاء الغائبة قبله.
  box.replaceChildren(...[
    el('div', { className: 'ed-panel__head', children: [el('h2', { className: 'tj-h4', text: 'المشكلات', doc }), statusPill({ tone, text: report.list.length ? issuesSummary(report) : 'لا مشكلات ✓', doc })], doc }),
    report.errors ? el('p', { className: 'tj-caption', text: 'الأخطاء تمنع الحفظ والتصدير، ولا إصلاح تلقائي.', doc }) : null,
    report.exportBlockers.length ? el('p', { className: 'tj-caption', text: 'التداخل والمقطع بلا نص يمنعان التصدير وحده؛ الحفظ متاح.', doc }) : null,
    items.length ? list : null,
    items.length > MAX_ITEMS ? el('p', { className: 'tj-caption', text: `و${items.length - MAX_ITEMS} أخرى في القائمة.`, doc }) : null,
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
  const head = el('div', { className: 'ed-panel__head', children: [el('h2', { className: 'tj-h4', text: 'المرجع الإنجليزي', doc }), preview ? statusPill({ tone: 'warning', text: 'معاينة غير محفوظة', doc }) : el('span', { doc })], doc });
  if (!options.length) {
    box.replaceChildren(head, el('p', { className: 'tj-caption', text: 'لا تصدير إنجليزي محفوظ لهذا الفيديو، فلا مرجع للمقارنة. نزّل الترجمة الإنجليزية من المشغّل أولًا.', doc }));
    return;
  }
  const sel = el('select', {
    className: 'ed-select ed-ref-choice', attrs: { 'aria-label': 'مرجع المقارنة' },
    on: { change: () => onChoose(sel.value || null) },
    children: [
      ...options.map((o, k) => el('option', { text: `${k === 0 ? '★ ' : ''}${o.label} — ${Math.round(o.score * 100)}%`, attrs: { value: o.id }, doc })),
      el('option', { text: 'بلا مرجع', attrs: { value: '' }, doc }),
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
    shown ? el('p', { className: `tj-caption${weak ? ' ed-ref-weak' : ''}`, text: `${weak ? 'ثقة ضعيفة: ' : ''}${shown.why}`, doc }) : el('p', { className: 'tj-caption', text: 'بلا مرجع: يُعرض الملف كما هو، ولا ناقص ولا انحراف يُحسب.', doc }),
    el('p', { className: 'tj-caption', text: 'المطابقة في العدد والتوقيت لا تعني صحة المعنى.', doc }),
    preview ? el('div', {
      className: 'ed-group ed-wrap',
      children: [
        button({ label: 'اعتماد هذا المرجع', variant: 'primary', size: 'sm', loading: busy, onClick: onCommit, doc }),
        button({ label: 'رجوع إلى المحفوظ', size: 'sm', variant: 'ghost', onClick: onCancel, doc }),
      ],
      doc,
    }) : null,
    !preview && savedId === null && options.length ? el('p', { className: 'tj-caption', text: 'لا مرجع محفوظ لهذه الترجمة؛ اختر الأنسب من القائمة.', doc }) : null,
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
    : button({ label: 'استعادة التوقيت الأصلي…', variant: 'secondary', size: 'sm', disabledReason: readOnly ? messageFor('ED_READ_ONLY') : null, onClick: onRestore, doc });
  box.replaceChildren(...[
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
  ].filter(Boolean));
}
