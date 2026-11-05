// منطق نافذة الأيقونة بلا DOM (P7-AC1، وإعادة التصميم، وP12-AC6): استعلام حالة الفيديو الحالي من سكربت المحتوى في
// التبويب النشط، ووصف الحالة الأربع للبطاقة (ومؤشر «محفوظ»)، وسطر حالة أدوات المشغّل والطبقة بسببه، وسطر رفض الالتقاط،
// والإجراءات السريعة بحسب السياق، ووجهة مدخل «المحفوظات» الواحد، وشرط تفعيل «المحرّر»، وتقرير تشخيص الصفحة المنقّى (R64).
// الاستعلام يعيد null لكل ما ليس رد صفحة فيديو صالحًا، ومعه سببه: صفحة يوتيوب بلا سكربت أو بنسخة أقدم («أعد تحميل الصفحة»)،
// أو تبويب ليس يوتيوب («افتح فيديو على يوتيوب»)، أو لا يُعرف العنوان (الاثنان في جملة).
import { createDiagnosticReport, formatDiagnosticReport } from '../../core/diagnostics/report.js';
import { messageFor } from '../../core/errors/index.js';
import { COUNT_FORMS, formatCount, offsetInline } from '../../ui/format.js';
import { MESSAGE_VERSION, isVideoStateReply, pageDiagnosticsRequest, videoStateRequest } from '../../core/model/messages.js';
import { relativeTime } from '../library/model.js';
import { NOT_VIDEO_TEXT } from './view.js';

/** مهلة الرد: سكربت لا يردّ لا يترك النافذة هيكلًا إلى الأبد. */
export const REPLY_TIMEOUT_MS = 1500;
/** عدد آخر الترجمات المعروضة حين لا يكون التبويب صفحة فيديو. */
export const RECENT_LIMIT = 3;

const withTimeout = (promise, ms) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('timeout')), ms);
  promise.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
});

/**
 * أين التبويب النشط إن كشف المتصفح عنوانه (بلا إذن tabs يكشفه حيث للإضافة إذن موقع، ويخفيه غالبًا): يوتيوب، أو غيره، أو
 * لا يُعرف. @param {{ url?: string }} tab @returns {'youtube' | 'other' | null}
 */
export function tabPlace(tab) {
  if (typeof tab?.url !== 'string' || tab.url === '') return null;
  return /^https:\/\/www\.youtube\.com\//.test(tab.url) ? 'youtube' : 'other';
}

/**
 * حالة النافذة: رد الصفحة، أو سبب غيابه (تدقيق 7a66f91، Q31): `stale` صفحة يوتيوب بلا سكربت ترجمان أو بنسخة أقدم (فُتحت قبل
 * التثبيت أو التحديث، وChromium لا يحقن سكربتات البيان في التبويبات المفتوحة) فتُعاد تحميلًا، و`elsewhere` ليست يوتيوب، و`unknown`
 * لا يُعرف العنوان (الاحتمالان معًا في نص واحد).
 * @param {{ tabs?: typeof chrome.tabs, timeoutMs?: number }} [env]
 * @returns {Promise<{ reply: import('../../core/model/messages.js').VideoStateReply | null, miss: null | 'stale' | 'elsewhere' | 'unknown' }>}
 */
export async function queryPopupState({ tabs = globalThis.chrome?.tabs, timeoutMs = REPLY_TIMEOUT_MS } = {}) {
  let tab;
  try {
    [tab] = await withTimeout(tabs.query({ active: true, lastFocusedWindow: true }), timeoutMs);
  } catch {
    return { reply: null, miss: 'unknown' };
  }
  if (!tab || tab.id === undefined) return { reply: null, miss: 'unknown' };
  const place = tabPlace(tab);
  const miss = place === 'youtube' ? 'stale' : place === 'other' ? 'elsewhere' : 'unknown';
  try {
    const reply = await withTimeout(tabs.sendMessage(tab.id, videoStateRequest()), timeoutMs);
    return isVideoStateReply(reply) ? { reply, miss: null } : { reply: null, miss };
  } catch {
    return { reply: null, miss };
  }
}

