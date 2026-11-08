// منطق نافذة الأيقونة بلا DOM (P7-AC1، وإعادة التصميم، وP12-AC6): استعلام حالة الفيديو الحالي من سكربت المحتوى في
// التبويب النشط، ووصف الحالة الأربع للبطاقة (ومؤشر «محفوظ»)، وسطر حالة أدوات المشغّل والطبقة بسببه، وسطر رفض الالتقاط،
// والإجراءات السريعة بحسب السياق، ووجهة مدخل «المحفوظات» الواحد، وشرط تفعيل «المحرّر»، وتقرير تشخيص الصفحة المنقّى (R64).
// الاستعلام يعيد null لكل ما ليس رد صفحة فيديو صالحًا، ومعه سببه: صفحة يوتيوب بلا سكربت أو بنسخة أقدم («أعد تحميل الصفحة»)،
// أو تبويب ليس يوتيوب («افتح فيديو على يوتيوب»)، أو لا يُعرف العنوان (الاثنان في جملة).
import { createDiagnosticReport, formatDiagnosticReport } from '../../core/diagnostics/report.js';
import { messageFor } from '../../core/errors/index.js';
import { describeLang } from '../../core/lang/index.js';
import { getLocale, t, texts } from '../../i18n/index.js';
import { isSourceLang, parseTrackKey } from '../../core/model/ids.js';
import { COUNT_FORMS, formatCount, offsetInline } from '../../ui/format.js';
import { pairLabel } from '../../ui/lang.js';
import { MESSAGE_VERSION, isVideoStateReply, pageDiagnosticsRequest, videoStateRequest } from '../../core/model/messages.js';
import { relativeTime } from '../library/model.js';
import { notVideoText } from './view.js';

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
export const missText = (miss) => (miss === 'stale' ? messageFor('TJ_RELOAD_PAGE') : miss === 'unknown' ? messageFor('TJ_OPEN_OR_RELOAD') : notVideoText());

/** اسم لغة للعرض بلغة الواجهة من رمزها، والرمز الذي لا يعرف المتصفح اسمه يبقى رمزه. @param {string} code */
export const langLabel = (code) => describeLang(code, getLocale())?.name ?? code;

/** «ترجمة بالعربية» و«ترجمة باليابانية»، و«ترجمة بلغة xx» للرمز الذي لا يعرف المتصفح اسمه (وبالإنجليزية «Japanese translation»). @param {string} code */
const translationIn = (code) => {
  const d = describeLang(code, getLocale());
  return t('popup.status.translationIn', { name: d?.name ?? code, code, known: Boolean(d?.known) });
};

/** وضع العرض في سطر الأدوات بلغة الأصل الفعلية: «الترجمة فوق اليابانية». @param {string} mode @param {string | null} source */
const modeText = (mode, source) => (mode === 'dual' ? t('popup.status.modeDual', { source: source ? langLabel(source) : t('popup.status.original') }) : mode === 'off' ? t('popup.status.modeOff') : t('popup.status.modeSingle'));
/** نوع مسار الأصل كما يُعرض بجانب حالته: «ملتقطة · يدوية». */
const kindText = (kind) => (kind === 'manual' || kind === 'asr' ? t(`popup.status.kind.${kind}`) : null);

/**
 * مسار الأصل الذي تُبنى عليه حالة البطاقة: مسار «من» في الرد (ق٥)، وإلا أول ملتقط سليم، وإلا أول محفوظ.
 * @param {import('../../core/model/messages.js').VideoStateReply} reply
 * @returns {{ lang: string, kind: 'manual' | 'asr', via: string | null, cueCount: number, captured: boolean } | null}
 */
function baseTrack(reply) {
  const captured = reply.english.captured.filter((t) => t.ok);
  const saved = reply.english.saved;
  const pick = (key) => captured.find((t) => t.key === key) ?? saved.find((t) => t.key === key) ?? null;
  const t = (reply.source ? pick(reply.source.key) : null) ?? captured[0] ?? saved[0] ?? null;
  const k = t ? parseTrackKey(t.key) : null;
  return k ? { lang: k.lang, kind: k.kind, via: k.via, cueCount: t.cueCount, captured: captured.includes(t) } : null;
}

