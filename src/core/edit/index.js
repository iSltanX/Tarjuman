// منطق المحرّر النقي (تملكه P8): حقول الزمن، ولوحة المشكلات، وجلسة التحرير بالتراجع والإعادة، وما يُصدَّر،
// والمرجع الإنجليزي، وانتقال الحفظ. لا DOM ولا تخزين هنا؛ الصفحة src/pages/editor تستهلكه.
export { parseSeconds, parseTimecode } from './timecode.js';
export { DENSITY_CODES, ISSUE_LIMITS, findIssues } from './issues.js';
export { STRUCTURAL_KINDS, createEditSession, resolveScope } from './session.js';
export { planArabicExport } from './export.js';
export { buildRows, englishReference, pickEnglishTrack } from './reference.js';
export { editTransition, slotEditTransition } from './transition.js';
// محرّكات P11 تُستورد من ملفاتها (عقد interfaces §١٦)؛ والبحث يُعاد تصديره هنا لراحة الصفحة وحدها.
export { planReplace, searchCues } from './search.js';
