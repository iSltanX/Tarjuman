// TJ-27 (PIPE-05): فقرة ثانية بعد سطر فارغ في آخر مقطع مقابل الحالة نفسها في مقطع وسطي؛ وأين تظهر الملاحظة.
import { mod, out, fileOf } from './lib.mjs';
const { parseSrtLenient } = await mod('core/srt/lenient.js');
const { readImport } = await mod('core/import/index.js');
const P = (s) => { try { const r = parseSrtLenient(s); return { ok: true, texts: r.cues.map((c) => c.text), notes: r.notes }; } catch (e) { return { err: e.code, line: e.params?.line }; } };
const h = (n, a, b) => `${n}\n00:00:0${a},000 --> 00:00:0${b},000`;
out('آخر مقطع بفقرتين', P(`${h(1, 1, 2)}\nأ\n\n${h(2, 3, 4)}\nسطر أول\n\nسطر ثانٍ من النص نفسه\n`));
out('مقطع وسطي بفقرتين', P(`${h(1, 1, 2)}\nسطر أول\n\nسطر ثانٍ من النص نفسه\n\n${h(2, 3, 4)}\nب\n`));
out('آخر مقطع ثم ملاحظة مواضع غامضة (الحالة المقصودة GM-012)', P(`${h(1, 1, 2)}\nأ\n\n${h(2, 3, 4)}\nب\n\nالمقطع 2 غامض\n`));
const r = await readImport(fileOf(`${h(1, 1, 2)}\nأ\n\n${h(2, 3, 4)}\nسطر أول\n\nسطر ثانٍ من النص نفسه\n`));
out('readImport: النص المحفوظ والملاحظات والمقارنة', { texts: r.cues.map((c) => c.text), notes: r.notes, compareEmpty: r.comparison.empty });
