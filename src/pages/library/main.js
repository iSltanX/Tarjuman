// المحفوظات (P7 ثم P13): تركيب الصفحة في المتصفح وحده: التخزين الحقيقي، وفتح التبويبات بـchrome.tabs.create (لا يحتاج
// إذن tabs)، والحفظ عبر saveFile (يتبع مكان الحفظ المختار)، والحافظة بضغطة المستخدم، ومنتقي الملفات. المنطق كله في
// view.js وexpand.js وthumb.js وupload.js وstudy.js وdelete.js وactions.js وmodel.js.
import { buildTarget, needsConsent, thumbnailsConsent, watchThumbnailsConsent } from '../../core/consent/thumbnails.js';
import { saveFile } from '../../core/save/index.js';
import { createStore } from '../../core/store/index.js';
import { extensionVersion, openPage, startPage } from '../../ui/page.js';
import { collectDiagnostics } from '../settings/diagnostics.js';
import { createLibrary } from './view.js';

/** منتقي ملفات SRT (أو أجزاؤها): يُنشأ ويُنقر داخل ضغطة المستخدم، ويعيد null عند الإلغاء. */
function pickFiles(doc = document) {
  return new Promise((resolve) => {
    const input = doc.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.srt,.txt,.md,text/plain,text/markdown,application/x-subrip';
    input.addEventListener('change', () => resolve(input.files && input.files.length ? Array.from(input.files) : null), { once: true });
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}

startPage({
  title: 'المحفوظات',
  wide: true,
  nav: 'library',
  async render(app) {
    const store = createStore();
    const target = buildTarget();
    const lib = createLibrary({
      store,
      openTab: (url) => chrome.tabs.create({ url }),
      openPage,
      saveFile: (file) => saveFile(file, { store }),
      clipboardWrite: (text) => navigator.clipboard.writeText(text),
      pickFiles: () => pickFiles(),
      diagnosticsText: () => collectDiagnostics({ store, version: extensionVersion() }),
      // صور المحفوظات في Firefox بموافقة «نشاط التصفح» (core/consent/thumbnails.js) تُقرأ وتُراقَب؛ وفي Chromium بلا مدخل («نعم»).
      ...(needsConsent(target) ? {
        thumbsConsent: () => thumbnailsConsent(chrome, target),
        thumbsConsentWatch: (fn) => watchThumbnailsConsent(chrome, target, fn),
      } : {}),
    });
    app.append(lib.root);
    await lib.load();
  },
});
