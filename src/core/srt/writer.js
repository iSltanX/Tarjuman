// كاتب SRT: ترقيم من 1، وأزمنة HH:MM:SS,mmm، ونهاية أسطر LF، وUTF-8 بلا BOM (الـBOM لا يُكتب أصلًا).
import { formatSrtTime } from './time.js';

/** @typedef {{ n?: number, startMs: number, endMs: number, text: string }} Cue */

/**
 * يكتب المقاطع كما هي دون أي تعديل للتوقيت أو النص، ويرفض ما لا يمكن تمثيله في SRT.
 * @param {Cue[]} cues
 * @returns {string}
 */
export function writeSrt(cues) {
  const blocks = cues.map((cue, i) => {
    const lines = String(cue.text).split('\n');
    if (lines.some((l) => l.trim() === '')) {
      throw new Error(`المقطع ${i + 1} فيه سطر فارغ، وهو يقطع الكتلة في SRT`);
    }
    return `${i + 1}\n${formatSrtTime(cue.startMs)} --> ${formatSrtTime(cue.endMs)}\n${lines.join('\n')}\n`;
  });
  return blocks.join('\n');
}
