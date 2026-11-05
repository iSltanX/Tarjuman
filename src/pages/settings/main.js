// الإعدادات (P7 ثم P13): تركيب الصفحة في المتصفح وحده: التخزين الحقيقي والحافظة بضغطة المستخدم وإصدار البيان، والحفظ
// عبر saveFile (يتبع مكان الحفظ المختار)، والمكان الفعلي لآخر ملف من سجل المتصفح وحده، ومنتقي ملف النسخة الاحتياطية.
// المنطق كله في view.js وmodel.js وdata.js وglossary.js وlocation.js وdiagnostics.js. خطوط المعاينة من ملفات الإضافة.
import { buildTarget, needsConsent, requestThumbnailsConsent, thumbnailsConsent, watchThumbnailsConsent } from '../../core/consent/thumbnails.js';
import { saveFile, savedPath } from '../../core/save/index.js';
import { createStore } from '../../core/store/index.js';
import { extensionVersion, startPage } from '../../ui/page.js';
import { collectDiagnostics } from './diagnostics.js';
import { createSettings } from './view.js';

/** منتقي ملف JSON واحد: يُنشأ ويُنقر داخل ضغطة المستخدم، ويعيد null عند الإلغاء. */
function pickFile(doc = document) {
  return new Promise((resolve) => {
    const input = doc.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', () => resolve(input.files && input.files.length ? input.files[0] : null), { once: true });
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}

startPage({
  title: 'الإعدادات',
  nav: 'settings',
  wide: true,
  async render(app) {
    const store = createStore();
    const version = extensionVersion();
    const target = buildTarget();
    const settings = createSettings({
      store, version,
      clipboardWrite: (text) => navigator.clipboard.writeText(text),
      diagnosticsText: () => collectDiagnostics({ store, version }),
      saveFile: (file) => saveFile(file, { store }),
      savedPath: (id) => savedPath(id),
      pickFile: () => pickFile(),
      // صور المحفوظات في Firefox بموافقة «نشاط التصفح» (core/consent/thumbnails.js)؛ وفي Chromium بالمفتاح وحده.
      thumbsConsent: {
        needed: needsConsent(target),
        check: () => thumbnailsConsent(chrome, target),
        request: () => requestThumbnailsConsent(chrome, target),
        watch: (fn) => watchThumbnailsConsent(chrome, target, fn),
      },
    });
    app.append(settings.root);
    await settings.load();
  },
});
