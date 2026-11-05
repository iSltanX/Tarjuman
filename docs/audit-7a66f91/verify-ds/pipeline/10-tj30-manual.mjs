// TJ-30 (PIPE-09) قرب U36 (GEM-009): حدثان يدويان بالبداية نفسها ومدتين مختلفتين، بالترتيبين.
import { TED, TED_DUR, mod, out } from './lib.mjs';
const { convertTrack } = await mod('core/convert/index.js');
const { convertManual } = await mod('core/convert/manual.js');
const raw = TED();
const text = raw.events.filter((e) => Array.isArray(e.segs) && e.segs.map((s) => s.utf8 ?? '').join('').trim());
let equal = 0; let overlap = 0;
for (let i = 1; i < text.length; i++) { if (text[i].tStartMs === text[i - 1].tStartMs) equal++; if (text[i].tStartMs < text[i - 1].tStartMs + (text[i - 1].dDurationMs ?? 0)) overlap++; }
out('عيّنة TED الحقيقية', { textEvents: text.length, equalStarts: equal, overlappingPairs: overlap });
const ev = (startMs, durationMs, t) => ({ startMs, durationMs, endMs: startMs + durationMs, text: t });
const nxt = ev(84000, 2000, 'NEXT');
out('أ. الطويل أولًا (3958) ثم القصير (500)', convertManual([ev(79119, 3958, 'FIRST long'), ev(79119, 500, '- second speaker'), nxt]).cues);
out('ب. القصير أولًا (500) ثم الطويل (3958)', convertManual([ev(79119, 500, '- second speaker'), ev(79119, 3958, 'FIRST long'), nxt]).cues);
out('ج. U36: قصير 80ms ثم فجوة 25ث', convertManual([ev(1000, 80, 'Yes.'), ev(26000, 2000, 'Welcome back.'), ev(30000, 1000, 'NEXT')]).cues);
// عبر المسار الكامل على العيّنة (حالة DeepSeek: نسخة من الحدث 20 بمدة 500 بعده)
{
  const d = structuredClone(raw); const e = structuredClone(d.events[20]); e.segs = [{ utf8: '- second speaker' }]; e.dDurationMs = 500; d.events.splice(21, 0, e);
  const r = convertTrack({ body: JSON.stringify(d), trackKind: 'manual', durationMs: TED_DUR });
  const c = r.cues.find((x) => x.text.includes('second speaker'));
  out('د. على العيّنة (DeepSeek)', { ok: r.ok, cue: c, original20: { start: raw.events[20].tStartMs, dur: raw.events[20].dDurationMs }, report: r.report.converter });
}
