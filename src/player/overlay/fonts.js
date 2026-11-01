// خطوط الترجمة فوق الفيديو (R41، عقد interfaces §٣ و§٩، متابعة P5 في P6): تُحمَّل من ملفات الإضافة وحدها
// (ui/fonts/subtitle المعلنة في web_accessible_resources) عبر FontFace ببياناتها لا برابطها، فلا تحكمها سياسة الخطوط
// في صفحة يوتيوب ولا يُطلب نطاق خارجي. الخط يُحمَّل مرة لكل مستند عند أول حاجة إليه. وإن تعذّر المختار فالمراعي
// المضمّن، ثم خط النظام العربي (سلسلة font-family نفسها تتكفل بالعرض)، برمز في التشخيص ودون رسالة فوق الفيديو.
import { SUBTITLE_FONT_LIST, subtitleFont } from '../../ui/subtitle-fonts.js';

export const FONT_WEIGHTS = Object.freeze(['400', '700']);
const BASE = SUBTITLE_FONT_LIST[0];

/**
 * يقرأ ملف خط من حزمة الإضافة نفسها (chrome-extension://): ليس طلب شبكة، والمسار من subtitle-fonts وحده.
 * @param {string} path مثل ui/fonts/subtitle/almarai-700.woff2
 * @param {{ getURL: (p: string) => string }} [runtime]
 * @returns {Promise<ArrayBuffer>}
 */
export async function readPackagedFont(path, runtime = globalThis.chrome?.runtime) {
  if (!runtime || typeof runtime.getURL !== 'function') throw new Error('runtime.getURL غير متاح');
  const res = await fetch(runtime.getURL(path));
  if (!res.ok) throw new Error(`status ${res.status}`);
  return res.arrayBuffer();
}

/**
 * @param {{
 *   doc: Document, win: Window,
 *   read?: (path: string) => Promise<ArrayBuffer>,
 * }} env read للاختبار (افتراضيه readPackagedFont)
 */
export function createFontLoader({ doc, win, read = readPackagedFont }) {
  /** @type {Map<string, Promise<boolean>>} */
  const loads = new Map();
  const status = {
    requested: /** @type {string | null} */ (null),
    active: /** @type {string | null} */ (null),
    code: /** @type {string | null} */ (null),
    loaded: /** @type {string[]} */ ([]),
    failed: /** @type {string[]} */ ([]),
    lastDetail: /** @type {string | null} */ (null),
  };

  /** وزنا العائلة معًا: لا يُضاف وزن دون الآخر. @param {import('../../ui/subtitle-fonts.js').SubtitleFont} font */
  function loadFamily(font) {
    if (loads.has(font.id)) return loads.get(font.id);
    const p = (async () => {
      const FF = win.FontFace ?? globalThis.FontFace;
      const set = doc.fonts;
      if (typeof FF !== 'function' || !set || typeof set.add !== 'function') throw new Error('FontFace غير متاح');
      const faces = await Promise.all(FONT_WEIGHTS.map(async (weight) => {
        const face = new FF(font.family, await read(font.files[weight]), { weight, style: 'normal', display: 'swap' });
        await face.load();
        return face;
      }));
      for (const face of faces) set.add(face);
    })().then(
      () => {
        status.loaded.push(font.id);
        status.failed = status.failed.filter((x) => x !== font.id);
        return true;
      },
      (err) => {
        if (!status.failed.includes(font.id)) status.failed.push(font.id);
        status.lastDetail = (err instanceof Error ? `${err.name}: ${err.message}` : String(err)).slice(0, 200);
        // إخفاق عابر لا يُحفظ: الطلب التالي للخط (تغيير الإعداد أو جلسة جديدة) يعيد المحاولة.
        loads.delete(font.id);
        return false;
      },
    );
    loads.set(font.id, p);
    return p;
  }

  return {
    /**
     * يحمّل الخط المختار والمراعي المضمّن (خط السطر الإنجليزي والبديل الأول)، ويسجّل ما يُعرض فعلًا.
     * لا يرمي أبدًا. @param {string} id
     */
    async ensure(id) {
      const font = subtitleFont(id);
      status.requested = font.id;
      const [ok, base] = await Promise.all([loadFamily(font), loadFamily(BASE)]);
      if (status.requested !== font.id) return { ...status };
      if (ok) {
        status.active = font.id;
        status.code = null;
      } else if (font.id !== BASE.id && base) {
        status.active = BASE.id;
        status.code = 'CT_FONT_FALLBACK';
      } else {
        status.active = 'system';
        status.code = 'CT_FONT_SYSTEM';
      }
      return { ...status };
    },

    /** رموز وأعداد فقط (R36). */
    diagnostics: () => ({ ...status, loaded: [...status.loaded], failed: [...status.failed] }),
  };
}