/**
 * @param {{ tabs?: typeof chrome.tabs, timeoutMs?: number }} [env]
 * @returns {Promise<import('../../core/model/messages.js').VideoStateReply | null>}
 */
export async function queryVideoState(env = {}) {
  return (await queryPopupState(env)).reply;
}

/** فترة إعادة الاستعلام ما دام الرد «جارٍ القراءة»، وحدها الأقصى (L-25). */
export const LOADING_POLL_MS = 400;
export const LOADING_MAX_MS = 5000;

/**
 * يعيد الاستعلام ما دام الرد «جارٍ القراءة» حتى يستقر أو تنقضي المدة (تدقيق 7a66f91، U59 L-25): كانت النافذة تبقى هيكلًا و«تحرير
 * الترجمة» معطّلًا حتى تُفتح من جديد. يعيد آخر حالة مستقرة، أو الأخيرة إن انقضت المدة.
 * @template {{ reply: { loading?: boolean } | null }} S
 * @param {() => Promise<S>} query @param {S} first
 * @param {{ intervalMs?: number, maxMs?: number, sleep?: (ms: number) => Promise<void> }} [o]
 * @returns {Promise<S>}
 */
export async function untilSettled(query, first, { intervalMs = LOADING_POLL_MS, maxMs = LOADING_MAX_MS, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let state = first;
  for (let waited = 0; state.reply?.loading && waited < maxMs; waited += intervalMs) {
    await sleep(intervalMs);
    const next = await query();
    // انقطاع الرد أثناء الانتظار (تنقل بين الصفحات) لا يمحو آخر حالة معروفة.
    if (!next.reply) break;
    state = next;
  }
  return state;
}

/**
 * نص الملاحظة حين لا رد صفحة فيديو.
 * @param {null | 'stale' | 'elsewhere' | 'unknown'} miss
 */
export const missText = (miss) => (miss === 'stale' ? messageFor('TJ_RELOAD_PAGE') : miss === 'unknown' ? messageFor('TJ_OPEN_OR_RELOAD') : NOT_VIDEO_TEXT);

const MODE_TEXT = Object.freeze({ ar: 'العربية وحدها', dual: 'العربية فوق الإنجليزية', off: 'الترجمة مخفية' });
/** نوع مسار الأصل كما يُعرض بجانب حالته: «ملتقط · يدوي». */
const KIND_TEXT = Object.freeze({ manual: 'يدوي', asr: 'تلقائي' });

/**
 * وصف بطاقة الفيديو الحالي: حالة واحدة من أربع.
 * @param {import('../../core/model/messages.js').VideoStateReply | null} reply
 * saved: للفيديو سجل في المحفوظات (مؤشر حالة «محفوظ» في البطاقة، لا رابط).
 * @returns {{ kind: 'not-video' }
 *   | { kind: 'loading', title: string }
 *   | { kind: 'no-subtitle', title: string, englishLine: string, englishKind: string | null, englishReady: boolean, saved: boolean }
 *   | { kind: 'has-subtitle', title: string, line: string, edited: boolean, matched: boolean | null, mode: string, fileName: string, saved: true }}
 */
export function describeStatus(reply) {
  if (!reply || !reply.watch) return { kind: 'not-video' };
  const title = reply.title ?? reply.videoId ?? '';
  if (reply.loading) return { kind: 'loading', title };
  if (!reply.arabic) {
    const capturedTrack = reply.english.captured.find((t) => t.ok);
    const captured = Boolean(capturedTrack);
    const saved = reply.english.saved.length > 0;
    // نوع المسار (يدوي أو تلقائي) من المسار الذي تُبنى عليه الحالة: الملتقط أولًا ثم المحفوظ، وإلا لا شيء.
    const englishKind = KIND_TEXT[(capturedTrack ?? reply.english.saved[0])?.kind] ?? null;
    return { kind: 'no-subtitle', title, englishLine: `المسار الإنجليزي: ${captured ? 'ملتقط' : saved ? 'محفوظ' : 'غير ملتقط'}`, englishKind, englishReady: captured || saved, saved };
  }
  const a = reply.arabic;
  return {
    kind: 'has-subtitle',
    title,
    line: ['ترجمة عربية', formatCount(a.cueCount, COUNT_FORMS.cue), `الإزاحة ${offsetInline(reply.view.displayOffsetMs)} ث`].join(' · '),
    edited: a.edited,
    matched: a.matched,
    mode: MODE_TEXT[reply.view.displayMode] ?? MODE_TEXT.ar,
    fileName: a.fileName,
    saved: true,
  };
}

/** خطوات الإرشاد لفيديو بلا ترجمة عربية، بنصوصها كما في اللوحة المعتمدة. */
export const GUIDE_TEXT = Object.freeze([
  'نزّل الأصل من زر التنزيل وانسخ التعليمات',
  'ترجمها بنموذجك المفضّل',
  'ارفع العربية من زر الترجمة في الشريط',
]);

/**
 * خطوات «بلا ترجمة عربية» من الحالة الفعلية لا من نية: ما دام الأصل الإنجليزي غير ملتقط ولا محفوظ فالخطوة الأولى هي الحالية
 * والباقيتان منتظرتان؛ وإن التُقط أو حُفظ فالأولى منجزة والثانية هي الحالية والثالثة منتظرة. لا خطوات لغير هذه الحالة.
 * @param {import('../../core/model/messages.js').VideoStateReply | null} reply
 * @returns {{ n: 1 | 2 | 3, text: string, state: 'done' | 'now' | 'pending' }[] | null}
 */
export function guideSteps(reply) {
  const s = describeStatus(reply);
  if (s.kind !== 'no-subtitle') return null;
  const now = s.englishReady ? 1 : 0;
  return GUIDE_TEXT.map((text, i) => ({ n: /** @type {1 | 2 | 3} */ (i + 1), text, state: i < now ? 'done' : i === now ? 'now' : 'pending' }));
}

/**
 * زر لوحة النص المتزامن مخفي بقرار المستخدم (prefs.ui.panelEntry=false)؟ القيمة الغائبة أو غير المعروفة ليست «مخفيًا».
 * @param {import('../../core/model/prefs.js').Prefs | null | undefined} prefs
 */
export const entryHidden = (prefs) => prefs?.ui?.panelEntry === false;

/**
 * سطر آخر ترجمة: «قبل ساعتين · 412 مقطعًا»، أو «… · بانتظار الترجمة» لفيديو بلا عربية.
 * @param {{ updatedAt: string, arabic: { cueCount: number } | null }} entry @param {number} nowMs
 */
export function recentLine(entry, nowMs) {
  return [relativeTime(entry.updatedAt, nowMs), entry.arabic ? formatCount(entry.arabic.cueCount, COUNT_FORMS.cue) : 'بانتظار الترجمة'].filter(Boolean).join(' · ');
}

/**
 * وجهة مدخل «المحفوظات» الواحد في النافذة (جولة الصقل): المحفوظات كلها، وعلى فيديو محفوظ تُفتح على صفه مُبرزًا (#v=) دون
 * تصفية، فلا يحتاج زرًّا ثانيًا للوجهة نفسها.
 * @param {import('../../core/model/messages.js').VideoStateReply | null} reply
 * @returns {string | undefined} جزء العنوان أو لا شيء
 */
export function libraryHash(reply) {
  if (!reply?.watch || !reply.videoId || reply.loading) return undefined;
  return reply.arabic || reply.english.saved.length > 0 ? `v=${reply.videoId}` : undefined;
}

/**
 * سطر حالة أدوات المشغّل وطبقة الترجمة في بطاقة الفيديو (مواصفة التصميم §١٩.٦): تعمل، أو بانتظار المشغّل، أو تعذّر الربط؛
 * وعند التعطل سببه المفهوم من آخر رمز (عقد messages §٥).
 * @param {import('../../core/model/messages.js').VideoStateReply | null} reply
 * @returns {{ tone: 'success' | 'info' | 'danger', text: string, reason: string | null } | null}
 */
export function toolsStatus(reply) {
  if (!reply || !reply.watch) return null;
  const { controls, overlay } = reply.mounted;
  const code = typeof reply.tools?.code === 'string' ? reply.tools.code : null;
  const reason = code ? messageFor(code) : null;
  if (controls === 'mounted' && overlay === 'mounted') return { tone: 'success', text: 'أدوات المشغّل تعمل', reason: null };
  if (controls === 'error') return { tone: 'danger', text: 'تعذّر ربط الأدوات بالمشغّل — أعد تحميل الصفحة', reason };
  if (overlay === 'error') return { tone: 'danger', text: 'تعذّر ربط طبقة الترجمة بالمشغّل — أعد تحميل الصفحة', reason };
  return { tone: 'info', text: 'بانتظار المشغّل', reason: null };
}

/**
 * سطر رفض الالتقاط لهذه الجلسة (مثل مسار عربي أو مترجم آليًا)، أو null. ما يُلتقط صالحًا لا يُذكر هنا.
 * @param {import('../../core/model/messages.js').VideoStateReply | null} reply
 * @returns {{ tone: 'warning', text: string } | null}
 */
export function captureLine(reply) {
  const c = reply?.watch ? reply.capture : null;
  if (!c || c.state !== 'rejected' || typeof c.code !== 'string') return null;
  return { tone: 'warning', text: messageFor(c.code) };
}

/**
 * القاموس المرفق بتعليمات الترجمة، أو null (التفضيلات: «أرفق القاموس» مفعّل وفيه مصطلح).
 * @param {import('../../core/model/prefs.js').Prefs | null | undefined} prefs
 */
export const attachedGlossary = (prefs) => (prefs?.glossary?.attach && prefs.glossary.terms?.length ? prefs.glossary.terms : null);

/**
 * تشخيص الصفحة من سكربت المحتوى في التبويب النشط (عقد messages §٦): أقسامه أو null.
 * @param {{ tabs?: typeof chrome.tabs, timeoutMs?: number }} [env]
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function queryPageDiagnostics({ tabs = globalThis.chrome?.tabs, timeoutMs = REPLY_TIMEOUT_MS } = {}) {
  try {
    const [tab] = await withTimeout(tabs.query({ active: true, lastFocusedWindow: true }), timeoutMs);
    if (!tab || tab.id === undefined) return null;
    const r = await withTimeout(tabs.sendMessage(tab.id, pageDiagnosticsRequest()), timeoutMs);
    return r && typeof r === 'object' && r.v === MESSAGE_VERSION && r.ok === true && r.sections && typeof r.sections === 'object' ? r.sections : null;
  } catch {
    return null;
  }
}

/**
 * المعرّفات خارج التقرير: ما شوهد لا يدخل التشخيص (والمنقّي يسقط النصوص والعناوين والروابط بعدها). كل مفتاح ينتهي باسم
 * معرّف الفيديو (videoId وcurrentVideoId وlastVideoId…)، فلا يتسرب من قسم يضيفه مستخرج أو متحكم لاحقًا.
 */
const ID_KEYS = /video_?ids?$/i;
function withoutIds(value) {
  if (Array.isArray(value)) return value.map(withoutIds);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, ID_KEYS.test(k) ? '[مستبعد]' : withoutIds(v)]));
  return value;
}

