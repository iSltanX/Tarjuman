// قراءة ملف مستورد (R12): الحجم يُفحص قبل القراءة وبعدها، والترميز UTF-8 بتحقق صارم لا تخمين (Windows-1256 وUTF-16
// يُرفضان برسالة تقول ما يُفعل)، والبايت NUL يعني ملفًا ثنائيًا. الـBOM يبقى في النص ليتعامل معه المحلّل.
import { TjError } from '../errors/index.js';

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_FILES = 50;

const tooLarge = () => new TjError('IM_FILE_TOO_LARGE', { params: { max: `${MAX_FILE_BYTES / (1024 * 1024)} م.ب` } });

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
  if (text.includes('\u0000')) throw new TjError('IM_NOT_TEXT');
  return text;
}
