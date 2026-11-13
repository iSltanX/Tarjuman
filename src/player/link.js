// صلة لوحة النص المتزامن بزرها في شريط المشغّل داخل سكربت المحتوى (حزمة واحدة وعالم معزول واحد). الحالة نفسها (اللوحة
// مفتوحة أو مغلقة، وزرها ظاهر أو مخفي) في التفضيلات المحفوظة prefs.ui يقرؤها الطرفان من المتحكم؛ والصلة للتركيز: زر
// الشريط يطلب التركيز داخل اللوحة حين يفتحها بلوحة المفاتيح، واللوحة تعيده إلى الزر حين تُغلق وفيها التركيز. ولرمز تعذّر ظهور
// اللوحة (ع-ل): تضعه اللوحة حين يغيب عمود يوتيوب بعد المهلة، فيقول زرها في الشريط السبب. لا DOM هنا.

/** مهلة طلب التركيز: إن لم تظهر اللوحة خلالها (فشل الحفظ مثلًا) سقط الطلب، فلا تخطف التركيز في فتح لاحق. */
export const FOCUS_REQUEST_MS = 3000;

/** @param {{ now?: () => number }} [deps] */
export function createPanelLink({ now = () => Date.now() } = {}) {
  /** @type {(() => void) | null} */
  let button = null;
  let requested = 0;
  /** @type {string | null} */
  let issue = null;
  return {
    /** ع-ل: رمز يمنع ظهور اللوحة الآن (PL_COLUMN_NOT_FOUND)، أو null حين تعافت. @param {string | null} code */
    setPanelIssue(code) {
      issue = typeof code === 'string' ? code : null;
    },
    /** @returns {string | null} */
    panelIssue: () => issue,
    /**
     * يسجّل الشريط دالة تركيز زر اللوحة، ويعيد ما يلغي التسجيل (ولا يلغي تسجيل جلسة أحدث).
     * @param {() => void} focus
     */
    register(focus) {
      button = focus;
      return () => {
        if (button === focus) button = null;
      };
    },
    /** @returns {boolean} هل وُجد الزر فرُكّز. */
    focusButton() {
      if (!button) return false;
      button();
      return true;
    },
    requestPanelFocus() {
      requested = now();
    },
    /** @returns {boolean} طلبٌ قائم لم تنقضِ مهلته (ويُستهلك). */
    takePanelFocus() {
      const live = requested > 0 && now() - requested <= FOCUS_REQUEST_MS;
      requested = 0;
      return live;
    },
  };
}

/** الصلة المشتركة في سكربت المحتوى (الاختبارات تمرّر صلتها). */
export const panelLink = createPanelLink();