/**
 * وصف بطاقة الفيديو الحالي: حالة واحدة من أربع. نصوصها بلغة المسار والترجمة الفعليتين (AA3)، لا «الإنجليزي» و«العربية».
 * @param {import('../../core/model/messages.js').VideoStateReply | null} reply
 * saved: للفيديو سجل في المحفوظات (مؤشر حالة «محفوظ» في البطاقة، لا رابط).
 * @returns {{ kind: 'not-video' }
 *   | { kind: 'loading', title: string }
 *   | { kind: 'no-subtitle', title: string, englishLine: string, englishKind: string | null, englishReady: boolean, saved: boolean }
 *   | { kind: 'has-subtitle', title: string, line: string, edited: boolean, matched: boolean | null, mode: string, fileName: string, saved: true }}
 *   englishLine/englishReady (الاسمان التاريخيان): سطر مسار الأصل وجاهزيته
 */
export function describeStatus(reply) {
  if (!reply || !reply.watch) return { kind: 'not-video' };
  const title = reply.title ?? reply.videoId ?? '';
  if (reply.loading) return { kind: 'loading', title };
  const base = baseTrack(reply);
  if (!reply.arabic) {
    const saved = reply.english.saved.length > 0;
    const name = base ? `${langLabel(base.lang)}${base.via ? t('popup.status.viaMachine') : ''}` : null;
    const kind = base ? kindText(base.kind) : null;
    const line = !base ? t('popup.status.notCaptured') : [t(base.captured ? 'popup.status.captured' : 'popup.status.savedTrack', { name }), kind, formatCount(base.cueCount, COUNT_FORMS.cue)].filter(Boolean).join(' · ');
    return { kind: 'no-subtitle', title, englishLine: line, englishKind: kind, englishReady: !!base, saved };
  }
  const a = reply.arabic;
  return {
    kind: 'has-subtitle',
    title,
    line: [a.lang ? translationIn(a.lang) : t('popup.status.translationUnknown'), formatCount(a.cueCount, COUNT_FORMS.cue), t('popup.status.offset', { offset: offsetInline(reply.view.displayOffsetMs) })].join(' · '),
    edited: a.edited,
    matched: a.matched,
    mode: modeText(reply.view.displayMode, base?.lang ?? null),
    fileName: a.fileName,
    saved: true,
  };
}

/**
 * خطوات الإرشاد لفيديو بلا ترجمة: الأصل، ثم التعليمات من هنا والترجمة بنموذجك، ثم الرفع؛ والزوج المختار يُذكر بلغتيه.
 * @param {{ from?: string | null, to?: string | null }} [pair]
 */
export function guideText(pair = {}) {
  const from = isSourceLang(pair.from) ? langLabel(pair.from) : null;
  const to = isSourceLang(pair.to) ? langLabel(pair.to) : null;
  return [
    from ? t('popup.steps.downloadFrom', { from }) : t('popup.steps.download'),
    to ? t('popup.steps.copyTo', { to }) : t('popup.steps.copy'),
    t('popup.steps.upload'),
  ];
}

/**
 * خطوات «بلا ترجمة» من الحالة الفعلية لا من نية: ما دام الأصل لم يُنزَّل فالخطوة الأولى هي الحالية والباقيتان منتظرتان ولو
 * كان ملتقطًا أو محفوظًا؛ وإن نُزّل فالأولى منجزة والثانية هي الحالية والثالثة منتظرة. لا خطوات لغير هذه الحالة.
 * @param {import('../../core/model/messages.js').VideoStateReply | null} reply
 * @param {{ from?: string | null, to?: string | null }} [pair]
 * @param {boolean} [downloaded] نُزّل الأصل فعلًا من ترجمان لهذا الفيديو (originDownloaded)
 * @returns {{ n: 1 | 2 | 3, text: string, state: 'done' | 'now' | 'pending' }[] | null}
 */
export function guideSteps(reply, pair = {}, downloaded = false) {
  const s = describeStatus(reply);
  if (s.kind !== 'no-subtitle') return null;
  const now = downloaded ? 1 : 0;
  return guideText(pair).map((text, i) => ({ n: /** @type {1 | 2 | 3} */ (i + 1), text, state: i < now ? 'done' : i === now ? 'now' : 'pending' }));
}

