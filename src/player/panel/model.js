// منطق اللوحة النقي (بلا DOM): الجدول الزمني للمقاطع (المقطع الحالي بقاعدة الطبقة نفسها)، والنص الأصلي المتداخل مع كل
// مقطع عربي، ونموذج العرض من حالة المتحكم (أي شكل يظهر الآن وبأي نص). docs/product-spec.md §٦.٦.
import { DEFAULT_PREFS } from '../../core/model/prefs.js';
import { indexFor } from '../sync/cue-index.js';
import { messageFor, hasCode } from '../../core/errors/index.js';
import { LABELS, flatText, languageName } from './text.js';

/**
 * @typedef {import('../../core/model/cue.js').Cue} Cue
 * @typedef {{ cue: Cue | null, row: number, anchor: number, past: number, from: number, to: number }} Located
 */

/**
 * جدول زمني لمقاطع عربية بترتيب الصفوف (ترتيب المصفوفة). `locate(ms)` تعطي المقطع الظاهر بـ`indexFor(cues).find` نفسها التي
 * يستعملها محرّك الطبقة (فيتفق الصف الحالي مع ما على الشاشة)، ومعه صف «المرساة» التي تتبعها اللوحة (الحالي، أو آخر مقطع بدأ
 * في الفجوة، أو الأول قبل البداية)، وحدّ الماضي (رتبة البداية: كل ما رتبته أصغر ماضٍ). النافذة [from, to) كما في الفهرس: ما دام
 * الزمن داخلها فالجواب نفسه.
 * @param {Cue[]} cues
 */
export function createTimeline(cues) {
  const n = cues.length;
  const rowOf = new Map();
  let ordered = true;
  for (let i = 0; i < n; i++) {
    rowOf.set(cues[i], i);
    if (i > 0 && cues[i].startMs < cues[i - 1].startMs) ordered = false;
  }
  // غير المرتب: رتبة كل صف بين البدايات، فيبقى «الماضي» معنىً لا موضعًا.
  const order = ordered ? null : cues.map((_, i) => i).sort((a, b) => cues[a].startMs - cues[b].startMs || a - b);
  let rank = null;
  if (order) {
    rank = new Int32Array(n);
    order.forEach((row, r) => {
      rank[row] = r;
    });
  }
  const starts = new Float64Array(n);
  for (let r = 0; r < n; r++) starts[r] = cues[order ? order[r] : r].startMs;
  const index = indexFor(cues);
  const rowAtRank = (r) => (order ? order[r] : r);
  const rankOf = (row) => (rank ? rank[row] : row);

  /** @param {number} ms زمن البحث بعد طرح الإزاحة (lookupMs). @returns {Located} */
  function locate(ms) {
    const hit = index.find(ms);
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (starts[mid] <= ms) lo = mid + 1;
      else hi = mid;
    }
    const row = hit.cue ? rowOf.get(hit.cue) ?? -1 : -1;
    const anchor = row >= 0 ? row : n === 0 ? -1 : rowAtRank(Math.max(0, lo - 1));
    const past = row >= 0 ? rankOf(row) : lo;
    return { cue: hit.cue, row, anchor, past, from: hit.from, to: hit.to };
  }

  return { size: n, locate, rowAtRank, rankOf };
}

/**
 * نص الأصل المتداخل زمنًا مع مدى مقطع عربي (يتداخلان إن بدأ أحدهما قبل نهاية الآخر وانتهى بعد بدايته)، مضمومًا بمسافة بترتيب
 * الزمن. البحث الثنائي على بدايات مرتبة وأكبر نهاية متراكمة (كالفهرس)، فالمجموع حتى آلاف المقاطع خفيف. التداخل في زمن
 * الملف المحفوظ: الإزاحة تنقل العربي والأصل معًا في الطبقة، فلا تغيّره.
 * @param {Cue[]} enCues
 * @returns {(startMs: number, endMs: number) => string}
 */
export function originalLookup(enCues) {
  const n = enCues.length;
  let list = enCues;
  for (let i = 1; i < n; i++) {
    if (enCues[i].startMs < enCues[i - 1].startMs) {
      list = enCues.map((c, k) => [c, k]).sort((a, b) => a[0].startMs - b[0].startMs || a[1] - b[1]).map((x) => x[0]);
      break;
    }
  }
  const starts = new Float64Array(n);
  const maxEnd = new Float64Array(n);
  let m = -Infinity;
  for (let i = 0; i < n; i++) {
    starts[i] = list[i].startMs;
    m = Math.max(m, list[i].endMs);
    maxEnd[i] = m;
  }
  return (startMs, endMs) => {
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (starts[mid] < endMs) lo = mid + 1;
      else hi = mid;
    }
    const out = [];
    for (let k = lo - 1; k >= 0 && maxEnd[k] > startMs; k--) {
      if (list[k].endMs > startMs) {
        const t = flatText(list[k].text);
        if (t) out.push(t);
      }
    }
    return out.reverse().join(' ');
  };
}

