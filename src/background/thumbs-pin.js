// و2 (2026-11-10): صور المحفوظات مطفأة حتى تُفعَّل (DEFAULT_PREFS.ui.thumbnails = false). التفضيلات تُكتب كاملة عند أي تغيير، فمن
// غيّر أي تفضيل من قبل فقيمة الصور عنده صريحة ولا يمسها الافتراضي الجديد. أما من لم تُكتب تفضيلاته قط (الصور عنده ظاهرة بالافتراضي
// القديم)، فتُثبَّت حاله صراحةً عند حدث التحديث، فلا تنطفئ صوره بالترقية. في Chromium وحده: في Firefox كانت مطفأة حتى الموافقة أصلًا.
// والتثبيت الجديد يبدأ بالافتراضي الجديد. لا يُرفع مخطط التخزين.
import { KEY_PREFS } from '../core/store/keys.js';

/**
 * @param {{ runtime: { onInstalled: { addListener: (fn: (d: { reason?: string }) => void) => void } },
 *   area: { get: (keys: string[]) => Promise<Record<string, unknown>> },
 *   store: { setPrefs: (patch: object) => Promise<unknown> }, target: 'chromium' | 'firefox' }} deps
 * @returns {{ pin: () => Promise<'explicit' | 'pinned'> }}
 */
export function installThumbsPin({ runtime, area, store, target }) {
  async function pin() {
    const raw = (await area.get([KEY_PREFS]))?.[KEY_PREFS];
    if (raw && typeof raw === 'object' && typeof raw.ui?.thumbnails === 'boolean') return 'explicit';
    await store.setPrefs({ ui: { thumbnails: true } });
    return 'pinned';
  }
  // يُسجَّل في أول تنفيذ متزامن للعامل (Manifest V3).
  runtime.onInstalled?.addListener((details) => {
    if (details?.reason !== 'update' || target !== 'chromium') return;
    pin().catch(() => {});
  });
  return { pin };
}
