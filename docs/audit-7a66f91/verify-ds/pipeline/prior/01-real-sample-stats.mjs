// إحصاءات العيّنتين الحقيقيتين (قراءة فقط): أزمنة سالبة/كسرية/صفرية، وتداخل الأحداث، وتكرار الذيل والصدر.
import { readFileSync } from 'node:fs';
import { TJ_ROOT as T } from '../../../verify/_root.mjs';
const { parseJson3, dedupeExact, sortEvents } = await import(`${T}/src/core/convert/json3.js`);
const { splitWords } = await import(`${T}/src/core/convert/text.js`);
for (const f of ['manual-ted-iG9CE55wbtY.json', 'asr-nwc-Y9rkKtK1b44.json']) {
  const body = readFileSync(`${T}/test/fixtures/json3/${f}`, 'utf8');
  const raw = JSON.parse(body);
  const s = { events: raw.events.length, negOffset: 0, fracStart: 0, fracDur: 0, fracOffset: 0, zeroDur: 0, missingDur: 0,
    minOffset: Infinity, maxOffset: -Infinity, offsetBeyondDur: 0, durMin: Infinity, durMax: -Infinity, segsNonObj: 0, firstStart: null };
  for (const e of raw.events) {
    if (s.firstStart === null && Array.isArray(e.segs)) s.firstStart = e.tStartMs;
    if (!Number.isInteger(e.tStartMs)) s.fracStart++;
    if (e.dDurationMs === undefined) s.missingDur++;
    else { if (!Number.isInteger(e.dDurationMs)) s.fracDur++; if (e.dDurationMs === 0) s.zeroDur++; s.durMin = Math.min(s.durMin, e.dDurationMs); s.durMax = Math.max(s.durMax, e.dDurationMs); }
    for (const g of e.segs ?? []) {
      if (!g || typeof g !== 'object') s.segsNonObj++;
      if (g && 'tOffsetMs' in g) {
        if (g.tOffsetMs < 0) s.negOffset++;
        if (!Number.isInteger(g.tOffsetMs)) s.fracOffset++;
        s.minOffset = Math.min(s.minOffset, g.tOffsetMs); s.maxOffset = Math.max(s.maxOffset, g.tOffsetMs);
        if (e.dDurationMs !== undefined && g.tOffsetMs > e.dDurationMs) s.offsetBeyondDur++;
      }
    }
  }
  const { events } = parseJson3(body);
  const sorted = sortEvents(dedupeExact(events).events).events;
  let overlapPairs = 0; const tailRep = { 1: 0, 2: 0, 3: 0 };
  let shortManual = 0, shortManualDetail = [];
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1], b = sorted[i];
    const aEnd = a.endMs ?? a.startMs;
    if (b.startMs < aEnd) {
      overlapPairs++;
      const aw = splitWords(a.text), bw = splitWords(b.text);
      for (const k of [1, 2, 3]) if (aw.length >= k && bw.length >= k && aw.slice(-k).join(' ') === bw.slice(0, k).join(' ')) tailRep[k]++;
    }
  }
  for (const e of sorted) if (e.durationMs !== null && e.durationMs < 100) { shortManual++; if (shortManualDetail.length < 5) shortManualDetail.push([e.startMs, e.durationMs, e.text.slice(0, 30)]); }
  // متوسط مدة الأحداث النصية
  const durs = sorted.map((e) => e.durationMs).filter((d) => d !== null).sort((x, y) => x - y);
  console.log(f, JSON.stringify({ ...s, textEvents: sorted.length, overlapPairs, pairs: sorted.length - 1, tailRepeatOnOverlap: tailRep,
    textEventsUnder100ms: shortManual, shortManualDetail, medianTextDur: durs[durs.length >> 1] }));
}