/**
 * هل نُزّل أصل هذا الفيديو من ترجمان؟ كل تنزيل يكتب مرجع مقارنته في record.fingerprints، أما التقاط الأصل وحده فلا يكتب شيئًا.
 * تعذّر القراءة يبقي الخطوة الأولى هي الحالية، فلا تُعلَّم منجزة بلا دليل.
 * @param {{ getVideo: (id: string) => Promise<{ fingerprints?: unknown[] } | null> }} store
 * @param {import('../../core/model/messages.js').VideoStateReply | null} reply
 */
export async function originDownloaded(store, reply) {
  if (!reply?.videoId) return false;
  try {
    return ((await store.getVideo(reply.videoId))?.fingerprints?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * زر لوحة النص المتزامن مخفي بقرار المستخدم (prefs.ui.panelEntry=false)؟ القيمة الغائبة أو غير المعروفة ليست «مخفيًا».
 * @param {import('../../core/model/prefs.js').Prefs | null | undefined} prefs
 */
export const entryHidden = (prefs) => prefs?.ui?.panelEntry === false;

/**
 * سطر آخر ترجمة: «قبل ساعتين · الإنجليزية ← العربية · 412 مقطعًا»، أو «… · بانتظار الترجمة» لفيديو بلا ترجمة (لوحة 09، الحالة 5).
 * @param {{ updatedAt: string, arabic: { cueCount: number } | null }} entry @param {number} nowMs
 * @param {{ from: string | null, to: string | null } | null} [pair] زوج الفيديو إن عُرف
 */
export function recentLine(entry, nowMs, pair = null) {
  const langs = pair ? pairLabel({ ...pair, translated: !!entry.arabic }) : null;
  return [relativeTime(entry.updatedAt, nowMs), langs, entry.arabic ? formatCount(entry.arabic.cueCount, COUNT_FORMS.cue) : t('popup.status.awaiting')].filter(Boolean).join(' · ');
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

/** الإجراء حين يتعطل الربط بلا رمز يحمل سببًا وإجراءً. */
const toolsReloadAction = () => t('popup.status.reload');

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
  if (controls === 'mounted' && overlay === 'mounted') return { tone: 'success', text: t('popup.status.toolsOk'), reason: null };
  // العنوان عام، والسبب والإجراء من رسالة الرمز مرة واحدة؛ وبلا رمز يبقى الإجراء الاحتياطي.
  if (controls === 'error') return { tone: 'danger', text: t('popup.status.toolsControlsError'), reason: reason ?? toolsReloadAction() };
  if (overlay === 'error') return { tone: 'danger', text: t('popup.status.toolsOverlayError'), reason: reason ?? toolsReloadAction() };
  return { tone: 'info', text: t('popup.status.toolsWaiting'), reason: null };
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
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, ID_KEYS.test(k) ? t('popup.diag.excluded') : withoutIds(v)]));
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
  if (!reply || !reply.watch || !reply.videoId) return { enabled: false, videoId: null, reason: t('popup.editor.needVideo') };
  if (reply.loading) return { enabled: false, videoId: null, reason: t('popup.editor.reading') };
  if (!reply.arabic) return { enabled: false, videoId: null, reason: t('popup.editor.none') };
  return { enabled: true, videoId: reply.videoId, reason: null };
}

/**
 * الإجراءات السريعة للفيديو الحالي: «تحرير الترجمة» داخل البطاقة وحده (لوحة 09)؛ ونسخ التعليمات صار كتلة «تعليمات الترجمة»
 * (AA3). لا شيء لغير صفحة الفيديو ولا لفيديو بلا ترجمة.
 * @param {import('../../core/model/messages.js').VideoStateReply | null} reply
 * @returns {{ id: 'editor', label: string, primary: boolean, disabledReason: string | null }[]}
 */
export function quickActions(reply) {
  if (!reply || !reply.watch || !reply.videoId) return [];
  const gate = editorGate(reply);
  if (reply.loading) return [{ id: 'editor', label: t('popup.editor.open'), primary: false, disabledReason: gate.reason }];
  if (reply.arabic) return [{ id: 'editor', label: t('popup.editor.open'), primary: false, disabledReason: null }];
  return [];
}

// ---- كتلة «تعليمات الترجمة» (AA3، لوحة 09، قرارا سلطان ق٢ وق٥) ----

/** نصوص كتلة «تعليمات الترجمة» بلغة الواجهة الحالية عند كل قراءة (popup.pair). */
export const PAIR_TEXT = texts('popup.pair');

