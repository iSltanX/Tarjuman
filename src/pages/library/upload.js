// حوار الرفع والاستبدال الكامل (R48/R49/R50، P13-AC2، مواصفة التصميم §١٩.٧): بعد فحص الملف كاملًا، الخانة الهدف بأسمائها،
// والمرجع (قائمة عند تعدد التصديرات، والمقترح «الأقرب»، و«غير مؤكد» عند التقارب)، وملخص المقارنة بالمرجع المختار، وتنبيه
// الاسم، وأعداد ما سيتغير وجدول قابل للطي (# · الحالي · الجديد) بدفعات من 200، وما سيُفقد من التعديلات اليدوية، و«إبقاء
// تعديلاتي» بشرط المحاذاة (والسبب في التلميح واسم الوصول). لا كتابة هنا: الحوار يعيد الاختيار، والإلغاء لا يمس التخزين.
import { messageFor } from '../../core/errors/index.js';
import { describeLang, knownLanguages, textFitsLang } from '../../core/lang/index.js';
import { isSourceLang } from '../../core/model/ids.js';
import { sourceOf } from '../../core/model/pair.js';
import { getLocale, t as tr } from '../../i18n/index.js';
import { alertBox, el, ltr, statusPill } from '../../ui/components.js';
import { pairLabel } from '../../ui/lang.js';
import { COUNT_FORMS, formatCount, offsetInline, textDirection } from '../../ui/format.js';
import { previewComparison } from '../../core/import/index.js';
import { uploadImpact } from './actions.js';
import { EDIT_FORMS, absoluteTime, chipLabel, comparisonSummary, defaultTarget, diffCountLines, fingerprintLabel, nameHintText, previousLostText, targetOptions } from './model.js';
import { segGroup } from './seg.js';

export const DIFF_BATCH = 200;
let seq = 0;