/**
 * تقرير «نسخ تشخيص الصفحة» (R64، P12-AC6): رموز وأعداد من رد الحالة ومن سكربت المحتوى (المتحكم والمستخرج ونقطتا التركيب
 * برموز PL_ وCT_)، بلا نص ولا عنوان ولا رابط ولا معرّف فيديو، عبر createDiagnosticReport الذي ينقّيه.
 * @param {{ reply: import('../../core/model/messages.js').VideoStateReply | null, sections: Record<string, unknown> | null, version: string, browser: string, at?: string }} p
 */
export function pageReport({ reply, sections, version, browser, at }) {
  const popup = reply ? {
    watch: reply.watch, loading: reply.loading,
    tools: reply.tools ?? { overlay: reply.mounted.overlay, controls: reply.mounted.controls, code: null },
    capture: reply.capture ?? null,
    slots: Array.isArray(reply.slots) ? reply.slots.map((x) => ({ n: x.n, filled: x.filled, active: x.active })) : null,
    arabic: reply.arabic ? { cueCount: reply.arabic.cueCount, edited: reply.arabic.edited, matched: reply.arabic.matched } : null,
    english: { captured: reply.english.captured.map((t) => ({ kind: t.kind, ok: t.ok, cueCount: t.cueCount })), saved: reply.english.saved.length },
    view: reply.view,
  } : null;
  return formatDiagnosticReport(createDiagnosticReport({
    version, browser, ...(at ? { at } : {}),
    sections: withoutIds({ popup, page: sections ?? { unavailable: true } }),
  }));
}

