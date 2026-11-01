// تشغيل صفحة من صفحات الإضافة: العنوان، وحاوية التطبيق، وحدّ أخطاء يعرض الرمز والرسالة العربية بدل
// صفحة بيضاء، وفتح الصفحات الأخرى في تبويب. لا طلبات شبكة من الصفحات.
import { toErrorInfo } from '../core/errors/index.js';
import { pagePath } from '../core/model/ids.js';
import { alertBox, el } from './components.js';

/**
 * @param {{ title: string, render: (app: HTMLElement) => void | Promise<void>, wide?: boolean, doc?: Document }} o
 */
export async function startPage({ title, render, wide = false, doc = document }) {
  doc.title = `ترجمان — ${title}`;
  const app = doc.getElementById('app') ?? doc.body.appendChild(el('main', { attrs: { id: 'app' }, doc }));
  app.classList.add('tj-container');
  if (wide) app.classList.add('tj-container--wide');
  try {
    await render(app);
  } catch (err) {
    const info = toErrorInfo(err);
    app.append(alertBox({ tone: 'danger', title: 'تعذّر عرض الصفحة', text: `${info.message} (${info.code})`, doc }));
  }
}

/**
 * يفتح صفحة من صفحات الإضافة في تبويب جديد (لا يحتاج إذن tabs).
 * @param {Parameters<typeof pagePath>[0]} name @param {{ v?: string }} [params]
 * @param {typeof chrome} [api]
 */
export function openPage(name, params, api = globalThis.chrome) {
  return api.tabs.create({ url: api.runtime.getURL(pagePath(name, params)) });
}

/** @param {typeof chrome} [api] */
export const extensionVersion = (api = globalThis.chrome) => api.runtime.getManifest().version;
