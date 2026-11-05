// جلسة الأدوات على مشغّل بعينه (P6): تجمع حالة المتحكم وحالة الشريط وحالة الواجهة المحلية (أي قائمة مفتوحة، وما
// يكتبه المستخدم، وما يجري) في عرض واحد: المجموعة في الشريط، والقوائم والتلميحات والرسائل في الطبقة. لا تكتب في
// التخزين إلا عبر أفعال المتحكم، ولا ترمي إليه: الإخفاق رمز في التشخيص، أو رسالة مفهومة للمستخدم إن خصّ فعله.
import { TjError, messageFor, toErrorInfo } from '../../core/errors/index.js';
import { lookupMs } from '../../core/model/timing.js';
import { formatOffset } from '../../ui/format.js';
import { SELECTORS, getChromeBottom, getMainVideo, getRightControls, isAdShowing, isLiveNow } from '../youtube-dom.js';
import { fitSize, watchBar } from './bar.js';
import { attachedGlossary, copyText, loadIntoFor, nameHintFor, partSizes, prepareExport, readFor, recordFor, saveFiles } from './flows.js';
import { createGroup } from './group.js';
import { createLayer } from './layer.js';
import { builder, confirmMenu, displayMenu, downloadMenu, stepText, timingMenu } from './menus.js';
import { defaultTarget, keepEditsPlan, manualEdits } from './replace.js';
import { nearestCueIndex, sentenceWindow, syncOffset, visibleCueIndex, windowAround } from './sentence.js';
import {
  LABELS, badgeTip, comparisonSummary, downloadedLine, downloadedParts, markToast, minusTip, nameOtherLine, nudgeFlash, offsetToast, parseSeconds, plusTip, shortTime, syncUndoStale,
  slotToast, withState,
} from './text.js';

export const TOAST_MS = 3000;
export const FLASH_MS = 1000;
/** إعادة حساب أحجام الأجزاء بعد توقف الكتابة في حقل الحجم. */
export const PREVIEW_MS = 250;
/** رسالة فيها «تراجع» تبقى أطول قليلًا من العابرة: وقت كافٍ للقرار دون أن تبقى فوق الفيديو. */
export const UNDO_MS = 6000;
/** التلميح يبقى هذه المدة بعد مغادرة المؤشر زرَّه، فيمكن المرور فوقه (WCAG 1.4.13؛ تدقيق 7a66f91، U89). */
export const TIP_HIDE_MS = 300;
const MAX_TOASTS = 3;
const MAX_OFFSET_S = 600;
const SPLIT = Object.freeze({ min: 50, max: 2000 });
const STEP = Object.freeze({ min: 100, max: 10000 });
const PRESET_STEPS = [500, 1000];
const SENTENCE_STEP = 7;
const KIND_ORDER = { manual: 0, asr: 1 };
/** رفض يعني أن المشغّل يعرض مسارًا غير الإنجليزية الأصلية: يُرشد إلى اختيار English بخطوات (R64). */
const NOT_ENGLISH = new Set(['EX_NOT_ENGLISH', 'EX_TRANSLATED_TRACK']);
/** Brave قد يختار العربية أولًا؛ يُعرف من علامته في المتصفح نفسه. @param {Navigator | undefined} nav */
const isBrave = (nav) => !!nav && (typeof nav.brave === 'object' || (Array.isArray(nav.userAgentData?.brands) && nav.userAgentData.brands.some((b) => /brave/i.test(String(b?.brand)))));
/** حجم الجزء من نصه، أو null خارج الحدود. @param {unknown} raw */
const splitSizeOf = (raw) => {
  const n = Number(String(raw ?? '').trim());
  return Number.isInteger(n) && n >= SPLIT.min && n <= SPLIT.max ? n : null;
};
/** زر كل قائمة: موضعها فوقه، وإليه يعود التركيز عند إغلاقها. */
const ANCHOR = { download: 'download', display: 'upload', confirm: 'upload', timing: 'badge' };
// حوارات غير نمطية كلها: فيها عناوين ومجموعات اختيار وحقول وأزرار، لا بنود قائمة (تدقيق 7a66f91، U44).
const ROLE = { download: 'dialog', display: 'dialog', confirm: 'dialog', timing: 'dialog' };
const TITLE = { download: LABELS.downloadTitle, display: LABELS.displayTitle, confirm: LABELS.confirmTitle, timing: LABELS.timingTitle };

/** «جزآن»، «3 أجزاء»، «11 جزءًا» بعد «✓ نُزّل». @param {number} n */
const partsLabel = (n) => (n === 2 ? 'جزآن' : n % 100 >= 3 && n % 100 <= 10 ? `${n} أجزاء` : `${n} جزءًا`);
const signOf = (ms) => (Math.round(ms / 100) === 0 ? 'zero' : ms > 0 ? 'positive' : 'negative');
const okTracks = (s) => s.captured.filter((t) => t.ok && t.cueCount > 0).sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
/** نماذج 1 2 3 من المتحكم؛ وحالة بلا خانات (متحكم الإصدار الأول) ترجمة واحدة في الخانة 1 نشطة. */
const slotsOf = (s) => (Array.isArray(s.slots) && s.slots.length === 3 ? s.slots.map(({ n, filled, active, name }) => ({ n, filled, active, name }))
  : [{ n: 1, filled: !!s.arabic, active: !!s.arabic, name: null }, { n: 2, filled: false, active: false, name: null }, { n: 3, filled: false, active: false, name: null }]);

/** حالة الواجهة المحلية لفيديو واحد؛ تُستبدل كلها عند تبدّل الفيديو فلا يبقى شيء من السابق. */
function freshUi(videoId) {
  return {
    videoId,
    open: /** @type {null | 'download' | 'display' | 'confirm' | 'timing'} */ (null),
    hint: /** @type {string | null} */ (null),
    /** تلميح الزر الذي أخفاه Esc: لا يعود حتى يغادره المؤشر أو التركيز (U89). */
    tipMuted: /** @type {string | null} */ (null),
    flash: /** @type {string | null} */ (null),
    copyBusy: false,
    switching: false,
    download: {
      key: null, mode: null, why: false, fallback: false, split: false, splitSize: null, splitError: null, busy: false,
      saveLine: null, copyLine: null, result: [], preview: null,
    },
    upload: { busy: false, error: null, warnings: [], pending: null, pickFor: null, plans: new Map() },
    timing: { offsetText: null, offsetError: null, custom: false, stepText: null, stepError: null, sync: null },
  };
}

/**
 * @param {{
 *   controller: import('../../content/controller.js').Controller,
 *   doc: Document, win: Window, player: HTMLElement,
 *   flows: { exportFlow: { buildExport: Function, download: Function }, importFlow: { readImport: Function } },
 *   now?: () => number,
 * }} deps
 */
