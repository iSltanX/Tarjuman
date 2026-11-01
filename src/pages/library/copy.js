// آلة حالة زر «نسخ» (R40، P7-AC6/AC7): عادي ← «تم النسخ» لثانيتين ثم عادي، أو ← «أعد المحاولة» عند فشل الحافظة.
// النص يُبنى عند الضغطة وحدها ويُسلَّم إلى `write` ثم يُنسى: لا يُحفظ في حالة الزر ولا في DOM ولا في أي سجل،
// ولا يُعرض في أي حال حتى عند الفشل. الكتابة بضغطة المستخدم وحدها (لا نسخ تلقائي).
import { toErrorInfo } from '../../core/errors/index.js';

export const COPY_SUCCESS_MS = 2000;

/**
 * @param {{
 *   buildText: () => string,
 *   write: (text: string) => Promise<void>,
 *   announce: (code: 'PG_COPY_DONE' | 'PG_COPY_FAILED' | 'PG_COPY_BAD_ID') => void,
 *   onState: (state: 'idle' | 'success' | 'error') => void,
 *   setTimer?: (fn: () => void, ms: number) => unknown,
 *   clearTimer?: (id: unknown) => void,
 * }} deps
 * @returns {{ copy: () => Promise<'success' | 'error'>, state: () => 'idle' | 'success' | 'error', dispose: () => void }}
 */
export function createCopyState({ buildText, write, announce, onState, setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id) }) {
  let state = 'idle';
  let timer = null;
  const set = (next) => {
    state = next;
    onState(next);
  };
  const cancelTimer = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };

  return {
    state: () => state,
    dispose: cancelTimer,
    async copy() {
      cancelTimer();
      try {
        // بناء النص يرمي لمعرّف غير صالح؛ والكتابة تُستدعى بضغطة المستخدم نفسها.
        await write(buildText());
      } catch (err) {
        set('error');
        announce(toErrorInfo(err).code === 'TJ_BAD_VIDEO_ID' ? 'PG_COPY_BAD_ID' : 'PG_COPY_FAILED');
        return 'error';
      }
      // ضغطة ثانية بدأت قبل انتهاء هذه قد تكون وضعت مؤقتها: يُلغى ليبقى «تم النسخ» ثانيتين من آخر نسخ.
      cancelTimer();
      set('success');
      announce('PG_COPY_DONE');
      timer = setTimer(() => {
        timer = null;
        set('idle');
      }, COPY_SUCCESS_MS);
      return 'success';
    },
  };
}
