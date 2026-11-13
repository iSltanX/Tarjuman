// «هل تغيّر يوتيوب؟» (ف8، 2026-11-10): أشكال بلا قيم لما يعتمد عليه ترجمان في صفحة يوتيوب، ومقارنتها بخط أساس محفوظ في المستودع
// (قرار سلطان ق10: أشكال بلا قيم). الإصدار 2 (الفكرة ١، الجولة الثالثة) يمر على كل سجل في src/player/youtube-dom.js: وجود عناصر WATCHED
// (SELECTORS وزمن المشغّل) ومواضع لوحة النص (PANEL_SELECTORS)، وأصناف CLASSES وسمات ATTRS حالاتٍ رُصدت أو لم تُرصد، وشكل شارة البث
// وسمات زر CC، وشكل طلب الترجمة (أسماء معاملاته بلا قيمها؛ والمسار لا يُحفظ: المشغّل الحي يجمع طلبات الترجمة وحدها، وفحص الأسرار يمنع
// مسارها في fixtures)، وشكل قائمة المسارات في بيانات المشغّل (اتحاد مفاتيح المسارات كلها وأنواعها، وأصناف kind)، وأحداث التنقل التي
// رُئيت. والحالة التي لم تُستدعَ في الجولة (إعلان، ملء الشاشة، بث جارٍ…) تُسجَّل 'unobserved' ولا تُعدّ فرقًا: غيابها لا يثبت تغيّر
// اسمها. يذكر الفروق ولا يحكم بالفشل: يوتيوب يجرّب واجهات مختلفة، والحكم لمن يقرأ. وحدة نقية بلا متصفح ولا شبكة؛ يستعملها المشغّل
// الحي test/live/harness/youtube-shapes.mjs (بإذن سلطان لكل جولة) واختبارات الوحدة.
import { ATTRS, CLASSES, PANEL_SELECTORS, SELECTORS } from '../src/player/youtube-dom.js';

export const SHAPES_VERSION = 2;
/** حالة لم تُستدعَ في هذه الجولة: لا تُقارن، فليست فرقًا في أي من الجهتين. */
export const UNOBSERVED = 'unobserved';

/**
 * ما يُفحص وجوده في صفحة يوتيوب (مفاتيح dom في اللقطة): SELECTORS كلها، ومعها ما تبحث عنه الشيفرة بصنفه داخل عنصر منها، بالطريقة
 * نفسها: زمن المشغّل (CLASSES.timeDisplay داخل الأدوات اليسرى) الذي يقيس به src/player/controls/bar.js قصّ الزمن والمساحة (ت-١).
 * فإن غيّر يوتيوب اسمه أو أخرجه من الأدوات اليسرى ظهر «غاب: dom.timeDisplay».
 */
export const WATCHED = Object.freeze({ ...SELECTORS, timeDisplay: `${SELECTORS.leftControls} .${CLASSES.timeDisplay}` });
/**
 * مواضع لوحة النص (مفاتيح panel في اللقطة): PANEL_SELECTORS كلها كما تبحث عنها src/player/panel/column.js، وصندوق بيانات الفيديو
 * داخل #below لا في أي مكان.
 */
export const PANEL_WATCHED = Object.freeze({ ...PANEL_SELECTORS, belowAnchor: `${PANEL_SELECTORS.below} ${PANEL_SELECTORS.belowAnchor}` });
/** سمات زر CC التي تقرؤها أدوات المشغّل (src/player/controls/session.js): مضغوط، ومعطّل بأيٍّ من السمتين. أسماء قياسية لا أسماء يوتيوب. */
export const CC_ATTRS = Object.freeze(['aria-pressed', 'aria-disabled', 'disabled']);
/**
 * شارة البث (isLiveNow في youtube-dom.js، تحقق Gemini Y1): ظاهرة في البث الجاري وحده، وعند الحافة المباشرة عليها disabled وصنف
 * liveHead. يراقبهما الفاحص ولا تعتمد عليهما الشيفرة، فلا يدخلان سجل youtube-dom.js.
 */
