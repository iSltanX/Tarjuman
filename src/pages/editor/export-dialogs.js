// حوارا «تقرير مراجعة…» و«نص دراسي…» في قائمة التصدير (R58، مواصفة التصميم §١٩.٩): خيارات قليلة ظاهرة (ما يدخل التقرير،
// والمقتطفات باختيار المستخدم، والصيغة؛ والنص العربي أو ثنائي اللغة) بعدد ما سيُكتب واسم الملف قبل التنزيل. البناء من
// buildReviewReport وbuildStudyText (P11)، والحفظ عبر saveFile في app.js. يعيد الملف أو null.
import { isTjError, messageFor } from '../../core/errors/index.js';
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
    el('legend', { className: 'tj-label', text: 'الصيغة', doc }),
    ...[['md', 'Markdown (روابط توقيت قابلة للنقر)'], ['txt', 'نص عادي TXT']].map(([v, t]) => el('label', {
      className: 'ed-radio',
      children: [el('input', { attrs: { type: 'radio', name, value: v, ...(v === value ? { checked: '' } : {}) }, on: { change: () => onPick(v) }, doc }), el('span', { text: t, doc })],
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
  const noteLine = el('p', { className: 'tj-caption', doc });
  const errBox = el('div', { doc });
  const refresh = () => {
    try {
      last = build();
    } catch (err) {
      if (!isTjError(err)) throw err;
      last = { file: null, why: messageFor(err.code) };
    }
    nameLine.replaceChildren(...(last.file ? ['اسم الملف: ', ltr(last.file.name, { doc })] : []));
    noteLine.textContent = last.note ?? '';
    errBox.replaceChildren(...(last.why ? [alertBox({ tone: 'info', title: 'لا يُصدَّر الآن', text: last.why, doc })] : []));
    if (btn) setDisabled(btn, last.why);
  };
  const content = el('div', { className: 'tj-stack', children: [el('p', { className: 'tj-body-sm', text: intro, doc }), ...controls, nameLine, noteLine, errBox], doc });
  content.addEventListener('change', refresh);
  refresh();
  const v = await openDialog({
    doc, size: 'md', title, content, focus: 'save',
    actions: [{ label: 'تنزيل', value: 'save', variant: 'primary', ref: (b) => { btn = b; refresh(); } }, { label: 'إلغاء', value: 'cancel' }],
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
    doc, title: 'تقرير مراجعة', intro: 'قائمة بالمقاطع التي تحتاج انتباهًا: مشكلاتها وأزمنتها بروابطها في الفيديو، وعلاماتك. النص لا يُلخَّص ولا يُغيَّر.',
    controls: [
      el('fieldset', {
        className: 'ed-fieldset',
        children: [
          el('legend', { className: 'tj-label', text: 'يدخل التقرير', doc }),
          check(doc, 'الفحص الآلي (التوقيت والمقارنة والكثافة)', o.auto, (v) => { o.auto = v; }),
          check(doc, 'علاماتي («أعود إليه» و«راجعته»)', o.marks, (v) => { o.marks = v; }),
          check(doc, 'مقتطف النص العربي والإنجليزي لكل بند', o.includeText, (v) => { o.includeText = v; }),
        ],
        doc,
      }),
      formats(doc, 'ed-report-format', o.format, (v) => { o.format = v; }),
    ],
    build: () => {
      const r = build(o);
      return { file: r.count ? r.file : null, why: r.count ? null : 'لا مشكلات ولا علامات بهذه الخيارات.', note: r.count ? `${r.count} بندًا في التقرير.` : '' };
    },
  });
}

/**
 * «نص دراسي…»: الترجمة فقرات للقراءة بروابط توقيت، عربيًا أو ثنائي اللغة.
 * @param {{ doc: Document, hasEnglish: boolean, build: (o: { bilingual: boolean, format: 'txt' | 'md' }) => { name: string, text: string } }} o
 */
export function openStudyDialog({ doc, hasEnglish, build }) {
  const o = { bilingual: false, format: /** @type {'txt' | 'md'} */ ('md') };
  return exportDialog({
    doc, title: 'نص دراسي', intro: 'الترجمة كما هي فقراتٍ للقراءة، لكل فقرة رابط إلى زمنها في الفيديو. لا تلخيص ولا تغيير في النص.',
    controls: [
      check(doc, 'ثنائي اللغة (العربية فوق الإنجليزية)', o.bilingual, (v) => { o.bilingual = v; }, {
        disabled: !hasEnglish, title: hasEnglish ? undefined : messageFor('EX_STUDY_NO_ENGLISH'),
      }),
      formats(doc, 'ed-study-format', o.format, (v) => { o.format = v; }),
    ],
    build: () => ({ file: build(o), why: null }),
  });
}
