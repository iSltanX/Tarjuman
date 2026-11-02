// صفحة المحرّر (P8 ثم P14، مواصفة التصميم §١١ و§١٩.٩): الرأس والنسخة وخانة التحرير 1 2 3 وحالة الحفظ، وشريط النطاق
// و±، وسطر إزاحة العرض المنفصل، والقائمة الافتراضية بعمودها المرجعي، واللوحة الجانبية، والحفظ والأصل والتصدير وحارس
// المغادرة. المنطق في src/core/edit (الجلسة والمشكلات وما يُصدَّر)؛ هنا الحالة المعروضة والأحداث فقط. لا حفظ تلقائي
// أبدًا: «حفظ» وحده يكتب في خانة التحرير، بـexpect الحزمة المفتوحة، فإن تغيّر محتوى الخانة من المشغّل أو تبويب آخر رُفض.
/* global __TJ_DEV__ */
import { compare, previewRestoreTiming } from '../../core/compare/index.js';
import { READING_DEFAULTS } from '../../core/edit/density.js';
import {
  COMPLETION_DEFAULTS, buildRows, completionGroups, completionNumbers, createEditSession, englishReference, parseSeconds, parseTimecode,
  pickEnglishTrack, planArabicExport, planMarkToggle, resolveSlotMarks, reviewGroups,
} from '../../core/edit/index.js';
import { resolvePosition } from '../../core/model/marks.js';
import { messageFor, toErrorInfo } from '../../core/errors/index.js';
import { buildPatchPackage, patchInstructions } from '../../core/export/index.js';
import { partsStatus, readPatch } from '../../core/import/index.js';
import { saveFile as defaultSaveFile } from '../../core/save/index.js';
import { slotModels } from '../../core/model/bundle.js';
import { mergeCues, splitCue } from '../../core/edit/structure.js';
import { alertBox, button, el, emptyState, ltr, slotPicker, statusPill } from '../../ui/components.js';
import { COUNT_FORMS, formatCount, formatOffset, formatTimecode } from '../../ui/format.js';
import { createMenu } from '../../ui/menu.js';
import { jumpToVideo } from '../../ui/seek.js';
import { openDriftDialog } from './drift-dialog.js';
import { confirmLeave, openDialog, setDisabled } from './dialogs.js';
import { renderComparison, renderIssues } from './panels.js';
import {
  classifyChange, openedSlot, pickSlot, restoreSlotOriginal, saveSlot, slotContentChanged, writeMarks, writePosition,
} from './persist.js';
import { renderDensity, renderMarks, renderResume } from './review-panel.js';
import { previewPatch, renderCompletePanel } from './complete-panel.js';
import { createRows, textDir } from './rows.js';
import { createSearch } from './search.js';
import {
  COUNT, MARK_LABEL, activeSlotLine, editSlotLabel, errorsToFix, mergePreview, nextMark, numberList, offsetLine, offsetNotice, refOptionLabel,
  saveMessage, saveStatus, scopeOption, scopeTarget, seconds, seekResult, shiftSentence, slotFallback, splitPreview, unsavedSentence,
} from './text.js';
import { RowLayout, createVirtualList, rowHeight, textLines } from './virtual.js';

const KIND_LABEL = Object.freeze({
  text: 'تعديل النص', time: 'تعديل الزمن', shift: 'نقل التوقيت', commit: 'تثبيت الإزاحة', restore: 'استعادة التوقيت',
  replace: 'الاستبدال', merge: 'الدمج', split: 'الشطر', drift: 'تصحيح الانجراف', patch: 'ملف التصحيح', rescue: 'إعادة تطبيق تعديلاتي',
});
const STEPS = [100, 250, 500, 1000, 2000, 5000];
/** سكون على مقطع قبل كتابة آخر موضع (نقطة طبيعية، لا مع كل تمرير). */
const POSITION_DELAY_MS = 4000;
const MAX_PREVIEW_ROWS = 200;
const COMPARE_DELAY_MS = 250;

/** عتبة الكثافة من التفضيلات (Q15): null = المعايرة. @param {import('../../core/model/prefs.js').Prefs} prefs */
const densityOf = (prefs) => ({ maxCps: prefs?.review?.maxCps ?? READING_DEFAULTS.maxCps });

/**
 * @param {HTMLElement} app
 * @param {{
 *   videoId: string | null, slot?: 1 | 2 | 3 | null, store: ReturnType<typeof import('../../core/store/index.js').createStore>,
 *   doc?: Document, now?: () => number, seek?: typeof jumpToVideo, saveFile?: typeof defaultSaveFile
 * }} deps slot خانة التحرير المطلوبة (t في العنوان)؛ وبدونها النشطة. seek وsaveFile للاختبار وحده.
 */
