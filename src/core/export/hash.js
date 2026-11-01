// بصمة النص (Fingerprint.textHash، عقد data-model §٤): FNV-1a بـ64 بتًا على UTF-8، موسومة «fnv1a64:<hex>».
// ليست تشفيرًا ولا حماية؛ تكفي لتمييز نص الملف المصدَّر عن غيره بسرعة ودون مكتبة. تُحسب على نص المقاطع
// مطبّعًا (NFC، والمسافات والأسطر داخل المقطع مسافة واحدة) ومفصولًا بين المقاطع بسطر فارغ، فلا تغيّرها
// إعادة لفّ الأسطر.
import { normalizeSpace } from '../convert/text.js';

const OFFSET = 0xcbf29ce484222325n;
const PRIME = 0x100000001b3n;
const MASK = 0xffffffffffffffffn;

/** @param {string} text @returns {string} 16 خانة سداسية عشرية */
export function fnv1a64(text) {
  let h = OFFSET;
  for (const byte of new TextEncoder().encode(String(text))) {
    h ^= BigInt(byte);
    h = (h * PRIME) & MASK;
  }
  return h.toString(16).padStart(16, '0');
}

/** @param {{ text: string }[]} cues */
export const textHash = (cues) => `fnv1a64:${fnv1a64(cues.map((c) => normalizeSpace(c.text)).join('\n\n'))}`;
