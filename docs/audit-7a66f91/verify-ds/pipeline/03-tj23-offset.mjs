// TJ-23 (PIPE-02) ← I10 (CLA-P-4): tOffsetMs شاذ لكلمة واحدة؛ هل تمنع الثوابت الستة ملفًا فاسد التوقيت؟ وما في العيّنة الحقيقية؟
import { ASR, ASR_DUR, mod, out } from './lib.mjs';
const { convertTrack } = await mod('core/convert/index.js');
const { buildExport } = await mod('core/export/index.js');
const { splitWords } = await mod('core/convert/text.js');
const { tryIt } = await import('./lib.mjs');
const raw = ASR();
// العيّنة: أكبر tOffsetMs مقابل مدة حدثه
let maxOff = 0; let beyond = 0;
for (const e of raw.events) for (const s of e.segs ?? []) if (Number.isFinite(s?.tOffsetMs)) { maxOff = Math.max(maxOff, s.tOffsetMs); if (Number.isFinite(e.dDurationMs) && s.tOffsetMs > e.dDurationMs) beyond++; }
out('العيّنة الحقيقية', { maxTOffsetMs: maxOff, offsetsBeyondEventDuration: beyond });
for (const off of [60000, 2000000]) {
  const d = structuredClone(raw);
  // اختيار DeepSeek نفسه: أول حدث فيه أكثر من 3 segs بعد 60 ث، والقطعة الثالثة.
  const k = d.events.findIndex((e) => Array.isArray(e.segs) && e.segs.length > 3 && e.tStartMs > 60000);
  d.events[k].segs[2].tOffsetMs = off;
  const r = convertTrack({ body: JSON.stringify(d), trackKind: 'asr', durationMs: ASR_DUR });
  const big = r.cues.reduce((m, c) => (c.text.length > m.text.length ? c : m), { text: '' });
  const cps = big.text ? Math.round(big.text.length / ((big.endMs - big.startMs) / 1000)) : null;
  const ex = r.ok ? tryIt(() => buildExport({ videoId: 'nwc-Y9rkKtK', track: { key: 'en|asr', lang: 'en', kind: 'asr', cues: r.cues }, mode: 'normal', now: '2026-11-05T00:00:00.000Z', rand: () => 0.5 })) : null;
  out(`tOffsetMs=${off}`, { ok: r.ok, invariants: r.invariants?.results.map((x) => `${x.id}:${x.ok}`).join(' '), cues: r.cues.length, clamped: r.report.converter?.clampedWordTimes, longest: { startMs: big.startMs, endMs: big.endMs, durMs: big.endMs - big.startMs, words: splitWords(big.text).length, chars: big.text.length, charsPerSec: cps }, buildExport: ex ? (ex.threw ?? 'ok') : null });
}
