// واجهة المحفوظات (P7-AC2/AC3/AC6/AC7، وإعادة التصميم، وP13-AC1/AC2/AC3/AC6/AC7): سجل واحد لكل فيديو في قائمة مدمجة:
// العنوان، واختيار الترجمة 1 2 3 (يفعّل غير النشطة)، والمعرّف، والشارات، والتاريخ؛ والإجراءات المتكررة ظاهرة (تعديل أو رفع
// ترجمة، ونسخ تعليمات الترجمة بالقاموس، وفتح الفيديو) والثانوية في «المزيد» («الترجمات…» بلوحتها، وتصدير SRT و«نص
// دراسي…» عبر saveFile، و«رفع ترجمة…» بحوار الفحص الكامل، والحذف). بحث ورقائق الفرز بالحالات الخمس بأعدادها وترتيب،
// وحالتها في جزء العنوان فتبقى عند الرجوع من المحرّر. الحالات: تحميل وفارغة وممتلئة ونتيجة بحث فارغة وقسم فارغ وخطأ. كل
// نص عبر textContent، ولا طلبات شبكة، ونص تعليمات الترجمة لا يدخل DOM في أي حال.
import { TjError, messageFor, toErrorInfo } from '../../core/errors/index.js';
import { instructions } from '../../core/export/instructions.js';
import { watchUrl } from '../../core/model/ids.js';
import { DEFAULT_PREFS } from '../../core/model/prefs.js';
import { alertBox, button, chipGroup, confirmDialog, el, emptyState, icon, ltr, slotPicker, statusPill } from '../../ui/components.js';
import { COUNT_FORMS, formatBytes, formatCount, offsetInline } from '../../ui/format.js';
import { createMenu } from '../../ui/menu.js';
import { createToaster } from '../../ui/toast.js';
import { activateSlot, applyUpload, deleteVideoData, exportArabic, exportEnglish, exportStudy, prepareUpload, studyName } from './actions.js';
import { radioGroup } from './choice.js';
import { createCopyState } from './copy.js';
import {
  FILTERS, PAGE_SIZE, SORTS, copyGate, exportOptions, filterCounts, filterEntries, libraryEntries, parsePageState, rowModel, searchEntries,
  serializePageState, sortEntries, studyGate,
} from './model.js';
import { openTranslations } from './panel.js';
import { studyContent } from './study.js';
import { uploadContent } from './upload.js';

export const COPY_TIP = 'ينسخ تعليمات الترجمة لترفقها مع ملف SRT.';
export const CAPTION = 'ترجماتك محفوظة هنا حسب الفيديو، والأصل المستورد محفوظ دائمًا.';
const COPY_LABEL = Object.freeze({ idle: 'نسخ التعليمات', success: 'تم النسخ', error: 'أعد المحاولة' });
// عنوان الفيديو قد يكون إنجليزيًا داخل جملة عربية: يُعزل اتجاهًا (FSI…PDI) فلا تنقلب علامات الترقيم حوله في عناوين الحوارات.
const FSI = String.fromCodePoint(0x2068);
const PDI = String.fromCodePoint(0x2069);
export const isolate = (s) => `${FSI}${s}${PDI}`;
const clip = (s, max) => (Array.from(s).length > max ? `${Array.from(s).slice(0, max - 1).join('')}…` : s);
let seq = 0;

/**
 * @typedef {{
 *   store: ReturnType<typeof import('../../core/store/index.js').createStore>,
 *   doc?: Document, now?: () => number,
 *   openTab: (url: string) => Promise<unknown>, openPage: (name: 'editor', params: { v: string }) => Promise<unknown>,
 *   saveFile: import('./actions.js').SaveFn,
 *   clipboardWrite: (text: string) => Promise<void>,
 *   pickFiles: () => Promise<File[] | null>,
 *   diagnosticsText: () => Promise<string>,
 *   confirm?: typeof confirmDialog,
 *   nav?: { get: () => string, set: (hash: string) => void },
 *   setTimer?: (fn: () => void, ms: number) => unknown, clearTimer?: (id: unknown) => void,
 * }} LibraryEnv
 */

