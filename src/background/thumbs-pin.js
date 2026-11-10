// و2 (2026-11-10): صور المحفوظات مطفأة حتى تُفعَّل (DEFAULT_PREFS.ui.thumbnails = false). التفضيلات تُكتب كاملة عند أي تغيير، فمن
// غيّر أي تفضيل من قبل فقيمة الصور عنده صريحة ولا يمسها الافتراضي الجديد. أما من لم تُكتب تفضيلاته قط (الصور عنده ظاهرة بالافتراضي
// القديم)، فتُثبَّت حاله صراحةً عند الترقية من إصدار أقدم من 2.2.0 وحدها (previousVersion)، فلا تنطفئ صوره بالترقية. ومن ثبّت 2.2.0
// أو أحدث لا يُثبَّت له شيء في أي تحديث لاحق: صوره مطفأة حتى يفعّلها (المراجعة المستقلة للمرحلة 7). في Chromium وحده: في Firefox
// كانت مطفأة حتى الموافقة أصلًا. والتثبيت الجديد يبدأ بالافتراضي الجديد. لا يُرفع مخطط التخزين.
// حدّان مقبولان: القراءة ثم الكتابة خطوتان (تغيير المستخدم المفتاح بينهما، في أجزاء من الثانية بعد الترقية، يُكتب فوقه)؛ والفشل
// لا يُعاد ولا يُسجَّل (لا تسجيل في الإضافة)، فتظهر الصور مطفأة بسطر المحفوظات الذي يدل على المفتاح.
import { KEY_PREFS } from '../core/store/keys.js';

/** أول إصدار صارت فيه الصور مطفأة افتراضيًا: الترقية مما قبله وحدها تُثبِّت. */
export const THUMBS_OFF_SINCE = '2.2.0';

/** هل الإصدار أقدم من آخر؟ إصدارات أرقام مفصولة بنقاط؛ وما لا يُقرأ ⇒ null. @param {unknown} a @param {string} b */
export function olderThan(a, b) {
  const parse = (v) => (typeof v === 'string' && /^\d+(?:\.\d+){0,3}$/.test(v) ? v.split('.').map(Number) : null);
  const x = parse(a);
  const y = parse(b);
  if (!x || !y) return null;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d < 0;
  }
  return false;
}

/**
 * @param {{ runtime: { onInstalled: { addListener: (fn: (d: { reason?: string, previousVersion?: string }) => void) => void } },
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
    if (olderThan(details.previousVersion, THUMBS_OFF_SINCE) !== true) return;
    pin().catch(() => {});
  });
  return { pin };
}
