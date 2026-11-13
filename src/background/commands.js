// اختصارات لوحة المفاتيح الاختيارية (الفكرة ١٠، المسار ب، القرار ح-55، حُسم نيابةً عن سلطان بتفويضه؛ عقد messages §٩): أوامر البيان
// بلا مفاتيح مقترحة، فلا يصل حدثها إلا بعد أن يربطها المستخدم في صفحة اختصارات متصفحه. العامل يسمع commands.onCommand ويرسل اسم
// الأمر وحده إلى سكربت ترجمان في التبويب النشط (tj:command)، ولا منطق منتج هنا: الفعل كله في جلسة الشريط.
// والتبويب من وسيط الحدث (Chrome، وFirefox منذ 126 والحد الأدنى 144)، وإلا التبويب النشط في النافذة الحالية؛ وكلاهما بلا إذن tabs
// (المعرّف يصل بلا العنوان). فلا يُعرف هنا إن كان التبويب يوتيوب: تبويب بلا سكربت ترجمان (موقع آخر، أو صفحة فُتحت قبل تثبيت الإضافة
// أو تحديثها) يرفض الإرسال، فيُبتلع بصمت، إذ لا موضع يُعرض فيه شيء بلا إذن جديد.
import { commandRequest, isCommandName } from '../core/model/messages.js';

/** معرّف تبويب صالح، أو null (ومنه TAB_ID_NONE = -1). @param {{ id?: unknown } | null | undefined} tab */
const tabIdOf = (tab) => (Number.isInteger(tab?.id) && tab.id >= 0 ? tab.id : null);

/**
 * @param {{ commands?: { onCommand?: { addListener: Function, removeListener?: Function } }, tabs?: { query: Function, sendMessage: Function } }} api
 * @returns {{ handle: (name: unknown, tab?: { id?: unknown } | null) => Promise<unknown>, dispose: () => void }}
 *   handle للاختبار: يعيد رد سكربت المحتوى، أو null حين لا يُرسل شيء أو لا يصل.
 */
export function installCommands({ commands, tabs } = {}) {
  async function target(tab) {
    const id = tabIdOf(tab);
    if (id !== null) return id;
    try {
      const [active] = await tabs.query({ active: true, currentWindow: true });
      return tabIdOf(active);
    } catch {
      return null;
    }
  }

  async function handle(name, tab) {
    if (!isCommandName(name) || typeof tabs?.sendMessage !== 'function') return null;
    const id = await target(tab);
    if (id === null) return null;
    try {
      return await tabs.sendMessage(id, commandRequest(name));
    } catch {
      return null;
    }
  }

  // لا يعيد المستمع وعدًا: handle لا يرفض أبدًا.
  const listener = (name, tab) => {
    handle(name, tab);
  };
  const event = commands?.onCommand;
  if (typeof event?.addListener !== 'function') return { handle, dispose: () => {} };
  event.addListener(listener);
  return { handle, dispose: () => event.removeListener?.(listener) };
}