/** حالة الصفحة في جزء العنوان إن وُجدت نافذة، وإلا ذاكرة فقط (الاختبارات). */
function hashNav(doc) {
  const win = doc.defaultView ?? null;
  if (!win?.location || !win.history?.replaceState) {
    let memo = '';
    return { get: () => memo, set: (h) => { memo = h; } };
  }
  return {
    get: () => String(win.location.hash ?? ''),
    set: (h) => {
      if (String(win.location.hash ?? '') !== h) win.history.replaceState(null, '', `${win.location.pathname}${win.location.search}${h}`);
    },
  };
}

/** @param {LibraryEnv} env */
export function createLibrary(env) {
  const { store, doc = document, now = Date.now } = env;
  const setTimer = env.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = env.clearTimer ?? ((id) => clearTimeout(id));
  const confirm = env.confirm ?? confirmDialog;
  const nav = env.nav ?? hashNav(doc);
  const toaster = createToaster({ doc, setTimer, clearTimer });
  const initial = parsePageState(nav.get());
  const state = {
    status: /** @type {'loading' | 'ready' | 'error'} */ ('loading'),
    /** مُلخّص الفهرس لكل فيديو ومعه ملخص الفرز ونماذج 1 2 3 (listLibrary). */
    entries: /** @type {ReturnType<typeof libraryEntries>} */ ([]),
    capacity: /** @type {import('../../core/store/capacity.js').Capacity | null} */ (null),
    /** التفضيلات: القاموس يُرفق بالتعليمات المنسوخة. */
    prefs: /** @type {import('../../core/model/prefs.js').Prefs} */ (DEFAULT_PREFS),
    query: initial.query, filter: initial.filter, order: /** @type {'updated' | 'title'} */ (initial.order), limit: PAGE_SIZE,
    /** الصف المقصود بعد الرجوع من المحرّر (#v=…): يُبرَز مرة ثم يُنسى. */
    focusId: initial.focusId,
    error: /** @type {{ code: string, message: string } | null} */ (null),
  };
  const copyStates = new Set();
  let loadSeq = 0;
  let reloadTimer = null;

  const remember = () => nav.set(serializePageState(state));

  // ---- الرأس والأدوات ----
  const countPill = el('span', { className: 'tj-pill tj-pill--plain lib-count', doc });
  const quotaHost = el('div', { className: 'lib-quota-host', doc });
  const capacityAlert = el('div', { className: 'lib-capacity-alert', doc });
  const searchId = `lib-search-${++seq}`;
  const search = el('input', { className: 'tj-field__input lib-search__input', attrs: { id: searchId, type: 'search', placeholder: 'ابحث بالعنوان أو المعرّف', autocomplete: 'off', spellcheck: 'false' }, doc });
  search.value = state.query;
  const clearSearch = button({ label: 'مسح البحث', iconOnly: true, icon: 'x', variant: 'ghost', size: 'sm', className: 'lib-search__clear', doc, onClick: () => {
    search.value = '';
    state.query = '';
    state.limit = PAGE_SIZE;
    render();
    announceResults();
    remember();
    search.focus();
  } });
  const sortId = `lib-sort-${++seq}`;
  const sort = el('select', {
    className: 'tj-field__input lib-sort__select', attrs: { id: sortId, 'aria-label': 'الترتيب' },
    children: SORTS.map((s) => el('option', { text: s.label, attrs: { value: s.value }, doc })),
    doc,
  });
  sort.value = state.order;
  const chips = chipGroup({
    options: FILTERS.map((f) => ({ value: f.value, label: f.label, count: null })), value: state.filter, ariaLabel: 'تصفية المحفوظات', doc,
    onChange: (v) => {
      state.filter = v;
      state.limit = PAGE_SIZE;
      render();
      announceResults();
      remember();
    },
  });
  const resultsLive = el('p', { className: 'tj-sr-only', attrs: { role: 'status', 'aria-live': 'polite' }, doc });
  const listHost = el('div', { className: 'lib-list-host', doc });
  const header = el('header', {
    className: 'tj-page-head lib-header',
    children: [
      el('div', {
        className: 'tj-page-head__titles',
        children: [el('div', { className: 'tj-page-head__title', children: [el('h1', { className: 'tj-h1', text: 'المحفوظات', doc }), countPill], doc }), el('p', { className: 'tj-caption lib-caption', text: CAPTION, doc })],
        doc,
      }),
      quotaHost,
    ],
    doc,
  });
  const toolbar = el('div', {
    className: 'lib-toolbar',
    children: [
      el('div', { className: 'lib-search', children: [el('label', { className: 'tj-sr-only', text: 'بحث بالعنوان أو المعرّف', attrs: { for: searchId }, doc }), icon('search', { doc, className: 'tj-icon lib-search__icon' }), search, clearSearch], doc }),
      el('div', { className: 'lib-sort', children: [el('label', { className: 'tj-caption', text: 'الترتيب', attrs: { for: sortId }, doc }), sort], doc }),
      chips.root,
    ],
    doc,
  });
  const root = el('div', { className: 'lib', children: [header, capacityAlert, toolbar, resultsLive, listHost, toaster.root, toaster.live], doc });

  /** يعلن عدد المطابقات لقارئ الشاشة، ويفرّغ الإعلان بمسح البحث فلا يبقى «لا نتائج» قديمًا. */
  const announceResults = () => {
    const n = visible().length;
    resultsLive.textContent = state.query.trim() || state.filter !== 'all' ? (n ? `${formatCount(n, COUNT_FORMS.video)} مطابق` : 'لا نتائج') : '';
  };
  search.addEventListener('input', () => {
    state.query = search.value;
    state.limit = PAGE_SIZE;
    render();
    announceResults();
    remember();
  });
  sort.addEventListener('change', () => {
    state.order = sort.value === 'title' ? 'title' : 'updated';
    render();
    remember();
  });

  const visible = () => sortEntries(filterEntries(searchEntries(state.entries, state.query), state.filter), state.order);

  /** أخطاء الأوامر رسائل عابرة بنص عربي من رمزها. */
  const fail = (err) => toaster.show(toErrorInfo(err).message, 'danger');
  const done = (code) => toaster.show(messageFor(code), 'success');

  // ---- الأوامر ----
  async function guarded(fn) {
    try {
      await fn();
    } catch (err) {
      fail(err);
      if (err instanceof TjError && (err.code === 'ST_CONFLICT' || err.code === 'PG_VIDEO_GONE')) await load();
    }
  }

  function askTiming(offsetMs) {
    const group = radioGroup({
      legend: 'توقيت الملف المصدَّر',
      options: [
        { value: 'shown', label: `كما يظهر الآن (المحفوظ + الإزاحة ${offsetInline(offsetMs)} ث)`, hint: 'الاختيار المناسب لما تشاهده فوق الفيديو.' },
        { value: 'saved', label: 'المحفوظ كما هو (دون الإزاحة)', hint: 'التوقيت المخزَّن في ترجمتك بلا تعديل.' },
      ],
      doc,
    });
    return confirm({ title: 'توقيت الملف المصدَّر', body: `لهذه الترجمة إزاحة عرض ${offsetInline(offsetMs)} ث. اختر التوقيت الذي يُكتب في الملف.`, confirmLabel: 'تصدير', content: group.root, doc })
      .then((ok) => (ok ? group.value() : null));
  }

  /** نتيجة الحفظ (saveFile) رسالةً عابرة: النجاح، والرجوع إلى التنزيل العادي، والإلغاء، والفشل برمزه. يعيد هل حُفظ. */
  function savedToast(saved, successCode = 'PG_EXPORT_DONE') {
    if (saved.ok) {
      if (saved.mode === 'blob') toaster.show(messageFor('SV_FALLBACK_BLOB'), 'info');
      else if (saved.pending) toaster.show(messageFor('SV_PENDING'), 'info');
      else done(successCode);
      return true;
    }
    toaster.show(messageFor(saved.code), saved.code === 'SV_CANCELLED' ? 'info' : 'danger');
    return false;
  }

  const exportFile = (m, option) => guarded(async () => {
    if (option.action.type === 'ar') {
      const r = await exportArabic({ store, videoId: m.videoId, variant: option.action.variant, askTiming, save: env.saveFile });
      if (r) savedToast(r.saved);
    } else {
      const r = await exportEnglish({ store, videoId: m.videoId, trackKey: option.action.trackKey, save: env.saveFile, now });
      if (r.saveError) toaster.show(messageFor('PG_FINGERPRINT_NOT_SAVED'), 'info');
      else savedToast(r.saved);
    }
  });

  /** «نص دراسي…»: الصيغة واللغة ومعاينة الاسم، ثم الحفظ عبر saveFile. */
  const study = (m, entry) => guarded(async () => {
    const content = studyContent({ doc, hasEnglish: entry.english.length > 0, name: (o) => studyName({ store, videoId: m.videoId, ...o }) });
    await content.ready;
    const ok = await confirm({ title: `نص دراسي لـ"${isolate(clip(m.displayTitle, 80))}"`, body: 'الترجمة النشطة فقرات بأوقاتها، لقراءتها أو مراجعتها خارج الفيديو.', confirmLabel: 'تنزيل', content: content.root, doc });
    if (!ok) return;
    const r = await exportStudy({ store, videoId: m.videoId, ...content.value(), save: env.saveFile });
    savedToast(r.saved);
  });

  /**
   * الرفع إلى خانة (حوار الفحص الكامل): المنتقي، ثم القراءة والفحص، ثم الحوار، ثم الكتابة بالحزمة التي بُني عليها. يعيد هل كُتب.
   * @param {{ videoId: string, displayTitle: string }} m @param {1 | 2 | 3 | null} [preferred]
   */
  async function upload(m, preferred = null) {
    let wrote = false;
    await guarded(async () => {
      const files = await env.pickFiles();
      if (!files || !files.length) return;
      const prep = await prepareUpload({ store, videoId: m.videoId, files, knownVideoIds: state.entries.map((e) => e.videoId) });
      if (!prep.result.ok) {
        toaster.show(prep.result.error.message, 'danger');
        return;
      }
      const titleOf = (id) => state.entries.find((e) => e.videoId === id)?.title ?? null;
      let confirmBtn = null;
      const labelFor = (replace) => (replace ? 'استبدال' : 'حفظ');
      const view = uploadContent({
        doc, prep, preferred, titleOf,
        onTarget: (replace) => {
          if (!confirmBtn) return;
          const label = confirmBtn.querySelector('span') ?? confirmBtn;
          label.textContent = labelFor(replace);
        },
      });
      const pending = confirm({ title: `رفع ترجمة لـ"${isolate(clip(m.displayTitle, 80))}"`, confirmLabel: labelFor(view.replace()), content: view.root, doc });
      confirmBtn = view.root.closest?.('form')?.querySelector('button[value="confirm"]') ?? null;
      if (!(await pending)) return;
      const choice = view.choice();
      const info = await applyUpload({ store, bundle: prep.bundle, settings: prep.settings, result: prep.result, ...choice, now });
      toaster.show(messageFor(info.replaced ? 'PG_UPLOAD_REPLACED' : 'PG_UPLOAD_SAVED', { n: choice.n }), 'success');
      if (info.offsetWas !== 0) toaster.show(messageFor('ST_OFFSET_RESET'), 'info');
      wrote = true;
      await load();
    });
    return wrote;
  }

  /** «الترجمات…»: اللوحة الجانبية. */
  const translations = (m) => guarded(async () => {
    const panel = openTranslations({
      doc, store, videoId: m.videoId, title: clip(m.displayTitle, 60), now, confirm, toaster,
      onChanged: () => load(),
      upload: (n) => upload(m, n),
    });
    await panel.closed;
  });

  /** اختيار 1 2 3 في الصف: يفعّل الخانة برسالة عابرة فيها «تراجع». */
  const activate = (m, n) => guarded(async () => {
    const { before } = await activateSlot({ store, videoId: m.videoId, n, now });
    await load();
    toaster.show(messageFor('PG_SLOT_ACTIVATED', { n }), 'success', before && before !== n ? {
      action: { label: 'تراجع', onClick: () => guarded(async () => { await activateSlot({ store, videoId: m.videoId, n: before, now }); await load(); }) },
    } : undefined);
  });

  const remove = (m, hasArabic) => guarded(async () => {
    const options = hasArabic
      ? [{ value: 'arabic', label: 'الترجمة النشطة وحدها (تبقى الأخرى والمسار الإنجليزي والبصمة)' }, { value: 'all', label: 'كل بيانات هذا الفيديو' }]
      : [{ value: 'all', label: 'كل بيانات هذا الفيديو' }];
    const group = radioGroup({ legend: 'ما يُحذف', options, doc });
    const ok = await confirm({
      title: `حذف ${hasArabic ? 'ترجمة' : 'بيانات'} "${isolate(clip(m.displayTitle, 80))}"؟`,
      body: 'لا يمكن التراجع عن الحذف.', confirmLabel: 'حذف', tone: 'danger', content: group.root, doc,
    });
    if (!ok) return;
    const scope = /** @type {'arabic' | 'all'} */ (group.value());
    await deleteVideoData({ store, videoId: m.videoId, scope, now });
    done(scope === 'arabic' ? 'PG_DELETE_ARABIC_DONE' : 'PG_DELETE_ALL_DONE');
    await load();
  });

  // ---- الصف ----
  function copyButton(m, entry) {
    const gate = copyGate(entry);
    const tipId = `lib-tip-${++seq}`;
    const label = el('span', { text: COPY_LABEL.idle, doc });
    let glyph = icon('copy', { doc });
    const btn = el('button', {
      className: 'tj-btn tj-btn--secondary tj-btn--sm lib-copy__button',
      // اسم الوصول يبدأ بالنص الظاهر في كل حالة (WCAG 2.5.3؛ تدقيق 5fedcb9، CL-007).
      attrs: { type: 'button', 'aria-label': `${COPY_LABEL.idle}: ${m.accessName}`, 'aria-describedby': tipId, 'data-state': 'idle' },
      children: [glyph, label],
      doc,
    });
    const tip = el('span', { className: 'tj-tip lib-copy__tip', text: gate.enabled ? COPY_TIP : gate.reason, attrs: { id: tipId, role: 'tooltip' }, doc });
    const wrap = el('span', { className: 'tj-tipwrap lib-copy', children: [btn, tip], doc });
    if (!gate.enabled) {
      btn.setAttribute('aria-disabled', 'true');
      return wrap;
    }
    const copy = createCopyState({
      // النص يُبنى عند الضغطة من السجل (العنوان) والمعرّف والقاموس المحفوظ إن كان مرفقًا (النص نفسه في قائمة التحميل)،
      // ويُسلَّم إلى الحافظة ولا يُحفظ ولا يُعرض.
      buildText: () => instructions({ videoId: entry.videoId, title: entry.title, glossary: state.prefs.glossary.attach ? state.prefs.glossary.terms : null }),
      write: (text) => env.clipboardWrite(text),
      // النجاح يتحول به الزر ويُعلَن بعنوان الصف؛ الفشل رسالة عابرة تُعلَن بنفسها.
      announce: (code) => {
        if (code === 'PG_COPY_DONE') toaster.announce(`${messageFor(code)} ‹${m.accessName}›`);
        else toaster.show(messageFor(code), 'danger');
      },
      onState: (next) => {
        label.textContent = COPY_LABEL[next];
        btn.setAttribute('aria-label', `${COPY_LABEL[next]}: ${m.accessName}`);
        const fresh = icon(next === 'success' ? 'check' : 'copy', { doc });
        glyph.replaceWith(fresh);
        glyph = fresh;
        btn.setAttribute('data-state', next);
        wrap.classList.toggle('lib-copy--success', next === 'success');
        wrap.classList.toggle('lib-copy--error', next === 'error');
      },
      setTimer, clearTimer,
    });
    copyStates.add(copy);
    btn.addEventListener('click', () => { copy.copy(); });
    return wrap;
  }

  function buildRow(entry) {
    const m = rowModel(entry, now());
    const titleId = `lib-title-${++seq}`;
    const name = (verb) => `${verb}: ${m.accessName}`;
    const idCopy = button({
      label: `نسخ معرّف الفيديو ${entry.videoId}`, iconOnly: true, icon: 'copy', variant: 'ghost', size: 'sm', className: 'lib-idcopy', title: 'نسخ المعرّف', doc,
      onClick: async () => {
        try {
          await env.clipboardWrite(entry.videoId);
          toaster.show(messageFor('PG_ID_COPIED'), 'success');
        } catch {
          toaster.show(messageFor('PG_COPY_FAILED'), 'danger');
        }
      },
    });
    // 1 2 3 بجانب الشارات: النشطة مميزة، والضغط على غيرها يفعّلها؛ والتلميح الاسم المختصر إن وُجد.
    const slots = slotPicker({ slots: m.slots, ariaLabel: name('الترجمة النشطة'), onSelect: (n) => activate(m, n), doc });
    const exportItems = exportOptions(entry).map((o) => ({ id: o.id, label: o.label, hint: o.hint, disabledReason: o.disabledReason, icon: 'download', onSelect: () => exportFile(m, o) }));
    const moreMenu = createMenu({
      label: 'المزيد', ariaLabel: name('المزيد'), icon: 'more', iconOnly: true, variant: 'ghost', className: 'lib-more', doc,
      items: [
        { id: 'translations', label: 'الترجمات…', icon: 'layers', onSelect: () => translations(m) },
        { kind: 'separator' },
        { kind: 'group', label: 'تصدير' },
        ...exportItems,
        { id: 'study', label: 'نص دراسي…', icon: 'download', disabledReason: studyGate(entry), onSelect: () => study(m, entry) },
        { kind: 'separator' },
        { id: 'upload', label: 'رفع ترجمة…', icon: 'upload', onSelect: () => upload(m) },
        { id: 'delete', label: m.hasArabic ? 'حذف الترجمة…' : 'حذف بيانات الفيديو…', tone: 'danger', icon: 'trash', onSelect: () => remove(m, entry.arabic !== null) },
      ],
    });
    const primary = m.hasArabic
      ? button({ label: 'تعديل', icon: 'edit', variant: 'secondary', size: 'sm', title: name('تعديل'), doc, onClick: () => guarded(async () => { state.focusId = entry.videoId; remember(); await env.openPage('editor', { v: entry.videoId }); }) })
      : button({ label: 'رفع ترجمة', icon: 'upload', variant: 'secondary', size: 'sm', title: name('رفع ترجمة'), doc, onClick: () => upload(m) });
    primary.setAttribute('aria-label', name(m.hasArabic ? 'تعديل' : 'رفع ترجمة'));
    const open = button({ label: name('فتح الفيديو'), iconOnly: true, icon: 'external', variant: 'ghost', size: 'sm', title: 'فتح الفيديو على يوتيوب', doc, onClick: () => guarded(async () => { await env.openTab(watchUrl(entry.videoId)); }) });
    const meta = [
      slots.root,
      el('span', { className: 'lib-row__id', children: [ltr(entry.videoId, { doc }), idCopy], doc }),
      ...m.badges.map((b) => statusPill({ tone: b.tone, text: b.text, plain: b.tone === 'neutral', title: b.title, doc })),
      m.offsetText ? el('span', { className: 'tj-caption lib-row__offset', text: m.offsetText, doc }) : null,
      el('span', { className: 'tj-caption lib-row__when', text: m.relative, attrs: { title: m.absolute }, doc }),
    ];
    const li = el('li', {
      className: 'lib-row', attrs: { 'aria-labelledby': titleId, 'data-video': entry.videoId, tabindex: '-1' },
      children: [
        el('div', {
          className: 'lib-row__main',
          children: [
            el('h2', { className: `tj-h4 tj-auto lib-row__title${m.hasTitle ? '' : ' lib-row__title--empty'}`, text: m.displayTitle, attrs: { id: titleId, ...(m.hasTitle ? { title: m.displayTitle } : {}) }, doc }),
            el('div', { className: 'lib-row__meta', children: meta, doc }),
          ],
          doc,
        }),
        el('div', { className: 'lib-row__actions', children: [primary, copyButton(m, entry), open, moreMenu.root], doc }),
      ],
      doc,
    });
    return li;
  }

  // ---- الحالات ----
  function skeletonRows() {
    return el('div', { className: 'lib-skeleton', attrs: { 'aria-busy': 'true', 'aria-label': 'جارٍ قراءة المحفوظات' }, children: [1, 2, 3].map(() => el('div', { className: 'lib-row lib-row--skeleton', children: [el('div', { className: 'tj-skeleton lib-skel-a', doc }), el('div', { className: 'tj-skeleton lib-skel-b', doc })], doc })), doc });
  }

  function renderMeta() {
    countPill.textContent = state.status === 'ready' ? formatCount(state.entries.length, COUNT_FORMS.video) : '';
    countPill.hidden = state.status !== 'ready';
    chips.setCounts(state.status === 'ready' ? filterCounts(state.entries) : {});
    quotaHost.replaceChildren();
    capacityAlert.replaceChildren();
    const cap = state.capacity;
    if (!cap) return;
    const text = cap.quotaBytes ? `المستخدم ${formatBytes(cap.bytesInUse)} من ${formatBytes(cap.quotaBytes)}` : `المستخدم ${formatBytes(cap.bytesInUse)}`;
    const children = [el('span', { className: 'tj-caption lib-quota__text', text, doc })];
    if (cap.quotaBytes) {
      const pct = Math.min(100, Math.round((cap.bytesInUse / cap.quotaBytes) * 100));
      const fill = el('span', { className: 'tj-meter__fill', doc });
      fill.style.width = `${pct}%`;
      children.push(el('span', { className: `tj-meter tj-meter--${cap.level}`, attrs: { role: 'meter', 'aria-label': 'المساحة المستخدمة', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) }, children: [fill], doc }));
    }
    quotaHost.append(el('div', { className: 'lib-quota', children, doc }));
    if (cap.code) capacityAlert.append(alertBox({ tone: cap.level === 'full' ? 'danger' : 'warning', text: messageFor(cap.code), doc }));
  }

  function render() {
    renderMeta();
    listHost.replaceChildren();
    for (const c of copyStates) c.dispose();
    copyStates.clear();
    toolbar.hidden = state.status === 'ready' && !state.entries.length;
    if (state.status === 'loading') {
      listHost.append(skeletonRows());
      return;
    }
    if (state.status === 'error') {
      const copyDiag = button({
        label: 'نسخ تقرير التشخيص', icon: 'clipboard', size: 'sm', doc,
        onClick: async () => {
          try {
            await env.clipboardWrite(await env.diagnosticsText());
            toaster.show(messageFor('PG_DIAGNOSTICS_DONE'), 'success');
          } catch {
            toaster.show(messageFor('PG_DIAGNOSTICS_FAILED'), 'danger');
          }
        },
      });
      listHost.append(alertBox({ tone: 'danger', title: 'تعذّرت قراءة المحفوظات', text: `${state.error?.message ?? messageFor('PG_LIST_FAILED')} (${state.error?.code ?? 'ST_READ_FAILED'})`, action: copyDiag, doc }));
      return;
    }
    if (!state.entries.length) {
      listHost.append(emptyState({ title: 'لا ترجمات محفوظة بعد', text: 'كل فيديو تحمّل ترجمته أو ترفع ملفه العربي يظهر هنا.', steps: ['افتح فيديو', 'اضغط تحميل الترجمة', 'ارفع ملفك العربي'], doc }));
      return;
    }
    const shown = visible();
    if (!shown.length) {
      if (state.query.trim()) {
        const clear = button({ label: 'مسح البحث', variant: 'secondary', size: 'sm', doc, onClick: () => { search.value = ''; state.query = ''; render(); announceResults(); remember(); search.focus(); } });
        listHost.append(emptyState({ icon: 'search', title: `لا نتائج لـ«${isolate(clip(state.query.trim(), 60))}»`, text: 'جرّب جزءًا آخر من العنوان أو المعرّف.', action: clear, doc }));
      } else {
        const all = button({ label: 'عرض الكل', variant: 'secondary', size: 'sm', doc, onClick: () => { state.filter = 'all'; chips.set('all'); render(); announceResults(); remember(); } });
        listHost.append(emptyState({ icon: 'list', title: 'لا فيديوهات في هذا القسم', text: 'اختر قسمًا آخر أو اعرض الكل.', action: all, doc }));
      }
      return;
    }
    // الصف المقصود بعد الرجوع خارج الصفحات المعروضة: تُوسَّع حتى تشمله (تدقيق 5fedcb9، GM-016.3).
    if (state.focusId) {
      const at = shown.findIndex((x) => x.videoId === state.focusId);
      if (at >= state.limit) state.limit = Math.ceil((at + 1) / PAGE_SIZE) * PAGE_SIZE;
    }
    const slice = shown.slice(0, state.limit);
    listHost.append(el('ul', { className: 'lib-list', attrs: { role: 'list' }, children: slice.map(buildRow), doc }));
    if (shown.length > slice.length) {
      listHost.append(button({
        label: `عرض المزيد (${formatCount(shown.length - slice.length, COUNT_FORMS.video)})`, variant: 'secondary', className: 'lib-more-rows', doc,
        onClick: () => { state.limit += PAGE_SIZE; render(); },
      }));
    }
    // الرجوع من المحرّر: الصف المقصود يُبرَز ويُمرَّر إليه مرة واحدة، حين تظهر الصفحة للمستخدم؛ فلا يستهلكه تحديث في الخلفية
    // (حفظ المحرّر في تبويب آخر) قبل أن يعود (GM-016.3).
    if (state.focusId && doc.visibilityState !== 'hidden') {
      const row = listHost.querySelector(`li[data-video="${state.focusId}"]`);
      state.focusId = null;
      remember();
      if (row) {
        row.classList.add('lib-row--target');
        row.scrollIntoView?.({ block: 'center' });
        row.focus?.({ preventScroll: true });
      }
    }
  }

  async function load() {
    const mine = ++loadSeq;
    try {
      const [items, capacity, prefs] = await Promise.all([store.listLibrary(), store.capacity(), store.getPrefs().catch(() => DEFAULT_PREFS)]);
      if (mine !== loadSeq) return;
      Object.assign(state, { entries: libraryEntries(items), capacity, prefs, status: 'ready', error: null });
    } catch (err) {
      if (mine !== loadSeq) return;
      const info = toErrorInfo(err);
      Object.assign(state, { status: 'error', error: { code: info.code, message: info.message } });
    }
    render();
  }

  const unsubscribe = store.onChange((change) => {
    // التفضيلات (القاموس) تُقرأ عند ضغطة النسخ، فتُحدَّث بلا إعادة بناء.
    if (change.prefs) store.getPrefs().then((p) => { state.prefs = p; }).catch(() => {});
    // تغيّر الإعدادات من صفحة أخرى لا يمسّ القائمة: إعادة بنائها تهدم التركيز وحالة «تم النسخ» والقائمة المفتوحة.
    if (!Object.keys(change.videos).length && !change.index && !change.cleared && !change.bundles.length) return;
    if (reloadTimer !== null) clearTimer(reloadTimer);
    reloadTimer = setTimer(() => {
      reloadTimer = null;
      load();
    }, 200);
  });

  const onVisible = () => { if (doc.visibilityState === 'visible' && state.focusId && state.status === 'ready') render(); };
  doc.addEventListener?.('visibilitychange', onVisible);

  render();

  return {
    root, state, toaster, load,
    dispose() {
      unsubscribe();
      doc.removeEventListener?.('visibilitychange', onVisible);
      if (reloadTimer !== null) clearTimer(reloadTimer);
      for (const c of copyStates) c.dispose();
    },
  };
}
