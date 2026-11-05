// TJ-26 (PIPE-04) ← U38 (CLA-L-9) + جديد: سياج أو عنوان Markdown ملاصق لنص مقطع.
import { mod, out, fixture } from './lib.mjs';
const { parseSrtLenient } = await mod('core/srt/lenient.js');
const P = (s) => { try { const r = parseSrtLenient(s); return { ok: true, texts: r.cues.map((c) => c.text), notes: r.notes }; } catch (e) { return { err: e.code, line: e.params?.line }; } };
const h = (n, a, b) => `${n}\n00:00:0${a},000 --> 00:00:0${b},000`;
const F = '```';
for (const [label, s] of [
  ['أ. كتلتان متلاصقتان (سياج إغلاق ثم فتح) بلا سطر فارغ', `${F}srt\n${h(1, 1, 2)}\nأ\n${F}\n${F}srt\n${h(2, 3, 4)}\nب\n${F}\n`],
  ['ب. سياج إغلاق وحده بعد مقطع وسطي بلا سطر فارغ', `${h(1, 1, 2)}\nأ\n${F}\n${h(2, 3, 4)}\nب\n`],
  ['ج. عنوان بين مقطعين بلا سطر فارغ', `${h(1, 1, 2)}\nأ\n## الجزء الثاني\n${h(2, 3, 4)}\nب\n`],
  ['ج٢. العنوان نفسه بسطر فارغ قبله وبعده', `${h(1, 1, 2)}\nأ\n\n## الجزء الثاني\n\n${h(2, 3, 4)}\nب\n`],
  ['د. عنوان بعد آخر مقطع بلا سطر فارغ', `${h(1, 1, 2)}\nأ\n\n${h(2, 3, 4)}\nب\n## ملاحظات\n\n- شرح\n`],
  ['هـ. عنوان قبل أول رقم بلا سطر فارغ', `## الترجمة\n${h(1, 1, 2)}\nأ\n\n${h(2, 3, 4)}\nب\n`],
  ['و. سطر نص يبدأ بـ# بلا مسافة (وسم)', `${h(1, 1, 2)}\n#ترجمان رائع\n\n${h(2, 3, 4)}\nب\n`],
]) out(label, P(s));
out('عيّنة heading-between.ar.md', P(fixture('v2/heading-between.ar.md')));
out('عيّنة wrapped.ar.md', P(fixture('v2/wrapped.ar.md')));
