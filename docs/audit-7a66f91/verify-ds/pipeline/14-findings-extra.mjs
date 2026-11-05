// اقتراحات FINDINGS §٧ غير المنقولة إلى التقرير: (1) تقريب normalizeOffset، و(2) planArabicExport يرمي، و(3) نص المحرّر يتغير بعد الذهاب والإياب.
import { mod, out, fileOf, tryIt } from './lib.mjs';
const { normalizeOffset } = await mod('core/model/timing.js');
const { planArabicExport } = await mod('core/edit/export.js');
const { findIssues } = await mod('core/edit/issues.js');
const { readImport } = await mod('core/import/index.js');
out('(1) normalizeOffset', Object.fromEntries([50, -50, 150, -150, 250, -250, 49, -51].map((v) => [v, normalizeOffset(v)])));
const cues = [{ n: 1, startMs: 1000, endMs: 2000, text: 'أ' }, { n: 2, startMs: 3000, endMs: 4000, text: 'ب' }];
for (const off of [undefined, Number.NaN, 0.5, 100]) {
  const r = tryIt(() => planArabicExport({ videoId: 'iG9CE55wbtY', cues, offsetMs: off }));
  out(`(2) planArabicExport offsetMs=${off}`, r.threw ?? (r.value.ok ? 'ok' : r.value.code));
}
for (const [label, text] of [['مسافات طرفية', '  مرحبًا  '], ['وسم مائل', '<i>مرحبًا</i>'], ['تجاوز اتجاه U+202E', '‮مرحبًا'], ['وسم حرفي <script>', '<script>x</script> مرحبًا']]) {
  const c = [{ n: 1, startMs: 1000, endMs: 2000, text }];
  const issues = findIssues(c).list.map((i) => i.code);
  const plan = planArabicExport({ videoId: 'iG9CE55wbtY', cues: c, offsetMs: 0 });
  const back = plan.ok ? await readImport(fileOf(plan.text)) : null;
  out(`(3) ${label}`, { issues, export: plan.ok ? 'ok' : plan.code, same: back?.ok ? back.cues[0].text === text : null, back: back?.ok ? JSON.stringify(back.cues[0].text) : back?.error?.code, notes: back?.notes?.length, warnings: back?.warnings?.map((w) => w.code) });
}
