// M-3: ترجمة من النموذج على عيّنة TED الحقيقية فيها دمج 10+11 وشطر 20 ثم إعادة ترقيم (العدد 427 كما هو).
import { readFileSync } from 'node:fs';
import { TJ_ROOT as T } from '../_root.mjs';
const { convertTrack } = await import(`${T}/src/core/convert/index.js`);
const { buildExport } = await import(`${T}/src/core/export/index.js`);
const { compare, trackComparison } = await import(`${T}/src/core/compare/index.js`);
const { comparisonSummary } = await import(`${T}/src/player/controls/text.js`);
const { readImport } = await import(`${T}/src/core/import/index.js`);
const { writeSrt } = await import(`${T}/src/core/srt/writer.js`);
const conv = convertTrack({ body: readFileSync(`${T}/test/fixtures/json3/manual-ted-iG9CE55wbtY.json`, 'utf8'), trackKind: 'manual', durationMs: 1203421 });
const track = { key: 'en|manual', lang: 'en', kind: 'manual', capturedAt: '2026-11-01T00:00:00.000Z', source: 'capture', cues: conv.cues };
const { fingerprint: fp } = buildExport({ videoId: 'iG9CE55wbtY', track, mode: 'normal', now: '2026-11-01T00:00:00.000Z', rand: () => 0.5 });
const base = conv.cues.map((c) => ({ n: c.n, startMs: c.startMs, endMs: c.endMs, text: `ترجمة ${c.n}` }));
const scenarios = {
  'دمج 10+11 وشطر 20 (العدد كما هو)': (() => {
    const m = { ...base[9], endMs: base[10].endMs, text: 'مدموج' };
    const s = base[19]; const mid = Math.round((s.startMs + s.endMs) / 2);
    return [...base.slice(0, 9), m, ...base.slice(11, 19), { ...s, endMs: mid, text: 'شطر أ' }, { ...s, startMs: mid, text: 'شطر ب' }, ...base.slice(20)].map((c, i) => ({ ...c, n: i + 1 }));
  })(),
  'دمج 10+11 وحده (ناقص واحد)': (() => {
    const m = { ...base[9], endMs: base[10].endMs, text: 'مدموج' };
    return [...base.slice(0, 9), m, ...base.slice(11)].map((c, i) => ({ ...c, n: i + 1 }));
  })(),
  'مطابق تمامًا': base,
};
for (const [label, cues] of Object.entries(scenarios)) {
  // مسار الاستيراد الحقيقي من ملف SRT
  const srt = writeSrt(cues);
  const file = { name: 'iG9CE55wbtY.en.manual.normal.ar.srt', size: srt.length, arrayBuffer: async () => new TextEncoder().encode(srt).buffer };
  const imp = await readImport(file, { fingerprints: [fp] });
  const stored = imp.comparison;
  const arabic = { fileName: imp.fileName, importedAt: '2026-11-01T00:00:00.000Z', original: imp.cues, current: null, editedAt: null, fingerprintId: imp.fingerprintId, comparison: stored, notes: [] };
  const now = trackComparison(arabic, [fp]);
  console.log(label, JSON.stringify({
    importReport: { matched: stored.matched, drift: stored.drift.length, missing: stored.missing.length, extra: stored.extra.length, count: `${stored.countTarget}/${stored.countSource}` },
    importBadge: comparisonSummary(stored),
    currentReport: { matched: now.matched, drift: now.drift.length, missing: now.missing.length, extra: now.extra.length },
    playerBadge: comparisonSummary(now),
  }));
}