const cueText = (c) => (Array.isArray(c) ? c.map((x) => x.text).join(' · ') : c ? c.text : '—');
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
        el('td', { className: `lib-diff__before${cueText(ch.before) === '—' ? ' lib-diff__none' : ''}`, text: cueText(ch.before), dir: textDirection(cueText(ch.before)), doc }),
        el('td', { className: `lib-diff__after${cueText(ch.after) === '—' ? ' lib-diff__none' : ''}`, text: cueText(ch.after), dir: textDirection(cueText(ch.after)), doc }),
      ],
      doc,
    })));
    shown += next.length;
    more.textContent = tr('library.upload.diffMore', { n: Math.min(DIFF_BATCH, changes.length - shown) });
    more.hidden = shown >= changes.length;
  };
  more.addEventListener('click', step);
  step();
  const table = el('table', {
    className: 'lib-diff',
    children: [el('thead', { children: [el('tr', { children: ['#', tr('library.upload.diffCurrent'), tr('library.upload.diffNew')].map((h) => el('th', { text: h, attrs: { scope: 'col' }, doc })), doc })], doc }), tbody],
    doc,
  });
  return el('details', {
    className: 'lib-diff__box',
    children: [el('summary', { className: 'lib-diff__summary', text: tr('library.upload.diffSummary', { n: changes.length }), doc }), el('div', { className: 'lib-diff__wrap', children: [table], doc }), more],
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
export function uploadContent({ doc, prep, preferred = null, titleOf = () => null, onTarget = () => {}, suggested = [] }) {
  const { bundle, result, review, settings } = prep;
  const id = `lib-up-${++seq}`;
  const fps = bundle.record.fingerprints;
  let target = defaultTarget(bundle, preferred);
  let reference = review.suggested ?? result.fingerprintId ?? null;
  let impact = uploadImpact(bundle, target, result.cues);

  // الخانة الهدف مقطّعة «حفظ في» (تصميم LibraryDialogs): الترجمات المحفوظة بأرقامها وأسمائها المختصرة (الحفظ فيها استبدال)
  // ثم «جديدة» للخانة الفارغة. اسم الوصول يحوي النص الظاهر ويزيد الفعل (WCAG 2.5.3).
  const options = targetOptions(bundle, preferred);
  if (!options.some((o) => o.n === target)) target = options[0].n;
  const segOption = (o) => {
    if (!o.filled) return { value: String(o.n), label: tr('library.upload.newOne'), ariaLabel: tr('library.upload.newAria') };
    const label = chipLabel(o);
    return { value: String(o.n), label, ariaLabel: tr(o.active ? 'library.upload.replaceAriaActive' : 'library.upload.replaceAria', { label, n: o.n }) };
  };
  const targetSeg = segGroup({
    legend: tr('library.upload.saveIn'), value: String(target), options: options.map(segOption), doc,
    onChange: (v) => {
      target = Number(v);
      impact = uploadImpact(bundle, target, result.cues);
      renderImpact();
      onTarget(impact.replace);
    },
  });
  // العنوان المرئي فقرة فوق المجموعة: legend يقع على حد fieldset فتُقص نقاط حروفه العليا («حفظ في»)؛ ويبقى اسم الوصول.
  const targetHead = el('p', { className: 'tj-label lib-up__head', text: tr('library.upload.saveIn'), attrs: { 'aria-hidden': 'true' }, doc });
  // بلا ترجمة محفوظة: سطر «تُحفظ ترجمةً جديدة» بلا محدد، كتأكيد المشغّل.
  const onlyNew = options.length === 1 && !options[0].filled;
  const targetGroup = onlyNew
    ? el('p', { className: 'tj-body-sm lib-up__only-new', text: tr('library.upload.onlyNew'), doc })
    : el('div', {
      className: 'tj-field lib-up__targets',
      children: [targetSeg.root, el('span', { className: 'tj-field__hint', text: tr('library.upload.filledHint'), doc })],
      doc,
    });

  // المرجع.
  const compareHost = el('div', { className: 'lib-up__compare', doc });
  const renderCompare = () => {
    const fp = reference ? fps.find((f) => f.id === reference) ?? null : null;
    // المعاينة بالمحاذاة كما تُعرض بعد الحفظ (FA-04)، لأي مرجع مختار؛ وتقرير الحفظ بالرقم يُحسب عند الحفظ كما كان.
    const report = previewComparison(result.cues, fp, { settings, notes: result.notes, target: lang ?? null });
    const s = comparisonSummary(report);
    compareHost.replaceChildren(alertBox({ tone: s.tone, text: s.lines.join('\n'), doc }));
  };
  let referenceBlock;
  if (!fps.length) {
    referenceBlock = el('p', { className: 'tj-caption', text: tr('library.upload.noReference'), doc });
  } else if (fps.length === 1) {
    // تصدير واحد: لا اختيار، والمرجع سطر.
    referenceBlock = el('p', { className: 'tj-body-sm lib-up__ref-line', children: [tr('library.upload.referenceLine'), el('span', { text: fingerprintLabel(fps[0], absoluteTime(fps[0].createdAt)), doc })], doc });
  } else {
    const ranked = review.references.map((r) => r.fingerprintId);
    const order = [...ranked, ...fps.map((f) => f.id).filter((x) => !ranked.includes(x))];
    const sid = `${id}-ref`;
    const select = el('select', {
      className: 'tj-field__input lib-up__ref', attrs: { id: sid, 'aria-describedby': `${sid}-why` },
      children: [
        ...order.map((fid) => {
          const fp = fps.find((f) => f.id === fid);
          return el('option', { text: `${fingerprintLabel(fp, absoluteTime(fp.createdAt))}${fid === review.suggested ? tr('library.upload.closest') : ''}`, attrs: { value: fid }, doc });
        }),
        el('option', { text: tr('library.upload.noRef'), attrs: { value: '' }, doc }),
      ],
      doc,
    });
    select.value = reference ?? '';
    // سبب المرجع المختار لا المقترح وحده: السطر وصف القائمة، فيتبع الاختيار (كان يبقى «مطابقة لهذا التصدير»، U59).
    const whyOf = (fid) => review.references.find((r) => r.fingerprintId === fid)?.why ?? '';
    const why = whyOf(reference);
    select.addEventListener('change', () => {
      reference = select.value || null;
      whyEl.textContent = whyOf(reference);
      renderCompare();
    });
    const whyEl = el('span', { className: 'tj-field__hint', text: why, attrs: { id: `${sid}-why` }, doc });
    referenceBlock = el('div', {
      className: 'tj-field lib-up__field',
      children: [
        el('div', { className: 'lib-up__label', children: [el('label', { className: 'tj-field__label', text: tr('library.upload.reference'), attrs: { for: sid }, doc }), fps.length > 1 && !review.certain ? statusPill({ tone: 'warning', text: tr('library.upload.uncertain'), title: tr('library.upload.uncertainTitle'), doc }) : null], doc }),
        select,
        whyEl,
      ],
      doc,
    });
  }

  // لغة الترجمة (AA3، لوحة 19 البند ٢): رمز صريح في اسم الملف، وإلا «إلى» المختارة لهذا الفيديو إن وافق نص الملف نص كتابتها، وإلا
  // «غير محددة»؛ ويغيّرها المستخدم قبل الحفظ. والزوج اللغوي سطر تحتها بلغة الأصل.
  const pairTo = suggested.find((c) => isSourceLang(c)) ?? null;
  let lang = result.lang ?? (pairTo && textFitsLang(result.cues, pairTo) ? pairTo : null);
  const lid = `${id}-lang`;
  const named = (code) => `${describeLang(code, getLocale())?.name ?? code} (${code})`;
  const sug = [...new Set([result.lang, ...suggested].filter((c) => isSourceLang(c)))];
  const opt = (code, text) => el('option', { text, attrs: { value: code }, doc });
  const langSelect = el('select', {
    className: 'tj-field__input lib-up__lang', attrs: { id: lid, 'aria-describedby': `${lid}-pair` },
    children: [
      opt('', tr('library.upload.langUnset')),
      sug.length ? el('optgroup', { attrs: { label: tr('library.upload.langSuggested') }, children: sug.map((c) => opt(c, named(c))), doc }) : null,
      el('optgroup', { attrs: { label: tr('library.upload.langAll') }, children: knownLanguages(getLocale()).filter((l) => !sug.includes(l.code)).map((l) => opt(l.code, `${l.name} (${l.code})`)), doc }),
    ],
    doc,
  });
  langSelect.value = lang ?? '';
  const pairLine = el('span', { className: 'tj-field__hint', attrs: { id: `${lid}-pair` }, doc });
  const sourceLang = sourceOf(bundle.record)?.lang ?? null;
  const paintPair = () => { pairLine.textContent = pairLabel({ from: sourceLang, to: lang, translated: true }) ?? ''; };
  paintPair();
  langSelect.addEventListener('change', () => {
    lang = langSelect.value || null;
    paintPair();
    renderCompare();
  });
  const langBlock = el('div', {
    className: 'tj-field lib-up__field',
    children: [el('label', { className: 'tj-field__label', text: tr('library.upload.langLabel'), attrs: { for: lid }, doc }), langSelect, pairLine],
    doc,
  });

  // تنبيه الاسم.
  const hint = nameHintText(review.nameHint, titleOf);

  // ما سيتغير وما سيُفقد و«إبقاء تعديلاتي».
  const impactHost = el('div', { className: 'lib-up__impact', doc });
  const keepBox = el('input', { attrs: { id: `${id}-keep`, type: 'checkbox' }, doc });
  const keepWhy = el('span', { className: 'tj-sr-only', attrs: { id: `${id}-keep-why` }, doc });
  const keepLabel = el('label', { className: 'lib-check', attrs: { for: `${id}-keep` }, children: [keepBox, el('span', { text: tr('library.upload.keepEdits'), doc }), keepWhy], doc });
  function renderImpact() {
    const kids = [];
    const slot = bundle.slots[target - 1];
    if (impact.replace) {
      kids.push(...diffCountLines(impact.diff).map((line) => el('p', { className: 'tj-body-sm lib-up__counts', text: line, doc })));
      if (impact.diff.changes.length) kids.push(diffTable(doc, impact.diff.changes));
      if (impact.edits) {
        kids.push(el('p', { className: 'tj-body-sm lib-up__lost', text: tr('library.upload.currentEdits', { edits: formatCount(impact.edits, EDIT_FORMS) }), doc }));
        keepBox.checked = false;
        keepBox.disabled = !impact.keep.ok;
        keepBox.setAttribute('aria-disabled', impact.keep.ok ? 'false' : 'true');
        keepLabel.title = impact.keep.ok ? tr('library.upload.keepTitle') : impact.keep.reason ?? '';
        keepWhy.textContent = impact.keep.ok ? '' : ` (${impact.keep.reason ?? ''})`;
        if (impact.keep.ok) keepBox.removeAttribute('aria-describedby');
        else keepBox.setAttribute('aria-describedby', keepWhy.getAttribute('id'));
        kids.push(keepLabel);
      }
      kids.push(el('p', { className: 'tj-caption', text: tr('library.upload.previousKept'), doc }));
      if (bundle.previous) kids.push(alertBox({ tone: 'warning', text: previousLostText(bundle.previous, target, absoluteTime(bundle.previous.savedAt)), doc }));
    }
    if (bundle.active === target && slot.offsetMs !== 0) kids.push(alertBox({ tone: 'info', text: tr('library.upload.offsetReset', { offset: offsetInline(slot.offsetMs) }), doc }));
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
      langBlock,
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
    choice: () => ({ n: target, fingerprintId: reference, keepCues: impact.keep.ok && keepBox.checked ? impact.keep.cues : null, lang }),
  };
}
