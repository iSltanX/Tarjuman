// جلسة الأدوات على مشغّل بعينه (P6): تجمع حالة المتحكم وحالة الشريط وحالة الواجهة المحلية (أي قائمة مفتوحة، وما
// يكتبه المستخدم، وما يجري) في عرض واحد: المجموعة في الشريط، والقوائم والتلميحات والرسائل في الطبقة. لا تكتب في
// التخزين إلا عبر أفعال المتحكم، ولا ترمي إليه: الإخفاق رمز في التشخيص، أو رسالة مفهومة للمستخدم إن خصّ فعله.
import { TjError, hasCode, messageFor, toErrorInfo } from '../../core/errors/index.js';
import { initialPair, normalizeLangPrefs } from '../../core/model/lang-prefs.js';
import { isCommandName } from '../../core/model/messages.js';
import { lookupMs } from '../../core/model/timing.js';
import { rankUsable } from '../../core/model/track-order.js';
import { formatOffset } from '../../ui/format.js';
import { joinList, t } from '../../i18n/index.js';
import { holdTimer } from '../../ui/hold.js';
import { SELECTORS, getChromeBottom, getMainVideo, getRightControls, isAdShowing, isLiveNow, isSubtitlesButton, pressSubtitles, seekMainVideo, subtitlesPressable } from '../youtube-dom.js';
import { fitSize, isFolded, timeClipped, watchBar } from './bar.js';
import { completeInto, continuationFor, fileChars, loadIntoFor, nameHintFor, partSizes, prepareExport, prepareSavedExport, previewFor, readFor, recordFor, recordSavedFor, saveFiles, stripFor } from './flows.js';
import { createGroup } from './group.js';
import { createLayer } from './layer.js';
import { builder, confirmMenu, displayMenu, downloadMenu, stepText, timingMenu } from './menus.js';
import { defaultTarget, keepEditsPlan, manualEdits } from './replace.js';
import { nearestCueIndex, replayCueIndex, sentenceWindow, syncOffset, visibleCueIndex, windowAround } from './sentence.js';
import {
  LABELS, badgeTip, comparisonSummary, downloadedLine, downloadedParts, markToast, markedAmbiguousText, minusTip, modeToast, nameOtherLine, nudgeFlash, offsetToast, parseSeconds, partsWord, plusTip, shortTime,
  syncUndoStaleLine, slotToast, withState,
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
/**
 * رفض يعني أن المشغّل يعرض مسارًا لا يُقبل: يُرشد إلى اختيار لغة أخرى من يوتيوب بخطوات (R64). منذ AA1 تُقبل أي لغة وترجمة
 * يوتيوب الآلية، فيبقى الرمزان لرفض قديم أو مستقبلي فقط.
 */
const PICK_AGAIN = new Set(['EX_NOT_ENGLISH', 'EX_TRANSLATED_TRACK']);
/** Brave قد يختار لغة المتصفح أولًا؛ يُعرف من علامته في المتصفح نفسه. @param {Navigator | undefined} nav */
const isBrave = (nav) => !!nav && (typeof nav.brave === 'object' || (Array.isArray(nav.userAgentData?.brands) && nav.userAgentData.brands.some((b) => /brave/i.test(String(b?.brand)))));
/** حجم الجزء من نصه، أو null خارج الحدود. @param {unknown} raw */
const splitSizeOf = (raw) => {
  const n = Number(String(raw ?? '').trim());
  return Number.isInteger(n) && n >= SPLIT.min && n <= SPLIT.max ? n : null;
};
/**
 * أوامر الاختصارات (الفكرة ١٠، المسار ب، ح-55): يربطها المستخدم في صفحة اختصارات متصفحه، ويمرّرها العامل الخلفي ومعالج الرسائل. لكل أمر
 * قناة رسالته، فالضغطات المتتالية تبدّل رسالتها ولا تراكمها.
 */
const COMMAND_CHANNEL = Object.freeze({ reason: 'command', mode: 'command-mode', offset: 'command-offset' });
/** دورة وضع العرض بترتيب قائمة «الترجمة» (الترجمة وحدها، فوق الأصل، إخفاء). */
const MODE_CYCLE = Object.freeze(['ar', 'dual', 'off']);
/** زر كل قائمة: موضعها فوقه، وإليه يعود التركيز عند إغلاقها. */
const ANCHOR = { download: 'download', display: 'upload', confirm: 'upload', timing: 'badge' };
// حوارات غير نمطية كلها: فيها عناوين ومجموعات اختيار وحقول وأزرار، لا بنود قائمة (تدقيق 7a66f91، U44).
const ROLE = { download: 'dialog', display: 'dialog', confirm: 'dialog', timing: 'dialog' };
const TITLE = (kind) => ({ download: LABELS.downloadTitle, display: LABELS.displayTitle, confirm: LABELS.confirmTitle, timing: LABELS.timingTitle })[kind];

/**
 * نص الخطأ بلغة الواجهة الحالية من رمزه؛ ورمز يحتاج معاملات لا نملكها يبقى بنصه المحسوب.
 * @param {{ code?: string, message?: string }} err
 */
const errorText = (err) => {
  if (err.code && hasCode(err.code)) {
    const text = messageFor(err.code);
    if (!/\{\w+\}/.test(text)) return text;
  }
  return err.message ?? '';
};
const signOf = (ms) => (Math.round(ms / 100) === 0 ? 'zero' : ms > 0 ? 'positive' : 'negative');
// الترتيب الموحد (model/track-order.js): الأصلي قبل المترجم آليًا من يوتيوب (في آخر القائمة، ق٢)، ثم اليدوي قبل التلقائي، ثم الأحدث.
const okTracks = (s) => rankUsable(s.captured);
/**
 * عدد لغات الفيديو في بيانات المشغّل التي لم يُلتقط لها مسار أصلي في هذه الزيارة (ق١): يختارها المستخدم من يوتيوب، والإضافة لا
 * تبدّلها. لغاتٌ مختلفة لا مسارات (التلقائي بلغة ملتقطة ليس لغة أخرى)، وnull حين لا تُعرف قائمة الفيديو.
 * @returns {number | null}
 */
const otherLangs = (s, tracks) => {
  if (!Array.isArray(s.available?.tracks)) return null;
  const have = new Set(tracks.filter((c) => !c.via).map((c) => c.lang));
  return new Set(s.available.tracks.map((t) => t.lang).filter((l) => !have.has(l))).size;
};
/**
 * لغات مقترحة لترجمة هذا الفيديو (AA3): «إلى» في نافذة الإضافة لهذا الفيديو، وإلا الافتراضي، ثم الأخيرة. للاقتراح لا للتخمين.
 * @returns {string[]}
 */
const pairTargets = (s) => {
  const lp = s.langPrefs;
  if (!lp) return [];
  const saved = s.videoId ? lp.videos?.[s.videoId]?.to ?? null : null;
  return [...new Set([saved, lp.pair?.to ?? null, ...(lp.recent ?? [])].filter(Boolean))];
};
/**
 * «إلى» لهذا الفيديو كما تعرضها نافذة الإضافة (ح-58): المحفوظة له، وإلا الافتراضية من الإعدادات. لكشف الفيديو المترجم إلى لغته.
 * @returns {string | null}
 */
const pairTarget = (s) => initialPair(normalizeLangPrefs(s.langPrefs ?? null), { videoId: s.videoId ?? null }).to;
/**
 * مسار الأصل المحفوظ حين لا التقاط صالح في هذه الزيارة (FA-17): يُنزَّل من القائمة بالوضع العادي كما في المحفوظات.
 * @returns {{ key: string, lang: string, kind: 'manual' | 'asr', cueCount: number } | null}
 */
const savedEnglish = (s, tracks) => (!tracks.length && s.english?.source === 'saved' && s.english.cues?.length
  ? { key: s.english.key, lang: s.english.lang, kind: s.english.kind, via: s.english.via ?? null, cueCount: s.english.cues.length } : null);
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
    switching: false,
    /** لغة الترجمة المطلوبة أثناء تبديلها (U-029): تُرسم في المنتقي حتى يتم الحفظ، ثم تعود الحالة الحقيقية. undefined = لا تبديل. */
    pendingLang: /** @type {string | null | undefined} */ (undefined),
    download: {
      key: null, mode: null, why: false, roundTrip: false, longWhy: false, otherOpen: false, fallback: false, longKey: null, longChars: null, split: false, splitSize: null, splitError: null, busy: false,
      saveLine: null, result: [], preview: null,
      // الفكرة ٧-ب: زر CC ينتظر الالتقاط بعد الضغط ({ kind }) أو null، وسطر نتيجته.
      cc: null, ccLine: null,
    },
    upload: { busy: false, error: null, warnings: [], pending: null, pickFor: null, plans: new Map(), ambiguous: null },
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
/** مهلة «CC مضغوط ولا التقاط» قبل رسالتها (ف7): الالتقاط يصل عادة في أقل من ثانية بعد تشغيل CC. */
export const CC_GRACE_MS = 2000;
/**
 * مهلة انتظار الالتقاط بعد ضغط زر CC من «تنزيل الأصل» قبل سطر «لم يصل شيء» (الفكرة ٧-ب): في القياس (ح-56) وصل الالتقاط بعد كل
 * ضغطة خلال الثواني الخمس التي انتظرها المجسّ، في المتصفحات الأربعة.
 */
export const CC_PRESS_WAIT_MS = 5000;

export function createControlsSession({ controller, doc, win, player, flows, now = () => Date.now(), link = null }) {
  const counts = {
    renders: 0, renderFailures: 0, reinserts: 0, downloads: 0, imports: 0, flowFailures: 0, overflows: 0,
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
  let flags = { live: false, unavailable: false, brave: false, ad: false, ccStuck: false, ccOn: false, panelIssue: null };
  /** منذ متى زر CC مضغوط ولا التقاط (ف7)، ولأي فيديو، أو null. */
  let ccOnSince = null;
  let ccVideo = null;
  /** المؤشر فوق التلميح (U89). */
  let tipHover = false;
  /** channel قناة الرسالة: رسائل الاستيراد ('import') تُمسح ببدء استيراد جديد، فلا تتراكم أخطاء قديمة بعد نجاحه (U43). */
  /** @type {{ id: string, tone: 'success' | 'info' | 'warning' | 'error', text: string, persist: boolean, action: { label: string } | null, icon: 'clock' | null, channel: string | null }[]} */
  let toasts = [];
  /** فعل كل رسالة بفعل («تراجع») بمعرّفها؛ لا يدخل العرض. */
  const toastActions = new Map();
  let toastSeq = 0;
  const timers = new Map();
  /** مؤقتات زوال الرسائل الموقوتة بمعرّفها: يُمسكها المؤشر والتركيز كالرسالة المشتركة (U-042). */
  const toastHolds = new Map();
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
  // يُعطى عنصرًا لا يُرسم فيسقط التركيز إلى الصفحة (تدقيق 7a66f91، U88). وإن طُوي في قائمة الشارة فالشارة (القرار ٢٨).
  const unlink = link?.register(() => group.focus(lastModel?.size === 'folded-panel' ? 'badge' : group.button('panel').hasAttribute('hidden') ? 'upload' : 'panel')) ?? null;
  const layer = createLayer({
    doc, win,
    on: {
      escape: () => closeMenu(true), files: onFiles, focusLeave, tipHover: onTipHover,
      // زالت رسالة فيها التركيز (انقضت أو فُعّل «تراجع» بلوحة المفاتيح): إلى «الترجمة» في الشريط لا إلى الصفحة (U88).
      focusLost: () => { if (!destroyed) group.focus('upload'); },
      // المؤشر أو التركيز على رسالة موقوتة (فيها «تراجع» غالبًا) يمسك مؤقتها حتى يغادرها (WCAG 2.2.1؛ U-042).
      toastHold: (id, why, held) => toastHolds.get(id)?.hold(why, held),
    },
  });

  // ———— قراءات من الصفحة (كل اسم يوتيوب من youtube-dom) ————

  /** زر CC معطّل: الفيديو بلا ترجمة متاحة (تلميح بصري فقط؛ القائمة تبقى تشرح). */
  function captionsUnavailable() {
    const b = doc.querySelector(SELECTORS.subtitlesButton);
    return !!b && (b.getAttribute('aria-disabled') === 'true' || b.hasAttribute('disabled'));
  }
  /** زر CC مضغوط: المستخدم شغّل ترجمة يوتيوب (aria-pressed كما يكتبه المشغّل). */
  function captionsOn() {
    return doc.querySelector(SELECTORS.subtitlesButton)?.getAttribute('aria-pressed') === 'true';
  }
  /**
   * CC مضغوط ولم يُلتقط شيء منذ CC_GRACE_MS (ف7): المشغّل سبق ترجمان أو جلب الترجمة من طريق لا يمر بالالتقاط، فرسالة تقول العلاج
   * بدل «فعّل ترجمة يوتيوب (CC)» وهي مفعّلة أمام المستخدم.
   */
  function ccStuckNow() {
    const s = controller.getState();
    // لا إنذار أثناء الإعلان (المشغّل لا يجلب ترجمة الفيديو قبل انتهائه)، ولا مع التقاط مرفوض (رآه ترجمان وقال سببه في
    // captureIssue)، والعدّ لكل فيديو من أوله (مراجعة المرحلة 6، م1 وم2).
    if (!captionsOn() || s.captured.length || s.captureIssue || isAdShowing(doc)) {
      ccOnSince = null;
      return false;
    }
    const t = now();
    if (ccOnSince === null || ccVideo !== s.videoId) {
      ccOnSince = t;
      ccVideo = s.videoId;
    }
    return t - ccOnSince >= CC_GRACE_MS;
  }
  // panelIssue: رمز تعذّر ظهور لوحة النص من صلتها (ع-ل)، يقوله زرها.
  const readFlags = () => ({ live: isLiveNow(doc), unavailable: captionsUnavailable(), brave: isBrave(win.navigator), ad: isAdShowing(doc), ccStuck: ccStuckNow(), ccOn: captionsOn(), panelIssue: link?.panelIssue?.() ?? null });

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
    const saved = savedEnglish(s, tracks);
    const unavailable = flags.live || (!tracks.length && !saved && flags.unavailable);
    const dlReason = flags.live ? messageFor('EX_LIVE') : unavailable ? messageFor('CT_NO_CAPTIONS') : null;
    const dlName = dlReason ? `${LABELS.download} — ${dlReason}` : LABELS.download;
    const dlState = dlReason ? null : ui.download.busy ? LABELS.stateDownloading : tracks.length ? (tracks.some((t) => t.warnings?.length) ? LABELS.stateIncomplete : LABELS.stateReady)
      : saved ? LABELS.stateSaved : null;
    const upState = ui.upload.busy ? LABELS.importing : s.arabic && summary.tone === 'warn' ? LABELS.stateDiffers : null;
    const upLabel = s.arabic ? `${LABELS.translation}: ${s.arabic.fileName}` : LABELS.upload;
    // بلا ترجمة يفتح الزر منتقي الملفات مباشرة: لا يعلن نافذة (U44).
    const upPopup = s.arabic ? undefined : null;
    const badge = badgeTip(off);
    const ui$ = s.prefs?.ui;
    const panelShown = ui$?.panelEntry !== false;
    const panelOpen = panelShown && ui$?.panelOpen === true;
    const panelTip = panelOpen ? LABELS.panelClose : LABELS.panelOpen;
    // ن-١ (قرار سلطان، نقض ح-2): لا يُطوى زر اللوحة ما دامت الشارة معطّلة (بلا ترجمة أو أثناء التحميل)، فقائمتها لا تُفتح ولا
    // طريق إلى اللوحة غيره، وفيها خطوات البدء. يبقى في الشريط ولو بقي قص، ويُبلَّغ CT_BAR_OVERFLOW كما في measureOverflow.
    const size = fitSize(bar, panelShown ? 5 : 4, { panel: panelShown && !viewOff });
    // ت-١ (قرار سلطان 2026-11-13): في المقاس المطوي لا يُرسم − و+ في الشريط، وهما في قائمة الشارة؛ والشارة تقول ذلك في تلميحها ووصفها.
    // وفي «المطوي باللوحة» زر اللوحة معهما (القرار ٢٨).
    const folded = isFolded(size);
    const panelFolded = size === 'folded-panel';
    const foldedNote = panelFolded ? LABELS.badgeFoldedPanel : folded ? LABELS.badgeFolded : null;
    return {
      size,
      download: {
        label: dlName, tip: withState(dlName, dlState), description: dlState, disabled: noVideo, unavailable,
        loading: ui.download.busy, expanded: ui.open === 'download',
      },
      upload: {
        label: upLabel, tip: withState(s.arabic ? LABELS.translation : LABELS.upload, upState), description: s.arabic ? summary.text : upState,
        disabled: noVideo || s.loading, loading: ui.upload.busy, expanded: ui.open === 'display' || ui.open === 'confirm', popup: upPopup,
      },
      // ع-ل: اللوحة لا تظهر لغياب عمود يوتيوب: السبب في التلميح ووصف الزر، كالسبب مع الأزرار الأخرى. والزر يبقى يفتح ويغلق.
      panel: {
        label: LABELS.panel, tip: flags.panelIssue ? `${panelTip} — ${messageFor(flags.panelIssue)}` : panelTip,
        description: flags.panelIssue ? messageFor(flags.panelIssue) : null, disabled: noVideo, hidden: !panelShown || panelFolded, pressed: panelOpen,
      },
      minus: { label: withReason(minusTip(step)), tip: withReason(minusTip(step)), description: null, disabled: viewOff, hidden: folded },
      badge: {
        label: withReason(badge), tip: withState(withReason(badge), foldedNote), description: foldedNote,
        disabled: viewOff, text: formatOffset(off), sign: signOf(off), expanded: ui.open === 'timing',
      },
      plus: { label: withReason(plusTip(step)), tip: withReason(plusTip(step)), description: null, disabled: viewOff, hidden: folded },
    };
  }

  /**
   * «ملف طويل» (ف4): المسار المختار أكثر مقاطع من «يُقترح التقسيم ابتداءً من» في الإعدادات. العدد وطول النص (يُحسب مرة لكل
   * مسار ووضع)، أو null.
   */
  function longFileOf(s, tracks) {
    const d = ui.download;
    const t = tracks.find((x) => x.key === d.key) ?? tracks[0];
    if (!t || !(t.cueCount > s.settings.export.splitThreshold)) return null;
    const mode = d.mode ?? s.settings.export.modeDefault;
    const key = `${t.key}|${t.capturedAt}|${mode}`;
    if (d.longKey !== key) {
      d.longKey = key;
      d.longChars = fileChars({ controller, key: t.key, mode });
    }
    return { count: t.cueCount, chars: d.longChars };
  }

  function downloadModel(s) {
    const d = ui.download;
    const tracks = okTracks(s);
    const longFile = longFileOf(s, tracks);
    return {
      live: flags.live, unavailable: flags.unavailable, captureIssue: s.captureIssue?.code ?? null, ccStuck: flags.ccStuck,
      // اسم الصيغة المرفوضة لرسالة EX_UNSUPPORTED_FORMAT (الفكرة ٤، الإنذار المبكر)، وnull لغيرها.
      captureFormat: s.captureIssue?.format ?? null,
      invalid: s.captured.filter((t) => !t.ok).map((t) => ({ code: t.code })),
      tracks: tracks.map((t) => ({ key: t.key, lang: t.lang, kind: t.kind, via: t.via ?? null, ok: t.ok, cueCount: t.cueCount, warnings: t.warnings, lastEndMs: t.lastEndMs, capturedAt: t.capturedAt })),
      selectedKey: tracks.some((t) => t.key === d.key) ? d.key : tracks[0]?.key ?? null,
      mode: d.mode ?? s.settings.export.modeDefault, durationMs: s.durationMs,
      // قسم التقسيم مطوي حتى يفتحه المستخدم، ولو كان الملف طويلًا (ح-61؛ كان يُفتح للملف الطويل، ف4)، و«لماذا؟» في سطر «ملف طويل» يدل عليه.
      why: d.why, roundTripOpen: d.roundTrip, longWhy: d.longWhy, otherOpen: d.otherOpen, target: pairTarget(s), longFile, fallbackOpen: d.fallback, split: d.split, splitSize: d.splitSize ?? String(s.settings.export.splitThreshold), splitError: d.splitError,
      busy: d.busy, saveLine: d.saveLine, result: d.result,
      pickGuide: (!tracks.length && PICK_AGAIN.has(s.captureIssue?.code ?? '')) || otherLangs(s, tracks) ? { brave: flags.brave } : null,
      otherLangs: otherLangs(s, tracks), translatable: s.available?.translatable === true,
      saved: savedEnglish(s, tracks),
      cc: ccModel(s, tracks), ccLine: d.ccLine,
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

  /** سطر «المواضع الغامضة» وزرها بعد الرفع (ف6)، ما لم يُعلَّم بعد، وما دامت خانة الملف هي النشطة المعروضة. */
  function ambiguousModel(s) {
    const a = ui.upload.ambiguous;
    if (!a?.numbers?.length || s.activeSlot !== a.n) return null;
    const nums = a.numbers;
    return { text: messageFor('IM_NOTE_AMBIGUOUS', { count: nums.length, list: joinList(nums.slice(0, 12).map(String).concat(nums.length > 12 ? ['…'] : [])) }), count: nums.length };
  }

  function displayModel(s) {
    const a = s.arabic;
    const slots = slotsOf(s);
    const lang = ui.switching && ui.pendingLang !== undefined ? ui.pendingLang : a.lang ?? null;
    return {
      fileName: a.fileName, count: a.cues.length, edited: a.edited, comparison: a.comparison, notes: a.comparison?.notes ?? [],
      slots, switching: s.loading || ui.switching, uploadLabel: slots.some((x) => !x.filled) ? LABELS.uploadMore : LABELS.replace,
      warnings: ui.upload.warnings, ambiguous: ambiguousModel(s), mode: s.view.displayMode, dualAvailable: !!s.english, originalLang: s.english?.lang ?? null, busy: ui.upload.busy, error: ui.upload.error,
      // لغة الترجمة النشطة (AA3) ومقترحاتها: الحالية، ثم «إلى» في النافذة، ثم الأخيرة.
      lang, langSuggested: [lang, ...pairTargets(s)].filter(Boolean),
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

  /** حارس الملف الثنائي في التأكيد (الفكرة ١١، ح-49): التحذير وزره، ثم سطر ما أُزيل بعد النقرة. */
  const bilingualModel = (p) => ({
    bilingual: p.bilingual ? { text: messageFor('IM_BILINGUAL', { count: p.bilingual.count, total: p.bilingual.total, line: p.bilingual.line }), action: t('common.bilingual.remove') } : null,
    stripped: p.stripped ? messageFor('IM_NOTE_BILINGUAL_REMOVED', { count: p.stripped, line: p.strippedLine }) : null,
  });

  /** التأكيد المضغوط بعد فحص الملف (§١٩.٣): الملف والملخص، وقرينة الاسم، و«حفظ في» 1 2 3، وما يمسه الاستبدال. */
  function confirmModel(s) {
    const p = ui.upload.pending;
    const slots = slotsOf(s);
    const complete = p.complete ? { n: p.complete.cont.n, adds: p.complete.cont.adds, remaining: p.complete.cont.remaining, renumbered: p.complete.cont.renumbered } : null;
    if (p.target === 'complete' && complete) {
      // الإكمال (ف3): المقارنة للترجمة بعده، ولا استبدال ولا تعديلات تُفقد ولا لغة ملف (تبقى لغة الخانة).
      return {
        fileName: p.input.fileName, count: p.input.cues.length, comparison: p.complete.preview ?? p.preview ?? p.input.comparison, warnings: p.warnings,
        ...bilingualModel(p),
        hint: p.hint ? nameOtherLine(p.hint.title) : null, slots, target: 'complete', complete, completing: true, filled: false, edits: 0,
        keepAvailable: false, keep: false, conflicts: 0, offsetNote: false, previousFrom: null,
        busy: ui.upload.busy, error: ui.upload.error, lang: p.lang ?? null, langSuggested: [],
      };
    }
    const target = slots.find((x) => x.n === p.target) ?? slots[0];
    const filled = target.filled;
    const plan = filled ? planFor(s, p, target.n) : { edits: 0, keep: null };
    const keepOk = !!plan.keep?.ok;
    return {
      // المعاينة بالمحاذاة كما بعد الحفظ (FA-04)، وتقرير الحفظ بالرقم يبقى في input.
      fileName: p.input.fileName, count: p.input.cues.length, comparison: p.preview ?? p.input.comparison, warnings: p.warnings,
      ...bilingualModel(p),
      hint: p.hint ? nameOtherLine(p.hint.title) : null, slots, target: target.n, complete, completing: false, filled, edits: plan.edits,
      keepAvailable: keepOk, keep: keepOk && p.keep, conflicts: keepOk ? plan.keep.conflicts : 0,
      offsetNote: filled && target.active && Math.round(s.view.displayOffsetMs / 100) !== 0,
      // استبدال ممتلئة والنسخة السابقة موجودة: تُمحى (U76).
      previousFrom: filled && s.bundle?.previous ? s.bundle.previous.from : null,
      busy: ui.upload.busy, error: ui.upload.error,
      // لغة الملف (AA3): ما اختاره المستخدم هنا، وإلا رمز صريح في اسمه، وإلا «إلى» في نافذة الإضافة، وإلا «غير محددة».
      lang: p.lang ?? null, langSuggested: [p.fileLang, ...pairTargets(s)].filter(Boolean),
    };
  }

  /** زر اللوحة في قائمة الشارة (القرار ٢٨): اسمه بحالته، ومضغوط إن كانت مفتوحة، وسبب تعذّر ظهورها (ع-ل). */
  function panelEntry(s) {
    const open = s.prefs?.ui?.panelOpen === true;
    return { label: open ? LABELS.panelClose : LABELS.panelOpen, pressed: open, reason: flags.panelIssue ? messageFor(flags.panelIssue) : null };
  }

  function timingModel(s) {
    const t = ui.timing;
    const step = s.settings.offsetStepMs;
    const off = s.view.displayOffsetMs;
    const sync = t.sync ? { at: shortTime(t.sync.atMs), visible: t.sync.visible, ...sentenceWindow(s.arabic.cues, t.sync.start) } : null;
    return {
      offsetMs: off, offsetText: t.offsetText ?? formatOffset(off), offsetError: t.offsetError,
      stepMs: step, custom: t.custom || !PRESET_STEPS.includes(step), stepText: t.stepText ?? stepText(step), stepError: t.stepError, sync,
      // ت-١: − و+ المطويان من الشريط حول القيمة الكبيرة، بتلميحيهما في الشريط؛ وزر اللوحة المطوي (القرار ٢٨) بحالته وسببه (ع-ل).
      nudge: isFolded(lastModel?.size) ? { minus: minusTip(step), plus: plusTip(step) } : null,
      panel: lastModel?.size === 'folded-panel' ? panelEntry(s) : null,
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
    const label = spec.label ?? TITLE(spec.kind);
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
      } else if (spec.kind === 'download' || fid.startsWith('nudge:') || fid === 'panelToggle') {
        // ت-١: اتسع الشريط فعاد − و+ (أو زر اللوحة) إليه وزالا من القائمة والتركيز عليهما: إلى أول القائمة لا إلى الصفحة.
        // وح-40: وصل الالتقاط و«تنزيل الأصل» مفتوحة فزال ما كان مركّزًا («لماذا؟»): إلى أولها كذلك.
        layer.focusFirst();
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
      // وزر CC ينتظر الالتقاط بعد ضغطه (الفكرة ٧-ب) كذلك: سطر نتيجته في القائمة.
      const pending = ui.open === 'confirm' || (ui.open === 'timing' && !!ui.timing.sync) || (ui.open === 'download' && !!ui.download.cc);
      if (bar.hidden && ui.open && !pending && !ui.download.busy && !ui.upload.busy && !layer.isTyping() && !layer.focused()) ui.open = null;
      // وما بقي مفتوحًا بقرار يبقى ظاهرًا: لا قائمة خفية تتلقى الضغطات، ولا تختفي أمام مستخدم لوحة المفاتيح (GM-003).
      layer.setKeep?.(!!ui.open && (pending || ui.download.busy || ui.upload.busy || !!layer.focused()));
      lastModel = groupModel(s, bar);
      // زر طُوي (ت-١) أو أُخفي والمؤشر أو التركيز عليه: لا يبقى تلميحه عالقًا فوق موضع لا يُرسم فيه.
      if (ui.hint && lastModel[ui.hint]?.hidden) ui.hint = null;
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
        addToast('error', errorText(e));
      }
    } else {
      seenError = null;
    }
  }

  function clearTimer(key) {
    toastHolds.get(key)?.cancel();
    toastHolds.delete(key);
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
    if (!persist) {
      const hold = holdTimer({
        ms: action ? UNDO_MS : TOAST_MS, onExpire: () => { if (!destroyed) dismissToast(id); },
        setTimer: (fn, ms) => win.setTimeout(fn, ms), clearTimer: (tid) => win.clearTimeout(tid),
      });
      toastHolds.set(id, hold);
      hold.arm();
    }
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
   * كانت تُغلق قائمة خيارات اللوحة (U46؛ صارت زرًّا مباشرًا في ح4). إلا قرار ينتظر (تأكيد الرفع، أو اختيار جملة للمزامنة) أو عمل جارٍ، كما مع اختفاء الشريط.
   * @param {Element} to
   */
  function focusLeave(to) {
    if (!ui.open || to === group.host) return;
    // ح-40: نقرة زر CC تنقل إليه التركيز في المتصفح، فلا تُغلق بها «تنزيل الأصل» كما لا تُغلق بالنقرة نفسها (onDocPointer).
    if (ui.open === 'download' && isSubtitlesButton(to)) return;
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
    // ع-ل: فتحٌ لا تظهر بعده اللوحة يقول لماذا، فلا يمر صامتًا؛ والرسالة تزول وحدها حين يظهر العمود (check).
    if (!open && flags.panelIssue) addToast('warning', messageFor(flags.panelIssue), { channel: 'panel' });
    controller.updatePrefs({ ui: { panelOpen: !open } })?.catch?.((err) => {
      fail('CT_PANEL_TOGGLE_FAILED', err);
      addToast('error', messageFor('CT_PANEL_TOGGLE_FAILED'));
    });
  }

  /**
   * @param {1 | -1} dir @param {{ fromMenu?: boolean, notify?: boolean }} [o] fromMenu: من قائمة الشارة في المقاس المطوي (ت-١)؛ notify: من
   *   أمر اختصار (الفكرة ١٠): رسالة قصيرة بالإزاحة بدل التلميح العابر، لأن التلميح جزء من الطبقة فلا يظهر حين يُخفى الشريط، والرسائل خارجها
   */
  function nudge(dir, { fromMenu = false, notify = false } = {}) {
    controller.nudgeOffset(dir)?.catch?.(() => {});
    ui.timing.offsetText = null;
    ui.timing.offsetError = null;
    const flash = nudgeFlash(controller.getState().view.displayOffsetMs);
    if (notify) {
      // منطقة الرسائل حية (role=status)، فلا إعلان ثانٍ؛ ورسالة واحدة تتبدّل مع كل ضغطة.
      clearChannel(COMMAND_CHANNEL.offset);
      addToast('info', flash, { icon: 'clock', channel: COMMAND_CHANNEL.offset });
    } else {
      // التلميح العابر لا يُقرأ: الإزاحة الجديدة تُعلن في منطقة حية، كما تعلنها قيمة التذييل في اللوحة (U48).
      layer.announce(flash);
    }
    group.pulse();
    // ومن القائمة لا تلميح عابر فوقها: قيمتها الكبيرة تقول الإزاحة.
    if (!fromMenu && !notify) {
      ui.flash = flash;
      later('flash', FLASH_MS, () => {
        ui.flash = null;
        renderTip();
      });
    }
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
      case 'roundTrip': d.roundTrip = !d.roundTrip; break;
      case 'longWhy': d.longWhy = !d.longWhy; break;
      case 'otherHow': d.otherOpen = !d.otherOpen; break;
      case 'track': d.key = value; d.saveLine = null; d.result = []; break;
      case 'mode': d.mode = value; d.saveLine = null; break;
      case 'fallback': d.fallback = !d.fallback; break;
      case 'split': d.split = !!value; d.splitError = null; break;
      case 'splitSize':
        d.splitSize = String(value);
        later('preview', PREVIEW_MS, render);
        return;
      case 'download': startDownload(); return;
      case 'cc': pressCc(); return;
      case 'slotLang': setSlotLang(value); return;
      case 'uploadLang':
        if (ui.upload.pending && !ui.upload.busy) {
          const pending = ui.upload.pending;
          pending.lang = value ?? null;
          // المعاينة تتبع لغة الملف المختارة (U-026): فحص «غير مترجم» بها لا بلغة الاسم.
          pending.preview = previewFor({ controller, read: pending, lang: pending.lang });
        }
        break;
      case 'displayMode': setMode(value); return;
      case 'slot': activate(Number(value)); return;
      case 'mark': markVisible(); return;
      case 'replace': pick('replace'); return;
      case 'target':
        if (ui.upload.pending && !ui.upload.busy) {
          ui.upload.pending.target = value === 'complete' && ui.upload.pending.complete ? 'complete' : Number(value);
          ui.upload.pending.keep = false;
          ui.upload.error = null;
        }
        break;
      case 'keep': if (ui.upload.pending) ui.upload.pending.keep = !!value; break;
      case 'markAmbiguous': markAmbiguous(); return;
      case 'stripOriginal': stripOriginal(); return;
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
      // ت-١: − و+ من قائمة الشارة حين طُويا من الشريط.
      case 'nudge': if (ui.open === 'timing' && !t.sync) nudge(value === -1 ? -1 : 1, { fromMenu: true }); return;
      // القرار ٢٨: زر اللوحة من قائمة الشارة حين طُوي فيها؛ value: فُعّل بلوحة المفاتيح.
      case 'panelToggle': if (ui.open === 'timing' && lastModel?.panel && !lastModel.panel.disabled) togglePanel(value === true); return;
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
  /**
   * لغة الترجمة النشطة من قائمتها (AA3): رمز أو null «غير محددة». لا يمس نصها ولا توقيتها؛ وتعذّر الحفظ رسالة.
   * @param {string | null} lang
   */
  async function setSlotLang(lang) {
    const s = controller.getState();
    const n = s.activeSlot;
    if (s.loading || ui.switching || !n || typeof controller.setSlotLang !== 'function') return;
    if ((s.arabic?.lang ?? null) === (lang ?? null)) return;
    const mine = ui;
    mine.switching = true;
    mine.pendingLang = lang ?? null;
    render();
    try {
      await controller.setSlotLang(n, lang ?? null);
    } catch (err) {
      if (destroyed || ui !== mine) return;
      counts.flowFailures++;
      addToast('error', toErrorInfo(err).message);
    }
    if (destroyed || ui !== mine) return;
    mine.switching = false;
    mine.pendingLang = undefined;
    render();
  }

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

  /** «علّمها للمراجعة» (ف6): علامات «أعود إليه» برسالة فيها «تراجع». */
  async function markAmbiguous() {
    const a = ui.upload.ambiguous;
    if (!a?.numbers?.length) return;
    const mine = ui;
    let r;
    try {
      r = await controller.markAmbiguous(a.numbers, a.n);
    } catch (err) {
      if (destroyed || ui !== mine) return;
      counts.flowFailures++;
      addToast('error', toErrorInfo(err).message);
      render();
      return;
    }
    if (destroyed || ui !== mine) return;
    ui.upload.ambiguous = null;
    if (r.count) {
      counts.marks += r.count;
      addToast('success', markedAmbiguousText(r.count), { action: { label: LABELS.undo, run: () => r.undo() } });
    } else addToast('info', LABELS.markedNone);
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
   * أمر «تبديل وضع العرض» (الفكرة ١٠): الوضع التالي بترتيب قائمة «الترجمة»، متخطيًا «فوق الأصل» حين لا أصل (كما يعطّله اختياره هناك)،
   * ورسالة قصيرة بالوضع الجديد: في فجوة بين الجمل أو بعد الإخفاء لا يُرى أثره، والشريط قد يكون مخفيًا.
   */
  function cycleDisplayMode() {
    const s = controller.getState();
    let i = MODE_CYCLE.indexOf(s.view.displayMode);
    do i = (i + 1) % MODE_CYCLE.length; while (MODE_CYCLE[i] === 'dual' && !s.english);
    const next = MODE_CYCLE[i];
    setMode(next);
    clearChannel(COMMAND_CHANNEL.mode);
    addToast('info', modeToast(next, s.english?.lang ?? null), { channel: COMMAND_CHANNEL.mode });
    render();
  }

  /**
   * أمر «إعادة الجملة» (الفكرة ١٠، ح-55): القفز إلى بداية الجملة الظاهرة بزمن الفيديو والإزاحة، وإلا آخر جملة بدأت (replayCueIndex)،
   * بلا تشغيل ولا إيقاف (seekMainVideo يغيّر الزمن وحده). وأثناء الإعلان لا قفز بزمنه (U47)، وقبل أول جملة رسالة.
   */
  function replayLine() {
    const s = controller.getState();
    const cues = s.arabic?.cues;
    if (!cues?.length) return;
    if (isAdShowing(doc)) {
      clearChannel(COMMAND_CHANNEL.reason);
      addToast('info', messageFor('CT_AD_SHOWING'), { channel: COMMAND_CHANNEL.reason });
      return;
    }
    const video = getMainVideo(doc);
    if (!video || !Number.isFinite(video.currentTime)) return;
    const index = replayCueIndex(cues, lookupMs(video.currentTime, s.view.displayOffsetMs));
    if (index === null) {
      clearChannel(COMMAND_CHANNEL.reason);
      addToast('info', LABELS.replayNone, { channel: COMMAND_CHANNEL.reason });
      return;
    }
    seekMainVideo(Math.max(0, cues[index].startMs + s.view.displayOffsetMs), doc);
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
          addToast('info', syncUndoStaleLine());
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
    // بلا التقاط: المسار المحفوظ بالوضع العادي، بلا تقسيم (FA-17).
    if (!m.selectedKey) return m.saved ? { key: m.saved.key, saved: true } : null;
    const sp = splitSpec();
    if (!sp.ok) {
      render();
      layer.find('splitSize')?.focus();
      return null;
    }
    return { key: m.selectedKey, mode: m.mode, split: sp.split };
  }

  /** «تنزيل الملف» (R61 بعد جولة الصقل): يحفظ ملف SRT وحده بمكان الإعدادات ثم البصمة. تعليمات الترجمة من نافذة الإضافة (AA3). */
  async function startDownload() {
    const d = ui.download;
    if (d.busy) return;
    const spec = exportSpec();
    if (!spec) return;
    d.busy = true;
    d.saveLine = null;
    d.result = [];
    render();
    const prep = spec.saved ? prepareSavedExport({ controller, exportFlow: flows.exportFlow, now: now() }) : prepareExport({ controller, exportFlow: flows.exportFlow, ...spec, now: now() });
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
    if (destroyed) return;
    // تبدّل الفيديو وحوار الحفظ مفتوح (ع-٦): نزل الملف ولا تُحفظ بصمته لغير الفيديو المعروض، فيُنبَّه في الصفحة الجديدة.
    if (ui.download !== d) {
      if (r.saved.length) addToast('warning', messageFor('CT_FINGERPRINT_VIDEO_CHANGED'));
      return;
    }
    d.busy = false;
    if (r.saved.length) {
      counts.downloads++;
      // بدأ التنزيل وما زال حوار الحفظ مفتوحًا (pending): لا يُقال «نُزّل» قبل أن يكتمل، بل ما ينتظره المستخدم.
      d.saveLine = r.pending
        ? { tone: 'info', text: messageFor('SV_PENDING') }
        : { tone: 'ok', text: r.saved.length > 1 ? downloadedParts(partsWord(r.saved.length)) : downloadedLine(r.saved[0]) };
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
      const rec = await (spec.saved ? recordSavedFor : recordFor)({ controller, key: spec.key, built: prep.built, videoId: prep.videoId });
      if (destroyed || ui.download !== d) return;
      if (!rec.saved) d.result.push({ tone: 'warn', text: rec.error.code === 'CT_VIDEO_CHANGED' ? rec.error.message : messageFor('CT_FINGERPRINT_NOT_SAVED') });
    }
    render();
  }

  // ———— الفكرة ٧-ب (ح-56): زر CC في «تنزيل الأصل» ————

  /**
   * زر CC بلا التقاط: «إعادة تشغيل CC» حين ccStuck، و«تفعيل CC الآن» حين CC مطفأة وللفيديو مسارات في بيانات المشغّل، وبعد الضغط
   * ينتظر حتى يصل الالتقاط أو تنقضي المهلة. ولا زر بلا زر CC أو في متصفح محجوب (تبقى الرسالة النصية)، ولا في البث الجاري ولا وCC
   * معطّلة (رسالتاهما)؛ وأثناء الإعلان معطّل بسببه.
   * @returns {{ kind: 'on' | 'restart', busy: boolean, ad: boolean } | null}
   */
  function ccModel(s, tracks) {
    const wait = ui.download.cc;
    if (tracks.length || s.captured.length || s.captureIssue || flags.live || flags.unavailable) return null;
    if (wait) return { kind: wait.kind, busy: true, ad: false };
    if (!subtitlesPressable(doc)) return null;
    const kind = flags.ccStuck ? 'restart' : !flags.ccOn && s.available?.tracks?.length ? 'on' : null;
    return kind ? { kind, busy: false, ad: flags.ad } : null;
  }

  /**
   * «تفعيل CC الآن» و«إعادة تشغيل CC»: ضغطة على زر CC بنقرة المستخدم نفسه على هذا الزر، تقرأ حاله قبل كل ضغطة (pressSubtitles)، ثم
   * انتظار الالتقاط CC_PRESS_WAIT_MS: إن وصل تحدّثت القائمة وحدها بالمسار (ح-40)، وإلا سطر «لم يصل شيء — أعد تحميل الصفحة». ولا طلب
   * من ترجمان: المشغّل يطلب الترجمة كما يطلبها حين يضغط المستخدم CC بيده.
   */
  async function pressCc() {
    const s = controller.getState();
    const m = ccModel(s, okTracks(s));
    if (!m || m.busy || m.ad) return;
    const mine = ui;
    const d = mine.download;
    d.cc = { kind: m.kind };
    d.ccLine = null;
    render();
    const r = await pressSubtitles(doc, { restart: m.kind === 'restart' });
    if (destroyed || ui !== mine) return;
    if (!r.ok) {
      d.cc = null;
      d.ccLine = { tone: 'warn', text: r.reason === 'ad' ? LABELS.ccAfterAd : LABELS.ccNoEffect };
      render();
      return;
    }
    later('ccWait', CC_PRESS_WAIT_MS, () => {
      if (ui !== mine || !d.cc) return;
      d.cc = null;
      const after = controller.getState();
      if (!after.captured.length && !after.captureIssue) d.ccLine = { tone: 'warn', text: LABELS.ccNoEffect };
      render();
    });
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
    const read = await readFor({ controller, importFlow: flows.importFlow, files, fallbackLang: pairTargets(controller.getState())[0] ?? null });
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
    // الملف الثنائي (ح-49) لا يُحفظ مباشرة: التأكيد يعرض تحذيره وزر الإزالة.
    if (!hint && !read.bilingual && !slots.some((x) => x.filled)) {
      const r = await loadIntoFor({ controller, read, n: 1, replace: false });
      if (destroyed || ui.upload !== u) return;
      u.busy = false;
      if (r.ok) {
        counts.imports++;
        u.warnings = read.warnings;
        u.ambiguous = read.ambiguous?.length ? { n: 1, numbers: read.ambiguous } : null;
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
    // ف3: الملف تتمة لترجمة محفوظة؟ فالمختار «إكمال الترجمة N»، و«جديدة» و«استبدال» باقيتان.
    const cont = continuationFor({ controller, read });
    u.pending = { ...read, hint, target: cont ? 'complete' : defaultTarget(slotsOf(controller.getState())), complete: cont, keep: false, lang: read.input.lang ?? null };
    ui.open = 'confirm';
    render();
    layer.focusFirst();
  }

  /**
   * «أزل سطر الأصل من كل مقطع» (الفكرة ١١، ح-49): الملف المعلّق بلا سطر الأصل حيث طابق، ثم التأكيد نفسه بفحصه الجديد (والتتمة)،
   * والتركيز إلى سطر ما أُزيل (زال الزر). لا كتابة في التخزين قبل «حفظ».
   */
  function stripOriginal() {
    const u = ui.upload;
    const p = u.pending;
    if (!p?.bilingual || u.busy) return;
    const next = stripFor({ controller, read: p, lang: p.lang ?? null });
    const cont = continuationFor({ controller, read: next });
    const target = cont ? 'complete' : p.target === 'complete' ? defaultTarget(slotsOf(controller.getState())) : p.target;
    u.plans.clear();
    u.error = null;
    u.pending = { ...next, complete: cont, target, keep: false };
    render();
    layer.find('stripped')?.focus();
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
    const r = m.completing
      ? await completeInto({ controller, read: p, cont: p.complete.cont })
      : await loadIntoFor({ controller, read: p, n: m.target, replace: m.filled, current, lang: p.lang ?? null });
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
      // «علّمها للمراجعة» للنشطة وحدها: الملف حُفظ فيها (أو أكملها).
      const into = m.completing ? p.complete.cont.n : m.target;
      u.ambiguous = p.ambiguous?.length ? { n: into, numbers: p.ambiguous } : null;
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
    // ح-40: زر CC هو ما تطلبه «تنزيل الأصل» بلا التقاط، فتبقى مفتوحة وتتحدّث بالالتقاط؛ والقوائم الأخرى تُغلق به.
    if (ui.open === 'download' && path.some(isSubtitlesButton)) return;
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

  /** بُلّغ القص الحالي: مرة لكل قص متصل، ويعود بزواله. */
  let overflowReported = false;
  /**
   * هل دُفع شيء من الشريط خارجه، أو تداخلت المجموعة مع الأدوات اليسرى، أو قُص زمن يوتيوب (ت-١: ينضغط داخل حاويته ولا يتداخل مع
   * شيء، فلم يكن يُرى)؟ قياس للتقرير، لا إخفاء لشيء. ويُبلَّغ ما بقي بعد الطي والاستقرار: قياسان متتاليان (بعد الرسم ثم الفحص
   * الدوري) لا قياس عابر أثناء تغيّر العرض قبل أن يستقر تخطيط يوتيوب.
   */
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
    const clipped = timeClipped(doc, group.host);
    const fit = lastModel?.size ?? null;
    const now$ = outside || overlap || clipped ? { width: bar.width, size: bar.size, fit, outside, overlap, clipped } : null;
    if (now$ && overflow && !overflowReported) {
      overflowReported = true;
      counts.overflows++;
      fail('CT_BAR_OVERFLOW', `width=${bar.width} size=${bar.size} fit=${fit} ${outside ? 'outside' : overlap ? 'overlap' : 'time'}`);
    }
    if (!now$) overflowReported = false;
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
    for (const h of toastHolds.values()) h.cancel();
    toastHolds.clear();
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
    /** فيها ما يضيع بإعادة البناء: رفع جارٍ أو ملف بانتظار التأكيد أو تنزيل جارٍ أو كتابة في حقل أو مزامنة بجملة مفتوحة. */
    /**
     * ف5: النص الملصوق ملفًا بلا رمز لغة في اسمه، فاللغة من «إلى» كما في الرفع. يعيد البدء أو سبب تعذّره.
     * @param {string} text
     */
    importText(text) {
      const s = controller.getState();
      if (destroyed || !s.videoId) return { ok: false, code: 'TJ_NO_VIDEO' };
      // ما ينتظر المستخدم في المشغّل (رفع أو تأكيد أو تنزيل أو مزامنة أو كتابة) لا يُغلق من النافذة.
      if (ui.upload.busy || ui.upload.pending || ui.download.busy || ui.open === 'confirm' || ui.timing.sync || layer.isTyping()) return { ok: false, code: 'busy' };
      const file = new File([String(text)], LABELS.pastedName, { type: 'text/plain' });
      ui.open = s.arabic ? 'display' : null;
      startImport([file], !!s.arabic);
      return { ok: true };
    },

    /**
     * الفكرة ١٠ (ح-55): أمر اختصار ربطه المستخدم في متصفحه. الأفعال نفسها التي في الشريط وقوائمه؛ وبلا ترجمة أو أثناء قراءتها رسالة قصيرة
     * واحدة بالسبب ولا فعل (كتعطيل أزرار العرض والتوقيت)، لأن الضغطة مقصودة في صفحة الفيديو فلا تمر صامتة.
     * @param {string} name @returns {{ ok: true } | { ok: false, code: string }}
     */
    command(name) {
      const s = controller.getState();
      if (destroyed || !s.videoId) return { ok: false, code: 'TJ_NO_VIDEO' };
      if (!isCommandName(name)) return { ok: false, code: 'TJ_BAD_MESSAGE' };
      const why = s.loading ? 'CT_LOADING' : !s.arabic ? 'CT_NEEDS_ARABIC' : null;
      if (why) {
        clearChannel(COMMAND_CHANNEL.reason);
        addToast('info', why === 'CT_LOADING' ? messageFor('CT_LOADING') : LABELS.commandNeedsTranslation, { channel: COMMAND_CHANNEL.reason });
        return { ok: false, code: why };
      }
      if (name === 'display-mode') cycleDisplayMode();
      else if (name === 'offset-earlier') nudge(-1, { notify: true });
      else if (name === 'offset-later') nudge(1, { notify: true });
      else if (name === 'mark-review') markVisible();
      else replayLine();
      return { ok: true };
    },

    holdsFlow: () => !destroyed && !!(ui.upload.pending || ui.upload.busy || ui.download.busy || ui.open === 'confirm' || ui.timing.sync || layer.isTyping()),
    /** المشغّل والطبقة ما زالا في الصفحة؛ المجموعة تُعاد إلى الشريط في check. */
    healthy: () => !destroyed && player.isConnected && layer.isConnected(),
    /** فحص خفيف دوري: الموضع، وما يُقرأ من الصفحة (بث جارٍ، وزر CC)، وقياس الضيق. */
    check() {
      if (destroyed) return;
      try {
        place();
        const next = readFlags();
        if (next.live !== flags.live || next.unavailable !== flags.unavailable || next.ad !== flags.ad || next.ccStuck !== flags.ccStuck || next.ccOn !== flags.ccOn || next.panelIssue !== flags.panelIssue) {
          // ع-ل: تعافت اللوحة (ظهر العمود): لا تبقى رسالة سبب زال.
          if (flags.panelIssue && !next.panelIssue) clearChannel('panel');
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
        restRoom: bar$.snapshot().restRoom,
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
