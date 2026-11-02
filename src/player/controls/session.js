// جلسة الأدوات على مشغّل بعينه (P6): تجمع حالة المتحكم وحالة الشريط وحالة الواجهة المحلية (أي قائمة مفتوحة، وما
// يكتبه المستخدم، وما يجري) في عرض واحد: المجموعة في الشريط، والقوائم والتلميحات والرسائل في الطبقة. لا تكتب في
// التخزين إلا عبر أفعال المتحكم، ولا ترمي إليه: الإخفاق رمز في التشخيص، أو رسالة مفهومة للمستخدم إن خصّ فعله.
import { TjError, messageFor, toErrorInfo } from '../../core/errors/index.js';
import { formatOffset } from '../../ui/format.js';
import { SELECTORS, getChromeBottom, getRightControls, isLiveNow } from '../youtube-dom.js';
import { watchBar } from './bar.js';
import { copyText, instructionsFor, loadFor, readFor, runDownload } from './flows.js';
import { createGroup } from './group.js';
import { createLayer } from './layer.js';
import { builder, confirmMenu, displayMenu, downloadMenu, stepText, timingMenu } from './menus.js';
import { LABELS, badgeTip, comparisonSummary, minusTip, nudgeFlash, parseSeconds, plusTip } from './text.js';

export const TOAST_MS = 3000;
export const FLASH_MS = 1000;
export const DONE_MS = 2000;
const MAX_TOASTS = 3;
const MAX_OFFSET_S = 600;
const SPLIT = Object.freeze({ min: 50, max: 2000 });
const STEP = Object.freeze({ min: 100, max: 10000 });
const PRESET_STEPS = [500, 1000];
const KIND_ORDER = { manual: 0, asr: 1 };
/** زر كل قائمة: موضعها فوقه، وإليه يعود التركيز عند إغلاقها. */
const ANCHOR = { download: 'download', display: 'upload', confirm: 'upload', timing: 'badge' };
const ROLE = { download: 'menu', display: 'menu', confirm: 'dialog', timing: 'dialog' };
const TITLE = { download: LABELS.downloadTitle, display: LABELS.displayTitle, confirm: LABELS.confirmTitle, timing: LABELS.timingTitle };

/** «جزآن»، «3 أجزاء»، «11 جزءًا» بعد «✓ نُزّل». @param {number} n */
const partsLabel = (n) => (n === 2 ? 'جزآن' : n % 100 >= 3 && n % 100 <= 10 ? `${n} أجزاء` : `${n} جزءًا`);
const signOf = (ms) => (Math.round(ms / 100) === 0 ? 'zero' : ms > 0 ? 'positive' : 'negative');
const okTracks = (s) => s.captured.filter((t) => t.ok && t.cueCount > 0).sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);

