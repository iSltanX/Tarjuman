// جسر MAIN → ISOLATED باتجاه واحد. يتحقق من المصدر والأصل ومن بنية الرسالة، ولا يرسل شيئًا إلى الصفحة.
import { validateCaptureMessage } from '../extract/message.js';

/**
 * @param {(msg: import('../extract/message.js').CaptureMessage) => void} onCapture
 * @param {Window} [win]
 * @returns {() => void} إلغاء الاستماع
 */
export function installBridge(onCapture, win = window) {
  const handler = (event) => {
    if (event.source !== win || event.origin !== win.location.origin) return;
    const msg = validateCaptureMessage(event.data);
    if (msg) onCapture(msg);
  };
  win.addEventListener('message', handler);
  return () => win.removeEventListener('message', handler);
}
