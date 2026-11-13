// «اختصارات لوحة المفاتيح» في «العرض» (الفكرة ١٠، المسار ب، القرار ح-55، حُسم نيابةً عن سلطان بتفويضه): أوامر البيان الخمسة بلا مفاتيح
// مقترحة، فيربطها المستخدم بما يختاره في صفحة اختصارات متصفحه، وهذا الصف يدل عليها. في Chromium (Chrome وEdge وBrave) زر يفتحها
// بـtabs.create بلا إذن، وإن رفض المتصفح فتحها قيل ذلك وكُتب عنوانها. وFirefox لا يفتح لإضافةٍ صفحاته المميزة (about:)، فالنص يقول
// الطريق إليها. لا تخزين ولا إذن، والعنوانان عنصران ذريان معزولان LTR (ltrNodes).
import { t } from '../../i18n/index.js';
import { button, el, ltrNodes } from '../../ui/components.js';
import { ltrInline } from '../../ui/format.js';

/** صفحة اختصارات الإضافات في عائلة Chromium. والعنوان هنا وحده، باستثناء مسمّى في scripts/check-static.mjs. */
export const SHORTCUTS_URL = 'chrome://extensions/shortcuts';
/** صفحة الإضافات في Firefox، ومنها «إدارة اختصارات الإضافات». نص يُقرأ لا رابط. */
export const FIREFOX_ADDONS = 'about:addons';

/**
 * يفتح صفحة الاختصارات في تبويب جديد. يرفض إن لم تُتح الواجهة أو رفض المتصفح العنوان.
 * @param {{ create: (o: { url: string }) => Promise<unknown> } | undefined} tabs
 */
export async function openShortcuts(tabs) {
  if (typeof tabs?.create !== 'function') throw new Error('tabs.create غير متاح');
  return tabs.create({ url: SHORTCUTS_URL });
}

/**
 * @param {{ doc: Document, target: 'chromium' | 'firefox', open: () => Promise<unknown> }} o
 * @returns {{ root: HTMLElement }}
 */
export function shortcutsControl({ doc, target, open }) {
  const note = (children) => el('p', { className: 'tj-caption st-note', children, doc });
  const what = note([t('settings.shortcuts.what')]);
  if (target === 'firefox') {
    return { root: el('div', { className: 'st-shortcuts', children: [what, note(ltrNodes(t('settings.shortcuts.firefox', { url: ltrInline(FIREFOX_ADDONS) }), { doc }))], doc }) };
  }
  const failed = el('div', { className: 'st-notes', attrs: { 'aria-live': 'polite' }, doc });
  const openBtn = button({
    label: t('settings.shortcuts.open'), variant: 'secondary', icon: 'keyboard', doc,
    onClick: () => {
      // الفتح أول ما في الضغطة؛ والرفض نصٌّ بالعنوان ليُكتب في شريط العنوان.
      let pending;
      try {
        pending = Promise.resolve(open());
      } catch (err) {
        pending = Promise.reject(err);
      }
      pending.then(
        () => failed.replaceChildren(),
        () => failed.replaceChildren(note(ltrNodes(t('settings.shortcuts.openFailed', { url: ltrInline(SHORTCUTS_URL) }), { doc }))),
      );
    },
  });
  openBtn.setAttribute('data-action', 'shortcuts');
  return { root: el('div', { className: 'st-shortcuts', children: [what, el('div', { className: 'st-actions', children: [openBtn], doc }), failed], doc }) };
}
