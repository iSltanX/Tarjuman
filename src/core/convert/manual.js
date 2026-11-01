// محوّل المسارات اليدوية (تقرير كلود §٤.٢): كل حدث مقطع كما هو. التداخل يُقصّ نهاية الأول إلى
// بداية الثاني، فإن صارت مدته أقل من MIN_MS دُمج نصه في التالي بسطر جديد. لا يُحذف أي نص.
import { cleanCueText } from './text.js';

const MIN_MS = 100;
const LAST_FALLBACK_MS = 2000;

/**
 * @param {import('./json3.js').TextEvent[]} events مرتبة ومنزوعة التكرار الحرفي
 * @returns {{ cues: { startMs: number, endMs: number, text: string }[], report: object }}
 */
export function convertManual(events) {
  const report = { trimmed: 0, merged: 0, filledEnds: 0 };
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
      carry = null;
    }
    const next = draft[i + 1];
    if (next && c.endMs > next.startMs) {
      c.endMs = next.startMs;
      report.trimmed++;
    }
    if (next && c.endMs - c.startMs < MIN_MS) {
      carry = c;
      report.merged++;
      continue;
    }
    if (!next && c.endMs <= c.startMs) {
      c.endMs = c.startMs + LAST_FALLBACK_MS;
      report.filledEnds++;
    }
    cues.push(c);
  }
  return { cues, report };
}
