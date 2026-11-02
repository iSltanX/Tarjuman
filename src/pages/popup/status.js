// منطق نافذة الأيقونة بلا DOM (P7-AC1، وإعادة التصميم، وP12-AC6): استعلام حالة الفيديو الحالي من سكربت المحتوى في
// التبويب النشط، ووصف الحالة الأربع للبطاقة، وسطر حالة أدوات المشغّل والطبقة بسببه، وسطر رفض الالتقاط، والإجراءات
// السريعة بحسب السياق، وشرط تفعيل «المحرّر»، وتقرير تشخيص الصفحة المنقّى (R64).
// الاستعلام يعيد null لكل ما ليس رد صفحة فيديو صالحًا («افتح فيديو على يوتيوب»): تبويب ليس يوتيوب، أو سكربت لم
// يُحمَّل، أو نسخة أقدم، أو لا رد في المهلة.
import { createDiagnosticReport, formatDiagnosticReport } from '../../core/diagnostics/report.js';
import { messageFor } from '../../core/errors/index.js';
import { COUNT_FORMS, formatCount, formatOffset } from '../../ui/format.js';
import { MESSAGE_VERSION, isVideoStateReply, pageDiagnosticsRequest, videoStateRequest } from '../../core/model/messages.js';

/** مهلة الرد: سكربت لا يردّ لا يترك النافذة هيكلًا إلى الأبد. */
export const REPLY_TIMEOUT_MS = 1500;
/** عدد آخر الترجمات المعروضة حين لا يكون التبويب صفحة فيديو. */
export const RECENT_LIMIT = 3;

const withTimeout = (promise, ms) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('timeout')), ms);
  promise.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
});

/**
 * @param {{ tabs?: typeof chrome.tabs, timeoutMs?: number }} [env]
 * @returns {Promise<import('../../core/model/messages.js').VideoStateReply | null>}
 */
export async function queryVideoState({ tabs = globalThis.chrome?.tabs, timeoutMs = REPLY_TIMEOUT_MS } = {}) {
  try {
    const [tab] = await withTimeout(tabs.query({ active: true, lastFocusedWindow: true }), timeoutMs);
    if (!tab || tab.id === undefined) return null;
    const reply = await withTimeout(tabs.sendMessage(tab.id, videoStateRequest()), timeoutMs);
    return isVideoStateReply(reply) ? reply : null;
  } catch {
    return null;
  }
}

const MODE_TEXT = Object.freeze({ ar: 'العربية وحدها', dual: 'العربية فوق الإنجليزية', off: 'الترجمة مخفية' });

/**
 * وصف بطاقة الفيديو الحالي: حالة واحدة من أربع.
 * @param {import('../../core/model/messages.js').VideoStateReply | null} reply
 * @returns {{ kind: 'not-video' }
 *   | { kind: 'loading', title: string }
 *   | { kind: 'no-subtitle', title: string, englishLine: string, englishReady: boolean }
 *   | { kind: 'has-subtitle', title: string, line: string, edited: boolean, matched: boolean | null, mode: string, fileName: string }}
 */
export function describeStatus(reply) {
  if (!reply || !reply.watch) return { kind: 'not-video' };
  const title = reply.title ?? reply.videoId ?? '';
  if (reply.loading) return { kind: 'loading', title };
  if (!reply.arabic) {
    const captured = reply.english.captured.some((t) => t.ok);
    const saved = reply.english.saved.length > 0;
    return { kind: 'no-subtitle', title, englishLine: `المسار الإنجليزي: ${captured ? 'ملتقط ✓' : saved ? 'محفوظ ✓' : 'غير ملتقط'}`, englishReady: captured || saved };
  }
  const a = reply.arabic;
  return {
    kind: 'has-subtitle',
    title,
    line: ['ترجمة عربية', formatCount(a.cueCount, COUNT_FORMS.cue), `الإزاحة ${formatOffset(reply.view.displayOffsetMs)} ث`].join(' · '),
    edited: a.edited,
    matched: a.matched,
    mode: MODE_TEXT[reply.view.displayMode] ?? MODE_TEXT.ar,
    fileName: a.fileName,
  };
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

/** «Brave 156» أو «Chrome 156»: الاسم والرقم الرئيسي وحدهما، لا سلسلة وكيل المستخدم. @param {Navigator | undefined} nav */
export function browserLabel(nav = globalThis.navigator) {
  const brands = Array.isArray(nav?.userAgentData?.brands) ? nav.userAgentData.brands.filter((b) => b && typeof b.brand === 'string' && !/not.?a.?brand/i.test(b.brand)) : [];
  const pick = brands.find((b) => /brave/i.test(b.brand)) ?? brands.find((b) => /chrome$/i.test(b.brand)) ?? brands.find((b) => /chromium/i.test(b.brand)) ?? brands[0];
  if (pick) return `${pick.brand.replace(/^Google /, '')} ${String(pick.version).split('.')[0]}`.slice(0, 40);
  const m = /(Chrome|Chromium)\/(\d+)/.exec(String(nav?.userAgent ?? ''));
  return m ? `${m[1]} ${m[2]}` : 'غير معروف';
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
 * الإجراءات السريعة للفيديو الحالي بترتيب أولويتها: الأول رئيسي. لا شيء لغير صفحة الفيديو (تُعرض آخر الترجمات بدلها).
 * @param {import('../../core/model/messages.js').VideoStateReply | null} reply
 * @returns {{ id: 'editor' | 'copy' | 'find', label: string, primary: boolean, disabledReason: string | null }[]}
 */
export function quickActions(reply) {
  if (!reply || !reply.watch || !reply.videoId) return [];
  const gate = editorGate(reply);
  const hasRecord = Boolean(reply.arabic) || reply.english.saved.length > 0;
  if (reply.loading) return [{ id: 'editor', label: 'تحرير الترجمة', primary: true, disabledReason: gate.reason }];
  if (reply.arabic) {
    return [
      { id: 'editor', label: 'تحرير الترجمة', primary: true, disabledReason: null },
      { id: 'copy', label: 'نسخ تعليمات الترجمة', primary: false, disabledReason: null },
      { id: 'find', label: 'في المحفوظات', primary: false, disabledReason: null },
    ];
  }
  return [
    { id: 'copy', label: 'نسخ تعليمات الترجمة', primary: true, disabledReason: null },
    { id: 'find', label: 'في المحفوظات', primary: false, disabledReason: hasRecord ? null : 'لم يُحفظ شيء لهذا الفيديو بعد' },
  ];
}

/**
 * آخر الترجمات لحالة «ليست صفحة فيديو»: الأحدث تعديلًا أولًا.
 * @template {{ updatedAt: string }} E
 * @param {E[]} entries @param {number} [limit]
 */
export const recentEntries = (entries, limit = RECENT_LIMIT) => entries.slice().sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0)).slice(0, limit);