export const BADGE = Object.freeze({ disabled: 'disabled', liveHead: 'ytp-live-badge-is-livehead' });
/** أصناف kind لمسار الترجمة: بلا kind (يدوي)، وasr (تلقائي، كما يقرؤه src/main-world/capture.js)، وغيرهما. */
export const KIND_CLASSES = Object.freeze(['absent', 'asr', 'other']);
/** أحداث يوتيوب التي يسمعها ترجمان (EVENTS في src/player/youtube-dom.js، و yt-player-updated في الالتقاط). */
export const NAV_EVENTS = Object.freeze(['yt-navigate-start', 'yt-navigate-finish', 'yt-page-data-updated', 'yt-player-updated']);
/** أقسام اللقطة التي تُقارن، بالترتيب (لا version ولا source ولا at). */
export const SECTIONS = Object.freeze(['dom', 'panel', 'classes', 'attrs', 'badge', 'cc', 'tracklist', 'timedtext', 'events']);

/**
 * ما يمرّره المشغّل الحي إلى collectInPage: نصوص وحدها، لأن evaluate يمرّر وسائطه JSON (فنمط سمات التخطيط بنصه).
 * @returns {InPageWatch}
 */
export const inPageWatch = () => ({
  dom: WATCHED,
  panel: PANEL_WATCHED,
  player: SELECTORS.player,
  flexy: PANEL_SELECTORS.flexy,
  classes: CLASSES,
  attrs: { singleColumn: ATTRS.singleColumn, dark: ATTRS.dark, layout: ATTRS.layout.source },
  badge: { selector: SELECTORS.liveBadge, ...BADGE },
  cc: { selector: SELECTORS.subtitlesButton, attrs: [...CC_ATTRS] },
});
/**
 * @typedef {{ dom: Record<string, string>, panel: Record<string, string>, player: string, flexy: string, classes: Record<string, string>,
 *   attrs: { singleColumn: string, dark: string, layout: string }, badge: { selector: string, disabled: string, liveHead: string },
 *   cc: { selector: string, attrs: string[] } }} InPageWatch
 */

const MAX_DEPTH = 4;
const MAX_KEYS = 40;

/**
 * شكل قيمة بلا قيمها: نوعها، وللكائن مفاتيحه مرتبة بأشكالها، وللمصفوفة شكل أول عنصر (لا طولها ولا بقيتها). عمق ومفاتيح محدودة.
 * @param {unknown} v @param {number} [depth]
 * @returns {unknown}
 */
export function shapeOf(v, depth = MAX_DEPTH) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return depth <= 0 ? 'array' : v.length ? [shapeOf(v[0], depth - 1)] : [];
  if (typeof v === 'object') {
    if (depth <= 0) return 'object';
    const out = {};
    for (const k of Object.keys(v).sort().slice(0, MAX_KEYS)) out[k] = shapeOf(v[k], depth - 1);
    return out;
  }
  return typeof v;
}

/**
 * شكل رابط طلب ترجمة: أسماء المعاملات مرتبة، بلا قيمة واحدة (لا معرّف ولا لغة ولا رمز pot) ولا مسار.
 * @param {string} url
 * @returns {{ params: string[] } | null}
 */
export function requestShape(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  return { params: [...new Set(u.searchParams.keys())].sort() };
}

/**
 * يُجمع داخل صفحة يوتيوب (يُمرَّر إلى evaluate بنصه، فلا يعتمد على شيء خارجه): وجود كل محدد، والأصناف والسمات حالاتٍ رُصدت (true) أو
 * لم تُرصد ('unobserved'؛ غياب صنف أو سمة لا يثبت شيئًا)، وشكل شارة البث وزر CC، وشكل قائمة المسارات من بيانات المشغّل التي في الصفحة.
 * أسماء وأنواع ونعم/لا فقط.
 * @param {InPageWatch} w من inPageWatch()
 */
