// ورقة أنماط بلا سمة style ولا عنصر <style> متى أمكن: CSSStyleSheet المبنية (replaceSync) لا تحكمها سياسة CSP
// للأنماط المضمنة في الصفحة. وإن لم تتوفر (متصفح قديم أو فشل) فعنصر <style> بـtextContent وحده.

/**
 * @param {{ doc: Document, win: Window }} env
 * @param {string} css
 * @returns {{ adopt: (root: Document | ShadowRoot) => 'adopted' | 'style', release: () => void }}
 */
export function createSheet({ doc, win }, css) {
  /** @type {any} */
  let sheet = null;
  /** @type {any} */
  let el = null;
  /** @type {any} */
  let target = null;
  try {
    sheet = new win.CSSStyleSheet();
    sheet.replaceSync(css);
  } catch {
    sheet = null;
  }

  return {
    adopt(root) {
      target = root;
      if (sheet && root.adoptedStyleSheets) {
        try {
          const list = Array.from(root.adoptedStyleSheets);
          if (!list.includes(sheet)) root.adoptedStyleSheets = [...list, sheet];
          return 'adopted';
        } catch {
          // يسقط إلى عنصر <style>
        }
      }
      el = doc.createElement('style');
      el.textContent = css;
      (root === doc ? doc.head ?? doc.documentElement : root).appendChild(el);
      return 'style';
    },

    release() {
      if (target && sheet) {
        try {
          target.adoptedStyleSheets = Array.from(target.adoptedStyleSheets ?? []).filter((s) => s !== sheet);
        } catch {
          // لا شيء: الصفحة قد تكون أُغلقت
        }
      }
      if (el) {
        el.remove();
        el = null;
      }
      target = null;
    },
  };
}