export async function mountEditor(app, {
  videoId, slot: requested = null, store, doc = document, now = Date.now, seek = jumpToVideo, saveFile = defaultSaveFile,
}) {
  const win = doc.defaultView;
  const title = (text) => el('h1', { className: 'tj-h1', text, doc });

  if (!videoId) {
    app.append(title('المحرّر'), alertBox({ tone: 'danger', title: 'تعذّر فتح المحرّر', text: messageFor('TJ_BAD_VIDEO_ID'), doc }));
    return null;
  }
  const loading = el('div', { className: 'tj-stack', attrs: { 'aria-busy': 'true' }, children: Array.from({ length: 6 }, () => el('div', { className: 'tj-skeleton ed-skeleton', doc })), doc });
  app.append(title('المحرّر'), loading);
  let bundle;
  let settings;
  let prefs;
  try {
    [bundle, settings, prefs] = await Promise.all([store.getBundle(videoId), store.getSettings(), store.getPrefs()]);
  } catch (err) {
    const info = toErrorInfo(err);
    loading.replaceWith(alertBox({ tone: 'danger', title: 'تعذّر فتح المحرّر', text: `${info.message} (${info.code})`, doc }));
    return null;
  }
  const picked = pickSlot(bundle, requested);
  if (picked.n === null) {
    loading.replaceWith(emptyState({
      title: 'لا ترجمة محفوظة لهذا الفيديو', text: messageFor('ST_NO_RECORD'),
      steps: ['افتح الفيديو على يوتيوب', 'ارفع ملف الترجمة العربية من شريط المشغّل', 'ثم افتح المحرّر من أيقونة الإضافة'], doc,
    }));
    return null;
  }

  // ---- الحالة ----
  const S = {
    opened: bundle, slot: picked.n, info: null, prefs,
    fp: null, englishTrack: null, edited: false,
    session: null, offSession: null, original: null,
    view: /** @type {'edit' | 'original'} */ ('edit'),
    rows: [], rowOf: new Int32Array(0), indexOfN: new Map(), missingRowOfN: new Map(),
    refs: [], refsOriginal: [], refCol: /** @type {'en' | 1 | 2 | 3} */ ('en'), colRefs: [],
    layout: null, list: null,
    selection: new Set(), lastChecked: null, activeIndex: null,
    scope: /** @type {'cue' | 'selection' | 'all'} */ ('all'),
    stepMs: settings.offsetStepMs,
    showEnglish: true, hideEnglish: false, hoverDelta: 0,
    result: /** @type {{ tone: string, text: string } | null} */ (null),
    external: /** @type {null | 'changed' | 'removed'} */ (null),
    saving: false, pending: null, leaving: false, externalChain: Promise.resolve(),
    writing: 0, writeChain: Promise.resolve(), positionTimer: 0, resumeAfterSwitch: false,
    picks: { ...COMPLETION_DEFAULTS }, completeBusy: false, completeNumbers: /** @type {number[]} */ ([]), parts: null,
    markView: /** @type {ReturnType<typeof resolveSlotMarks> | null} */ (null),
    caret: /** @type {{ index: number, at: number, version: number } | null} */ (null),
    hoverAct: /** @type {{ kind: 'merge' | 'split', index: number } | null} */ (null),
    comparison: null, compareTimer: 0, frame: 0,
  };
  const act = () => (S.view === 'original' ? S.original : S.session);
  const readOnly = () => S.view === 'original';
  const changes = () => S.session.changedCount || (S.session.offsetChanged ? 1 : 0);

  // ---- الهيكل ----
  app.replaceChildren();
  app.classList.add('ed-app');
  const backBtn = button({ label: '→ المحفوظات', variant: 'ghost', size: 'sm', onClick: () => goLibrary(), doc });
  const titleEl = el('h1', { className: 'ed-title tj-h3 tj-truncate', dir: 'auto', doc });
  const slotsEl = slotPicker({ slots: slotModels(bundle), size: 'md', ariaLabel: 'خانة التحرير', onSelect: (n) => switchSlot(n), doc });
  const slotNote = el('span', { className: 'ed-slot-note tj-caption', doc });
  const versionSel = el('select', { className: 'ed-select', attrs: { 'aria-label': 'النسخة المعروضة' }, on: { change: () => setView(versionSel.value) }, doc });
  const restoreOrigBtn = button({ label: 'استعادة الأصل…', variant: 'ghost', size: 'sm', onClick: () => onRestoreOriginal(), doc });
  const statusBox = el('span', { className: 'ed-status', attrs: { role: 'status' }, doc });
  const undoBtn = button({ label: 'تراجع', size: 'sm', onClick: () => doUndo(), doc });
  const redoBtn = button({ label: 'إعادة', size: 'sm', onClick: () => doRedo(), doc });
  const exportBtn = button({ label: 'تصدير…', size: 'sm', onClick: () => onExport(), doc });
  const saveBtn = button({ label: 'حفظ', variant: 'primary', size: 'sm', onClick: () => save(), doc });
  const headEl = el('header', {
    className: 'ed-head',
    children: [
      el('div', { className: 'ed-head__row', children: [backBtn, titleEl, ltr(videoId, { doc }), slotsEl.root, versionSel, restoreOrigBtn], doc }),
      el('div', { className: 'ed-head__row ed-head__slot', children: [slotNote], doc }),
      el('div', { className: 'ed-head__row', children: [statusBox, el('span', { className: 'ed-spacer', doc }), undoBtn, redoBtn, exportBtn, saveBtn], doc }),
    ],
    doc,
  });

  const scopeBtns = /** @type {const} */ (['cue', 'selection', 'all']).map((kind) => el('button', {
    className: 'ed-seg__opt', attrs: { type: 'button', role: 'radio', 'data-scope': kind },
    on: { click: (e) => { if (e.currentTarget.getAttribute('aria-disabled') !== 'true') setScope(kind); } },
    doc,
  }));
  const hover = (b, sign) => {
    const on = () => { S.hoverDelta = sign * S.stepMs; renderToolbar(); };
    const off = () => { S.hoverDelta = 0; renderToolbar(); };
    for (const t of ['mouseenter', 'focus']) b.addEventListener(t, on);
    for (const t of ['mouseleave', 'blur']) b.addEventListener(t, off);
    return b;
  };
  const minusBtn = hover(button({ label: '−', size: 'sm', onClick: () => applyShift(scopeObj(), -S.stepMs, currentTarget()), doc }), -1);
  const plusBtn = hover(button({ label: '+', size: 'sm', onClick: () => applyShift(scopeObj(), S.stepMs, currentTarget()), doc }), 1);
  const stepSel = el('select', { className: 'ed-select', attrs: { 'aria-label': 'خطوة الأزرار' }, on: { change: () => { S.stepMs = Number(stepSel.value); renderToolbar(); S.list.refresh(null); } }, doc });
  for (const ms of [...new Set([...STEPS, S.stepMs])].sort((a, b) => a - b)) stepSel.append(el('option', { text: `${seconds(ms)} ث`, attrs: { value: String(ms) }, doc }));
  stepSel.value = String(S.stepMs);
  const amountIn = el('input', {
    className: 'ed-amount', dir: 'ltr',
    attrs: { type: 'text', placeholder: '+0.5', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'مقدار النقل بالثواني: + تأخير و− تقديم' },
    on: { input: () => renderToolbar(), keydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); applyAmount(); } } },
    doc,
  });
  const applyBtn = button({ label: 'تطبيق', size: 'sm', onClick: () => applyAmount(), doc });
  const enToggle = el('input', { attrs: { type: 'checkbox', id: 'ed-show-en' }, on: { change: () => setShowEnglish(enToggle.checked) }, doc });
  const previewEl = el('p', { className: 'ed-preview', doc });
  const noticeEl = el('p', { className: 'ed-notice', attrs: { role: 'alert' }, doc });
  const resultEl = el('p', { className: 'ed-result', attrs: { role: 'status', 'aria-live': 'polite' }, doc });
  const search = createSearch({
    doc,
    cues: () => {
      const s = act();
      return Array.from({ length: s.count }, (_, i) => s.cueAt(i));
    },
    english: () => (S.view === 'original' ? S.refsOriginal : S.refs),
    readOnly: () => (readOnly() ? messageFor('ED_READ_ONLY') : null),
    onChange: () => S.list?.refresh(null),
    reveal: (index, match, { focus, field }) => revealMatch(index, match, { focus, field }),
    replace: (matches, replacement, only) => {
      const r = S.session.replaceMatches(matches, replacement, { only });
      S.result = { tone: r.count ? 'success' : 'info', text: r.count ? `استُبدل النص في ${formatCount(r.count, COUNT_FORMS.cue)}. التراجع يعيده خطوةً واحدة.` : 'لا تغيير.' };
      renderToolbar();
      return r;
    },
  });
  const timingMenu = createMenu({
    label: 'أدوات التوقيت', chevron: true, align: 'start', doc,
    items: [{ id: 'drift', label: 'تصحيح الانجراف…', hint: 'تحويل خطي للتوقيت كله بنقطتين صحيحتين', onSelect: () => onDrift() }],
  });
  const toolbarEl = el('section', {
    className: 'ed-toolbar', attrs: { 'aria-label': 'أدوات التحرير' },
    children: [
      search.root,
      el('div', {
        className: 'ed-toolbar__row',
        children: [
          el('span', { className: 'tj-label', text: 'النطاق:', doc }),
          el('div', { className: 'ed-seg', attrs: { role: 'radiogroup', 'aria-label': 'النطاق' }, children: scopeBtns, doc }),
          el('span', { className: 'ed-group', children: [minusBtn, el('span', { className: 'tj-caption', text: 'خطوة', doc }), stepSel, plusBtn], doc }),
          el('span', { className: 'ed-group', children: [amountIn, applyBtn], doc }),
          timingMenu.root,
          el('label', { className: 'ed-group ed-toggle', attrs: { for: 'ed-show-en' }, children: [enToggle, el('span', { text: 'إظهار المرجع', doc })], doc }),
        ],
        doc,
      }),
      previewEl, noticeEl, resultEl,
    ],
    doc,
  });

  const offsetText = el('p', { className: 'ed-offset__text tj-label', doc });
  const offsetSub = el('p', { className: 'tj-caption', doc });
  const commitBtn = button({ label: 'تثبيت الإزاحة في التوقيت', size: 'sm', onClick: () => onCommit(), doc });
  const offsetEl = el('section', {
    className: 'ed-offset', attrs: { 'aria-label': 'إزاحة العرض' },
    children: [el('div', { className: 'ed-offset__body', children: [offsetText, offsetSub], doc }), commitBtn],
    doc,
  });

  const bannerEl = el('div', { className: 'ed-banner', doc });
  const issuesEl = el('section', { className: 'ed-panel', attrs: { 'aria-label': 'المشكلات' }, doc });
  const compareEl = el('section', { className: 'ed-panel', attrs: { 'aria-label': 'المقارنة' }, doc });
  const densityEl = el('section', { className: 'ed-panel', attrs: { 'aria-label': 'الكثافة' }, doc });
  const marksEl = el('section', { className: 'ed-panel', attrs: { 'aria-label': 'العلامات' }, doc });
  const resumeEl = el('section', { className: 'ed-panel', attrs: { 'aria-label': 'آخر موضع' }, doc });
  const completeEl = el('section', { className: 'ed-panel', attrs: { 'aria-label': 'الاستكمال' }, doc });
  // اللوحة الجانبية بتبويبين (§١٩.٩): «المراجعة» (الفحص الآلي ثم العلامات وآخر موضع) و«الاستكمال».
  const sideTabs = [['review', 'المراجعة'], ['complete', 'الاستكمال']].map(([id, label]) => el('button', {
    className: 'ed-tab', text: label, attrs: { type: 'button', role: 'tab', id: `ed-tab-${id}`, 'aria-controls': `ed-pane-${id}`, 'data-tab': id },
    on: { click: () => setSideTab(id) },
    doc,
  }));
  const reviewPane = el('div', {
    className: 'ed-pane', attrs: { role: 'tabpanel', id: 'ed-pane-review', 'aria-labelledby': 'ed-tab-review' },
    children: [
      el('p', { className: 'ed-pane__title tj-label', text: 'الفحص الآلي', doc }), issuesEl, compareEl, densityEl,
      el('p', { className: 'ed-pane__title tj-label', text: 'مراجعتك', doc }), marksEl, resumeEl,
    ],
    doc,
  });
  const completePane = el('div', { className: 'ed-pane', attrs: { role: 'tabpanel', id: 'ed-pane-complete', 'aria-labelledby': 'ed-tab-complete', hidden: '' }, children: [completeEl], doc });
  const resumeChip = button({ label: '', size: 'sm', variant: 'secondary', className: 'ed-resume-chip', onClick: () => resumeHere(), doc });
  resumeChip.hidden = true;
  const counterEl = el('span', { className: 'ed-counter tj-caption', attrs: { 'aria-live': 'off' }, doc });
  // العمود المرجعي (§١٩.٩): الإنجليزية أو ترجمة أخرى من خانات الفيديو، باختيار في رأس عموده.
  const refSel = el('select', { className: 'ed-select ed-ref-select', attrs: { 'aria-label': 'العمود المرجعي' }, on: { change: () => setRefCol(refSel.value) }, doc });
  const listHead = el('div', {
    className: 'ed-list__head',
    children: ['', '#', 'البداية', 'النهاية', 'المدة', 'النص العربي', null, ''].map((t, k) => (k === 6
      ? el('span', { className: 'ed-col-en', children: [refSel], doc })
      : el('span', { text: t, attrs: { 'aria-hidden': 'true' }, doc }))),
    doc,
  });
  const scroller = el('div', { className: 'ed-list', attrs: { role: 'list', 'aria-label': 'المقاطع' }, doc });
  const unsavedText = el('p', { className: 'tj-label', doc });
  const unsavedSave = button({ label: 'حفظ', variant: 'primary', size: 'sm', onClick: () => save(), doc });
  const unsavedDiscard = button({ label: 'تجاهل التغييرات', variant: 'ghost', size: 'sm', onClick: () => onDiscard(), doc });
  const unsavedEl = el('div', { className: 'ed-unsaved', attrs: { role: 'region', 'aria-label': 'تغييرات غير محفوظة' }, children: [unsavedText, el('span', { className: 'ed-spacer', doc }), unsavedSave, unsavedDiscard], doc });
  const toastEl = el('div', { className: 'ed-toast', attrs: { role: 'status', 'aria-live': 'polite' }, doc });
  // الرسالة العابرة تحت الرأس عند طرفه (تحت «حفظ»)، لا فوق العنوان (ملاحظة W4 من لقطة w4-editor-saved).
  headEl.appendChild(toastEl);
  app.append(
    headEl, toolbarEl, offsetEl, bannerEl,
    el('div', {
      className: 'ed-body',
      children: [
        el('aside', {
          className: 'ed-side',
          children: [el('div', { className: 'ed-tabs', attrs: { role: 'tablist', 'aria-label': 'اللوحة الجانبية' }, children: sideTabs, doc }), reviewPane, completePane],
          doc,
        }),
        el('section', { className: 'ed-main', attrs: { 'aria-label': 'قائمة المقاطع' }, children: [el('div', { className: 'ed-main__bar', children: [resumeChip, el('span', { className: 'ed-spacer', doc }), counterEl], doc }), listHead, scroller], doc }),
      ],
      doc,
    }),
    unsavedEl,
  );

  const rowView = createRows(doc, () => ({
    rows: S.rows, session: act(), report: act().issues(), refs: S.colRefs, refDir: S.refCol === 'en' ? 'ltr' : 'rtl',
    showEnglish: S.showEnglish, readOnly: readOnly(), selection: S.selection, activeIndex: S.activeIndex, stepMs: S.stepMs,
    match: (i) => search.rowState(i), refRanges: (i) => (S.refCol === 'en' ? search.englishRanges(i) : null),
    markOf: (i) => (S.view === 'edit' ? S.markView?.byIndex.get(i) ?? null : null),
  }));

  // ---- الفتح وإعادة الفتح ----
  /** @param {import('../../core/model/slots.js').Bundle} b @param {1 | 2 | 3} n */
  function load(b, n, { keepUi = false } = {}) {
    const st = openedSlot(b, n);
    const sameCount = S.slot === n && S.session && S.session.count === st.cues.length;
    S.opened = b;
    S.slot = n;
    S.info = st;
    S.fp = st.fingerprint;
    S.edited = st.edited;
    S.englishTrack = pickEnglishTrack(b.record.english, S.fp);
    S.offSession?.();
    S.session = createEditSession({ cues: st.cues, offsetMs: st.offsetMs, density: densityOf(S.prefs) });
    S.offSession = S.session.onChange(onSessionChange);
    S.original = createEditSession({ cues: st.original, offsetMs: st.offsetMs, density: densityOf(S.prefs) });
    if (!S.edited) S.view = 'edit';
    if (!(keepUi && sameCount)) {
      S.selection.clear();
      S.activeIndex = null;
      S.lastChecked = null;
      S.scope = 'all';
    }
    if (S.refCol !== 'en' && (S.refCol === n || !b.slots[S.refCol - 1].track)) S.refCol = 'en';
    S.external = null;
    S.showEnglish = !S.hideEnglish && ((S.englishTrack?.cues.length ?? 0) > 0 || S.refCol !== 'en');
    titleEl.textContent = b.record.title ?? 'بلا عنوان محفوظ';
    titleEl.title = b.record.title ?? '';
    rebuildList();
    renderAll();
    // «تابع من المقطع N» عند الفتح أو تبديل الخانة، لا بعد كل حفظ.
    if (!keepUi) renderResumeChip();
  }

  /** نص المرجع لكل مقطع في النسخة المعروضة: الإنجليزية دائمًا (للبحث فيها قراءةً)، والعمود المرجعي بحسب الاختيار. */
  function computeRefs(cues) {
    const refs = englishReference(cues, S.englishTrack?.cues ?? [], S.fp);
    if (S.view === 'original') S.refsOriginal = refs;
    else S.refs = refs;
    const other = S.refCol === 'en' ? null : S.opened.slots[S.refCol - 1].track;
    S.colRefs = other ? englishReference(cues, other.current ?? other.original, S.fp) : refs;
  }

  /** قائمة العمود المرجعي: الإنجليزية (إن حُفظ مسار) والخانات الممتلئة الأخرى. */
  function renderRefSelect() {
    const options = [];
    if (S.englishTrack?.cues.length) options.push(['en', refOptionLabel('en')]);
    for (const slot of S.opened.slots) if (slot.track && slot.n !== S.slot) options.push([String(slot.n), refOptionLabel(slot.n, slot.name)]);
    if (!options.length) options.push(['en', 'لا مرجع محفوظ']);
    const sig = options.map((o) => o.join(':')).join('|');
    if (refSel.dataset.sig !== sig) {
      refSel.replaceChildren(...options.map(([v, t]) => el('option', { text: t, attrs: { value: v }, doc })));
      refSel.dataset.sig = sig;
    }
    refSel.value = String(S.refCol);
    refSel.disabled = options.length < 2;
  }

  function setRefCol(value) {
    S.refCol = value === 'en' ? 'en' : /** @type {1 | 2 | 3} */ (Number(value));
    computeRefs(act().snapshot());
    renderRefSelect();
    setShowEnglish(true);
    renderToolbar();
  }

  function heightOf(r, s, report) {
    if (r.type === 'missing') return rowHeight({ type: 'missing' });
    return rowHeight({ type: 'cue', lines: textLines(s.cueAt(r.index).text), message: report.byIndex.has(r.index) });
  }

  function rebuildList() {
    const s = act();
    const cues = Array.from({ length: s.count }, (_, i) => s.cueAt(i));
    computeRefs(cues);
    S.comparison = compareNow(s);
    computeMarks();
    computeParts();
    const rows = buildRows(cues, S.comparison?.missing ?? []);
    const sameRows = Boolean(S.list) && rows.length === S.rows.length
      && rows.every((r, k) => r.type === S.rows[k].type && r.index === S.rows[k].index && r.n === S.rows[k].n);
    S.rows = rows;
    S.rowOf = new Int32Array(s.count);
    S.missingRowOfN = new Map();
    S.rows.forEach((r, k) => {
      if (r.type === 'cue') S.rowOf[r.index] = k;
      else S.missingRowOfN.set(r.n, k);
    });
    S.indexOfN = new Map();
    cues.forEach((c, i) => { if (!S.indexOfN.has(c.n)) S.indexOfN.set(c.n, i); });
    const report = s.issues();
    scroller.classList.toggle('ed-list--no-en', !S.showEnglish);
    if (sameRows) {
      // الصفوف نفسها (بعد الحفظ أو بين النسختين): تُحدَّث في مكانها، فلا يضيع تركيز الحقل ولا موضع التمرير.
      S.rows.forEach((r, k) => S.layout.setHeight(k, heightOf(r, s, report)));
      S.list.refresh(null, true);
    } else {
      S.layout = new RowLayout(S.rows.map((r) => heightOf(r, s, report)));
      if (!S.list) {
        S.list = createVirtualList({ doc, scroller, layout: S.layout, create: rowView.create, update: rowView.update, onRange: renderCounter });
        S.list.render();
      } else S.list.reset(S.layout);
    }
    listHead.classList.toggle('ed-list--no-en', !S.showEnglish);
    search.refresh();
  }

  function compareNow(s) {
    try {
      return compare(s.snapshot(), S.fp, { driftMs: settings.thresholds.driftMs });
    } catch {
      return null;
    }
  }

  // ---- أحداث الجلسة ----
  function onSessionChange(e) {
    if (S.view !== 'edit') return;
    if (e.structural || S.session.count !== S.rowOf.length) {
      // عدد المقاطع أو مواضعها تغيّرت (دمج، شطر، ملف تصحيح، إعادة تطبيق، أو تراجع عنها): الصفوف تُبنى من جديد.
      if (S.activeIndex !== null && S.activeIndex >= S.session.count) S.activeIndex = null;
      S.selection.clear();
      S.lastChecked = null;
      rebuildList();
      scheduleChrome();
      return;
    }
    const report = S.session.issues();
    // الكتابة في نص تغيّر ارتفاع صفها وحده (أسطره ومشكلات نصه)؛ وما عداها قد يمس مشكلات الجوار فيُعاد كله.
    if (e.kind === 'text' && e.indices) for (const i of e.indices) S.layout.setHeight(S.rowOf[i], heightOf(S.rows[S.rowOf[i]], S.session, report));
    else S.rows.forEach((r, k) => S.layout.setHeight(k, heightOf(r, S.session, report)));
    S.list.refresh(null, e.kind !== 'text' || Boolean(e.undo || e.redo) || e.indices === null);
    search.refresh();
    scheduleChrome();
    win.clearTimeout(S.compareTimer);
    S.compareTimer = win.setTimeout(() => {
      S.comparison = compareNow(act());
      computeMarks();
      computeParts();
      S.list.refresh(null);
      renderReview(act().issues());
      renderComplete();
      renderComparisonPanel();
    }, COMPARE_DELAY_MS);
  }

  function scheduleChrome() {
    if (!S.frame) S.frame = win.requestAnimationFrame(() => { S.frame = 0; renderChrome(); });
  }

  // ---- العرض ----
  function renderAll() {
    renderChrome();
    renderRefSelect();
    renderComparisonPanel();
  }

  function renderChrome() {
    renderHeader();
    renderToolbar();
    renderOffset();
    renderUnsaved();
    renderBanner();
    const report = act().issues();
    renderIssues(issuesEl, { doc, report: timingOnly(report), onJump: jumpTo });
    renderReview(report);
    renderComplete();
  }

  function saveBlockReason() {
    if (readOnly()) return 'اختر «النسخة المعدّلة» للحفظ.';
    if (S.external === 'removed') return messageFor('ED_RECORD_REMOVED');
    if (S.external === 'changed') return 'تغيّر السجل من مكان آخر؛ أعد الفتح أولًا.';
    const { errors } = S.session.issues();
    if (errors) return messageFor('ED_SAVE_HAS_ERRORS', { count: errorsToFix(errors) });
    if (!S.session.dirty) return messageFor('ED_NOTHING_TO_SAVE');
    return null;
  }

  function renderSlots() {
    const models = slotModels(S.opened);
    // المحدد هنا يحدد خانة التحرير لا النشطة (§١٩.٢): «المختارة» خانة التحرير، والنشطة تُذكر في الاسم والسطر.
    slotsEl.update(models.map((m) => ({ ...m, active: m.n === S.slot })));
    for (const m of models) {
      const b = slotsEl.buttons[m.n - 1];
      const label = editSlotLabel(m, { editing: m.n === S.slot });
      b.setAttribute('aria-label', label);
      b.title = m.name ? `${label} — ${m.name}` : label;
    }
    slotNote.textContent = activeSlotLine(S.slot, S.opened.active, S.info.name);
  }

  function renderHeader() {
    const s = S.session;
    const dirty = s.dirty;
    renderSlots();
    doc.title = `${dirty ? '● ' : ''}ترجمان — المحرّر`;
    statusBox.replaceChildren(statusPill({ tone: dirty ? 'warning' : 'success', text: saveStatus(changes(), dirty), doc }));
    const options = [['edit', S.edited || dirty ? 'النسخة المعدّلة' : 'النسخة الحالية (الأصل المستورد)']];
    if (S.edited) options.push(['original', 'الأصل المستورد (للعرض والتصدير)']);
    if (versionSel.options.length !== options.length || versionSel.options[0].text !== options[0][1]) {
      versionSel.replaceChildren(...options.map(([v, t]) => el('option', { text: t, attrs: { value: v }, doc })));
    }
    versionSel.value = S.view;
    setDisabled(restoreOrigBtn, S.external ? 'تغيّر السجل من مكان آخر؛ أعد الفتح أولًا.' : S.edited ? null : 'لا نسخة معدّلة محفوظة؛ المعروض هو الأصل المستورد.');
    const ro = readOnly() ? messageFor('ED_READ_ONLY') : null;
    setDisabled(undoBtn, ro ?? (s.canUndo ? null : 'لا شيء للتراجع'));
    undoBtn.title = undoBtn.title || `تراجع عن: ${KIND_LABEL[s.undoKind]} (⌘Z)`;
    setDisabled(redoBtn, ro ?? (s.canRedo ? null : 'لا شيء للإعادة'));
    redoBtn.title = redoBtn.title || `إعادة: ${KIND_LABEL[s.redoKind]} (⇧⌘Z)`;
    const errs = act().issues().errors;
    setDisabled(exportBtn, errs ? messageFor('ED_EXPORT_HAS_ERRORS', { count: errorsToFix(errs) }) : null);
    const reason = saveBlockReason();
    for (const b of [saveBtn, unsavedSave]) {
      setDisabled(b, reason);
      if (S.saving) b.setAttribute('aria-busy', 'true');
      else b.removeAttribute('aria-busy');
    }
    if (!reason) saveBtn.title = 'حفظ (⌘S)';
  }

  const activeN = () => (S.activeIndex === null ? null : act().cueAt(S.activeIndex).n);
  const currentTarget = () => scopeTarget(S.scope, { activeN: activeN(), selected: S.selection.size, total: act().count });
  function scopeObj() {
    if (S.scope === 'cue' && S.activeIndex !== null) return { kind: 'cue', index: S.activeIndex };
    if (S.scope === 'selection' && S.selection.size) return { kind: 'selection', indices: [...S.selection] };
    return { kind: 'all' };
  }
  function amountDelta() {
    const p = parseSeconds(amountIn.value);
    return p.ok ? p.ms : 0;
  }

  function renderToolbar() {
    const ro = readOnly() ? messageFor('ED_READ_ONLY') : null;
    if ((S.scope === 'cue' && S.activeIndex === null) || (S.scope === 'selection' && !S.selection.size)) S.scope = 'all';
    for (const b of scopeBtns) {
      const kind = b.dataset.scope;
      b.textContent = scopeOption(kind, { activeN: activeN(), selected: S.selection.size });
      b.setAttribute('aria-checked', String(S.scope === kind));
      const why = ro ?? (kind === 'cue' && S.activeIndex === null ? 'اختر مقطعًا من القائمة أولًا.' : kind === 'selection' && !S.selection.size ? 'حدّد مقاطع بمربعات التحديد أولًا.' : null);
      setDisabled(b, why);
    }
    const target = currentTarget();
    const step = seconds(S.stepMs);
    for (const b of [minusBtn, plusBtn, applyBtn]) setDisabled(b, ro);
    if (!ro) {
      minusBtn.title = `تقديم ${target} ${step} ث (تظهر أبكر)`;
      plusBtn.title = `تأخير ${target} ${step} ث (تظهر لاحقًا)`;
      minusBtn.setAttribute('aria-label', minusBtn.title);
      plusBtn.setAttribute('aria-label', plusBtn.title);
      const raw = amountIn.value.trim();
      const p = parseSeconds(raw);
      setDisabled(applyBtn, !raw ? 'اكتب مقدارًا بالثواني أولًا.' : !p.ok ? messageFor('ED_SHIFT_INVALID') : p.ms === 0 ? messageFor('ED_SHIFT_ZERO') : null);
    }
    amountIn.readOnly = Boolean(ro);
    stepSel.disabled = Boolean(ro);
    const delta = S.hoverDelta || amountDelta();
    const structure = !ro && S.hoverAct ? structurePreview(S.hoverAct.kind, S.hoverAct.index) : null;
    previewEl.textContent = ro ? messageFor('ED_READ_ONLY') : structure ?? (delta ? shiftSentence(target, delta, 'before') : `النطاق: ${target} · الخطوة ${step} ث`);
    const notice = ro ? 0 : S.session.shiftNotice(scopeObj());
    noticeEl.hidden = !notice;
    noticeEl.textContent = notice ? offsetNotice(notice) : '';
    resultEl.hidden = !S.result;
    resultEl.className = `ed-result${S.result ? ` ed-result--${S.result.tone}` : ''}`;
    resultEl.textContent = S.result?.text ?? '';
    enToggle.checked = S.showEnglish;
    enToggle.disabled = !S.englishTrack?.cues.length && !S.opened.slots.some((x) => x.track && x.n !== S.slot);
    enToggle.parentElement.title = enToggle.disabled ? 'لا مسار إنجليزي محفوظ ولا ترجمة أخرى لهذا الفيديو.' : '';
  }

  function renderOffset() {
    const s = S.session;
    offsetText.textContent = offsetLine(s.offsetMs);
    offsetSub.textContent = s.offsetChanged
      ? `ثُبّتت الإزاحة ${formatOffset(s.baseOffsetMs)} ث في التوقيت ولم يُحفظ ذلك بعد. التراجع يعيدهما معًا.`
      : '+ تأخير: تظهر الترجمة لاحقًا · − تقديم: تظهر أبكر. تغيّرها أزرار ± في شريط المشغّل.';
    setDisabled(commitBtn, readOnly() ? messageFor('ED_READ_ONLY') : s.offsetMs === 0 ? messageFor('ED_NO_OFFSET') : null);
  }

  function renderUnsaved() {
    const dirty = S.session.dirty;
    unsavedEl.hidden = !dirty;
    unsavedText.textContent = dirty ? unsavedSentence(changes()) : '';
  }

  function renderBanner() {
    if (!S.external) {
      bannerEl.replaceChildren();
      bannerEl.hidden = true;
      return;
    }
    bannerEl.hidden = false;
    const actions = el('div', {
      className: 'ed-group',
      children: [
        S.external === 'changed' ? button({ label: 'إعادة الفتح', variant: 'secondary', size: 'sm', onClick: () => reopen(), doc }) : null,
        button({ label: 'تصدير نسختي…', variant: 'ghost', size: 'sm', onClick: () => onExport(), doc }),
      ],
      doc,
    });
    bannerEl.replaceChildren(S.external === 'changed'
      ? alertBox({ tone: 'warning', title: 'تغيّر السجل من مكان آخر', text: messageFor('ED_EXTERNAL_CHANGE'), action: actions, doc })
      : alertBox({ tone: 'danger', title: 'حُذفت الترجمة', text: messageFor('ED_RECORD_REMOVED'), action: actions, doc }));
  }

  function renderComparisonPanel() {
    renderComparison(compareEl, {
      doc, report: S.comparison, notes: S.info.track.notes ?? [], readOnly: readOnly(),
      onRestore: () => onRestoreTiming(), onJumpN: (n) => jumpToN(n),
    });
  }

  function renderCounter() {
    const s = act();
    if (!s.count) return;
    let n = activeN();
    if (n === null) {
      const top = S.layout.indexAt(scroller.scrollTop);
      const r = S.rows[top];
      n = r ? (r.type === 'cue' ? s.cueAt(r.index).n : r.n) : s.cueAt(0).n;
    }
    counterEl.textContent = `المقطع ${n} من ${s.count}`;
  }

  let toastTimer = 0;
  /** رسالة عابرة تحت الرأس، و«تراجع» اختياري لما يمس شيئًا محفوظًا (§١٩.١) بمهلة أطول. */
  function toast(text, tone = 'success', { action } = {}) {
    const undo = action ? button({
      label: action.label, size: 'sm', variant: 'ghost', className: 'ed-toast__action',
      onClick: () => {
        toastEl.classList.remove('is-shown');
        action.onClick();
      },
      doc,
    }) : null;
    toastEl.replaceChildren(...[el('span', { text, doc }), undo].filter(Boolean));
    toastEl.className = `ed-toast ed-toast--${tone}${undo ? ' ed-toast--action' : ''} is-shown`;
    win.clearTimeout(toastTimer);
    toastTimer = win.setTimeout(() => toastEl.classList.remove('is-shown'), undo ? 7000 : 3000);
  }

  // ---- الاستكمال (R52) ----
  const glossary = () => (S.prefs?.glossary?.attach && S.prefs.glossary.terms.length ? S.prefs.glossary.terms : null);

  function completeReason() {
    if (S.view !== 'edit') return messageFor('ED_READ_ONLY');
    if (!S.fp) return messageFor('ED_NO_REFERENCE');
    if (!S.opened.record.english.some((t) => t.key === S.fp.trackKey)) return messageFor('EX_PATCH_NO_SOURCE');
    return null;
  }

  /** حالة الأجزاء المشتقة من الترجمة الحالية (بمحاذاة، فتُحسب بعد سكون لا مع كل حرف). */
  function computeParts() {
    S.parts = S.fp?.parts && S.view === 'edit' ? partsStatus(S.fp, S.session.snapshot()) : null;
  }

  function renderComplete() {
    if (completePane.hidden || !S.markView) return;
    const groups = completionGroups({ cues: shownCues(), comparison: S.comparison, fingerprint: S.fp, marks: S.markView, selection: S.selection });
    S.completeNumbers = completionNumbers(groups, S.picks);
    renderCompletePanel(completeEl, {
      doc, reason: completeReason(), groups, picks: S.picks, numbers: S.completeNumbers, parts: S.parts,
      glossaryCount: glossary()?.length ?? 0, readOnly: readOnly() ? messageFor('ED_READ_ONLY') : null, busy: S.completeBusy,
      onPick: (key, on) => {
        S.picks = { ...S.picks, [key]: on };
        renderComplete();
      },
      onDownload: () => downloadPatch(),
      onCopy: () => copyPatchInstructions(),
      onImport: (files) => importPatch(files),
    });
  }

  async function downloadPatch() {
    if (completeReason() || S.completeBusy) return;
    const pkg = buildPatchPackage({
      videoId, title: S.opened.record.title, fingerprint: S.fp, englishTracks: S.opened.record.english, numbers: S.completeNumbers, glossary: glossary(),
    });
    if (!pkg.ok) {
      toast(messageFor(pkg.code), 'danger');
      return;
    }
    S.completeBusy = true;
    renderComplete();
    try {
      await saveText(pkg.file);
    } finally {
      S.completeBusy = false;
      renderComplete();
    }
  }

  async function copyPatchInstructions() {
    if (completeReason()) return;
    try {
      await win.navigator.clipboard.writeText(patchInstructions({ videoId, title: S.opened.record.title, glossary: glossary() }));
      toast('نُسخت تعليمات الاستكمال. الصقها مع الملف في المحادثة.', 'success');
    } catch {
      toast('تعذّر النسخ. أعد المحاولة.', 'danger');
    }
  }

  /** «استيراد ملف تصحيح…»: قراءة على الترجمة الحالية، ثم معاينة واختيار، ثم خطوة واحدة غير محفوظة. */
  async function importPatch(files) {
    if (completeReason() || readOnly()) return;
    const before = S.session.version;
    const read = await readPatch(files, { fingerprint: S.fp, cues: S.session.snapshot() });
    if (!read.ok) {
      await openDialog({
        doc, tone: 'danger', title: 'تعذّر قراءة ملف التصحيح',
        body: `${read.error.message}${read.error.line ? ` (السطر ${read.error.line})` : ''}`,
        actions: [{ label: 'حسنًا', value: 'ok', variant: 'primary' }],
      });
      return;
    }
    if (S.session.version !== before) {
      toast(messageFor('IM_PATCH_STALE'), 'danger');
      return;
    }
    const only = await previewPatch({ doc, plan: read.plan });
    if (!only) return;
    const r = S.session.applyPatchPlan(read.plan, { only });
    if (!r.ok) {
      toast(messageFor(r.code), 'danger');
      return;
    }
    S.result = { tone: 'success', text: `طُبّق ملف التصحيح على ${formatCount(only.length, COUNT_FORMS.cue)}${r.inserted ? ` (أُدرج ${r.inserted})` : ''}. احفظ لتثبيت ذلك، والتراجع يعيده خطوةً واحدة.` };
    computeParts();
    renderToolbar();
    renderComplete();
  }

  // ---- المراجعة والعلامات وآخر موضع (R53) ----
  const shownCues = () => {
    const s = act();
    return Array.from({ length: s.count }, (_, i) => s.cueAt(i));
  };

  /** المشكلات بلا الكثافة (للوحة «المشكلات»؛ والكثافة مجموعتها). */
  function timingOnly(report) {
    const list = report.list.filter((x) => !x.density);
    return { ...report, list, warnings: list.length - report.errors };
  }

  /** العلامات على المعروض: على المفتوح بالمواضع نفسها حين لم تتغير البنية، فيبقى المعدَّل غير المحفوظ مرتبطًا. */
  function computeMarks() {
    if (S.view !== 'edit' || !S.info) {
      S.markView = resolveSlotMarks([], []);
      return;
    }
    const s = S.session;
    const opened = s.reshaped ? null : Array.from({ length: s.count }, (_, i) => s.baseAt(i));
    S.markView = resolveSlotMarks(S.info.marks, shownCues(), { opened });
  }

  function renderReview(report) {
    const groups = reviewGroups({ issues: report, comparison: S.comparison, marks: S.markView ?? resolveSlotMarks([], []) });
    const limits = densityOf(S.prefs);
    renderDensity(densityEl, { doc, items: groups.auto.density, maxCps: limits.maxCps, maxLineChars: READING_DEFAULTS.maxLineChars, onJump: (i) => jumpTo(i, 'text') });
    renderMarks(marksEl, { doc, marks: groups.marks, readOnly: readOnly(), onJump: (i) => jumpTo(i, 'text'), onRemoveOrphans: () => removeOrphans() });
    renderResume(resumeEl, { doc, items: resumeItems(), onResume: (n) => resumeSlot(n) });
    for (const t of sideTabs) t.textContent = t.dataset.tab === 'review' ? `المراجعة${groups.counts.todo ? ` (${groups.counts.todo})` : ''}` : 'الاستكمال';
  }

  function setSideTab(id) {
    for (const t of sideTabs) {
      const on = t.dataset.tab === id;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    }
    reviewPane.hidden = id !== 'review';
    completePane.hidden = id !== 'complete';
    if (id === 'complete') renderComplete();
  }

  /** كتابات المحرّر واحدة بعد أخرى، كلٌّ على أحدث حزمة مفتوحة، فلا تُرفض كتابة لأن كتابة لنا سبقتها. */
  function queue(fn) {
    S.writing++;
    const run = S.writeChain.then(() => fn(S.opened));
    S.writeChain = run.catch(() => {}).finally(() => {
      S.writing--;
      if (!S.writing && !S.saving) flushPending();
    });
    return run;
  }

  /** بعد كتابة علامة أو موضع أو مرجع: الحزمة الناتجة هي المفتوحة، والجلسة كما هي. */
  function afterCompanionWrite(b) {
    S.opened = b;
    S.info = openedSlot(b, S.slot);
    computeMarks();
    S.list.refresh(null);
    renderAll();
  }

  async function writeMarkPlan(plan, message, { undoable = true } = {}) {
    try {
      const b = await queue((opened) => writeMarks(store, videoId, opened, S.slot, plan, { now }));
      afterCompanionWrite(b);
      toast(message, 'success', undoable ? { action: { label: 'تراجع', onClick: () => writeMarkPlan({ remove: plan.add, add: plan.remove }, 'أُعيدت العلامات كما كانت.', { undoable: false }) } } : {});
    } catch (err) {
      const info = toErrorInfo(err);
      toast(info.code === 'ST_CONFLICT' ? 'تغيّرت الترجمة من مكان آخر؛ أعد المحاولة بعد تحديثها.' : `${messageFor('ED_MARK_FAILED')} (${info.code})`, 'danger');
    }
  }

  /** تبديل علامة الصف: بلا ← «أعود إليه» ← «راجعته» ← بلا، كتابةً واحدة برسالة «تراجع». */
  function toggleMark(i) {
    if (readOnly() || S.external) return;
    const cur = S.markView.byIndex.get(i) ?? null;
    const kind = nextMark(cur?.kind ?? null);
    let plan;
    try {
      plan = planMarkToggle(S.markView, shownCues(), i, kind, new Date(now()).toISOString());
    } catch {
      toast(messageFor('ED_MARK_FAILED'), 'danger');
      return;
    }
    const n = act().cueAt(i).n;
    writeMarkPlan(plan, kind ? `المقطع ${n}: «${MARK_LABEL[kind]}».` : `أُزيلت علامة المقطع ${n}.`);
  }

  function removeOrphans() {
    if (readOnly() || !S.markView.orphans.length) return;
    writeMarkPlan({ remove: S.markView.orphans, add: [] }, `أُزيلت ${formatCount(S.markView.orphans.length, COUNT.mark)} فقدت مقطعها.`);
  }

  /** مواضع الخانات الممتلئة: لكلٍّ رقم المقطع الأقرب إلى موضعها المحفوظ. */
  function resumeItems() {
    return S.opened.slots.filter((x) => x.track).map((x) => {
      const cues = x.n === S.slot && S.view === 'edit' ? shownCues() : x.track.current ?? x.track.original;
      const i = resolvePosition(x.position, cues);
      return { slot: x.n, name: x.name, n: i === null ? null : cues[i].n, editing: x.n === S.slot };
    });
  }

  function resumeSlot(n) {
    if (n !== S.slot) {
      S.resumeAfterSwitch = true;
      switchSlot(n);
      return;
    }
    resumeHere();
  }

  /** «تابع من المقطع 312»: القفز إلى آخر موضع للخانة. */
  function resumeHere() {
    resumeChip.hidden = true;
    const i = resolvePosition(S.info.position, shownCues());
    if (i !== null) jumpTo(i, 'text');
  }

  function renderResumeChip() {
    const i = S.info.position ? resolvePosition(S.info.position, shownCues()) : null;
    resumeChip.hidden = i === null;
    if (i !== null) resumeChip.firstChild.textContent = `تابع من المقطع ${act().cueAt(i).n}`;
  }

  /** آخر موضع يُكتب عند نقاط طبيعية: بعد سكون على مقطع، وعند مغادرة الصفحة أو الخانة (لا مع كل تمرير). */
  function schedulePosition() {
    win.clearTimeout(S.positionTimer);
    S.positionTimer = win.setTimeout(() => writePositionNow(), POSITION_DELAY_MS);
  }

  function writePositionNow() {
    win.clearTimeout(S.positionTimer);
    if (S.view !== 'edit' || S.activeIndex === null || S.external || !S.info) return null;
    const cue = act().cueAt(S.activeIndex);
    const stored = S.info.position;
    if (stored && stored.n === cue.n && stored.startMs === cue.startMs) return null;
    const saved = S.info.cues;
    const index = resolvePosition({ n: cue.n, startMs: cue.startMs, at: '' }, saved);
    if (index === null) return null;
    const slot = S.slot;
    return queue((opened) => writePosition(store, videoId, opened, slot, index, { now }))
      .then((b) => { if (S.slot === slot) afterCompanionWrite(b); else S.opened = b; })
      .catch(() => {});
  }

  // ---- الأفعال ----
  function setScope(kind) {
    S.scope = kind;
    renderToolbar();
  }

  function setView(view) {
    if (view !== 'edit' && view !== 'original') return;
    S.view = view;
    S.selection.clear();
    S.activeIndex = null;
    S.result = null;
    rebuildList();
    renderAll();
  }

  function setShowEnglish(on) {
    S.showEnglish = on;
    S.hideEnglish = !on;
    enToggle.checked = on;
    scroller.classList.toggle('ed-list--no-en', !on);
    listHead.classList.toggle('ed-list--no-en', !on);
    S.list.refresh(null);
  }

  function setActive(i) {
    if (S.activeIndex === i) return;
    const prev = S.activeIndex;
    S.activeIndex = i;
    S.list.refresh([prev, i].filter((x) => x !== null).map((x) => S.rowOf[x]));
    renderToolbar();
    if (i !== null) schedulePosition();
  }

  function toggleSelect(i, checked, range) {
    const was = S.selection.size;
    if (range && S.lastChecked !== null) {
      const [lo, hi] = [Math.min(S.lastChecked, i), Math.max(S.lastChecked, i)];
      for (let k = lo; k <= hi; k++) if (checked) S.selection.add(k); else S.selection.delete(k);
    } else if (checked) S.selection.add(i);
    else S.selection.delete(i);
    S.lastChecked = i;
    if (!was && S.selection.size) S.scope = 'selection';
    if (!S.selection.size && S.scope === 'selection') S.scope = S.activeIndex !== null ? 'cue' : 'all';
    S.list.refresh(null);
    renderToolbar();
  }

  function applyShift(scope, delta, target) {
    if (readOnly()) return;
    const r = S.session.shift(scope, delta);
    S.result = r.ok
      ? { tone: 'success', text: shiftSentence(target, delta, 'after') }
      : { tone: 'danger', text: messageFor(r.code, r.negative ? { list: numberList(r.negative) } : undefined) };
    renderToolbar();
  }

  function applyAmount() {
    if (readOnly()) return;
    const p = parseSeconds(amountIn.value);
    if (!p.ok || p.ms === 0) {
      S.result = { tone: 'danger', text: messageFor(p.ok ? 'ED_SHIFT_ZERO' : 'ED_SHIFT_INVALID') };
      renderToolbar();
      return;
    }
    applyShift(scopeObj(), p.ms, currentTarget());
  }

  function onCommit() {
    if (readOnly()) return;
    const was = S.session.offsetMs;
    const r = S.session.commitOffset();
    S.result = r.ok
      ? { tone: 'success', text: `ثُبّتت إزاحة العرض ${formatOffset(was)} ث في توقيت الملف كله (${formatCount(r.count, COUNT_FORMS.cue)})، وصارت الإزاحة 0.0. احفظ لتثبيت ذلك.` }
      : { tone: 'danger', text: messageFor(r.code, r.negative ? { list: numberList(r.negative) } : undefined) };
    renderAll();
  }

  function doUndo() {
    if (readOnly()) return;
    const r = S.session.undo();
    if (r.ok) S.result = { tone: 'info', text: `تراجعتَ عن: ${KIND_LABEL[r.kind]}.` };
    scheduleChrome();
  }

  function doRedo() {
    if (readOnly()) return;
    const r = S.session.redo();
    if (r.ok) S.result = { tone: 'info', text: `أُعيد: ${KIND_LABEL[r.kind]}.` };
    scheduleChrome();
  }

  function commitTime(i, field, raw) {
    const p = parseTimecode(raw);
    if (p.ok) S.session.setTime(i, field, p.ms);
    else S.session.setDraft(i, field, raw);
  }

  function jumpTo(index, field) {
    if (index < 0 || index >= act().count) return;
    const row = S.rowOf[index];
    setActive(index);
    const node = S.list.reveal(row);
    const sel = field === 'start' || field === 'end' ? `[data-field="${field}"]` : '[data-field="text"]';
    node?.querySelector(sel)?.focus({ preventScroll: true });
  }

  // ---- إجراءات الصف: الدمج والشطر والقفز (R54، R56) ----
  const caretOf = (i) => (S.caret && S.caret.index === i && S.caret.version === S.session.version ? S.caret.at : null);

  /** سطر المعاينة قبل الدمج أو الشطر، من المحرّكين نفسيهما على المقطع وحده. */
  function structurePreview(kind, i) {
    const s = S.session;
    if (i >= s.count) return null;
    try {
      if (kind === 'merge') {
        if (i >= s.count - 1) return messageFor('ED_MERGE_INVALID');
        const [merged] = mergeCues([s.cueAt(i), s.cueAt(i + 1)], 0);
        return mergePreview(s.cueAt(i), s.cueAt(i + 1), merged, formatTimecode);
      }
      const at = caretOf(i);
      if (at === null) return `ضع المؤشر في نص المقطع ${s.cueAt(i).n} حيث تريد الشطر، ثم اضغط «شطر».`;
      const [head, tail] = splitCue([s.cueAt(i)], 0, at);
      return splitPreview(s.cueAt(i).n, head.text, tail.text);
    } catch (err) {
      return toErrorInfo(err).message;
    }
  }

  function afterStructure(i, text) {
    S.caret = null;
    S.hoverAct = null;
    S.result = { tone: 'success', text };
    jumpTo(Math.min(i, act().count - 1), 'text');
    renderToolbar();
  }

  function onMerge(i) {
    if (readOnly()) return;
    const [a, b] = [S.session.cueAt(i), S.session.cueAt(i + 1)];
    const r = S.session.merge(i);
    if (r.ok) afterStructure(i, `دُمج المقطع ${a.n} مع ${b.n}. احفظ لتثبيت ذلك، والتراجع يعيدهما.`);
    else {
      S.result = { tone: 'danger', text: messageFor(r.code) };
      renderToolbar();
    }
  }

  function onSplit(i) {
    if (readOnly()) return;
    const at = caretOf(i);
    const n = S.session.cueAt(i).n;
    if (at === null) {
      S.result = { tone: 'info', text: `ضع المؤشر في نص المقطع ${n} حيث تريد الشطر، ثم اضغط «شطر» مرة أخرى.` };
      jumpTo(i, 'text');
      renderToolbar();
      return;
    }
    const r = S.session.split(i, at);
    if (r.ok) afterStructure(i, `شُطر المقطع ${n} إلى قطعتين برقمه نفسه. احفظ لتثبيت ذلك، والتراجع يعيده.`);
    else {
      S.result = { tone: 'danger', text: messageFor(r.code) };
      renderToolbar();
    }
  }

  /** «▶ في الفيديو»: زمن المقطع كما يظهر (المحفوظ + إزاحة العرض) في تبويب الفيديو المفتوح أو تبويب جديد. */
  async function onSeek(i) {
    const cue = act().cueAt(i);
    const ms = Math.max(0, cue.startMs + S.session.offsetMs);
    setActive(i);
    const r = await seek({ videoId, ms });
    const res = seekResult(r, formatTimecode(ms), (code) => messageFor(code));
    toast(res.text, res.tone);
  }

  /** «تصحيح الانجراف…» من «أدوات التوقيت»: حوار بمرساتين ومعاينة، ثم خطوة واحدة في الجلسة. */
  async function onDrift() {
    if (readOnly()) {
      toast(messageFor('ED_READ_ONLY'), 'info');
      return;
    }
    const anchors = await openDriftDialog({ doc, cues: S.session.snapshot(), activeIndex: S.activeIndex });
    if (!anchors) return;
    const r = S.session.drift(anchors);
    S.result = r.ok
      ? { tone: r.count ? 'success' : 'info', text: r.count ? `صُحّح انجراف التوقيت في الملف كله (${formatCount(r.count, COUNT_FORMS.cue)}). احفظ لتثبيت ذلك، والتراجع يعيده.` : 'التوقيت مطابق للنقطتين؛ لا شيء تغيّر.' }
      : { tone: 'danger', text: messageFor(r.code, r.negative ? { list: numberList(r.negative) } : undefined) };
    renderToolbar();
  }

  /** نتيجة بحث: الصف ظاهر ومميز، والمطابقة محددة في نصه حين يُطلب التركيز (أزرار ↑↓). */
  function revealMatch(index, match, { focus, field }) {
    if (index < 0 || index >= act().count) return;
    setActive(index);
    const node = S.list.reveal(S.rowOf[index]);
    if (!focus || !node) return;
    const text = node.querySelector('[data-field="text"]');
    if (field === 'ar' && match && text) {
      text.focus({ preventScroll: true });
      text.setSelectionRange(match.start, match.end);
    } else text?.focus({ preventScroll: true });
  }

  function jumpToN(n) {
    const i = S.indexOfN.get(n);
    if (i !== undefined) jumpTo(i, null);
    else if (S.missingRowOfN.has(n)) S.list.reveal(S.missingRowOfN.get(n));
  }

  async function save() {
    if (S.saving) return;
    const why = saveBlockReason();
    if (why) {
      // الزر المعطّل لا يصل إلى هنا؛ هذا ⌘S، فيُذكر السبب بدل صمت.
      toast(why, 'info');
      return;
    }
    S.saving = true;
    renderHeader();
    const session = S.session;
    const at = session.version;
    try {
      const n = S.slot;
      const edit = {
        cues: session.snapshot(), offsetChanged: session.offsetChanged, offsetMs: session.offsetMs,
        reanchorFrom: session.reshaped ? null : session.baseSnapshot(),
      };
      const saved = await queue((opened) => saveSlot(store, videoId, opened, n, edit, { now }));
      S.result = null;
      if (S.session === session && session.version !== at) {
        // كتب المستخدم أثناء الحفظ: المحفوظ يصبح الأساس وما كُتب بعده يبقى غير محفوظ، فلا يُكتب فوق الحقل.
        S.opened = saved;
        S.info = openedSlot(saved, n);
        S.edited = S.info.edited;
        session.markSaved({ cues: S.info.cues, offsetMs: S.info.offsetMs });
      } else load(saved, n, { keepUi: true });
      toast('حُفظ ✓', 'success');
    } catch (err) {
      const info = toErrorInfo(err);
      if (info.code === 'ST_CONFLICT') S.external = 'changed';
      toast(`تعذّر الحفظ: ${info.message}`, 'danger');
    } finally {
      S.saving = false;
      flushPending();
      renderAll();
    }
  }

  function flushPending() {
    const p = S.pending;
    S.pending = null;
    if (p) handleExternal(p);
  }

  async function reopen() {
    if ((S.session.dirty || S.session.hasDrafts) && !(await confirmLeave(doc, `${unsavedSentence(changes())}. ستُفقد عند إعادة الفتح وتظهر آخر نسخة محفوظة.`))) return;
    try {
      const b = await store.getBundle(videoId);
      if (!b?.slots[S.slot - 1].track) {
        S.external = 'removed';
        renderAll();
        return;
      }
      load(b, S.slot, { keepUi: true });
      toast(messageFor('ED_RELOADED'), 'info');
    } catch (err) {
      const info = toErrorInfo(err);
      toast(`${info.message} (${info.code})`, 'danger');
    }
  }

  function handleExternal(change) {
    const kind = classifyChange(S.opened, change);
    if (kind === 'none' || kind === 'echo') return;
    if (kind === 'removed') {
      S.external = 'removed';
      renderAll();
      return;
    }
    // تغيّرٌ لا يمس محتوى خانة التحرير (علامة من المشغّل، أو خانة أخرى، أو النشطة) يُتبنّى دون تعارض ولا إعادة بناء.
    S.externalChain = S.externalChain.then(async () => {
      let latest = null;
      try {
        latest = await store.getBundle(videoId);
      } catch {
        latest = null;
      }
      if (!latest?.slots[S.slot - 1].track) S.external = 'removed';
      else if (!slotContentChanged(S.opened, latest, S.slot)) {
        adopt(latest);
        return;
      } else if (S.session.dirty || S.session.hasDrafts) S.external = 'changed';
      else {
        load(latest, S.slot, { keepUi: true });
        toast(messageFor('ED_RELOADED'), 'info');
        return;
      }
      renderAll();
    });
  }

  /** حزمة أحدث لم يتغير فيها محتوى خانة التحرير: تصبح المفتوحة (فيقبل الحفظ)، وتُحدَّث العلامات والمرجع والخانات. */
  function adopt(latest) {
    const prevFp = S.fp?.id ?? null;
    S.opened = latest;
    S.info = openedSlot(latest, S.slot);
    if ((S.info.fingerprint?.id ?? null) !== prevFp) {
      S.fp = S.info.fingerprint;
      S.englishTrack = pickEnglishTrack(latest.record.english, S.fp);
      rebuildList();
    }
    titleEl.textContent = latest.record.title ?? 'بلا عنوان محفوظ';
    renderAll();
  }

  /** تبديل خانة التحرير (§١٩.٩): بتغييرات غير محفوظة حوار تأكيد، ولا تتغير النشطة. */
  async function switchSlot(n) {
    if (n === S.slot || !S.opened.slots[n - 1]?.track) return;
    if (S.session.dirty || S.session.hasDrafts) {
      const canSave = !saveBlockReason();
      const v = await openDialog({
        doc, tone: 'danger', title: `التبديل إلى الترجمة ${n}؟`, focus: 'stay',
        body: `${unsavedSentence(changes())} في الترجمة ${S.slot}. التبديل دون حفظ يُفقدها.`,
        actions: [
          { label: 'البقاء', value: 'stay', variant: 'primary' },
          canSave ? { label: 'حفظ ثم التبديل', value: 'save', variant: 'secondary' } : null,
          { label: 'التبديل دون حفظ', value: 'switch', variant: 'danger' },
        ].filter(Boolean),
      });
      if (v === 'save') {
        await save();
        if (S.session.dirty) return;
      } else if (v !== 'switch') {
        renderSlots();
        return;
      }
    }
    writePositionNow();
    S.view = 'edit';
    S.result = null;
    load(S.opened, n);
    rememberSlot(n);
    toast(`الترجمة ${n}`, 'info');
    if (S.resumeAfterSwitch) {
      S.resumeAfterSwitch = false;
      resumeHere();
    }
  }

  /** الخانة في العنوان، فيفتحها التحديث نفسها. */
  function rememberSlot(n) {
    try {
      const url = new URL(win.location.href);
      url.searchParams.set('t', String(n));
      win.history.replaceState(win.history.state, '', url.href);
    } catch {
      // عنوان لا يُكتب (صفحة اختبار): لا أثر على التحرير.
    }
  }

  async function onDiscard() {
    const v = await openDialog({
      doc, tone: 'danger', title: 'تجاهل التغييرات؟', body: `${unsavedSentence(changes())}. ستُفقد ويعود الملف كما فُتح.`, focus: 'cancel',
      actions: [{ label: 'تجاهل التغييرات', value: 'discard', variant: 'danger' }, { label: 'إلغاء', value: 'cancel' }],
    });
    if (v !== 'discard') return;
    S.session.discard();
    S.result = { tone: 'info', text: 'عاد الملف كما فُتح.' };
    renderAll();
  }

  async function onRestoreOriginal() {
    if (!S.edited || S.external) return;
    const dirty = S.session.dirty;
    const v = await openDialog({
      doc, tone: 'danger', title: 'استعادة الأصل المستورد؟', focus: 'cancel',
      body: `ستُستبدل النسخة المعدّلة المحفوظة بالأصل المستورد كما رُفع${dirty ? `، وتُفقد التغييرات غير المحفوظة (${changes()})` : ''}. لا تراجع بعد التأكيد، والأصل نفسه لا يتغير.`,
      actions: [{ label: 'استعادة الأصل', value: 'restore', variant: 'danger' }, { label: 'إلغاء', value: 'cancel' }],
    });
    if (v !== 'restore') return;
    S.saving = true;
    renderHeader();
    try {
      const n = S.slot;
      const saved = await queue((opened) => restoreSlotOriginal(store, videoId, opened, n, { now }));
      S.view = 'edit';
      S.result = null;
      load(saved, S.slot, { keepUi: true });
      toast(messageFor('ED_ORIGINAL_RESTORED'), 'success');
    } catch (err) {
      const info = toErrorInfo(err);
      if (info.code === 'ST_CONFLICT') S.external = 'changed';
      toast(`تعذّرت الاستعادة: ${info.message}`, 'danger');
    } finally {
      S.saving = false;
      flushPending();
      renderAll();
    }
  }

  async function onRestoreTiming() {
    if (readOnly()) return;
    const pv = previewRestoreTiming(S.session.snapshot(), S.fp);
    if (!pv.available) {
      toast(messageFor('CMP_RESTORE_UNAVAILABLE'), 'danger');
      return;
    }
    if (!pv.changes.length) {
      await openDialog({ doc, title: 'التوقيت مطابق للأصل', body: 'لا مقطع يختلف توقيته عن الملف الذي صُدِّر، فلا شيء لاستعادته.', actions: [{ label: 'حسنًا', value: 'ok', variant: 'primary' }] });
      return;
    }
    const span = (t) => el('td', { children: [ltr(t, { doc })], doc });
    const table = el('div', {
      className: 'ed-preview-table',
      children: [el('table', {
        children: [
          el('thead', { children: [el('tr', { children: ['#', 'الحالي', 'الأصل'].map((t) => el('th', { text: t, attrs: { scope: 'col' }, doc })), doc })], doc }),
          el('tbody', {
            children: pv.changes.slice(0, MAX_PREVIEW_ROWS).map((c) => el('tr', {
              children: [
                el('td', { className: 'tj-mono-sm', text: String(c.n), doc }),
                span(`${formatTimecode(c.from.startMs)} → ${formatTimecode(c.from.endMs)}`),
                span(`${formatTimecode(c.to.startMs)} → ${formatTimecode(c.to.endMs)}`),
              ],
              doc,
            })),
            doc,
          }),
        ],
        doc,
      }), pv.changes.length > MAX_PREVIEW_ROWS ? el('p', { className: 'tj-caption', text: `و${pv.changes.length - MAX_PREVIEW_ROWS} أخرى.`, doc }) : null],
      doc,
    });
    const v = await openDialog({
      doc, size: 'lg', title: 'استعادة التوقيت الأصلي', content: table, focus: 'cancel',
      body: 'تُستبدل أزمنة هذه المقاطع بأزمنة الملف الإنجليزي الذي صُدِّر، ويبقى النص كما هو. التغيير غير محفوظ حتى «حفظ»، ويمكن التراجع عنه.',
      actions: [{ label: `تطبيق على ${formatCount(pv.changes.length, COUNT_FORMS.cue)}`, value: 'apply', variant: 'primary' }, { label: 'إلغاء', value: 'cancel' }],
    });
    if (v !== 'apply') return;
    const r = S.session.restoreTiming(S.fp);
    S.result = r.ok
      ? { tone: 'success', text: `استُعيد توقيت ${formatCount(r.count, COUNT_FORMS.cue)} من الأصل. احفظ لتثبيت ذلك.` }
      : { tone: 'danger', text: messageFor(r.code) };
    scheduleChrome();
  }

  async function onExport() {
    const hasOriginal = S.edited || S.session.dirty;
    let variant = S.view === 'original' ? 'original' : 'current';
    let choice = 'shown';
    let plan = null;
    let confirmBtn = null;
    const offset = S.session.offsetMs;
    const radios = (name, items, value, onPick) => el('fieldset', {
      className: 'ed-fieldset',
      children: [
        el('legend', { className: 'tj-label', text: items.legend, doc }),
        ...items.options.map(([v, t]) => el('label', {
          className: 'ed-radio',
          children: [el('input', { attrs: { type: 'radio', name, value: v, ...(v === value ? { checked: '' } : {}) }, on: { change: () => onPick(v) }, doc }), el('span', { text: t, doc })],
          doc,
        })),
      ],
      doc,
    });
    const timingBox = el('div', { doc });
    const nameLine = el('p', { className: 'tj-body-sm', doc });
    const noteLine = el('p', { className: 'tj-caption', doc });
    const errorBox = el('div', { doc });
    const refresh = () => {
      const s = variant === 'original' ? S.original : S.session;
      const errs = s.issues().errors;
      plan = errs
        ? { ok: false, code: 'ED_EXPORT_HAS_ERRORS', count: errs }
        : planArabicExport({ videoId, cues: s.snapshot(), offsetMs: variant === 'original' ? 0 : offset, choice, variant });
      timingBox.replaceChildren(variant === 'current' && offset !== 0
        ? radios('ed-timing', {
          legend: 'التوقيت المصدَّر',
          options: [['shown', `الظاهر أثناء المشاهدة (المحفوظ + الإزاحة ${formatOffset(offset)} ث)`], ['saved', 'المحفوظ فقط']],
        }, choice, (v) => { choice = v; refresh(); })
        : el('span', { doc }));
      const name = plan.ok ? plan.name : `${videoId}.ar${variant === 'original' ? '.original' : ''}.srt`;
      nameLine.replaceChildren('اسم الملف: ', ltr(name, { doc }));
      noteLine.textContent = variant === 'original'
        ? 'الأصل يُصدَّر بتوقيته كما استُورد، دون إزاحة العرض.'
        : S.session.dirty ? `يُصدَّر ما تراه الآن، ومنه تغييرات غير محفوظة (${changes()}).` : offset === 0 ? 'إزاحة العرض صفر، فيُصدَّر التوقيت المحفوظ كما هو.' : '';
      const why = plan.ok ? null : exportError(plan);
      errorBox.replaceChildren(why ? alertBox({ tone: 'danger', title: 'لا يمكن التصدير', text: why, doc }) : el('span', { doc }));
      if (confirmBtn) setDisabled(confirmBtn, why);
    };
    const content = el('div', {
      className: 'tj-stack',
      children: [
        hasOriginal ? radios('ed-variant', { legend: 'النسخة', options: [['current', 'النسخة الحالية (ما تراه في المحرّر)'], ['original', 'الأصل المستورد كما رُفع']] }, variant, (v) => { variant = v; refresh(); }) : null,
        timingBox, nameLine, noteLine, errorBox,
      ],
      doc,
    });
    refresh();
    const v = await openDialog({
      doc, size: 'md', title: 'تصدير الترجمة العربية (SRT)', content, focus: 'download',
      actions: [{
        label: 'تنزيل SRT', value: 'download', variant: 'primary',
        ref: (b) => {
          confirmBtn = b;
          setDisabled(b, plan.ok ? null : exportError(plan));
        },
      }, { label: 'إلغاء', value: 'cancel' }],
    });
    if (v !== 'download' || !plan?.ok) return;
    await saveText({ name: plan.name, text: plan.text });
  }

  /**
   * كل ما يصدّره المحرّر عبر saveFile (R65): يتبع «مكان حفظ ملفات الترجمة»، والتعذّر يرجع إلى التنزيل المعتاد برسالته.
   * @param {{ name: string, text: string }} file
   */
  async function saveText(file) {
    let r;
    try {
      r = await saveFile(file, { store, doc });
    } catch {
      r = { ok: false, code: 'SV_FAILED' };
    }
    const res = saveMessage(r, file.name, S.prefs?.saveLocation, messageFor);
    toast(res.text, res.tone);
    return r;
  }

  function exportError(plan) {
    if (plan.code === 'ED_EXPORT_HAS_ERRORS') return messageFor(plan.code, { count: errorsToFix(plan.count) });
    if (plan.code === 'ED_EXPORT_BLOCKED') return messageFor(plan.code, { list: numberList(plan.list) });
    if (plan.code === 'MD_NEGATIVE_TIME') return messageFor(plan.code, { list: numberList(plan.negative) });
    return plan.message ?? messageFor(plan.code);
  }

  async function goLibrary() {
    if ((S.session.dirty || S.session.hasDrafts) && !(await confirmLeave(doc, messageFor('ED_LEAVE_UNSAVED')))) return;
    S.leaving = true;
    win.location.assign(new URL('../library/index.html', win.location.href).href);
  }

  // ---- أحداث القائمة (تفويض من الحاوية) ----
  const rowOfNode = (t) => t.closest?.('.ed-row[data-index]');
  scroller.addEventListener('input', (e) => {
    const t = e.target;
    const node = rowOfNode(t);
    if (!node || readOnly() || t.dataset.field !== 'text') return;
    S.session.setText(Number(node.dataset.index), t.value);
    t.dir = textDir(t.value);
  });
  scroller.addEventListener('change', (e) => {
    const t = e.target;
    const node = rowOfNode(t);
    if (!node || readOnly()) return;
    if (t.dataset.field === 'start' || t.dataset.field === 'end') commitTime(Number(node.dataset.index), t.dataset.field, t.value);
  });
  scroller.addEventListener('keydown', (e) => {
    const t = e.target;
    const node = rowOfNode(t);
    if (!node || (t.dataset.field !== 'start' && t.dataset.field !== 'end')) return;
    const i = Number(node.dataset.index);
    if (e.key === 'Enter' && !readOnly()) {
      e.preventDefault();
      commitTime(i, t.dataset.field, t.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      S.session.setDraft(i, t.dataset.field, null);
      S.list.refresh([S.rowOf[i]], true);
    }
  });
  scroller.addEventListener('focusin', (e) => {
    const node = rowOfNode(e.target);
    if (node) setActive(Number(node.dataset.index));
  });
  // موضع المؤشر في نص المقطع (للشطر عنده): يُحفظ عند كل حركة وعند مغادرة الحقل، فيبقى بعد نقل التركيز إلى زر الشطر.
  const trackCaret = (e) => {
    const t = e.target;
    const node = rowOfNode(t);
    if (!node || t.dataset?.field !== 'text') return;
    S.caret = { index: Number(node.dataset.index), at: t.selectionStart, version: S.session.version };
  };
  for (const type of ['keyup', 'mouseup', 'input', 'select']) scroller.addEventListener(type, trackCaret);
  scroller.addEventListener('focusout', (e) => {
    if (e.target.dataset?.field === 'text') {
      trackCaret(e);
      S.session.seal();
    }
  });
  scroller.addEventListener('click', (e) => {
    const t = e.target.closest?.('[data-act]');
    const node = t && rowOfNode(t);
    if (!node) return;
    const i = Number(node.dataset.index);
    const kind = t.dataset.act;
    if (kind === 'select') toggleSelect(i, t.checked, e.shiftKey);
    else if (kind === 'seek') onSeek(i);
    else if (t.getAttribute('aria-disabled') === 'true') return;
    else if (kind === 'nudge' && !readOnly()) {
      setActive(i);
      applyShift({ kind: 'cue', index: i }, Number(t.dataset.dir) * S.stepMs, scopeTarget('cue', { activeN: act().cueAt(i).n, total: act().count }));
    } else if (kind === 'merge') onMerge(i);
    else if (kind === 'split') onSplit(i);
    else if (kind === 'mark') toggleMark(i);
  });
  // معاينة الدمج والشطر قبل التطبيق في سطر شريط الأدوات (كمعاينة ±).
  const hoverAct = (on) => (e) => {
    const t = e.target.closest?.('[data-act="merge"], [data-act="split"]');
    const node = t && rowOfNode(t);
    if (!node) return;
    S.hoverAct = on ? { kind: t.dataset.act, index: Number(node.dataset.index) } : null;
    renderToolbar();
  };
  scroller.addEventListener('mouseover', hoverAct(true));
  scroller.addEventListener('mouseout', hoverAct(false));
  scroller.addEventListener('focusin', hoverAct(true));
  scroller.addEventListener('focusout', hoverAct(false));

  // ---- لوحة المفاتيح والمغادرة والتخزين ----
  doc.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    // المفتاح الفعلي لا الحرف: بتخطيط عربي يكون e.key «س» لا «s».
    const k = { KeyS: 's', KeyZ: 'z', KeyY: 'y', KeyF: 'f' }[e.code];
    if (k === 's') {
      e.preventDefault();
      save();
      return;
    }
    if (k === 'f' && !doc.querySelector('dialog[open]')) {
      // القائمة افتراضية فلا يرى بحث المتصفح صفوفها المخفية: ⌘F يركّز بحث المحرّر (R51).
      e.preventDefault();
      search.focus();
      return;
    }
    const t = e.target;
    const typing = t instanceof win.HTMLTextAreaElement || (t instanceof win.HTMLInputElement && t.type === 'text');
    if (typing || doc.querySelector('dialog[open]')) return;
    if (k === 'z') {
      e.preventDefault();
      if (e.shiftKey) doRedo();
      else doUndo();
    } else if (k === 'y') {
      e.preventDefault();
      doRedo();
    }
  });
  // آخر موضع عند مغادرة الصفحة أو إخفاء التبويب (نقطة طبيعية).
  win.addEventListener('pagehide', () => writePositionNow());
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'hidden') writePositionNow();
  });
  win.addEventListener('beforeunload', (e) => {
    if (S.leaving || !(S.session.dirty || S.session.hasDrafts)) return;
    e.preventDefault();
    e.returnValue = '';
  });
  store.onChange((change) => {
    if (change.prefs?.newValue) {
      // حد سرعة القراءة من الإعدادات (R55) يسري فورًا؛ ولا يمس شيئًا محفوظًا.
      S.prefs = change.prefs.newValue;
      S.session.setDensity(densityOf(S.prefs));
      S.original.setDensity(densityOf(S.prefs));
      rebuildList();
      scheduleChrome();
    }
    const c = change.cleared ? { oldValue: S.opened.record, newValue: null } : change.videos?.[videoId];
    if (!c) return;
    if (S.saving || S.writing) S.pending = c;
    else handleExternal(c);
  });

  load(bundle, picked.n);
  rememberSlot(picked.n);
  setSideTab('review');
  if (picked.fallback) toast(slotFallback(requested, picked.n), 'info');
  const api = { get state() { return S; }, save, jumpTo, setView, switchSlot };
  if (typeof __TJ_DEV__ !== 'undefined' && __TJ_DEV__) globalThis.__tarjumanEditor = api;
  return api;
}
