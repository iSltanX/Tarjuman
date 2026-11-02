// حوار الرفع والاستبدال الكامل (R48/R49/R50، P13-AC2، مواصفة التصميم §١٩.٧): بعد فحص الملف كاملًا، الخانة الهدف بأسمائها،
// والمرجع (قائمة عند تعدد التصديرات، والمقترح «الأقرب»، و«غير مؤكد» عند التقارب)، وملخص المقارنة بالمرجع المختار، وتنبيه
// الاسم، وأعداد ما سيتغير وجدول قابل للطي (# · الحالي · الجديد) بدفعات من 200، وما سيُفقد من التعديلات اليدوية، و«إبقاء
// تعديلاتي» بشرط المحاذاة (والسبب في التلميح واسم الوصول). لا كتابة هنا: الحوار يعيد الاختيار، والإلغاء لا يمس التخزين.
import { messageFor } from '../../core/errors/index.js';
import { alertBox, el, ltr, statusPill } from '../../ui/components.js';
import { COUNT_FORMS, formatCount, offsetInline, textDirection } from '../../ui/format.js';
import { compareWith, uploadImpact } from './actions.js';
import { absoluteTime, comparisonSummary, defaultTarget, diffCountLines, fingerprintLabel, nameHintText, targetOptions } from './model.js';

export const DIFF_BATCH = 200;
let seq = 0;
const EDIT_FORMS = Object.freeze({ one: 'تعديل يدوي واحد', two: 'تعديلان يدويان', few: 'تعديلات يدوية', many: 'تعديلًا يدويًا', single: 'تعديل يدوي' });

const cueText = (c) => (Array.isArray(c) ? c.map((x) => x.text).join(' ⏎ ') : c ? c.text : '—');
const cueNumber = (ch) => String(ch.n);

/** جدول الفروق بدفعات: # · الحالي · الجديد. @param {Document} doc @param {{ n: number, before: unknown, after: unknown }[]} changes */
function diffTable(doc, changes) {
  const tbody = el('tbody', { doc });
  const more = el('button', { className: 'tj-btn tj-btn--secondary tj-btn--sm lib-diff__more', attrs: { type: 'button' }, doc });
  let shown = 0;
  const step = () => {
    const next = changes.slice(shown, shown + DIFF_BATCH);
    tbody.append(...next.map((ch) => el('tr', {
      attrs: { 'data-kind': ch.kind },
      children: [
        el('td', { className: 'lib-diff__n', children: [ltr(cueNumber(ch), { doc })], doc }),
        el('td', { className: 'lib-diff__before', text: cueText(ch.before), dir: textDirection(cueText(ch.before)), doc }),
        el('td', { className: 'lib-diff__after', text: cueText(ch.after), dir: textDirection(cueText(ch.after)), doc }),
      ],
      doc,
    })));
    shown += next.length;
    more.textContent = `عرض ${Math.min(DIFF_BATCH, changes.length - shown)} أخرى`;
    more.hidden = shown >= changes.length;
  };
  more.addEventListener('click', step);
  step();
  const table = el('table', {
    className: 'lib-diff',
    children: [el('thead', { children: [el('tr', { children: ['#', 'الحالي', 'الجديد'].map((h) => el('th', { text: h, attrs: { scope: 'col' }, doc })), doc })], doc }), tbody],
    doc,
  });
  return el('details', {
    className: 'lib-diff__box',
    children: [el('summary', { className: 'lib-diff__summary', text: `جدول الفروق (${changes.length})`, doc }), el('div', { className: 'lib-diff__wrap', children: [table], doc }), more],
    doc,
  });
}

/**
 * يبني محتوى الحوار وحالته. `choice()` يعيد { n, fingerprintId, keepCues }، و`replace()` هل الهدف ممتلئ.
 * @param {{
 *   doc: Document, prep: Awaited<ReturnType<typeof import('./actions.js').prepareUpload>>, preferred?: 1 | 2 | 3 | null,
 *   titleOf?: (videoId: string) => string | null, onTarget?: (replace: boolean) => void,
 * }} o
 */
