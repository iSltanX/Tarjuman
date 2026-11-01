// واجهة المقارنة والاستعادة (عقد interfaces §٦). منطق نقي: لا تخزين ولا واجهة ولا تعديل صامت.
export { DEFAULT_DRIFT_MS, compare } from './compare.js';
export { applyRestoreTiming, canRestore, previewRestoreTiming } from './restore.js';
