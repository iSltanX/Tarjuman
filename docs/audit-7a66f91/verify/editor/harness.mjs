// حزمة تحقق مستقلة: تركيب المحرّر (7a66f91) كاملًا فوق التخزين الحقيقي بمحاكاة chrome.storage والـDOM الوهمي من
// مساعدات الاختبار في النسخة المعزولة. لا متصفح ولا شبكة. تستورد المصدر بمسارات مطلقة للقراءة فقط.
import { TJ_ROOT } from '../_root.mjs';
export const ROOT = TJ_ROOT;
export const { createStore } = await import(`${ROOT}/src/core/store/index.js`);
export const { mountEditor } = await import(`${ROOT}/src/pages/editor/app.js`);
export const { createMemoryArea } = await import(`${ROOT}/test/helpers/chrome-storage.js`);
export const { NOW, makeCues, englishTrack, fingerprint, videoRecord } = await import(`${ROOT}/test/helpers/fixtures.js`);
export const { sampleBundle, seedBundle, arabicTrack, markOn } = await import(`${ROOT}/test/helpers/fixtures-v2.js`);
export const { editorDocument, settle } = await import(`${ROOT}/test/helpers/editor-dom.js`);
export const { FakeElement, buttonNamed, textOf, findAll } = await import(`${ROOT}/test/unit/pages/library/fake-dom.js`);

/** كما في المتصفح: type يعكس السمة (الافتراضي text للـinput)، وinstanceof بحسب الوسم لا كل عنصر. */
export function browserLikeTypes(win) {
  if (!Object.getOwnPropertyDescriptor(FakeElement.prototype, 'type')) {
    Object.defineProperty(FakeElement.prototype, 'type', {
      configurable: true,
      get() { return this.getAttribute('type') ?? (this.tagName === 'input' ? 'text' : ''); },
    });
  }
  win.HTMLTextAreaElement = class { static [Symbol.hasInstance](x) { return x?.tagName === 'textarea'; } };
  win.HTMLInputElement = class { static [Symbol.hasInstance](x) { return x?.tagName === 'input'; } };
}

/** العنصر متصل بالمستند (في المتصفح يسقط التركيز إلى body إن انفصل العنصر المركّز). */
export const attached = (doc, el) => {
  for (let n = el; n; n = n.parentNode) if (n === doc.body) return true;
  return false;
};

export async function mounted({ bundle = sampleBundle(), wrap = (s) => s, area = createMemoryArea({ unlimited: true }), types = true } = {}) {
  let at = Date.parse(NOW);
  const now = () => (at += 1000);
  const store = createStore({ area, now });
  await seedBundle(store, bundle);
  const env = editorDocument({ videoId: bundle.videoId });
  if (types) browserLikeTypes(env.doc.defaultView);
  const winListeners = new Map();
  env.doc.defaultView.addEventListener = (type, fn) => winListeners.set(type, [...(winListeners.get(type) ?? []), fn]);
  const editor = await mountEditor(env.root, { videoId: bundle.videoId, store: wrap(store), doc: env.doc, now });
  await env.flush();
  const fireWin = (type) => {
    const e = { type, defaultPrevented: false, returnValue: undefined, preventDefault() { this.defaultPrevented = true; } };
    for (const fn of winListeners.get(type) ?? []) fn(e);
    return e;
  };
  const key = (target, { code = 'KeyZ', shift = false, ctrl = true } = {}) => env.fireDoc({
    type: 'keydown', code, key: code.slice(3).toLowerCase(), ctrlKey: ctrl, metaKey: false, altKey: false, shiftKey: shift, target,
  });
  const row = (i) => env.root.querySelector(`.ed-row[data-index="${i}"]`);
  const field = (i, f) => env.root.querySelector(`.ed-row[data-index="${i}"] [data-field="${f}"]`);
  return { area, store, editor, env, videoId: bundle.videoId, fireWin, now, key, row, field };
}

export const openDialogEl = (env) => env.doc.querySelector('dialog[open]');
export const log = (...a) => console.log(...a);
