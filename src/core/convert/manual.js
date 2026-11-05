// محوّل المسارات اليدوية (تقرير كلود §٤.٢): كل حدث مقطع كما هو. التداخل يُقصّ نهاية الأول إلى
// بداية الثاني، فإن صارت مدته أقل من MIN_MS دُمج نصه في التالي بسطر جديد. لا يُحذف أي نص.
// الدمج لما قُصّ وحده، أو لما يبدأ تاليه خلال MIN_MS؛ والمقطع القصير بلا تداخل تُمد نهايته إلى MIN_MS ولا يُدمج عبر
// فجوة. والمدموج ينتهي بأطول النهايتين، فلا يتوقف الناتج على ترتيب حدثين يبدآن معًا (تدقيق 7a66f91، U36 وU81).
import { cleanCueText } from './text.js';

const MIN_MS = 100;
const LAST_FALLBACK_MS = 2000;

/**
 * @param {import('./json3.js').TextEvent[]} events مرتبة ومنزوعة التكرار الحرفي
 * @returns {{ cues: { startMs: number, endMs: number, text: string }[], report: object }}
 */
export function convertManual(events) {
  const report = { trimmed: 0, merged: 0, filledEnds: 0, extended: 0 };
  const draft = events.map((e) => ({ startMs: e.startMs, endMs: e.endMs, text: cleanCueText(e.text) }))
    .filter((c) => c.text !== '');
  draft.forEach((c, i) => {
    if (c.endMs === null) {
      c.endMs = i + 1 < draft.length ? draft[i + 1].startMs : c.startMs + LAST_FALLBACK_MS;
      report.filledEnds++;
    }
  });
  const cues = [];
  let carry = null;
  for (let i = 0; i < draft.length; i++) {
    const c = { ...draft[i] };
    if (carry) {
      c.text = `${carry.text}\n${c.text}`;
      c.startMs = carry.startMs;
      c.endMs = Math.max(carry.endMs, c.endMs);
      carry = null;
    }
    const next = draft[i + 1];
    const endBefore = c.endMs;
    let cut = false;
    if (next && c.endMs > next.startMs) {
      c.endMs = next.startMs;
      report.trimmed++;
      cut = true;
    }
    if (next && c.endMs - c.startMs < MIN_MS) {
      if (cut || next.startMs - c.startMs < MIN_MS) {
        // يُحمل بنهايته قبل القص، فيأخذ المدموج أطول النهايتين.
        carry = { ...c, endMs: endBefore };
        report.merged++;
        continue;
      }
      c.endMs = c.startMs + MIN_MS;
      report.extended++;
    }
    if (!next && c.endMs <= c.startMs) {
      c.endMs = c.startMs + LAST_FALLBACK_MS;
      report.filledEnds++;
    }
    cues.push(c);
  }
  return { cues, report };
}
