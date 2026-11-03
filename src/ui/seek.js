// القفز من صفحات الإضافة إلى زمن في الفيديو (عقد interfaces §١٤، R56، Q14) بلا إذن tabs ولا host_permissions:
// تبويب الفيديو المفتوح يُعرف بسؤال كل تبويب عن حالته (يرد سكربت ترجمان في تبويبات يوتيوب وحدها بمعرّف فيديوه)، لا
// بقراءة عنوانه. فإن وُجد جُلب إلى الأمام وأُرسل إليه tj:seek، وإلا فُتح تبويب جديد عند الزمن.
import { watchUrl } from '../core/model/ids.js';
import { isSeekReply, isVideoStateReply, seekRequest, videoStateRequest } from '../core/model/messages.js';

export const ASK_TIMEOUT_MS = 800;
export const MAX_TABS = 200;

const withTimeout = (promise, ms) => new Promise((resolve) => {
  const timer = setTimeout(() => resolve(null), ms);
  Promise.resolve(promise).then((v) => { clearTimeout(timer); resolve(v); }, () => { clearTimeout(timer); resolve(null); });
});

/**
 * التبويبات التي تعرض الفيديو المطلوب الآن، الأحدث استعمالًا أولًا ثم النشط.
 * @param {string} videoId
 * @param {{ tabs: typeof chrome.tabs, timeoutMs?: number }} deps
 */
export async function findVideoTabs(videoId, { tabs, timeoutMs = ASK_TIMEOUT_MS }) {
  const all = (await tabs.query({})).filter((t) => Number.isInteger(t.id)).slice(0, MAX_TABS);
  const replies = await Promise.all(all.map((t) => withTimeout(tabs.sendMessage(t.id, videoStateRequest()), timeoutMs)));
  return all
    .filter((t, i) => isVideoStateReply(replies[i]) && replies[i].videoId === videoId)
    .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0) || Number(b.active) - Number(a.active));
}

/**
 * @param {{ videoId: string, ms: number }} target
 * @param {{ tabs?: typeof chrome.tabs, windows?: typeof chrome.windows, timeoutMs?: number }} [deps]
 * @returns {Promise<{ ok: true, via: 'open' | 'new', tabId: number } | { ok: false, code: string }>}
 */
export async function jumpToVideo({ videoId, ms }, { tabs = globalThis.chrome?.tabs, windows = globalThis.chrome?.windows, timeoutMs = ASK_TIMEOUT_MS } = {}) {
  let url;
  try {
    url = watchUrl(videoId, { atMs: ms });
  } catch {
    return { ok: false, code: 'TJ_BAD_VIDEO_ID' };
  }
  try {
    const [tab] = await findVideoTabs(videoId, { tabs, timeoutMs });
    if (tab) {
      await tabs.update(tab.id, { active: true });
      if (windows && Number.isInteger(tab.windowId)) await windows.update(tab.windowId, { focused: true }).catch(() => {});
      const reply = await withTimeout(tabs.sendMessage(tab.id, seekRequest(videoId, ms)), timeoutMs * 2);
      if (!isSeekReply(reply)) return { ok: false, code: 'TJ_SEEK_FAILED' };
      return reply.ok ? { ok: true, via: 'open', tabId: tab.id } : { ok: false, code: reply.code };
    }
    const created = await tabs.create({ url });
    return { ok: true, via: 'new', tabId: created?.id ?? -1 };
  } catch {
    return { ok: false, code: 'TJ_SEEK_FAILED' };
  }
}

/**
 * فتح الفيديو بلا قفز زمني (حالة المحرّر الفارغة): تبويبه المفتوح يُجلب إلى الأمام كما هو دون أن يُمسّ موضع تشغيله، وإلا فُتح
 * تبويب جديد في أوله. لا رسالة tj:seek.
 * @param {string} videoId
 * @param {{ tabs?: typeof chrome.tabs, windows?: typeof chrome.windows, timeoutMs?: number }} [deps]
 * @returns {Promise<{ ok: true, via: 'open' | 'new', tabId: number } | { ok: false, code: string }>}
 */
export async function openVideo(videoId, { tabs = globalThis.chrome?.tabs, windows = globalThis.chrome?.windows, timeoutMs = ASK_TIMEOUT_MS } = {}) {
  let url;
  try {
    url = watchUrl(videoId);
  } catch {
    return { ok: false, code: 'TJ_BAD_VIDEO_ID' };
  }
  try {
    const [tab] = await findVideoTabs(videoId, { tabs, timeoutMs });
    if (tab) {
      await tabs.update(tab.id, { active: true });
      if (windows && Number.isInteger(tab.windowId)) await windows.update(tab.windowId, { focused: true }).catch(() => {});
      return { ok: true, via: 'open', tabId: tab.id };
    }
    const created = await tabs.create({ url });
    return { ok: true, via: 'new', tabId: created?.id ?? -1 };
  } catch {
    return { ok: false, code: 'PG_OPEN_FAILED' };
  }
}

