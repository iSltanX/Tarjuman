// صفحة المحرّر (P8، مواصفة التصميم §١١): الرأس والنسخة وحالة الحفظ، وشريط النطاق و±، وسطر إزاحة العرض المنفصل،
// والقائمة الافتراضية، ولوحتا المشكلات والمقارنة، والحفظ والأصل والتصدير وحارس المغادرة. المنطق في src/core/edit
// (الجلسة والمشكلات وما يُصدَّر)؛ هنا الحالة المعروضة والأحداث فقط. لا حفظ تلقائي أبدًا: «حفظ» وحده يكتب، بـexpect
// السجل المفتوح، فإن تغيّر من المشغّل أو تبويب آخر رُفض ودُعي المستخدم إلى إعادة الفتح.
/* global __TJ_DEV__ */
import { compare, previewRestoreTiming } from '../../core/compare/index.js';
import {
  buildRows, createEditSession, englishReference, parseSeconds, parseTimecode, pickEnglishTrack, planArabicExport,
} from '../../core/edit/index.js';
import { messageFor, toErrorInfo } from '../../core/errors/index.js';
import { download } from '../../core/export/index.js';
import { alertBox, button, el, emptyState, ltr, statusPill } from '../../ui/components.js';
import { COUNT_FORMS, formatCount, formatOffset, formatTimecode } from '../../ui/format.js';
import { confirmLeave, openDialog, setDisabled } from './dialogs.js';
import { renderComparison, renderIssues } from './panels.js';
import { classifyChange, openedState, restoreOriginal, saveEdits } from './persist.js';
import { createRows, textDir } from './rows.js';
import {
  errorsToFix, numberList, offsetLine, offsetNotice, saveStatus, scopeOption, scopeTarget, seconds, shiftSentence, unsavedSentence,
} from './text.js';
import { RowLayout, createVirtualList, rowHeight, textLines } from './virtual.js';

const KIND_LABEL = Object.freeze({ text: 'تعديل النص', time: 'تعديل الزمن', shift: 'نقل التوقيت', commit: 'تثبيت الإزاحة', restore: 'استعادة التوقيت' });
const STEPS = [100, 250, 500, 1000, 2000, 5000];
const MAX_PREVIEW_ROWS = 200;
const COMPARE_DELAY_MS = 250;

/**
 * @param {HTMLElement} app
 * @param {{ videoId: string | null, store: ReturnType<typeof import('../../core/store/index.js').createStore>, doc?: Document, now?: () => number }} deps
 */
