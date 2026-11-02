#!/usr/bin/env node
// قياس أداء المحاذاة (خطة اختبار P11: «قياس أداء المحاذاة على ملف طويل»). مسارات من مولّد العيّنات الحتمي بأطوال متزايدة،
// والملف العربي بدمج وشطر وإزاحة بمقطع بينهما (أصعب حالة)، ثم المقارن كاملًا (المحاذاة داخله) والدمج الثلاثي. يطبع جدول Markdown.
//   command node docs/evidence/P11/bench-align.mjs
import { alignCues, mergeThreeWay } from '../../../src/core/align/index.js';
import { compare } from '../../../src/core/compare/index.js';
import { englishTrack, fingerprint } from '../../../test/helpers/fixtures.js';
import { arabicTwin, longTrack, mergeSplitShift } from '../../../test/fixtures/v2/index.js';

const time = (fn) => {
  fn();
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    fn();
    runs.push(performance.now() - t0);
  }
  return Math.round(runs.sort((a, b) => a - b)[1]);
};

const out = ['| المقاطع | alignCues (دمج وشطر وإزاحة) | compare على ترجمة سليمة (بالمحاذاة) | mergeThreeWay (تعديلات متفرقة) |', '| --- | --- | --- | --- |'];
for (const count of [2000, 10000, 50000]) {
  const en = longTrack(count, { seed: 7 });
  const ar = arabicTwin(en);
  const { cues } = mergeSplitShift(ar, { mergeIndex: Math.floor(count / 5), splitIndex: Math.floor((count * 4) / 5) });
  const fp = fingerprint({ track: englishTrack({ cues: en }) });
  const mine = ar.map((c, i) => (i % 97 === 0 ? { ...c, text: `${c.text} م` } : c));
  const theirs = ar.map((c, i) => (i % 89 === 0 ? { ...c, text: `${c.text} ج` } : c));
  const a = time(() => alignCues(en, cues));
  const c = time(() => compare(ar, fp));
  const m = time(() => mergeThreeWay({ base: ar, mine, theirs }));
  out.push(`| ${count.toLocaleString('en')} | ${a}ms | ${c}ms | ${m}ms |`);
}
out.push('', `Node ${process.version} · ${process.platform}/${process.arch} · الوسيط من ثلاث مرات بعد إحماء`);
process.stdout.write(`${out.join('\n')}\n`);
