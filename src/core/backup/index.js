// النسخة الاحتياطية والاستعادة (R45، عقد docs/contracts/backup.md): الإنشاء، والقراءة بالتحقق الكامل، وخطة الاستعادة
// وتنفيذها بالتقدم والفشل الجزئي، فوق واجهة كتابة الاستعادة في التخزين (restoreVideo). لا DOM هنا: الصفحات تعرض وتختار.
export {
  BACKUP_FORMAT, BACKUP_LIMITS, BACKUP_VERSION, HASH_ALGORITHM, backupFileName, countData, entryCounts, sha256Hex,
} from './format.js';
export { createBackup, yieldToPage } from './create.js';
export { readBackup } from './read.js';
export {
  mergeReports, planRestore, reportCode, restoreDiagnostics, restoreItems, retryItems, retrySettings, runRestore, settingsFailureCode,
} from './restore.js';
