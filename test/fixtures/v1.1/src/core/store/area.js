// محوّل chrome.storage.local: الموضع الوحيد في الإضافة الذي يلمس chrome.storage (فحص ثابت).
// الواجهة نفسها تنفّذها محاكاة الاختبار (test/helpers/chrome-storage.js).

/**
 * @typedef {{
 *   get: (keys: string | string[] | null) => Promise<Record<string, unknown>>,
 *   set: (items: Record<string, unknown>) => Promise<void>,
 *   remove: (keys: string | string[]) => Promise<void>,
 *   clear: () => Promise<void>,
 *   getKeys: () => Promise<string[]>,
 *   getBytesInUse: (keys: string | string[] | null) => Promise<number>,
 *   onChanged: (fn: (changes: Record<string, { oldValue?: unknown, newValue?: unknown }>) => void) => () => void,
 *   quotaBytes: number,
 *   unlimited: boolean
 * }} StorageArea
 */

/**
 * @param {typeof chrome} [api]
 * @returns {StorageArea}
 */
export function chromeLocalArea(api = globalThis.chrome) {
  const local = api.storage.local;
  const permissions = api.runtime.getManifest().permissions ?? [];
  return {
    get: (keys) => local.get(keys),
    set: (items) => local.set(items),
    remove: (keys) => local.remove(keys),
    clear: () => local.clear(),
    // getKeys منذ Chrome وEdge ‏130 وFirefox ‏143، والحدان الأدنيان 130 و144 (تدقيق 7a66f91، U83)؛ فالبديل (قراءة القيم كلها
    // والاكتفاء بمفاتيحها) لا يُبلغ في إصدار يقبله البيان، ويبقى احتياطًا.
    getKeys: async () => (typeof local.getKeys === 'function' ? local.getKeys() : Object.keys(await local.get(null))),
    getBytesInUse: (keys) => local.getBytesInUse(keys),
    onChanged(fn) {
      const handler = (changes, areaName) => {
        if (areaName === 'local') fn(changes);
      };
      api.storage.onChanged.addListener(handler);
      return () => api.storage.onChanged.removeListener(handler);
    },
    quotaBytes: local.QUOTA_BYTES ?? 10485760,
    unlimited: permissions.includes('unlimitedStorage'),
  };
}
