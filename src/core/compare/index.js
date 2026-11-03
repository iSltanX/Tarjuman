// واجهة المقارنة والاستعادة (عقد interfaces §٦). منطق نقي: لا تخزين ولا واجهة ولا تعديل صامت.
export { DEFAULT_DRIFT_MS, compare, isBlankText, lacksArabic } from './compare.js';
export { RANK_WEIGHTS, rankReferences } from './rank.js';
export { currentComparison, fingerprintCoverage, trackComparison } from './current.js';
export {
  alignToFingerprint, applyRestoreTiming, canRestore, previewRestoreTiming, sameStructure,
} from './restore.js';
