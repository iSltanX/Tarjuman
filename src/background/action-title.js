// تلميح أيقونة الإضافة في شريط المتصفح: يتبع لغة الواجهة المحفوظة. العامل يقرأ ولا يهيّئ أبدًا: لو حسم هو عند التثبيت لضاعت إشارة لغة
// يوتيوب على أول واجهة تُفتح.
import { setLocale, t } from '../i18n/index.js';
import { normalizeUiLocale } from '../core/model/ui-locale.js';

/**
 * @param {{ store: { getUiLocale: () => Promise<unknown>, onChange: (fn: (c: { uiLocale?: { newValue: unknown } | null }) => void) => () => void },
 *   action?: { setTitle?: (d: { title: string }) => unknown } }} o
 * @returns {{ ready: Promise<void>, dispose: () => void }}
 */
export function installActionTitle({ store, action }) {
  const apply = (raw) => {
    const rec = normalizeUiLocale(raw);
    if (!rec) return;
    setLocale(rec.locale);
    try {
      Promise.resolve(action?.setTitle?.({ title: t('common.productName') })).catch(() => {});
    } catch {
      // العامل يُغلق: التلميح يعود عند التشغيل التالي.
    }
  };
  const ready = Promise.resolve().then(() => store.getUiLocale()).then(apply, () => {});
  const dispose = store.onChange((change) => {
    if (change.uiLocale) apply(change.uiLocale.newValue);
  });
  return { ready, dispose };
}
