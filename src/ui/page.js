// تشغيل صفحة من صفحات الإضافة: العنوان، والشريط العلوي المشترك (اختياري)، وحاوية التطبيق، وحدّ أخطاء يعرض الرمز
// والرسالة العربية بدل صفحة بيضاء، وفتح الصفحات الأخرى في تبويب. لا طلبات شبكة من الصفحات.
import { toErrorInfo } from '../core/errors/index.js';
import { pagePath } from '../core/model/ids.js';
import { alertBox, el, topbar } from './components.js';

/**
 * @param {{
 *   title: string, render: (app: HTMLElement) => void | Promise<void>, wide?: boolean,
 *   nav?: 'library' | 'settings' | 'editor' | null, doc?: Document
 * }} o nav يضيف الشريط العلوي المشترك قبل الحاوية ويميّز الصفحة الحالية.
 */
export async function startPage({ title, render, wide = false, nav = null, doc = document }) {
  doc.title = `ترجمان — ${title}`;
  const app = doc.getElementById('app') ?? doc.body.appendChild(el('main', { attrs: { id: 'app' }, doc }));
  app.classList.add('tj-container');
  if (wide) app.classList.add('tj-container--wide');
  if (nav) app.parentNode?.insertBefore(topbar({ active: nav, doc }), app);
  try {
    await render(app);
  } catch (err) {
    const info = toErrorInfo(err);
    app.append(alertBox({ tone: 'danger', title: 'تعذّر عرض الصفحة', text: `${info.message} (${info.code})`, doc }));
  }
}

/**
 * يفتح صفحة من صفحات الإضافة في تبويب جديد (لا يحتاج إذن tabs). hash يفتحها على قسم أو بحث بعينه (#q=…).
 * @param {Parameters<typeof pagePath>[0]} name @param {{ v?: string }} [params]
 * @param {{ api?: typeof chrome, hash?: string }} [o]
 */
export function openPage(name, params, { api = globalThis.chrome, hash } = {}) {
  const url = api.runtime.getURL(pagePath(name, params));
  return api.tabs.create({ url: hash ? `${url}#${hash}` : url });
}

/** @param {typeof chrome} [api] */
export const extensionVersion = (api = globalThis.chrome) => api.runtime.getManifest().version;
