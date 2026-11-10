#!/usr/bin/env node
// معايرة عتبة كثافة القراءة على الترجمتين العربيتين الحقيقيتين (test/e2e/fixtures). يطبع جدول Markdown بتوزيع
// سرعة القراءة وطول السطر ونسبة التنبيه لكل عتبة مرشحة، وهو المنسوخ في docs/reading-calibration.md.
//   command node tools/calibrate-reading.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readingMetrics } from '../src/core/edit/density.js';
import { parseSrtLenient } from '../src/core/srt/lenient.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAMPLES = [
  ['TED يدوي، عادي', 'iG9CE55wbtY.en.manual.normal.ar.srt'],
  ['ميدواي تلقائي، «مقاطع أطول»', 'Y9rkKtK1b44.en.asr.long.ar.srt'],
];
const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
const rate = (xs, limit) => `${((100 * xs.filter((x) => x > limit).length) / xs.length).toFixed(1)}%`;

const rows = [];
const all = { cps: [], line: [] };
for (const [label, file] of SAMPLES) {
  const cues = parseSrtLenient(readFileSync(path.join(ROOT, 'test/e2e/fixtures', file), 'utf8')).cues;
  const m = cues.map(readingMetrics);
  const cps = m.map((x) => x.cps).filter(Number.isFinite).sort((a, b) => a - b);
  const line = m.map((x) => x.longestLine).sort((a, b) => a - b);
  all.cps.push(...cps);
  all.line.push(...line);
  rows.push({ label, count: cues.length, cps, line });
}
all.cps.sort((a, b) => a - b);
all.line.sort((a, b) => a - b);
rows.push({ label: 'الاثنتان معًا', count: all.cps.length, cps: all.cps, line: all.line });

const out = [];
out.push('| العيّنة | المقاطع | سرعة القراءة: الوسيط · م90 · م95 · م99 · الأقصى (محرف/ث) | أطول سطر: الوسيط · م90 · م95 · م99 · الأقصى (محرف) |');
out.push('| --- | --- | --- | --- |');
for (const r of rows) {
  const c = [50, 90, 95, 99].map((p) => pct(r.cps, p)).concat(r.cps.at(-1)).join(' · ');
  const l = [50, 90, 95, 99].map((p) => pct(r.line, p)).concat(r.line.at(-1)).join(' · ');
  out.push(`| ${r.label} | ${r.count} | ${c} | ${l} |`);
}
out.push('');
out.push('| العتبة المرشحة | نسبة التنبيه (الاثنتان معًا) |');
out.push('| --- | --- |');
for (const t of [15, 17, 20, 25]) out.push(`| سرعة > ${t} محرف/ث | ${rate(all.cps, t)} |`);
for (const t of [37, 42, 50, 84]) out.push(`| سطر > ${t} محرفًا | ${rate(all.line, t)} |`);
// ح7: ترجمة مسار تلقائي بوضع «عادي» (سطر واحد لكل مقطع، لا يلفّه النموذج): هنا يظهر أثر حد السطر.
const asrNormal = parseSrtLenient(readFileSync(path.join(ROOT, 'test/e2e/fixtures/Y9rkKtK1b44.en.asr.normal.ar.srt'), 'utf8')).cues.map(readingMetrics).map((x) => x.longestLine).sort((a, b) => a - b);
out.push('');
out.push('| ميدواي تلقائي، «عادي» (سطر لكل مقطع) | المقاطع | أطول سطر: الوسيط · م90 · م95 · م99 · الأقصى | سطر > 42 | سطر > 84 |');
out.push('| --- | --- | --- | --- | --- |');
out.push(`| ترجمة نموذج | ${asrNormal.length} | ${[50, 90, 95, 99].map((q) => pct(asrNormal, q)).concat(asrNormal.at(-1)).join(' · ')} | ${asrNormal.filter((x) => x > 42).length} (${rate(asrNormal, 42)}) | ${asrNormal.filter((x) => x > 84).length} (${rate(asrNormal, 84)}) |`);
process.stdout.write(`${out.join('\n')}\n`);
