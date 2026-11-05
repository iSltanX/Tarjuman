// FINDINGS «ثانيًا» (س١٢): «i» و«İstanbul»، و(س٧): انجراف شديد يصفّر مدة مقطع دون تنبيه في المعاينة.
import { ROOT, log } from './harness.mjs';

const { searchCues } = await import(`${ROOT}/src/core/edit/search.js`);
const { driftCorrect } = await import(`${ROOT}/src/core/edit/drift.js`);
const { findIssues } = await import(`${ROOT}/src/core/edit/issues.js`);
const c = [{ n: 1, startMs: 0, endMs: 1000, text: 'İstanbul' }];
log('[س١٢] «i» في «İstanbul»:', searchCues(c, 'i').length, '| مع تجاهل التشكيل:', searchCues(c, 'i', { ignoreMarks: true }).length, '| «istanbul»:', searchCues(c, 'istanbul').length);
const cues = [{ n: 1, startMs: 0, endMs: 400, text: 'أ' }, { n: 2, startMs: 1000, endMs: 1400, text: 'ب' }, { n: 3, startMs: 1000000, endMs: 1000400, text: 'ج' }];
const r = driftCorrect(cues, { a: { n: 1, toMs: 0 }, b: { n: 3, toMs: 1000 } });
log('[س٧] انجراف بمقياس 0.001: ok =', r.ok, '| المقاطع =', JSON.stringify(r.cues?.map((x) => [x.startMs, x.endMs])), '| أخطاء بعده =', findIssues(r.cues).errors);