/** حالة الواجهة المحلية لفيديو واحد؛ تُستبدل كلها عند تبدّل الفيديو فلا يبقى شيء من السابق. */
function freshUi(videoId) {
  return {
    videoId,
    open: /** @type {null | 'download' | 'display' | 'confirm' | 'timing'} */ (null),
    hint: /** @type {string | null} */ (null),
    flash: /** @type {string | null} */ (null),
    copyBusy: false,
    download: { key: null, mode: null, why: false, fallback: false, split: false, splitSize: null, splitError: null, busy: false, done: null, result: [] },
    upload: { busy: false, error: null, warnings: [], pending: null, pickFor: null },
    timing: { offsetText: null, offsetError: null, custom: false, stepText: null, stepError: null },
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
export function createControlsSession({ controller, doc, win, player, flows, now = () => Date.now() }) {
  const counts = { renders: 0, renderFailures: 0, reinserts: 0, downloads: 0, copies: 0, imports: 0, flowFailures: 0, overflows: 0 };
  let lastCode = null;
  let lastDetail = null;
  let destroyed = false;
  let ui = freshUi(null);
  let menuKey = null;
  let menuKind = null;
  let lastModel = null;
  let overflow = null;
  let flags = { live: false, unavailable: false };
  /** @type {{ id: string, tone: 'success' | 'info' | 'warning' | 'error', text: string, persist: boolean }[]} */
  let toasts = [];
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

  const group = createGroup({ doc, win, on: { action, hint, escape: () => closeMenu(true) } });
  const layer = createLayer({ doc, win, on: { escape: () => closeMenu(true), files: onFiles } });

  // ———— قراءات من الصفحة (كل اسم يوتيوب من youtube-dom) ————

  /** زر CC معطّل: الفيديو بلا ترجمة متاحة (تلميح بصري فقط؛ القائمة تبقى تشرح). */
  function captionsUnavailable() {
    const b = doc.querySelector(SELECTORS.subtitlesButton);
    return !!b && (b.getAttribute('aria-disabled') === 'true' || b.hasAttribute('disabled'));
  }
  const readFlags = () => ({ live: isLiveNow(doc), unavailable: captionsUnavailable() });

  // ———— نماذج العرض ————

  function groupModel(s, bar) {
    const tracks = okTracks(s);
    const noVideo = !s.videoId;
    const reason = noVideo ? null : s.loading ? messageFor('CT_LOADING') : !s.arabic ? messageFor('CT_NEEDS_ARABIC') : null;
    const viewOff = noVideo || !!reason;
    const withReason = (label) => (reason ? `${label} — ${reason}` : label);
    const step = s.settings.offsetStepMs;
    const off = s.view.displayOffsetMs;
    const tone = s.arabic ? comparisonSummary(s.arabic.comparison).tone : null;
    const unavailable = flags.live || (!tracks.length && flags.unavailable);
    const dlReason = flags.live ? messageFor('EX_LIVE') : unavailable ? messageFor('CT_NO_CAPTIONS') : null;
    return {
      size: bar.size,
      download: {
        label: dlReason ? `${LABELS.download} — ${dlReason}` : LABELS.download, disabled: noVideo, unavailable,
        loading: ui.download.busy, dot: tracks.length ? 'ready' : null, expanded: ui.open === 'download',
      },
      upload: {
        label: s.arabic ? `الترجمة العربية: ${s.arabic.fileName}` : LABELS.upload, disabled: noVideo || s.loading,
        loading: ui.upload.busy, dot: s.arabic ? (tone === 'warn' ? 'warning' : 'loaded') : null, expanded: ui.open === 'display' || ui.open === 'confirm',
      },
      minus: { label: withReason(minusTip(step)), disabled: viewOff },
      badge: { label: withReason(badgeTip(off)), disabled: viewOff, text: formatOffset(off), sign: signOf(off), expanded: ui.open === 'timing' },
      plus: { label: withReason(plusTip(step)), disabled: viewOff },
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
      busy: d.busy, copyBusy: ui.copyBusy, done: d.done, result: d.result,
    };
  }

  function displayModel(s) {
    const a = s.arabic;
    return {
      fileName: a.fileName, count: a.cues.length, edited: a.edited, comparison: a.comparison, notes: a.comparison?.notes ?? [],
      // الإصدار الأول: ترجمة واحدة في الخانة 1 نشطة، والخانتان 2 و3 فارغتان حتى تُضاف الخانات (P10/P12).
      slots: [{ n: 1, filled: true, active: true, name: a.fileName }, { n: 2, filled: false, active: false, name: null }, { n: 3, filled: false, active: false, name: null }],
      warnings: ui.upload.warnings, mode: s.view.displayMode, dualAvailable: !!s.english, busy: ui.upload.busy, error: ui.upload.error,
    };
  }

  function confirmModel(s) {
    const p = ui.upload.pending;
    return { fileName: p.input.fileName, count: p.input.cues.length, comparison: p.input.comparison, warnings: p.warnings, offsetMs: s.view.displayOffsetMs };
  }

  function timingModel(s) {
    const t = ui.timing;
    const step = s.settings.offsetStepMs;
    const off = s.view.displayOffsetMs;
    return {
      offsetMs: off, offsetText: t.offsetText ?? formatOffset(off), offsetError: t.offsetError,
      stepMs: step, custom: t.custom || !PRESET_STEPS.includes(step), stepText: t.stepText ?? stepText(step), stepError: t.stepError,
    };
  }

  /** ما يُبنى للقائمة المفتوحة، ومفتاح شكلها: نصوص الحقول وحدها خارج المفتاح فلا يُعاد البناء مع كل حرف. */
  function menuSpec(s) {
    const kind = ui.open;
    if (!kind || !s.videoId) return null;
    if (kind === 'download') {
      const m = downloadModel(s);
      return { kind, key: JSON.stringify({ ...m, splitSize: null }), build: () => downloadMenu(h, act, m) };
    }
    if (kind === 'display') {
      if (!s.arabic) return null;
      const m = displayModel(s);
      return { kind, key: JSON.stringify({ ...m, comparison: m.comparison?.fingerprintId ?? null, c: s.arabic.cues.length, v: s.version }), build: () => displayMenu(h, act, m) };
    }
    if (kind === 'confirm') {
      if (!ui.upload.pending) return null;
      const m = confirmModel(s);
      return { kind, key: JSON.stringify({ f: m.fileName, n: m.count, w: m.warnings, o: m.offsetMs }), build: () => confirmMenu(h, act, m) };
    }
    if (kind === 'timing') {
      if (!s.arabic || s.loading) return null;
      const m = timingModel(s);
      return { kind, key: JSON.stringify({ ...m, offsetText: null, stepText: null }), build: () => timingMenu(h, act, m) };
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
    if (spec.kind !== menuKind || !layer.menuOpen()) {
      layer.openMenu(nodes, group.button(ANCHOR[spec.kind]), { label: TITLE[spec.kind], role: ROLE[spec.kind] });
    } else {
      layer.patchMenu(nodes);
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
    if (kind && !(ui.open && ANCHOR[ui.open] === kind)) {
      layer.showTip(lastModel[kind].label, group.button(kind));
      return;
    }
    layer.showTip(null, null);
  }

  function renderToasts() {
    layer.renderToasts(toasts, dismissToast);
  }

  /** الحلقة الوحيدة: كل مدخل (حالة المتحكم، الشريط، فعل المستخدم) يمر هنا. */
  function render() {
    if (destroyed) return;
    try {
      const s = controller.getState();
      syncVideo(s);
      handleNotices(s);
      const bar = bar$.snapshot();
      // اختفى شريط يوتيوب والقائمة مفتوحة بلا تركيز فيها (لا كتابة ولا لوحة مفاتيح) ولا عمل جارٍ ولا تأكيد ينتظر: تُغلق
      // بدل أن تعود فجأة مع الشريط عند أول حركة للمؤشر.
      if (bar.hidden && ui.open && ui.open !== 'confirm' && !ui.download.busy && !ui.upload.busy && !layer.isTyping() && !layer.focused()) ui.open = null;
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
    clearTimer('done');
    toasts = [];
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

  /** رسالة عابرة: النجاح والمعلومة تختفيان بعد 3 ثوانٍ، والتحذير والخطأ يبقيان حتى الإغلاق. */
  function addToast(tone, text) {
    const id = `t${++toastSeq}`;
    const persist = tone === 'warning' || tone === 'error';
    const dropped = toasts.filter((t) => t.text === text);
    for (const t of dropped) clearTimer(t.id);
    toasts = [...toasts.filter((t) => t.text !== text), { id, tone, text, persist }];
    while (toasts.length > MAX_TOASTS) clearTimer(toasts.shift().id);
    if (!persist) later(id, TOAST_MS, () => dismissToast(id));
    renderToasts();
  }

  function dismissToast(id) {
    clearTimer(id);
    toasts = toasts.filter((t) => t.id !== id);
    renderToasts();
  }

  // ———— الأفعال من الشريط ————

  function hint(kind) {
    ui.hint = kind;
    renderTip();
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

  function nudge(dir) {
    controller.nudgeOffset(dir)?.catch?.(() => {});
    ui.timing.offsetText = null;
    ui.timing.offsetError = null;
    ui.flash = nudgeFlash(controller.getState().view.displayOffsetMs);
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
    if (kind === 'timing') ui.timing = { offsetText: null, offsetError: null, custom: false, stepText: null, stepError: null };
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
      case 'track': d.key = value; d.done = null; d.result = []; break;
      case 'mode': d.mode = value; d.done = null; break;
      case 'fallback': d.fallback = !d.fallback; break;
      case 'split': d.split = !!value; d.splitError = null; break;
      case 'splitSize': d.splitSize = String(value); return;
      case 'download': startDownload(); return;
      case 'copy': startCopy(); return;
      case 'displayMode': setMode(value); return;
      // تبديل الخانة النشطة: لا خانات غير الأولى في الإصدار الأول، فلا فعل حتى تُضاف (P10/P12).
      case 'slot': return;
      case 'replace': pick('replace'); return;
      case 'confirmReplace': confirmReplace(); return;
      case 'cancelReplace':
        ui.upload.pending = null;
        ui.open = 'display';
        render();
        layer.focusFirst();
        return;
      case 'offsetText': t.offsetText = String(value); return;
      // change يصل عند فقد التركيز ولو بعد إغلاق القائمة (Esc أو النقر خارجها): الإغلاق إلغاء لما كُتب، لا تطبيق له.
      case 'applyOffset': if (ui.open === 'timing') applyOffset(String(value)); return;
      case 'step': chooseStep(String(value)); return;
      case 'stepText': t.stepText = String(value); return;
      case 'applyStep': if (ui.open === 'timing') applyStep(String(value)); return;
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

  function setMode(mode) {
    try {
      controller.setDisplayMode(mode)?.catch?.(() => {});
    } catch (err) {
      ui.upload.error = toErrorInfo(err).message;
      render();
    }
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

  /** حجم الجزء من حقله إن طُلب التقسيم؛ القيمة غير الصالحة توقف الفعل بخطأ تحت الحقل. */
  function splitSpec() {
    const d = ui.download;
    if (!d.split) return { ok: true, split: null };
    const raw = d.splitSize ?? String(controller.getState().settings.export.splitThreshold);
    const n = Number(String(raw).trim());
    if (!Number.isInteger(n) || n < SPLIT.min || n > SPLIT.max) {
      d.splitError = messageFor('CT_SPLIT_INVALID');
      return { ok: false };
    }
    d.splitError = null;
    return { ok: true, split: { size: n } };
  }

  async function startDownload() {
    const d = ui.download;
    if (d.busy) return;
    const s = controller.getState();
    const m = downloadModel(s);
    if (!m.selectedKey) return;
    const sp = splitSpec();
    if (!sp.ok) {
      render();
      layer.find('splitSize')?.focus();
      return;
    }
    d.busy = true;
    d.done = null;
    d.result = [];
    render();
    const r = await runDownload({ controller, exportFlow: flows.exportFlow, doc, key: m.selectedKey, mode: m.mode, split: sp.split, now: now() });
    if (destroyed || ui.download !== d) return;
    d.busy = false;
    if (!r.ok) {
      counts.flowFailures++;
      fail(r.error.code, r.error.message);
      d.result = [{ tone: 'error', text: r.error.message }];
    } else {
      counts.downloads++;
      d.done = r.names.length > 1 ? partsLabel(r.names.length) : r.names[0];
      d.result = r.warnings.map((code) => ({ tone: code === 'EX_SPLIT_NOT_NEEDED' ? 'info' : 'warn', text: messageFor(code) }));
      if (!r.saved) d.result.push({ tone: 'warn', text: r.saveError?.code === 'CT_VIDEO_CHANGED' ? r.saveError.message : messageFor('CT_FINGERPRINT_NOT_SAVED') });
      later('done', DONE_MS, () => {
        if (ui.download !== d) return;
        d.done = null;
        render();
      });
    }
    render();
  }

  async function startCopy() {
    if (ui.copyBusy) return;
    const s = controller.getState();
    const m = downloadModel(s);
    if (!m.selectedKey) return;
    const sp = splitSpec();
    if (!sp.ok) {
      render();
      return;
    }
    const r = instructionsFor({ controller, exportFlow: flows.exportFlow, key: m.selectedKey, mode: m.mode, split: sp.split, now: now() });
    if (!r.ok) {
      counts.flowFailures++;
      ui.download.result = [{ tone: 'error', text: r.error.message }];
      render();
      return;
    }
    const mine = ui;
    mine.copyBusy = true;
    render();
    const ok = await copyText(r.text, { doc, win, root: layer.root });
    if (destroyed || ui !== mine) return;
    mine.copyBusy = false;
    if (ok) counts.copies++;
    else counts.flowFailures++;
    addToast(ok ? 'success' : 'error', messageFor(ok ? 'CT_COPIED' : 'CT_COPY_FAILED'));
    render();
  }

  // ———— الرفع ————

  function onFiles(files) {
    const p = ui.upload.pickFor;
    ui.upload.pickFor = null;
    // فُتح المنتقي لفيديو سابق (التنقل يصفّر الحالة) أو لم يُفتح منّا: لا يُقرأ الملف ولا يُحمَّل.
    if (!p || p.videoId !== controller.getState().videoId) {
      addToast('warning', messageFor('CT_VIDEO_CHANGED'));
      render();
      return;
    }
    startImport(files, p.purpose === 'replace');
  }

  async function startImport(files, replacing) {
    const u = ui.upload;
    if (u.busy) return;
    u.busy = true;
    u.error = null;
    render();
    const read = await readFor({ controller, importFlow: flows.importFlow, files });
    if (destroyed || ui.upload !== u) return;
    if (!read.ok) {
      u.busy = false;
      counts.flowFailures++;
      if (replacing && ui.open === 'display') u.error = read.error.message;
      else addToast('error', read.error.message);
      render();
      return;
    }
    if (controller.getState().arabic) {
      u.busy = false;
      u.pending = read;
      ui.open = 'confirm';
      render();
      layer.focusFirst();
      return;
    }
    const r = await loadFor({ controller, read, replace: false });
    if (destroyed || ui.upload !== u) return;
    u.busy = false;
    if (!r.ok) {
      if (r.error.code === 'ST_ARABIC_EXISTS') {
        u.pending = read;
        ui.open = 'confirm';
        render();
        layer.focusFirst();
        return;
      }
      counts.flowFailures++;
      addToast('error', r.error.message);
      render();
      return;
    }
    counts.imports++;
    u.warnings = read.warnings;
    ui.open = 'display';
    render();
  }

  async function confirmReplace() {
    const u = ui.upload;
    const read = u.pending;
    if (!read || u.busy) return;
    u.busy = true;
    render();
    const r = await loadFor({ controller, read, replace: true });
    if (destroyed || ui.upload !== u) return;
    u.busy = false;
    u.pending = null;
    // أغلق المستخدم التأكيد أثناء الحفظ (Esc أو النقر خارجه): تُطبَّق النتيجة دون إعادة فتح القائمة ولا نقل التركيز.
    const stillOpen = ui.open === 'confirm';
    if (!r.ok) {
      counts.flowFailures++;
      u.error = r.error.message;
      if (!stillOpen) addToast('error', r.error.message);
    } else {
      counts.imports++;
      u.warnings = read.warnings;
    }
    if (stillOpen) ui.open = 'display';
    render();
    if (stillOpen) layer.focusFirst();
  }

  // ———— خارج القوائم: النقر خارجها وEsc ————

  const onDocPointer = (ev) => {
    if (!ui.open) return;
    const path = typeof ev.composedPath === 'function' ? ev.composedPath() : [ev.target];
    if (group.owns(path) || layer.owns(path)) return;
    closeMenu(false);
  };
  const onDocKey = (ev) => {
    if (ui.open && ev.key === 'Escape') closeMenu(doc.activeElement === layer.host);
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
      doc, win, player,
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
        if (next.live !== flags.live || next.unavailable !== flags.unavailable) {
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
        buttons: Object.fromEntries(['download', 'upload', 'minus', 'badge', 'plus'].map((k) => {
          const el = group.button(k);
          return [k, { box: box(el), label: el.getAttribute('aria-label'), disabled: el.getAttribute('aria-disabled') === 'true', text: k === 'badge' ? el.textContent : null }];
        })),
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