/** ترجمة يوتيوب الآلية: «الأصل ترجمة آلية من يوتيوب عن الإنجليزية.». @param {string} via */
export const machineNote = (via) => t('popup.pair.machine', { lang: langLabel(via) });

/**
 * لغات مسارات الفيديو لقائمة «من» (مجموعة «في هذا الفيديو»): الملتقطة والمحفوظة ثم ما في بيانات المشغّل، بلا تكرار.
 * @param {import('../../core/model/messages.js').VideoStateReply | null} reply
 * @returns {string[]}
 */
export function videoLangs(reply) {
  if (!reply?.watch) return [];
  const keys = [reply.source?.key, ...reply.english.captured.filter((t) => t.ok).map((t) => t.key), ...reply.english.saved.map((t) => t.key)];
  const out = keys.map((k) => parseTrackKey(k)?.lang).filter(Boolean);
  for (const t of Array.isArray(reply.available) ? reply.available : []) if (isSourceLang(t?.lang)) out.push(t.lang);
  return [...new Set(out)];
}

/**
 * لغة «من» المكتشفة بدقة (ق٥): لغة مسار «من» في الرد كما أرسلها يوتيوب، وإلا null. لا تخمين من نص.
 * @param {import('../../core/model/messages.js').VideoStateReply | null} reply
 */
export const detectedSource = (reply) => (reply?.watch && !reply.loading && isSourceLang(reply.source?.lang) ? reply.source.lang : null);

/**
 * حالة الكتلة: هل يُتاح النسخ وسببه إن لم يُتح، وسطر المصدر تحت الحقلين، والشرح تحت الزر.
 * @param {{ reply: import('../../core/model/messages.js').VideoStateReply | null, pair: { from: string | null, to: string | null } }} p
 * @returns {{ ready: boolean, reason: string | null, sourceNote: string | null, caption: string, done: string }}
 */
export function pairState({ reply, pair }) {
  const from = isSourceLang(pair.from) ? pair.from : null;
  const to = isSourceLang(pair.to) ? pair.to : null;
  const detected = detectedSource(reply);
  const via = from && reply?.source?.via && from === reply.source.lang ? reply.source.via : null;
  const sourceNote = via ? machineNote(via) : from && from === detected ? PAIR_TEXT.detected : null;
  let reason = null;
  if (!reply?.watch || !reply.videoId) reason = PAIR_TEXT.noVideo;
  else if (reply.loading) reason = PAIR_TEXT.loading;
  else if (!from && !to) reason = PAIR_TEXT.needBoth;
  else if (!from) reason = PAIR_TEXT.needFrom;
  else if (!to) reason = PAIR_TEXT.needTo;
  else if (from === to) reason = PAIR_TEXT.same;
  return {
    ready: reason === null,
    reason,
    sourceNote,
    caption: reason ?? PAIR_TEXT.caption,
    done: from && to ? PAIR_TEXT.done : '',
  };
}

/**
 * معاملات instructions للزوج المختار: العنوان والرابط، والقاموس إن أُرفق، والمصدر المترجم آليًا إن كان «من» لغة ترجمة يوتيوب
 * الآلية، وفقرة الأجزاء إن كان آخر تنزيل لهذا الفيديو مقسّمًا بلغة «من» نفسها (فلا تُفقد وظيفة التقسيم الاحتياطي).
 * @param {{ reply: import('../../core/model/messages.js').VideoStateReply, pair: { from: string, to: string }, glossary: object[] | null }} p
 */
export function copyArgs({ reply, pair, glossary }) {
  const via = reply.source?.via && pair.from === reply.source.lang ? reply.source.via : null;
  const last = reply.lastExport ?? null;
  const parts = last && last.lang === pair.from && (last.via ?? null) === via && Array.isArray(last.parts) && last.parts.length >= 2 ? last.parts : null;
  return { videoId: reply.videoId, title: reply.title, source: pair.from, target: pair.to, via, parts, glossary };
}

/**
 * آخر الترجمات لحالة «ليست صفحة فيديو»: الأحدث تعديلًا أولًا.
 * @template {{ updatedAt: string }} E
 * @param {E[]} entries @param {number} [limit]
 */
export const recentEntries = (entries, limit = RECENT_LIMIT) => entries.slice().sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0)).slice(0, limit);
