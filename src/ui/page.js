// تشغيل صفحة من صفحات الإضافة: لغة الواجهة قبل أي عرض، والعنوان، والشريط العلوي المشترك (اختياري)، وحاوية التطبيق، وحدّ أخطاء يعرض الرمز
// والرسالة بدل صفحة بيضاء، وفتح الصفحات الأخرى في تبويب. لا طلبات شبكة من الصفحات.
import { toErrorInfo } from '../core/errors/index.js';
import { pagePath } from '../core/model/ids.js';
import { createStore } from '../core/store/index.js';
import { t } from '../i18n/index.js';
import { alertBox, el, topbar } from './components.js';
import { applyDocumentLocale, bootLocale, watchLocale } from './locale.js';
import { normalizeUiLocale } from '../core/model/ui-locale.js';
import { onPageReleased, pageHeld } from './page-hold.js';

const KEPT = 'tjKept';

/**
 * يحفظ ما سيضيع بإعادة تحميل تبديل اللغة في حالة السجل (تبقى عند reload، ولا تخزين): نص الحقول المعلَّمة data-tj-keep والتركيز والتمرير.
 * @param {Document} doc
 */
function keepForReload(doc) {
  const win = doc.defaultView;
  if (!win?.history?.replaceState) return;
  const fields = {};
  for (const n of doc.querySelectorAll('[data-tj-keep]')) {
    if ('value' in n && n.type !== 'radio' && n.type !== 'checkbox' && n.value) fields[n.getAttribute('data-tj-keep')] = n.value;
  }
  const focus = doc.activeElement?.closest?.('[data-tj-keep]')?.getAttribute('data-tj-keep') ?? null;
  win.history.replaceState({ ...(win.history.state ?? {}), [KEPT]: { fields, focus, scroll: win.scrollY ?? 0 } }, '');
}

/** يعيد ما حفظته keepForReload بعد اكتمال العرض، مرة واحدة. @param {Document} doc */
function restoreKept(doc) {
  const win = doc.defaultView;
  const kept = win?.history?.state?.[KEPT];
  if (!kept) return;
  const { [KEPT]: _used, ...rest } = win.history.state;
  win.history.replaceState(rest, '');
  for (const n of doc.querySelectorAll('[data-tj-keep]')) {
    const v = kept.fields[n.getAttribute('data-tj-keep')];
    if (v === undefined || !('value' in n)) continue;
    n.value = v;
    n.dispatchEvent(new win.Event('input', { bubbles: true }));
  }
  if (kept.focus) {
    const node = doc.querySelector(`[data-tj-keep="${kept.focus}"]`);
    (node?.matches?.('input, textarea, select, button') ? node : node?.querySelector?.('input:checked, input, button') ?? node)?.focus?.();
  }
  win.scrollTo?.(0, kept.scroll);
}

/**
 * @param {{
 *   title: string | (() => string), render: (app: HTMLElement, page: { relocalize: (() => void) | null }) => void | Promise<void>, wide?: boolean,
 *   nav?: 'library' | 'settings' | 'editor' | null, doc?: Document,
 *   store?: { getUiLocale: () => Promise<unknown>, initUiLocale: (s: object) => Promise<unknown>, onChange: (fn: Function) => () => void } | null,
 *   reload?: () => void,
 * }} o nav يضيف الشريط العلوي المشترك قبل الحاوية ويميّز الصفحة الحالية. title يُحسب بعد تحديد اللغة. page.relocalize: تبديل لغة في مكانه
 *   لصفحة لها ما يضيع بإعادة التحميل (المحرّر)؛ وبدونه تعيد الصفحة تحميل نفسها، فمصدر كل نص هو مسار العرض الأول نفسه.
 */
export async function startPage({ title, render, wide = false, nav = null, doc = document, store, reload }) {
  let localeStore = store;
  if (localeStore === undefined) {
    try {
      localeStore = createStore();
    } catch {
      localeStore = null; // خارج سياق الإضافة: تبقى اللغة المرجعية.
    }
  }
  if (localeStore) await bootLocale({ store: localeStore });
  applyDocumentLocale(doc);
  const titleText = () => t('common.page.title', { page: typeof title === 'function' ? title() : title });
  doc.title = titleText();
  const app = doc.getElementById('app') ?? doc.body.appendChild(el('main', { attrs: { id: 'app' }, doc }));
  app.classList.add('tj-container');
  if (wide) app.classList.add('tj-container--wide');
  const bar = nav ? topbar({ active: nav, doc }) : null;
  if (bar) app.parentNode?.insertBefore(bar, app);
  const page = { relocalize: /** @type {(() => void) | null} */ (null) };
  /** حقل يكتب فيه المستخدم ولا تحفظه keepForReload (مقدار لم يُثبَّت، أو اسم يُعاد تسميته): تُنتظر مغادرته قبل إعادة التحميل. */
  const typing = () => {
    const a = doc.activeElement;
    return !!a && /^(input|textarea)$/i.test(a.tagName ?? '') && !/^(radio|checkbox|range|button|submit|file)$/i.test(a.type ?? '') && !a.closest?.('[data-tj-keep]');
  };
  /** @type {ReturnType<typeof watchLocale> | null} */
  let watcher = null;
  if (localeStore) {
    watcher = watchLocale(localeStore, () => {
      applyDocumentLocale(doc);
      if (page.relocalize) {
        doc.title = titleText();
        page.relocalize();
        return;
      }
      keepForReload(doc);
      (reload ?? (() => doc.defaultView?.location.reload()))();
    }, { held: () => pageHeld() || (!page.relocalize && typing()) });
    onPageReleased(() => watcher.flush());
    doc.documentElement?.addEventListener?.('focusout', () => { setTimeout(() => watcher.flush(), 0); });
  }
  try {
    await render(app, page);
    restoreKept(doc);
    // تغيّر وصل بين قراءة اللغة قبل العرض والاشتراك في أحداثها.
    if (watcher) {
      const latest = normalizeUiLocale(await localeStore.getUiLocale().catch(() => null));
      if (latest) watcher.offer(latest.locale);
    }
  } catch (err) {
    const info = toErrorInfo(err);
    app.append(alertBox({ tone: 'danger', title: t('common.page.renderFailed'), text: `${info.message} (${info.code})`, doc }));
  }
}

/**
 * يفتح صفحة من صفحات الإضافة في تبويب جديد (لا يحتاج إذن tabs). hash يفتحها على قسم أو بحث بعينه (#q=…).
 * @param {Parameters<typeof pagePath>[0]} name @param {Parameters<typeof pagePath>[1]} [params]
 * @param {{ api?: typeof chrome, hash?: string }} [o]
 */
export function openPage(name, params, { api = globalThis.chrome, hash } = {}) {
  const url = api.runtime.getURL(pagePath(name, params));
  return api.tabs.create({ url: hash ? `${url}#${hash}` : url });
}

/** @param {typeof chrome} [api] */
export const extensionVersion = (api = globalThis.chrome) => api.runtime.getManifest().version;
