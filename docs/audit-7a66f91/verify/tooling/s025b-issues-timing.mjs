// يعيد خطوات test/unit/edit/issues.test.js:69-76 (findIssues على 50,000 مقطع، العتبة 200ms) ويطبع الزمن. قراءة فقط.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TJ_ROOT } from '../_root.mjs';
const root = process.argv[2] ?? TJ_ROOT;
const { findIssues } = await import(pathToFileURL(path.join(root, 'src/core/edit/index.js')));
const { makeCues } = await import(pathToFileURL(path.join(root, 'test/helpers/fixtures.js')));
const cues = makeCues(50000);
const t = performance.now();
const r = findIssues(cues);
console.log(JSON.stringify({ ms: +(performance.now() - t).toFixed(1), issues: r.list.length }));