export function collectInPage(w) {
  const NONE = 'unobserved';
  const shape = (v, d) => {
    if (v === null) return 'null';
    if (Array.isArray(v)) return d <= 0 ? 'array' : v.length ? [shape(v[0], d - 1)] : [];
    if (typeof v === 'object') {
      if (d <= 0) return 'object';
      const o = {};
      for (const k of Object.keys(v).sort().slice(0, 40)) o[k] = shape(v[k], d - 1);
      return o;
    }
    return typeof v;
  };
  // اتحاد شكلين: مفاتيح الكائنين معًا، و'mixed' لنوعين مختلفين في الموضع نفسه.
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const union = (a, b) => {
    if (a === undefined) return b;
    if (JSON.stringify(a) === JSON.stringify(b)) return a;
    if (isObj(a) && isObj(b)) {
      const o = {};
      for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) o[k] = k in a && k in b ? union(a[k], b[k]) : k in a ? a[k] : b[k];
      return o;
    }
    if (Array.isArray(a) && Array.isArray(b)) return !a.length ? b : !b.length ? a : [union(a[0], b[0])];
    return 'mixed';
  };
  const find = (sel) => {
    try {
      return document.querySelector(sel);
    } catch {
      return null;
    }
  };
  const present = (map) => Object.fromEntries(Object.entries(map).map(([k, sel]) => [k, !!find(sel)]));
  const player = find(w.player);
  const flexy = find(w.flexy);
  const classes = Object.fromEntries(Object.entries(w.classes).map(([k, c]) => {
    let seen = false;
    try {
      seen = !!player && (player.classList.contains(c) || !!player.querySelector(`.${c}`));
    } catch {
      seen = false;
    }
    return [k, seen || NONE];
  }));
  let layout = NONE;
  try {
    const re = new RegExp(w.attrs.layout);
    if (flexy) layout = flexy.getAttributeNames().filter((n) => re.test(n)).sort();
  } catch {
    layout = NONE;
  }
  const root = document.documentElement;
  const attrs = {
    singleColumn: (!!flexy && flexy.hasAttribute(w.attrs.singleColumn)) || NONE,
    dark: (!!root && root.hasAttribute(w.attrs.dark)) || NONE,
    layout,
  };
  // الشارة: ظهورها كما يقرؤه isLiveNow؛ وdisabled والحافة المباشرة لا معنى لهما إلا في بث ظاهر.
  let badge = NONE;
  const b = find(w.badge.selector);
  if (b) {
    let shown = false;
    try {
      const st = window.getComputedStyle(b);
      shown = !!st && st.display !== 'none';
    } catch {
      shown = false;
    }
    badge = {
      shown,
      disabled: shown ? b.hasAttribute(w.badge.disabled) : NONE,
      liveHead: shown ? b.classList.contains(w.badge.liveHead) : NONE,
    };
  }
  let cc = NONE;
  const btn = find(w.cc.selector);
  if (btn) {
    cc = Object.fromEntries(w.cc.attrs.map((a) => [a, btn.hasAttribute(a)]));
    cc.on = btn.getAttribute(w.cc.attrs[0]) === 'true';
  }
  let response = null;
  try {
    response = player && typeof player.getPlayerResponse === 'function' ? player.getPlayerResponse() : null;
  } catch {
    response = null;
  }
  if (!response) response = window.ytInitialPlayerResponse ?? null;
  const rend = response && response.captions && response.captions.playerCaptionsTracklistRenderer;
  const tracks = rend && Array.isArray(rend.captionTracks) ? rend.captionTracks.slice(0, 64) : [];
  let track;
  // بعمق 4: اسم المسار نصًّا أو قطعًا (name.runs[].text، كما يقرؤه capture.js).
  for (const t of tracks) track = union(track, shape(t, 4));
  const kinds = [...new Set(tracks.map((t) => (!t || typeof t !== 'object' || !('kind' in t) ? 'absent' : t.kind === 'asr' ? 'asr' : 'other')))].sort();
  return {
    dom: present(w.dom),
    panel: present(w.panel),
    classes,
    attrs,
    badge,
    cc,
    tracklist: {
      renderer: rend ? shape(rend, 1) : 'missing',
      track: tracks.length ? track : 'missing',
      kinds: tracks.length ? kinds : 'missing',
    },
  };
}

/**
 * ما رصدته مجسّات الحالة (الوضع الداكن، والعمود الواحد…) يضاف إلى اللقطة الأولى: صنف أو سمة رُصدت في أي منها تُسجَّل true. ونمط سمات
 * التخطيط وسائر الأقسام من اللقطة الأولى وحدها (التخطيط العريض الافتراضي).
 * @param {ReturnType<typeof collectInPage>} inPage @param {Array<ReturnType<typeof collectInPage> | null>} probes
 */
export function withProbes(inPage, probes = []) {
  const out = structuredClone(inPage);
  for (const p of probes) {
    if (!p) continue;
    for (const [k, v] of Object.entries(p.classes ?? {})) if (out.classes?.[k] === UNOBSERVED && v === true) out.classes[k] = true;
    for (const k of ['singleColumn', 'dark']) if (out.attrs?.[k] === UNOBSERVED && p.attrs?.[k] === true) out.attrs[k] = true;
  }
  return out;
}

/**
 * لقطة كاملة بلا قيم من أجزائها. القسم الذي لم يُجمع 'unobserved'.
 * @param {{ inPage: Partial<ReturnType<typeof collectInPage>>, probes?: Array<ReturnType<typeof collectInPage> | null>, requests: string[], events: string[], source: string, at: string }} o
 */
