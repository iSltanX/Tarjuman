// واجهة المحفوظات (P7-AC2/AC3/AC6/AC7، وإعادة التصميم، وP13-AC1/AC2/AC3/AC6/AC7، والهوية «بُنّ على ورق»): سجل واحد لكل
// فيديو في صف: صورة الفيديو ومدته، والعنوان، وسطر «المعرّف · عُدّل منذ · N مقطعًا»، وشارة حالة واحدة، وعمود «الترجمات»
// بشريحة لكل ترجمة موجودة (النشطة بالإبراز، والضغط على غيرها يفعّلها) وشريحة متقطّعة للخانة الفارغة التالية تفتح الرفع إليها؛
// والأفعال: تحرير (أو رفع ترجمة)، وفتح الفيديو، وتوسيع الصف (بطاقات الترجمات في الصف نفسه)، و«المزيد» (تصدير SRT والنص
// الدراسي، ورفع ترجمة، ونسخ تعليمات الترجمة بالقاموس، والحذف بتأكيد يسرد ما يُحذف). التجميع بالتاريخ (اليوم وهذا الأسبوع
// وأقدم) مع ترتيب «آخر تعديل»، بحث ورقائق الفرز بالحالات الخمس بأعدادها وترتيب، وحالتها في جزء العنوان فتبقى عند الرجوع من
// المحرّر. الصورة بتفضيل prefs.ui.thumbnails، ومعه في Firefox موافقة «نشاط التصفح» (core/consent/thumbnails.js)، والمدة من سجل الفيديو كسولًا. الحالات: تحميل وفارغة وممتلئة
// ونتيجة بحث فارغة وقسم فارغ وخطأ. كل نص عبر textContent، ونص تعليمات الترجمة لا يدخل DOM في أي حال.
import { TjError, messageFor, toErrorInfo } from '../../core/errors/index.js';
import { instructions } from '../../core/export/instructions.js';
import { parseTrackKey, watchUrl } from '../../core/model/ids.js';
import { DEFAULT_TARGET_LANG } from '../../core/model/lang-prefs.js';
import { DEFAULT_PREFS } from '../../core/model/prefs.js';

/** تعذّرت قراءة التفضيلات: الافتراضي، لكن بلا صور (لا طلب خارجي ما لم يُعرف أن المستخدم يريده؛ مراجعة الهوية L9). */
const PREFS_UNREADABLE = Object.freeze({ ...DEFAULT_PREFS, ui: Object.freeze({ ...DEFAULT_PREFS.ui, thumbnails: false }) });
import { alertBox, button, chipGroup, confirmDialog, el, emptyState, icon, ltr, statusPill } from '../../ui/components.js';
import { COUNT_FORMS, formatBytes, formatCount, offsetInline, textDirection } from '../../ui/format.js';
import { closeMenuWithin, createMenu } from '../../ui/menu.js';
import { createToaster } from '../../ui/toast.js';
import { activateSlot, applyUpload, deleteVideoData, exportArabic, exportEnglish, exportSlot, exportStudy, prepareUpload, studyName, studyNote, undoActivation } from './actions.js';
import { radioGroup } from './choice.js';
import { createCopyState } from './copy.js';
import { deleteContent } from './delete.js';
import { createExpansion } from './expand.js';
import { captureFocus, restoreFocus, toggleKeyOf } from './focus.js';
import {
  FILTERS, PAGE_SIZE, SORTS, TRANSLATION_FORMS, chipLabel, copyGate, deleteSummary, exportOptions, filterCounts, filterEntries, groupEntries,
  libraryEntries, parsePageState, rowModel, searchEntries, serializePageState, sortEntries, studyGate, translationTotal,
} from './model.js';
import { studyContent } from './study.js';
import { clip, isolate } from './text.js';
import { thumbnail } from './thumb.js';
import { thumbnailsShown } from '../../core/consent/thumbnails.js';
import { uploadContent } from './upload.js';

