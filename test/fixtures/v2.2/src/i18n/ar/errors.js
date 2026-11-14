// رسائل الأخطاء العربية: مصدرها ملفات المجالات في src/core/errors (بادئات محجوزة لكل مجال)، ومفتاحها رمز الخطأ الثابت.
import { MESSAGES as base } from '../../core/errors/base.js';
import { MESSAGES as extract } from '../../core/errors/extract.js';
import { MESSAGES as importDomain } from '../../core/errors/import.js';
import { MESSAGES as overlay } from '../../core/errors/overlay.js';
import { MESSAGES as controls } from '../../core/errors/controls.js';
import { MESSAGES as pages } from '../../core/errors/pages.js';
import { MESSAGES as editor } from '../../core/errors/editor.js';
import { MESSAGES as backup } from '../../core/errors/backup.js';

export default Object.freeze({ ...base, ...extract, ...importDomain, ...overlay, ...controls, ...pages, ...editor, ...backup });
