// TJ-24 (PIPE-03 أ) ← U35 + جديد: الكاتب والثابت السادس لا يمنعان سطر نص شبيهًا برأس مقطع.
import { TED, TED_DUR, mod, out, fileOf, tryIt } from './lib.mjs';
const { planArabicExport } = await mod('core/edit/export.js');
const { findIssues } = await mod('core/edit/issues.js');
const { readImport } = await mod('core/import/index.js');
const { parseSrtLenient } = await mod('core/srt/lenient.js');
const { parseSrtStrict } = await mod('core/srt/parser.js');
const { convertTrack } = await mod('core/convert/index.js');
const { buildExport } = await mod('core/export/index.js');
const VID = 'iG9CE55wbtY';
const two = (t1) => [
  { n: 1, startMs: 1000, endMs: 2000, text: t1 },
  { n: 2, startMs: 3000, endMs: 4000, text: 'المقطع الثاني' },
];
for (const [label, t1] of [
  ['أ. رقم ثم سطر زمن داخل نص مقطع', 'انسخ هذا:\n2\n00:00:05,000 --> 00:00:06,000\nنص مدسوس'],
  ['ب. سطر «1 --> 2» داخل نص مقطع', 'الخطوة\n1 --> 2'],
  ['ج. سطر زمن كامل بلا رقم قبله', 'قال:\n00:00:05,000 --> 00:00:06,000'],
]) {
  const cues = two(t1);
  const issues = findIssues(cues);
  const plan = planArabicExport({ videoId: VID, cues, offsetMs: 0 });
  const strict = plan.ok ? tryIt(() => parseSrtStrict(plan.text).length) : null;
  const back = plan.ok ? await readImport(fileOf(plan.text, plan.name)) : null;
  out(label, {
    issues: issues.list.map((i) => i.code), export: plan.ok ? 'ok' : plan.code, strictReparseCount: strict?.value ?? strict?.threw,
    reimport: back ? (back.ok ? { ok: true, count: back.cues.length, numbers: back.cues.map((c) => c.n), texts: back.cues.map((c) => c.text), warnings: back.warnings.map((w) => w.code) } : back.error) : null,
  });
}
// د. الإنجليزي: حدث يدوي في json3 نصه فيه رقم ثم سطر زمن.
{
  const d = TED();
  d.events[10].segs = [{ utf8: 'line one\n12\n00:00:01,000 --> 00:00:02,000' }];
  const r = convertTrack({ body: JSON.stringify(d), trackKind: 'manual', durationMs: TED_DUR });
  const ex = buildExport({ videoId: VID, track: { key: 'en|manual', lang: 'en', kind: 'manual', cues: r.cues }, mode: 'normal', now: '2026-11-05T00:00:00.000Z', rand: () => 0.5 });
  const lenient = tryIt(() => parseSrtLenient(ex.files[0].text).cues.length);
  out('د. إنجليزي من json3 بسطر رقم ثم زمن', { convertOk: r.ok, invariants: r.invariants.results.filter((x) => x.ok).length, cues: r.cues.length, exportFiles: ex.files.length, lenientCount: lenient.value ?? lenient.threw });
}
