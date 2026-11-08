// قراءة ملف مستورد (R12): الحجم يُفحص قبل القراءة وبعدها، والترميز UTF-8 بتحقق صارم لا تخمين (Windows-1256 وUTF-16
// يُرفضان برسالة تقول ما يُفعل)، والبايت NUL يعني ملفًا ثنائيًا. الـBOM يبقى في النص ليتعامل معه المحلّل.
import { TjError } from '../errors/index.js';
import { t } from '../../i18n/index.js';

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_FILES = 50;

const tooLarge = () => new TjError('IM_FILE_TOO_LARGE', { params: { max: t('common.bytes.mb', { n: MAX_FILE_BYTES / (1024 * 1024) }) } });

/**
 * UTF-16 بلا BOM يُفك UTF-8 «صالحًا» فيه NUL: الأرقام والفواصل والمسافات وأسطر SRT بايتات ASCII يليها صفر (أو يسبقها)، والعربية
 * فوق 0x80 بلا صفر. فالأصفار كلها في المواضع الفردية (LE) أو الزوجية (BE) وبنسبة ملموسة منها، والملف الثنائي أصفاره في
 * الجهتين (تدقيق 7a66f91، U38).
 * @param {Uint8Array} bytes
 */
function looksUtf16(bytes) {
  let even = 0;
  let odd = 0;
  for (let i = 0; i < bytes.length; i++) if (bytes[i] === 0) i % 2 ? odd++ : even++;
  const enough = (zeros) => zeros >= 2 && zeros >= (bytes.length / 2) * 0.2;
  return (enough(odd) && even === 0) || (enough(even) && odd === 0);
}

/**
 * @param {{ arrayBuffer: () => Promise<ArrayBuffer>, size?: number }} file كائن File من منتقي الملفات
 * @returns {Promise<string>}
 * @throws {TjError} IM_READ_FAILED أو IM_FILE_TOO_LARGE أو IM_NOT_UTF8 أو IM_NOT_TEXT
 */
export async function readFileText(file) {
  if (!file || typeof file.arrayBuffer !== 'function') throw new TjError('IM_READ_FAILED');
  if (typeof file.size === 'number' && file.size > MAX_FILE_BYTES) throw tooLarge();
  let buffer;
  try {
    buffer = await file.arrayBuffer();
  } catch (cause) {
    throw new TjError('IM_READ_FAILED', { cause });
  }
  if (buffer.byteLength > MAX_FILE_BYTES) throw tooLarge();
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer);
  } catch (cause) {
    throw new TjError('IM_NOT_UTF8', { cause });
  }
  if (text.includes('\u0000')) throw new TjError(looksUtf16(new Uint8Array(buffer)) ? 'IM_NOT_UTF8' : 'IM_NOT_TEXT');
  return text;
}
