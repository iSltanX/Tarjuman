// «هل تغيّر يوتيوب؟» (ف8، 2026-11-10): أشكال بلا قيم لما يعتمد عليه ترجمان في صفحة يوتيوب، ومقارنتها بخط أساس محفوظ في المستودع
// (قرار سلطان ق10: أشكال بلا قيم). أربعة أشياء: وجود العناصر التي في SELECTORS، وشكل طلب الترجمة (أسماء معاملاته بلا قيمها؛
// والمسار لا يُحفظ: المشغّل الحي يجمع طلبات الترجمة وحدها، وفحص الأسرار يمنع مسارها في fixtures)، وشكل قائمة المسارات في بيانات المشغّل (المفاتيح وأنواعها)، وأحداث التنقل التي رُئيت. يذكر الفروق ولا يحكم بالفشل:
// يوتيوب يجرّب واجهات مختلفة، والحكم لمن يقرأ. وحدة نقية بلا متصفح ولا شبكة؛ يستعملها المشغّل الحي
// test/live/harness/youtube-shapes.mjs (بإذن سلطان لكل جولة) وجولة المشغّل المحلي واختبارات الوحدة.

export const SHAPES_VERSION = 1;
/** أحداث يوتيوب التي يسمعها ترجمان (EVENTS في src/player/youtube-dom.js، و yt-player-updated في الالتقاط). */
export const NAV_EVENTS = Object.freeze(['yt-navigate-start', 'yt-navigate-finish', 'yt-page-data-updated', 'yt-player-updated']);
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
 * يُجمع داخل صفحة يوتيوب (يُمرَّر إلى evaluate بنصه، فلا يعتمد على شيء خارجه): وجود كل محدد، وشكل قائمة المسارات من بيانات
 * المشغّل التي في الصفحة. أسماء وأنواع ونعم/لا فقط.
 * @param {Record<string, string>} selectors SELECTORS من src/player/youtube-dom.js
 */
export function collectInPage(selectors) {
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
  const dom = {};
  for (const [k, sel] of Object.entries(selectors)) {
    try {
      dom[k] = !!document.querySelector(sel);
    } catch {
      dom[k] = false;
    }
  }
  let response = null;
  try {
    const p = document.getElementById('movie_player');
    response = p && typeof p.getPlayerResponse === 'function' ? p.getPlayerResponse() : null;
  } catch {
    response = null;
  }
  if (!response) response = window.ytInitialPlayerResponse ?? null;
  const rend = response && response.captions && response.captions.playerCaptionsTracklistRenderer;
  return {
    dom,
    tracklist: {
      renderer: rend ? shape(rend, 1) : 'missing',
      track: rend && Array.isArray(rend.captionTracks) && rend.captionTracks.length ? shape(rend.captionTracks[0], 3) : 'missing',
    },
  };
}

/**
 * لقطة كاملة بلا قيم من أجزائها.
 * @param {{ inPage: ReturnType<typeof collectInPage>, requests: string[], events: string[], source: string, at: string }} o
 */
export function snapshot({ inPage, requests, events, source, at }) {
  // أشكال فريدة مرتبة، فلا يظهر ترتيب وصول الطلبات فرقًا (مراجعة المرحلة 6، م8).
  const request = [...new Set(requests.map(requestShape).filter(Boolean).map((s) => JSON.stringify(s)))].sort().map((k) => JSON.parse(k));
  return {
    version: SHAPES_VERSION, source, at,
    dom: inPage.dom,
    tracklist: inPage.tracklist,
    timedtext: request.length ? request : 'none',
    events: Object.fromEntries(NAV_EVENTS.map((e) => [e, events.includes(e)])),
  };
}

/**
 * فروق لقطة عن خط الأساس، بمسار كل فرق: «غاب» (في الأساس لا في الآن)، و«جديد»، و«تغيّر». لا تُقارن source ولا at.
 * @param {object} base @param {object} now
 * @returns {{ path: string, kind: 'missing' | 'added' | 'changed', before: unknown, after: unknown }[]}
 */
export function diffShapes(base, now) {
  const out = [];
  const walk = (a, b, path) => {
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
  for (const k of ['dom', 'tracklist', 'timedtext', 'events']) walk(base?.[k], now?.[k], k);
  return out;
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