export { isolate };
export const COPY_TIP = 'ينسخ تعليمات الترجمة لترفقها مع ملف SRT.';
export const CAPTION = 'ترجماتك محفوظة هنا على هذا الجهاز وحده. افتح الترجمات لتقارن النسخ وتختار النشطة.';
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
 *   thumbsConsent?: () => Promise<boolean>, thumbsConsentWatch?: (fn: (e: { revoked: boolean }) => void) => () => void,
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
  // موافقة صور المحفوظات (Firefox وحده، core/consent/thumbnails.js)، وفي Chromium «نعم» بلا مدخل. سحبها من صفحة إضافات Firefox
  // لا يكتب في التخزين (تدقيق 7a66f91، U01)، فتُقرأ عند التحميل، ومع تغيّر التفضيلات، ومع أحداث الأذونات، وعند ظهور الصفحة، وقبل
  // إسناد عنوان كل صورة (gate في thumb.js). وكل قراءة بجيل: الأقدم من آخر قراءة بدأت لا يُطبَّق، بل يتبع الأحدث.
  const consentNeeded = typeof env.thumbsConsent === 'function';
  const thumbsCheck = () => Promise.resolve().then(() => (consentNeeded ? env.thumbsConsent() : true)).then((g) => g === true, () => false);
  const confirm = env.confirm ?? confirmDialog;
  const nav = env.nav ?? hashNav(doc);
  const toaster = createToaster({ doc, setTimer, clearTimer });
  const initial = parsePageState(nav.get());
  const state = {
    status: /** @type {'loading' | 'ready' | 'error'} */ ('loading'),
    /** مُلخّص الفهرس لكل فيديو ومعه ملخص الفرز ونماذج 1 2 3 (listLibrary). */
    entries: /** @type {ReturnType<typeof libraryEntries>} */ ([]),
    capacity: /** @type {import('../../core/store/capacity.js').Capacity | null} */ (null),
    /** التفضيلات: القاموس يُرفق بالتعليمات المنسوخة، و«صور الفيديو» تحكم الصورة في الصف. */
    prefs: /** @type {import('../../core/model/prefs.js').Prefs} */ (DEFAULT_PREFS),
    thumbsGranted: false,
    query: initial.query, filter: initial.filter, order: /** @type {'updated' | 'title'} */ (initial.order), limit: PAGE_SIZE,
    /** الصف المقصود بعد الرجوع من المحرّر (#v=…): يُبرَز مرة ثم يُنسى. */
    focusId: initial.focusId,
    /** الصفوف الموسَّعة (بطاقات ترجماتها ظاهرة في الصف)؛ تبقى عبر إعادة بناء القائمة. */
    expanded: /** @type {Set<string>} */ (new Set()),
    error: /** @type {{ code: string, message: string } | null} */ (null),
  };
  const copyStates = new Set();
  /** توسيعات الصفوف المعروضة (عقدها تبقى عبر إعادة الرسم فلا تومض). */
  const expansions = new Map();
  /** صور الصفوف الحالية: تتبدل بتغيّر «صور الفيديو» دون إعادة بناء القائمة. */
  const thumbs = new Set();
  /** مدد الفيديوهات من سجلاتها (بنسخة السجل)، تُقرأ كسولًا وتُحفظ فلا تُعاد قراءتها. */
  const durations = new Map();
  let durationQueue = Promise.resolve();
  let visibility = null;
  const watchers = new Map();
  let loadSeq = 0;
  let reloadTimer = null;
  /** مفتاحا التنبيهين المعروضين الآن (رمز السعة، ونص الخطأ) ولوحة الخطأ: لا يُعاد ما لم يتغير (U90). */
  let shownCapKey = '';
  /** @type {string | null} */
  let shownErrKey = null;
  /** @type {HTMLElement | null} */
  let errorPanel = null;
  let disposed = false;
  let consentGen = 0;
  /** @type {Promise<boolean>} */
  let consentLatest = Promise.resolve(false);
  /** @type {Promise<boolean> | null} قراءة جارية تشترك فيها الصور (قراءة واحدة لكل دفعة صفوف لا لكل صف). */
  let consentShared = null;

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
    syncClear();
    render();
    announceResults();
    remember();
    search.focus();
  } });
  // زر المسح مخفي والحقل فارغ: كان بشفافية 0 وهو في ترتيب Tab، فيصل إليه التركيز ولا يُرى (تدقيق 7a66f91، U58).
  const syncClear = () => { clearSearch.hidden = search.value === ''; };
  syncClear();
  const sortId = `lib-sort-${++seq}`;
  const sort = el('select', {
    className: 'tj-field__input lib-sort__select', attrs: { id: sortId, 'aria-label': 'الترتيب' },
    children: SORTS.map((x) => el('option', { text: x.label, attrs: { value: x.value }, doc })),
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
        children: [el('div', { className: 'tj-page-head__title', children: [el('h1', { className: 'tj-display', text: 'المحفوظات', doc }), countPill], doc }), el('p', { className: 'tj-caption lib-caption', text: CAPTION, doc })],
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

  /**
   * يعلن عدد المطابقات لقارئ الشاشة، ويفرّغ الإعلان بمسح البحث فلا يبقى «لا نتائج» قديمًا. «النتائج: 3 فيديوهات» بلا صفة
   * تطابق العدد («فيديوهان مطابق» كانت خطأ نحويًا، U59).
   */
  const announceResults = () => {
    const n = visible().length;
    resultsLive.textContent = state.query.trim() || state.filter !== 'all' ? (n ? `النتائج: ${formatCount(n, COUNT_FORMS.video)}` : 'لا نتائج') : '';
  };
  search.addEventListener('input', () => {
    state.query = search.value;
    state.limit = PAGE_SIZE;
    syncClear();
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
  /** رموز تعني أن ما يعرضه الصف لم يعد ما في التخزين، فتُعاد القائمة بعد رسالتها. */
  const STALE = new Set(['ST_CONFLICT', 'PG_VIDEO_GONE', 'PG_DELETE_STALE', 'PG_RESTORE_STALE', 'PG_UNDO_STALE', 'PG_SLOT_GONE']);
  /**
   * أمر برسالة خطئه. وإن كان على صف سجله لا يُقرأ (`m`) عُرضت الرسالة ومعها «حذف السجل…»، فلا تبقى مسدودة (تدقيق 7a66f91، U08).
   * @param {() => Promise<void>} fn @param {{ videoId: string, displayTitle: string } | null} [m]
   */
  async function guarded(fn, m = null) {
    try {
      await fn();
    } catch (err) {
      if (m && err instanceof TjError && err.code === 'ST_CORRUPT_RECORD') {
        toaster.show(toErrorInfo(err).message, 'danger', { action: { label: 'حذف السجل…', onClick: () => removeUnreadable(m) } });
        return;
      }
      fail(err);
      if (err instanceof TjError && STALE.has(err.code)) await load();
    }
  }

  /**
   * حذف فيديو سجله أو أحد توابعه لا يُقرأ (U08): تأكيد خاص من مُلخّص الفهرس بالعنوان والمعرّف وحدهما، والحذف ببصمة القيم كما
   * عُرضت، فإن تغيّرت قبل الموافقة لم يُحذف شيء (PG_DELETE_STALE).
   * @param {{ videoId: string, displayTitle: string }} m
   */
  async function deleteUnreadable(m) {
    const print = await store.rawPrint(m.videoId);
    const ok = await confirm({
      title: 'حذف السجل التالف لهذا الفيديو؟', confirmLabel: 'حذف نهائيًا', tone: 'danger', doc,
      content: deleteContent({
        doc, subtitle: m.displayTitle,
        summary: { items: ['كل ما حُفظ لهذا الفيديو، ومنه ما لا يمكن قراءته'], keeps: [] },
        note: `معرّف الفيديو ${isolate(m.videoId)}. لا يمكن التراجع، ولا تصدير ما لا يُقرأ.`,
      }),
    });
    if (!ok) return;
    try {
      await store.deleteVideo(m.videoId, { print });
    } catch (err) {
      if (err instanceof TjError && err.code === 'ST_CONFLICT') throw new TjError('PG_DELETE_STALE', { detail: err.detail, cause: err });
      throw err;
    }
    done('PG_UNREADABLE_DELETED');
    await load();
  }
  const removeUnreadable = (m) => guarded(() => deleteUnreadable(m));

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

  /** ما جُرّد من SRT العربي عند كتابته وما يتغير عند إعادة استيراده (تدقيق 7a66f91، U99)، بعد إشعار الحفظ. */
  const exportNotes = (notes) => {
    for (const note of notes ?? []) toaster.show(note, 'info');
  };

  const exportFile = (m, option) => guarded(async () => {
    if (option.action.type === 'ar') {
      const r = await exportArabic({ store, videoId: m.videoId, variant: option.action.variant, askTiming, save: env.saveFile });
      if (r && savedToast(r.saved)) exportNotes(r.notes);
    } else {
      const r = await exportEnglish({ store, videoId: m.videoId, trackKey: option.action.trackKey, save: env.saveFile, now });
      if (r.saveError) toaster.show(messageFor('PG_FINGERPRINT_NOT_SAVED'), 'info');
      else savedToast(r.saved);
    }
  }, m);

  /** «تصدير SRT» في بطاقة ترجمة (نشطة أو لا). */
  const exportSlotFile = (m, n) => guarded(async () => {
    const r = await exportSlot({ store, videoId: m.videoId, n, askTiming, save: env.saveFile });
    if (r && savedToast(r.saved)) exportNotes(r.notes);
  }, m);

  /** «نص دراسي…»: الصيغة واللغة ومعاينة الاسم، ثم الحفظ عبر saveFile. */
  const study = (m, entry) => guarded(async () => {
    const note = await studyNote({ store, videoId: m.videoId });
    const content = studyContent({ doc, hasEnglish: entry.english.length > 0, name: (o) => studyName({ store, videoId: m.videoId, ...o }), note });
    await content.ready;
    const ok = await confirm({ title: `نص دراسي لـ«${isolate(clip(m.displayTitle, 80))}»`, body: 'الترجمة النشطة فقرات بأوقاتها، لقراءتها أو مراجعتها خارج الفيديو.', confirmLabel: 'تنزيل', content: content.root, doc });
    if (!ok) return;
    const r = await exportStudy({ store, videoId: m.videoId, ...content.value(), save: env.saveFile });
    savedToast(r.saved);
  }, m);

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
      const pending = confirm({ title: `رفع ترجمة لـ«${isolate(clip(m.displayTitle, 80))}»`, confirmLabel: labelFor(view.replace()), content: view.root, doc });
      confirmBtn = view.root.closest?.('form')?.querySelector('button[value="confirm"]') ?? null;
      if (!(await pending)) return;
      const choice = view.choice();
      const info = await applyUpload({ store, bundle: prep.bundle, settings: prep.settings, result: prep.result, ...choice, now });
      toaster.show(messageFor(info.replaced ? 'PG_UPLOAD_REPLACED' : 'PG_UPLOAD_SAVED', { n: choice.n }), 'success');
      if (info.offsetWas !== 0) toaster.show(messageFor('ST_OFFSET_RESET'), 'info');
      wrote = true;
      await load();
    }, m);
    return wrote;
  }

  /** شريحة الترجمة النشطة في صف الفيديو (وجهة التركيز بعد زوال رسالة «تراجع» وهو فيها). */
  const activeChipOf = (videoId) => listHost.querySelector(`li[data-video="${videoId}"] .lib-chip--active`)
    ?? listHost.querySelector(`li[data-video="${videoId}"]`);

  /**
   * اختيار شريحة في الصف: يفعّل الخانة برسالة عابرة فيها «تراجع». والإعلان يذكر الفعل وطريقي التراجع (U58): الرسالة في آخر
   * الصفحة بعيدة عن لوحة المفاتيح، والضغط على الشريحة السابقة يعيدها؛ والرسالة تثبت ما دام المؤشر أو التركيز فيها، وزوالها
   * وفيها التركيز يعيده إلى الشريحة النشطة في الصف.
   */
  const activate = (m, n) => guarded(async () => {
    const { before, after } = await activateSlot({ store, videoId: m.videoId, n, now });
    await load();
    // «تراجع» على الحزمة التي تركها التفعيل وحدها: تفعيلٌ من تبويب آخر في الأثناء لا يُفرض فوقه (U95).
    const undo = before && before !== n;
    toaster.show(messageFor('PG_SLOT_ACTIVATED', { n }), 'success', {
      ...(undo ? {
        action: { label: 'تراجع', onClick: () => guarded(async () => { await undoActivation({ store, videoId: m.videoId, n: before, expect: after, now }); await load(); }) },
        announce: `${messageFor('PG_SLOT_ACTIVATED', { n })}. ${messageFor('PG_SLOT_UNDO_HINT', { n: before })}`,
      } : {}),
      focusAfter: () => activeChipOf(m.videoId),
    });
  }, m);

  /**
   * حذف بتأكيد يسرد ما يُحذف بالضبط من بيانات الفيديو الفعلية (deleteSummary)، لا نصًا ثابتًا: الترجمة النشطة وحدها
   * (يبقى غيرها والمسار الإنجليزي والنسخة السابقة) أو كل بيانات الفيديو. التنفيذ بالخانة التي سُردت وبالحزمة التي بُني عليها
   * الحوار: إن تغيّرت قبل الموافقة (تفعيل ترجمة أخرى من تبويب آخر مثلًا) لا يُحذف شيء وتُعاد القائمة (PG_DELETE_STALE).
   */
  const removeData = (m, scope) => guarded(async () => {
    let b;
    try {
      b = await store.getBundle(m.videoId);
    } catch (err) {
      // «حذف بيانات الفيديو…» على سجل لا يُقرأ: التأكيد الخاص به (U08). والحذف الجزئي يعرض الرسالة ومعها المخرج نفسه.
      if (scope === 'all' && err instanceof TjError && err.code === 'ST_CORRUPT_RECORD') return deleteUnreadable(m);
      throw err;
    }
    if (!b) throw new TjError('PG_VIDEO_GONE');
    if (scope === 'arabic' && b.active === null) throw new TjError('PG_NO_ARABIC');
    const all = scope === 'all';
    const n = b.active;
    const hasTranslations = b.slots.some((x) => x.track);
    const summary = deleteSummary(b, all ? { scope: 'all' } : { scope: 'slot', n });
    const ok = await confirm({
      title: all ? 'حذف بيانات هذا الفيديو؟' : `حذف الترجمة النشطة (${n})؟`,
      confirmLabel: all ? 'حذف نهائيًا' : 'حذف', tone: 'danger', doc,
      content: deleteContent({ doc, subtitle: m.displayTitle, summary, note: hasTranslations ? `لا يمكن التراجع. صدّر ${all ? 'الترجمات' : 'الترجمة'} أولًا إن كنت قد تحتاجها.` : 'لا يمكن التراجع.' }),
    });
    if (!ok) return;
    await deleteVideoData({ store, videoId: m.videoId, scope, n: all ? undefined : n, expect: b, now });
    done(all ? 'PG_DELETE_ALL_DONE' : 'PG_DELETE_ARABIC_DONE');
    await load();
  }, m);

  /** «نسخ التعليمات» من «المزيد»: النص يُبنى عند الضغطة وحدها من العنوان والمعرّف والقاموس المرفق، ويُسلَّم إلى الحافظة ولا يُعرض. */
  const copyInstructions = (m, entry) => {
    const copy = createCopyState({
      // AA3: بزوج الفيديو المحفوظ. حتى ذلك الحين لغة أول مسار محفوظ (وإلا en كما كانت) والهدف الافتراضي.
      buildText: () => instructions({
        videoId: entry.videoId, title: entry.title, glossary: state.prefs.glossary.attach ? state.prefs.glossary.terms : null,
        source: (entry.english?.[0] && parseTrackKey(entry.english[0].key)?.lang) || 'en', target: DEFAULT_TARGET_LANG,
      }),
      write: (text) => env.clipboardWrite(text),
      announce: (code) => {
        if (code === 'PG_COPY_DONE') toaster.show(`${messageFor(code)} ‹${isolate(clip(m.accessName, 40))}›`, 'success');
        else toaster.show(messageFor(code), 'danger');
      },
      onState: () => {},
      setTimer, clearTimer,
    });
    copyStates.add(copy);
    return copy.copy();
  };

  // ---- المدة والصورة ----
  /** يقرأ مدة الفيديو من سجله مرة لكل نسخة ويضعها على صورته؛ قراءة واحدة في كل مرة فلا تتكدس سجلات كاملة في الذاكرة. */
  function wantDuration(entry, thumb) {
    const key = `${entry.videoId}|${entry.rev}`;
    if (durations.has(key)) {
      thumb.setDuration(durations.get(key));
      return;
    }
    durationQueue = durationQueue.then(async () => {
      if (disposed) return;
      if (!durations.has(key)) {
        let ms = null;
        try {
          ms = (await store.getVideo(entry.videoId))?.durationMs ?? null;
        } catch {
          ms = null;
        }
        durations.set(key, ms);
      }
      thumb.setDuration(durations.get(key));
    }).catch(() => {});
  }

  /** الصف المرئي (أو قريب من الشاشة) وحده يقرأ مدته إن وُجد IntersectionObserver؛ وإلا فعلى الفور. */
  function whenVisible(node, fn) {
    if (!visibility) {
      fn();
      return;
    }
    watchers.set(node, fn);
    visibility.observe(node);
  }

  // ---- موافقة الصور ----
  const thumbsOn = () => thumbnailsShown(state.prefs.ui.thumbnails, state.thumbsGranted);
  const applyThumbs = () => { for (const t of thumbs) t.setEnabled(thumbsOn()); };
  /** قراءة الموافقة الآن: آخر قراءة بدأت هي الحاكمة، فتُطبَّق على الحالة والصور الحالية، والأقدم تعيد نتيجتها. */
  function readConsent() {
    const gen = ++consentGen;
    const p = thumbsCheck().then((g) => {
      if (gen !== consentGen) return consentLatest;
      if (!disposed && state.thumbsGranted !== g) {
        state.thumbsGranted = g;
        applyThumbs();
      }
      return g;
    });
    consentLatest = p;
    return p;
  }
  /** بوابة الصورة قبل إسناد عنوانها: قراءة مشتركة جارية أو جديدة، والموافقة والمفتاح معًا. */
  const thumbGate = () => {
    if (!consentShared) consentShared = readConsent().finally(() => { consentShared = null; });
    return consentShared.then(() => !disposed && thumbsOn());
  };
  /** سحبٌ من صفحة الإضافات: الصور تُطفأ في الحال، والقراءات الجارية قبله تُسقط، ثم قراءة تؤكد. */
  function onConsentEvent({ revoked }) {
    if (disposed) return;
    if (revoked) {
      consentGen++;
      consentLatest = Promise.resolve(false);
      state.thumbsGranted = false;
      applyThumbs();
    }
    readConsent();
  }

  // ---- الصف ----
  /**
   * شريحة خانة موجودة: الرقم والاسم المختصر، والنشطة بالإبراز ومعيّن وaria-pressed؛ والضغط على غير النشطة يفعّلها. زر تبديل في
   * شريط أدوات لا خيار في مجموعة خيارات: الأسهم تنقل التركيز ولا تفعّل (التفعيل يغيّر المحفوظ وله رسالة تراجع).
   */
  function slotChip(m, s, focusable) {
    const label = chipLabel(s);
    const base = s.name ? `الترجمة ${s.n} — ${s.name}` : `الترجمة ${s.n}`;
    const b = el('button', {
      className: `lib-chip${s.active ? ' lib-chip--active' : ''}`,
      attrs: {
        type: 'button', 'aria-pressed': s.active ? 'true' : 'false', 'data-slot': String(s.n), 'data-fk': `${m.videoId}:chip-${s.n}`,
        tabindex: focusable ? '0' : '-1', title: s.active ? `${base} (النشطة)${m.offsetText ? ` — ${m.offsetText}` : ''}` : `${base} — اضغط لتفعيلها`,
      },
      children: [el('i', { className: 'lib-chip__mark', attrs: { 'aria-hidden': 'true' }, doc }), el('span', { className: 'lib-chip__text', text: label, doc })],
      doc,
    });
    b.addEventListener('click', () => {
      if (!s.active) activate(m, s.n);
    });
    return b;
  }

  /** الشريحة المتقطّعة: الخانة الفارغة التالية إجراء رفع إليها (لا نسخة تُعرض). */
  function addChip(m, n) {
    const b = el('button', {
      className: 'lib-chip lib-chip--add',
      attrs: { type: 'button', 'data-slot': String(n), 'data-fk': `${m.videoId}:chip-add`, title: `رفع ترجمة إلى الخانة ${n}`, 'aria-description': `رفع ترجمة إلى الخانة ${n}` },
      children: [el('span', { className: 'lib-chip__text', text: `${n} · فارغة`, doc })],
      doc,
    });
    b.addEventListener('click', () => { upload(m, n); });
    return b;
  }

  /** عمود «الترجمات»: شريحة لكل ترجمة موجودة وشريحة الرفع التالية، أو حالة «لا ترجمة» بحال الأصل الإنجليزي الحقيقية. */
  function translationsColumn(m) {
    const labelId = `lib-trs-${++seq}`;
    const label = el('span', { className: 'lib-trs__label', text: 'الترجمات', attrs: { id: labelId }, doc });
    if (!m.filled.length) {
      return el('div', { className: 'lib-trs lib-trs--none', children: [label, el('span', { className: 'lib-trs__none', text: `لا ترجمة عربية بعد · ${m.sourceText}`, doc })], doc });
    }
    const focusAt = m.filled.find((s) => s.active) ?? m.filled[0];
    const group = el('div', { className: 'lib-chips', attrs: { role: 'toolbar', 'aria-labelledby': labelId }, children: m.filled.map((s) => slotChip(m, s, s.n === focusAt.n)), doc });
    // الأسهم تنقل التركيز بين الشرائح (بترتيب العرض: اليسار هو التالي في RTL) ونقطة Tab معه، والتنشيط بـEnter أو المسافة.
    // children مجموعة HTMLCollection لا مصفوفة: تُنسخ قبل indexOf.
    group.addEventListener('keydown', (e) => {
      const forward = e.key === 'ArrowLeft' || e.key === 'ArrowDown';
      if (!forward && e.key !== 'ArrowRight' && e.key !== 'ArrowUp') return;
      const list = [...group.children];
      const at = list.indexOf(doc.activeElement);
      if (at === -1 || list.length < 2) return;
      e.preventDefault();
      const next = list[(at + (forward ? 1 : -1) + list.length) % list.length];
      for (const c of list) c.setAttribute('tabindex', c === next ? '0' : '-1');
      next.focus();
    });
    return el('div', { className: 'lib-trs', children: [label, el('div', { className: 'lib-trs__chips', children: [group, m.nextEmpty ? addChip(m, m.nextEmpty) : null], doc })], doc });
  }

  function buildRow(entry, nowMs) {
    const m = rowModel(entry, nowMs);
    const titleId = `lib-title-${++seq}`;
    const name = (verb) => `${verb}: ${m.accessName}`;
    const fk = (k) => `${entry.videoId}:${k}`;
    const keyed = (node, k) => {
      node.setAttribute('data-fk', fk(k));
      return node;
    };
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
    keyed(idCopy, 'idcopy');

    // الصورة والمدة.
    const cached = durations.get(`${entry.videoId}|${entry.rev}`);
    const thumb = thumbnail({ doc, videoId: entry.videoId, enabled: thumbsOn(), durationMs: cached ?? null, gate: consentNeeded ? thumbGate : null });
    thumbs.add(thumb);
    whenVisible(thumb.root, () => {
      thumb.arm();
      wantDuration(entry, thumb);
    });

    // الشارة الوحيدة.
    const st = m.status;
    const pill = statusPill({ tone: st.tone, text: st.text, plain: st.tone === 'neutral' || st.id === 'edited', title: st.title, doc });
    if (st.id === 'edited') pill.prepend(icon('edit', { doc }));

    // سطر «المعرّف · عُدّل منذ · N مقطعًا».
    const sep = () => el('span', { className: 'lib-row__sep', text: '·', attrs: { 'aria-hidden': 'true' }, doc });
    const line = [
      el('span', { className: 'lib-row__id', children: [ltr(entry.videoId, { doc }), idCopy], doc }),
      m.whenText ? el('span', { className: 'tj-caption lib-row__when', text: m.whenText, attrs: { title: m.absolute }, doc }) : null,
      m.countText ? el('span', { className: 'tj-caption lib-row__count', text: m.countText, doc }) : null,
    ].filter(Boolean);
    const metaKids = line.flatMap((node, i) => (i ? [sep(), node] : [node]));

    // الأفعال.
    const exportItems = exportOptions(entry).map((o) => ({ id: o.id, label: o.label, hint: o.hint, disabledReason: o.disabledReason, icon: 'download', onSelect: () => exportFile(m, o) }));
    const gate = copyGate(entry);
    const moreMenu = createMenu({
      label: 'المزيد', ariaLabel: name('المزيد'), icon: 'more', iconOnly: true, variant: 'ghost', className: 'lib-more', doc,
      items: [
        { kind: 'group', label: 'تصدير' },
        ...exportItems,
        { id: 'study', label: 'نص دراسي…', icon: 'editor', disabledReason: studyGate(entry), onSelect: () => study(m, entry) },
        { kind: 'separator' },
        { id: 'upload', label: 'رفع ترجمة…', icon: 'upload', onSelect: () => upload(m) },
        { id: 'copy', label: 'نسخ التعليمات', icon: 'copy', hint: COPY_TIP, disabledReason: gate.enabled ? null : gate.reason, onSelect: () => copyInstructions(m, entry) },
        { kind: 'separator' },
        ...(m.hasArabic ? [{ id: 'delete-active', label: 'حذف الترجمة النشطة…', tone: /** @type {const} */ ('danger'), icon: 'trash', onSelect: () => removeData(m, 'arabic') }] : []),
        { id: 'delete-all', label: 'حذف بيانات الفيديو…', tone: /** @type {const} */ ('danger'), icon: 'trash', onSelect: () => removeData(m, 'all') },
      ],
    });
    keyed(moreMenu.button, 'more');
    const primary = m.hasArabic
      ? button({ label: 'تحرير', variant: 'secondary', size: 'sm', title: name('تحرير'), doc, onClick: () => guarded(async () => { state.focusId = entry.videoId; remember(); await env.openPage('editor', { v: entry.videoId }); }) })
      : button({ label: 'رفع ترجمة', icon: 'upload', variant: 'primary', size: 'sm', title: name('رفع ترجمة'), doc, onClick: () => upload(m, m.nextEmpty) });
    primary.setAttribute('aria-label', name(m.hasArabic ? 'تحرير' : 'رفع ترجمة'));
    keyed(primary, m.hasArabic ? 'edit' : 'upload');
    const open = keyed(button({ label: name('فتح الفيديو'), iconOnly: true, icon: 'play', variant: 'ghost', size: 'sm', className: 'lib-open', title: 'فتح الفيديو على يوتيوب', doc, onClick: () => guarded(async () => { await env.openTab(watchUrl(entry.videoId)); }) }), 'open');

    // التوسيع في الصف: بطاقات الترجمات الموجودة (expand.js)، يُنشأ عند أول فتح ويبقى عبر إعادة الرسم.
    // الصف نفسه وجهة تركيز (بعد زوال صف مجاور، والرجوع من المحرّر): بمفتاح فيبقى عبر إعادة الرسم في الخلفية (U50).
    const li = el('li', {
      className: 'lib-row', attrs: { 'aria-labelledby': titleId, 'data-video': entry.videoId, 'data-fk': fk('row'), tabindex: '-1' },
      doc,
    });
    const expandable = m.filled.length > 0;
    const toggle = expandable ? keyed(button({ label: 'إظهار الترجمات', iconOnly: true, icon: 'chevron', variant: 'ghost', size: 'sm', className: 'lib-toggle', doc, onClick: () => setExpanded(!state.expanded.has(entry.videoId)) }), 'toggle') : null;
    function ensureExpansion() {
      let ctl = expansions.get(entry.videoId);
      if (!ctl) {
        ctl = createExpansion({
          doc, store, videoId: entry.videoId, title: m.displayTitle, now, confirm, toaster,
          onChanged: () => load(), upload: (n) => upload(m, n), exportSlot: (n) => exportSlotFile(m, n),
        });
        expansions.set(entry.videoId, ctl);
      }
      return ctl;
    }
    function setExpanded(on) {
      if (!toggle) return;
      if (on) {
        state.expanded.add(entry.videoId);
        const ctl = ensureExpansion();
        li.append(ctl.root);
        toggle.setAttribute('aria-controls', ctl.id);
        ctl.refresh();
      } else {
        state.expanded.delete(entry.videoId);
        const ctl = expansions.get(entry.videoId);
        ctl?.dispose();
        ctl?.root.remove();
        expansions.delete(entry.videoId);
        toggle.removeAttribute('aria-controls');
      }
      const text = on ? 'إخفاء الترجمات' : 'إظهار الترجمات';
      toggle.setAttribute('aria-expanded', on ? 'true' : 'false');
      toggle.setAttribute('aria-label', name(text));
      toggle.title = text;
      li.classList.toggle('lib-row--open', on);
    }

    li.append(el('div', {
      className: 'lib-row__grid',
      children: [
        thumb.root,
        el('div', {
          className: 'lib-row__main',
          children: [
            el('h3', { className: `tj-h4 tj-auto lib-row__title${m.hasTitle ? '' : ' lib-row__title--empty'}`, text: m.displayTitle, dir: textDirection(m.displayTitle), attrs: { id: titleId, ...(m.hasTitle ? { title: m.displayTitle } : {}) }, doc }),
            el('div', { className: 'lib-row__meta', children: metaKids, doc }),
            el('div', { className: 'lib-row__status', children: [pill], doc }),
          ],
          doc,
        }),
        translationsColumn(m),
        el('div', { className: 'lib-row__actions', children: [primary, open, toggle, moreMenu.root], doc }),
      ],
      doc,
    }));
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', name('إظهار الترجمات'));
      toggle.title = 'إظهار الترجمات';
      if (state.expanded.has(entry.videoId)) setExpanded(true);
    } else state.expanded.delete(entry.videoId);
    return li;
  }

  // ---- الحالات ----
  /** هيكل بارتفاع الصف الحقيقي (صورة 128×72 وسطران). */
  function skeletonRows() {
    const row = () => el('div', {
      className: 'lib-row lib-row--skeleton',
      children: [el('div', { className: 'tj-skeleton lib-skel-thumb', doc }), el('div', { className: 'lib-skel-lines', children: [el('div', { className: 'tj-skeleton lib-skel-a', doc }), el('div', { className: 'tj-skeleton lib-skel-b', doc })], doc })],
      doc,
    });
    return el('div', { className: 'lib-skeleton', attrs: { 'aria-busy': 'true', 'aria-label': 'جارٍ قراءة المحفوظات' }, children: [row(), row(), row()], doc });
  }

  /** لوحة حالة (فارغة أو بلا نتائج أو خطأ) في صندوق الصفحة. */
  const statePanel = (node, tone = '') => el('div', { className: `lib-state${tone ? ` lib-state--${tone}` : ''}`, attrs: tone === 'error' ? { role: 'alert' } : {}, children: [node], doc });

  function renderMeta() {
    countPill.textContent = state.status === 'ready' ? `${formatCount(state.entries.length, COUNT_FORMS.video)} · ${formatCount(translationTotal(state.entries), TRANSLATION_FORMS)}` : '';
    countPill.hidden = state.status !== 'ready';
    chips.setCounts(state.status === 'ready' ? filterCounts(state.entries) : {});
    quotaHost.replaceChildren();
    const cap = state.capacity;
    // التنبيه role=alert يُعاد بناؤه حين يتغير رمزه وحده: كان يُدرج من جديد مع كل حرف في البحث فيُقرأ مرة بعد مرة (U90).
    const capKey = cap?.code ? `${cap.code}|${cap.level}` : '';
    if (capKey !== shownCapKey) {
      shownCapKey = capKey;
      capacityAlert.replaceChildren();
      if (cap?.code) capacityAlert.append(alertBox({ tone: cap.level === 'full' ? 'danger' : 'warning', text: messageFor(cap.code), doc }));
    }
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
  }

  /** أقسام التاريخ حين الترتيب «آخر تعديل»، وقائمة واحدة حين الترتيب بالعنوان. أعداد الأقسام على كل المطابقات لا المعروض وحده. */
  function listNodes(shown, slice, nowMs) {
    const list = (rows) => el('ul', { className: 'lib-list', attrs: { role: 'list' }, children: rows.map((e) => buildRow(e, nowMs)), doc });
    if (state.order !== 'updated') return [el('h2', { className: 'tj-sr-only', text: 'المحفوظات مرتبة بالعنوان', doc }), list(slice)];
    const totals = Object.fromEntries(groupEntries(shown, nowMs).map((g) => [g.key, g.entries.length]));
    return groupEntries(slice, nowMs).map((g) => el('section', {
      className: 'lib-group', attrs: { 'data-group': g.key },
      children: [
        el('div', { className: 'lib-group__head', children: [el('h2', { className: 'lib-group__title', text: g.label, doc }), el('span', { className: 'lib-group__n', text: String(totals[g.key]), doc }), el('hr', { className: 'lib-group__rule', doc })], doc }),
        list(g.entries),
      ],
      doc,
    }));
  }

  function render() {
    // بند «المزيد» المفتوح يُلتقط بمفتاح زره، والقائمة تُغلق قبل الهدم فلا يبقى مستمعها على المستند (U58).
    const keep = captureFocus(doc, listHost);
    closeMenuWithin(listHost);
    // ترتيب الصفوف قبل الرسم: إن زال صف التركيز (حذف بيانات الفيديو) فإلى الصف بعده أو قبله (U50).
    const rowsBefore = keep ? [...listHost.querySelectorAll('li.lib-row')].map((r) => r.getAttribute('data-video')) : [];
    renderMeta();
    // لوحة الخطأ role=alert نفسها تبقى ما دام الخطأ نفسه: كانت تُدرج من جديد مع كل حرف في البحث (U90).
    const errKey = state.status === 'error' ? `${state.error?.code ?? ''}|${state.error?.message ?? ''}` : null;
    if (errKey !== null && errKey === shownErrKey && listHost.contains(errorPanel)) return;
    shownErrKey = errKey;
    listHost.replaceChildren();
    for (const c of copyStates) c.dispose();
    copyStates.clear();
    thumbs.clear();
    visibility?.disconnect();
    watchers.clear();
    const IO = doc.defaultView?.IntersectionObserver;
    visibility = IO ? new IO((records) => {
      for (const r of records) {
        if (!r.isIntersecting) continue;
        const fn = watchers.get(r.target);
        watchers.delete(r.target);
        visibility?.unobserve(r.target);
        fn?.();
      }
    }, { rootMargin: '300px' }) : null;
    toolbar.hidden = state.status === 'ready' && !state.entries.length;
    if (state.status === 'loading') {
      listHost.append(skeletonRows());
      return;
    }
    if (state.status === 'error') {
      const copyDiag = button({
        label: 'نسخ تقرير التشخيص', icon: 'copy', variant: 'ghost', size: 'sm', doc,
        onClick: async () => {
          try {
            await env.clipboardWrite(await env.diagnosticsText());
            toaster.show(messageFor('PG_DIAGNOSTICS_DONE'), 'success');
          } catch {
            toaster.show(messageFor('PG_DIAGNOSTICS_FAILED'), 'danger');
          }
        },
      });
      const retry = button({ label: 'إعادة المحاولة', icon: 'restore', variant: 'secondary', size: 'sm', doc, onClick: () => { state.status = 'loading'; render(); load(); } });
      errorPanel = statePanel(emptyState({
        icon: 'danger', title: 'تعذّرت قراءة المحفوظات',
        text: `${state.error?.message ?? messageFor('PG_LIST_FAILED')} (${state.error?.code ?? 'ST_READ_FAILED'})`,
        action: el('div', { className: 'lib-state__actions', children: [retry, copyDiag], doc }), doc,
      }), 'error');
      listHost.append(errorPanel);
      return;
    }
    if (!state.entries.length) {
      listHost.append(statePanel(emptyState({
        icon: 'library', title: 'لا ترجمات محفوظة بعد', text: 'كل فيديو تحمّل أصله أو ترفع ترجمته يُحفظ هنا تلقائيًا.',
        steps: ['افتح فيديو على يوتيوب', 'اضغط زر التنزيل في شريط المشغّل', 'ارفع ملفك العربي من زر الترجمة'], doc,
      })));
      return;
    }
    const shown = visible();
    if (!shown.length) {
      if (state.query.trim()) {
        const clear = button({ label: 'مسح البحث', icon: 'x', variant: 'secondary', size: 'sm', doc, onClick: () => { search.value = ''; state.query = ''; render(); announceResults(); remember(); search.focus(); } });
        listHost.append(statePanel(emptyState({ icon: 'search', title: `لا نتائج لـ«${isolate(clip(state.query.trim(), 60))}»`, text: 'البحث في العناوين والمعرّفات. جرّب كلمة أقصر أو المعرّف.', action: clear, doc })));
      } else {
        const all = button({ label: 'عرض الكل', variant: 'secondary', size: 'sm', doc, onClick: () => { state.filter = 'all'; chips.set('all'); render(); announceResults(); remember(); } });
        listHost.append(statePanel(emptyState({ icon: 'list', title: 'لا فيديوهات في هذا القسم', text: 'اختر قسمًا آخر أو اعرض الكل.', action: all, doc })));
      }
      return;
    }
    // الصف المقصود بعد الرجوع خارج الصفحات المعروضة: تُوسَّع حتى تشمله (تدقيق 5fedcb9، GM-016.3).
    if (state.focusId) {
      const at = shown.findIndex((x) => x.videoId === state.focusId);
      if (at >= state.limit) state.limit = Math.ceil((at + 1) / PAGE_SIZE) * PAGE_SIZE;
    }
    const slice = shown.slice(0, state.limit);
    listHost.append(...listNodes(shown, slice, now()));
    // توسيعات الصفوف التي لم تعد معروضة (تصفية أو بحث أو حذف) تُترك؛ وتُنشأ من جديد حين تعود.
    const present = new Set(slice.map((x) => x.videoId));
    for (const [id, ctl] of expansions) {
      if (present.has(id)) continue;
      ctl.dispose();
      expansions.delete(id);
    }
    if (shown.length > slice.length) {
      listHost.append(button({
        label: `عرض المزيد (${formatCount(shown.length - slice.length, COUNT_FORMS.video)})`, variant: 'secondary', className: 'lib-more-rows', doc,
        // الزر يزول بإعادة الرسم: التركيز إلى أول صف جديد (U58)، لا إلى body.
        onClick: () => {
          const first = state.limit;
          state.limit += PAGE_SIZE;
          render();
          listHost.querySelectorAll('li.lib-row')[first]?.focus?.({ preventScroll: false });
        },
      }));
    }
    if (keep && !restoreFocus(listHost, keep, toggleKeyOf(keep))) {
      const gone = keep.split(':')[0];
      const at = rowsBefore.indexOf(gone);
      const near = [...rowsBefore.slice(at + 1), ...rowsBefore.slice(0, Math.max(0, at)).reverse()];
      const row = near.map((id) => listHost.querySelector(`li[data-video="${id}"]`)).find(Boolean);
      if (row) row.focus?.({ preventScroll: true });
      else search.focus?.({ preventScroll: true });
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
      // السعة معلومة جانبية: فشل قياسها (getBytesInUse غائبة أو رفض عابر، تدقيق 7a66f91 U03) يخفي سطرها ولا يُسقط القائمة.
      const [items, capacity, prefs, thumbsGranted] = await Promise.all([store.listLibrary(), store.capacity().catch(() => null), store.getPrefs().catch(() => PREFS_UNREADABLE), readConsent()]);
      if (mine !== loadSeq) return;
      Object.assign(state, { entries: libraryEntries(items), capacity, prefs, thumbsGranted, status: 'ready', error: null });
    } catch (err) {
      if (mine !== loadSeq) return;
      const info = toErrorInfo(err);
      Object.assign(state, { status: 'error', error: { code: info.code, message: info.message } });
    }
    render();
  }

  const unsubscribe = store.onChange((change) => {
    // التفضيلات: القاموس يُقرأ عند ضغطة النسخ، و«صور الفيديو» تُطبَّق على الصور الحالية دون إعادة بناء القائمة.
    if (change.prefs) {
      // والموافقة تُقرأ معها (Firefox): تفعيل المفتاح من الإعدادات يمنحها ثم يكتب التفضيل.
      Promise.all([store.getPrefs(), readConsent()]).then(([p]) => {
        state.prefs = p;
        applyThumbs();
      }).catch(() => {});
    }
    // تغيّر الإعدادات من صفحة أخرى لا يمسّ القائمة: إعادة بنائها تهدم التركيز والقائمة المفتوحة.
    if (!Object.keys(change.videos).length && !change.index && !change.cleared && !change.bundles.length) return;
    if (reloadTimer !== null) clearTimer(reloadTimer);
    reloadTimer = setTimer(() => {
      reloadTimer = null;
      load();
    }, 200);
  });

  const onVisible = () => {
    if (doc.visibilityState === 'hidden') return;
    // العودة من صفحة إضافات Firefox بعد سحب الموافقة: تُعاد القراءة قبل أي تمرير (U01).
    if (consentNeeded) readConsent();
    if (state.focusId && state.status === 'ready') render();
  };
  doc.addEventListener?.('visibilitychange', onVisible);
  const win = doc.defaultView ?? null;
  const onPageShow = () => { if (consentNeeded) readConsent(); };
  win?.addEventListener?.('pageshow', onPageShow);
  const unwatchConsent = consentNeeded && typeof env.thumbsConsentWatch === 'function' ? env.thumbsConsentWatch(onConsentEvent) : () => {};

  render();

  return {
    root, state, toaster, load,
    dispose() {
      disposed = true;
      unsubscribe();
      unwatchConsent();
      doc.removeEventListener?.('visibilitychange', onVisible);
      win?.removeEventListener?.('pageshow', onPageShow);
      if (reloadTimer !== null) clearTimer(reloadTimer);
      visibility?.disconnect();
      for (const c of copyStates) c.dispose();
      for (const ctl of expansions.values()) ctl.dispose();
    },
  };
}
