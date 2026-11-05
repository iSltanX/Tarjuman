// DS-S2 (§٩ البند 2) قرب U29 (CLA-M-3): تقرير معاينة الرفع (readImport بالرقم) مقابل التقرير الحاضر بالمحاذاة،
// ومعه بند FINDINGS §٥-٣ (ملف الاستكمال يُدرج المقطع برقم البصمة في ترجمة أُعيد ترقيمها).
import { TED, TED_DUR, mod, out, fileOf } from './lib.mjs';
const { convertTrack } = await mod('core/convert/index.js');
const { buildExport } = await mod('core/export/index.js');
const { currentComparison } = await mod('core/compare/index.js');
const { readImport, readPatch, applyPatch } = await mod('core/import/index.js');
const { writeSrt } = await mod('core/srt/writer.js');
const { comparisonSummary } = await mod('pages/library/model.js');
const VID = 'iG9CE55wbtY';
const conv = convertTrack({ body: JSON.stringify(TED()), trackKind: 'manual', durationMs: TED_DUR });
const track = { key: 'en|manual', lang: 'en', kind: 'manual', capturedAt: '2026-11-05T00:00:00.000Z', source: 'capture', cues: conv.cues };
const { fingerprint: fp } = buildExport({ videoId: VID, track, mode: 'normal', now: '2026-11-05T00:00:00.000Z', rand: () => 0.5 });
const base = conv.cues.map((c) => ({ n: c.n, startMs: c.startMs, endMs: c.endMs, text: `ترجمة ${c.n}` }));
const brief = (r) => ({ matched: r.matched, missing: r.missing.slice(0, 5), missingCount: r.missing.length, extra: r.extra.slice(0, 5), drift: r.drift.length, numbering: r.numbering });
const scen = {
  'حذف المقطع 4 ثم إعادة الترقيم': base.filter((c) => c.n !== 4).map((c, i) => ({ ...c, n: i + 1 })),
  'U29: دمج 10+11 وشطر 20 (العدد كما هو)': (() => {
    const m = { ...base[9], endMs: base[10].endMs, text: 'مدموج' }; const s = base[19]; const mid = Math.round((s.startMs + s.endMs) / 2);
    return [...base.slice(0, 9), m, ...base.slice(11, 19), { ...s, endMs: mid, text: 'شطر أ' }, { ...s, startMs: mid, text: 'شطر ب' }, ...base.slice(20)].map((c, i) => ({ ...c, n: i + 1 }));
  })(),
};
for (const [label, cues] of Object.entries(scen)) {
  const imp = await readImport(fileOf(writeSrt(cues), `${VID}.ar.srt`), { fingerprints: [fp] });
  const cur = currentComparison(imp.cues, fp);
  out(label, { previewNow_readImport: brief(imp.comparison), previewText: comparisonSummary(imp.comparison).lines, afterSave_currentComparison: brief(cur), ifPreviewUsedCurrent: comparisonSummary(cur).lines });
}
// FINDINGS §٥-٣: ملف الاستكمال للمقطع 4 على الترجمة المعاد ترقيمها.
{
  const cues = scen['حذف المقطع 4 ثم إعادة الترقيم'];
  const c4 = base[3];
  const { formatSrtTime } = await mod('core/srt/time.js');
  const text = `4\n${formatSrtTime(c4.startMs)} --> ${formatSrtTime(c4.endMs)}\nترجمة 4 المستكملة\n`;
  const read = await readPatch(fileOf(text, `${VID}.ar.manual.normal.patch.srt`), { fingerprint: fp, cues });
  if (!read.ok) { out('readPatch', read.error); } else {
    const after = applyPatch(cues, read.plan);
    const fours = after.map((c, i) => [i, c.n, c.startMs, c.text]).filter((x) => x[1] === 4);
    const cur = currentComparison(after, fp);
    const before = currentComparison(cues, fp);
    out('ملف الاستكمال على ترجمة أُعيد ترقيمها', { count: after.length, cuesNumbered4: fours, currentBefore: brief(before), badgeBefore: comparisonSummary(before).lines, currentAfter: brief(cur), badgeAfter: comparisonSummary(cur).lines });
  }
}
