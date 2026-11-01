// الثوابت الستة (تقرير كلود §٤.٣). تُشغَّل على كل تحويل، وفشل أي منها يمنع التصدير.
import { splitWords } from './text.js';
import { writeSrt } from '../srt/writer.js';
import { parseSrtStrict } from '../srt/parser.js';

const DURATION_SLACK_MS = 2000;

/**
 * @param {{
 *   sourceWords: string[],
 *   cues: { startMs: number, endMs: number, text: string }[],
 *   durationMs?: number | null,
 * }} input
 * @returns {{ ok: boolean, results: { id: number, key: string, ok: boolean, detail: string }[], srt: string | null }}
 */
export function checkInvariants({ sourceWords, cues, durationMs = null }) {
  const results = [];
  const add = (id, key, ok, detail) => results.push({ id, key, ok, detail });

  // ١. تطابق الكلمات: لا إسقاط ولا إضافة ولا إفساد للترتيب.
  const out = cues.flatMap((c) => splitWords(c.text));
  const src = sourceWords.map((w) => w.normalize('NFC'));
  let mismatch = -1;
  const len = Math.max(src.length, out.length);
  for (let i = 0; i < len; i++) {
    if (src[i] !== out[i]) {
      mismatch = i;
      break;
    }
  }
  add(1, 'words', mismatch === -1,
    mismatch === -1 ? `${src.length} كلمة متطابقة` : `أول اختلاف عند الكلمة ${mismatch} (المصدر ${src.length}، الناتج ${out.length})`);

  // ٢. لا تداخل: start < end ≤ next.start.
  const overlap = cues.findIndex((c, i) => !(c.startMs < c.endMs) || (i + 1 < cues.length && c.endMs > cues[i + 1].startMs));
  add(2, 'noOverlap', overlap === -1, overlap === -1 ? 'لا تداخل' : `المقطع ${overlap + 1}`);

  // ٣. لا مقاطع فارغة.
  const empty = cues.findIndex((c) => String(c.text).trim() === '');
  add(3, 'noEmpty', empty === -1 && cues.length > 0, cues.length === 0 ? 'لا مقاطع' : empty === -1 ? 'لا مقاطع فارغة' : `المقطع ${empty + 1}`);

  // ٤. رتابة أزمنة البداية.
  const mono = cues.findIndex((c, i) => i > 0 && c.startMs <= cues[i - 1].startMs);
  add(4, 'monotonic', mono === -1, mono === -1 ? 'متزايدة' : `المقطع ${mono + 1}`);

  // ٥. الحدود: start ≥ 0، وآخر end ≤ المدة + 2s (إن عُرفت المدة).
  const first = cues[0];
  const last = cues[cues.length - 1];
  const startOk = !first || first.startMs >= 0;
  const known = Number.isFinite(durationMs) && durationMs > 0;
  const endOk = !last || !known || last.endMs <= durationMs + DURATION_SLACK_MS;
  add(5, 'bounds', startOk && endOk,
    `${startOk ? 'البداية ≥ 0' : 'بداية سالبة'} · ${known ? (endOk ? 'النهاية ضمن المدة' : `آخر نهاية ${last.endMs} > ${durationMs}+2000`) : 'المدة غير معروفة: فُحصت البداية فقط'}`);

  // ٦. إعادة التحليل تعطي العدد والنص والأزمنة نفسها.
  let srt = null;
  let reparseOk = false;
  let reparseDetail = '';
  try {
    srt = writeSrt(cues);
    const back = parseSrtStrict(srt);
    const diff = back.length !== cues.length ? -2
      : back.findIndex((b, i) => b.text !== cues[i].text || b.startMs !== cues[i].startMs || b.endMs !== cues[i].endMs);
    reparseOk = diff === -1;
    reparseDetail = diff === -1 ? `${back.length} مقطعًا` : diff === -2 ? `العدد ${back.length} والمتوقع ${cues.length}` : `المقطع ${diff + 1}`;
  } catch (err) {
    reparseDetail = err.message;
  }
  add(6, 'reparse', reparseOk, reparseDetail);

  return { ok: results.every((r) => r.ok), results, srt: reparseOk ? srt : null };
}
