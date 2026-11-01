// محلّل SRT صارم لمخرجات ترجمان نفسها (الثابت السادس). المحلّل المتسامح للملفات المستوردة شأن P4.
import { parseSrtTime } from './time.js';

export class SrtParseError extends Error {
  /**
   * @param {string} message
   * @param {number} block رقم الكتلة (من 1)
   */
  constructor(message, block) {
    super(`الكتلة ${block}: ${message}`);
    this.name = 'SrtParseError';
    this.block = block;
  }
}

/**
 * يقبل LF وCRLF فقط، ويرفض الـBOM والترقيم غير المتسلسل والأزمنة غير الصارمة والكتل الفارغة.
 * @param {string} text
 * @returns {{ n: number, startMs: number, endMs: number, text: string }[]}
 */
export function parseSrtStrict(text) {
  if (typeof text !== 'string') throw new SrtParseError('المدخل ليس نصًا', 0);
  if (text.charCodeAt(0) === 0xfeff) throw new SrtParseError('الملف يبدأ بـBOM', 0);
  const body = text.replace(/\r\n/g, '\n');
  if (body === '') return [];
  if (!body.endsWith('\n')) throw new SrtParseError('الملف لا ينتهي بسطر جديد', 0);
  const blocks = body.slice(0, -1).split('\n\n');
  return blocks.map((block, i) => {
    const n = i + 1;
    const lines = block.split('\n');
    if (lines.length < 3) throw new SrtParseError('كتلة ناقصة (رقم وزمن ونص)', n);
    if (lines[0] !== String(n)) throw new SrtParseError(`الترقيم «${lines[0]}» والمتوقع ${n}`, n);
    const parts = lines[1].split(' --> ');
    if (parts.length !== 2) throw new SrtParseError('سطر الزمن غير صالح', n);
    const startMs = parseSrtTime(parts[0]);
    const endMs = parseSrtTime(parts[1]);
    if (startMs === null || endMs === null) throw new SrtParseError('زمن غير صالح', n);
    const textLines = lines.slice(2);
    if (textLines.some((l) => l.trim() === '')) throw new SrtParseError('سطر نص فارغ', n);
    return { n, startMs, endMs, text: textLines.join('\n') };
  });
}
