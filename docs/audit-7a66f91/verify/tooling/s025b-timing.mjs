// يعيد خطوات اختبار «الأداء» في test/unit/edit/session.test.js:239-252 حرفيًا ويطبع الزمنين. قراءة فقط.
// الاستعمال: command node s025b-timing.mjs <جذر النسخة>
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.argv[2];
const { createEditSession } = await import(pathToFileURL(path.join(root, 'src/core/edit/index.js')));
const { makeCues } = await import(pathToFileURL(path.join(root, 'test/helpers/fixtures.js')));
const s = createEditSession({ cues: makeCues(50000) });
let t = performance.now();
s.shift({ kind: 'all' }, 100);
s.undo();
s.redo();
const shiftMs = performance.now() - t;
t = performance.now();
for (let i = 0; i < 200; i++) s.setText(i, `نص ${i}`);
const textMs = performance.now() - t;
console.log(JSON.stringify({ shiftMs: +shiftMs.toFixed(1), textMs: +textMs.toFixed(2), changed: s.changedCount }));
