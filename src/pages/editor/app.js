// صفحة المحرّر (P8 ثم P14، مواصفة التصميم §١١ و§١٩.٩): الرأس والنسخة وخانة التحرير 1 2 3 وحالة الحفظ، وشريط النطاق
// و±، وسطر إزاحة العرض المنفصل، والقائمة الافتراضية بعمودها المرجعي، واللوحة الجانبية، والحفظ والأصل والتصدير وحارس
// المغادرة. المنطق في src/core/edit (الجلسة والمشكلات وما يُصدَّر)؛ هنا الحالة المعروضة والأحداث فقط. لا حفظ تلقائي
// أبدًا: «حفظ» وحده يكتب في خانة التحرير، بـexpect الحزمة المفتوحة، فإن تغيّر محتوى الخانة من المشغّل أو تبويب آخر رُفض.
/* global __TJ_DEV__ */
import { compare, currentComparison, fingerprintCoverage, previewRestoreTiming, rankReferences } from '../../core/compare/index.js';
import { canonical } from '../../core/store/version.js';
import { planRescue } from '../../core/edit/rescue.js';
import { normalizeSettings } from '../../core/model/settings.js';
import { LIMITS } from '../../core/model/validate.js';
import { READING_DEFAULTS } from '../../core/edit/density.js';
import {
  COMPLETION_DEFAULTS, buildRows, completionGroups, completionNumbers, createEditSession, englishReference, parseSeconds, parseTimecode,
  pickEnglishTrack, planArabicExport, planMarkToggle, resolveSlotMarks, reviewGroups, reviewItems,
} from '../../core/edit/index.js';
import { resolvePosition } from '../../core/model/marks.js';
import { messageFor, toErrorInfo } from '../../core/errors/index.js';
import { buildPatchPackage, buildReviewReport, buildStudyText, patchInstructions, studyTiming, studyTimingNote, translationLang } from '../../core/export/index.js';
import { DEFAULT_TARGET_LANG } from '../../core/model/lang-prefs.js';
import { attachedCount, termsFor } from '../../core/model/glossaries.js';
import { partsStatus, readPatch } from '../../core/import/index.js';
import { saveFile as defaultSaveFile } from '../../core/save/index.js';
import { slotModels } from '../../core/model/bundle.js';
import { mergeCues, splitCue } from '../../core/edit/structure.js';
import { getDir, getLocale, lt, t } from '../../i18n/index.js';
import { alertBox, button, el, emptyState, ltr, relabel, slotPicker, statusPill } from '../../ui/components.js';
import { COUNT_FORMS, formatCount, formatTimecode, offsetInline, textDirection } from '../../ui/format.js';
import { holdTimer, onHold } from '../../ui/hold.js';
import { createMenu } from '../../ui/menu.js';
import { pairLabel } from '../../ui/lang.js';
import { jumpToVideo, openVideo as defaultOpenVideo } from '../../ui/seek.js';
import { TOAST_MS } from '../../ui/toast.js';
import { openDriftDialog } from './drift-dialog.js';
import { confirmLeave, openDialog, setDisabled } from './dialogs.js';
import { keepFocus } from './focus.js';
import { openReportDialog, openStudyDialog } from './export-dialogs.js';
import { renderComparison, renderIssues, renderReference } from './panels.js';
import { editorIcon } from './icons.js';
import { openRescueDialog } from './rescue-dialog.js';
import {
  classifyChange, openedSlot, pickSlot, restoreSlotOriginal, saveSlot, slotChange, slotContentChanged, writeMarks, writePosition, writeReference,
} from './persist.js';
import { renderDensity, renderMarks, renderResume } from './review-panel.js';
import { previewPatch, renderCompletePanel } from './complete-panel.js';
import { createRows, textDir } from './rows.js';
import { createSearch } from './search.js';
import {
  COUNT, MARK_LABEL, activeSlotLine, editSlotLabel, errorsToFix, isMac, keyHint, mergePreview, nextMark, numberList, offsetLine, offsetNotice,
  pendingSentence, refLabel, refOptionLabel, saveMessage, saveStatus, scopeOption, scopeTarget, seconds, seekResult, shiftSentence, slotFallback,
  splitPreview,
} from './text.js';
import { RowLayout, createVirtualList, rowHeight, textLines, wrappedLines } from './virtual.js';

/** اسم نوع خطوة التراجع والإعادة باللغة الحالية (editor.kind.*). */
const kindLabel = (kind) => (kind ? t(`editor.kind.${kind}`) : '');
const STEPS = [100, 250, 500, 1000, 2000, 5000];
/** سكون على مقطع قبل كتابة آخر موضع (نقطة طبيعية، لا مع كل تمرير). */
const POSITION_DELAY_MS = 4000;
const MAX_PREVIEW_ROWS = 200;
const COMPARE_DELAY_MS = 250;
/** أنواع الحقول التي يُكتب فيها نص: ⌘Z فيها للحقل لا للمحرّر (تدقيق 7a66f91، U17: كان حقل البحث type=search خارجها). */
const TEXT_INPUTS = new Set(['text', 'search', 'url', 'email', 'tel', 'password', 'number']);

/** عتبة الكثافة من التفضيلات (Q15): null = المعايرة. @param {import('../../core/model/prefs.js').Prefs} prefs */
const densityOf = (prefs) => ({ maxCps: prefs?.review?.maxCps ?? READING_DEFAULTS.maxCps });

/**
 * @param {HTMLElement} app
 * @param {{
 *   videoId: string | null, slot?: 1 | 2 | 3 | null, store: ReturnType<typeof import('../../core/store/index.js').createStore>,
 *   doc?: Document, now?: () => number, seek?: typeof jumpToVideo, openVideo?: typeof defaultOpenVideo, saveFile?: typeof defaultSaveFile
 * }} deps slot خانة التحرير المطلوبة (t في العنوان)؛ وبدونها النشطة. seek وopenVideo وsaveFile للاختبار وحده.
 */