/**
 * @typedef {{
 *   mode: 'none' | 'open' | 'toast',
 *   kind: 'loading' | 'empty' | 'error' | 'ready' | null,
 *   sameVideo: boolean, offsetMs: number, stepMs: number,
 *   cues: Cue[] | null, count: number, translationLang: string | null,
 *   status: { slot: number | null, name: string | null, count: number } | null,
 *   original: { lang: string, name: string, cues: Cue[] } | null,
 *   dualPref: boolean, dual: boolean,
 *   capture: { done: boolean, lang: string, langName: string, kind: 'manual' | 'asr', count: number, saved: boolean } | null,
 *   error: { code: string, message: string } | null,
 *   marks: import('../../core/model/marks.js').Mark[] | null,
 * }} PanelModel
 */

/**
 * نص الخطأ بلغة الواجهة الحالية من رمزه (فلا تبقى رسالة حُسبت بلغة سابقة)؛ ورمز يحتاج معاملات لا نملكها يبقى بنصه المحسوب.
 * @param {{ code?: string, message?: string }} err
 */
function errorText(err) {
  if (err.code && hasCode(err.code)) {
    const text = messageFor(err.code);
    if (!/\{\w+\}/.test(text)) return text;
  }
  return err.message ?? '';
}

/**
 * نموذج العرض من حالة المتحكم وحالة الصفحة والواجهة المحلية. الأولوية: لوحة مخفية خارج صفحة الفيديو وفي ملء الشاشة؛ وزر مخفي
 * (رسالة التراجع وحدها إن كانت)؛ ثم مفتوحة أو لا شيء: المغلقة لا تظهر في صفحة يوتيوب أصلًا، وزرها في شريط المشغّل (قرار سلطان
 * 2026-11-03: مغلقة افتراضيًا، وتظهر بزرها في المشغّل أو بمفتاحها في الإعدادات). والمفتوحة (وكذا المخفية بملء الشاشة وهي مفتوحة): جارٍ التحميل (فيديو الصفحة غير فيديو الحالة، أو تنقّل، أو
 * قراءة السجل)، فخطأ لا ترجمة معه، فلا ترجمة عربية، وإلا جاهزة.
 * @param {import('../../content/controller.js').ControllerState} state
 * @param {{ videoId: string | null, navigating: boolean, visible: boolean }} page
 * @param {{ toast: boolean }} ui
 * @returns {PanelModel}
 */
export function derive(state, page, ui) {
  const prefs = state.prefs?.ui ?? DEFAULT_PREFS.ui;
  const sameVideo = !!state.videoId && state.videoId === page.videoId;
  const entry = prefs.panelEntry !== false;
  let mode;
  if (!page.visible) mode = 'none';
  else if (!entry) mode = ui.toast ? 'toast' : 'none';
  else mode = prefs.panelOpen === true ? 'open' : 'none';

  // ملء الشاشة يخفي المضيف ولا يمسح الصفوف: تبقى (kind غير فارغ مع mode='none') فلا يضيع موضع التمرير ولا يُعاد البناء عند الخروج.
  let kind = null;
  if (mode === 'open' || (mode === 'none' && !page.visible && entry && prefs.panelOpen === true)) {
    if (!sameVideo || page.navigating || state.loading) kind = 'loading';
    else if (state.error && !state.arabic) kind = 'error';
    else if (!state.arabic) kind = 'empty';
    else kind = 'ready';
  }

  const arabic = sameVideo && !page.navigating ? state.arabic : null;
  const en = sameVideo && state.english?.cues?.length ? state.english : null;
  const original = en ? { lang: en.lang, name: languageName(en.lang) || LABELS.originalFallback, cues: en.cues } : null;
  const dualPref = prefs.panelDual !== false;
  const slot = state.activeSlot ?? null;
  const slotName = slot ? state.slots?.find((s) => s.n === slot)?.name ?? null : null;
  return {
    mode,
    kind,
    sameVideo,
    offsetMs: sameVideo ? state.view?.displayOffsetMs ?? 0 : 0,
    stepMs: state.settings?.offsetStepMs ?? 500,
    cues: arabic ? arabic.cues : null,
    count: arabic ? arabic.cues.length : 0,
    // لغة الترجمة المعروضة لاتجاه أسطرها ونطقها (AA1)، وnull «غير محددة».
    translationLang: arabic?.lang ?? null,
    status: arabic ? { slot, name: slotName, count: arabic.cues.length } : null,
    original,
    dualPref,
    dual: dualPref && !!original,
    capture: en ? { done: true, lang: en.lang, langName: original.name, kind: en.kind, via: en.via ? languageName(en.via) || en.via : null, count: en.cues.length, saved: en.source === 'saved' } : null,
    error: state.error ? { code: state.error.code, message: errorText(state.error) } : null,
    // علامات الخانة المعروضة (ف9): «أعود إليه» على صفوفها. مرجع المصفوفة نفسه ما لم تتغير، فلا يُعاد حلها في كل رسم.
    marks: arabic && slot && state.marks?.slot === slot ? state.marks.items : null,
  };
}
