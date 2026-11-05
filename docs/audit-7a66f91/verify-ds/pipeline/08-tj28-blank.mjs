// TJ-28 (PIPE-06): تعريفان للمقطع الفارغ. نص من محارف تنسيق خفية فقط: من الاستيراد إلى المقارنة ولوحة المشكلات والتصدير.
import { mod, out, fileOf } from './lib.mjs';
const { readImport } = await mod('core/import/index.js');
const { findIssues } = await mod('core/edit/issues.js');
const { planArabicExport } = await mod('core/edit/export.js');
const { isBlankText } = await mod('core/compare/index.js');
const VID = 'iG9CE55wbtY';
const h = (n, a, b) => `${n}\n00:00:0${a},000 --> 00:00:0${b},000`;
const cp = (s) => [...s].map((c) => `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join(' ');
for (const inv of ['​', '‏', '‏⁠', '⁠', '﻿', '‫', ' ']) {
  const srt = `${h(1, 1, 2)}\n${inv}\n\n${h(2, 3, 4)}\nب\n`;
  const r = await readImport(fileOf(srt));
  if (!r.ok) { out(cp(inv), r.error); continue; }
  const cues = r.cues;
  const issues = findIssues(cues).list.map((i) => i.code);
  const plan = planArabicExport({ videoId: VID, cues, offsetMs: 0 });
  out(cp(inv), { importedText: cp(cues[0].text) || '(فارغ)', compareEmpty: r.comparison.empty, isBlankText: isBlankText(cues[0].text), issues, export: plan.ok ? `ok (${plan.text.split('\n')[2] === cues[0].text ? 'كُتب المحرف الخفي سطرَ نص' : '?'})` : plan.code });
}