export async function mountEditor(app, {
  videoId, slot: requested = null, panel = null, store, doc = document, now = Date.now, seek = jumpToVideo, openVideo = defaultOpenVideo, saveFile = defaultSaveFile,
}) {
  const win = doc.defaultView;
  const title = (text) => el('h1', { className: 'tj-h1', text, doc });
  const libraryHref = (hash = '') => new URL(`../library/index.html${hash}`, win.location.href).href;
  // مخرج حالتي الخطأ إلى المحفوظات (الصفحة بلا شريط علوي، وتُفتح عادةً في تبويب جديد بلا رجوع؛ U27).
  const libraryAction = (hash = '') => button({
    label: t('common.nav.library'), variant: 'secondary', size: 'sm',
    onClick: () => { win?.location.assign(libraryHref(hash)); },
    doc,
  });

  if (!videoId) {
    app.append(title(t('common.nav.editor')), alertBox({ tone: 'danger', title: t('editor.open.failed'), text: messageFor('TJ_BAD_VIDEO_ID'), action: libraryAction(), doc }));
    return null;
  }
  const loading = el('div', { className: 'tj-stack', attrs: { 'aria-busy': 'true' }, children: Array.from({ length: 6 }, () => el('div', { className: 'tj-skeleton ed-skeleton', doc })), doc });
  app.append(title(t('common.nav.editor')), loading);
  let bundle;
  let settings;
  let prefs;
  // تفضيلات اللغات (AA3): «إلى» المختارة لهذا الفيديو لغةُ تعليمات الاستكمال حين تكون الترجمة غير محددة اللغة. تعذّر قراءتها لا يمنع الفتح.
  let langPrefs = null;
  // قوائم المصطلحات لكل زوج (الفكرة ٨): ما يطابق زوج الاستكمال منها يُرفق بتعليماته. تعذّر قراءتها لا يمنع الفتح.
  let glossaries = null;
  try {
    [bundle, settings, prefs, langPrefs, glossaries] = await Promise.all([
      store.getBundle(videoId), store.getSettings(), store.getPrefs(),
      typeof store.getLangPrefs === 'function' ? store.getLangPrefs().catch(() => null) : null,
      typeof store.getGlossaries === 'function' ? store.getGlossaries().catch(() => null) : null,
    ]);
  } catch (err) {
    const info = toErrorInfo(err);
    loading.replaceWith(alertBox({ tone: 'danger', title: t('editor.open.failed'), text: `${info.message} (${info.code})`, action: libraryAction(`#v=${videoId}`), doc }));
    return null;
  }
  const picked = pickSlot(bundle, requested);
  if (picked.n === null) {
    // مخرجان من الحالة الفارغة (لوحة EditorStates): «فتح الفيديو» (تبويبه المفتوح كما هو بلا قفز زمني، أو تبويب جديد)، و«المحفوظات».
    const emptyNote = el('div', { attrs: { role: 'status' }, doc });
    const actions = el('div', {
      className: 'ed-empty__actions',
      children: [
        button({
          label: t('editor.empty.openVideo'), icon: 'external', size: 'sm', doc,
          onClick: async () => {
            const r = await openVideo(videoId);
            emptyNote.replaceChildren(...(r?.ok ? [] : [alertBox({ tone: 'danger', text: messageFor(r?.code ?? 'PG_OPEN_FAILED'), doc })]));
          },
        }),
        button({ label: t('common.nav.library'), variant: 'ghost', size: 'sm', onClick: () => { win?.location.assign(libraryHref(`#v=${videoId}`)); }, doc }),
      ],
      doc,
    });
    // النص يقول السبب لا يكرر العنوان (كان ST_NO_RECORD بالجملة نفسها؛ تدقيق Fable، UX-13 = F2)، والخطوات بعده.
    loading.replaceWith(emptyState({
      title: t('editor.empty.title'),
      steps: [t('editor.empty.step1'), t('editor.empty.step2'), t('editor.empty.step3')], action: actions, doc,
    }));
    app.append(emptyNote);
    return null;
  }

  // ---- الحالة ----
  const S = {
    opened: bundle, slot: picked.n, info: null, prefs, langPrefs, glossaries,
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
    coverage: /** @type {ReturnType<typeof fingerprintCoverage>} */ ({ ok: false }),
    saving: false, saveDone: Promise.resolve(), pending: null, leaving: false, externalChain: Promise.resolve(),
    writing: 0, writeChain: Promise.resolve(), positionTimer: 0,
    resumeFrom: /** @type {import('../../core/model/marks.js').Position | null} */ (null),
    picks: { ...COMPLETION_DEFAULTS }, completeBusy: false, completeNumbers: /** @type {number[]} */ ([]), parts: null,
    refPreview: /** @type {string | null | undefined} */ (undefined), refRank: [], refBusy: false,
    markView: /** @type {ReturnType<typeof resolveSlotMarks> | null} */ (null),
    caret: /** @type {{ index: number, at: number, version: number } | null} */ (null),
    lastSeek: /** @type {{ ok: boolean, via: string | null, code: string | null, ms: number } | null} */ (null),
    hoverAct: /** @type {{ kind: 'merge' | 'split', index: number } | null} */ (null),
    comparison: null, compareTimer: 0, frame: 0,
  };
  const act = () => (S.view === 'original' ? S.original : S.session);
  /** نتيجة الفعل الأخير سطرًا تحت شريط الأدوات: النص يُحسب من make عند كل قراءة، فيتبع تبديل اللغة في مكانه. @param {string} tone @param {string | (() => string)} make */
  const setResult = (tone, make) => {
    S.result = { tone, get text() { return typeof make === 'function' ? make() : make; } };
  };
  const readOnly = () => S.view === 'original';
  const changes = () => S.session.changedCount || (S.session.offsetChanged ? 1 : 0);
  /** ما يضيع بالمغادرة أو التبديل: التغييرات ومسودات الزمن غير الصالحة (كانت المسودة وحدها «0 تغيير»؛ U27). */
  const pending = () => pendingSentence(changes(), S.session.draftCount);
  /** ما يضيع مسودة زمن وحدها، لا تغييرات (الفعل في العربية مذكّر مع «حقل زمن» ومؤنث مع التغييرات). */
  const draftsOnly = () => S.session.hasDrafts && !S.session.dirty;
  const mac = isMac(win);
  /** الحقل الذي ركّزه فعل بنيوي (دمج أو شطر) ولم يُكتب فيه بعد: ⌘Z الأول فيه تراجع المحرّر (U18). */
  let autoFocused = null;

  // ---- الهيكل ----
  app.replaceChildren();
  app.classList.add('ed-app');
  const backBtn = button({ label: lt('common.nav.library'), variant: 'ghost', size: 'sm', className: 'ed-back', onClick: () => goLibrary(), doc });
  backBtn.replaceChildren(editorIcon('chev-right', { doc }), el('span', { text: lt('common.nav.library'), doc })); // سهم الرجوع (يمينًا في RTL، وينعكس في LTR بالـCSS) ثم الاسم
  // العنوان بقاعدة «حرف عربي ⇒ RTL» لا أول حرف قوي (قرار سلطان، CL-002)، بمحاذاة يمين حتى الإنجليزي الخالص.
  const titleEl = el('h1', { className: 'ed-title tj-h3 tj-truncate tj-auto', doc });
  // الزوج اللغوي في رأس المحرّر (AA3، لوحة 19 البند ٢): لغة مسار الأصل ← لغة الترجمة المفتوحة. يُغيَّر من قائمة «الترجمة» في المشغّل أو من
  // الإعدادات، لا هنا، فلا تتعارض كتابته مع جلسة تحرير لم تُحفظ.
  const pairEl = el('span', { className: 'ed-pair tj-caption', attrs: { title: lt('editor.head.pairTitle') }, doc });
  const slotsEl = slotPicker({ slots: slotModels(bundle), size: 'md', ariaLabel: lt('editor.head.slots'), onSelect: (n) => switchSlot(n), doc });
  const slotNote = el('span', { className: 'ed-slot-note tj-caption', doc });
  const versionSel = el('select', { className: 'ed-select', attrs: { 'aria-label': lt('editor.head.version') }, on: { change: () => setView(versionSel.value) }, doc });
  const restoreOrigBtn = button({ label: lt('editor.head.restoreOriginal'), variant: 'ghost', size: 'sm', onClick: () => onRestoreOriginal(), doc });
  const statusBox = el('span', { className: 'ed-status', attrs: { role: 'status' }, doc });
  // أيقونتان بلا نص (اسمهما في aria-label، وما سيتراجع عنه أو يعاد في التلميح): الإعادة هي أيقونة التراجع معكوسة بـCSS.
  const undoBtn = button({ label: lt('editor.action.undo'), icon: 'undo', iconOnly: true, variant: 'ghost', size: 'sm', className: 'ed-undo', onClick: () => doUndo(), doc });
  const redoBtn = button({ label: lt('editor.action.redo'), icon: 'redo', iconOnly: true, variant: 'ghost', size: 'sm', className: 'ed-redo', onClick: () => doRedo(), doc });
  // «تصدير ▾» (§١٩.٩): الترجمة SRT، وتقرير المراجعة، والنص الدراسي؛ وكلها عبر saveFile (R65).
  const exportMenu = createMenu({
    label: lt('editor.action.export'), chevron: true, doc,
    items: [
      { id: 'srt', label: lt('editor.export.srt'), hint: lt('editor.export.srtHint'), onSelect: () => onExport() },
      { id: 'report', label: lt('editor.export.report'), hint: lt('editor.export.reportHint'), onSelect: () => onReport() },
      { id: 'study', label: lt('editor.export.study'), hint: lt('editor.export.studyHint'), onSelect: () => onStudy() },
    ],
  });
  const exportBtn = exportMenu.root;
  const saveBtn = button({ label: lt('editor.action.save'), variant: 'primary', size: 'sm', onClick: () => save(), doc });
  // الرأس صفّان (لوحة Editor): الأول للوجهة والعنوان ثم الحالة والتراجع والتصدير والحفظ، والثاني لخانة التحرير والنسخة المعروضة
  // وسطر الخانة النشطة. تسمية «خانة التحرير» تختفي مع المحدد (ترجمة واحدة لا محدد).
  const slotLabel = el('span', { className: 'ed-head__label', text: lt('editor.head.slots'), attrs: { 'aria-hidden': 'true' }, doc });
  const slotSep = el('span', { className: 'ed-head__sep', attrs: { 'aria-hidden': 'true' }, doc });
  const headEl = el('header', {
    className: 'ed-head',
    children: [
      el('div', { className: 'ed-head__row', children: [backBtn, titleEl, ltr(videoId, { doc }), pairEl, el('span', { className: 'ed-spacer', doc }), statusBox, undoBtn, redoBtn, exportBtn, saveBtn], doc }),
      el('div', { className: 'ed-head__row ed-head__slot', children: [slotLabel, slotsEl.root, slotSep, el('span', { className: 'ed-head__label', text: lt('editor.head.version'), attrs: { 'aria-hidden': 'true' }, doc }), versionSel, restoreOrigBtn, el('span', { className: 'ed-spacer', doc }), slotNote], doc }),
    ],
    doc,
  });

  // مقطّعة النطاق بنمط مجموعة الخيارات (WAI-ARIA Radio Group): المختار وحده في ترتيب Tab، والأسهم بين المتاح منها (الأيسر إلى
  // التالي في RTL، والأيمن في LTR) تختار وتركّز، وHome وEnd إلى الطرفين (تدقيق 7a66f91، U26).
  const scopeBtns = /** @type {const} */ (['cue', 'selection', 'all']).map((kind) => el('button', {
    className: 'ed-seg__opt', attrs: { type: 'button', role: 'radio', 'data-scope': kind },
    on: { click: (e) => { if (e.currentTarget.getAttribute('aria-disabled') !== 'true') setScope(kind); }, keydown: (e) => onScopeKey(e) },
    doc,
  }));
  function onScopeKey(e) {
    const at = scopeBtns.indexOf(e.currentTarget ?? e.target);
    const open = scopeBtns.filter((b) => b.getAttribute('aria-disabled') !== 'true');
    if (at === -1 || !open.length) return;
    const k = open.indexOf(scopeBtns[at]);
    const last = open.length - 1;
    const [next, prev] = getDir() === 'rtl' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowRight', 'ArrowLeft'];
    const to = {
      [next]: k >= last ? 0 : k + 1, ArrowDown: k >= last ? 0 : k + 1, [prev]: k <= 0 ? last : k - 1, ArrowUp: k <= 0 ? last : k - 1, Home: 0, End: last,
    }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    setScope(open[to].dataset.scope);
    open[to].focus();
  }
  const hover = (b, sign) => {
    const on = () => { S.hoverDelta = sign * S.stepMs; renderToolbar(); };
    const off = () => { S.hoverDelta = 0; renderToolbar(); };
    for (const t of ['mouseenter', 'focus']) b.addEventListener(t, on);
    for (const t of ['mouseleave', 'blur']) b.addEventListener(t, off);
    return b;
  };
  const minusBtn = hover(button({ label: '−', size: 'sm', onClick: () => applyShift(scopeObj(), -S.stepMs, currentTarget()), doc }), -1);
  const plusBtn = hover(button({ label: '+', size: 'sm', onClick: () => applyShift(scopeObj(), S.stepMs, currentTarget()), doc }), 1);
  const stepSel = el('select', { className: 'ed-select', attrs: { 'aria-label': lt('editor.toolbar.stepAria') }, on: { change: () => { S.stepMs = Number(stepSel.value); renderToolbar(); S.list.refresh(null); } }, doc });
  for (const ms of [...new Set([...STEPS, S.stepMs])].sort((a, b) => a - b)) stepSel.append(el('option', { text: lt('editor.toolbar.stepOption', () => ({ sec: seconds(ms) })), attrs: { value: String(ms) }, doc }));
  stepSel.value = String(S.stepMs);
  const amountIn = el('input', {
    className: 'ed-amount', dir: 'ltr',
    attrs: { type: 'text', placeholder: '+0.5', autocomplete: 'off', spellcheck: 'false', 'aria-label': lt('editor.toolbar.amountAria') },
    on: { input: () => renderToolbar(), keydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); applyAmount(); } } },
    doc,
  });
  const applyBtn = button({ label: lt('editor.action.apply'), size: 'sm', onClick: () => applyAmount(), doc });
  const enToggle = el('input', { attrs: { type: 'checkbox', id: 'ed-show-en' }, on: { change: () => setShowEnglish(enToggle.checked) }, doc });
  const previewEl = el('p', { className: 'ed-preview', doc });
  const noticeEl = el('p', { className: 'ed-notice', attrs: { role: 'alert' }, doc });
  const resultEl = el('p', { className: 'ed-result', attrs: { role: 'status', 'aria-live': 'polite' }, doc });
  // طي النطاق والتوقيت (الأزرار ± وسطر الإزاحة) واللوحة الجانبية في النوافذ القصيرة أو الضيقة: الزرّان ظاهران هناك وحدها (CSS)،
  // والمطوي مطويّ حتى يفتحه المستخدم، فتبقى للقائمة صفوف قابلة للتحرير (تدقيق 7a66f91، U16 وقرار Q17).
  const foldBtn = (kind, label, controls) => {
    const b = button({ label, icon: 'chevron', size: 'sm', variant: 'ghost', iconOnly: kind === 'side', className: `ed-fold ed-fold--${kind}`, onClick: () => setFold(kind), doc });
    b.setAttribute('aria-expanded', 'false');
    b.setAttribute('aria-controls', controls);
    if (kind === 'tools') b.append(b.querySelector('svg')); // السهم بعد الاسم كقوائم الشريط
    return b;
  };
  const toolsBtn = foldBtn('tools', lt('editor.toolbar.tools'), 'ed-scope-row ed-offset');
  const sideBtn = foldBtn('side', lt('editor.side.aria'), 'ed-pane-review ed-pane-complete');
  const search = createSearch({
    doc, extra: toolsBtn,
    cues: () => {
      const s = act();
      return Array.from({ length: s.count }, (_, i) => s.cueAt(i));
    },
    english: () => (S.view === 'original' ? S.refsOriginal : S.refs),
    readOnly: () => (readOnly() ? messageFor('ED_READ_ONLY') : null),
    active: () => S.activeIndex,
    onChange: () => S.list?.refresh(null),
    reveal: (index, match, { focus, field }) => revealMatch(index, match, { focus, field }),
    replace: (matches, replacement, only) => {
      let r;
      try {
        r = S.session.replaceMatches(matches, replacement, { only });
      } catch {
        // تغيّرت المقاطع بعد البحث فلم تعد المواضع صالحة: لا استبدال، والبحث يُعاد.
        setResult('danger', () => t('editor.search.changed'));
        renderToolbar();
        return { ok: false, count: 0 };
      }
      setResult(r.count ? 'success' : 'info', () => (r.count ? t('editor.search.replaced', { count: formatCount(r.count, COUNT_FORMS.cue, { case: 'gen' }) }) : t('editor.search.noChange')));
      renderToolbar();
      return r;
    },
  });
  const timingMenu = createMenu({
    label: lt('editor.toolbar.timingTools'), chevron: true, align: 'start', doc,
    items: [{ id: 'drift', label: lt('editor.drift.menu'), hint: lt('editor.drift.menuHint'), onSelect: () => onDrift() }],
  });
  const toolbarEl = el('section', {
    className: 'ed-toolbar', attrs: { 'aria-label': lt('editor.toolbar.aria') },
    children: [
      search.root,
      el('div', {
        className: 'ed-toolbar__row ed-scope-row', attrs: { id: 'ed-scope-row' },
        children: [
          el('span', { className: 'tj-label', text: lt('editor.scope.label'), doc }),
          el('div', { className: 'ed-seg', attrs: { role: 'radiogroup', 'aria-label': lt('editor.scope.aria') }, children: scopeBtns, doc }),
          el('span', { className: 'ed-group', children: [minusBtn, el('span', { className: 'tj-caption', text: lt('editor.toolbar.step'), doc }), stepSel, plusBtn], doc }),
          el('span', { className: 'ed-group', children: [amountIn, applyBtn], doc }),
          timingMenu.root,
          el('label', { className: 'ed-group ed-toggle', attrs: { for: 'ed-show-en' }, children: [enToggle, el('span', { text: lt('editor.toolbar.showRef'), doc })], doc }),
        ],
        doc,
      }),
      previewEl, noticeEl, resultEl,
    ],
    doc,
  });

  const offsetText = el('p', { className: 'ed-offset__text tj-label', doc });
  const offsetSub = el('p', { className: 'tj-caption', doc });
  const commitBtn = button({ label: lt('editor.offset.commit'), size: 'sm', onClick: () => onCommit(), doc });
  const offsetEl = el('section', {
    className: 'ed-offset', attrs: { id: 'ed-offset', 'aria-label': lt('editor.offset.aria') },
    children: [editorIcon('info', { doc }), el('div', { className: 'ed-offset__body', children: [offsetText, offsetSub], doc }), commitBtn],
    doc,
  });

  const bannerEl = el('div', { className: 'ed-banner', doc });
  const issuesEl = el('section', { className: 'ed-panel', attrs: { 'aria-label': lt('editor.issues.title') }, doc });
  const compareEl = el('section', { className: 'ed-panel', attrs: { 'aria-label': lt('editor.cmp.title') }, doc });
  const densityEl = el('section', { className: 'ed-panel', attrs: { 'aria-label': lt('editor.density.title') }, doc });
  const refEl = el('section', { className: 'ed-panel', attrs: { 'aria-label': lt('editor.ref.title') }, doc });
  const marksEl = el('section', { className: 'ed-panel', attrs: { 'aria-label': lt('editor.marks.title') }, doc });
  const resumeEl = el('section', { className: 'ed-panel', attrs: { 'aria-label': lt('editor.resume.title') }, doc });
  const completeEl = el('section', { className: 'ed-panel', attrs: { 'aria-label': lt('editor.complete.title') }, doc });
  // اللوحة الجانبية بتبويبين (§١٩.٩): «المراجعة» (الفحص الآلي ثم العلامات وآخر موضع) و«الاستكمال».
  const sideTabs = [['review', t('editor.tabs.review')], ['complete', t('editor.complete.title')]].map(([id, label]) => el('button', {
    className: 'ed-tab', text: label, attrs: { type: 'button', role: 'tab', id: `ed-tab-${id}`, 'aria-controls': `ed-pane-${id}`, 'data-tab': id },
    // اختيار تبويب يفتح اللوحة إن كانت مطوية (النوافذ الضيقة).
    on: { click: () => { setSideTab(id); setFold('side', true); } },
    doc,
  }));
  const reviewPane = el('div', {
    className: 'ed-pane', attrs: { role: 'tabpanel', id: 'ed-pane-review', 'aria-labelledby': 'ed-tab-review' },
    children: [
      el('p', { className: 'ed-pane__title tj-label', text: lt('editor.pane.auto'), doc }), issuesEl, refEl, compareEl, densityEl,
      el('p', { className: 'ed-pane__title tj-label', text: lt('editor.pane.mine'), doc }), marksEl, resumeEl,
    ],
    doc,
  });
  const completePane = el('div', { className: 'ed-pane', attrs: { role: 'tabpanel', id: 'ed-pane-complete', 'aria-labelledby': 'ed-tab-complete', hidden: '' }, children: [completeEl], doc });
  const resumeChip = button({ label: '', size: 'sm', variant: 'secondary', className: 'ed-resume-chip', onClick: () => resumeHere(), doc });
  resumeChip.hidden = true;
  const counterEl = el('span', { className: 'ed-counter tj-caption', attrs: { 'aria-live': 'off' }, doc });
  // العمود المرجعي (§١٩.٩): الإنجليزية أو ترجمة أخرى من خانات الفيديو، باختيار في رأس عموده.
  const refSel = el('select', { className: 'ed-select ed-ref-select', attrs: { 'aria-label': lt('editor.col.refAria') }, on: { change: () => setRefCol(refSel.value) }, doc });
  const listHead = el('div', {
    className: 'ed-list__head',
    children: ['', '#', lt('editor.col.start'), lt('editor.col.end'), lt('editor.col.duration'), lt('editor.col.translation'), null, ''].map((head, k) => (k === 6
      ? el('span', { className: 'ed-col-en', children: [refSel], doc })
      : el('span', { text: head, attrs: { 'aria-hidden': 'true' }, doc }))),
    doc,
  });
  const scroller = el('div', { className: 'ed-list', attrs: { role: 'list', 'aria-label': lt('editor.list.aria') }, doc });
  const unsavedText = el('p', { className: 'tj-label', doc });
  const unsavedSave = button({ label: lt('editor.action.save'), variant: 'primary', size: 'sm', onClick: () => save(), doc });
  const unsavedDiscard = button({ label: lt('editor.unsaved.discard'), variant: 'ghost', size: 'sm', onClick: () => onDiscard(), doc });
  // الشريط السفلي معكوس الألوان (لوحة Editor): معيّن ثم الجملة، وفي النهاية «تجاهل» ثم «حفظ» (الحفظ أقصى النهاية).
  const unsavedEl = el('div', { className: 'ed-unsaved', attrs: { role: 'region', 'aria-label': lt('editor.unsaved.region') }, children: [el('span', { className: 'ed-unsaved__dot', attrs: { 'aria-hidden': 'true' }, doc }), unsavedText, el('span', { className: 'ed-spacer', doc }), unsavedDiscard, unsavedSave], doc });
  // المنطقة الحية لا تخمد أبدًا: قارئ الشاشة يعلن ما يُكتب في منطقة حاضرة في شجرة الوصول، لا منطقةً تدخلها مع نصها (ت-١٤).
  const toastEl = el('div', { className: 'ed-toast', attrs: { role: 'status', 'aria-live': 'polite' }, doc });
  // الرسالة العابرة تحت الرأس عند طرفه (تحت «حفظ»)، لا فوق العنوان (ملاحظة W4 من لقطة w4-editor-saved).
  headEl.appendChild(toastEl);
  const mainEl = el('section', { className: 'ed-main', attrs: { 'aria-label': lt('editor.list.region') }, children: [el('div', { className: 'ed-main__bar', children: [resumeChip, el('span', { className: 'ed-spacer', doc }), counterEl], doc }), listHead, scroller], doc });
  const sideEl = el('aside', {
    className: 'ed-side',
    children: [
      el('div', { className: 'ed-side__bar', children: [el('div', { className: 'ed-tabs', attrs: { role: 'tablist', 'aria-label': lt('editor.side.aria') }, children: sideTabs, on: { keydown: onTabsKey }, doc }), sideBtn], doc }),
      reviewPane, completePane,
    ],
    doc,
  });
  // القائمة أولًا ثم اللوحة الجانبية: في RTL القائمة يمينًا واللوحة يسارًا (لوحة Editor)، فيطابق ترتيب التركيز الترتيب البصري.
  const bodyEl = el('div', { className: 'ed-body', children: [mainEl, sideEl], doc });
  app.append(headEl, toolbarEl, offsetEl, bannerEl, bodyEl, unsavedEl);
  // وتحت 900 تصعد اللوحة المطوية فوق القائمة، فتُنقل قبلها في الشجرة نفسها لا بـorder بصري وحده: يصل Tab وقارئ الشاشة إلى
  // تبويبيها أولًا كما تُرى (تدقيق Fable، FA-14 = UX-05، بقرار سلطان 2026-11-07؛ كان قرارًا معلّقًا في product-spec §٦.٦).
  // تُنقل اللوحة وحدها (القائمة الافتراضية بتمريرها تبقى)، ويعود التركيز إلى عنصره إن كان فيها.
  const narrowQuery = win?.matchMedia?.('(max-width: 900px)') ?? null;
  const placeSide = () => {
    const before = narrowQuery?.matches ? mainEl : null;
    if (sideEl.nextSibling === before && sideEl.parentNode === bodyEl) return;
    const focused = doc.activeElement && sideEl.contains(doc.activeElement) ? doc.activeElement : null;
    bodyEl.insertBefore(sideEl, before);
    if (focused && doc.activeElement !== focused) focused.focus?.({ preventScroll: true });
  };
  placeSide();
  narrowQuery?.addEventListener?.('change', placeSide);

  // ---- أسطر النص بالتفاف عرض العمود (تدقيق 7a66f91، I08): خط الحقل وعرض محتواه من صف مرسوم، والقياس بلوحة رسم ----
  const measureCtx = (() => {
    try {
      return doc.createElement('canvas').getContext?.('2d') ?? null;
    } catch {
      return null;
    }
  })();
  const fit = { width: 0, font: '', cache: new Map() };
  /** أسطر النص المرئية في حقله (2–4)، وبلا قياس بفواصل الأسطر وحدها. @param {string} text */
  const lines = (text) => {
    if (!measureCtx || !fit.width) return textLines(text);
    let n = fit.cache.get(text);
    if (n === undefined) {
      if (fit.cache.size > 5000) fit.cache.clear();
      n = wrappedLines(text, (str) => measureCtx.measureText(str).width, fit.width);
      fit.cache.set(text, n);
    }
    return n;
  };
  /** يقرأ عرض محتوى حقل النص وخطه من صف مرسوم؛ وإن تغيّرا أُعيدت ارتفاعات الصفوف (تغيّر الحجم أو العمود المرجعي أو الخط). */
  function refit() {
    if (!measureCtx || !S.list) return;
    const t = scroller.querySelector('[data-field="text"]');
    const cs = t && win.getComputedStyle?.(t);
    if (!cs) return;
    const width = t.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2;
    const font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    if (!(width > 0) || (width === fit.width && font === fit.font)) return;
    fit.width = width;
    fit.font = font;
    fit.cache.clear();
    measureCtx.font = font;
    const s = act();
    const report = s.issues();
    S.rows.forEach((r, k) => S.layout.setHeight(k, heightOf(r, s, report)));
    S.list.refresh(null);
  }
  let refitFrame = 0;
  const scheduleRefit = () => {
    if (!refitFrame) refitFrame = win.requestAnimationFrame(() => { refitFrame = 0; refit(); });
  };
  win.addEventListener('resize', scheduleRefit);
  doc.fonts?.ready?.then(() => scheduleRefit(), () => {});

  /** لغة العمود المرجعي (AA1): لغة المسار المستخرج، أو لغة الترجمة الأخرى المختارة مرجعًا، وإلا null فيُحسب الاتجاه من النص. */
  const refColumnLang = () => (S.refCol === 'en' ? S.englishTrack?.lang ?? null : translationLang(S.opened?.slots[S.refCol - 1]?.track));
  /** لغة الترجمة المفتوحة (AA1): لغتها المحفوظة أو رمز صريح في اسم ملفها، وإلا null «غير محددة» فلا فحص «غير مترجم». */
  const openedLang = () => translationLang(S.opened?.slots[S.slot - 1]?.track);
  const rowView = createRows(doc, () => ({
    lines,
    rows: S.rows, session: act(), report: act().issues(), refs: S.colRefs, refLang: refColumnLang(), lang: openedLang(),
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
    S.refPreview = undefined;
    S.edited = st.edited;
    rankRefs();
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
    showTitle(b.record.title);
    titleEl.title = b.record.title ?? '';
    rebuildList();
    renderAll();
    // «تابع من المقطع N» عند الفتح أو تبديل الخانة، لا بعد كل حفظ.
    if (!keepUi) renderResumeChip();
  }

  /** عنوان الفيديو المحفوظ (بياناته)، وبلا عنوان عبارة الفهرس باتجاه الواجهة. */
  function showTitle(text) {
    titleEl.textContent = text ?? t('editor.head.untitled');
    titleEl.dir = text ? textDirection(text) : getDir();
  }

  /** نص المرجع لكل مقطع في النسخة المعروضة: الإنجليزية دائمًا (للبحث فيها قراءةً)، والعمود المرجعي بحسب الاختيار. */
  function computeRefs(cues) {
    // تغطية البصمة بالمحاذاة مرة لكل بناء: نوافذ المرجع، وأرقام الاستكمال، ومواضع صفوف الناقص (GM-002، GM-005).
    const coverage = fingerprintCoverage(S.fp, cues);
    if (S.view !== 'original') S.coverage = coverage;
    const refs = englishReference(cues, S.englishTrack?.cues ?? [], S.fp, { coverage });
    if (S.view === 'original') S.refsOriginal = refs;
    else S.refs = refs;
    const other = S.refCol === 'en' ? null : S.opened.slots[S.refCol - 1].track;
    S.colRefs = other ? englishReference(cues, other.current ?? other.original, S.fp, { coverage }) : refs;
  }

  /** قائمة العمود المرجعي: الإنجليزية (إن حُفظ مسار) والخانات الممتلئة الأخرى. */
  function renderRefSelect() {
    const options = [];
    if (S.englishTrack?.cues.length) options.push(['en', refOptionLabel('en', null, S.englishTrack.lang)]);
    for (const slot of S.opened.slots) if (slot.track && slot.n !== S.slot) options.push([String(slot.n), refOptionLabel(slot.n, slot.name)]);
    if (!options.length) options.push(['en', t('editor.ref.noneSaved')]);
    const sig = `${getLocale()}|${options.map((o) => o.join(':')).join('|')}`;
    if (refSel.dataset.sig !== sig) {
      refSel.replaceChildren(...options.map(([v, label]) => el('option', { text: label, attrs: { value: v }, doc })));
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
    return rowHeight({ type: 'cue', lines: lines(s.cueAt(r.index).text), message: report.byIndex.has(r.index) });
  }

  function rebuildList() {
    const s = act();
    const cues = Array.from({ length: s.count }, (_, i) => s.cueAt(i));
    computeRefs(cues);
    S.comparison = compareNow(s, S.view === 'original' ? undefined : S.coverage);
    computeMarks();
    computeParts();
    const rows = buildRows(cues, S.comparison?.missing ?? [], { numbersOf: S.coverage?.ok ? S.coverage.numbersOf : null });
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
    scheduleRefit();
  }

  /** تقرير النسخة المعروضة بالمحاذاة (current.js): لا نقص زائف بعد إعادة ترقيم أو دمج أو شطر. */
  function compareNow(s, coverage) {
    try {
      const cues = s.snapshot();
      const cov = coverage ?? fingerprintCoverage(S.fp, cues);
      if (s === S.session) S.coverage = cov;
      return currentComparison(cues, S.fp, { driftMs: settings.thresholds.driftMs, coverage: cov, target: openedLang() });
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
      // المقارنة أُعيدت في rebuildList (العدد والترقيم تغيّرا)، فتُرسم لوحتها الآن لا بعد المؤقّت.
      renderComparisonPanel();
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
    keepFocus(issuesEl, () => renderIssues(issuesEl, { doc, report: timingOnly(report), onJump: jumpTo }));
    renderReview(report);
    renderComplete();
  }

  function saveBlockReason() {
    if (readOnly()) return t('editor.save.chooseEdited');
    if (S.external === 'removed') return messageFor('ED_RECORD_REMOVED');
    if (S.external === 'changed') return t('editor.external.changedReopen');
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
      // المحدد يعرض الخانات المحفوظة وحدها (ويختفي مع ترجمة واحدة)، فالزر برقم خانته لا بموضعه.
      const b = slotsEl.button(m.n);
      if (!b) continue;
      const label = editSlotLabel(m, { editing: m.n === S.slot });
      b.setAttribute('aria-label', label);
      b.title = m.name ? `${label} — ${m.name}` : label;
    }
    slotNote.textContent = activeSlotLine(S.slot, S.opened.active, S.info.name);
    slotLabel.hidden = slotsEl.root.hidden;
    slotSep.hidden = slotsEl.root.hidden;
  }

  function renderHeader() {
    const s = S.session;
    const dirty = s.dirty;
    const pendingWork = dirty || s.hasDrafts;
    renderSlots();
    // لغة الترجمة المحفوظة كما في المحفوظات والمشغّل («لغة غير محددة» لما حُفظ قبل 2.0.0)، لا رمز اسم الملف الذي تستعمله الفحوص.
    pairEl.textContent = pairLabel({ from: S.englishTrack?.lang ?? null, to: S.opened?.slots[S.slot - 1]?.track?.lang ?? null, translated: true }) ?? '';
    pairEl.hidden = !pairEl.textContent;
    doc.title = `${pendingWork ? '● ' : ''}${t('common.page.title', { page: t('common.nav.editor') })}`;
    // منطقة الحالة تُكتب حين يتغير نصها أو نبرتها فقط، لا مع كل ضغطة فيُعاد إعلانها (U26).
    const status = { tone: pendingWork ? 'warning' : 'success', text: saveStatus(changes(), dirty, s.draftCount) };
    const sig = `${getLocale()}|${status.tone}|${status.text}`;
    if (statusBox.dataset.sig !== sig) {
      statusBox.replaceChildren(statusPill({ ...status, doc }));
      statusBox.dataset.sig = sig;
    }
    const options = [['edit', S.edited || dirty ? t('editor.version.edited') : t('editor.version.current')]];
    if (S.edited) options.push(['original', t('editor.version.uploaded')]);
    if (versionSel.options.length !== options.length || options.some(([, label], k) => versionSel.options[k].text !== label)) {
      versionSel.replaceChildren(...options.map(([v, label]) => el('option', { text: label, attrs: { value: v }, doc })));
    }
    versionSel.value = S.view;
    setDisabled(restoreOrigBtn, S.external ? t('editor.external.changedReopen') : S.edited ? null : t('editor.version.noEdited'));
    const ro = readOnly() ? messageFor('ED_READ_ONLY') : null;
    setDisabled(undoBtn, ro ?? (s.canUndo ? null : t('editor.action.nothingToUndo')));
    undoBtn.title = undoBtn.title || t('editor.action.undoTitle', { kind: kindLabel(s.undoKind), key: keyHint('Z', { mac }) });
    setDisabled(redoBtn, ro ?? (s.canRedo ? null : t('editor.action.nothingToRedo')));
    redoBtn.title = redoBtn.title || t('editor.action.redoTitle', { kind: kindLabel(s.redoKind), key: keyHint('Z', { mac, shift: true }) });
    // «تصدير ▾» يبقى متاحًا: التقرير والنص الدراسي لا تمنعهما أخطاء التوقيت، وحوار SRT يذكر سبب منعه.
    const reason = saveBlockReason();
    for (const b of [saveBtn, unsavedSave]) {
      setDisabled(b, reason);
      if (S.saving) b.setAttribute('aria-busy', 'true');
      else b.removeAttribute('aria-busy');
    }
    if (!reason) saveBtn.title = t('editor.action.saveTitle', { key: keyHint('S', { mac }) });
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
      b.tabIndex = S.scope === kind ? 0 : -1;
      const why = ro ?? (kind === 'cue' && S.activeIndex === null ? t('editor.scope.pickCue') : kind === 'selection' && !S.selection.size ? t('editor.scope.pickSelection') : null);
      setDisabled(b, why);
    }
    const target = currentTarget();
    const step = seconds(S.stepMs);
    for (const b of [minusBtn, plusBtn, applyBtn]) setDisabled(b, ro);
    if (!ro) {
      minusBtn.title = t('editor.toolbar.earlier', { target, step });
      plusBtn.title = t('editor.toolbar.later', { target, step });
      minusBtn.setAttribute('aria-label', minusBtn.title);
      plusBtn.setAttribute('aria-label', plusBtn.title);
      const raw = amountIn.value.trim();
      const p = parseSeconds(raw);
      setDisabled(applyBtn, !raw ? t('editor.toolbar.typeAmount') : !p.ok ? messageFor('ED_SHIFT_INVALID') : p.ms === 0 ? messageFor('ED_SHIFT_ZERO') : null);
    }
    amountIn.readOnly = Boolean(ro);
    stepSel.disabled = Boolean(ro);
    const delta = S.hoverDelta || amountDelta();
    const structure = !ro && S.hoverAct ? structurePreview(S.hoverAct.kind, S.hoverAct.index) : null;
    previewEl.textContent = ro ? messageFor('ED_READ_ONLY') : structure ?? (delta ? shiftSentence(target, delta, 'before') : t('editor.toolbar.preview', { target, step }));
    const notice = ro ? 0 : S.session.shiftNotice(scopeObj());
    // التنبيه (alert) وسطر النتيجة (status) منطقتان حيّتان: يُكتبان حين يتغير نصهما فقط، فلا يُعاد إعلانهما مع كل ضغطة (U26).
    noticeEl.hidden = !notice;
    const noticeText = notice ? offsetNotice(notice) : '';
    if (noticeEl.textContent !== noticeText) noticeEl.textContent = noticeText;
    resultEl.hidden = !S.result;
    const resultClass = `ed-result${S.result ? ` ed-result--${S.result.tone}` : ''}`;
    if (resultEl.className !== resultClass) resultEl.className = resultClass;
    const resultText = S.result?.text ?? '';
    if (resultEl.textContent !== resultText) resultEl.textContent = resultText;
    enToggle.checked = S.showEnglish;
    enToggle.disabled = !S.englishTrack?.cues.length && !S.opened.slots.some((x) => x.track && x.n !== S.slot);
    enToggle.parentElement.title = enToggle.disabled ? t('editor.toolbar.noRef') : '';
  }

  function renderOffset() {
    const s = S.session;
    offsetText.textContent = offsetLine(s.offsetMs);
    offsetSub.textContent = s.offsetChanged
      ? t('editor.offset.committed', { off: offsetInline(s.baseOffsetMs) })
      : t('editor.offset.hint');
    setDisabled(commitBtn, readOnly() ? messageFor('ED_READ_ONLY') : s.offsetMs === 0 ? messageFor('ED_NO_OFFSET') : null);
  }

  function renderUnsaved() {
    const shown = S.session.dirty || S.session.hasDrafts;
    unsavedEl.hidden = !shown;
    const text = shown ? `${pending()}.` : '';
    if (unsavedText.textContent !== text) unsavedText.textContent = text;
  }

  function renderBanner() {
    if (!S.external) {
      // الأصل المستورد للقراءة فقط (لوحة EditorStates): ملاحظة بمخرجين موجودين أصلًا، الانتقال إلى «النسخة المعدّلة» وتصدير الأصل.
      // تُبنى مرة لهذه الحالة، فلا يُسقط إعادة الرسم تركيزًا على أحد زرّيها.
      if (readOnly()) {
        if (bannerEl.getAttribute('data-kind') === 'readonly' && bannerEl.getAttribute('data-locale') === getLocale()) return;
        bannerEl.setAttribute('data-kind', 'readonly');
        bannerEl.setAttribute('data-locale', getLocale());
        bannerEl.hidden = false;
        bannerEl.replaceChildren(alertBox({
          tone: 'info', title: t('editor.banner.readOnlyTitle'), text: t('editor.banner.readOnlyText'),
          action: el('div', {
            className: 'ed-group',
            children: [
              button({ label: t('editor.banner.toEdited'), variant: 'ghost', size: 'sm', onClick: () => setView('edit'), doc }),
              button({ label: t('editor.banner.exportUploaded'), variant: 'ghost', size: 'sm', onClick: () => onExport(), doc }),
            ],
            doc,
          }),
          doc,
        }));
        return;
      }
      bannerEl.removeAttribute('data-kind');
      bannerEl.replaceChildren();
      bannerEl.hidden = true;
      return;
    }
    bannerEl.removeAttribute('data-kind');
    bannerEl.hidden = false;
    const actions = el('div', {
      className: 'ed-group',
      children: [
        S.external === 'changed' && S.session.dirty ? button({ label: t('editor.banner.rescue'), variant: 'primary', size: 'sm', onClick: () => onRescue(), doc }) : null,
        S.external === 'changed' ? button({ label: t('editor.banner.reopen'), variant: 'secondary', size: 'sm', onClick: () => reopen(), doc }) : null,
        button({ label: t('editor.rescue.export'), variant: 'ghost', size: 'sm', onClick: () => onExport(), doc }),
      ],
      doc,
    });
    bannerEl.replaceChildren(S.external === 'changed'
      ? alertBox({ tone: 'warning', title: t('editor.banner.changedTitle'), text: messageFor('ED_EXTERNAL_CHANGE'), action: actions, doc })
      : alertBox({ tone: 'danger', title: t('editor.banner.removedTitle'), text: messageFor('ED_RECORD_REMOVED'), action: actions, doc }));
  }

  function renderComparisonPanel() {
    renderReferencePanel();
    keepFocus(compareEl, () => renderComparison(compareEl, {
      doc, report: S.comparison, notes: S.info.track.notes ?? [], readOnly: readOnly(),
      onRestore: () => onRestoreTiming(), onJumpN: (n) => jumpToN(n),
    }));
  }

  // ---- مرجع المقارنة (R50): الاختيار معاينة تعيد المقارنة والعمود المرجعي، والحفظ صريح ----
  const fpById = (id) => S.opened.record.fingerprints.find((f) => f.id === id) ?? null;

  /** ترتيب المراجع للخانة (الأفضل أولًا) عند الفتح وتغيّر الحزمة، لا مع كل حرف. */
  function rankRefs() {
    const fps = S.opened.record.fingerprints;
    let ranked = [];
    try {
      ranked = fps.length ? rankReferences(S.info.cues, fps) : [];
    } catch {
      ranked = fps.map((f) => ({ fingerprintId: f.id, score: 0, matched: false, why: '' }));
    }
    S.refRank = ranked.map((r) => ({ id: r.fingerprintId, score: r.score, why: r.why, label: refLabel(fpById(r.fingerprintId)) }));
  }

  function renderReferencePanel() {
    const savedId = S.info.fingerprint?.id ?? null;
    keepFocus(refEl, () => renderReference(refEl, {
      doc, options: S.refRank ?? [], savedId, shownId: S.fp?.id ?? null, preview: S.refPreview !== undefined, readOnly: readOnly() ? messageFor('ED_READ_ONLY') : null,
      busy: S.refBusy, onChoose: (id) => previewRef(id), onCommit: () => commitRef(), onCancel: () => previewRef(undefined),
    }));
  }

  /** معاينة مرجع (أو undefined للرجوع إلى المحفوظ): المقارنة والعمود المرجعي والاستكمال بها. */
  function previewRef(id) {
    const savedId = S.info.fingerprint?.id ?? null;
    S.refPreview = id === undefined || id === savedId ? undefined : id;
    S.fp = S.refPreview === undefined ? S.info.fingerprint : fpById(S.refPreview);
    S.englishTrack = pickEnglishTrack(S.opened.record.english, S.fp);
    rebuildList();
    renderAll();
  }

  /**
   * «اعتماد هذا المرجع»: كتابة واحدة للخانة بمرجعها وتقريره. التقرير وصف للملف كما رُفع (الأصل لا النسخة المعدّلة، عقد
   * data-model §١٠)، والحاضر يُشتق من النسخة الحالية (GM-013). واختيار المرجع هنا وحده منذ ح5.
   */
  async function commitRef() {
    if (S.refPreview === undefined || S.refBusy) return;
    const fp = S.fp;
    S.refBusy = true;
    renderReferencePanel();
    try {
      const report = fp ? compare(S.info.original, fp, { driftMs: settings.thresholds.driftMs, target: openedLang() }) : null;
      const comparison = report ? { ...report, notes: [...(S.info.track.notes ?? []), ...report.notes].slice(0, LIMITS.maxNotes) } : null;
      const n = S.slot;
      const b = await queue((opened) => writeReference(store, videoId, opened, n, { fingerprintId: fp?.id ?? null, comparison }, { now }));
      S.refPreview = undefined;
      afterCompanionWrite(b);
      toast(fp ? t('editor.ref.saved') : t('editor.ref.savedNone'), 'success');
    } catch (err) {
      const info = toErrorInfo(err);
      toast(t('editor.ref.saveFailed', { reason: info.message }), 'danger');
    } finally {
      S.refBusy = false;
      renderAll();
    }
  }

  // ---- إنقاذ المسودة عند التعارض (R57) ----
  async function onRescue() {
    let latest;
    try {
      latest = await store.getBundle(videoId);
    } catch (err) {
      toast(t('editor.external.readFailed', { reason: toErrorInfo(err).message }), 'danger');
      return;
    }
    if (!latest?.slots[S.slot - 1].track) {
      S.external = 'removed';
      renderAll();
      return;
    }
    const theirs = openedSlot(latest, S.slot);
    const input = {
      base: S.session.baseSnapshot(), mine: S.session.snapshot(), theirs: theirs.cues,
      offsets: { base: S.session.baseOffsetMs, mine: S.session.offsetMs, theirs: theirs.offsetMs, committed: S.session.committedMs },
    };
    const choice = await openRescueDialog({ doc, first: planRescue(input), offsets: input.offsets });
    if (choice === 'export') {
      onExport();
      return;
    }
    if (!choice) return;
    const plan = planRescue({ ...input, ...choice });
    if (!plan.ok) return;
    S.view = 'edit';
    S.opened = latest;
    S.info = theirs;
    S.edited = theirs.edited;
    S.refPreview = undefined;
    S.fp = theirs.fingerprint;
    S.englishTrack = pickEnglishTrack(latest.record.english, S.fp);
    S.original = createEditSession({ cues: theirs.original, offsetMs: theirs.offsetMs, density: densityOf(S.prefs) });
    S.external = null;
    S.session.rebaseMerged({ cues: theirs.cues, offsetMs: theirs.offsetMs }, { cues: plan.cues, offsetMs: plan.offsetMs });
    rankRefs();
    rebuildList();
    const kept = plan.kept.length;
    setResult('success', () => t('editor.rescue.done', { count: formatCount(kept, COUNT_FORMS.change, { case: 'gen' }) }));
    renderAll();
  }

  // ---- تقرير المراجعة والنص الدراسي (R58) ----
  async function onReport() {
    const file = await openReportDialog({
      doc,
      build: ({ auto, marks, includeText, format }) => {
        const items = reviewItems({
          cues: shownCues(), issues: act().issues(), comparison: S.comparison, fingerprint: S.fp, marks: S.markView,
          english: S.view === 'original' ? S.refsOriginal : S.refs, includeText, include: { auto, marks }, target: openedLang(),
        });
        return { count: items.length, file: items.length ? buildReviewReport({ videoId, title: S.opened.record.title, items, includeText, format, lang: openedLang() }) : null };
      },
    });
    if (file) await saveText(file);
  }

  async function onStudy() {
    const english = S.englishTrack?.cues ?? [];
    const file = await openStudyDialog({
      doc, hasEnglish: english.length > 0,
      build: ({ bilingual, format }) => {
        // روابط التوقيت حيث يظهر المقطع في الفيديو (المحفوظ + إزاحة العرض)، والإنجليزي بالإزاحة نفسها فيُوزَّع بمنتصف زمنه على
        // المرجع الزمني للفقرات (تدقيق 7a66f91، U30). أخطاء التوقيت لا تمنع النص الدراسي (GM-026.4): ما وقع قبل الصفر وحده رابطه
        // من بداية الفيديو ويُذكر في الحوار، وبقية المقاطع بإزاحتها.
        const timed = studyTiming(act().snapshot(), S.view === 'original' ? 0 : S.session.offsetMs, bilingual ? english : null);
        return { file: buildStudyText({ videoId, title: S.opened.record.title, cues: timed.cues, english: timed.english, format, bilingual, lang: openedLang(), sourceLang: S.englishTrack?.lang ?? null }), note: studyTimingNote(timed.clamped) };
      },
    });
    if (file) await saveText(file);
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
    counterEl.textContent = t('editor.counter', { n, total: s.count });
  }

  /** مؤقت زوال الرسالة الحالية: يُمسك ما دام المؤشر فوقها أو التركيز فيها (WCAG 2.2.1)، كالرسالة المشتركة src/ui/toast.js (U-042). */
  let toastHold = null;
  /** العنصر الذي كان عليه التركيز قبل انتقاله إلى الرسالة: وجهته حين تزول وهو فيها (WCAG 2.4.3). */
  let toastReturn = null;
  onHold(toastEl, (why, on) => toastHold?.hold(why, on));
  toastEl.addEventListener('focusin', (e) => {
    if (e.relatedTarget && !toastEl.contains(e.relatedTarget)) toastReturn = e.relatedTarget;
  });
  /** رسالة عابرة تحت الرأس، و«تراجع» اختياري لما يمس شيئًا محفوظًا (§١٩.١) بمهلة أطول. */
  function toast(text, tone = 'success', { action } = {}) {
    const undo = action ? button({
      label: action.label, size: 'sm', variant: 'ghost', className: 'ed-toast__action',
      onClick: () => {
        hideToast();
        action.onClick();
      },
      doc,
    }) : null;
    toastEl.replaceChildren(...[el('span', { text, doc }), undo].filter(Boolean));
    toastEl.className = `ed-toast ed-toast--${tone}${undo ? ' ed-toast--action' : ''} is-shown`;
    toastHold?.cancel();
    // الخطأ ضعف المدة كالرسالة المشتركة src/ui/toast.js (ت-١٤)، و«تراجع» أطول.
    toastHold = holdTimer({ ms: (tone === 'danger' ? 2 : 1) * (undo ? 7000 : TOAST_MS), onExpire: hideToast, setTimer: (fn, ms) => win.setTimeout(fn, ms), clearTimer: (id) => win.clearTimeout(id) });
    toastHold.arm();
  }

  /**
   * المخفية: محتواها خامد (inert)، فزر «تراجع» خارج ترتيب Tab وشجرة الوصول ولا يُفعَّل وهو غير مرئي (U21)، ولا يُقرأ نصها القديم.
   * والمنطقة الحية نفسها لا تخمد (ت-١٤)، والرسالة التالية تستبدل المحتوى كله.
   */
  function hideToast() {
    toastHold?.cancel();
    toastHold = null;
    // التركيز في الرسالة (زر «تراجع» أو غيره): ينتقل قبل أن تخمد إلى ما كان عليه، وإلا إلى القائمة، فلا يسقط إلى body (U-042).
    if (toastEl.contains(doc.activeElement)) {
      const back = toastReturn?.isConnected && !toastReturn.hasAttribute('disabled') ? toastReturn : scroller.querySelector('textarea, button, [tabindex]');
      back?.focus?.();
    }
    toastReturn = null;
    toastEl.classList.remove('is-shown');
    for (const child of toastEl.children) child.setAttribute('inert', '');
  }

  // ---- الاستكمال (R52) ----
  /** لغة الأصل الذي يُستكمل منه: مسار بصمة الترجمة المفتوحة. */
  const patchSource = () => S.opened.record.english.find((track) => track.key === S.fp?.trackKey)?.lang ?? null;
  /**
   * المصطلحات المرفقة بتعليمات الاستكمال لزوجه (الفكرة ٨، ح-47): قائمة الزوج تحت رأس بلغتيه، و«أي لغة ← إلى» والقاموس العام تحت
   * الرأس المحايد، وحتى 100 للمجموع. وعددها في لوحة الاستكمال هو ما يُرفق فعلًا.
   */
  const glossary = () => termsFor(S.prefs, S.glossaries, { source: patchSource(), target: patchTarget() });
  /**
   * اللغة التي يُستكمل لها في تعليمات الاستكمال: لغة الترجمة، وإلا «إلى» المختارة لهذا الفيديو في نافذة الإضافة، وإلا الافتراضية في
   * الإعدادات (AA3). وتحديد لغة الترجمة نفسها من قائمة «الترجمة» في المشغّل أو من «اللغات» في الإعدادات.
   */
  const patchTarget = () => openedLang() ?? S.langPrefs?.videos?.[videoId]?.to ?? S.langPrefs?.pair?.to ?? DEFAULT_TARGET_LANG;

  function completeReason() {
    if (S.view !== 'edit') return messageFor('ED_READ_ONLY');
    if (!S.fp) return messageFor('ED_NO_REFERENCE');
    if (!S.opened.record.english.some((track) => track.key === S.fp.trackKey)) return messageFor('EX_PATCH_NO_SOURCE');
    return null;
  }

  /** حالة الأجزاء المشتقة من الترجمة الحالية (بمحاذاة، فتُحسب بعد سكون لا مع كل حرف). */
  function computeParts() {
    S.parts = S.fp?.parts && S.view === 'edit' ? partsStatus(S.fp, S.session.snapshot()) : null;
  }

  const currentCompletion = () => completionGroups({
    cues: shownCues(), comparison: S.comparison, fingerprint: S.fp, marks: S.markView, selection: S.selection,
    numbersOf: S.view === 'edit' && S.coverage?.ok ? S.coverage.numbersOf : null, target: openedLang(),
  });

  /** في الخانة المفتوحة ما يُستكمل: ناقص أو فارغ أو بلا حرف من لغة الترجمة (ف1). */
  function hasGaps() {
    if (!S.markView) return false;
    const g = currentCompletion();
    return g.missing.length + g.empty.length + g.noArabic.length > 0;
  }

  /** @param {boolean} [force] يرسم اللوحة وإن كانت مخفية (تبديل اللغة: لوحة مخفية لا تبقى بلغة قديمة) */
  function renderComplete(force = false) {
    if ((completePane.hidden && !force) || !S.markView) return;
    const groups = currentCompletion();
    S.completeNumbers = completionNumbers(groups, S.picks);
    keepFocus(completeEl, () => renderCompletePanel(completeEl, {
      doc, reason: completeReason(), groups, picks: S.picks, numbers: S.completeNumbers, parts: S.parts,
      glossaryCount: attachedCount(glossary()), readOnly: readOnly() ? messageFor('ED_READ_ONLY') : null, busy: S.completeBusy,
      onPick: (key, on) => {
        S.picks = { ...S.picks, [key]: on };
        renderComplete();
      },
      onDownload: () => downloadPatch(),
      onCopy: () => copyPatchInstructions(),
      onImport: (files) => importPatch(files),
    }));
  }

  async function downloadPatch() {
    if (completeReason() || S.completeBusy) return;
    // لا يهرب خطأ من الزر بلا رسالة (تدقيق 7a66f91، U79): الرفض برمزه ومعاملاته، وغير المتوقع برسالته.
    let pkg;
    try {
      pkg = buildPatchPackage({
        videoId, title: S.opened.record.title, fingerprint: S.fp, englishTracks: S.opened.record.english, numbers: S.completeNumbers, glossary: glossary(),
        target: patchTarget(),
      });
    } catch (err) {
      toast(toErrorInfo(err).message, 'danger');
      return;
    }
    if (!pkg.ok) {
      toast(messageFor(pkg.code, pkg.params), 'danger');
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
      const source = patchSource();
      const target = patchTarget();
      if (!source || !target || source === target) {
        toast(messageFor('PG_PAIR_SAME'), 'danger');
        return;
      }
      await win.navigator.clipboard.writeText(patchInstructions({ videoId, title: S.opened.record.title, glossary: glossary(), source, target }));
      toast(t('editor.complete.copied'), 'success');
    } catch {
      toast(t('editor.complete.copyFailed'), 'danger');
    }
  }

  /** «استيراد ملف تصحيح…»: قراءة على الترجمة الحالية، ثم معاينة واختيار، ثم خطوة واحدة غير محفوظة. */
  async function importPatch(files) {
    if (completeReason() || readOnly()) return;
    // الجلسة نفسها بنسختها: تبديل الخانة أثناء قراءة الملف يفتح جلسة جديدة قد تبدأ بالنسخة نفسها (CX-H7).
    const session = S.session;
    const fp = S.fp;
    const before = session.version;
    const stale = () => S.session !== session || S.fp !== fp || session.version !== before;
    const read = await readPatch(files, { fingerprint: fp, cues: session.snapshot(), target: openedLang() });
    if (!read.ok) {
      await openDialog({
        doc, tone: 'danger', title: t('editor.complete.readFailed'),
        body: `${read.error.message}${read.error.line ? ` (${t('editor.complete.line', { n: read.error.line })})` : ''}`,
        actions: [{ label: t('editor.action.ok'), value: 'ok', variant: 'primary' }],
      });
      return;
    }
    if (stale()) {
      toast(messageFor('IM_PATCH_STALE'), 'danger');
      return;
    }
    const only = await previewPatch({ doc, plan: read.plan });
    if (!only) return;
    if (stale()) {
      toast(messageFor('IM_PATCH_STALE'), 'danger');
      return;
    }
    const r = session.applyPatchPlan(read.plan, { only });
    if (!r.ok) {
      toast(messageFor(r.code), 'danger');
      return;
    }
    const { inserted: added, renumbered } = r;
    setResult('success', () => {
      const inserted = added ? ` (${t('editor.complete.inserted', { n: added })}${renumbered ? t('editor.complete.renumbered') : ''})` : '';
      return t('editor.complete.applied', { count: formatCount(only.length, COUNT_FORMS.cue, { case: 'gen' }), inserted });
    });
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
    keepFocus(densityEl, () => renderDensity(densityEl, { doc, items: groups.auto.density, maxCps: limits.maxCps, maxLineChars: READING_DEFAULTS.maxLineChars, onJump: (i) => jumpTo(i, 'text') }));
    keepFocus(marksEl, () => renderMarks(marksEl, { doc, marks: groups.marks, readOnly: readOnly(), onJump: (i) => jumpTo(i, 'text'), onRemoveOrphans: () => removeOrphans() }));
    keepFocus(resumeEl, () => renderResume(resumeEl, { doc, items: resumeItems(), onResume: (n) => resumeSlot(n) }));
    for (const tab of sideTabs) tab.textContent = tab.dataset.tab === 'review' ? `${t('editor.tabs.review')}${groups.counts.todo ? ` (${groups.counts.todo})` : ''}` : t('editor.complete.title');
  }

  /**
   * التبويبات بلوحة المفاتيح (نمط WAI-ARIA Tabs): التبويب المختار وحده في ترتيب Tab، والأسهم بين التبويبات (الصفحة RTL: الأيسر
   * إلى التالي، وفي LTR الأيمن)، وHome وEnd إلى الطرفين؛ والتنقل يختار التبويب ويركّزه. كان «الاستكمال» بـtabIndex=-1 بلا أسهم فلا يُبلَغ
   * بلوحة المفاتيح (تدقيق 5fedcb9، GM-008).
   */
  function onTabsKey(e) {
    const at = sideTabs.indexOf(doc.activeElement);
    if (at === -1) return;
    const last = sideTabs.length - 1;
    const [next, prev] = getDir() === 'rtl' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowRight', 'ArrowLeft'];
    const to = { [next]: at === last ? 0 : at + 1, [prev]: at === 0 ? last : at - 1, Home: 0, End: last }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    setSideTab(sideTabs[to].dataset.tab);
    setFold('side', true);
    sideTabs[to].focus();
  }

  /**
   * طي النطاق والتوقيت أو اللوحة الجانبية وفتحهما (U16). الطي أثره في النوافذ القصيرة أو الضيقة وحدها (CSS)، والزر مخفي في
   * غيرها. وطيّ ما فيه التركيز يعيد التركيز إلى زره فلا يسقط.
   * @param {'tools' | 'side'} kind @param {boolean} [open]
   */
  /** تلميح زر الطي بحسب حالته. @param {'tools' | 'side'} kind @param {boolean} open */
  const foldTitle = (kind, open) => t(`editor.fold.${kind}${open ? 'Close' : 'Open'}`);
  /** حالة ما طُوي أو فُتح بفعل صريح (لإعادة كتابة تلميحه عند تبديل اللغة دون المساس بالتركيز). @type {Map<'tools' | 'side', boolean>} */
  const foldOpen = new Map();

  function setFold(kind, open) {
    const cls = kind === 'tools' ? 'ed-tools-open' : 'ed-side-open';
    const btn = kind === 'tools' ? toolsBtn : sideBtn;
    const next = open ?? !app.classList.contains(cls);
    app.classList.toggle(cls, next);
    btn.setAttribute('aria-expanded', String(next));
    scheduleRefit(); // عرض عمود النص قد يتغيّر بالطي
    foldOpen.set(kind, next);
    btn.title = foldTitle(kind, next);
    const area = kind === 'tools' ? [toolbarEl.querySelector('#ed-scope-row'), offsetEl] : [reviewPane, completePane];
    if (!next && area.some((a) => a?.contains(doc.activeElement))) btn.focus();
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

  /**
   * بعد كتابة آخر موضع (مؤقّت السكون أو المغادرة): الحزمة الناتجة هي المفتوحة، ولا يُعاد إلا قسم «آخر موضع». فلا تُهدم اللوحة
   * الجانبية ولا يسقط تركيز أو قائمة مفتوحة فيها كل بضع ثوانٍ (تدقيق 5fedcb9، GM-014.3).
   */
  function afterPositionWrite(b, slot) {
    S.opened = b;
    if (S.slot !== slot) return;
    S.info = openedSlot(b, S.slot);
    keepFocus(resumeEl, () => renderResume(resumeEl, { doc, items: resumeItems(), onResume: (n) => resumeSlot(n) }));
  }

  async function writeMarkPlan(plan, message, { undoable = true } = {}) {
    try {
      const b = await queue((opened) => writeMarks(store, videoId, opened, S.slot, plan, { now }));
      afterCompanionWrite(b);
      toast(message, 'success', undoable ? { action: { label: t('editor.action.undo'), onClick: () => writeMarkPlan({ remove: plan.add, add: plan.remove }, t('editor.marks.restored'), { undoable: false }) } } : {});
    } catch (err) {
      const info = toErrorInfo(err);
      toast(info.code === 'ST_CONFLICT' ? t('editor.marks.conflict') : `${messageFor('ED_MARK_FAILED')} (${info.code})`, 'danger');
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
    // علامتان على مقطع واحد (بعد دمج؛ U100): الإزالة تزيلهما معًا وتقول ذلك.
    const many = plan.remove.length > 1 ? t('editor.marks.many', { count: formatCount(plan.remove.length, COUNT.mark) }) : '';
    writeMarkPlan(plan, kind ? t('editor.marks.toggled', { n, label: MARK_LABEL[kind], many }) : plan.remove.length > 1 ? t('editor.marks.removedMany', { count: formatCount(plan.remove.length, COUNT.mark), n }) : t('editor.marks.removedOne', { n }));
  }

  function removeOrphans() {
    if (readOnly() || !S.markView.orphans.length) return;
    writeMarkPlan({ remove: S.markView.orphans, add: [] }, t('editor.marks.orphansRemoved', { n: S.markView.orphans.length, count: formatCount(S.markView.orphans.length, COUNT.mark) }));
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
    if (n !== S.slot) switchSlot(n, { resume: true });
    else resumeHere();
  }

  /**
   * «تابع من المقطع 312»: القفز إلى الموضع الذي وُجد عند فتح الخانة (S.resumeFrom)، لا إلى ما كُتب بعده في الجلسة نفسها
   * (تنقّل البحث مثلًا)، فلا تضيع نقطة المتابعة الحقيقية.
   */
  function resumeHere() {
    resumeChip.hidden = true;
    const i = resolvePosition(S.resumeFrom, shownCues());
    if (i !== null) jumpTo(i, 'text');
  }

  function renderResumeChip() {
    S.resumeFrom = S.info.position;
    const i = S.resumeFrom ? resolvePosition(S.resumeFrom, shownCues()) : null;
    resumeChip.hidden = i === null;
    labelResumeChip();
  }

  /** نص زر «تابع من المقطع N» من نقطة المتابعة المحفوظة عند الفتح (S.resumeFrom)، دون تغييرها. */
  function labelResumeChip() {
    const i = S.resumeFrom ? resolvePosition(S.resumeFrom, shownCues()) : null;
    if (i !== null) resumeChip.firstChild.textContent = t('editor.resume.from', { n: act().cueAt(i).n });
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
      .then((b) => afterPositionWrite(b, slot))
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
    scheduleRefit();
  }

  /** @param {number | null} i @param {{ track?: boolean }} [o] track=false لتنقّل برمجي (نتائج البحث) لا يُكتب موضعًا */
  function setActive(i, { track = true } = {}) {
    if (S.activeIndex === i) return;
    const prev = S.activeIndex;
    S.activeIndex = i;
    S.list.refresh([prev, i].filter((x) => x !== null).map((x) => S.rowOf[x]));
    renderToolbar();
    if (i !== null && track) schedulePosition();
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
    if (r.ok) setResult('success', () => shiftSentence(target, delta, 'after'));
    else setResult('danger', () => messageFor(r.code, r.negative ? { list: numberList(r.negative) } : undefined));
    renderToolbar();
  }

  function applyAmount() {
    if (readOnly()) return;
    const p = parseSeconds(amountIn.value);
    if (!p.ok || p.ms === 0) {
      setResult('danger', () => messageFor(p.ok ? 'ED_SHIFT_ZERO' : 'ED_SHIFT_INVALID'));
      renderToolbar();
      return;
    }
    applyShift(scopeObj(), p.ms, currentTarget());
  }

  function onCommit() {
    if (readOnly()) return;
    const was = S.session.offsetMs;
    const r = S.session.commitOffset();
    if (r.ok) setResult('success', () => t('editor.offset.done', { off: offsetInline(was), count: formatCount(r.count, COUNT_FORMS.cue) }));
    else setResult('danger', () => messageFor(r.code, r.negative ? { list: numberList(r.negative) } : undefined));
    renderAll();
  }

  function doUndo() {
    if (readOnly()) return;
    const r = S.session.undo();
    if (r.ok) setResult('info', () => t('editor.action.undone', { kind: kindLabel(r.kind) }));
    scheduleChrome();
  }

  function doRedo() {
    if (readOnly()) return;
    const r = S.session.redo();
    if (r.ok) setResult('info', () => t('editor.action.redone', { kind: kindLabel(r.kind) }));
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
      if (at === null) return t('editor.structure.putCaret', { n: s.cueAt(i).n });
      const [head, tail] = splitCue([s.cueAt(i)], 0, at);
      return splitPreview(s.cueAt(i).n, head.text, tail.text);
    } catch (err) {
      return toErrorInfo(err).message;
    }
  }

  function afterStructure(i, text) {
    S.caret = null;
    S.hoverAct = null;
    setResult('success', text);
    jumpTo(Math.min(i, act().count - 1), 'text');
    // التركيز نُقل برمجيًا إلى نص لم يكتب فيه المستخدم: ⌘Z الأول فيه يتراجع عن الدمج أو الشطر كما تعد الرسالة (U18).
    const f = doc.activeElement;
    autoFocused = f?.dataset?.field === 'text' ? f : null;
    renderToolbar();
  }

  function onMerge(i) {
    if (readOnly()) return;
    const [a, b] = [S.session.cueAt(i), S.session.cueAt(i + 1)];
    const r = S.session.merge(i);
    if (r.ok) afterStructure(i, () => t('editor.structure.merged', { a: a.n, b: b.n }));
    else {
      setResult('danger', () => messageFor(r.code));
      renderToolbar();
    }
  }

  function onSplit(i) {
    if (readOnly()) return;
    const at = caretOf(i);
    const n = S.session.cueAt(i).n;
    if (at === null) {
      setResult('info', () => t('editor.structure.putCaretAgain', { n }));
      jumpTo(i, 'text');
      renderToolbar();
      return;
    }
    const r = S.session.split(i, at);
    if (r.ok) afterStructure(i, () => t('editor.structure.splitDone', { n }));
    else {
      setResult('danger', () => messageFor(r.code));
      renderToolbar();
    }
  }

  /** «▶ في الفيديو»: زمن المقطع كما يظهر (المحفوظ + إزاحة العرض) في تبويب الفيديو المفتوح أو تبويب جديد. */
  async function onSeek(i) {
    const cue = act().cueAt(i);
    // إزاحة النسخة المعروضة نفسها التي يذكرها تلميح «▶ في الفيديو» (GM-027.3).
    const ms = Math.max(0, cue.startMs + act().offsetMs);
    setActive(i);
    const r = await seek({ videoId, ms });
    S.lastSeek = { ok: r.ok, via: r.via ?? null, code: r.code ?? null, ms };
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
    if (r.ok) setResult(r.count ? 'success' : 'info', () => (r.count ? t('editor.drift.done', { count: formatCount(r.count, COUNT_FORMS.cue) }) : t('editor.drift.unchanged')));
    else setResult('danger', () => messageFor(r.code, r.negative ? { list: numberList(r.negative) } : undefined));
    renderToolbar();
  }

  /** نتيجة بحث: الصف ظاهر ومميز، والمطابقة محددة في نصه حين يُطلب التركيز (أزرار ↑↓). */
  function revealMatch(index, match, { focus, field }) {
    if (index < 0 || index >= act().count) return;
    // عرض نتيجة لا يُعدّ موضع عمل؛ والتركيز في نصها (↑↓) يكتبه عبر focusin كأي تركيز من المستخدم.
    setActive(index, { track: false });
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
    commitFocusedTime();
    const why = saveBlockReason();
    if (why) {
      // الزر المعطّل لا يصل إلى هنا؛ هذا ⌘S، فيُذكر السبب بدل صمت.
      toast(why, 'info');
      return;
    }
    S.saving = true;
    let done;
    S.saveDone = new Promise((r) => { done = r; });
    renderHeader();
    const session = S.session;
    const at = session.version;
    const shape = session.checkpoint();
    try {
      const n = S.slot;
      const edit = {
        cues: session.snapshot(), offsetChanged: session.offsetChanged, offsetMs: session.offsetMs,
        reanchorFrom: session.reshaped ? null : session.baseSnapshot(),
      };
      const saved = await queue((opened) => saveSlot(store, videoId, opened, n, edit, { now }));
      // زمن كُتب في حقل مركّز أثناء الحفظ (change لا يُطلق قبل المغادرة): يُعتمد الآن، فيُعدّ كتابةً بعد اللقطة لا يطمسها
      // إعادة رسم ما حُفظ (تدقيق 7a66f91، U73).
      if (S.session === session) commitFocusedTime();
      S.result = null;
      if (S.session !== session) {
        // فُتحت جلسة أخرى أثناء الانتظار (تبديل خانة مثلًا): المحفوظ للخانة القديمة، فلا يُفتح فوق الجلسة الجديدة ومسودتها؛
        // يصبح الأحدث أساسها إن لم يمس محتواها، وإلا قرّر الفحص (تدقيق 5fedcb9، CX-002).
        if (!slotContentChanged(S.opened, saved, S.slot)) adopt(saved);
        else recheck();
      } else if (session.version !== at) {
        // كتب المستخدم أثناء الحفظ: المحفوظ يصبح الأساس وما كُتب بعده يبقى غير محفوظ، فلا يُكتب فوق الحقل.
        S.opened = saved;
        S.info = openedSlot(saved, n);
        S.edited = S.info.edited;
        session.markSaved({ cues: S.info.cues, offsetMs: S.info.offsetMs }, shape);
      } else load(saved, n, { keepUi: true });
      toast(t('editor.save.done'), 'success');
    } catch (err) {
      const info = toErrorInfo(err);
      if (info.code === 'ST_CONFLICT') {
        // الرفض قد يكون من تغيّر لا يمس محتوى الخانة (حدث لم يُعالَج بعد): يُعاد الفحص فيُتبنّى الأحدث أو تظهر اللافتة.
        await recheck();
        toast(S.external ? t('editor.save.failed', { reason: info.message }) : t('editor.save.retry'), S.external ? 'danger' : 'info');
      } else toast(t('editor.save.failed', { reason: info.message }), 'danger');
    } finally {
      S.saving = false;
      done();
      flushPending();
      renderAll();
    }
  }

  /**
   * زمن مكتوب في حقل لم يُغادَر بعد (change لا يُطلق إلا بالمغادرة أو Enter): يُعتمد قبل الحفظ والمغادرة والتبديل والتغيّر
   * الخارجي، فلا يضيع بـ⌘S ولا يطمسه تحديث الصفوف (تدقيق 5fedcb9، GM-007).
   */
  function commitFocusedTime() {
    const t = doc.activeElement;
    const field = t?.dataset?.field;
    if ((field !== 'start' && field !== 'end') || readOnly() || !S.session) return;
    const node = rowOfNode(t);
    if (!node) return;
    const i = Number(node.dataset.index);
    const cue = S.session.cueAt(i);
    const shown = S.session.draftAt(i, field) ?? formatTimecode(field === 'start' ? cue.startMs : cue.endMs);
    if (t.value !== shown) commitTime(i, field, t.value);
  }

  function flushPending() {
    const p = S.pending;
    S.pending = null;
    if (p) handleExternal(p);
  }

  async function reopen() {
    if ((S.session.dirty || S.session.hasDrafts) && !(await confirmLeave(doc, t('editor.reopen.body', { pending: pending(), drafts: draftsOnly() })))) return;
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
    recheck();
  }

  /**
   * يقرأ أحدث حزمة ويقرّر: تغيّرٌ لا يمس محتوى خانة التحرير (علامة من المشغّل، أو خانة أخرى، أو النشطة) يُتبنّى دون تعارض،
   * وتغيّر محتواها لافتة إن كانت تعديلات وإلا إعادة فتح، وغيابها «حُذفت». وتعذّر القراءة لا يُحسب حذفًا: تبقى الحالة.
   * @returns {Promise<void>}
   */
  function recheck() {
    S.externalChain = S.externalChain.then(async () => {
      commitFocusedTime();
      let latest;
      try {
        latest = await store.getBundle(videoId);
      } catch (err) {
        toast(t('editor.external.readFailed', { reason: toErrorInfo(err).message }), 'danger');
        return;
      }
      const kind = latest?.slots[S.slot - 1].track ? slotChange(S.opened, latest, S.slot) : 'removed';
      if (kind === 'removed') S.external = 'removed';
      else if (kind === 'none' || (kind === 'offset' && S.session.adoptOffset(latest.slots[S.slot - 1].offsetMs))) {
        // إزاحة غيّرها المشغّل والمحرّر لم يغيّرها: تُتبنّى دون تعارض، فيبقى الحفظ والتراجع (GM-014.2).
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
    return S.externalChain;
  }

  /** حزمة أحدث لم يتغير فيها محتوى خانة التحرير: تصبح المفتوحة (فيقبل الحفظ)، وتُحدَّث العلامات والمرجع والخانات. */
  function adopt(latest) {
    const prevFp = S.fp?.id ?? null;
    const prevLang = openedLang();
    S.opened = latest;
    S.info = openedSlot(latest, S.slot);
    // المحتوى المفتوح صار مطابقًا للأحدث: لا تعارض قائمًا (ولو ظهرت لافتة قبله).
    S.external = null;
    rankRefs();
    if (S.refCol !== 'en' && !latest.slots[S.refCol - 1].track) S.refCol = 'en';
    if (S.refPreview === undefined && (S.info.fingerprint?.id ?? null) !== prevFp) {
      S.fp = S.info.fingerprint;
      S.englishTrack = pickEnglishTrack(latest.record.english, S.fp);
      rebuildList();
    } else computeRefs(shownCues());
    showTitle(latest.record.title);
    // العلامات والموضع من الحزمة الأحدث (علامة من المشغّل مثلًا) على الصفوف المعروضة. بلا فرض: المحتوى لم يتغير، فلا يُطمس
    // ما يُكتب في الحقل المركّز.
    computeMarks();
    // تغيّرت لغة الخانة من سياق آخر: فحص «غير مترجم» يتبعها (U-028)، فتُعاد المقارنة الحاضرة.
    if (openedLang() !== prevLang) {
      S.comparison = compareNow(act());
      computeParts();
    }
    S.list.refresh(null);
    renderAll();
  }

  /** تبديل خانة التحرير (§١٩.٩): بتغييرات غير محفوظة حوار تأكيد، ولا تتغير النشطة. resume يقفز إلى آخر موضعها بعد التبديل. */
  async function switchSlot(n, { resume = false } = {}) {
    // حفظٌ جارٍ يُنتظر أولًا: لا يُسأل المستخدم عن تغييرات يجري حفظها، ولا يصل رده بعد فتح خانة أخرى (CX-002).
    if (S.saving) await S.saveDone;
    if (n === S.slot || !S.opened.slots[n - 1]?.track) return;
    commitFocusedTime();
    if (S.session.dirty || S.session.hasDrafts) {
      const canSave = !saveBlockReason();
      // الترتيب كما في لوحة EditorStates: «حفظ ثم التبديل» الأساسي (إن أمكن الحفظ)، ثم «البقاء» (وعليه التركيز الأول)، و«التبديل دون
      // حفظ» الصريح في آخر الصف بنبرة خطر هادئة. العنوان بلون النص: الخطر في الزر لا في السؤال.
      const v = await openDialog({
        doc, title: t('editor.switch.title', { n }), focus: 'stay',
        body: t('editor.switch.body', { pending: pending(), slot: S.slot, drafts: draftsOnly() }),
        actions: [
          canSave ? { label: t('editor.switch.saveThen'), value: 'save', variant: 'primary' } : null,
          { label: t('editor.leave.stay'), value: 'stay', variant: canSave ? 'secondary' : 'primary' },
          { label: t('editor.switch.without'), value: 'switch', variant: 'ghost', className: 'ed-btn--danger-quiet' },
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
    // بعد لافتة تغيّر (أو حذف) لا تُحمَّل الخانة الأخرى من الحزمة القديمة: تُقرأ الأحدث أولًا.
    let target = S.opened;
    if (S.external) {
      try {
        target = await store.getBundle(videoId);
      } catch (err) {
        toast(t('editor.external.readFailed', { reason: toErrorInfo(err).message }), 'danger');
        return;
      }
      if (!target?.slots[n - 1]?.track) {
        toast(t('editor.switch.gone', { n }), 'danger');
        return;
      }
    } else writePositionNow();
    S.view = 'edit';
    S.result = null;
    load(target, n);
    rememberSlot(n);
    toast(t('common.slot.label', { n }), 'info');
    if (resume) resumeHere();
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
      doc, tone: 'danger', title: t('editor.discard.title'), body: t('editor.discard.body', { pending: pending(), drafts: draftsOnly() }), focus: 'cancel',
      actions: [{ label: t('editor.unsaved.discard'), value: 'discard', variant: 'danger' }, { label: t('common.cancel'), value: 'cancel' }],
    });
    if (v !== 'discard') return;
    S.session.discard();
    setResult('info', () => t('editor.discard.done'));
    renderAll();
  }

  async function onRestoreOriginal() {
    if (!S.edited || S.external) return;
    const dirty = S.session.dirty;
    // التأكيد على الحزمة التي عُرض عليها: إن أُعيد فتح أحدث خلفه (حفظ من تبويب آخر) لا يمحو التأكيدُ الحفظَ الجديد، بل يظهر
    // التعارض (تدقيق 7a66f91، U09).
    const seen = S.opened;
    const v = await openDialog({
      doc, tone: 'danger', title: t('editor.restoreOriginal.title'), focus: 'cancel',
      body: t('editor.restoreOriginal.body', { lost: dirty ? t('editor.restoreOriginal.lost', { n: changes() }) : '' }),
      actions: [{ label: t('editor.restoreOriginal.confirm'), value: 'restore', variant: 'danger' }, { label: t('common.cancel'), value: 'cancel' }],
    });
    if (v !== 'restore') return;
    S.saving = true;
    let done;
    S.saveDone = new Promise((r) => { done = r; });
    renderHeader();
    try {
      const n = S.slot;
      // كتابة سابقة من المحرّر نفسه (علامة أو موضع) لا تمس ترجمة الخانة: تُبنى الاستعادة على الحاضرة إن بقيت ترجمتها كما عُرضت.
      const sameTrack = (b) => canonical(b?.slots[n - 1]?.track ?? null) === canonical(seen?.slots[n - 1]?.track ?? null);
      const saved = await queue((opened) => restoreSlotOriginal(store, videoId, sameTrack(opened) ? opened : seen, n, { now }));
      S.view = 'edit';
      S.result = null;
      load(saved, S.slot, { keepUi: true });
      toast(messageFor('ED_ORIGINAL_RESTORED'), 'success');
    } catch (err) {
      const info = toErrorInfo(err);
      if (info.code === 'ST_CONFLICT') S.external = 'changed';
      toast(t('editor.restoreOriginal.failed', { reason: info.message }), 'danger');
    } finally {
      S.saving = false;
      done();
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
      await openDialog({ doc, title: t('editor.restoreTiming.sameTitle'), body: t('editor.restoreTiming.sameBody'), actions: [{ label: t('editor.action.ok'), value: 'ok', variant: 'primary' }] });
      return;
    }
    const span = (range) => el('td', { children: [ltr(range, { doc })], doc });
    const table = el('div', {
      className: 'ed-preview-table',
      children: [el('table', {
        children: [
          el('thead', { children: [el('tr', { children: ['#', t('editor.restoreTiming.colCurrent'), t('editor.restoreTiming.colOriginal')].map((head) => el('th', { text: head, attrs: { scope: 'col' }, doc })), doc })], doc }),
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
      }), pv.changes.length > MAX_PREVIEW_ROWS ? el('p', { className: 'tj-caption', text: t('editor.restoreTiming.more', { n: pv.changes.length - MAX_PREVIEW_ROWS }), doc }) : null],
      doc,
    });
    const v = await openDialog({
      doc, size: 'lg', title: t('editor.cmp.restoreTitle'), content: table, focus: 'cancel',
      body: t('editor.restoreTiming.body'),
      actions: [{ label: t('editor.complete.applyAll', { count: formatCount(pv.changes.length, COUNT_FORMS.cue, { case: 'gen' }) }), value: 'apply', variant: 'primary' }, { label: t('common.cancel'), value: 'cancel' }],
    });
    if (v !== 'apply') return;
    const r = S.session.restoreTiming(S.fp);
    if (r.ok) setResult('success', () => t('editor.restoreTiming.done', { count: formatCount(r.count, COUNT_FORMS.cue, { case: 'gen' }) }));
    else setResult('danger', () => messageFor(r.code));
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
        ...items.options.map(([v, label]) => el('label', {
          className: 'ed-radio',
          children: [el('input', { attrs: { type: 'radio', name, value: v, ...(v === value ? { checked: '' } : {}) }, on: { change: () => onPick(v) }, doc }), el('span', { text: label, doc })],
          doc,
        })),
      ],
      doc,
    });
    const timingBox = el('div', { doc });
    const nameLine = el('p', { className: 'tj-body-sm', doc });
    const noteLine = el('p', { className: 'tj-caption', doc });
    const errorBox = el('div', { doc });
    // ما جُرّد عند الكتابة وما يتغير عند إعادة الاستيراد، قبل التنزيل (تدقيق 7a66f91، U99).
    const notesBox = el('div', { attrs: { 'data-fid': 'exportNotes' }, doc });
    // إزاحة العرض المحفوظة للخانة للأصل (كما تصدّره المحفوظات)، وإزاحة الجلسة للنسخة الحالية. والسؤال عند إزاحة غير صفرية في
    // النسختين، فالأصل يُصدَّر بتوقيت واحد من السطحين (عقد التوقيت §٥؛ تدقيق 7a66f91، U75 وقرار Q19).
    const offsetOf = (v) => (v === 'original' ? S.original.offsetMs : offset);
    const refresh = () => {
      const s = variant === 'original' ? S.original : S.session;
      const errs = s.issues().errors;
      const off = offsetOf(variant);
      plan = errs
        ? { ok: false, code: 'ED_EXPORT_HAS_ERRORS', count: errs }
        : planArabicExport({ videoId, cues: s.snapshot(), offsetMs: off, choice, variant, lang: translationLang(S.opened?.slots[S.slot - 1]?.track) });
      timingBox.replaceChildren(...(off !== 0
        ? [radios('ed-timing', {
          legend: t('editor.export.timingLegend'),
          options: [['shown', t('editor.export.timingShown', { off: offsetInline(off) })], ['saved', t('editor.export.timingSaved')]],
        }, choice, (v) => { choice = v; refresh(); })]
        : []));
      timingBox.hidden = off === 0;
      const name = plan.ok ? plan.name : `${videoId}.ar${variant === 'original' ? '.original' : ''}.srt`;
      nameLine.replaceChildren(t('editor.export.fileName'), ltr(name, { doc }));
      noteLine.textContent = variant === 'original'
        ? (off === 0 ? t('editor.export.noteUploadedSaved') : t('editor.export.noteUploadedChoose'))
        : S.session.dirty ? t('editor.export.noteDirty', { n: changes() }) : off === 0 ? t('editor.export.noteZeroOffset') : '';
      noteLine.hidden = !noteLine.textContent;
      const why = plan.ok ? null : exportError(plan);
      errorBox.replaceChildren(...(why ? [alertBox({ tone: 'danger', title: t('editor.export.cannot'), text: why, doc })] : []));
      errorBox.hidden = !why;
      const notes = plan.ok ? plan.notes ?? [] : [];
      notesBox.replaceChildren(...notes.map((text) => alertBox({ tone: 'warning', text, doc })));
      notesBox.hidden = !notes.length;
      if (confirmBtn) setDisabled(confirmBtn, why);
    };
    const content = el('div', {
      className: 'tj-stack',
      children: [
        hasOriginal ? radios('ed-variant', { legend: t('editor.export.variantLegend'), options: [['current', t('editor.export.variantCurrent')], ['original', t('editor.export.variantUploaded')]] }, variant, (v) => { variant = v; refresh(); }) : null,
        timingBox, nameLine, noteLine, notesBox, errorBox,
      ],
      doc,
    });
    refresh();
    const v = await openDialog({
      doc, size: 'md', title: t('editor.export.title'), content, focus: 'download',
      actions: [{
        label: t('editor.export.downloadSrt'), value: 'download', variant: 'primary',
        ref: (b) => {
          confirmBtn = b;
          setDisabled(b, plan.ok ? null : exportError(plan));
        },
      }, { label: t('common.cancel'), value: 'cancel' }],
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
    commitFocusedTime();
    if ((S.session.dirty || S.session.hasDrafts) && !(await confirmLeave(doc, messageFor('ED_LEAVE_UNSAVED')))) return;
    S.leaving = true;
    // آخر موضع قبل المغادرة (لا يكتمل غالبًا في pagehide)، والصف المقصود في المحفوظات (#v=…؛ تدقيق 5fedcb9، GM-016.3).
    await writePositionNow();
    win.location.assign(new URL(`../library/index.html#v=${videoId}`, win.location.href).href);
  }

  // ---- أحداث القائمة (تفويض من الحاوية) ----
  const rowOfNode = (t) => t.closest?.('.ed-row[data-index]');
  scroller.addEventListener('input', (e) => {
    const t = e.target;
    autoFocused = null; // كتب المستخدم: الحقل حقله، و⌘Z فيه للحقل.
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
    // مغادرة الحقل الذي ركّزه دمج أو شطر تنهي استثناءه: ⌘Z بعد العودة إليه للحقل (مراجعة C3).
    if (e.target === autoFocused) autoFocused = null;
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
    // كل حقل يُكتب فيه نص (ومنه حقل البحث type=search والمحرَّر contenteditable): الاختصار للحقل، إلا نص ركّزه دمج أو شطر ولم
    // يُكتب فيه بعد (U17، U18).
    const typing = (t instanceof win.HTMLTextAreaElement || (t instanceof win.HTMLInputElement && TEXT_INPUTS.has(t.type)) || t?.isContentEditable === true)
      && t !== autoFocused;
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
    if (S.leaving) return;
    // زمن مكتوب في حقل لم يُغادَر يُعتمد أولًا، فيحذّر الإغلاق منه كما يحذّر من النص (تدقيق 7a66f91، U19).
    commitFocusedTime();
    if (!(S.session.dirty || S.session.hasDrafts)) return;
    e.preventDefault();
    e.returnValue = '';
  });
  store.onChange((change) => {
    if (change.settings?.newValue) {
      // عتبة الانحراف من الإعدادات تسري فورًا على المقارنة الحاضرة (GM-027.3)؛ وخطوة الأزرار اختيار المستخدم هنا فلا تُطمس.
      settings = normalizeSettings(change.settings.newValue);
      S.comparison = compareNow(act());
      computeParts();
      scheduleChrome();
      renderComparisonPanel();
    }
    if (change.langPrefs) S.langPrefs = change.langPrefs.newValue ?? null;
    if (change.glossaries) {
      S.glossaries = change.glossaries.newValue ?? null;
      renderComplete();
    }
    if (change.prefs?.newValue) {
      // حد سرعة القراءة من الإعدادات (R55) يسري فورًا؛ ولا يمس شيئًا محفوظًا.
      S.prefs = change.prefs.newValue;
      commitFocusedTime();
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

  /**
   * تبديل لغة الواجهة في مكانه (startPage يستدعيها بدل إعادة التحميل): في المحرّر تعديلات غير محفوظة وسجل تراجع في الذاكرة لا
   * يعيشان عبر إعادة تحميل. لا يمس الجلسة (S.session وS.original) ولا نصوص المستخدم ولا حالة dirty ولا التحديد ولا موضع التمرير؛
   * ويعيد تركيز حقل الصف ومؤشره إن كان فيه. والحوار المفتوح يؤجّل التبديل كله حتى يُغلق (page-hold.js).
   */
  function relocalize() {
    // زمن مكتوب في حقل لم يُغادَر يُعتمد أولًا كما قبل كل إعادة بناء للصفوف، وإلا عاد الحقل إلى قيمته المحفوظة وضاع ما كُتب.
    commitFocusedTime();
    // عناصر بُنيت مرة بنص كسول (LazyText): الهيكل والقوائم والبحث والتسميات.
    relabel(doc);
    // ما يحمل نصًا محسوبًا عند التحميل أو التركيب: تسميات المراجع، واسما زرّي التنقّل في البحث، وتلميحا زرّي الطي.
    rankRefs();
    search.relocalize();
    for (const [kind, open] of foldOpen) (kind === 'tools' ? toolsBtn : sideBtn).title = foldTitle(kind, open);
    showTitle(S.opened.record.title);
    // الصفوف تحمل نصوصًا ثابتة عند create: تُبنى من جديد بالتخطيط نفسه، ويعود التركيز إلى حقله.
    const active = doc.activeElement;
    const rowNode = active && scroller.contains(active) ? rowOfNode(active) : null;
    const focus = rowNode ? {
      index: Number(rowNode.dataset.index), field: active.dataset?.field ?? null, act: active.dataset?.act ?? null,
      start: active.selectionStart, end: active.selectionEnd,
    } : null;
    S.list.reset(S.layout);
    if (focus && !Number.isNaN(focus.index)) {
      const row = S.list.elementOf(S.rowOf[focus.index]);
      const sel = focus.field ? `[data-field="${focus.field}"]` : focus.act ? `[data-act="${focus.act}"]` : null;
      const target = sel ? row?.querySelector(sel) : null;
      if (target) {
        target.focus({ preventScroll: true });
        if (focus.field && typeof focus.start === 'number') target.setSelectionRange?.(focus.start, focus.end);
      }
    }
    renderAll();
    if (!resumeChip.hidden) labelResumeChip();
    renderComplete(true);
  }

  load(bundle, picked.n);
  rememberSlot(picked.n);
  setSideTab('review');
  // ف1: «أكمل الناقص» من نافذة الإضافة أو المحفوظات يفتح المحرّر على «الاستكمال» والناقصة مختارة (الاختيار الافتراضي: الناقصة
  // والفارغة). ويُتجاهل المعامل حين لا ناقص ولا غير مترجم: تبقى «المراجعة».
  if (panel === 'complete' && hasGaps()) {
    setSideTab('complete');
    setFold('side', true);
  }
  if (picked.fallback) toast(slotFallback(requested, picked.n), 'info');
  const api = { get state() { return S; }, save, jumpTo, setView, switchSlot, relocalize };
  if (typeof __TJ_DEV__ !== 'undefined' && __TJ_DEV__) globalThis.__tarjumanEditor = api;
  return api;
}