export function snapshot({ inPage, probes = [], requests, events, source, at }) {
  const seen = withProbes(inPage, probes);
  // أشكال فريدة مرتبة، فلا يظهر ترتيب وصول الطلبات فرقًا (مراجعة المرحلة 6، م8).
  const request = [...new Set(requests.map(requestShape).filter(Boolean).map((s) => JSON.stringify(s)))].sort().map((k) => JSON.parse(k));
  const section = (k) => seen[k] ?? UNOBSERVED;
  return {
    version: SHAPES_VERSION, source, at,
    dom: section('dom'),
    panel: section('panel'),
    classes: section('classes'),
    attrs: section('attrs'),
    badge: section('badge'),
    cc: section('cc'),
    tracklist: section('tracklist'),
    timedtext: request.length ? request : 'none',
    events: Object.fromEntries(NAV_EVENTS.map((e) => [e, events.includes(e)])),
  };
}

/**
 * فروق لقطة عن خط الأساس، بمسار كل فرق: «غاب» (في الأساس لا في الآن)، و«جديد»، و«تغيّر». لا تُقارن version ولا source ولا at، ولا ما
 * كان 'unobserved' في أيٍّ من الجهتين.
 * @param {object} base @param {object} now
 * @returns {{ path: string, kind: 'missing' | 'added' | 'changed', before: unknown, after: unknown }[]}
 */
export function diffShapes(base, now) {
  const out = [];
  const walk = (a, b, path) => {
    if (a === UNOBSERVED || b === UNOBSERVED) return;
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    const objA = a && typeof a === 'object' && !Array.isArray(a);
    const objB = b && typeof b === 'object' && !Array.isArray(b);
    if (objA && objB) {
      for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
        const p = path ? `${path}.${k}` : k;
        if (!(k in b)) out.push({ path: p, kind: 'missing', before: a[k], after: undefined });
        else if (!(k in a)) out.push({ path: p, kind: 'added', before: undefined, after: b[k] });
        else walk(a[k], b[k], p);
      }
      return;
    }
    // عنصر كان موجودًا فغاب: «غاب» لا «تغيّر».
    if (a === true && b === false) out.push({ path, kind: 'missing', before: a, after: b });
    else out.push({ path, kind: 'changed', before: a, after: b });
  };
  for (const k of SECTIONS) walk(base?.[k], now?.[k], k);
  return out;
}

/**
 * ما رُصد في خط الأساس ولم يُرصد في هذه الجولة ('unobserved' الآن): ليس فرقًا، ويُذكر للقارئ، فغياب حالة كانت تُرصد قد يكون تغيّر
 * اسمها أو مجسًّا تذبذب.
 * @param {object} base @param {object} now @returns {string[]} مسارات مرتبة
 */
export function unobservedNow(base, now) {
  const out = [];
  const walk = (a, b, path) => {
    if (b === UNOBSERVED) {
      if (a !== undefined && a !== UNOBSERVED) out.push(path);
      return;
    }
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
      for (const k of Object.keys(a).sort()) if (k in b) walk(a[k], b[k], `${path}.${k}`);
    }
  };
  for (const k of SECTIONS) walk(base?.[k], now?.[k], k);
  return out.sort();
}

/** سطر فرق للقارئ: «غاب: dom.rightControls». @param {{ path: string, kind: string }} d */
export const diffLine = (d) => `${d.kind === 'missing' ? 'غاب' : d.kind === 'added' ? 'جديد' : 'تغيّر'}: ${d.path}`;

/**
 * صف سجل الفحص الدوري في docs/maintenance.md §٦ بأعمدته: التاريخ، وBrave، وChrome، والقائمة الثابتة، والملاحظات. الجولة في متصفح
 * واحد، فعمود الآخر «—»، والنتيجة في الملاحظات.
 * @param {{ date: string, browser: string, version: string, diffs: ReturnType<typeof diffShapes>, source: string }} o
 */
export function logRow({ date, browser, version, diffs, source }) {
  const result = diffs.length ? `فروق ${diffs.length}: ${diffs.slice(0, 6).map(diffLine).join('، ')}${diffs.length > 6 ? '…' : ''}` : 'لا فروق';
  const brave = browser === 'brave' ? version : '—';
  const chrome = browser === 'chrome' ? version : '—';
  return `| ${date} | ${brave} | ${chrome} | — | «هل تغيّر يوتيوب؟» (${browser}): ${result}، مقارنة بخط أساس ${source}. |`;
}
