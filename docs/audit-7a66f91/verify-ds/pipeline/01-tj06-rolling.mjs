// TJ-06 (PIPE-01) ← U28: كاشف الصيغة المتدحرجة على عيّنة ASR الحقيقية، ثم تكرار كلامي مصطنع عند حد حدثين.
import { ASR, ASR_DUR, mod, out } from './lib.mjs';
const { convertTrack } = await mod('core/convert/index.js');
const { parseJson3, dedupeExact, sortEvents } = await mod('core/convert/json3.js');
const { detectRollingOverlap } = await mod('core/convert/asr.js');
const { splitWords } = await mod('core/convert/text.js');

const raw = ASR();
const evs = sortEvents(dedupeExact(parseJson3(JSON.stringify(raw)).events).events).events;
let overl = 0; const rep = { 1: 0, 2: 0, 3: 0 };
let maxWords = 0; let maxChars = 0;
for (let i = 0; i < evs.length; i++) {
  const w = splitWords(evs[i].text).length; maxWords = Math.max(maxWords, w); maxChars = Math.max(maxChars, evs[i].text.length);
  if (!i) continue;
  const a = evs[i - 1]; const b = evs[i];
  if (!(b.startMs < (a.endMs ?? a.startMs))) continue;
  overl++;
  const aw = splitWords(a.text); const bw = splitWords(b.text);
  for (const k of [1, 2, 3]) if (aw.length >= k && bw.length >= k && aw.slice(-k).join(' ') === bw.slice(0, k).join(' ')) rep[k]++;
}
out('عيّنة ASR الحقيقية', { textEvents: evs.length, pairs: evs.length - 1, overlappingPairs: overl, tailHeadRepeat: rep, maxWordsPerEvent: maxWords, maxCharsPerEvent: maxChars, detector: detectRollingOverlap(evs, 3) });
const base = convertTrack({ body: JSON.stringify(raw), trackKind: 'asr', durationMs: ASR_DUR });
out('الأساس', { ok: base.ok, cues: base.cues.length });

// حقن تكرار كلامي: آخر ثلاث كلمات الحدث A «no no no» وأول ثلاث في التالي B «no no no»، وأزمنة B بعد أزمنة A (تكرار حقيقي).
function inject(textA, textB) {
  const d = structuredClone(raw);
  const idx = d.events.findIndex((e, i) => i > 50 && Array.isArray(e.segs) && e.segs.length >= 4 && !e.aAppend);
  const nxt = d.events.findIndex((e, i) => i > idx && Array.isArray(e.segs) && e.segs.map((s) => s.utf8 ?? '').join('').trim());
  const a = d.events[idx]; const b = d.events[nxt];
  const lastOff = a.segs.at(-1).tOffsetMs ?? 0;
  a.segs.splice(-textA.length, textA.length, ...textA.map((w, k) => ({ utf8: ` ${w}`, tOffsetMs: lastOff + 100 * k })));
  b.segs.splice(0, textB.length, ...textB.map((w, k) => (k === 0 ? { utf8: w } : { utf8: ` ${w}`, tOffsetMs: 150 * k })));
  const aWordTimes = textA.map((_, k) => a.tStartMs + lastOff + 100 * k);
  const bWordTimes = textB.map((_, k) => b.tStartMs + 150 * k);
  const r = convertTrack({ body: JSON.stringify(d), trackKind: 'asr', durationMs: ASR_DUR });
  return { ok: r.ok, code: r.code, cues: r.cues.length, detail: r.report.errorDetail, overlapMs: a.tStartMs + a.dDurationMs - b.tStartMs, aWordTimes, bWordTimes, bAfterA: Math.min(...bWordTimes) > Math.max(...aWordTimes) };
}
out('«no no no | no no no»', inject(['no', 'no', 'no'], ['no', 'no', 'no']));
out('«I don\'t know | I don\'t know»', inject(['I', "don't", 'know'], ['I', "don't", 'know']));
out('«ha ha | ha ha» (كلمتان)', inject(['ha', 'ha'], ['ha', 'ha']));
// صيغة متدحرجة فعلية (#1318): كل حدث يعيد سطر سابقه كاملًا بأزمنة أقدم أو مساوية
{
  const events = [];
  const lines = ['the quick brown fox', 'jumps over the lazy', 'dog and then it', 'runs far away now'];
  for (let i = 0; i < lines.length; i++) {
    const prev = i ? lines[i - 1] : null;
    const txt = prev ? `${prev}\n${lines[i]}` : lines[i];
    events.push({ tStartMs: i * 2000, dDurationMs: 4000, segs: [{ utf8: txt, tOffsetMs: 0, acAsrConf: 1 }] });
  }
  const r = convertTrack({ body: JSON.stringify({ events }), trackKind: 'asr', durationMs: 20000 });
  out('صيغة متدحرجة مصطنعة', { ok: r.ok, code: r.code, detail: r.report.errorDetail });
}