/**
 * «المحرّر» للفيديو الحالي إن كانت له ترجمة، وإلا معطّل بسبب ظاهر.
 * @param {import('../../core/model/messages.js').VideoStateReply | null} reply
 * @returns {{ enabled: true, videoId: string, reason: null } | { enabled: false, videoId: null, reason: string }}
 */
export function editorGate(reply) {
  if (!reply || !reply.watch || !reply.videoId) return { enabled: false, videoId: null, reason: 'افتح فيديو على يوتيوب أولًا' };
  if (reply.loading) return { enabled: false, videoId: null, reason: 'جارٍ قراءة ترجمة الفيديو…' };
  if (!reply.arabic) return { enabled: false, videoId: null, reason: 'لا ترجمة لهذا الفيديو بعد' };
  return { enabled: true, videoId: reply.videoId, reason: null };
}

/**
 * الإجراءات السريعة للفيديو الحالي بترتيب أولويتها: الأول رئيسي. لا شيء لغير صفحة الفيديو (تُعرض آخر الترجمات بدلها). لا
 * تنقّل هنا: المحفوظات والإعدادات مدخلان في تذييل النافذة وحده.
 * @param {import('../../core/model/messages.js').VideoStateReply | null} reply
 * @returns {{ id: 'editor' | 'copy', label: string, primary: boolean, disabledReason: string | null }[]}
 */
export function quickActions(reply) {
  if (!reply || !reply.watch || !reply.videoId) return [];
  const gate = editorGate(reply);
  if (reply.loading) return [{ id: 'editor', label: 'تحرير الترجمة', primary: true, disabledReason: gate.reason }];
  if (reply.arabic) {
    return [
      { id: 'editor', label: 'تحرير الترجمة', primary: true, disabledReason: null },
      { id: 'copy', label: 'نسخ التعليمات', primary: false, disabledReason: null },
    ];
  }
  return [{ id: 'copy', label: 'نسخ تعليمات الترجمة', primary: true, disabledReason: null }];
}

/**
 * آخر الترجمات لحالة «ليست صفحة فيديو»: الأحدث تعديلًا أولًا.
 * @template {{ updatedAt: string }} E
 * @param {E[]} entries @param {number} [limit]
 */
export const recentEntries = (entries, limit = RECENT_LIMIT) => entries.slice().sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0)).slice(0, limit);
