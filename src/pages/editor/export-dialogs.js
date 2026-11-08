// حوارا «تقرير مراجعة…» و«نص دراسي…» في قائمة التصدير (R58، مواصفة التصميم §١٩.٩): خيارات قليلة ظاهرة (ما يدخل التقرير،
// والمقتطفات باختيار المستخدم، والصيغة؛ والنص العربي أو ثنائي اللغة) بعدد ما سيُكتب واسم الملف قبل التنزيل. البناء من
// buildReviewReport وbuildStudyText (P11)، والحفظ عبر saveFile في app.js. يعيد الملف أو null.
import { isTjError, messageFor } from '../../core/errors/index.js';
import { t } from '../../i18n/index.js';
import { alertBox, el, ltr } from '../../ui/components.js';
import { openDialog, setDisabled } from './dialogs.js';

const check = (doc, label, checked, onChange, { disabled = false, title } = {}) => {
  const box = el('input', { attrs: { type: 'checkbox', ...(checked ? { checked: '' } : {}) }, on: { change: () => onChange(box.checked) }, doc });
  box.disabled = disabled;
  return el('label', { className: 'ed-radio', attrs: title ? { title } : {}, children: [box, el('span', { text: label, doc })], doc });
};
const formats = (doc, name, value, onPick) => el('fieldset', {
  className: 'ed-fieldset',
  children: [
    el('legend', { className: 'tj-label', text: t('editor.format.legend'), doc }),
    ...[['md', t('editor.format.md')], ['txt', t('editor.format.txt')]].map(([v, label]) => el('label', {
      className: 'ed-radio',
      children: [el('input', { attrs: { type: 'radio', name, value: v, ...(v === value ? { checked: '' } : {}) }, on: { change: () => onPick(v) }, doc }), el('span', { text: label, doc })],
      doc,
    })),
  ],
  doc,
});

/**
 * @param {{ doc: Document, title: string, intro: string, controls: HTMLElement[], build: () => { file: { name: string, text: string } | null, why: string | null, note?: string } }} o
 */
async function exportDialog({ doc, title, intro, controls, build }) {
  let btn = null;
  let last = null;
  const nameLine = el('p', { className: 'tj-body-sm', doc });
  // سطر العدد يتغيّر مع الخيارات فيُعلَن بهدوء؛ والأسطر الفارغة مخفية فلا تضيف فجوات (تدقيق 7a66f91، U26).
  const noteLine = el('p', { className: 'tj-caption', attrs: { 'aria-live': 'polite' }, doc });
  const errBox = el('div', { doc });
  const refresh = () => {
    try {
      last = build();
    } catch (err) {
      if (!isTjError(err)) throw err;
      last = { file: null, why: messageFor(err.code) };
    }
    nameLine.replaceChildren(...(last.file ? [t('editor.export.fileName'), ltr(last.file.name, { doc })] : []));
    nameLine.hidden = !last.file;
    noteLine.textContent = last.note ?? '';
    noteLine.hidden = !last.note;
    errBox.replaceChildren(...(last.why ? [alertBox({ tone: 'info', title: t('editor.export.blocked'), text: last.why, doc })] : []));
    errBox.hidden = !last.why;
    if (btn) setDisabled(btn, last.why);
  };
  const content = el('div', { className: 'tj-stack', children: [el('p', { className: 'tj-body-sm', text: intro, doc }), ...controls, nameLine, noteLine, errBox], doc });
  content.addEventListener('change', refresh);
  refresh();
  const v = await openDialog({
    doc, size: 'md', title, content, focus: 'save',
    actions: [{ label: t('editor.export.download'), value: 'save', variant: 'primary', ref: (b) => { btn = b; refresh(); } }, { label: t('common.cancel'), value: 'cancel' }],
  });
  return v === 'save' && last?.file ? last.file : null;
}

/**
 * «تقرير مراجعة…»: أرقام المقاطع ومشكلاتها وأزمنتها، والعلامات، ومقتطفات النص باختيار المستخدم.
 * @param {{ doc: Document, build: (o: { auto: boolean, marks: boolean, includeText: boolean, format: 'txt' | 'md' }) => { file: { name: string, text: string } | null, count: number } }} o
 */
export function openReportDialog({ doc, build }) {
  const o = { auto: true, marks: true, includeText: false, format: /** @type {'txt' | 'md'} */ ('md') };
  return exportDialog({
    doc, title: t('editor.report.title'), intro: t('editor.report.intro'),
    controls: [
      el('fieldset', {
        className: 'ed-fieldset',
        children: [
          el('legend', { className: 'tj-label', text: t('editor.report.content'), doc }),
          check(doc, t('editor.report.auto'), o.auto, (v) => { o.auto = v; }),
          check(doc, t('editor.report.marks'), o.marks, (v) => { o.marks = v; }),
          check(doc, t('editor.report.text'), o.includeText, (v) => { o.includeText = v; }),
        ],
        doc,
      }),
      formats(doc, 'ed-report-format', o.format, (v) => { o.format = v; }),
    ],
    build: () => {
      const r = build(o);
      return { file: r.count ? r.file : null, why: r.count ? null : t('editor.report.empty'), note: r.count ? t('editor.report.count', { n: r.count }) : '' };
    },
  });
}

/**
 * «نص دراسي…»: الترجمة فقرات للقراءة بروابط توقيت، عربيًا أو ثنائي اللغة. `note` إشعار ما تبدأ روابطه من 0:00 (studyTimingNote).
 * @param {{ doc: Document, hasEnglish: boolean, build: (o: { bilingual: boolean, format: 'txt' | 'md' }) => { file: { name: string, text: string }, note?: string } }} o
 */
export function openStudyDialog({ doc, hasEnglish, build }) {
  const o = { bilingual: false, format: /** @type {'txt' | 'md'} */ ('md') };
  return exportDialog({
    doc, title: t('editor.study.title'), intro: t('editor.study.intro'),
    controls: [
      check(doc, t('editor.study.bilingual'), o.bilingual, (v) => { o.bilingual = v; }, {
        disabled: !hasEnglish, title: hasEnglish ? undefined : messageFor('EX_STUDY_NO_ENGLISH'),
      }),
      formats(doc, 'ed-study-format', o.format, (v) => { o.format = v; }),
    ],
    build: () => {
      const r = build(o);
      return { file: r.file, why: null, note: r.note ?? '' };
    },
  });
}