export function uploadContent({ doc, prep, preferred = null, titleOf = () => null, onTarget = () => {} }) {
  const { bundle, result, review, settings } = prep;
  const id = `lib-up-${++seq}`;
  const fps = bundle.record.fingerprints;
  let target = defaultTarget(bundle, preferred);
  let reference = review.suggested ?? result.fingerprintId ?? null;
  let impact = uploadImpact(bundle, target, result.cues);

  // الخانة الهدف بأسمائها: المحفوظة ثم «ترجمة جديدة».
  const options = targetOptions(bundle, preferred);
  if (!options.some((o) => o.n === target)) target = options[0].n;
  const targetInputs = options.map((o) => {
    const input = el('input', { attrs: { type: 'radio', name: `${id}-target`, value: String(o.n) }, doc });
    input.checked = o.n === target;
    input.addEventListener('change', () => {
      if (!input.checked) return;
      target = o.n;
      impact = uploadImpact(bundle, target, result.cues);
      renderImpact();
      onTarget(impact.replace);
    });
    return input;
  });
  // العنوان المرئي فقرة فوق المجموعة: legend يقع على حد fieldset فتُقص نقاط حروفه العليا («حفظ في»)؛ ويبقى اسم الوصول.
  const targetHead = el('p', { className: 'tj-label lib-up__head', text: 'حفظ في', attrs: { 'aria-hidden': 'true' }, doc });
  // بلا ترجمة محفوظة: سطر «تُحفظ ترجمةً جديدة» بلا محدد، كتأكيد المشغّل.
  const onlyNew = options.length === 1 && !options[0].filled;
  const targetGroup = onlyNew ? el('p', { className: 'tj-body-sm lib-up__only-new', text: 'تُحفظ ترجمةً جديدة.', doc }) : el('fieldset', {
    className: 'tj-choice lib-up__targets',
    children: [
      el('legend', { className: 'tj-sr-only', text: 'حفظ في', doc }),
      ...options.map((o, i) => el('label', {
        className: 'tj-choice__option',
        children: [targetInputs[i], el('span', { className: 'tj-choice__text', children: [el('span', { className: 'tj-choice__label', text: o.label, dir: 'auto', doc }), o.filled ? el('span', { className: 'tj-choice__hint', text: 'ممتلئة: الحفظ فيها استبدال', doc }) : null], doc })],
        doc,
      })),
    ],
    doc,
  });

  // المرجع.
  const compareHost = el('div', { className: 'lib-up__compare', doc });
  const renderCompare = () => {
    const fp = reference ? fps.find((f) => f.id === reference) ?? null : null;
    const report = reference === result.fingerprintId ? result.comparison : compareWith(result.cues, fp, settings, result.notes);
    const s = comparisonSummary(report);
    compareHost.replaceChildren(alertBox({ tone: s.tone, text: s.lines.join('\n'), doc }));
  };
  let referenceBlock;
  if (!fps.length) {
    referenceBlock = el('p', { className: 'tj-caption', text: 'لا تصدير إنجليزي محفوظ لهذا الفيديو، فلا مرجع للمقارنة؛ يُحفظ الملف كما هو.', doc });
  } else if (fps.length === 1) {
    // تصدير واحد: لا اختيار، والمرجع سطر.
    referenceBlock = el('p', { className: 'tj-body-sm lib-up__ref-line', children: ['المرجع: ', el('span', { text: fingerprintLabel(fps[0], absoluteTime(fps[0].createdAt)), doc })], doc });
  } else {
    const ranked = review.references.map((r) => r.fingerprintId);
    const order = [...ranked, ...fps.map((f) => f.id).filter((x) => !ranked.includes(x))];
    const sid = `${id}-ref`;
    const select = el('select', {
      className: 'tj-field__input lib-up__ref', attrs: { id: sid, 'aria-describedby': `${sid}-why` },
      children: [
        ...order.map((fid) => {
          const fp = fps.find((f) => f.id === fid);
          return el('option', { text: `${fingerprintLabel(fp, absoluteTime(fp.createdAt))}${fid === review.suggested ? ' — الأقرب' : ''}`, attrs: { value: fid }, doc });
        }),
        el('option', { text: 'بلا مرجع', attrs: { value: '' }, doc }),
      ],
      doc,
    });
    select.value = reference ?? '';
    const why = review.references.find((r) => r.fingerprintId === review.suggested)?.why ?? '';
    select.addEventListener('change', () => {
      reference = select.value || null;
      renderCompare();
    });
    referenceBlock = el('div', {
      className: 'tj-field lib-up__field',
      children: [
        el('div', { className: 'lib-up__label', children: [el('label', { className: 'tj-field__label', text: 'المرجع', attrs: { for: sid }, doc }), fps.length > 1 && !review.certain ? statusPill({ tone: 'warning', text: 'غير مؤكد', title: 'المرجعان متقاربان؛ تأكد من اختيار التصدير الذي ترجمته.', doc }) : null], doc }),
        select,
        el('span', { className: 'tj-field__hint', text: why, attrs: { id: `${sid}-why` }, doc }),
      ],
      doc,
    });
  }

  // تنبيه الاسم.
  const hint = nameHintText(review.nameHint, titleOf);

  // ما سيتغير وما سيُفقد و«إبقاء تعديلاتي».
  const impactHost = el('div', { className: 'lib-up__impact', doc });
  const keepBox = el('input', { attrs: { id: `${id}-keep`, type: 'checkbox' }, doc });
  const keepWhy = el('span', { className: 'tj-sr-only', attrs: { id: `${id}-keep-why` }, doc });
  const keepLabel = el('label', { className: 'lib-check', attrs: { for: `${id}-keep` }, children: [keepBox, el('span', { text: 'إبقاء تعديلاتي', doc }), keepWhy], doc });
  function renderImpact() {
    const kids = [];
    const slot = bundle.slots[target - 1];
    if (impact.replace) {
      kids.push(...diffCountLines(impact.diff).map((t) => el('p', { className: 'tj-body-sm lib-up__counts', text: t, doc })));
      if (impact.diff.changes.length) kids.push(diffTable(doc, impact.diff.changes));
      if (impact.edits) {
        kids.push(el('p', { className: 'tj-body-sm lib-up__lost', text: `سيُستبدل ${formatCount(impact.edits, EDIT_FORMS)}.`, doc }));
        keepBox.checked = false;
        keepBox.disabled = !impact.keep.ok;
        keepBox.setAttribute('aria-disabled', impact.keep.ok ? 'false' : 'true');
        keepLabel.title = impact.keep.ok ? 'تُطبَّق تعديلاتك على الملف الجديد حيث لم يغيّر موضعها، وما تعارض منها يأخذه الملف الجديد.' : impact.keep.reason ?? '';
        keepWhy.textContent = impact.keep.ok ? '' : ` (${impact.keep.reason ?? ''})`;
        if (impact.keep.ok) keepBox.removeAttribute('aria-describedby');
        else keepBox.setAttribute('aria-describedby', keepWhy.getAttribute('id'));
        kids.push(keepLabel);
      }
      kids.push(el('p', { className: 'tj-caption', text: 'تُحفظ الترجمة المستبدلة نسخةً سابقة يمكن استعادتها.', doc }));
    }
    if (bundle.active === target && slot.offsetMs !== 0) kids.push(el('p', { className: 'tj-caption', text: `ستُصفَّر إزاحة العرض (${offsetInline(slot.offsetMs)} ث) لأن الملف الجديد يحمل توقيته.`, doc }));
    impactHost.replaceChildren(...kids);
  }

  renderCompare();
  renderImpact();
  const root = el('div', {
    className: 'lib-up',
    children: [
      el('p', { className: 'tj-body-sm', children: [ltr(result.fileName, { mono: false, doc }), ` · ${formatCount(result.cues.length, COUNT_FORMS.cue)}`], doc }),
      ...result.warnings.map((w) => el('p', { className: 'tj-caption', text: messageFor(w.code, w.params), doc })),
      hint ? alertBox({ tone: 'warning', text: hint, doc }) : null,
      onlyNew ? null : targetHead,
      targetGroup,
      referenceBlock,
      compareHost,
      impactHost,
    ],
    doc,
  });
  return {
    root,
    replace: () => impact.replace,
    choice: () => ({ n: target, fingerprintId: reference, keepCues: impact.keep.ok && keepBox.checked ? impact.keep.cues : null }),
  };
}
