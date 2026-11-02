// منطق نافذة الأيقونة بلا DOM (P7-AC1، وإعادة التصميم): استعلام حالة الفيديو الحالي من سكربت المحتوى في التبويب
// النشط، ووصف الحالة الأربع للبطاقة، وسطر حالة الأدوات، والإجراءات السريعة بحسب السياق، وشرط تفعيل «المحرّر».
// الاستعلام يعيد null لكل ما ليس رد صفحة فيديو صالحًا («افتح فيديو على يوتيوب»): تبويب ليس يوتيوب، أو سكربت لم
// يُحمَّل، أو نسخة أقدم، أو لا رد في المهلة.
import { COUNT_FORMS, formatCount, formatOffset } from '../../ui/format.js';
import { isVideoStateReply, videoStateRequest } from '../../core/model/messages.js';

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
 * سطر حالة أدوات المشغّل في بطاقة الفيديو (مواصفة التصميم §١٩.٦): تعمل، أو بانتظار المشغّل، أو تعذّر الربط.
 * @param {import('../../core/model/messages.js').VideoStateReply | null} reply
 * @returns {{ tone: 'success' | 'info' | 'danger', text: string } | null}
 */
export function toolsStatus(reply) {
  if (!reply || !reply.watch) return null;
  const { controls, overlay } = reply.mounted;
  if (controls === 'mounted' && overlay === 'mounted') return { tone: 'success', text: 'أدوات المشغّل تعمل' };
  if (controls === 'error' || overlay === 'error') return { tone: 'danger', text: 'تعذّر ربط الأدوات بالمشغّل — أعد تحميل الصفحة' };
  return { tone: 'info', text: 'بانتظار المشغّل' };
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