export async function mountEditor(app, { videoId, store, doc = document, now = Date.now }) {
  const win = doc.defaultView;
  const title = (text) => el('h1', { className: 'tj-h1', text, doc });

  if (!videoId) {
    app.append(title('المحرّر'), alertBox({ tone: 'danger', title: 'تعذّر فتح المحرّر', text: messageFor('TJ_BAD_VIDEO_ID'), doc }));
    return null;
  }
  const loading = el('div', { className: 'tj-stack', attrs: { 'aria-busy': 'true' }, children: Array.from({ length: 6 }, () => el('div', { className: 'tj-skeleton ed-skeleton', doc })), doc });
  app.append(title('المحرّر'), loading);
  let record;
  let settings;
  try {
    [record, settings] = await Promise.all([store.getVideo(videoId), store.getSettings()]);
  } catch (err) {
    const info = toErrorInfo(err);
    loading.replaceWith(alertBox({ tone: 'danger', title: 'تعذّر فتح المحرّر', text: `${info.message} (${info.code})`, doc }));
    return null;
  }
  if (!record?.arabic) {
    loading.replaceWith(emptyState({
      title: 'لا ترجمة محفوظة لهذا الفيديو', text: messageFor('ST_NO_RECORD'),
      steps: ['افتح الفيديو على يوتيوب', 'ارفع ملف الترجمة العربية من شريط المشغّل', 'ثم افتح المحرّر من أيقونة الإضافة'], doc,
    }));
    return null;
  }

  // ---- الحالة ----
  const S = {
    opened: record, fp: null, englishTrack: null, edited: false,
    session: null, offSession: null, original: null,
    view: /** @type {'edit' | 'original'} */ ('edit'),
    rows: [], rowOf: new Int32Array(0), indexOfN: new Map(), missingRowOfN: new Map(),
    refs: [], refsOriginal: [],
    layout: null, list: null,
    selection: new Set(), lastChecked: null, activeIndex: null,
    scope: /** @type {'cue' | 'selection' | 'all'} */ ('all'),
    stepMs: settings.offsetStepMs,
    showEnglish: true, hideEnglish: false, hoverDelta: 0,
    result: /** @type {{ tone: string, text: string } | null} */ (null),
    external: /** @type {null | 'changed' | 'removed'} */ (null),
    saving: false, pending: null, leaving: false,
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
      el('div', { className: 'ed-head__row', children: [backBtn, titleEl, ltr(videoId, { doc }), versionSel, restoreOrigBtn], doc }),
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
  const toolbarEl = el('section', {
    className: 'ed-toolbar', attrs: { 'aria-label': 'تعديل التوقيت' },
    children: [
      el('div', {
        className: 'ed-toolbar__row',
        children: [
          el('span', { className: 'tj-label', text: 'النطاق:', doc }),
          el('div', { className: 'ed-seg', attrs: { role: 'radiogroup', 'aria-label': 'النطاق' }, children: scopeBtns, doc }),
          el('span', { className: 'ed-group', children: [minusBtn, el('span', { className: 'tj-caption', text: 'خطوة', doc }), stepSel, plusBtn], doc }),
          el('span', { className: 'ed-group', children: [amountIn, applyBtn], doc }),
          el('label', { className: 'ed-group ed-toggle', attrs: { for: 'ed-show-en' }, children: [enToggle, el('span', { text: 'إظهار الإنجليزي', doc })], doc }),
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
  const counterEl = el('span', { className: 'ed-counter tj-caption', attrs: { 'aria-live': 'off' }, doc });
  const listHead = el('div', {
    className: 'ed-list__head',
    attrs: { 'aria-hidden': 'true' },
    children: ['', '#', 'البداية', 'النهاية', 'المدة', 'النص العربي', 'الإنجليزي', ''].map((t, k) => el('span', { className: k === 6 ? 'ed-col-en' : '', text: t, doc })),
    doc,
  });
  const scroller = el('div', { className: 'ed-list', attrs: { role: 'list', 'aria-label': 'المقاطع' }, doc });
  const unsavedText = el('p', { className: 'tj-label', doc });
  const unsavedSave = button({ label: 'حفظ', variant: 'primary', size: 'sm', onClick: () => save(), doc });
  const unsavedDiscard = button({ label: 'تجاهل التغييرات', variant: 'ghost', size: 'sm', onClick: () => onDiscard(), doc });
  const unsavedEl = el('div', { className: 'ed-unsaved', attrs: { role: 'region', 'aria-label': 'تغييرات غير محفوظة' }, children: [unsavedText, el('span', { className: 'ed-spacer', doc }), unsavedSave, unsavedDiscard], doc });
  const toastEl = el('div', { className: 'ed-toast', attrs: { role: 'status', 'aria-live': 'polite' }, doc });
  app.append(
    headEl, toolbarEl, offsetEl, bannerEl,
    el('div', {
      className: 'ed-body',
      children: [
        el('aside', { className: 'ed-side', children: [issuesEl, compareEl], doc }),
        el('section', { className: 'ed-main', attrs: { 'aria-label': 'قائمة المقاطع' }, children: [el('div', { className: 'ed-main__bar', children: [counterEl], doc }), listHead, scroller], doc }),
      ],
      doc,
    }),
    unsavedEl, toastEl,
  );

  const rowView = createRows(doc, () => ({
    rows: S.rows, session: act(), report: act().issues(), refs: S.view === 'original' ? S.refsOriginal : S.refs,
    showEnglish: S.showEnglish, readOnly: readOnly(), selection: S.selection, activeIndex: S.activeIndex, stepMs: S.stepMs,
  }));

  // ---- الفتح وإعادة الفتح ----
  function load(rec, { keepUi = false } = {}) {
    const st = openedState(rec);
    const sameCount = S.session && S.session.count === st.cues.length;
    S.opened = rec;
    S.fp = st.fingerprint;
    S.edited = st.edited;
    S.englishTrack = pickEnglishTrack(rec.english, S.fp);
    S.offSession?.();
    S.session = createEditSession({ cues: st.cues, offsetMs: st.offsetMs });
    S.offSession = S.session.onChange(onSessionChange);
    S.original = createEditSession({ cues: st.original, offsetMs: st.offsetMs });
    const en = S.englishTrack?.cues ?? [];
    S.refs = englishReference(st.cues, en, S.fp);
    S.refsOriginal = englishReference(st.original, en, S.fp);
    if (!S.edited) S.view = 'edit';
    if (!(keepUi && sameCount)) {
      S.selection.clear();
      S.activeIndex = null;
      S.lastChecked = null;
      S.scope = 'all';
    }
    S.external = null;
    S.showEnglish = !S.hideEnglish && en.length > 0;
    titleEl.textContent = rec.title ?? 'بلا عنوان محفوظ';
    titleEl.title = rec.title ?? '';
    rebuildList();
    renderAll();
  }

  function heightOf(r, s, report) {
    if (r.type === 'missing') return rowHeight({ type: 'missing' });
    return rowHeight({ type: 'cue', lines: textLines(s.cueAt(r.index).text), message: report.byIndex.has(r.index) });
  }

  function rebuildList() {
    const s = act();
    const cues = Array.from({ length: s.count }, (_, i) => s.cueAt(i));
    S.comparison = compareNow(s);
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
    const report = S.session.issues();
    S.rows.forEach((r, k) => S.layout.setHeight(k, heightOf(r, S.session, report)));
    S.list.refresh(null, e.kind !== 'text' || Boolean(e.undo || e.redo) || e.indices === null);
    scheduleChrome();
    win.clearTimeout(S.compareTimer);
    S.compareTimer = win.setTimeout(() => {
      S.comparison = compareNow(act());
      renderComparisonPanel();
    }, COMPARE_DELAY_MS);
  }

  function scheduleChrome() {
    if (!S.frame) S.frame = win.requestAnimationFrame(() => { S.frame = 0; renderChrome(); });
  }

  // ---- العرض ----
  function renderAll() {
    renderChrome();
    renderComparisonPanel();
  }

  function renderChrome() {
    renderHeader();
    renderToolbar();
    renderOffset();
    renderUnsaved();
    renderBanner();
    renderIssues(issuesEl, { doc, report: act().issues(), onJump: jumpTo });
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

  function renderHeader() {
    const s = S.session;
    const dirty = s.dirty;
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
    previewEl.textContent = ro ? messageFor('ED_READ_ONLY') : delta ? shiftSentence(target, delta, 'before') : `النطاق: ${target} · الخطوة ${step} ث`;
    const notice = ro ? 0 : S.session.shiftNotice(scopeObj());
    noticeEl.hidden = !notice;
    noticeEl.textContent = notice ? offsetNotice(notice) : '';
    resultEl.hidden = !S.result;
    resultEl.className = `ed-result${S.result ? ` ed-result--${S.result.tone}` : ''}`;
    resultEl.textContent = S.result?.text ?? '';
    enToggle.checked = S.showEnglish;
    enToggle.disabled = !S.englishTrack?.cues.length;
    enToggle.parentElement.title = enToggle.disabled ? 'لا مسار إنجليزي محفوظ لهذا الفيديو.' : '';
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
      doc, report: S.comparison, notes: S.opened.arabic?.notes ?? [], readOnly: readOnly(),
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
  function toast(text, tone = 'success') {
    toastEl.textContent = text;
    toastEl.className = `ed-toast ed-toast--${tone} is-shown`;
    win.clearTimeout(toastTimer);
    toastTimer = win.setTimeout(() => toastEl.classList.remove('is-shown'), 3000);
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

  function jumpToN(n) {
    const i = S.indexOfN.get(n);
    if (i !== undefined) jumpTo(i, null);
    else if (S.missingRowOfN.has(n)) S.list.reveal(S.missingRowOfN.get(n));
  }

  async function save() {
    if (S.saving || saveBlockReason()) return;
    S.saving = true;
    renderHeader();
    try {
      const rec = await saveEdits(store, videoId, S.opened, { cues: S.session.snapshot(), offsetChanged: S.session.offsetChanged, offsetMs: S.session.offsetMs }, { now });
      S.result = null;
      load(rec, { keepUi: true });
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
      const rec = await store.getVideo(videoId);
      if (!rec?.arabic) {
        S.external = 'removed';
        renderAll();
        return;
      }
      load(rec, { keepUi: true });
      toast(messageFor('ED_RELOADED'), 'info');
    } catch (err) {
      const info = toErrorInfo(err);
      toast(`${info.message} (${info.code})`, 'danger');
    }
  }

  function handleExternal(change) {
    const kind = classifyChange(S.opened, change);
    if (kind === 'none' || kind === 'echo') return;
    if (kind === 'removed') S.external = 'removed';
    else if (S.session.dirty || S.session.hasDrafts) S.external = 'changed';
    else {
      reopen();
      return;
    }
    renderAll();
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
      const rec = await restoreOriginal(store, videoId, S.opened, { now });
      S.view = 'edit';
      S.result = null;
      load(rec, { keepUi: true });
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
      actions: [{ label: 'تنزيل SRT', value: 'download', variant: 'primary', ref: (b) => { confirmBtn = b; } }, { label: 'إلغاء', value: 'cancel' }],
    });
    if (v !== 'download' || !plan?.ok) return;
    try {
      download({ name: plan.name, text: plan.text }, { doc });
      toast(`نُزّل ${plan.name}`, 'success');
    } catch (err) {
      const info = toErrorInfo(err);
      toast(`${info.message} (${info.code})`, 'danger');
    }
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
  scroller.addEventListener('focusout', (e) => {
    if (e.target.dataset?.field === 'text') S.session.seal();
  });
  scroller.addEventListener('click', (e) => {
    const t = e.target.closest?.('[data-act]');
    const node = t && rowOfNode(t);
    if (!node) return;
    const i = Number(node.dataset.index);
    if (t.dataset.act === 'select') toggleSelect(i, t.checked, e.shiftKey);
    else if (t.dataset.act === 'nudge' && !readOnly()) {
      setActive(i);
      applyShift({ kind: 'cue', index: i }, Number(t.dataset.dir) * S.stepMs, scopeTarget('cue', { activeN: act().cueAt(i).n, total: act().count }));
    }
  });

  // ---- لوحة المفاتيح والمغادرة والتخزين ----
  doc.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 's') {
      e.preventDefault();
      save();
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
  win.addEventListener('beforeunload', (e) => {
    if (S.leaving || !(S.session.dirty || S.session.hasDrafts)) return;
    e.preventDefault();
    e.returnValue = '';
  });
  store.onChange((change) => {
    const c = change.cleared ? { oldValue: S.opened, newValue: null } : change.videos?.[videoId];
    if (!c) return;
    if (S.saving) S.pending = c;
    else handleExternal(c);
  });

  load(record);
  const api = { get state() { return S; }, save, jumpTo, setView };
  if (typeof __TJ_DEV__ !== 'undefined' && __TJ_DEV__) globalThis.__tarjumanEditor = api;
  return api;
}