export function createControlsSession({ controller, doc, win, player, flows, now = () => Date.now(), link = null }) {
  const counts = {
    renders: 0, renderFailures: 0, reinserts: 0, downloads: 0, copies: 0, imports: 0, flowFailures: 0, overflows: 0,
    switches: 0, marks: 0, syncs: 0, undos: 0,
  };
  let lastCode = null;
  let lastDetail = null;
  let destroyed = false;
  let ui = freshUi(null);
  let menuKey = null;
  let menuKind = null;
  let lastModel = null;
  let overflow = null;
  let flags = { live: false, unavailable: false, brave: false, ad: false };
  /** المؤشر فوق التلميح (U89). */
  let tipHover = false;
  /** channel قناة الرسالة: رسائل الاستيراد ('import') تُمسح ببدء استيراد جديد، فلا تتراكم أخطاء قديمة بعد نجاحه (U43). */
  /** @type {{ id: string, tone: 'success' | 'info' | 'warning' | 'error', text: string, persist: boolean, action: { label: string } | null, icon: 'clock' | null, channel: string | null }[]} */
  let toasts = [];
  /** فعل كل رسالة بفعل («تراجع») بمعرّفها؛ لا يدخل العرض. */
  const toastActions = new Map();
  let toastSeq = 0;
  const timers = new Map();
  let seenNotice = null;
  let seenError = null;
  const h = builder(doc);

  const fail = (code, err) => {
    lastCode = code;
    lastDetail = err instanceof Error ? `${err.name}: ${err.message}` : err ? String(err) : null;
    return new TjError(code, { cause: err, detail: lastDetail ?? undefined });
  };
  const later = (key, ms, fn) => {
    if (timers.has(key)) win.clearTimeout(timers.get(key));
    timers.set(key, win.setTimeout(() => {
      timers.delete(key);
      if (!destroyed) fn();
    }, ms));
  };

  const group = createGroup({ doc, win, on: { action, hint, escape: onEscape } });
  // زر اللوحة يستقبل التركيز حين تُغلق اللوحة وفيها التركيز (src/player/link.js)؛ وإن أخفاه المستخدم فـ«الترجمة» الظاهر، فلا
  // يُعطى عنصرًا لا يُرسم فيسقط التركيز إلى الصفحة (تدقيق 7a66f91، U88).
  const unlink = link?.register(() => group.focus(group.button('panel').hasAttribute('hidden') ? 'upload' : 'panel')) ?? null;
  const layer = createLayer({
    doc, win,
    on: {
      escape: () => closeMenu(true), files: onFiles, focusLeave, tipHover: onTipHover,
      // زالت رسالة فيها التركيز (انقضت أو فُعّل «تراجع» بلوحة المفاتيح): إلى «الترجمة» في الشريط لا إلى الصفحة (U88).
      focusLost: () => { if (!destroyed) group.focus('upload'); },
    },
  });

  // ———— قراءات من الصفحة (كل اسم يوتيوب من youtube-dom) ————

  /** زر CC معطّل: الفيديو بلا ترجمة متاحة (تلميح بصري فقط؛ القائمة تبقى تشرح). */
  function captionsUnavailable() {
    const b = doc.querySelector(SELECTORS.subtitlesButton);
    return !!b && (b.getAttribute('aria-disabled') === 'true' || b.hasAttribute('disabled'));
  }
  const readFlags = () => ({ live: isLiveNow(doc), unavailable: captionsUnavailable(), brave: isBrave(win.navigator), ad: isAdShowing(doc) });

  // ———— نماذج العرض ————

  /**
   * نموذج الأزرار الخمسة. بلا نقاط حالة على الأزرار: اسم الوظيفة هو اسم الوصول، وهو التلميح عند المرور والتركيز، ومعنى الحالة
   * (جاهز، مسار ناقص، ترجمة فيها فروق، جارٍ العمل) يلحق التلميح ويُوصف به الزر؛ والسبب يصحب المعطّل والمقيَّد في اسمه وتلميحه.
   */
  function groupModel(s, bar) {
    const tracks = okTracks(s);
    const noVideo = !s.videoId;
    const reason = noVideo ? null : s.loading ? messageFor('CT_LOADING') : !s.arabic ? messageFor('CT_NEEDS_ARABIC') : null;
    const viewOff = noVideo || !!reason;
    const withReason = (label) => (reason ? `${label} — ${reason}` : label);
    const step = s.settings.offsetStepMs;
    const off = s.view.displayOffsetMs;
    const summary = s.arabic ? comparisonSummary(s.arabic.comparison) : null;
    const unavailable = flags.live || (!tracks.length && flags.unavailable);
    const dlReason = flags.live ? messageFor('EX_LIVE') : unavailable ? messageFor('CT_NO_CAPTIONS') : null;
    const dlName = dlReason ? `${LABELS.download} — ${dlReason}` : LABELS.download;
    const dlState = dlReason ? null : ui.download.busy ? LABELS.stateDownloading : tracks.length ? (tracks.some((t) => t.warnings?.length) ? LABELS.stateIncomplete : LABELS.stateReady) : null;
    const upState = ui.upload.busy ? LABELS.importing : s.arabic && summary.tone === 'warn' ? LABELS.stateDiffers : null;
    const upLabel = s.arabic ? `${LABELS.translation}: ${s.arabic.fileName}` : LABELS.upload;
    // بلا ترجمة يفتح الزر منتقي الملفات مباشرة: لا يعلن نافذة (U44).
    const upPopup = s.arabic ? undefined : null;
    const badge = badgeTip(off);
    const ui$ = s.prefs?.ui;
    const panelShown = ui$?.panelEntry !== false;
    const panelOpen = panelShown && ui$?.panelOpen === true;
    const panelTip = panelOpen ? LABELS.panelClose : LABELS.panelOpen;
    return {
      size: fitSize(bar, panelShown ? 5 : 4),
      download: {
        label: dlName, tip: withState(dlName, dlState), description: dlState, disabled: noVideo, unavailable,
        loading: ui.download.busy, expanded: ui.open === 'download',
      },
      upload: {
        label: upLabel, tip: withState(s.arabic ? LABELS.translation : LABELS.upload, upState), description: s.arabic ? summary.text : upState,
        disabled: noVideo || s.loading, loading: ui.upload.busy, expanded: ui.open === 'display' || ui.open === 'confirm', popup: upPopup,
      },
      panel: { label: LABELS.panel, tip: panelTip, description: null, disabled: noVideo, hidden: !panelShown, pressed: panelOpen },
      minus: { label: withReason(minusTip(step)), tip: withReason(minusTip(step)), description: null, disabled: viewOff },
      badge: { label: withReason(badge), tip: withReason(badge), description: null, disabled: viewOff, text: formatOffset(off), sign: signOf(off), expanded: ui.open === 'timing' },
      plus: { label: withReason(plusTip(step)), tip: withReason(plusTip(step)), description: null, disabled: viewOff },
    };
  }

  function downloadModel(s) {
    const d = ui.download;
    const tracks = okTracks(s);
    return {
      live: flags.live, unavailable: flags.unavailable, captureIssue: s.captureIssue?.code ?? null,
      invalid: s.captured.filter((t) => !t.ok).map((t) => ({ code: t.code })),
      tracks: tracks.map((t) => ({ key: t.key, lang: t.lang, kind: t.kind, ok: t.ok, cueCount: t.cueCount, warnings: t.warnings, lastEndMs: t.lastEndMs, capturedAt: t.capturedAt })),
      selectedKey: tracks.some((t) => t.key === d.key) ? d.key : tracks[0]?.key ?? null,
      mode: d.mode ?? s.settings.export.modeDefault, durationMs: s.durationMs,
      why: d.why, fallbackOpen: d.fallback, split: d.split, splitSize: d.splitSize ?? String(s.settings.export.splitThreshold), splitError: d.splitError,
      busy: d.busy, copyBusy: ui.copyBusy, saveLine: d.saveLine, copyLine: d.copyLine, result: d.result,
      glossary: attachedGlossary(s.prefs)?.length ?? 0,
      englishGuide: !tracks.length && NOT_ENGLISH.has(s.captureIssue?.code ?? '') ? { brave: flags.brave } : null,
      ...previewParts(s, tracks),
    };
  }

  /**
   * أحجام الأجزاء للمسار والوضع والحجم الحاليين، تُحسب مرة لكل تغيّر فيها (والكتابة في الحقل مؤجلة قليلًا)، ومعها هل رُفع
   * الحجم ليبقى عدد الأجزاء ضمن حد الرفع (U31).
   */
  function previewParts(s, tracks) {
    const d = ui.download;
    const t = tracks.find((x) => x.key === d.key) ?? tracks[0];
    const size = d.split ? splitSizeOf(d.splitSize ?? s.settings.export.splitThreshold) : null;
    if (!t || !size) return { parts: null, partsRaised: false };
    const mode = d.mode ?? s.settings.export.modeDefault;
    const key = `${t.key}|${t.capturedAt}|${mode}|${size}`;
    if (d.preview?.key !== key) d.preview = { key, sizes: partSizes({ controller, exportFlow: flows.exportFlow, key: t.key, mode, split: { size, by: 'content' }, now: now() }) };
    return { parts: d.preview.sizes?.rows ?? null, partsRaised: d.preview.sizes?.raised ?? false };
  }

  function displayModel(s) {
    const a = s.arabic;
    const slots = slotsOf(s);
    return {
      fileName: a.fileName, count: a.cues.length, edited: a.edited, comparison: a.comparison, notes: a.comparison?.notes ?? [],
      slots, switching: s.loading || ui.switching, uploadLabel: slots.some((x) => !x.filled) ? LABELS.uploadMore : LABELS.replace,
      warnings: ui.upload.warnings, mode: s.view.displayMode, dualAvailable: !!s.english, originalLang: s.english?.lang ?? null, busy: ui.upload.busy, error: ui.upload.error,
      // الإعلان لحظة الرسم (فتح القائمة بعد بدئه)؛ وتغيّره والقائمة مفتوحة يعيد الرسم من الفحص الدوري (flags.ad).
      ad: isAdShowing(doc),
    };
  }

  /**
   * ما يمسه الحفظ في الخانة n: عدد تعديلاتها اليدوية، و«إبقاء تعديلاتي» إن أتاحته المحاذاة. يُحسب مرة لكل ترجمة خانة
   * (يُعاد إن تغيّرت الخانة من سياق آخر والتأكيد مفتوح).
   */
  function planFor(s, p, n) {
    const track = s.bundle?.slots?.[n - 1]?.track ?? null;
    const hit = ui.upload.plans.get(n);
    if (hit && hit.track === track && hit.input === p.input) return hit.plan;
    const edits = manualEdits(track);
    const plan = { edits, keep: edits ? keepEditsPlan(track, p.input.cues) : null };
    ui.upload.plans.set(n, { track, input: p.input, plan });
    return plan;
  }

  /** التأكيد المضغوط بعد فحص الملف (§١٩.٣): الملف والملخص، وقرينة الاسم، و«حفظ في» 1 2 3، وما يمسه الاستبدال. */
  function confirmModel(s) {
    const p = ui.upload.pending;
    const slots = slotsOf(s);
    const target = slots.find((x) => x.n === p.target) ?? slots[0];
    const filled = target.filled;
    const plan = filled ? planFor(s, p, target.n) : { edits: 0, keep: null };
    const keepOk = !!plan.keep?.ok;
    return {
      fileName: p.input.fileName, count: p.input.cues.length, comparison: p.input.comparison, warnings: p.warnings,
      hint: p.hint ? nameOtherLine(p.hint.title) : null, slots, target: target.n, filled, edits: plan.edits,
      keepAvailable: keepOk, keep: keepOk && p.keep, conflicts: keepOk ? plan.keep.conflicts : 0,
      offsetNote: filled && target.active && Math.round(s.view.displayOffsetMs / 100) !== 0,
      // استبدال ممتلئة والنسخة السابقة موجودة: تُمحى (U76).
      previousFrom: filled && s.bundle?.previous ? s.bundle.previous.from : null,
      busy: ui.upload.busy, error: ui.upload.error,
    };
  }

  function timingModel(s) {
    const t = ui.timing;
    const step = s.settings.offsetStepMs;
    const off = s.view.displayOffsetMs;
    const sync = t.sync ? { at: shortTime(t.sync.atMs), visible: t.sync.visible, ...sentenceWindow(s.arabic.cues, t.sync.start) } : null;
    return {
      offsetMs: off, offsetText: t.offsetText ?? formatOffset(off), offsetError: t.offsetError,
      stepMs: step, custom: t.custom || !PRESET_STEPS.includes(step), stepText: t.stepText ?? stepText(step), stepError: t.stepError, sync,
      ad: isAdShowing(doc),
    };
  }

  /** ما يُبنى للقائمة المفتوحة، ومفتاح شكلها: نصوص الحقول وحدها خارج المفتاح فلا يُعاد البناء مع كل حرف. */
  function menuSpec(s) {
    const kind = ui.open;
    if (!kind || !s.videoId) return null;
    if (kind === 'download') {
      const m = downloadModel(s);
      return { kind, key: JSON.stringify({ ...m, splitSize: null }), build: () => downloadMenu(h, act, m, layer.root) };
    }
    if (kind === 'display') {
      if (!s.arabic) return null;
      const m = displayModel(s);
      return { kind, key: JSON.stringify({ ...m, comparison: m.comparison?.fingerprintId ?? null, c: s.arabic.cues.length, v: s.version }), build: () => displayMenu(h, act, m, layer.root) };
    }
    if (kind === 'confirm') {
      if (!ui.upload.pending) return null;
      const m = confirmModel(s);
      return {
        kind, label: m.filled ? LABELS.confirmTitle : LABELS.uploadTitle,
        key: JSON.stringify({ ...m, comparison: m.comparison?.fingerprintId ?? null }), build: () => confirmMenu(h, act, m, layer.root),
      };
    }
    if (kind === 'timing') {
      if (!s.arabic || s.loading) return null;
      const m = timingModel(s);
      return { kind, key: JSON.stringify({ ...m, offsetText: null, stepText: null }), build: () => timingMenu(h, act, m, layer.root) };
    }
    return null;
  }

  // ———— العرض ————

  function renderMenu(s) {
    const spec = menuSpec(s);
    if (!spec) {
      if (ui.open) ui.open = null;
      dropMenu();
      return;
    }
    if (spec.key === menuKey && spec.kind === menuKind && layer.menuOpen()) return;
    const focused = layer.focused();
    const fid = focused?.getAttribute?.('data-fid') ?? null;
    const caret = fid && typeof focused.selectionStart === 'number' ? focused.selectionStart : null;
    const nodes = spec.build();
    const label = spec.label ?? TITLE[spec.kind];
    if (spec.kind !== menuKind || !layer.menuOpen()) {
      layer.openMenu(nodes, group.button(ANCHOR[spec.kind]), { label, role: ROLE[spec.kind], avoidLine: spec.kind === 'timing' });
    } else {
      layer.patchMenu(nodes, label);
    }
    menuKey = spec.key;
    menuKind = spec.kind;
    // العقدة المركّزة باقية في مكانها عادةً؛ وإن استُبدلت بنيتها فالتركيز يعود إلى نظيرتها بمعرّفها.
    if (fid && !(focused?.isConnected && layer.focused() === focused)) {
      const el = layer.find(fid);
      if (el) {
        el.focus();
        if (caret !== null && typeof el.setSelectionRange === 'function') {
          try {
            el.setSelectionRange(caret, caret);
          } catch {
            // حقل بلا تحديد
          }
        }
      }
    }
  }

  /**
   * إغلاق القائمة دون فعل من المستخدم (زالت الترجمة، أو تبدّل الفيديو): إن كان التركيز فيها عاد إلى زرها، فلا يسقط إلى
   * الصفحة فتذهب الضغطات التالية إلى اختصارات يوتيوب.
   */
  function dropMenu() {
    const hadFocus = !!layer.focused();
    const anchor = menuKind ? ANCHOR[menuKind] : null;
    if (layer.menuOpen()) layer.closeMenu();
    menuKey = null;
    menuKind = null;
    if (hadFocus && anchor) group.focus(anchor);
  }

  function renderTip() {
    if (!lastModel) return;
    if (ui.flash) {
      layer.showTip(ui.flash, group.button('badge'));
      return;
    }
    const kind = ui.hint;
    if (kind && kind !== ui.tipMuted && !(ui.open && ANCHOR[ui.open] === kind)) {
      layer.showTip(lastModel[kind].tip, group.button(kind));
      return;
    }
    // تلميح أُخفي والمؤشر فوقه لا يطلق pointerleave: لا يبقى «المؤشر فوق التلميح» عالقًا فيمنع إخفاءه لاحقًا (مراجعة C6).
    tipHover = false;
    layer.showTip(null, null);
  }

  function renderToasts() {
    layer.renderToasts(toasts, dismissToast, runToast);
  }

  /** الحلقة الوحيدة: كل مدخل (حالة المتحكم، الشريط، فعل المستخدم) يمر هنا. */
  function render() {
    if (destroyed) return;
    try {
      const s = controller.getState();
      syncVideo(s);
      handleNotices(s);
      const bar = bar$.snapshot();
      // اختفى شريط يوتيوب والقائمة مفتوحة بلا تركيز فيها (لا كتابة ولا لوحة مفاتيح) ولا عمل جارٍ ولا قرار ينتظر (تأكيد، أو
      // اختيار جملة للمزامنة): تُغلق بدل أن تعود فجأة مع الشريط عند أول حركة للمؤشر.
      const pending = ui.open === 'confirm' || (ui.open === 'timing' && !!ui.timing.sync);
      if (bar.hidden && ui.open && !pending && !ui.download.busy && !ui.upload.busy && !layer.isTyping() && !layer.focused()) ui.open = null;
      // وما بقي مفتوحًا بقرار يبقى ظاهرًا: لا قائمة خفية تتلقى الضغطات، ولا تختفي أمام مستخدم لوحة المفاتيح (GM-003).
      layer.setKeep?.(!!ui.open && (pending || ui.download.busy || ui.upload.busy || !!layer.focused()));
      lastModel = groupModel(s, bar);
      group.update(lastModel);
      layer.setBar(bar);
      renderMenu(s);
      renderTip();
      renderToasts();
      counts.renders++;
    } catch (err) {
      counts.renderFailures++;
      fail('CT_RENDER_FAILED', err);
    }
  }

  // ———— الفيديو والإشعارات والرسائل ————

  function syncVideo(s) {
    if (s.videoId === ui.videoId) return;
    ui = freshUi(s.videoId);
    dropMenu();
    for (const t of toasts) clearTimer(t.id);
    clearTimer('flash');
    clearTimer('preview');
    clearTimer('tipHide');
    tipHover = false;
    toasts = [];
    toastActions.clear();
  }

  function handleNotices(s) {
    const n = s.notice;
    if (n) {
      const id = `${n.code}@${n.at}`;
      if (seenNotice !== id) {
        seenNotice = id;
        addToast(n.tone, messageFor(n.code));
        // يُصرف بعد العرض لا أثناءه: الصرف يغيّر حالة المتحكم ويبلّغ المشتركين.
        later('notice', 0, () => {
          const cur = controller.getState().notice;
          if (cur && `${cur.code}@${cur.at}` === id) controller.dismissNotice();
        });
      }
    }
    const e = s.error;
    if (e) {
      const id = `${e.code}|${e.message}`;
      if (seenError !== id) {
        seenError = id;
        addToast('error', e.message);
      }
    } else {
      seenError = null;
    }
  }

  function clearTimer(key) {
    if (!timers.has(key)) return;
    win.clearTimeout(timers.get(key));
    timers.delete(key);
  }

  /**
   * رسالة عابرة: النجاح والمعلومة تختفيان بعد 3 ثوانٍ، والتحذير والخطأ يبقيان حتى الإغلاق. ومعها فعل اختياري («تراجع»)
   * يُنفَّذ مرة ثم تختفي، وتبقى الرسالة بفعلها 6 ثوانٍ.
   * @param {'success' | 'info' | 'warning' | 'error'} tone @param {string} text
   * @param {{ action?: { label: string, run: () => unknown } | null, icon?: 'clock' | null, channel?: string | null }} [o] icon رمز غير رمز
   *   النغمة (الساعة لرسالة الإزاحة)، وchannel قناتها (clearChannel)
   */
  function addToast(tone, text, { action = null, icon = null, channel = null } = {}) {
    const id = `t${++toastSeq}`;
    const persist = tone === 'warning' || tone === 'error';
    const dropped = toasts.filter((t) => t.text === text);
    for (const t of dropped) {
      clearTimer(t.id);
      toastActions.delete(t.id);
    }
    toasts = [...toasts.filter((t) => t.text !== text), { id, tone, text, persist, action: action ? { label: action.label } : null, icon, channel }];
    if (action) toastActions.set(id, action.run);
    while (toasts.length > MAX_TOASTS) {
      const old = toasts.shift();
      clearTimer(old.id);
      toastActions.delete(old.id);
    }
    if (!persist) later(id, action ? UNDO_MS : TOAST_MS, () => dismissToast(id));
    renderToasts();
  }

  /** يمسح رسائل قناة (الاستيراد عند بدء استيراد جديد): الخطأ السابق لم يعد خبرًا عن الملف الذي يُقرأ الآن (U43). @param {string} ch */
  function clearChannel(ch) {
    const gone = toasts.filter((t) => t.channel === ch);
    if (!gone.length) return;
    for (const t of gone) {
      clearTimer(t.id);
      toastActions.delete(t.id);
    }
    toasts = toasts.filter((t) => t.channel !== ch);
    renderToasts();
  }

  function dismissToast(id) {
    clearTimer(id);
    toastActions.delete(id);
    toasts = toasts.filter((t) => t.id !== id);
    renderToasts();
  }

  /** فعل الرسالة (التراجع): مرة واحدة، والإخفاق رسالة مفهومة. */
  async function runToast(id) {
    const run = toastActions.get(id);
    dismissToast(id);
    if (!run) return;
    const vid = ui.videoId;
    try {
      await run();
      counts.undos++;
    } catch (err) {
      if (destroyed || ui.videoId !== vid) return;
      counts.flowFailures++;
      fail('CT_UNDO_FAILED', err);
      addToast('error', messageFor('CT_UNDO_FAILED'));
    }
    render();
  }

  // ———— الأفعال من الشريط ————

  /**
   * تلميح زر بالمرور أو التركيز. مغادرة المؤشر لا تخفيه فورًا (TIP_HIDE_MS) فيمكن المرور فوقه؛ وفقد التركيز يخفيه فورًا (U89).
   * @param {string | null} kind @param {{ pointer?: boolean }} [o]
   */
  function hint(kind, { pointer = false } = {}) {
    clearTimer('tipHide');
    if (kind === null && pointer && ui.hint) {
      later('tipHide', TIP_HIDE_MS, hideTip);
      return;
    }
    if (kind !== ui.hint) ui.tipMuted = null;
    ui.hint = kind;
    renderTip();
  }

  function hideTip() {
    if (tipHover) return;
    ui.hint = null;
    ui.tipMuted = null;
    renderTip();
  }

  /** المؤشر دخل التلميح (يبقى ظاهرًا) أو غادره (يُخفى بعد المهلة). @param {boolean} inside */
  function onTipHover(inside) {
    tipHover = inside;
    clearTimer('tipHide');
    if (!inside && ui.hint) later('tipHide', TIP_HIDE_MS, hideTip);
  }

  /** Esc على زر الشريط: يغلق قائمته المفتوحة؛ وبلا قائمة يُخفي التلميح الظاهر حتى المغادرة (U89). */
  function onEscape() {
    if (ui.open) {
      closeMenu(true);
      return;
    }
    muteTip();
  }

  /** يُخفي التلميح الظاهر (والعابر بعد ±) حتى يغادر المؤشر زره أو التركيز (WCAG 1.4.13: يُصرف دون تحريك المؤشر). */
  function muteTip() {
    if (!ui.hint && !ui.flash) return;
    if (ui.flash) {
      ui.flash = null;
      clearTimer('flash');
    }
    if (ui.hint) ui.tipMuted = ui.hint;
    renderTip();
  }

  /**
   * خرج التركيز من النافذة إلى ما خارج الطبقة والمجموعة (Tab من آخر بند، أو نقرة في الصفحة): تُغلق ويبقى التركيز حيث ذهب، كما
   * تُغلق قائمة خيارات اللوحة (U46). إلا قرار ينتظر (تأكيد الرفع، أو اختيار جملة للمزامنة) أو عمل جارٍ، كما مع اختفاء الشريط.
   * @param {Element} to
   */
  function focusLeave(to) {
    if (!ui.open || to === group.host) return;
    const pending = ui.open === 'confirm' || (ui.open === 'timing' && !!ui.timing.sync);
    if (pending || ui.download.busy || ui.upload.busy) return;
    closeMenu(false);
  }

  function action(kind, { keyboard }) {
    if (destroyed || !lastModel) return;
    ui.hint = null;
    const m = lastModel[kind];
    if (m.disabled) {
      ui.hint = kind;
      renderTip();
      return;
    }
    if (kind === 'minus') nudge(-1);
    else if (kind === 'plus') nudge(1);
    else if (kind === 'panel') togglePanel(keyboard);
    else if (kind === 'download') toggleMenu('download', keyboard);
    else if (kind === 'badge') toggleMenu('timing', keyboard);
    else if (kind === 'upload') {
      if (controller.getState().arabic) toggleMenu('display', keyboard);
      else {
        closeMenu(false);
        pick('first');
      }
    }
  }

  /** زر اللوحة: يفتحها ويغلقها بالتفضيل المحفوظ نفسه الذي يكتبه زر الإغلاق فيها ومفتاح الإعدادات (يبقى آخر اختيار). */
  function togglePanel(keyboard) {
    closeMenu(false);
    const open = controller.getState().prefs?.ui?.panelOpen === true;
    if (!open && keyboard) link?.requestPanelFocus();
    controller.updatePrefs({ ui: { panelOpen: !open } })?.catch?.((err) => {
      fail('CT_PANEL_TOGGLE_FAILED', err);
      addToast('error', messageFor('CT_PANEL_TOGGLE_FAILED'));
    });
  }

  function nudge(dir) {
    controller.nudgeOffset(dir)?.catch?.(() => {});
    ui.timing.offsetText = null;
    ui.timing.offsetError = null;
    ui.flash = nudgeFlash(controller.getState().view.displayOffsetMs);
    // التلميح العابر لا يُقرأ: الإزاحة الجديدة تُعلن في منطقة حية، كما تعلنها قيمة التذييل في اللوحة (U48).
    layer.announce(ui.flash);
    group.pulse();
    later('flash', FLASH_MS, () => {
      ui.flash = null;
      renderTip();
    });
    render();
  }

  function toggleMenu(kind, keyboard) {
    const current = ui.open === 'confirm' ? 'display' : ui.open;
    if (current === kind) {
      closeMenu(keyboard);
      return;
    }
    if (ui.open === 'confirm') ui.upload.pending = null;
    ui.open = kind;
    if (kind === 'timing') ui.timing = { offsetText: null, offsetError: null, custom: false, stepText: null, stepError: null, sync: null };
    if (kind === 'display') ui.upload.error = null;
    render();
    if (keyboard) layer.focusFirst();
  }

  function closeMenu(returnFocus) {
    if (!ui.open) return;
    const anchor = ANCHOR[ui.open];
    if (ui.open === 'confirm') ui.upload.pending = null;
    ui.open = null;
    render();
    if (returnFocus) group.focus(anchor);
  }

  /** المنتقي يُفتح لفيديو بعينه: اختيار يصل بعد تبدّله لا يُحمَّل على الجديد. */
  function pick(purpose) {
    ui.upload.pickFor = { purpose, videoId: ui.videoId };
    layer.pickFiles();
  }

  // ———— الأفعال من القوائم ————

  /** @param {string} name @param {unknown} [value] */
  function act(name, value) {
    if (destroyed) return;
    const d = ui.download;
    const t = ui.timing;
    switch (name) {
      case 'why': d.why = !d.why; break;
      case 'track': d.key = value; d.saveLine = null; d.copyLine = null; d.result = []; break;
      case 'mode': d.mode = value; d.saveLine = null; d.copyLine = null; break;
      case 'fallback': d.fallback = !d.fallback; break;
      case 'split': d.split = !!value; d.splitError = null; break;
      case 'splitSize':
        d.splitSize = String(value);
        later('preview', PREVIEW_MS, render);
        return;
      case 'download': startDownload(); return;
      case 'copy': startCopy(); return;
      case 'displayMode': setMode(value); return;
      case 'slot': activate(Number(value)); return;
      case 'mark': markVisible(); return;
      case 'replace': pick('replace'); return;
      case 'target':
        if (ui.upload.pending && !ui.upload.busy) {
          ui.upload.pending.target = Number(value);
          ui.upload.pending.keep = false;
          ui.upload.error = null;
        }
        break;
      case 'keep': if (ui.upload.pending) ui.upload.pending.keep = !!value; break;
      case 'confirmReplace': confirmUpload(); return;
      case 'cancelReplace':
        ui.upload.pending = null;
        ui.upload.error = null;
        ui.open = controller.getState().arabic ? 'display' : null;
        render();
        if (ui.open) layer.focusFirst();
        else group.focus('upload');
        return;
      case 'offsetText': t.offsetText = String(value); return;
      // change يصل عند فقد التركيز ولو بعد إغلاق القائمة (Esc أو النقر خارجها): الإغلاق إلغاء لما كُتب، لا تطبيق له.
      case 'applyOffset': if (ui.open === 'timing') applyOffset(String(value)); return;
      case 'step': chooseStep(String(value)); return;
      case 'stepText': t.stepText = String(value); return;
      case 'applyStep': if (ui.open === 'timing') applyStep(String(value)); return;
      case 'sync': openSync(); return;
      case 'syncEarlier': if (t.sync) t.sync = { ...t.sync, start: Math.max(0, t.sync.start - SENTENCE_STEP) }; break;
      case 'syncLater': {
        const count = controller.getState().arabic?.cues.length ?? 0;
        if (t.sync) t.sync = { ...t.sync, start: Math.max(0, Math.min(t.sync.start + SENTENCE_STEP, count - SENTENCE_STEP)) };
        break;
      }
      case 'syncBack':
        t.sync = null;
        render();
        layer.find('sync')?.focus();
        return;
      case 'sentence': applySentence(Number(value)); return;
      case 'reset':
        t.offsetText = null;
        t.offsetError = null;
        controller.resetOffset()?.catch?.(() => {});
        group.pulse();
        break;
      default: return;
    }
    render();
  }

  /** تبديل الترجمة النشطة من 1 2 3، ورسالة «الترجمة 2» بتراجع إلى السابقة. لا أثر أثناء القراءة أو تبديل جارٍ. */
  async function activate(n) {
    const s = controller.getState();
    const prev = s.activeSlot;
    if (s.loading || ui.switching || !prev || prev === n || typeof controller.activateSlot !== 'function') return;
    const mine = ui;
    mine.switching = true;
    render();
    try {
      await controller.activateSlot(n);
    } catch (err) {
      if (destroyed || ui !== mine) return;
      mine.switching = false;
      counts.flowFailures++;
      addToast('error', toErrorInfo(err).message);
      render();
      return;
    }
    if (destroyed || ui !== mine) return;
    mine.switching = false;
    // لا «الترجمة 2» إلا إن صارت هي النشطة فعلًا في الحالة (لا مجرد عودة الوعد).
    if (controller.getState().activeSlot !== n) {
      render();
      return;
    }
    counts.switches++;
    addToast('success', slotToast(n), { action: { label: LABELS.undo, run: () => controller.activateSlot(prev) } });
    render();
  }

  /** «علّم للمراجعة»: المقطع الظاهر الآن في الترجمة النشطة (بزمن الفيديو والإزاحة)، ورسالة بتراجع. */
  async function markVisible() {
    const s = controller.getState();
    const cues = s.arabic?.cues;
    if (!cues || typeof controller.markCue !== 'function') return;
    // زمن الفيديو أثناء الإعلان زمن الإعلان: لا علامة على مقطع لا يُرى (U47).
    if (isAdShowing(doc)) {
      addToast('info', messageFor('CT_AD_SHOWING'));
      return;
    }
    const video = getMainVideo(doc);
    const at = video && Number.isFinite(video.currentTime) ? lookupMs(video.currentTime, s.view.displayOffsetMs) : NaN;
    const index = visibleCueIndex(cues, at);
    if (index === null) {
      addToast('info', messageFor('CT_NO_VISIBLE_CUE'));
      return;
    }
    const n = cues[index].n;
    const mine = ui;
    let r;
    try {
      r = await controller.markCue({ index }, 'todo');
    } catch (err) {
      if (destroyed || ui !== mine) return;
      counts.flowFailures++;
      addToast('error', toErrorInfo(err).message);
      render();
      return;
    }
    if (destroyed || ui !== mine) return;
    counts.marks++;
    addToast('success', markToast(n), { action: { label: LABELS.undo, run: () => r.undo() } });
    render();
  }

  function setMode(mode) {
    try {
      controller.setDisplayMode(mode)?.catch?.(() => {});
    } catch (err) {
      ui.upload.error = toErrorInfo(err).message;
      render();
    }
  }

  /**
   * «مزامنة بجملة…»: العرض الفرعي عند لحظة الفتح (ثابتة)، وجمل النشطة حولها؛ والتركيز داخله فلا يضيع موضع لوحة المفاتيح.
   * لا يُمس الفيديو: لا إيقاف ولا قفز.
   */
  function openSync() {
    const s = controller.getState();
    const cues = s.arabic?.cues;
    const video = getMainVideo(doc);
    if (!cues?.length || !video || !Number.isFinite(video.currentTime)) return;
    if (isAdShowing(doc)) {
      addToast('info', messageFor('CT_AD_SHOWING'));
      return;
    }
    const atMs = Math.round(video.currentTime * 1000);
    const at = lookupMs(video.currentTime, s.view.displayOffsetMs);
    const visible = visibleCueIndex(cues, at);
    const center = visible ?? nearestCueIndex(cues, at);
    ui.timing.sync = { atMs, start: windowAround(cues.length, center), visible };
    ui.timing.offsetText = null;
    ui.timing.offsetError = null;
    render();
    (layer.find(`sentence:${center}`) ?? layer.find('syncBack'))?.focus();
  }

  /**
   * الجملة المختارة تظهر بدايتها عند لحظة الفتح: إزاحة فورية، ثم رسالة «الإزاحة −3.2 ث» بتراجع. لا يتغير الملف. والرسالة بعد
   * ثبوت الإزاحة لا قبله: إن لم تُحفظ (يعيد المتحكم العرض إلى المحفوظ ويرفع خطأه) فلا رسالة نجاح، ويصل الخطأ من حالة المتحكم.
   */
  async function applySentence(index) {
    const s = controller.getState();
    const t = ui.timing;
    const cue = s.arabic?.cues[index];
    if (!t.sync || !cue || s.loading) return;
    const prev = s.view.displayOffsetMs;
    const next = syncOffset(t.sync.atMs, cue);
    const mine = ui;
    t.sync = null;
    t.offsetText = null;
    t.offsetError = null;
    const done = controller.setOffset(next);
    if (next !== prev) group.pulse();
    render();
    layer.find('sync')?.focus();
    try {
      await done;
    } catch (err) {
      if (destroyed || ui !== mine) return;
      counts.flowFailures++;
      addToast('error', toErrorInfo(err).message);
      render();
      return;
    }
    if (destroyed || ui !== mine) return;
    const now = controller.getState();
    // التراجع لإزاحة الترجمة التي زامنها المستخدم وحدها: إن تبدّلت النشطة أو استُبدلت (مقاطع أخرى) لا يُطبَّق على غيرها
    // (تدقيق 5fedcb9، CX-004: كان يكتب إزاحة الأولى في الثانية).
    const target = { videoId: s.videoId, cues: s.arabic.cues };
    if (now.videoId !== target.videoId || now.arabic?.cues !== target.cues) return;
    if (now.view.displayOffsetMs !== next || (now.error && now.error !== s.error)) return;
    counts.syncs++;
    addToast('info', offsetToast(next), {
      icon: 'clock',
      action: {
        label: LABELS.undo,
        run: () => {
          const cur = controller.getState();
          if (cur.videoId === target.videoId && cur.arabic?.cues === target.cues) return controller.setOffset(prev);
          addToast('info', syncUndoStale);
          return null;
        },
      },
    });
    render();
  }

  function applyOffset(text) {
    const t = ui.timing;
    const v = parseSeconds(text);
    if (v === null || Math.abs(v) > MAX_OFFSET_S) {
      t.offsetText = text;
      t.offsetError = messageFor('CT_OFFSET_INVALID');
      render();
      return;
    }
    t.offsetText = null;
    t.offsetError = null;
    const before = controller.getState().view.displayOffsetMs;
    controller.setOffset(Math.round(v * 1000))?.catch?.(() => {});
    if (controller.getState().view.displayOffsetMs !== before) group.pulse();
    render();
  }

  function chooseStep(value) {
    const t = ui.timing;
    t.stepError = null;
    if (value === 'custom') {
      t.custom = true;
      render();
      return;
    }
    t.custom = false;
    t.stepText = null;
    saveStep(Number(value));
  }

  function applyStep(text) {
    const t = ui.timing;
    const v = parseSeconds(text);
    const ms = v === null ? NaN : Math.round(v * 1000);
    if (!Number.isInteger(ms) || ms < STEP.min || ms > STEP.max || ms % 100 !== 0) {
      t.stepText = text;
      t.stepError = messageFor('CT_STEP_INVALID');
      render();
      return;
    }
    t.stepText = null;
    t.stepError = null;
    saveStep(ms);
  }

  async function saveStep(ms) {
    const t = ui.timing;
    render();
    if (controller.getState().settings.offsetStepMs === ms) return;
    try {
      await controller.updateSettings({ offsetStepMs: ms });
    } catch (err) {
      if (ui.timing !== t) return;
      t.stepError = toErrorInfo(err).message;
    }
    render();
  }

  /** حجم الجزء من حقله إن طُلب التقسيم (عند الجمل أو الصمت، R60)؛ القيمة غير الصالحة توقف الفعل بخطأ تحت الحقل. */
  function splitSpec() {
    const d = ui.download;
    if (!d.split) return { ok: true, split: null };
    const n = splitSizeOf(d.splitSize ?? controller.getState().settings.export.splitThreshold);
    if (n === null) {
      d.splitError = messageFor('CT_SPLIT_INVALID');
      return { ok: false };
    }
    d.splitError = null;
    return { ok: true, split: { size: n, by: 'content' } };
  }

  /** ما يُصدَّر الآن: المسار المختار بوضعه وتقسيمه، أو null مع خطأ الحقل. */
  function exportSpec() {
    const m = downloadModel(controller.getState());
    if (!m.selectedKey) return null;
    const sp = splitSpec();
    if (!sp.ok) {
      render();
      layer.find('splitSize')?.focus();
      return null;
    }
    return { key: m.selectedKey, mode: m.mode, split: sp.split };
  }

  /** النسخ ونتيجته في سطرها؛ النص لا يُعرض أبدًا. */
  async function copyInto(d, text) {
    const ok = await copyText(text, { doc, win, root: layer.root });
    if (ok) counts.copies++;
    else counts.flowFailures++;
    d.copyLine = ok ? { tone: 'ok', text: LABELS.copied } : { tone: 'error', text: LABELS.copyFailed };
    return ok;
  }

  /**
   * «تنزيل الملف» (R61 بعد جولة الصقل): يحفظ ملف SRT وحده بمكان الإعدادات ثم البصمة، ولا ينسخ شيئًا؛ والنسخ زر مستقل
   * (startCopy). لكلٍّ سطر نتيجته، فلا يمحو أحدهما نتيجة الآخر.
   */
  async function startDownload() {
    const d = ui.download;
    if (d.busy) return;
    const spec = exportSpec();
    if (!spec) return;
    d.busy = true;
    d.saveLine = null;
    d.result = [];
    render();
    const prep = prepareExport({ controller, exportFlow: flows.exportFlow, ...spec, now: now() });
    if (!prep.ok) {
      d.busy = false;
      counts.flowFailures++;
      fail(prep.error.code, prep.error.message);
      d.result = [{ tone: 'error', text: prep.error.message }];
      render();
      return;
    }
    const files = prep.built.files;
    const r = await saveFiles({ exportFlow: flows.exportFlow, files, doc });
    if (destroyed || ui.download !== d) return;
    d.busy = false;
    if (r.saved.length) {
      counts.downloads++;
      // بدأ التنزيل وما زال حوار الحفظ مفتوحًا (pending): لا يُقال «نُزّل» قبل أن يكتمل، بل ما ينتظره المستخدم.
      d.saveLine = r.pending
        ? { tone: 'info', text: messageFor('SV_PENDING') }
        : { tone: 'ok', text: r.saved.length > 1 ? downloadedParts(partsLabel(r.saved.length)) : downloadedLine(r.saved[0]) };
    }
    if (r.stopped) {
      if (r.stopped.code !== 'SV_CANCELLED') {
        counts.flowFailures++;
        fail(r.stopped.code, r.stopped.message);
      }
      const line = { tone: r.stopped.code === 'SV_CANCELLED' ? 'info' : 'error', text: r.stopped.message };
      if (r.saved.length) d.result.push(line);
      else d.saveLine = line;
    }
    if (r.blob) d.result.push({ tone: 'info', text: messageFor('SV_FALLBACK_BLOB') });
    d.result.push(...prep.built.warnings.map((code) => ({ tone: code === 'EX_SPLIT_NOT_NEEDED' ? 'info' : 'warn', text: messageFor(code) })));
    if (r.saved.length) {
      const rec = await recordFor({ controller, key: spec.key, built: prep.built, videoId: prep.videoId });
      if (destroyed || ui.download !== d) return;
      if (!rec.saved) d.result.push({ tone: 'warn', text: rec.error.code === 'CT_VIDEO_CHANGED' ? rec.error.message : messageFor('CT_FINGERPRINT_NOT_SAVED') });
    }
    render();
  }

  /** «نسخ التعليمات» وحده: تعليمات المسار والوضع والتقسيم المختارة، بالقاموس إن أُرفق. لا ملف ولا بصمة. */
  async function startCopy() {
    const d = ui.download;
    if (ui.copyBusy) return;
    const spec = exportSpec();
    if (!spec) return;
    const prep = prepareExport({ controller, exportFlow: flows.exportFlow, ...spec, now: now() });
    if (!prep.ok) {
      counts.flowFailures++;
      // في سطر النسخ وحده (يعيد المحاولة)، فلا يمحو تحذيرات التنزيل في d.result.
      d.copyLine = { tone: 'error', text: prep.error.message };
      render();
      return;
    }
    const mine = ui;
    mine.copyBusy = true;
    d.copyLine = null;
    render();
    await copyInto(d, prep.text);
    if (destroyed || ui !== mine) return;
    mine.copyBusy = false;
    render();
  }

  // ———— الرفع ————

  function onFiles(files) {
    const p = ui.upload.pickFor;
    ui.upload.pickFor = null;
    // فُتح المنتقي لفيديو سابق (التنقل يصفّر الحالة) أو لم يُفتح منّا: لا يُقرأ الملف ولا يُحمَّل.
    if (!p || p.videoId !== controller.getState().videoId) {
      clearChannel('import');
      addToast('warning', messageFor('CT_VIDEO_CHANGED'), { channel: 'import' });
      render();
      return;
    }
    startImport(files, p.purpose === 'replace');
  }

  /**
   * فحص الملف ثم حفظه في خانة. لفيديو بلا ترجمة ولا قرينة على فيديو آخر يُحفظ في الخانة 1 مباشرة (المسار المعتاد)؛ وإلا
   * تأكيد مضغوط داخل المشغّل يختار الخانة. لا كتابة في التخزين قبل «حفظ» أو «استبدال»، فالإلغاء لا يغيّر شيئًا.
   */
  async function startImport(files, replacing) {
    const u = ui.upload;
    if (u.busy) return;
    u.busy = true;
    u.error = null;
    clearChannel('import');
    render();
    const read = await readFor({ controller, importFlow: flows.importFlow, files });
    if (destroyed || ui.upload !== u) return;
    if (!read.ok) {
      u.busy = false;
      counts.flowFailures++;
      if (replacing && ui.open === 'display') u.error = read.error.message;
      else addToast('error', read.error.message, { channel: 'import' });
      render();
      return;
    }
    const hint = await nameHintFor({ controller, importFlow: flows.importFlow, read });
    if (destroyed || ui.upload !== u) return;
    const slots = slotsOf(controller.getState());
    if (!hint && !slots.some((x) => x.filled)) {
      const r = await loadIntoFor({ controller, read, n: 1, replace: false });
      if (destroyed || ui.upload !== u) return;
      u.busy = false;
      if (r.ok) {
        counts.imports++;
        u.warnings = read.warnings;
        ui.open = 'display';
        render();
        return;
      }
      if (r.error.code !== 'ST_ARABIC_EXISTS') {
        counts.flowFailures++;
        addToast('error', r.error.message, { channel: 'import' });
        render();
        return;
      }
    }
    u.busy = false;
    u.plans.clear();
    u.pending = { ...read, hint, target: defaultTarget(slotsOf(controller.getState())), keep: false };
    ui.open = 'confirm';
    render();
    layer.focusFirst();
  }

  async function confirmUpload() {
    const u = ui.upload;
    const p = u.pending;
    if (!p || u.busy) return;
    const s = controller.getState();
    const m = confirmModel(s);
    const plan = m.filled ? planFor(s, p, m.target) : null;
    const current = m.keep && plan?.keep?.ok ? plan.keep.current : null;
    u.busy = true;
    u.error = null;
    render();
    const r = await loadIntoFor({ controller, read: p, n: m.target, replace: m.filled, current });
    if (destroyed || ui.upload !== u) return;
    u.busy = false;
    // أغلق المستخدم التأكيد أثناء الحفظ (Esc أو النقر خارجه): تُطبَّق النتيجة دون إعادة فتح القائمة ولا نقل التركيز.
    const stillOpen = ui.open === 'confirm';
    if (!r.ok) {
      counts.flowFailures++;
      // امتلأت الخانة من سياق آخر قبل الحفظ، أو تغيّرت الخانة المستبدلة (تدقيق 7a66f91، U12): يبقى التأكيد مفتوحًا بحالتها
      // الجديدة (فيصير «استبدال» أو يسمّي ما فيها الآن) مع سببه.
      if ((r.error.code === 'ST_ARABIC_EXISTS' || r.error.code === 'ST_CONFLICT') && stillOpen) {
        u.error = r.error.message;
        render();
        return;
      }
      u.pending = null;
      u.error = r.error.message;
      if (!stillOpen) addToast('error', r.error.message, { channel: 'import' });
    } else {
      counts.imports++;
      u.pending = null;
      u.warnings = p.warnings;
    }
    if (stillOpen) ui.open = controller.getState().arabic ? 'display' : null;
    render();
    if (stillOpen && ui.open) layer.focusFirst();
  }

  // ———— خارج القوائم: النقر خارجها وEsc ————

  const onDocPointer = (ev) => {
    if (!ui.open) return;
    const path = typeof ev.composedPath === 'function' ? ev.composedPath() : [ev.target];
    if (group.owns(path) || layer.owns(path)) return;
    closeMenu(false);
  };
  // Esc في الصفحة يغلق القائمة المفتوحة، وبلا قائمة يُخفي التلميح الظاهر: المؤشر فوق الزر والتركيز في مكان آخر، فلا تصل الضغطة
  // إلى الزر نفسه (U89). ولا يُوقف انتشارها: ليوتيوب أن يفعل بها ما يفعل.
  const onDocKey = (ev) => {
    if (ev.key !== 'Escape') return;
    if (ui.open) closeMenu(doc.activeElement === layer.host);
    else muteTip();
  };

  // ———— الموضع والشريط ————

  /** المجموعة أول أدوات الشريط اليمنى، والطبقة داخل المشغّل؛ يعيدهما إن أعاد يوتيوب رسم الشريط. */
  function place() {
    const right = getRightControls(doc);
    if (right && player.contains(right) && group.attachTo(right)) counts.reinserts++;
    layer.attachTo(player);
  }

  /** هل دُفع شيء من الشريط خارجه، أو تداخلت المجموعة مع الأدوات اليسرى؟ قياس للتقرير، لا إخفاء لشيء. */
  function measureOverflow(bar) {
    const right = group.host.parentNode;
    const chrome = getChromeBottom(doc);
    if (!right || !chrome || bar.hidden) return;
    const cb = chrome.getBoundingClientRect();
    if (!cb.width) return;
    const mine = group.host.getBoundingClientRect();
    const outside = [...right.children].some((k) => {
      const r = k.getBoundingClientRect();
      return r.width > 0 && (r.right > cb.right + 1 || r.left < cb.left - 1 || r.top >= cb.bottom - 1);
    });
    const siblings = right.parentNode ? [...right.parentNode.children].filter((k) => k !== right) : [];
    const overlap = siblings.some((k) => {
      const r = k.getBoundingClientRect();
      return r.width > 0 && r.right > mine.left + 1 && r.left < mine.right - 1 && r.bottom > mine.top && r.top < mine.bottom;
    });
    const now$ = outside || overlap ? { width: bar.width, size: bar.size, outside, overlap } : null;
    if (now$ && !overflow) {
      counts.overflows++;
      fail('CT_BAR_OVERFLOW', `width=${bar.width} size=${bar.size}`);
    }
    overflow = now$;
  }

  let bar$ = null;
  let off = null;
  function teardown() {
    off?.();
    unlink?.();
    bar$?.stop();
    doc.removeEventListener('pointerdown', onDocPointer, true);
    doc.removeEventListener('keydown', onDocKey, true);
    for (const id of timers.values()) win.clearTimeout(id);
    timers.clear();
    group.destroy();
    layer.destroy();
  }

  try {
    place();
    flags = readFlags();
    bar$ = watchBar({
      doc, win, player, own: () => group.host,
      onChange: (bar) => {
        render();
        measureOverflow(bar);
      },
    });
    doc.addEventListener('pointerdown', onDocPointer, true);
    doc.addEventListener('keydown', onDocKey, true);
    off = controller.subscribe(render);
    render();
  } catch (err) {
    destroyed = true;
    teardown();
    throw err;
  }

  return {
    player,
    /** المشغّل والطبقة ما زالا في الصفحة؛ المجموعة تُعاد إلى الشريط في check. */
    healthy: () => !destroyed && player.isConnected && layer.isConnected(),
    /** فحص خفيف دوري: الموضع، وما يُقرأ من الصفحة (بث جارٍ، وزر CC)، وقياس الضيق. */
    check() {
      if (destroyed) return;
      try {
        place();
        const next = readFlags();
        if (next.live !== flags.live || next.unavailable !== flags.unavailable || next.ad !== flags.ad) {
          flags = next;
          render();
        }
        measureOverflow(bar$.refresh());
      } catch (err) {
        counts.renderFailures++;
        fail('CT_RENDER_FAILED', err);
      }
    },
    /** أعداد ورموز فقط (R36): لا نص مقاطع ولا أسماء ملفات ولا تعليمات. */
    diagnostics: () => ({
      ...counts, lastCode, lastDetail, open: ui.open, size: bar$?.snapshot().size ?? null, overflow,
      styleMode: { group: group.styleMode, layer: layer.styleMode }, toasts: toasts.length,
    }),
    /** للحزام الحي وحده: ما يظهر الآن ومواضع الأزرار. لا يدخل التشخيص. */
    peek() {
      const right = group.host.parentNode;
      const box = (e) => {
        const r = e.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), height: Math.round(r.height) };
      };
      return {
        connected: group.isConnected(),
        first: !!right && right.firstChild === group.host,
        inRightControls: !!right && right === getRightControls(doc),
        size: bar$.snapshot().size,
        group: box(group.host),
        fit: lastModel?.size ?? null,
        room: bar$.snapshot().room,
        buttons: Object.fromEntries(['download', 'upload', 'panel', 'minus', 'badge', 'plus'].map((k) => {
          const el = group.button(k);
          const shown = !!el.getClientRects?.().length;
          return [k, { box: shown ? box(el) : null, label: el.getAttribute('aria-label'), tip: lastModel?.[k]?.tip ?? null, description: el.getAttribute('aria-description'), busy: el.getAttribute('aria-busy') === 'true', disabled: el.getAttribute('aria-disabled') === 'true', pressed: el.getAttribute('aria-pressed'), popup: el.getAttribute('aria-haspopup'), expanded: el.getAttribute('aria-expanded'), text: k === 'badge' ? el.textContent : null }];
        })),
        focusedKind: group.focused(),
        layer: layer.peek(),
        overflow,
      };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      teardown();
    },
  };
}
